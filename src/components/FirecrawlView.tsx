import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Award,
  Check,
  Database,
  ExternalLink,
  Flame,
  GitCommitHorizontal,
  Globe,
  RefreshCw,
  Search,
} from 'lucide-react';
import type {
  DoltCommit,
  FirecrawlRacingIntel,
  RacingCardData,
  RagDocument,
} from '../types/engine';

interface FirecrawlIntelPanelProps {
  intel: FirecrawlRacingIntel;
  onPredictTrifecta?: (intel: FirecrawlRacingIntel) => void;
  onIndexToRag?: (intel: FirecrawlRacingIntel) => void;
  onCommitToDolt?: (intel: FirecrawlRacingIntel) => void;
  indexingRag?: boolean;
  committingDolt?: boolean;
}

export const FirecrawlIntelPanel: React.FC<FirecrawlIntelPanelProps> = ({
  intel,
  onPredictTrifecta,
  onIndexToRag,
  onCommitToDolt,
  indexingRag,
  committingDolt,
}) => {
  const [showMarkdown, setShowMarkdown] = useState(false);

  return (
    <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden">
      {/* Header & Pace Summary */}
      <div className="p-5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-500 tabular-nums">
              <span>{intel.date}</span>
              <span aria-hidden="true">·</span>
              <span>Firecrawl /{intel.mode_used}</span>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-teal-800">
                Pace: {intel.pace_forecast}
              </span>
              <span aria-hidden="true">·</span>
              <span>{intel.model_used}</span>
            </div>
            <h3 className="text-base font-bold text-slate-900 mt-0.5">
              {intel.track}
              {intel.race_number ? ` — Race ${intel.race_number}` : ''} Betting
              Market &amp; Speedmap
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onIndexToRag && (
              <button
                type="button"
                disabled={indexingRag}
                onClick={() => onIndexToRag(intel)}
                className="px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Database className="w-3.5 h-3.5" />
                {indexingRag ? 'Indexing...' : 'Index to RAG'}
              </button>
            )}
            {onCommitToDolt && (
              <button
                type="button"
                disabled={committingDolt}
                onClick={() => onCommitToDolt(intel)}
                className="px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <GitCommitHorizontal className="w-3.5 h-3.5" />
                {committingDolt ? 'Committing...' : 'Commit to Dolt'}
              </button>
            )}
            {onPredictTrifecta && (
              <button
                type="button"
                onClick={() => onPredictTrifecta(intel)}
                className="px-3 py-1.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Award className="w-3.5 h-3.5" />
                Predict Trifecta
              </button>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-700 leading-relaxed">
          {intel.pace_summary}
        </p>
      </div>

      {/* Betting Market & Speedmap Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="py-2.5 px-3">#</th>
              <th className="py-2.5 px-3">Runner</th>
              <th className="py-2.5 px-3 text-right">Bar</th>
              <th className="py-2.5 px-3 text-right">Win</th>
              <th className="py-2.5 px-3 text-right">Place</th>
              <th className="py-2.5 px-3 text-right">Open</th>
              <th className="py-2.5 px-3">Trend</th>
              <th className="py-2.5 px-3">Speedmap</th>
              <th className="py-2.5 px-3">Settle</th>
              <th className="py-2.5 px-3">Pace Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-xs">
            {intel.market_runners.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="py-6 px-4 text-center text-slate-500"
                >
                  No structured runner odds or speedmap rows were detected in the scraped pages. Check the source markdown preview below.
                </td>
              </tr>
            ) : (
              intel.market_runners.map((r, idx) => (
                <tr
                  key={`${r.runner_number ?? idx}-${r.runner_name}`}
                  className="hover:bg-slate-50"
                >
                  <td className="py-2.5 px-3 font-mono tabular-nums text-slate-700">
                    {r.runner_number ?? '—'}
                  </td>
                  <td className="py-2.5 px-3 font-medium text-slate-900 whitespace-nowrap">
                    {r.runner_name}
                  </td>
                  <td className="py-2.5 px-3 font-mono tabular-nums text-right text-slate-600">
                    {r.barrier || '—'}
                  </td>
                  <td className="py-2.5 px-3 font-mono tabular-nums text-right font-semibold text-slate-900">
                    {r.win_odds || '—'}
                  </td>
                  <td className="py-2.5 px-3 font-mono tabular-nums text-right text-slate-600">
                    {r.place_odds || '—'}
                  </td>
                  <td className="py-2.5 px-3 font-mono tabular-nums text-right text-slate-500">
                    {r.opening_odds || '—'}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                    {r.market_trend || '—'}
                  </td>
                  <td className="py-2.5 px-3 font-semibold text-teal-800 whitespace-nowrap">
                    {r.speedmap_role || '—'}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                    {r.expected_settle_position || '—'}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 max-w-xs">
                    {r.pace_note || '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Sources & Raw Markdown Toggle */}
      <div className="p-4 bg-slate-50 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="font-semibold text-slate-700">
              Scraped Sources ({intel.sources.length}):
            </span>
            {intel.sources.map((src) => (
              <a
                key={src.url}
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-700 hover:text-teal-900 inline-flex items-center gap-1 underline underline-offset-2"
              >
                <span className="truncate max-w-[220px]">{src.title}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowMarkdown((prev) => !prev)}
            className="text-xs font-medium text-slate-700 hover:text-slate-900 cursor-pointer"
          >
            {showMarkdown ? 'Hide Raw Markdown' : 'Inspect Raw Markdown'}
          </button>
        </div>

        {showMarkdown && (
          <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-[11px] font-mono max-h-56 overflow-auto whitespace-pre-wrap">
            {intel.raw_markdown_preview}
          </pre>
        )}
      </div>
    </div>
  );
};

export interface FirecrawlTargetRequest {
  track: string;
  raceNumber?: number;
  date?: string;
  key: number;
}

interface FirecrawlViewProps {
  initialTarget?: FirecrawlTargetRequest | null;
  onCommitCreated: (commit: DoltCommit) => void;
  onDocumentAdded: (doc: RagDocument) => void;
  onSendToTrifecta: (intel: FirecrawlRacingIntel) => void;
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

export const FirecrawlView: React.FC<FirecrawlViewProps> = ({
  initialTarget,
  onCommitCreated,
  onDocumentAdded,
  onSendToTrifecta,
}) => {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [endpoint, setEndpoint] = useState('https://api.firecrawl.dev/v1');
  const [checkingStatus, setCheckingStatus] = useState(true);

  const [mode, setMode] = useState<'search' | 'scrape'>('search');
  const [track, setTrack] = useState('Ascot');
  const [raceNumber, setRaceNumber] = useState<number>(1);
  const [date, setDate] = useState<string>(getSydneyTodayIso);
  const [customQuery, setCustomQuery] = useState('');
  const [targetUrl, setTargetUrl] = useState('');

  const [loading, setLoading] = useState(false);
  const [intel, setIntel] = useState<FirecrawlRacingIntel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missingKey, setMissingKey] = useState(false);

  const [indexingRag, setIndexingRag] = useState(false);
  const [committingDolt, setCommittingDolt] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const checkStatus = async () => {
    setCheckingStatus(true);
    try {
      const res = await fetch('/api/firecrawl/status');
      const body = await res.json();
      setHasKey(Boolean(body.status?.hasApiKey));
      setMissingKey(!body.status?.hasApiKey);
      if (body.status?.endpoint) setEndpoint(body.status.endpoint);
    } catch {
      setHasKey(false);
    } finally {
      setCheckingStatus(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  useEffect(() => {
    if (!initialTarget) return;
    setMode('search');
    setTrack(initialTarget.track);
    if (initialTarget.raceNumber) setRaceNumber(initialTarget.raceNumber);
    if (initialTarget.date) setDate(initialTarget.date);
    setIntel(null);
    setError(null);
  }, [initialTarget]);

  const handleFetchIntel = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setFeedback(null);
    try {
      const payload =
        mode === 'scrape'
          ? { url: targetUrl.trim(), track: track.trim(), raceNumber, date }
          : {
              track: track.trim(),
              raceNumber,
              date,
              customQuery: customQuery.trim() || undefined,
            };

      const res = await fetch('/api/firecrawl/market-speedmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body.missing_firecrawl_key) setMissingKey(true);
        throw new Error(
          body.error || 'Failed to fetch Firecrawl market and speedmap.'
        );
      }
      setMissingKey(false);
      setIntel(body.intel);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Firecrawl request failed.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleIndexToRag = async (item: FirecrawlRacingIntel) => {
    setIndexingRag(true);
    setError(null);
    setFeedback(null);
    try {
      const runnerLines = item.market_runners
        .map(
          (r) =>
            `#${r.runner_number ?? '?'} ${r.runner_name} (Bar ${r.barrier}, Win ${r.win_odds}, ${r.market_trend}, Map: ${r.speedmap_role} / ${r.expected_settle_position})`
        )
        .join('; ');
      const res = await fetch('/api/rag/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${item.track}${item.race_number ? ` R${item.race_number}` : ''} (${item.date}) Market & Speedmap`,
          collection: 'Firecrawl Markets & Speedmaps',
          domain: 'RACING',
          content: `Pace forecast: ${item.pace_forecast}. ${item.pace_summary} Runners: ${runnerLines}`,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to index to RAG.');
      onDocumentAdded(body.document);
      setFeedback(`Indexed "${body.document.title}" into RAG Vector Store.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'RAG index failed.');
    } finally {
      setIndexingRag(false);
    }
  };

  const handleCommitToDolt = async (item: FirecrawlRacingIntel) => {
    setCommittingDolt(true);
    setError(null);
    setFeedback(null);
    try {
      const cardData: RacingCardData = {
        meeting: item.track,
        race_number: item.race_number || 1,
        distance: 'See Speedmap',
        track: item.pace_forecast || 'Market Snap',
        runners: item.market_runners.map((r, idx) => ({
          no: r.runner_number ?? idx + 1,
          name: r.runner_name,
          barrier: Number(r.barrier) || 0,
          odds: parseFloat(String(r.win_odds).replace(/[^0-9.]/g, '')) || 0,
          dolt_win_rate_1200m: r.speedmap_role || '—',
          form: r.expected_settle_position || undefined,
        })),
      };

      const res = await fetch('/api/dolt/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch: 'racing-daily',
          message: `Firecrawl Market & Speedmap: ${item.track} R${item.race_number || 1} (${item.date})`,
          author: 'firecrawl-scraper',
          table: 'racing_cards',
          record_id: `fc-${item.track.toLowerCase().replace(/\s+/g, '-')}-r${item.race_number || 1}-${item.date}`,
          data: cardData,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Dolt commit failed.');
      onCommitCreated(body.commit);
      setFeedback(`Committed ${body.commit.branch_ref} to Dolt racing-daily.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dolt commit error.');
    } finally {
      setCommittingDolt(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Firecrawl — Betting Market &amp; Speedmaps
          </h1>
          <p className="mt-1 text-sm text-slate-600 max-w-2xl">
            Scrape direct race cards or search live bookmaker &amp; racing portals via Firecrawl to extract real-time win/place odds, market movers, and speedmap settle positions.
          </p>
        </div>

        <button
          type="button"
          onClick={checkStatus}
          disabled={checkingStatus}
          className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1.5 cursor-pointer shrink-0 self-start sm:self-auto"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${checkingStatus ? 'animate-spin' : ''}`}
          />
          Verify Firecrawl Key
        </button>
      </div>

      {/* Status Strip */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-3.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
        <span className="font-mono font-semibold text-slate-900">
          {endpoint}
        </span>
        <span aria-hidden="true">·</span>
        <span>Endpoints: /v1/search &amp; /v1/scrape</span>
        <span aria-hidden="true">·</span>
        <span
          className={
            hasKey
              ? 'text-emerald-700 font-medium'
              : 'text-amber-700 font-medium'
          }
        >
          {checkingStatus
            ? 'Checking FIRECRAWL_API_KEY...'
            : hasKey
            ? 'FIRECRAWL_API_KEY configured'
            : 'FIRECRAWL_API_KEY required'}
        </span>
      </div>

      {missingKey && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-amber-900 leading-relaxed">
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">
                Live Firecrawl scraping requires FIRECRAWL_API_KEY in Settings &gt; Secrets
              </p>
              <p className="text-amber-800 mt-0.5">
                Add{' '}
                <code className="font-mono px-1 py-0.5 bg-amber-100 rounded">
                  FIRECRAWL_API_KEY
                </code>{' '}
                to AI Studio Secrets so the server can authenticate with{' '}
                <code className="font-mono">api.firecrawl.dev</code>.
              </p>
            </div>
          </div>
          <a
            href="https://www.firecrawl.dev/app/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-xs font-medium text-amber-950 bg-amber-200/80 hover:bg-amber-200 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            Get Firecrawl Key
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* Control Form */}
      <form
        onSubmit={handleFetchIntel}
        className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
      >
        <div className="inline-flex p-1 bg-slate-100 rounded-lg gap-1">
          <button
            type="button"
            onClick={() => setMode('search')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md inline-flex items-center gap-1.5 cursor-pointer ${
              mode === 'search'
                ? 'bg-white text-slate-900'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            Search Race Odds &amp; Speedmap
          </button>
          <button
            type="button"
            onClick={() => setMode('scrape')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md inline-flex items-center gap-1.5 cursor-pointer ${
              mode === 'scrape'
                ? 'bg-white text-slate-900'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            Scrape Specific URL
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-3 space-y-1">
            <label className="block text-xs font-medium text-slate-700">
              Track / Meeting
            </label>
            <input
              type="text"
              value={track}
              onChange={(e) => setTrack(e.target.value)}
              placeholder="e.g. Ascot, Doomben, Flemington"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
              required
            />
          </div>

          <div className="md:col-span-2 space-y-1">
            <label className="block text-xs font-medium text-slate-700">
              Race #
            </label>
            <input
              type="number"
              min={1}
              max={15}
              value={raceNumber}
              onChange={(e) => setRaceNumber(Number(e.target.value) || 1)}
              className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
            />
          </div>

          <div className="md:col-span-3 space-y-1">
            <label className="block text-xs font-medium text-slate-700">
              Race Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
            />
          </div>

          {mode === 'search' ? (
            <div className="md:col-span-4 space-y-1">
              <label className="block text-xs font-medium text-slate-700">
                Custom Search Query (Optional)
              </label>
              <input
                type="text"
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
                placeholder="Auto-built from track + race + date if blank..."
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
              />
            </div>
          ) : (
            <div className="md:col-span-4 space-y-1">
              <label className="block text-xs font-medium text-slate-700">
                Racing / Odds / Speedmap URL
              </label>
              <input
                type="url"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://www.racing.com/form/..."
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                required
              />
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading || (mode === 'scrape' && !targetUrl.trim())}
            className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg inline-flex items-center gap-2 cursor-pointer"
          >
            <Flame className="w-4 h-4" />
            {loading
              ? 'Crawling Market & Speedmap...'
              : mode === 'scrape'
              ? 'Scrape Odds & Speedmap'
              : 'Search Market & Speedmap'}
          </button>
        </div>
      </form>

      {error && !missingKey && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
          {error}
        </div>
      )}

      {feedback && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <div className="h-6 w-1/3 bg-slate-100 rounded animate-pulse" />
          <div className="h-44 w-full bg-slate-100 rounded animate-pulse" />
        </div>
      ) : (
        intel && (
          <FirecrawlIntelPanel
            intel={intel}
            onPredictTrifecta={onSendToTrifecta}
            onIndexToRag={handleIndexToRag}
            onCommitToDolt={handleCommitToDolt}
            indexingRag={indexingRag}
            committingDolt={committingDolt}
          />
        )
      )}
    </div>
  );
};
