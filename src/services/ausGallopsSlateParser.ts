export type ParsedSlateRaceStatus =
  | 'RESULT'
  | 'UPCOMING'
  | 'CLOSED'
  | 'SUSPENDED'
  | 'ABANDONED';

export interface ParsedSlateRace {
  raceNumber: number;
  status: ParsedSlateRaceStatus;
  trifectaResult?: string;
  startTime?: string;
}

export interface ParsedAusMeeting {
  track: string;
  country: 'Australia';
  races: ParsedSlateRace[];
  completedCount: number;
  upcomingCount: number;
}

export interface ParsedAusSlateResult {
  meetings: ParsedAusMeeting[];
  excludedNonAusTracks: string[];
}

const COUNTRY_EXCLUSIONS = new Set([
  'new zealand',
  'hong kong',
  'singapore',
  'japan',
  'uk',
  'united kingdom',
  'ireland',
  'france',
  'usa',
  'united states',
  'south africa',
]);

function isResultLine(line: string): boolean {
  return /^\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*\d+)?$/.test(line);
}

function isTimeLine(line: string): boolean {
  return /^\d{1,2}:\d{2}$/.test(line);
}

function isStatusCode(line: string): ParsedSlateRaceStatus | null {
  const upper = line.toUpperCase();
  if (upper === 'CLSD' || upper === 'CLOSED') return 'CLOSED';
  if (upper === 'SUS' || upper === 'SUSPENDED') return 'SUSPENDED';
  if (upper === 'ABND' || upper === 'ABANDONED') return 'ABANDONED';
  return null;
}

export function parseAusGallopsSlate(rawText: string): ParsedAusSlateResult {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => {
      if (!l) return false;
      const lower = l.toLowerCase();
      if (lower === 'legend' || lower.startsWith('sus:') || lower.includes('abnd:')) {
        return false;
      }
      return true;
    });

  interface RawBlock {
    track: string;
    country: string;
    entries: string[];
  }

  const blocks: RawBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1];

    // Look ahead for "TrackName\nCountry"
    if (
      next &&
      !isResultLine(line) &&
      !isTimeLine(line) &&
      !isStatusCode(line) &&
      (next.toLowerCase() === 'australia' ||
        COUNTRY_EXCLUSIONS.has(next.toLowerCase()))
    ) {
      blocks.push({
        track: line,
        country: next,
        entries: [],
      });
      i += 2;
      continue;
    }

    if (blocks.length > 0) {
      blocks[blocks.length - 1].entries.push(line);
    }
    i += 1;
  }

  const meetings: ParsedAusMeeting[] = [];
  const excludedNonAusTracks: string[] = [];

  for (const block of blocks) {
    if (block.country.toLowerCase() !== 'australia') {
      excludedNonAusTracks.push(`${block.track} (${block.country})`);
      continue;
    }

    const races: ParsedSlateRace[] = [];
    let raceNum = 1;

    for (const entry of block.entries) {
      if (isResultLine(entry)) {
        races.push({
          raceNumber: raceNum++,
          status: 'RESULT',
          trifectaResult: entry.replace(/\s+/g, ''),
        });
      } else if (isTimeLine(entry)) {
        races.push({
          raceNumber: raceNum++,
          status: 'UPCOMING',
          startTime: entry,
        });
      } else {
        const statusCode = isStatusCode(entry);
        if (statusCode) {
          races.push({
            raceNumber: raceNum++,
            status: statusCode,
          });
        }
      }
    }

    if (races.length > 0) {
      meetings.push({
        track: block.track,
        country: 'Australia',
        races,
        completedCount: races.filter((r) => r.status === 'RESULT').length,
        upcomingCount: races.filter((r) => r.status === 'UPCOMING').length,
      });
    }
  }

  return { meetings, excludedNonAusTracks };
}
