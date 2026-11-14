import { GoogleGenAI, Type } from '@google/genai';
import type {
  ChatModelId,
  EdgeWebhookResponse,
  EngineMode,
  FirecrawlRacingIntel,
  FirecrawlRunnerMarketSpeedmap,
  FirecrawlSourceLink,
  OrchestratorOutput,
  RouterOutput,
  SearchGroundingResult,
  SearchGroundingSource,
  TrifectaPredictionResult,
  VideoAspectRatio,
  VideoGenerationResult,
} from '../src/types/engine.ts';

let cachedClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedClient;
}

function formatGeminiError(error: unknown, model: string): Error {
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();
  if (
    lower.includes('429') ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota')
  ) {
    return new Error(
      `Quota or billing limit reached for ${model}. If using a paid-tier model (gemini-4-carbon, gemini-4-argon, or gemini-omni-1.2-flash), select a billing-enabled API key in Settings > Secrets.`
    );
  }
  if (lower.includes('403') || lower.includes('permission_denied')) {
    return new Error(
      `Permission denied for ${model}. Please verify your GEMINI_API_KEY in Settings > Secrets (paid-tier models require a billing-enabled key).`
    );
  }
  if (lower.includes('404') || lower.includes('not_found')) {
    return new Error(`Model ${model} was not found or is unavailable for this key.`);
  }
  return error instanceof Error ? error : new Error(raw);
}

function extractGroundingSources(
  groundingChunks: unknown
): SearchGroundingSource[] {
  if (!Array.isArray(groundingChunks)) return [];
  const seen = new Set<string>();
  const sources: SearchGroundingSource[] = [];
  for (const chunk of groundingChunks) {
    const web = (chunk as { web?: { uri?: string; title?: string } })?.web;
    if (web?.uri && !seen.has(web.uri)) {
      seen.add(web.uri);
      sources.push({
        title: web.title || web.uri,
        uri: web.uri,
      });
    }
  }
  return sources;
}

export async function embedText(text: string): Promise<number[] | null> {
  try {
    const ai = getClient();
    const result = await ai.models.embedContent({
      model: 'gemini-embedding-2',
      contents: [text],
    });
    const values = result.embeddings?.[0]?.values;
    if (Array.isArray(values) && values.length > 0) {
      return values;
    }
    return null;
  } catch {
    return null;
  }
}

export async function runSearchGrounding(
  query: string
): Promise<SearchGroundingResult> {
  const ai = getClient();
  const model = 'gemini-4-hydrogen';
  try {
    const response = await ai.models.generateContent({
      model,
      contents: query,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const answer = (response.text ?? '').trim();
    const sources = extractGroundingSources(
      response.candidates?.[0]?.groundingMetadata?.groundingChunks
    );

    return {
      answer: answer || 'No grounded summary returned.',
      sources,
      model_used: model,
    };
  } catch (error) {
    throw formatGeminiError(error, model);
  }
}

export async function runChatTurn(params: {
  model: ChatModelId;
  systemInstruction: string;
  history: Array<{ role: 'user' | 'model'; text: string }>;
  message: string;
  useGoogleSearch?: boolean;
}): Promise<{ reply: string; sources: SearchGroundingSource[] }> {
  const ai = getClient();
  try {
    const formattedHistory = params.history.map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    }));

    const chat = ai.chats.create({
      model: params.model,
      history: formattedHistory,
      config: {
        systemInstruction:
          params.systemInstruction.trim() ||
          'You are a concise, technically accurate assistant for the A2A Content & Data Engine.',
        ...(params.useGoogleSearch ? { tools: [{ googleSearch: {} }] } : {}),
      },
    });

    const response = await chat.sendMessage({ message: params.message });
    const reply = (response.text ?? '').trim();
    const sources = extractGroundingSources(
      response.candidates?.[0]?.groundingMetadata?.groundingChunks
    );

    return {
      reply: reply || 'No response text generated.',
      sources,
    };
  } catch (error) {
    throw formatGeminiError(error, params.model);
  }
}

export async function generateVideoFromText(params: {
  prompt: string;
  aspectRatio: VideoAspectRatio;
  duration?: string;
}): Promise<VideoGenerationResult> {
  const ai = getClient();
  const model = 'gemini-omni-1.2-flash';
  const duration = params.duration || '8s';

  try {
    const interaction = await ai.interactions.create(
      {
        model,
        input: params.prompt,
        background: false,
        store: false,
        stream: false,
        response_format: {
          type: 'video',
          aspect_ratio: params.aspectRatio,
          duration,
          resolution: '720p',
        },
      },
      { timeout: 300000 }
    );

    const videoPart = interaction.output_video;
    if (!videoPart) {
      throw new Error('No video output was returned by gemini-omni-1.2-flash.');
    }

    const mimeType = videoPart.mime_type || 'video/mp4';
    let videoDataUrl = '';

    if (videoPart.data) {
      videoDataUrl = `data:${mimeType};base64,${videoPart.data}`;
    } else if (videoPart.uri) {
      videoDataUrl = videoPart.uri;
    } else {
      throw new Error('Video output missing both inline data and URI.');
    }

    return {
      video_data_url: videoDataUrl,
      mime_type: mimeType,
      aspect_ratio: params.aspectRatio,
      duration,
      model_used: model,
      interaction_id: interaction.id,
    };
  } catch (error) {
    throw formatGeminiError(error, model);
  }
}

export async function runOrchestrator(params: {
  mode: EngineMode;
  doltBranchRef: string;
  rawData: unknown;
  ragContext: string;
}): Promise<OrchestratorOutput> {
  const ai = getClient();

  const systemInstruction = `You are the Aus Gallops Racing Tips Orchestrator. Your job is to transform structured Australian Thoroughbred racing data (FormFav MCP race cards, Dolt SQL historical win-rate splits, Firecrawl betting markets & speedmaps) and retrieved Track Bias RAG context into publish-ready racing tip assets and A2A task payloads.

STRICT OPERATING RULES (MODE_RACING):
- Focus strictly on Australian Thoroughbred Gallops (Aus Gallops).
- Analyze FormFav race data and betting odds against historical Dolt performance metrics and track/barrier bias splits.
- Output a punchy race preview, top 4 selections (explicitly note N/A for missing slots if fewer than 4 active runners are provided—NEVER invent runners), and a value trifecta box.
- Ground every claim, statistic, and odds calculation strictly in the provided JSON data and RAG context. Do not invent form data, barriers, or odds.
- Keep prose crisp, scannable, and free of fluff.
- Set "mode" to "RACING", "next_a2a_agent" to "OPS_PUBLISHER", and "dolt_branch_ref" exactly to the provided branch reference.`;

  const prompt = `Operating Mode: MODE_${params.mode}
Dolt Reference: ${params.doltBranchRef}
Structured Raw Data:
${JSON.stringify(params.rawData, null, 2)}

Retrieved RAG Context:
${params.ragContext}`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          mode: { type: Type.STRING, description: 'RACING or PUBLISHING' },
          dolt_branch_ref: { type: Type.STRING },
          seo_target_keyword: { type: Type.STRING },
          markdown_content: { type: Type.STRING },
          nanobanana_prompt: { type: Type.STRING },
          slides_summary_bullets: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          gmail_subject_line: { type: Type.STRING },
          next_a2a_agent: { type: Type.STRING },
        },
        required: [
          'mode',
          'dolt_branch_ref',
          'seo_target_keyword',
          'markdown_content',
          'nanobanana_prompt',
          'slides_summary_bullets',
          'gmail_subject_line',
          'next_a2a_agent',
        ],
      },
    },
  });

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new Error('Gemini returned an empty orchestrator response.');
  }

  const parsed = JSON.parse(rawText) as OrchestratorOutput;
  return {
    ...parsed,
    mode: params.mode,
    dolt_branch_ref: params.doltBranchRef,
    next_a2a_agent: parsed.next_a2a_agent || 'OPS_PUBLISHER',
  };
}

export async function routeA2ARequest(params: {
  userPrompt: string;
  availableContextSummary: string;
  currentDateIso: string;
}): Promise<RouterOutput> {
  const ai = getClient();

  const systemInstruction = `You are the Central Router for an Australian Thoroughbred (Aus Gallops) Horse Racing Tips Engine. Analyze the user's natural-language racing request and convert it into a structured A2A task dispatch DAG across worker pods.

AVAILABLE WORKER PODS:
- INTEL_SEO: FormFav MCP Aus Gallops queries (formfav.get_meetings, formfav.get_race_card, formfav.get_all_runner_cards, formfav.search_runner, formfav.get_track_bias), Firecrawl betting market odds & speedmap extraction (firecrawl.market_speedmap, firecrawl.scrape), Dolt SQL racing queries (dolt.sql_query), Track Bias RAG searches (rag.vector_search), and Trifecta prediction synthesis (racing.trifecta).
- MEDIA_DESIGN: Form guide cover art and speedmap/trifecta infographic generation (nanobanana.generate).
- EXEC_ADMIN: Google Workspace actions such as Google Tasks (google_tasks.create), Gmail tips drafts (gmail.create_draft), Google Slides race day decks (slides.create_deck).
- DEV_INFRA: Dolt racing-daily commits (dolt.commit), Gemini embedding indexing (gemini.embed_track_bias), Cloudflare AI Gateway & Worker operations (cloudflare.configure_gateway_worker).

RULES:
1. Current local date is ${params.currentDateIso}. Resolve relative dates like "tomorrow" or "Saturday" cleanly to ISO YYYY-MM-DD dates.
2. If critical parameters or intent are missing/ambiguous, set status to "NEEDS_CLARIFICATION", write one concise "clarification_question", and leave "a2a_tasks" empty.
3. Otherwise set status to "READY_TO_DISPATCH", set "clarification_question" to null, and emit sequential steps with accurate "depends_on_step" links.
4. For each task's "parameters_json", provide a valid JSON-serialized object string containing concrete Australian Gallops parameters grounded in the prompt and workspace context.`;

  const prompt = `Workspace Snapshot:
${params.availableContextSummary}

User Request:
${params.userPrompt}`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          intent_summary: { type: Type.STRING },
          status: {
            type: Type.STRING,
            description: 'READY_TO_DISPATCH or NEEDS_CLARIFICATION',
          },
          clarification_question: { type: Type.STRING, nullable: true },
          a2a_tasks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                step: { type: Type.INTEGER },
                target_pod: { type: Type.STRING },
                tool_action: { type: Type.STRING },
                parameters_json: {
                  type: Type.STRING,
                  description: 'Valid JSON object string for tool parameters',
                },
                depends_on_step: { type: Type.INTEGER, nullable: true },
              },
              required: [
                'step',
                'target_pod',
                'tool_action',
                'parameters_json',
                'depends_on_step',
              ],
            },
          },
        },
        required: [
          'intent_summary',
          'status',
          'clarification_question',
          'a2a_tasks',
        ],
      },
    },
  });

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new Error('Gemini returned an empty router response.');
  }

  const raw = JSON.parse(rawText) as {
    intent_summary: string;
    status: 'READY_TO_DISPATCH' | 'NEEDS_CLARIFICATION';
    clarification_question: string | null;
    a2a_tasks: Array<{
      step: number;
      target_pod: 'INTEL_SEO' | 'MEDIA_DESIGN' | 'EXEC_ADMIN' | 'DEV_INFRA';
      tool_action: string;
      parameters_json: string;
      depends_on_step: number | null;
    }>;
  };

  return {
    intent_summary: raw.intent_summary,
    status:
      raw.status === 'NEEDS_CLARIFICATION'
        ? 'NEEDS_CLARIFICATION'
        : 'READY_TO_DISPATCH',
    clarification_question: raw.clarification_question ?? null,
    a2a_tasks: (raw.a2a_tasks ?? []).map((t) => {
      let parsedParams: Record<string, unknown> = {};
      try {
        parsedParams = JSON.parse(t.parameters_json || '{}');
      } catch {
        parsedParams = { raw: t.parameters_json };
      }
      return {
        step: t.step,
        target_pod: t.target_pod,
        tool_action: t.tool_action,
        parameters: parsedParams,
        depends_on_step: t.depends_on_step ?? null,
      };
    }),
  };
}

export async function runEdgeWebhook(params: {
  a2aPayload: unknown;
  commitRef: string;
  doltData: unknown;
  ragContext: string;
}): Promise<EdgeWebhookResponse> {
  const ai = getClient();
  const startedAt = Date.now();

  const prompt = `Dolt Commit: ${params.commitRef}
Dolt Record: ${JSON.stringify(params.doltData)}
RAG Context: ${params.ragContext}
Incoming A2A Webhook Payload: ${JSON.stringify(params.a2aPayload)}

Respond strictly with grounded JSON containing:
- commit_ref: exact Dolt commit ref
- headline: crisp 1-line outcome grounded in the data
- action_plan: array of 3-4 concise concrete next steps
- next_agent: downstream agent identifier (e.g. OPS_PUBLISHER or MEDIA_DESIGN)`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          commit_ref: { type: Type.STRING },
          headline: { type: Type.STRING },
          action_plan: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          next_agent: { type: Type.STRING },
        },
        required: ['commit_ref', 'headline', 'action_plan', 'next_agent'],
      },
    },
  });

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new Error('Edge responder returned an empty payload.');
  }

  const parsed = JSON.parse(rawText) as {
    commit_ref: string;
    headline: string;
    action_plan: string[];
    next_agent: string;
  };

  return {
    commit_ref: params.commitRef,
    headline: parsed.headline,
    action_plan: parsed.action_plan,
    next_agent: parsed.next_agent,
    latency_ms: Date.now() - startedAt,
    gateway_target:
      'https://gateway.ai.cloudflare.com/v1/{account_id}/a2a-core-gateway/google-ai-studio',
    model_used: 'gemini-3.1-flash-lite',
  };
}

export async function generateTrifectaPrediction(params: {
  source: 'formfav_mcp' | 'dolt_commit' | 'custom_input';
  raceInfo: {
    date: string;
    track: string;
    race_number: number;
    race_name?: string | null;
    distance: string;
    condition: string;
    race_class?: string | null;
    notes?: string;
  };
  runners: unknown[];
  trackBias?: unknown;
  firecrawlIntel?: FirecrawlRacingIntel | null;
  ragContext: string;
}): Promise<TrifectaPredictionResult> {
  const ai = getClient();

  const systemInstruction = `You are a Thoroughbred Racing Form Analyst specializing in Trifecta Predictions.
Your job is to evaluate the provided race field, runner form/stats (overall, track, distance, track/distance, first-up, second-up, condition splits), barrier draw, jockey/trainer, track bias, Firecrawl betting market odds & speedmaps (if present), and RAG notes, and produce an actionable Trifecta Prediction with crisp, evidence-backed reasoning.

STRICT GROUNDING RULES:
- Use ONLY the runners, numbers, barriers, weights, odds, market trends, speedmap roles, form strings, and win/place percentages present in the input JSON and RAG context. Never invent runners, stats, or odds.
- Exclude scratched runners (scratched: true) from your selections and tickets; mention scratched runners briefly in risk_notes if applicable.
- Rank up to 4 top selections ("1st", "2nd", "3rd", "4th (Roving/Value)")—if fewer than 4 active runners exist, only rank the available active runners.
- Every runner's "reason" must cite concrete facts from the input (e.g., Track/Distance win %, barrier draw vs. track bias, Firecrawl betting market price/firming trend, speedmap settle position, recent form string, weight, or jockey/trainer).
- Provide 2 practical "recommended_tickets" (e.g., a 3- or 4-runner Boxed Trifecta and a Standout/Banker Trifecta) with clear "strategy_reason".
- Keep prose punchy, analytical, and free of hype.`;

  const compactRunners = params.runners.map((r) => {
    if (!r || typeof r !== 'object') return r;
    const obj = r as Record<string, unknown>;
    if ('stats' in obj || 'last20Starts' in obj) {
      return {
        number: obj.number ?? obj.no,
        name: obj.name,
        barrier: obj.barrier,
        weight: obj.weight,
        claim: obj.claim,
        jockey: obj.jockey,
        trainer: obj.trainer,
        form: obj.form,
        scratched: Boolean(obj.scratched),
        stats: obj.stats,
        speedMap: obj.speedMap,
        raceClassFit: obj.raceClassFit,
        odds: obj.odds,
      };
    }
    return r;
  });

  const prompt = `Race Metadata: ${JSON.stringify(params.raceInfo)}
Runners Field Data: ${JSON.stringify(compactRunners)}
Track & Barrier Bias Telemetry: ${params.trackBias ? JSON.stringify(params.trackBias) : 'None'}
Firecrawl Live Betting Market & Speedmap Telemetry: ${params.firecrawlIntel ? JSON.stringify(params.firecrawlIntel) : 'None'}
Historical RAG Context: ${params.ragContext || 'None'}`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      race_summary: { type: Type.STRING },
      overall_reasoning: { type: Type.STRING },
      track_bias_factor: { type: Type.STRING },
      top_selections: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            position: { type: Type.STRING },
            runner_number: { type: Type.INTEGER },
            runner_name: { type: Type.STRING },
            barrier: { type: Type.STRING },
            form: { type: Type.STRING },
            confidence_score: { type: Type.INTEGER },
            role: { type: Type.STRING },
            reason: { type: Type.STRING },
          },
          required: [
            'position',
            'runner_number',
            'runner_name',
            'barrier',
            'form',
            'confidence_score',
            'role',
            'reason',
          ],
        },
      },
      recommended_tickets: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING },
            combination: { type: Type.STRING },
            runners: {
              type: Type.ARRAY,
              items: { type: Type.INTEGER },
            },
            strategy_reason: { type: Type.STRING },
          },
          required: ['type', 'combination', 'runners', 'strategy_reason'],
        },
      },
      risk_notes: { type: Type.STRING },
    },
    required: [
      'race_summary',
      'overall_reasoning',
      'track_bias_factor',
      'top_selections',
      'recommended_tickets',
      'risk_notes',
    ],
  };

  const modelsToTry = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;
  let lastError: unknown = null;

  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        throw new Error(`Model ${model} returned an empty trifecta response.`);
      }

      const parsed = JSON.parse(rawText) as Omit<
        TrifectaPredictionResult,
        | 'date'
        | 'track'
        | 'race_number'
        | 'distance'
        | 'condition'
        | 'model_used'
        | 'source'
      >;

      return {
        ...parsed,
        date: params.raceInfo.date,
        track: params.raceInfo.track,
        race_number: params.raceInfo.race_number,
        distance: params.raceInfo.distance,
        condition: params.raceInfo.condition,
        model_used: model,
        source: params.source,
      };
    } catch (error) {
      lastError = error;
      const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
      const isQuota =
        msg.includes('429') ||
        msg.includes('resource_exhausted') ||
        msg.includes('quota');
      if (isQuota && model === 'gemini-4-hydrogen') {
        continue;
      }
      throw formatGeminiError(error, model);
    }
  }

  throw formatGeminiError(lastError, modelsToTry[modelsToTry.length - 1]);
}

export async function extractMarketAndSpeedmapFromMarkdown(params: {
  track: string;
  raceNumber: number | null;
  date: string;
  markdown: string;
  sources: FirecrawlSourceLink[];
  modeUsed: 'scrape' | 'search';
}): Promise<FirecrawlRacingIntel> {
  const ai = getClient();

  const systemInstruction = `You are a Racing Market & Speedmap Data Extractor.
Extract structured betting market odds (win odds, place odds, opening odds, market movers/trends) and speedmap telemetry (predicted settle position, speedmap role like Leader / On-Pace / Midfield / Backmarker, barrier, pace notes, overall race pace forecast) strictly from the provided Firecrawl markdown content.

RULES:
- Do NOT invent odds, barriers, or runner names not present in the markdown.
- Use "—" for any numeric or text field that is absent in the scraped markdown (and null for runner_number if unknown).
- Summarize the overall pace forecast ("Fast", "Moderate", "Slow", or "Unknown") based only on the extracted speedmap or markdown evidence.`;

  const clippedMarkdown = params.markdown.slice(0, 28000);
  const prompt = `Target Race Context:
Track: ${params.track || 'Unspecified'}
Race Number: ${params.raceNumber ?? 'Unspecified'}
Date: ${params.date || 'Unspecified'}

Scraped Markdown Content:
${clippedMarkdown}`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      track: { type: Type.STRING },
      race_number: { type: Type.INTEGER, nullable: true },
      pace_forecast: { type: Type.STRING },
      pace_summary: { type: Type.STRING },
      market_runners: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            runner_number: { type: Type.INTEGER, nullable: true },
            runner_name: { type: Type.STRING },
            barrier: { type: Type.STRING },
            win_odds: { type: Type.STRING },
            place_odds: { type: Type.STRING },
            opening_odds: { type: Type.STRING },
            market_trend: { type: Type.STRING },
            speedmap_role: { type: Type.STRING },
            expected_settle_position: { type: Type.STRING },
            pace_note: { type: Type.STRING },
          },
          required: [
            'runner_number',
            'runner_name',
            'barrier',
            'win_odds',
            'place_odds',
            'opening_odds',
            'market_trend',
            'speedmap_role',
            'expected_settle_position',
            'pace_note',
          ],
        },
      },
    },
    required: [
      'track',
      'race_number',
      'pace_forecast',
      'pace_summary',
      'market_runners',
    ],
  };

  const modelsToTry = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;
  let lastError: unknown = null;

  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        throw new Error(`Model ${model} returned an empty extraction payload.`);
      }

      const parsed = JSON.parse(rawText) as {
        track: string;
        race_number: number | null;
        pace_forecast: string;
        pace_summary: string;
        market_runners: FirecrawlRunnerMarketSpeedmap[];
      };

      return {
        track: parsed.track || params.track,
        race_number: parsed.race_number ?? params.raceNumber,
        date: params.date,
        pace_forecast: parsed.pace_forecast || 'Unknown',
        pace_summary: parsed.pace_summary || 'No pace summary extracted.',
        market_runners: parsed.market_runners || [],
        sources: params.sources,
        raw_markdown_preview: params.markdown.slice(0, 4000),
        mode_used: params.modeUsed,
        model_used: model,
        fetched_at: new Date().toISOString(),
      };
    } catch (error) {
      lastError = error;
      const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
      const isQuota =
        msg.includes('429') ||
        msg.includes('resource_exhausted') ||
        msg.includes('quota');
      if (isQuota && model === 'gemini-4-hydrogen') {
        continue;
      }
      throw formatGeminiError(error, model);
    }
  }

  throw formatGeminiError(lastError, modelsToTry[modelsToTry.length - 1]);
}
