import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Award,
  BookmarkPlus,
  Check,
  ChevronRight,
  ExternalLink,
  Flame,
  GitCommitHorizontal,
  Layers,
  Play,
  RefreshCw,
  Search,
} from 'lucide-react';
import {
  buildDoltCardFromRaceCard,
  type DataHubActionItem,
  meetCardsToActionItems,
  raceCardToActionItem,
  runnerToActionItem,
} from '../services/formfavBridge';
import type {
  DoltCommit,
  FirecrawlRacingIntel,
  FormFavMcpStatus,
  FormFavMeeting,
  FormFavRaceFormResponse,
  FormFavRunnerForm,
  FormFavRunnerStats,
  RacingCardData,
  TrifectaPredictionResult,
} from '../types/engine';
import { FirecrawlIntelPanel } from './FirecrawlView';
import { TrifectaResultPanel } from './TrifectaView';

interface FormFavMcpViewProps {
  initialTarget?: {
    date: string;
    track: string;
    race: number;
    key: number;
  } | null;
  onCommitCreated: (commit: DoltCommit) => void;
  onSendToOrchestrator: (card: RacingCardData, biasNote?: string) => void;
  onPinToDataHub?: (item: DataHubActionItem) => void;
  onPushMeetCardsToDataHub?: (
    items: DataHubActionItem[],
    summaryLabel?: string
  ) => void;
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

function formatStatsSummary(s?: FormFavRunnerStats | null): string {
  if (!s || !s.starts) return '—';
  const pct = Math.round((s.winPercent ?? 0) * 100);
  return `${s.starts}: ${s.wins}-${s.seconds}-${s.thirds} (${pct}%)`;
}

export const FormFavMcpView: React.FC<FormFavMcpViewProps> = ({
  initialTarget,
  onCommitCreated,
  onSendToOrchestrator,
  onPinToDataHub,
  onPushMeetCardsToDataHub,
}) => {
  const [status, setStatus] = useState<FormFavMcpStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const [date, setDate] = useState<string>(getSydneyTodayIso);
  const [meetings, setMeetings] = useState<FormFavMeeting[]>([]);
  const [totalAllCountries, setTotalAllCountries] = useState<number>(0);
  const [loadingMeetings, setLoadingMeetings] = useState(false);
  const [meetingsLoadedOnce, setMeetingsLoadedOnce] = useState(false);

  const [selectedMeetingSlug, setSelectedMeetingSlug] = useState<string>('');
  const [selectedRaceNumber, setSelectedRaceNumber] = useState<number | null>(
    null
  );
  const [raceCard, setRaceCard] = useState<FormFavRaceFormResponse | null>(null);
  const [trackBias, setTrackBias] = useState<unknown>(null);
  const [loadingCard, setLoadingCard] = useState(false);

  const [selectedRunner, setSelectedRunner] =
    useState<FormFavRunnerForm | null>(null);
  const [runnerProfile, setRunnerProfile] = useState<unknown>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const [predictionsData, setPredictionsData] = useState<unknown>(null);
  const [loadingPredictions, setLoadingPredictions] = useState(false);

  const [trifectaResult, setTrifectaResult] =
    useState<TrifectaPredictionResult | null>(null);
  const [loadingTrifecta, setLoadingTrifecta] = useState(false);

  const [firecrawlIntel, setFirecrawlIntel] =
    useState<FirecrawlRacingIntel | null>(null);
  const [loadingFirecrawl, setLoadingFirecrawl] = useState(false);

  // Runner search state
  const [runnerQuery, setRunnerQuery] = useState('');
  const [runnerSearchResult, setRunnerSearchResult] = useState<unknown>(null);
  const [searchingRunner, setSearchingRunner] = useState(false);

  // Full meet runner cards state
  const [quickMeetTrack, setQuickMeetTrack] = useState('');
  const [loadingMeetCards, setLoadingMeetCards] = useState(false);
  const [meetCardsData, setMeetCardsData] = useState<{
    date: string;
    track: string;
    slug: string;
    racesCount: number;
    totalRunners: number;
    raceCards: FormFavRaceFormResponse[];
  } | null>(null);
  const [meetRaceFilter, setMeetRaceFilter] = useState<number | 'ALL'>('ALL');
  const [meetRunnerFilter, setMeetRunnerFilter] = useState('');

  const [committing, setCommitting] = useState(false);
  const [committedRef, setCommittedRef] = useState<string | null>(null);
  const [pinnedNotice, setPinnedNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missingApiKey, setMissingApiKey] = useState(false);
  const [showTools, setShowTools] = useState(false);

  const probeStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch('/api/formfav/status');
      const body = await res.json();
      setStatus(body.status);
      if (body.status && !body.status.hasApiKey) {
        setMissingApiKey(true);
      } else {
        setMissingApiKey(false);
      }
    } catch {
      setStatus(null);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    probeStatus();
  }, []);

  useEffect(() => {
    if (!initialTarget) return;
    setDate(initialTarget.date);
    handleLoadRaceCard(
      initialTarget.track,
      initialTarget.race,
      initialTarget.date
    );
  }, [initialTarget]);

  const handleFetchMeetings = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoadingMeetings(true);
    setError(null);
    setMeetingsLoadedOnce(false);
    try {
      const res = await fetch('/api/formfav/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body.missing_api_key) setMissingApiKey(true);
        throw new Error(body.error || 'Failed to fetch Aus Gallops meetings.');
      }
      const list = (body.meetings || []) as FormFavMeeting[];
      setMeetings(list);
      setTotalAllCountries(body.totalMeetingsAllCountries || list.length);
      setMeetingsLoadedOnce(true);
      setMissingApiKey(false);
      if (list.length > 0) {
        setSelectedMeetingSlug(list[0].slug || list[0].track);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to fetch meetings.'
      );
    } finally {
      setLoadingMeetings(false);
    }
  };

  const handleLoadRaceCard = async (
    trackSlug: string,
    raceNum: number,
    overrideDate?: string
  ) => {
    const targetDate = overrideDate || date;
    setSelectedMeetingSlug(trackSlug);
    setSelectedRaceNumber(raceNum);
    setLoadingCard(true);
    setError(null);
    setCommittedRef(null);
    setPinnedNotice(null);
    setSelectedRunner(null);
    setRunnerProfile(null);
    setPredictionsData(null);
    setTrifectaResult(null);
    setFirecrawlIntel(null);

    try {
      const res = await fetch('/api/formfav/race-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: targetDate,
          track: trackSlug,
          race: raceNum,
          includeBias: true,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body.missing_api_key) setMissingApiKey(true);
        throw new Error(body.error || 'Failed to load race card.');
      }
      setRaceCard(body.card);
      setTrackBias(body.trackBias ?? null);
      if (body.card?.runners?.length > 0) {
        setSelectedRunner(body.card.runners[0]);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to fetch race card.'
      );
    } finally {
      setLoadingCard(false);
    }
  };

  const handleLoadRunnerCareer = async (runner: FormFavRunnerForm) => {
    setLoadingProfile(true);
    setRunnerProfile(null);
    setError(null);
    try {
      const searchRes = await fetch('/api/formfav/runner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: runner.name }),
      });
      const searchBody = await searchRes.json();
      if (!searchRes.ok) {
        throw new Error(searchBody.error || 'Runner lookup failed.');
      }
      const matches = searchBody.matches;
      const firstId =
        matches?.runners?.[0]?.id ||
        matches?.results?.[0]?.id ||
        (Array.isArray(matches) ? matches[0]?.id : null);

      if (firstId) {
        const profRes = await fetch('/api/formfav/runner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runnerId: String(firstId) }),
        });
        const profBody = await profRes.json();
        if (profRes.ok) {
          setRunnerProfile(profBody.profile);
          return;
        }
      }
      setRunnerProfile(matches);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load runner career profile.'
      );
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleLoadPredictions = async () => {
    if (!raceCard) return;
    setLoadingPredictions(true);
    setError(null);
    try {
      const res = await fetch('/api/formfav/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: raceCard.date,
          track: selectedMeetingSlug || raceCard.track,
          race: raceCard.raceNumber,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Predictions lookup failed.');
      setPredictionsData(body);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Predictions request failed.'
      );
    } finally {
      setLoadingPredictions(false);
    }
  };

  const handleFetchFirecrawlForRace = async () => {
    if (!raceCard) return;
    setLoadingFirecrawl(true);
    setError(null);
    try {
      const res = await fetch('/api/firecrawl/market-speedmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          track: raceCard.track,
          raceNumber: raceCard.raceNumber,
          date: raceCard.date,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(
          body.error || 'Firecrawl market & speedmap lookup failed.'
        );
      }
      setFirecrawlIntel(body.intel);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Firecrawl betting market lookup error.'
      );
    } finally {
      setLoadingFirecrawl(false);
    }
  };

  const handlePredictTrifectaForRace = async (
    overrideIntel?: FirecrawlRacingIntel
  ) => {
    if (!raceCard) return;
    setLoadingTrifecta(true);
    setError(null);
    try {
      const res = await fetch('/api/racing/trifecta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'formfav_mcp',
          raceCard,
          trackBias,
          firecrawlIntel: overrideIntel ?? firecrawlIntel ?? undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Trifecta prediction failed.');
      }
      setTrifectaResult(body.prediction);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to predict trifecta.'
      );
    } finally {
      setLoadingTrifecta(false);
    }
  };

  const handleSearchRunner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!runnerQuery.trim()) return;
    setSearchingRunner(true);
    setError(null);
    try {
      const res = await fetch('/api/formfav/runner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: runnerQuery.trim() }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body.missing_api_key) setMissingApiKey(true);
        throw new Error(body.error || 'Runner search failed.');
      }
      setRunnerSearchResult(body.matches);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Runner lookup error.');
    } finally {
      setSearchingRunner(false);
    }
  };

  const handleCommitToDolt = async () => {
    if (!raceCard || committing) return;
    setCommitting(true);
    setError(null);
    try {
      const mapped = buildDoltCardFromRaceCard(raceCard);
      const res = await fetch('/api/dolt/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch: 'racing-daily',
          message: `FormFav MCP ingest: ${raceCard.track} R${raceCard.raceNumber} (${raceCard.date})`,
          author: 'formfav-mcp',
          table: 'racing_cards',
          record_id: `${raceCard.track.toLowerCase().replace(/\s+/g, '-')}-r${raceCard.raceNumber}-${raceCard.date}`,
          data: mapped,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Dolt commit failed.');
      onCommitCreated(body.commit);
      setCommittedRef(body.commit.branch_ref);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to commit card.');
    } finally {
      setCommitting(false);
    }
  };

  const handleSendToOrchestrator = () => {
    if (!raceCard) return;
    const mapped = buildDoltCardFromRaceCard(raceCard);
    const biasText = trackBias
      ? `FormFav MCP Track Bias (${raceCard.track}): ${JSON.stringify(trackBias)}`
      : undefined;
    onSendToOrchestrator(mapped, biasText);
  };

  const handlePinRaceField = () => {
    if (!raceCard || !onPinToDataHub) return;
    onPinToDataHub(raceCardToActionItem(raceCard));
    setPinnedNotice(`Pinned ${raceCard.track} R${raceCard.raceNumber} to Action Bridge`);
  };

  const handlePinRunnerCard = () => {
    if (!raceCard || !selectedRunner || !onPinToDataHub) return;
    onPinToDataHub(runnerToActionItem(raceCard, selectedRunner));
    setPinnedNotice(`Pinned #${selectedRunner.number} ${selectedRunner.name} to Action Bridge`);
  };

  const handleLoadAllMeetCards = async (
    trackSlug: string,
    raceNumbers?: number[],
    overrideDate?: string
  ) => {
    const cleanTrack = trackSlug.trim();
    if (!cleanTrack) return;
    const targetDate = overrideDate || date;
    setLoadingMeetCards(true);
    setError(null);
    setPinnedNotice(null);
    try {
      const res = await fetch('/api/formfav/meet-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: targetDate,
          track: cleanTrack,
          raceNumbers,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body.missing_api_key) setMissingApiKey(true);
        throw new Error(
          body.error || 'Failed to load all runner cards for meet.'
        );
      }
      setMissingApiKey(false);
      setMeetCardsData(body);
      setMeetRaceFilter('ALL');
      setMeetRunnerFilter('');
      if (body.raceCards?.length > 0) {
        const firstCard = body.raceCards[0] as FormFavRaceFormResponse;
        setRaceCard(firstCard);
        setSelectedMeetingSlug(body.slug || cleanTrack);
        setSelectedRaceNumber(firstCard.raceNumber);
        setSelectedRunner(
          firstCard.runners?.find((r) => !r.scratched) ||
            firstCard.runners?.[0] ||
            null
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to fetch all runner cards for meet.'
      );
    } finally {
      setLoadingMeetCards(false);
    }
  };

  const handlePushAllMeetCards = () => {
    if (!meetCardsData || !onPushMeetCardsToDataHub) return;
    const items = meetCardsToActionItems(meetCardsData.raceCards);
    onPushMeetCardsToDataHub(
      items,
      `Pushed ${meetCardsData.totalRunners} runner cards across ${meetCardsData.racesCount} races (${meetCardsData.track}) to DataHub Action Bridge.`
    );
    setPinnedNotice(
      `Pushed ${items.length} actionable meet items (${meetCardsData.track}) to DataHub Action Bridge`
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            FormFav MCP — Aus Gallops
          </h1>
          <p className="mt-1 text-sm text-slate-600 max-w-2xl">
            Live Model Context Protocol bridge to api.formfav.com/mcp for Australian Thoroughbred meetings, race fields, barrier bias, and runner career form cards.
          </p>
        </div>

        <button
          type="button"
          onClick={probeStatus}
          disabled={loadingStatus}
          className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1.5 cursor-pointer shrink-0 self-start sm:self-auto"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin' : ''}`}
          />
          Verify MCP Server
        </button>
      </div>

      {/* Live MCP Server Status Strip */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
            <span className="font-mono font-semibold text-slate-900">
              {status?.endpoint || 'https://api.formfav.com/mcp'}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {status?.connected
                ? `Connected (${status.serverName} v${status.serverVersion})`
                : loadingStatus
                ? 'Probing MCP handshake...'
                : 'Offline'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {status?.tools?.length ?? 0} MCP tools
            </span>
            <span aria-hidden="true">·</span>
            <span
              className={
                status?.hasApiKey
                  ? 'text-emerald-700 font-medium'
                  : 'text-amber-700 font-medium'
              }
            >
              {status?.hasApiKey
                ? 'FORMFAV_API_KEY configured'
                : 'FORMFAV_API_KEY required'}
            </span>
          </div>

          {status && status.tools.length > 0 && (
            <button
              type="button"
              onClick={() => setShowTools((prev) => !prev)}
              className="text-xs font-medium text-teal-700 hover:text-teal-800 cursor-pointer"
            >
              {showTools ? 'Hide MCP Tools' : `Inspect ${status.tools.length} Tools`}
            </button>
          )}
        </div>

        {missingApiKey && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 text-xs text-amber-900 leading-relaxed">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">
                  FormFav MCP requires a free API key in Settings &gt; Secrets
                </p>
                <p className="text-amber-800 mt-0.5">
                  Add{' '}
                  <code className="font-mono px-1 py-0.5 bg-amber-100 rounded">
                    FORMFAV_API_KEY
                  </code>{' '}
                  in your AI Studio Secrets panel (sent server-side via the{' '}
                  <code className="font-mono">X-API-Key</code> header to{' '}
                  <code className="font-mono">https://api.formfav.com/mcp</code>).
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

        {showTools && status?.tools && (
          <div className="border-t border-slate-200 pt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {status.tools.map((tool) => (
              <div
                key={tool.name}
                className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-slate-900">
                    {tool.name}
                  </span>
                  <span className="text-[11px] text-slate-500 truncate">
                    {tool.title}
                  </span>
                </div>
                <p className="text-xs text-slate-600 line-clamp-2">
                  {tool.description}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Controls: Date Picker for Meetings + Runner Search */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleFetchMeetings}
          className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              1. Fetch Aus Gallops Meetings (get_meetings)
            </h2>
            <span className="text-xs text-slate-500 font-mono">
              country=au · gallops
            </span>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="flex-1 px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
              required
            />
            <button
              type="submit"
              disabled={loadingMeetings}
              className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
            >
              {loadingMeetings ? 'Loading Meetings...' : 'Fetch Aus Meetings'}
            </button>
          </div>
        </form>

        <form
          onSubmit={handleSearchRunner}
          className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Runner Lookup (search_runner)
            </h2>
            <span className="text-xs text-slate-500 font-mono">
              Australia Thoroughbreds
            </span>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={runnerQuery}
                onChange={(e) => setRunnerQuery(e.target.value)}
                placeholder="Search runner name (e.g. Via Sistina)..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
              />
            </div>
            <button
              type="submit"
              disabled={searchingRunner || !runnerQuery.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
            >
              {searchingRunner ? 'Searching...' : 'Search Runner'}
            </button>
          </div>

          {runnerSearchResult !== null && (
            <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono max-h-40 overflow-auto">
              {JSON.stringify(runnerSearchResult, null, 2)}
            </pre>
          )}
        </form>
      </div>

      {/* Direct Full-Meet Runner Cards Loader */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleLoadAllMeetCards(quickMeetTrack);
        }}
        className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Get All Runner Cards for Meet (Batch get_race_card)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Fetches every active race field and individual runner form card for an Australian gallops meeting on {date}.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2.5 shrink-0">
          <input
            type="text"
            value={quickMeetTrack}
            onChange={(e) => setQuickMeetTrack(e.target.value)}
            placeholder="Track name or slug (e.g. randwick, flemington)..."
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700 sm:w-72"
            required
          />
          <button
            type="submit"
            disabled={loadingMeetCards || !quickMeetTrack.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Layers className="w-4 h-4" />
            {loadingMeetCards ? 'Fetching All Cards...' : 'Get All Meet Runner Cards'}
          </button>
        </div>
      </form>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 leading-relaxed">
          {error}
        </div>
      )}

      {pinnedNotice && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{pinnedNotice}</span>
        </div>
      )}

      {/* Meetings List & Race Selector */}
      {meetingsLoadedOnce && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Australian Gallops Meetings ({date})
            </h2>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {meetings.length} AU meetings ({totalAllCountries} total global)
            </span>
          </div>

          {meetings.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No Australian gallops meetings returned for {date}. Try another date within the 30-day lookback to 7-day lookahead window.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {meetings.map((meeting) => {
                const trackId = meeting.slug || meeting.track;
                return (
                  <div key={trackId} className="p-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-semibold text-slate-900">
                          {meeting.track}
                        </span>
                        <span className="text-slate-300" aria-hidden="true">
                          ·
                        </span>
                        <span className="font-mono text-xs text-slate-500">
                          {meeting.slug}
                        </span>
                        {meeting.abandoned && (
                          <>
                            <span className="text-slate-300" aria-hidden="true">
                              ·
                            </span>
                            <span className="text-xs font-medium text-red-700">
                              Abandoned
                            </span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-slate-500 tabular-nums">
                          {meeting.races.length} races
                        </span>
                        <button
                          type="button"
                          disabled={loadingMeetCards || meeting.abandoned}
                          onClick={() =>
                            handleLoadAllMeetCards(
                              trackId,
                              meeting.races
                                .filter((r) => !r.abandoned)
                                .map((r) => r.raceNumber),
                              date
                            )
                          }
                          className="px-2.5 py-1 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 disabled:opacity-40 rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Layers className="w-3.5 h-3.5" />
                          {loadingMeetCards ? 'Loading...' : 'Get All Runner Cards'}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {meeting.races.map((r) => {
                        const isActive =
                          selectedMeetingSlug === trackId &&
                          selectedRaceNumber === r.raceNumber;
                        return (
                          <button
                            key={r.raceNumber}
                            type="button"
                            disabled={r.abandoned || loadingCard}
                            onClick={() =>
                              handleLoadRaceCard(trackId, r.raceNumber)
                            }
                            className={`px-3 py-1.5 text-xs font-mono rounded-lg border transition-colors cursor-pointer disabled:opacity-40 ${
                              isActive
                                ? 'bg-teal-700 text-white border-teal-700'
                                : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            R{r.raceNumber}
                            {r.distance ? ` · ${r.distance}` : ''}
                            {r.condition ? ` · ${r.condition}` : ''}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Full Meet Runner Cards Matrix */}
      {meetCardsData && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {meetCardsData.track} — All Meet Runner Cards
              </h2>
              <p className="text-xs font-mono text-slate-500 tabular-nums mt-0.5">
                {meetCardsData.date} · {meetCardsData.racesCount} races ·{' '}
                {meetCardsData.totalRunners} runner cards loaded
              </p>
            </div>
            {onPushMeetCardsToDataHub && (
              <button
                type="button"
                onClick={handlePushAllMeetCards}
                className="px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                Push All {meetCardsData.totalRunners} Cards to DataHub
              </button>
            )}
          </div>

          <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setMeetRaceFilter('ALL')}
                className={`px-2.5 py-1 text-xs font-mono rounded-md cursor-pointer ${
                  meetRaceFilter === 'ALL'
                    ? 'bg-teal-700 text-white'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                All Races
              </button>
              {meetCardsData.raceCards.map((rc) => (
                <button
                  key={rc.raceNumber}
                  type="button"
                  onClick={() => setMeetRaceFilter(rc.raceNumber)}
                  className={`px-2.5 py-1 text-xs font-mono rounded-md cursor-pointer ${
                    meetRaceFilter === rc.raceNumber
                      ? 'bg-teal-700 text-white'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  R{rc.raceNumber}
                </button>
              ))}
            </div>

            <div className="relative sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={meetRunnerFilter}
                onChange={(e) => setMeetRunnerFilter(e.target.value)}
                placeholder="Filter runner, jockey, trainer..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
              />
            </div>
          </div>

          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
                <tr className="text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-3">Race</th>
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">Runner</th>
                  <th className="py-2.5 px-3">Form</th>
                  <th className="py-2.5 px-3 text-right">Bar</th>
                  <th className="py-2.5 px-3 text-right">Wt</th>
                  <th className="py-2.5 px-3">Jockey</th>
                  <th className="py-2.5 px-3">Trainer</th>
                  <th className="py-2.5 px-3">Career</th>
                  <th className="py-2.5 px-3">T&amp;D</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {meetCardsData.raceCards
                  .filter((rc) =>
                    meetRaceFilter === 'ALL'
                      ? true
                      : rc.raceNumber === meetRaceFilter
                  )
                  .flatMap((rc) =>
                    (rc.runners || [])
                      .filter((runner) => {
                        const q = meetRunnerFilter.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          runner.name.toLowerCase().includes(q) ||
                          (runner.jockey || '').toLowerCase().includes(q) ||
                          (runner.trainer || '').toLowerCase().includes(q) ||
                          `r${rc.raceNumber}` === q
                        );
                      })
                      .map((runner) => {
                        const isSelected =
                          raceCard?.raceNumber === rc.raceNumber &&
                          selectedRunner?.number === runner.number;
                        return (
                          <tr
                            key={`meet-r${rc.raceNumber}-${runner.number}-${runner.name}`}
                            onClick={() => {
                              setRaceCard(rc);
                              setSelectedMeetingSlug(meetCardsData.slug);
                              setSelectedRaceNumber(rc.raceNumber);
                              setSelectedRunner(runner);
                              setRunnerProfile(null);
                            }}
                            className={`cursor-pointer transition-colors ${
                              runner.scratched
                                ? 'opacity-45 bg-slate-50'
                                : isSelected
                                ? 'bg-teal-50/70'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="py-2 px-3 font-mono tabular-nums font-semibold text-teal-800 whitespace-nowrap">
                              R{rc.raceNumber}{' '}
                              <span className="text-slate-400 font-normal">
                                {rc.distance || ''}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-mono tabular-nums text-slate-700">
                              {runner.number}
                            </td>
                            <td className="py-2 px-3 font-medium text-slate-900 whitespace-nowrap">
                              {runner.name}
                              {runner.scratched && (
                                <span className="ml-1 text-[11px] text-red-700 font-normal">
                                  (SCR)
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 font-mono tabular-nums text-slate-600">
                              {runner.form || '—'}
                            </td>
                            <td className="py-2 px-3 font-mono tabular-nums text-right text-slate-600">
                              {runner.barrier ?? '—'}
                            </td>
                            <td className="py-2 px-3 font-mono tabular-nums text-right text-slate-600">
                              {runner.weight ?? '—'}
                            </td>
                            <td className="py-2 px-3 text-slate-700 truncate max-w-[130px]">
                              {runner.jockey || '—'}
                            </td>
                            <td className="py-2 px-3 text-slate-600 truncate max-w-[130px]">
                              {runner.trainer || '—'}
                            </td>
                            <td className="py-2 px-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                              {formatStatsSummary(runner.stats?.overall)}
                            </td>
                            <td className="py-2 px-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                              {formatStatsSummary(runner.stats?.trackDistance)}
                            </td>
                          </tr>
                        );
                      })
                  )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Race Field & Runner Form Card Inspector */}
      {loadingCard ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <div className="h-6 w-1/3 bg-slate-100 rounded animate-pulse" />
          <div className="h-48 w-full bg-slate-100 rounded animate-pulse" />
        </div>
      ) : (
        raceCard && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Race Field Table */}
            <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {raceCard.track} — Race {raceCard.raceNumber}
                    {raceCard.raceName ? `: ${raceCard.raceName}` : ''}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                    {raceCard.date} · {raceCard.distance || '—'} ·{' '}
                    {raceCard.condition || 'Track TBD'} ·{' '}
                    {raceCard.raceClass || 'Open'}
                    {raceCard.prizeMoney ? ` · ${raceCard.prizeMoney}` : ''}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {onPinToDataHub && (
                    <button
                      type="button"
                      onClick={handlePinRaceField}
                      className="px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <BookmarkPlus className="w-3.5 h-3.5" />
                      Pin to Bridge
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleLoadPredictions}
                    disabled={loadingPredictions}
                    className="px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
                  >
                    {loadingPredictions ? 'Loading Odds...' : 'ML Odds & Prices'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCommitToDolt}
                    disabled={committing}
                    className="px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    {committedRef ? (
                      <Check className="w-3.5 h-3.5 text-emerald-700" />
                    ) : (
                      <GitCommitHorizontal className="w-3.5 h-3.5" />
                    )}
                    {committedRef
                      ? `Committed ${committedRef}`
                      : committing
                      ? 'Committing...'
                      : 'Commit to Dolt'}
                  </button>
                  <button
                    type="button"
                    onClick={handleFetchFirecrawlForRace}
                    disabled={loadingFirecrawl}
                    className="px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Flame className="w-3.5 h-3.5" />
                    {loadingFirecrawl ? 'Crawling...' : 'Firecrawl Odds & Map'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePredictTrifectaForRace()}
                    disabled={loadingTrifecta}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Award className="w-3.5 h-3.5" />
                    {loadingTrifecta ? 'Predicting...' : 'Predict Trifecta'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSendToOrchestrator}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Race Tips Preview
                  </button>
                </div>
              </div>

              {predictionsData !== null && (
                <div className="p-4 bg-slate-50 border-b border-slate-200">
                  <p className="text-xs font-semibold text-slate-800 mb-1.5">
                    FormFav Predictions &amp; Live Prices
                  </p>
                  <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono max-h-44 overflow-auto">
                    {JSON.stringify(predictionsData, null, 2)}
                  </pre>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Runner</th>
                      <th className="py-2.5 px-3">Form</th>
                      <th className="py-2.5 px-3 text-right">Bar</th>
                      <th className="py-2.5 px-3 text-right">Wt</th>
                      <th className="py-2.5 px-3">Jockey</th>
                      <th className="py-2.5 px-3">Career</th>
                      <th className="py-2.5 px-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {raceCard.runners.map((runner) => {
                      const isSelected = selectedRunner?.number === runner.number;
                      return (
                        <tr
                          key={`${runner.number}-${runner.name}`}
                          onClick={() => {
                            setSelectedRunner(runner);
                            setRunnerProfile(null);
                          }}
                          className={`cursor-pointer transition-colors ${
                            runner.scratched
                              ? 'opacity-45 bg-slate-50'
                              : isSelected
                              ? 'bg-teal-50/60'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-2.5 px-3 font-mono tabular-nums text-slate-700">
                            {runner.number}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-900">
                            {runner.name}
                            {runner.scratched && (
                              <span className="ml-1.5 text-[11px] text-red-700 font-normal">
                                (SCR)
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-slate-600">
                            {runner.form || '—'}
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-right text-slate-600">
                            {runner.barrier ?? '—'}
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-right text-slate-600">
                            {runner.weight ?? '—'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 truncate max-w-[130px]">
                            {runner.jockey || '—'}
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                            {formatStatsSummary(runner.stats?.overall)}
                          </td>
                          <td className="py-2.5 px-2 text-slate-400">
                            <ChevronRight className="w-4 h-4" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Runner Form Card Detail */}
            <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
              {selectedRunner ? (
                <div className="divide-y divide-slate-200">
                  <div className="p-5 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums">
                      <span>
                        #{selectedRunner.number} · Barrier{' '}
                        {selectedRunner.barrier ?? '—'} ·{' '}
                        {selectedRunner.weight ?? '—'}
                      </span>
                      <span>Form: {selectedRunner.form || '—'}</span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">
                      {selectedRunner.name}
                    </h3>
                    <p className="text-xs text-slate-600">
                      {[
                        selectedRunner.age ? `${selectedRunner.age}yo` : null,
                        selectedRunner.sex,
                        selectedRunner.sire && selectedRunner.dam
                          ? `${selectedRunner.sire} × ${selectedRunner.dam}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Thoroughbred Runner'}
                    </p>
                    <p className="text-xs text-slate-600">
                      Jockey: {selectedRunner.jockey || '—'} · Trainer:{' '}
                      {selectedRunner.trainer || '—'}
                      {selectedRunner.careerPrizeMoney
                        ? ` · Prize: ${selectedRunner.careerPrizeMoney}`
                        : ''}
                    </p>

                    <div className="pt-2 flex flex-wrap gap-2">
                      {onPinToDataHub && (
                        <button
                          type="button"
                          onClick={handlePinRunnerCard}
                          className="px-2.5 py-1 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <BookmarkPlus className="w-3.5 h-3.5" />
                          Pin Runner to DataHub
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleLoadRunnerCareer(selectedRunner)}
                        disabled={loadingProfile}
                        className="px-2.5 py-1 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-md cursor-pointer"
                      >
                        {loadingProfile
                          ? 'Loading Career Profile...'
                          : 'Fetch Deep Profile (MCP)'}
                      </button>
                    </div>
                  </div>

                  {selectedRunner.last20Starts && (
                    <div className="px-5 py-3 bg-slate-50">
                      <p className="text-[11px] font-semibold text-slate-600 mb-1">
                        Last 20 Starts (Oldest → Latest)
                      </p>
                      <p className="font-mono text-xs tracking-wider text-slate-900">
                        {selectedRunner.last20Starts}
                      </p>
                    </div>
                  )}

                  <div className="p-5 space-y-2.5">
                    <h4 className="text-xs font-semibold text-slate-900">
                      Form Card Splits
                    </h4>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      <div>
                        <span className="text-slate-500 block">Overall</span>
                        <span className="font-mono tabular-nums text-slate-900">
                          {formatStatsSummary(selectedRunner.stats?.overall)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Track</span>
                        <span className="font-mono tabular-nums text-slate-900">
                          {formatStatsSummary(selectedRunner.stats?.track)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Distance</span>
                        <span className="font-mono tabular-nums text-slate-900">
                          {formatStatsSummary(selectedRunner.stats?.distance)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">
                          Track &amp; Distance
                        </span>
                        <span className="font-mono tabular-nums text-slate-900">
                          {formatStatsSummary(
                            selectedRunner.stats?.trackDistance
                          )}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">First-Up</span>
                        <span className="font-mono tabular-nums text-slate-900">
                          {formatStatsSummary(selectedRunner.stats?.firstUp)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Second-Up</span>
                        <span className="font-mono tabular-nums text-slate-900">
                          {formatStatsSummary(selectedRunner.stats?.secondUp)}
                        </span>
                      </div>
                    </div>

                    {selectedRunner.stats?.conditions &&
                      Object.keys(selectedRunner.stats.conditions).length >
                        0 && (
                        <div className="pt-3 border-t border-slate-100">
                          <span className="text-[11px] font-semibold text-slate-600 block mb-1.5">
                            Track Conditions
                          </span>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {Object.entries(selectedRunner.stats.conditions).map(
                              ([cond, st]) => (
                                <div key={cond}>
                                  <span className="text-slate-500 capitalize">
                                    {cond}:{' '}
                                  </span>
                                  <span className="font-mono tabular-nums text-slate-900">
                                    {formatStatsSummary(st)}
                                  </span>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )}

                    {runnerProfile !== null && (
                      <div className="pt-3 border-t border-slate-200">
                        <span className="text-[11px] font-semibold text-slate-600 block mb-1.5">
                          FormFav Career Profile Payload
                        </span>
                        <pre className="p-2.5 bg-slate-900 text-slate-100 rounded-lg text-[11px] font-mono max-h-48 overflow-auto">
                          {JSON.stringify(runnerProfile, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-slate-500">
                  Select a runner row to inspect their complete FormFav form card.
                </div>
              )}
            </section>
          </div>
        )
      )}

      {firecrawlIntel && (
        <FirecrawlIntelPanel
          intel={firecrawlIntel}
          onPredictTrifecta={(intel) => handlePredictTrifectaForRace(intel)}
        />
      )}

      {loadingTrifecta && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <div className="h-5 w-1/3 bg-slate-100 rounded animate-pulse" />
          <div className="h-32 w-full bg-slate-100 rounded animate-pulse" />
        </div>
      )}

      {trifectaResult && !loadingTrifecta && (
        <TrifectaResultPanel prediction={trifectaResult} />
      )}
    </div>
  );
};
