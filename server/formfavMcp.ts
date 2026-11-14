import type {
  FormFavMcpStatus,
  FormFavMcpToolSummary,
  FormFavMeeting,
  FormFavRaceFormResponse,
} from '../src/types/engine.ts';

const FORMFAV_MCP_URL = 'https://api.formfav.com/mcp';

interface JsonRpcResponse<T = unknown> {
  jsonrpc: string;
  id: number | string | null;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

function parseMcpResponseBody<T>(rawText: string): JsonRpcResponse<T> {
  const trimmed = rawText.trim();
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed) as JsonRpcResponse<T>;
  }
  // Parse StreamableHTTP SSE lines (`data: {...}`)
  const dataLines = trimmed
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);

  if (dataLines.length === 0) {
    throw new Error('Unexpected empty response from FormFav MCP server.');
  }
  return JSON.parse(dataLines[dataLines.length - 1]) as JsonRpcResponse<T>;
}

async function sendMcpRpc<T>(
  method: string,
  params: Record<string, unknown>,
  id: number
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };

  const apiKey = process.env.FORMFAV_API_KEY?.trim();
  if (apiKey && apiKey !== 'MY_FORMFAV_API_KEY') {
    headers['X-API-Key'] = apiKey;
  }

  const response = await fetch(FORMFAV_MCP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `FormFav MCP HTTP ${response.status}: ${response.statusText}`
    );
  }

  const rawText = await response.text();
  const rpc = parseMcpResponseBody<T>(rawText);
  if (rpc.error) {
    throw new Error(`MCP RPC Error (${rpc.error.code}): ${rpc.error.message}`);
  }
  if (rpc.result === undefined) {
    throw new Error('FormFav MCP returned no result payload.');
  }
  return rpc.result;
}

export function hasConfiguredFormFavKey(): boolean {
  const key = process.env.FORMFAV_API_KEY?.trim();
  return Boolean(key && key !== 'MY_FORMFAV_API_KEY');
}

export async function probeFormFavMcp(): Promise<FormFavMcpStatus> {
  try {
    const initResult = await sendMcpRpc<{
      serverInfo?: { name?: string; version?: string };
      instructions?: string;
    }>(
      'initialize',
      {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'a2a-content-engine', version: '1.0.0' },
      },
      1
    );

    const toolsResult = await sendMcpRpc<{
      tools?: Array<{
        name: string;
        description?: string;
        annotations?: { title?: string };
        inputSchema?: { required?: string[] };
      }>;
    }>('tools/list', {}, 2);

    const tools: FormFavMcpToolSummary[] = (toolsResult.tools ?? []).map(
      (t) => ({
        name: t.name,
        title: t.annotations?.title || t.name,
        description: (t.description || '').split('\n')[0].trim(),
        required: t.inputSchema?.required ?? [],
      })
    );

    return {
      endpoint: FORMFAV_MCP_URL,
      connected: true,
      serverName: initResult.serverInfo?.name || 'formfav',
      serverVersion: initResult.serverInfo?.version || 'unknown',
      instructions: initResult.instructions || '',
      hasApiKey: hasConfiguredFormFavKey(),
      tools,
    };
  } catch (error) {
    return {
      endpoint: FORMFAV_MCP_URL,
      connected: false,
      serverName: 'formfav',
      serverVersion: 'unavailable',
      instructions: '',
      hasApiKey: hasConfiguredFormFavKey(),
      tools: [],
      error:
        error instanceof Error
          ? error.message
          : 'Unable to reach FormFav MCP server.',
    };
  }
}

export class FormFavAuthError extends Error {
  readonly code = 'FORMFAV_API_KEY_REQUIRED';
  constructor(message: string) {
    super(message);
  }
}

export async function callFormFavTool<T = unknown>(
  name: string,
  args: Record<string, unknown>
): Promise<T> {
  const result = await sendMcpRpc<{
    content?: Array<{ type: string; text?: string }>;
    structuredContent?: { result?: T };
    isError?: boolean;
  }>(
    'tools/call',
    {
      name,
      arguments: args,
    },
    Date.now()
  );

  let payload: unknown = result.structuredContent?.result;
  if (payload === undefined && result.content?.[0]?.text) {
    const text = result.content[0].text;
    try {
      payload = JSON.parse(text);
    } catch {
      if (result.isError) {
        throw new Error(text);
      }
      return text as unknown as T;
    }
  }

  if (
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    typeof (payload as { error?: unknown }).error === 'string'
  ) {
    const errText = (payload as { error: string }).error;
    if (
      errText.toLowerCase().includes('api key') ||
      errText.toLowerCase().includes('unauthorized')
    ) {
      throw new FormFavAuthError(
        'FORMFAV_API_KEY is missing or invalid. Add a free FormFav API key in Settings > Secrets (https://formfav.com/get-api-key?cta=mcp).'
      );
    }
    throw new Error(errText);
  }

  if (result.isError) {
    throw new Error(
      result.content?.[0]?.text || `FormFav MCP tool ${name} failed.`
    );
  }

  return payload as T;
}

export async function getAusGallopsMeetings(date: string): Promise<{
  date: string;
  meetings: FormFavMeeting[];
  totalMeetingsAllCountries: number;
}> {
  const raw = await callFormFavTool<{
    date?: string;
    raceType?: string;
    meetings?: FormFavMeeting[];
  }>('get_meetings', {
    date,
    race_code: 'gallops',
    timezone: 'Australia/Sydney',
  });

  const allMeetings = Array.isArray(raw?.meetings) ? raw.meetings : [];
  const ausMeetings = allMeetings.filter(
    (m) => (m.country || '').toLowerCase() === 'au'
  );

  return {
    date: raw?.date || date,
    meetings: ausMeetings,
    totalMeetingsAllCountries: allMeetings.length,
  };
}

export async function getAusGallopsRaceCard(params: {
  date: string;
  track: string;
  race: number;
}): Promise<FormFavRaceFormResponse> {
  return await callFormFavTool<FormFavRaceFormResponse>('get_race_card', {
    date: params.date,
    track: params.track,
    race: params.race,
    race_code: 'gallops',
    country: 'au',
    timezone: 'Australia/Sydney',
  });
}

export async function searchAusGallopsRunner(query: string): Promise<unknown> {
  return await callFormFavTool('search_runner', {
    query,
    race_code: 'gallops',
    country: 'au',
  });
}

export async function getFormFavRunnerProfile(
  runnerId: string
): Promise<unknown> {
  return await callFormFavTool('get_runner_profile', {
    runner_id: runnerId,
  });
}

export async function getAusTrackBias(params: {
  track: string;
  condition?: string;
  distance?: string;
}): Promise<unknown> {
  return await callFormFavTool('get_track_bias', {
    track: params.track,
    race_code: 'gallops',
    country: 'au',
    ...(params.condition ? { condition: params.condition } : {}),
    ...(params.distance ? { distance: params.distance } : {}),
  });
}

export async function getAusGallopsPredictions(params: {
  date: string;
  track: string;
  race: number;
}): Promise<unknown> {
  return await callFormFavTool('get_predictions', {
    date: params.date,
    track: params.track,
    race: params.race,
    race_code: 'gallops',
    country: 'au',
    timezone: 'Australia/Sydney',
  });
}

export async function getAusGallopsPrices(params: {
  date: string;
  track: string;
  race: number;
}): Promise<unknown> {
  return await callFormFavTool('get_prices', {
    date: params.date,
    track: params.track,
    race: params.race,
    race_code: 'gallops',
    country: 'au',
    timezone: 'Australia/Sydney',
  });
}

export async function getAusGallopsActionableFeed(date: string): Promise<{
  date: string;
  meetings: FormFavMeeting[];
  featuredCard: FormFavRaceFormResponse | null;
}> {
  const { date: resolvedDate, meetings } = await getAusGallopsMeetings(date);
  let featuredCard: FormFavRaceFormResponse | null = null;

  const activeMeeting = meetings.find(
    (m) => !m.abandoned && m.races.some((r) => !r.abandoned)
  );
  if (activeMeeting) {
    const firstRace = activeMeeting.races.find((r) => !r.abandoned);
    if (firstRace) {
      try {
        featuredCard = await getAusGallopsRaceCard({
          date: resolvedDate,
          track: activeMeeting.slug || activeMeeting.track,
          race: firstRace.raceNumber,
        });
      } catch {
        featuredCard = null;
      }
    }
  }

  return {
    date: resolvedDate,
    meetings,
    featuredCard,
  };
}

export async function getAllRunnerCardsForMeet(params: {
  date: string;
  track: string;
  raceNumbers?: number[];
}): Promise<{
  date: string;
  track: string;
  slug: string;
  racesCount: number;
  totalRunners: number;
  raceCards: FormFavRaceFormResponse[];
  runnerCards: Array<{
    raceNumber: number;
    raceName: string | null;
    distance: string | null;
    condition: string | null;
    runner: FormFavRaceFormResponse['runners'][number];
  }>;
}> {
  let targetSlug = params.track;
  let targetTrackName = params.track;
  let raceNums = Array.isArray(params.raceNumbers)
    ? params.raceNumbers.filter((n) => Number.isFinite(n) && n > 0)
    : [];

  if (raceNums.length === 0) {
    const { meetings } = await getAusGallopsMeetings(params.date);
    const needle = params.track.trim().toLowerCase();
    const matched = meetings.find(
      (m) =>
        (m.slug || '').toLowerCase() === needle ||
        (m.track || '').toLowerCase() === needle
    );
    if (!matched) {
      throw new Error(
        `No Australian gallops meeting found for "${params.track}" on ${params.date}.`
      );
    }
    targetSlug = matched.slug || matched.track;
    targetTrackName = matched.track;
    raceNums = matched.races
      .filter((r) => !r.abandoned)
      .map((r) => r.raceNumber);
  }

  if (raceNums.length === 0) {
    return {
      date: params.date,
      track: targetTrackName,
      slug: targetSlug,
      racesCount: 0,
      totalRunners: 0,
      raceCards: [],
      runnerCards: [],
    };
  }

  // Fetch in batches of 3 to stay respectful of FormFav MCP rate limits
  const raceCards: FormFavRaceFormResponse[] = [];
  for (let i = 0; i < raceNums.length; i += 3) {
    const batch = raceNums.slice(i, i + 3);
    const results = await Promise.allSettled(
      batch.map((raceNum) =>
        getAusGallopsRaceCard({
          date: params.date,
          track: targetSlug,
          race: raceNum,
        })
      )
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        raceCards.push(r.value);
      }
    }
  }

  raceCards.sort((a, b) => a.raceNumber - b.raceNumber);

  const runnerCards: Array<{
    raceNumber: number;
    raceName: string | null;
    distance: string | null;
    condition: string | null;
    runner: FormFavRaceFormResponse['runners'][number];
  }> = [];

  for (const card of raceCards) {
    for (const runner of card.runners || []) {
      runnerCards.push({
        raceNumber: card.raceNumber,
        raceName: card.raceName,
        distance: card.distance,
        condition: card.condition,
        runner,
      });
    }
  }

  return {
    date: params.date,
    track: raceCards[0]?.track || targetTrackName,
    slug: targetSlug,
    racesCount: raceCards.length,
    totalRunners: runnerCards.length,
    raceCards,
    runnerCards,
  };
}

export async function getFormFavUsage(): Promise<unknown> {
  return await callFormFavTool('get_usage', {});
}

