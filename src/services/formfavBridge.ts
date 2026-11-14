import type {
  FormFavMeeting,
  FormFavRaceFormResponse,
  FormFavRunnerForm,
  RacingCardData,
} from '../types/engine';

export type DataHubActionKind = 'MEETING' | 'RACE_FIELD' | 'RUNNER_CARD';

export type DataHubActionStatus =
  | 'NEW'
  | 'COMMITTED_DOLT'
  | 'INDEXED_RAG'
  | 'ANALYZED';

export interface DataHubActionItem {
  id: string;
  kind: DataHubActionKind;
  title: string;
  subtitle: string;
  date: string;
  track: string;
  slug: string;
  raceNumber?: number;
  distance?: string;
  condition?: string;
  runnerCount?: number;
  status: DataHubActionStatus;
  raceCard?: FormFavRaceFormResponse;
  runner?: FormFavRunnerForm;
  meeting?: FormFavMeeting;
}

export function buildDoltCardFromRaceCard(
  card: FormFavRaceFormResponse
): RacingCardData {
  return {
    meeting: card.track,
    race_number: card.raceNumber,
    distance: card.distance || 'Unknown',
    track: card.condition || 'Unknown',
    runners: (card.runners || [])
      .filter((r) => !r.scratched)
      .map((r) => {
        const tdWin = r.stats?.trackDistance?.winPercent;
        const distWin = r.stats?.distance?.winPercent;
        const overallWin = r.stats?.overall?.winPercent ?? 0;
        const pct = Math.round((tdWin ?? distWin ?? overallWin) * 100);
        return {
          no: r.number,
          name: r.name,
          barrier: Number(r.barrier) || 0,
          odds: 0,
          dolt_win_rate_1200m: `${pct}%`,
          jockey: r.jockey || undefined,
          trainer: r.trainer || undefined,
          weight: r.weight ? String(r.weight) : undefined,
          form: r.form || undefined,
        };
      }),
  };
}

export function buildRagNoteFromRaceCard(
  card: FormFavRaceFormResponse,
  biasSummary?: string
): { title: string; collection: string; domain: 'RACING'; content: string } {
  const activeRunners = (card.runners || []).filter((r) => !r.scratched);
  const topRunners = activeRunners
    .slice(0, 5)
    .map((r) => {
      const winPct = Math.round((r.stats?.overall?.winPercent ?? 0) * 100);
      return `#${r.number} ${r.name} (Bar ${r.barrier ?? '-'}, Form ${r.form || '-'}, Career Win ${winPct}%, Jockey ${r.jockey || '-'})`;
    })
    .join('; ');

  return {
    title: `${card.track} R${card.raceNumber} (${card.date}) FormFav Field Snapshot`,
    collection: 'FormFav Aus Gallops',
    domain: 'RACING',
    content: [
      `${card.track} Race ${card.raceNumber} (${card.raceName || 'Gallops'}) over ${card.distance || 'TBD'} on ${card.condition || 'Condition TBD'} (${card.date}).`,
      `Starters: ${activeRunners.length}. Key runners: ${topRunners}.`,
      biasSummary ? `Track bias: ${biasSummary}` : '',
    ]
      .filter(Boolean)
      .join(' '),
  };
}

export function buildRagNoteFromRunner(
  card: FormFavRaceFormResponse,
  runner: FormFavRunnerForm
): { title: string; collection: string; domain: 'RACING'; content: string } {
  const overall = runner.stats?.overall;
  const td = runner.stats?.trackDistance;
  const firstUp = runner.stats?.firstUp;
  return {
    title: `${runner.name} — ${card.track} R${card.raceNumber} Runner Form Card`,
    collection: 'FormFav Runner Cards',
    domain: 'RACING',
    content: [
      `Runner #${runner.number} ${runner.name} (${runner.age ?? '?'}yo ${runner.sex || ''}, ${runner.sire || '?'} x ${runner.dam || '?'}).`,
      `Drawing barrier ${runner.barrier ?? '?'}, weight ${runner.weight ?? '?'}, Jockey ${runner.jockey || '?'}, Trainer ${runner.trainer || '?'}.`,
      `Recent form: ${runner.form || '-'} (Last 20: ${runner.last20Starts || '-'}).`,
      overall
        ? `Career: ${overall.starts} starts, ${overall.wins}W-${overall.seconds}S-${overall.thirds}T (${Math.round((overall.winPercent ?? 0) * 100)}% win).`
        : '',
      td && td.starts
        ? `Track/Distance: ${td.starts} starts, ${td.wins} wins (${Math.round((td.winPercent ?? 0) * 100)}%).`
        : '',
      firstUp && firstUp.starts
        ? `First-Up: ${firstUp.starts} starts, ${firstUp.wins} wins.`
        : '',
    ]
      .filter(Boolean)
      .join(' '),
  };
}

export function meetingsToActionItems(
  date: string,
  meetings: FormFavMeeting[],
  featuredCard?: FormFavRaceFormResponse | null
): DataHubActionItem[] {
  const items: DataHubActionItem[] = [];

  for (const meeting of meetings) {
    const slug = meeting.slug || meeting.track;
    const activeRaces = meeting.races.filter((r) => !r.abandoned);
    items.push({
      id: `meeting-${date}-${slug}`,
      kind: 'MEETING',
      title: `${meeting.track} (${activeRaces.length} races)`,
      subtitle: `Aus Gallops · ${date} · ${activeRaces
        .slice(0, 4)
        .map((r) => `R${r.raceNumber} ${r.distance || ''}`.trim())
        .join(', ')}${activeRaces.length > 4 ? '…' : ''}`,
      date,
      track: meeting.track,
      slug,
      runnerCount: activeRaces.reduce(
        (acc, r) => acc + (r.numberOfRunners ?? 0),
        0
      ),
      status: 'NEW',
      meeting,
    });
  }

  if (featuredCard) {
    items.unshift(raceCardToActionItem(featuredCard));
  }

  return items;
}

export function raceCardToActionItem(
  card: FormFavRaceFormResponse
): DataHubActionItem {
  const activeCount = (card.runners || []).filter((r) => !r.scratched).length;
  return {
    id: `field-${card.date}-${card.track.toLowerCase().replace(/\s+/g, '-')}-r${card.raceNumber}`,
    kind: 'RACE_FIELD',
    title: `${card.track} R${card.raceNumber}${card.raceName ? `: ${card.raceName}` : ''}`,
    subtitle: `${card.date} · ${card.distance || 'Distance TBD'} · ${card.condition || 'Track TBD'} · ${activeCount} runners`,
    date: card.date,
    track: card.track,
    slug: card.track.toLowerCase().replace(/\s+/g, '-'),
    raceNumber: card.raceNumber,
    distance: card.distance || undefined,
    condition: card.condition || undefined,
    runnerCount: activeCount,
    status: 'NEW',
    raceCard: card,
  };
}

export function runnerToActionItem(
  card: FormFavRaceFormResponse,
  runner: FormFavRunnerForm
): DataHubActionItem {
  const winPct = Math.round((runner.stats?.overall?.winPercent ?? 0) * 100);
  return {
    id: `runner-${card.date}-${card.track.toLowerCase().replace(/\s+/g, '-')}-r${card.raceNumber}-${runner.number}`,
    kind: 'RUNNER_CARD',
    title: `#${runner.number} ${runner.name} (${card.track} R${card.raceNumber})`,
    subtitle: `Bar ${runner.barrier ?? '-'} · Wt ${runner.weight ?? '-'} · Form ${runner.form || '-'} · ${runner.jockey || 'Jockey TBD'} · Career ${winPct}% win`,
    date: card.date,
    track: card.track,
    slug: card.track.toLowerCase().replace(/\s+/g, '-'),
    raceNumber: card.raceNumber,
    distance: card.distance || undefined,
    condition: card.condition || undefined,
    status: 'NEW',
    raceCard: card,
    runner,
  };
}

export function meetCardsToActionItems(
  raceCards: FormFavRaceFormResponse[]
): DataHubActionItem[] {
  const items: DataHubActionItem[] = [];
  for (const card of raceCards) {
    items.push(raceCardToActionItem(card));
    for (const runner of card.runners || []) {
      if (!runner.scratched) {
        items.push(runnerToActionItem(card, runner));
      }
    }
  }
  return items;
}

export function buildRouterPromptFromItem(item: DataHubActionItem): string {
  if (item.kind === 'RUNNER_CARD' && item.runner) {
    return `Use FormFav MCP to inspect runner ${item.runner.name} at ${item.track} Race ${item.raceNumber} on ${item.date}, cross-reference ${item.track} ${item.distance || ''} track bias in RAG, generate a runner form card visual with Nanobanana, and draft a Gmail race note.`;
  }
  if (item.kind === 'RACE_FIELD') {
    return `Fetch ${item.track} Race ${item.raceNumber} (${item.date}) via FormFav MCP, commit the field to Dolt racing-daily, check ${item.track} ${item.distance || ''} track bias in RAG, generate a race infographic with Nanobanana, and create a Google Task to review selections.`;
  }
  return `Pull Australian Gallops meeting ${item.track} for ${item.date} via FormFav MCP, inspect Race 1–4 fields, commit top races to Dolt racing-daily, and create a Google Task for race day preview.`;
}
