import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Award,
  ExternalLink,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import type {
  DoltCommit,
  FirecrawlRacingIntel,
  FormFavMeeting,
  FormFavRaceFormResponse,
  RacingCardData,
  TrifectaPredictionResult,
} from '../types/engine';
import { FirecrawlIntelPanel } from './FirecrawlView';

export interface TrifectaTargetRequest {
  source: 'formfav_mcp' | 'dolt_commit' | 'custom_input';
  date?: string;
  track?: string;
  race?: number;
  raceCard?: FormFavRaceFormResponse;
  trackBias?: unknown;
  doltBranchRef?: string;
  firecrawlIntel?: FirecrawlRacingIntel;
  key: number;
}

interface TrifectaResultPanelProps {
  prediction: TrifectaPredictionResult;
}

export const TrifectaResultPanel: React.FC<TrifectaResultPanelProps> = ({
  prediction,
}) => {
  return (
    <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden">
      {/* Header Summary */}
      <div className="p-5 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-500 tabular-nums">
          <span>
            {prediction.track} · R{prediction.race_number} · {prediction.date} ·{' '}
            {prediction.distance} · {prediction.condition}
          </span>
          <span>
            Source: {prediction.source} · {prediction.model_used}
          </span>
        </div>
        <h3 className="text-lg font-bold text-slate-900">
          {prediction.race_summary}
        </h3>
        <p className="text-sm text-slate-700 leading-relaxed">
          {prediction.overall_reasoning}
        </p>
        {prediction.track_bias_factor && (
          <p className="text-xs text-slate-600 pt-1">
            <span className="font-semibold text-slate-800">
              Track &amp; Barrier Factor:
            </span>{' '}
            {prediction.track_bias_factor}
          </p>
        )}
      </div>

      {/* Ordered Trifecta Selections with Per-Runner Reasons */}
      <div className="divide-y divide-slate-200">
        <div className="px-5 py-3 bg-slate-50 flex items-center justify-between">
          <h4 className="text-xs font-semibold text-slate-900">
            Ranked Trifecta Selections &amp; Reasoning
          </h4>
          <span className="text-xs font-mono text-slate-500 tabular-nums">
            {prediction.top_selections.length} runners ranked
          </span>
        </div>

        {prediction.top_selections.map((leg) => (
          <div
            key={`${leg.position}-${leg.runner_number}-${leg.runner_name}`}
            className="p-5 space-y-1.5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex flex-wrap items-baseline gap-2.5">
                <span className="text-xs font-mono font-bold text-teal-800 uppercase">
                  {leg.position}
                </span>
                <span className="text-sm font-bold text-slate-900">
                  #{leg.runner_number} {leg.runner_name}
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  · {leg.role}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono text-slate-500 tabular-nums">
                <span>Bar {leg.barrier || '—'}</span>
                <span>Form {leg.form || '—'}</span>
                <span className="font-semibold text-slate-900">
                  {leg.confidence_score}% conf
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              {leg.reason}
            </p>
          </div>
        ))}
      </div>

      {/* Recommended Trifecta Tickets */}
      <div className="p-5 space-y-3 bg-slate-50/50">
        <h4 className="text-xs font-semibold text-slate-900">
          Recommended Trifecta Tickets
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {prediction.recommended_tickets.map((ticket, idx) => (
            <div
              key={`${ticket.type}-${idx}`}
              className="p-4 bg-white border border-slate-200 rounded-lg space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900">
                  {ticket.type}
                </span>
                <span className="font-mono text-xs font-bold text-teal-800 tabular-nums">
                  {ticket.combination}
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {ticket.strategy_reason}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Risk & Scratchings Note */}
      {prediction.risk_notes && (
        <div className="px-5 py-3.5 text-xs text-slate-600 leading-relaxed">
          <span className="font-semibold text-slate-800">
            Risk &amp; Scratchings Note:
          </span>{' '}
          {prediction.risk_notes}
        </div>
      )}
    </div>
  );
};

interface TrifectaViewProps {
  commits: DoltCommit[];
  initialTarget?: TrifectaTargetRequest | null;
}

function getSydneyTodayIso(): string {
  try {
    return new Date().toLocaleDateString('en-CA', {
      timeZone: 'Australia/Sydney',
    });
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

const DEFAULT_CUSTOM_RUNNERS = `1. Southern Cross | Bar 3 | Odds 3.40 | Form 121 | 38% win 1200m
4. Adelaide Breeze | Bar 11 | Odds 6.50 | Form 342 | 25% win 1200m
7. Barossa Gold | Bar 2 | Odds 8.00 | Form 214 | 33% win 1200m
9. Torrens Flyer | Bar 5 | Odds 11.00 | Form 513 | 22% win 1200m`;

function parseCustomRunners(input: string): unknown[] {
  const trimmed = input.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
  }

  return trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split('|').map((p) => p.trim());
      const first = parts[0] || '';
      const numMatch = first.match(/^#?(\d+)[\s.):-]*(.+)$/);
      const number = numMatch ? Number(numMatch[1]) : index + 1;
      const name = numMatch ? numMatch[2].trim() : first;

      const extras: Record<string, unknown> = {};
      for (const part of parts.slice(1)) {
        const barMatch = part.match(/(?:bar|barrier)\s*[:#]?\s*(\d+)/i);
        const oddsMatch = part.match(/(?:odds|price)\s*[:$]?\s*(\d+(?:\.\d+)?)/i);
        const formMatch = part.match(/form\s*[:]?\s*([A-Za-z0-9]+)/i);
        if (barMatch) extras.barrier = Number(barMatch[1]);
        else if (oddsMatch) extras.odds = Number(oddsMatch[1]);
        else if (formMatch) extras.form = formMatch[1];
        else extras.notes = extras.notes ? `${extras.notes}; ${part}` : part;
      }

      return {
        number,
        name,
        raw_entry: line,
        ...extras,
      };
    });
}

export const TrifectaView: React.FC<TrifectaViewProps> = ({
  commits,
  initialTarget,
}) => {
  const racingCommits = commits.filter((c) => c.table === 'racing_cards');

  const [sourceMode, setSourceMode] = useState<
    'formfav_mcp' | 'dolt_commit' | 'custom_input'
  >('formfav_mcp');

  // FormFav Live Race state
  const [date, setDate] = useState<string>(getSydneyTodayIso);
  const [track, setTrack] = useState<string>('');
  const [raceNumber, setRaceNumber] = useState<number>(1);
  const [meetings, setMeetings] = useState<FormFavMeeting[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(false);

  // Dolt commit state
  const [selectedBranchRef, setSelectedBranchRef] = useState<string>(
    racingCommits[0]?.branch_ref || ''
  );

  // Custom / Any race state
  const [customTrack, setCustomTrack] = useState<string>('Morphettville');
  const [customRaceNum, setCustomRaceNum] = useState<number>(7);
  const [customDistance, setCustomDistance] = useState<string>('1200m');
  const [customCondition, setCustomCondition] = useState<string>('Good 4');
  const [customRunnersText, setCustomRunnersText] = useState<string>(
    DEFAULT_CUSTOM_RUNNERS
  );

  const [notes, setNotes] = useState<string>('');
  const [includeFirecrawl, setIncludeFirecrawl] = useState<boolean>(false);
  const [activeFirecrawlIntel, setActiveFirecrawlIntel] =
    useState<FirecrawlRacingIntel | null>(null);
  const [firecrawlWarning, setFirecrawlWarning] = useState<string | null>(null);
  const [predicting, setPredicting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingKey, setMissingKey] = useState(false);
  const [prediction, setPrediction] = useState<TrifectaPredictionResult | null>(
    null
  );
  const [loadedRaceCard, setLoadedRaceCard] =
    useState<FormFavRaceFormResponse | null>(null);

  useEffect(() => {
    if (!selectedBranchRef && racingCommits.length > 0) {
      setSelectedBranchRef(racingCommits[0].branch_ref);
    }
  }, [racingCommits, selectedBranchRef]);

  const executePrediction = async (payload: Record<string, unknown>) => {
    setPredicting(true);
    setError(null);
    setFirecrawlWarning(null);
    try {
      const res = await fetch('/api/racing/trifecta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body.missing_api_key) setMissingKey(true);
        throw new Error(body.error || 'Failed to generate trifecta prediction.');
      }
      setMissingKey(false);
      setPrediction(body.prediction);
      if (body.raceCard) {
        setLoadedRaceCard(body.raceCard);
      }
      if (body.firecrawlIntel) {
        setActiveFirecrawlIntel(body.firecrawlIntel);
      }
      if (body.firecrawlWarning) {
        setFirecrawlWarning(body.firecrawlWarning);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Trifecta prediction failed.'
      );
    } finally {
      setPredicting(false);
    }
  };

  useEffect(() => {
    if (!initialTarget) return;
    setSourceMode(initialTarget.source);
    if (initialTarget.firecrawlIntel) {
      setActiveFirecrawlIntel(initialTarget.firecrawlIntel);
      setIncludeFirecrawl(true);
    }
    if (initialTarget.source === 'formfav_mcp') {
      if (initialTarget.date) setDate(initialTarget.date);
      if (initialTarget.track) setTrack(initialTarget.track);
      if (initialTarget.race) setRaceNumber(initialTarget.race);
      executePrediction({
        source: 'formfav_mcp',
        date: initialTarget.date || date,
        track: initialTarget.track,
        race: initialTarget.race || 1,
        raceCard: initialTarget.raceCard,
        trackBias: initialTarget.trackBias,
        firecrawlIntel: initialTarget.firecrawlIntel,
        includeFirecrawl: Boolean(
          initialTarget.firecrawlIntel ? false : includeFirecrawl
        ),
        notes,
      });
    } else if (
      initialTarget.source === 'dolt_commit' &&
      initialTarget.doltBranchRef
    ) {
      setSelectedBranchRef(initialTarget.doltBranchRef);
      executePrediction({
        source: 'dolt_commit',
        dolt_branch_ref: initialTarget.doltBranchRef,
        firecrawlIntel: initialTarget.firecrawlIntel,
        notes,
      });
    } else if (
      initialTarget.source === 'custom_input' &&
      initialTarget.firecrawlIntel
    ) {
      const fc = initialTarget.firecrawlIntel;
      setCustomTrack(fc.track || 'Target Race');
      setCustomRaceNum(fc.race_number || 1);
      if (fc.date) setDate(fc.date);
      const formattedRunners = fc.market_runners.map((r, idx) => ({
        number: r.runner_number ?? idx + 1,
        name: r.runner_name,
        barrier: r.barrier,
        win_odds: r.win_odds,
        place_odds: r.place_odds,
        market_trend: r.market_trend,
        speedmap_role: r.speedmap_role,
        expected_settle_position: r.expected_settle_position,
        pace_note: r.pace_note,
      }));
      if (formattedRunners.length > 0) {
        setCustomRunnersText(JSON.stringify(formattedRunners, null, 2));
      }
      if (formattedRunners.length >= 2) {
        executePrediction({
          source: 'custom_input',
          raceInfo: {
            date: fc.date || date,
            track: fc.track || 'Target Race',
            race_number: fc.race_number || 1,
            distance: 'See Speedmap',
            condition: fc.pace_forecast || 'Unknown',
            notes: fc.pace_summary,
          },
          runners: formattedRunners,
          firecrawlIntel: fc,
          notes: fc.pace_summary,
        });
      }
    }
  }, [initialTarget]);

  const handleLoadMeetings = async () => {
    setLoadingMeetings(true);
    setError(null);
    try {
      const res = await fetch('/api/formfav/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body.missing_api_key) setMissingKey(true);
        throw new Error(body.error || 'Failed to load Aus Gallops meetings.');
      }
      setMissingKey(false);
      const list = (body.meetings || []) as FormFavMeeting[];
      setMeetings(list);
      const firstActive = list.find((m) => !m.abandoned);
      if (firstActive && !track) {
        setTrack(firstActive.slug || firstActive.track);
        const firstRace = firstActive.races.find((r) => !r.abandoned);
        if (firstRace) setRaceNumber(firstRace.raceNumber);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to fetch meetings.'
      );
    } finally {
      setLoadingMeetings(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sourceMode === 'formfav_mcp') {
      await executePrediction({
        source: 'formfav_mcp',
        date,
        track: track.trim(),
        race: raceNumber,
        includeFirecrawl,
        notes,
      });
      return;
    }

    if (sourceMode === 'dolt_commit') {
      await executePrediction({
        source: 'dolt_commit',
        dolt_branch_ref: selectedBranchRef,
        includeFirecrawl,
        notes,
      });
      return;
    }

    try {
      const runners = parseCustomRunners(customRunnersText);
      if (runners.length < 2) {
        setError('Provide at least 2 runners (one per line or JSON array).');
        return;
      }
      await executePrediction({
        source: 'custom_input',
        raceInfo: {
          date,
          track: customTrack.trim(),
          race_number: customRaceNum,
          distance: customDistance.trim(),
          condition: customCondition.trim(),
          notes,
        },
        runners,
        includeFirecrawl,
        firecrawlIntel: activeFirecrawlIntel || undefined,
        notes,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Invalid custom runner input.'
      );
    }
  };

  const selectedDoltCommit = racingCommits.find(
    (c) => c.branch_ref === selectedBranchRef
  );
  const selectedMeetingObj = meetings.find(
    (m) =>
      (m.slug || '').toLowerCase() === track.trim().toLowerCase() ||
      (m.track || '').toLowerCase() === track.trim().toLowerCase()
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Trifecta Predictions
          </h1>
          <p className="mt-1 text-sm text-slate-600 max-w-2xl">
            Generate grounded 1st–2nd–3rd–4th trifecta rankings, boxed/standout tickets, and per-runner reasoning for any live FormFav MCP race, Dolt racing record, or custom race field.
          </p>
        </div>
      </div>

      {missingKey && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-amber-900 leading-relaxed">
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">
                FormFav MCP live races require FORMFAV_API_KEY in Settings &gt; Secrets
              </p>
              <p className="text-amber-800 mt-0.5">
                You can also run trifecta predictions on Dolt Records or Any Custom Race without a FormFav key.
              </p>
            </div>
          </div>
          <a
            href="https://formfav.com/get-api-key?cta=mcp"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-xs font-medium text-amber-950 bg-amber-200/80 hover:bg-amber-200 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            Get Free Key
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Race Selector & Input */}
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4"
        >
          <div className="inline-flex p-1 bg-slate-100 rounded-lg gap-1 w-full">
            {(
              [
                { id: 'formfav_mcp', label: 'Live FormFav Race' },
                { id: 'dolt_commit', label: 'Dolt Record' },
                { id: 'custom_input', label: 'Custom / Any Race' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setSourceMode(tab.id);
                  setError(null);
                }}
                className={`flex-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  sourceMode === tab.id
                    ? 'bg-white text-slate-900'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {sourceMode === 'formfav_mcp' && (
            <div className="space-y-3">
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <label className="block text-xs font-medium text-slate-700">
                    Meeting Date
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                    required
                  />
                </div>
                <button
                  type="button"
                  onClick={handleLoadMeetings}
                  disabled={loadingMeetings}
                  className="px-3 py-2 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      loadingMeetings ? 'animate-spin' : ''
                    }`}
                  />
                  {loadingMeetings ? 'Loading...' : 'Load Meetings'}
                </button>
              </div>

              {meetings.length > 0 && (
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700">
                    Australian Meetings ({meetings.length})
                  </label>
                  <select
                    value={track}
                    onChange={(e) => {
                      setTrack(e.target.value);
                      const m = meetings.find(
                        (item) => (item.slug || item.track) === e.target.value
                      );
                      const r1 = m?.races?.find((r) => !r.abandoned);
                      if (r1) setRaceNumber(r1.raceNumber);
                    }}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-teal-700"
                  >
                    <option value="">Select track...</option>
                    {meetings.map((m) => (
                      <option
                        key={m.slug || m.track}
                        value={m.slug || m.track}
                        disabled={m.abandoned}
                      >
                        {m.track} ({m.races.length} races)
                        {m.abandoned ? ' [Abandoned]' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1">
                  <label className="block text-xs font-medium text-slate-700">
                    Track Name or Slug
                  </label>
                  <input
                    type="text"
                    value={track}
                    onChange={(e) => setTrack(e.target.value)}
                    placeholder="e.g. ascot, doomben, sandown"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700">
                    Race #
                  </label>
                  {selectedMeetingObj && selectedMeetingObj.races.length > 0 ? (
                    <select
                      value={raceNumber}
                      onChange={(e) => setRaceNumber(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-teal-700"
                    >
                      {selectedMeetingObj.races.map((r) => (
                        <option
                          key={r.raceNumber}
                          value={r.raceNumber}
                          disabled={r.abandoned}
                        >
                          R{r.raceNumber}{' '}
                          {r.distance ? `(${r.distance})` : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="number"
                      min={1}
                      max={15}
                      value={raceNumber}
                      onChange={(e) => setRaceNumber(Number(e.target.value) || 1)}
                      className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                      required
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {sourceMode === 'dolt_commit' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">
                  Dolt `racing-daily` Commit
                </label>
                <select
                  value={selectedBranchRef}
                  onChange={(e) => setSelectedBranchRef(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-teal-700"
                >
                  {racingCommits.map((c) => {
                    const card = c.data as RacingCardData;
                    return (
                      <option key={c.branch_ref} value={c.branch_ref}>
                        {c.branch_ref} — {card.meeting} R{card.race_number} (
                        {card.distance})
                      </option>
                    );
                  })}
                </select>
              </div>
              {selectedDoltCommit && (
                <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-[11px] font-mono max-h-48 overflow-auto">
                  {JSON.stringify(selectedDoltCommit.data, null, 2)}
                </pre>
              )}
            </div>
          )}

          {sourceMode === 'custom_input' && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2.5">
                <div className="col-span-2 space-y-1">
                  <label className="block text-xs font-medium text-slate-700">
                    Track / Meeting
                  </label>
                  <input
                    type="text"
                    value={customTrack}
                    onChange={(e) => setCustomTrack(e.target.value)}
                    placeholder="e.g. Flemington"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700">
                    Race #
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={customRaceNum}
                    onChange={(e) =>
                      setCustomRaceNum(Number(e.target.value) || 1)
                    }
                    className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700">
                    Distance
                  </label>
                  <input
                    type="text"
                    value={customDistance}
                    onChange={(e) => setCustomDistance(e.target.value)}
                    placeholder="1200m"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700">
                    Track Condition
                  </label>
                  <input
                    type="text"
                    value={customCondition}
                    onChange={(e) => setCustomCondition(e.target.value)}
                    placeholder="Good 4 / Soft 5"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">
                  Runners (one per line or JSON array)
                </label>
                <textarea
                  rows={6}
                  value={customRunnersText}
                  onChange={(e) => setCustomRunnersText(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                  placeholder="1. Horse Name | Bar 3 | Odds 3.50 | Form 121"
                  required
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700">
              Optional Speed Map / Track Pattern Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Rail out 6m, favouring on-pace inside runners..."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
            />
          </div>

          <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer select-none pt-0.5">
            <input
              type="checkbox"
              checked={includeFirecrawl}
              onChange={(e) => setIncludeFirecrawl(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
            />
            <span>
              Enrich with live <strong>Firecrawl</strong> betting market odds
              &amp; speedmap before predicting (uses{' '}
              <code className="font-mono text-[11px]">FIRECRAWL_API_KEY</code>)
            </span>
          </label>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {error}
            </div>
          )}

          {firecrawlWarning && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
              Firecrawl enrichment notice: {firecrawlWarning}
            </div>
          )}

          <button
            type="submit"
            disabled={
              predicting ||
              (sourceMode === 'formfav_mcp' && !track.trim()) ||
              (sourceMode === 'dolt_commit' && !selectedBranchRef)
            }
            className="w-full py-2.5 px-4 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            {predicting
              ? 'Analyzing Field & Generating Trifecta...'
              : 'Predict Trifecta with Reason'}
          </button>

          {loadedRaceCard && (
            <div className="pt-3 border-t border-slate-200 text-xs text-slate-500 font-mono tabular-nums">
              Loaded field: {loadedRaceCard.track} R{loadedRaceCard.raceNumber} ·{' '}
              {loadedRaceCard.runners?.filter((r) => !r.scratched).length || 0}{' '}
              active starters
            </div>
          )}
        </form>

        {/* Right: Structured Trifecta Prediction Output */}
        <div className="lg:col-span-7 space-y-6">
          {predicting ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="h-6 w-2/3 bg-slate-100 rounded animate-pulse" />
              <div className="h-20 w-full bg-slate-100 rounded animate-pulse" />
              <div className="h-24 w-full bg-slate-100 rounded animate-pulse" />
              <div className="h-24 w-full bg-slate-100 rounded animate-pulse" />
            </div>
          ) : prediction ? (
            <>
              <TrifectaResultPanel prediction={prediction} />
              {activeFirecrawlIntel && (
                <FirecrawlIntelPanel intel={activeFirecrawlIntel} />
              )}
            </>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2.5">
              <Award className="w-7 h-7 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-900">
                Select any race to generate a grounded Trifecta Prediction
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                Pick a live Australian Gallops race from FormFav MCP, a versioned Dolt commit, or enter any custom runner field to get ranked 1st–4th selections, boxed &amp; standout tickets, and per-runner reasoning.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
