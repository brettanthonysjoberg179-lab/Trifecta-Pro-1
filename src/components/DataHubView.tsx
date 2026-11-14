import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Award,
  Check,
  Database,
  ExternalLink,
  GitCommitHorizontal,
  Layers,
  Play,
  RefreshCw,
  Send,
} from 'lucide-react';
import {
  buildDoltCardFromRaceCard,
  buildRagNoteFromRaceCard,
  buildRagNoteFromRunner,
  buildRouterPromptFromItem,
  type DataHubActionItem,
  type DataHubActionKind,
  meetCardsToActionItems,
  meetingsToActionItems,
} from '../services/formfavBridge';
import {
  type ParsedAusSlateResult,
  parseAusGallopsSlate,
} from '../services/ausGallopsSlateParser';
import type {
  DoltCommit,
  FirecrawlRacingIntel,
  RacingCardData,
  RagDocument,
} from '../types/engine';
import { DoltStoreView } from './DoltStoreView';
import {
  type FirecrawlTargetRequest,
  FirecrawlView,
} from './FirecrawlView';
import { FormFavMcpView } from './FormFavMcpView';
import { RagVectorsView } from './RagVectorsView';
import { type TrifectaTargetRequest, TrifectaView } from './TrifectaView';

export type DataSubTab =
  | 'bridge'
  | 'formfav'
  | 'firecrawl'
  | 'trifecta'
  | 'dolt'
  | 'rag';

interface DataHubViewProps {
  initialSubTab: DataSubTab;
  branches: string[];
  commits: DoltCommit[];
  ragDocuments: RagDocument[];
  actionItems: DataHubActionItem[];
  onSetActionItems: React.Dispatch<React.SetStateAction<DataHubActionItem[]>>;
  onOpenCommitModal: () => void;
  onCommitCreated: (commit: DoltCommit) => void;
  onDocumentAdded: (doc: RagDocument) => void;
  onSendFormFavToOrchestrator: (card: RacingCardData, biasNote?: string) => void;
  onRoutePrompt: (promptText: string) => void;
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

export const DataHubView: React.FC<DataHubViewProps> = ({
  initialSubTab,
  branches,
  commits,
  ragDocuments,
  actionItems,
  onSetActionItems,
  onOpenCommitModal,
  onCommitCreated,
  onDocumentAdded,
  onSendFormFavToOrchestrator,
  onRoutePrompt,
}) => {
  const [subTab, setSubTab] = useState<DataSubTab>(initialSubTab);
  const [kindFilter, setKindFilter] = useState<'ALL' | DataHubActionKind>('ALL');
  const [syncDate, setSyncDate] = useState<string>(getSydneyTodayIso);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [missingKey, setMissingKey] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [loadingMeetFor, setLoadingMeetFor] = useState<string | null>(null);
  const [quickMeetTrack, setQuickMeetTrack] = useState<string>('');
  const [feedback, setFeedback] = useState<string | null>(null);

  // Optional target meeting/race to auto-open in FormFav MCP or Trifecta sub-tab
  const [inspectTarget, setInspectTarget] = useState<{
    date: string;
    track: string;
    race: number;
    key: number;
  } | null>(null);
  const [firecrawlTarget, setFirecrawlTarget] =
    useState<FirecrawlTargetRequest | null>(null);
  const [trifectaTarget, setTrifectaTarget] =
    useState<TrifectaTargetRequest | null>(null);

  // Live AU Gallops Slate & Results So Far parser state
  const [slateText, setSlateText] = useState('');
  const [parsedSlate, setParsedSlate] = useState<ParsedAusSlateResult | null>(
    null
  );
  const [showSlatePanel, setShowSlatePanel] = useState(false);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  const handleSyncLiveFeed = async () => {
    setSyncing(true);
    setSyncError(null);
    setFeedback(null);
    try {
      const res = await fetch('/api/formfav/feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: syncDate }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body.missing_api_key) setMissingKey(true);
        throw new Error(body.error || 'Failed to sync Aus Gallops feed.');
      }
      setMissingKey(false);
      const freshItems = meetingsToActionItems(
        body.date || syncDate,
        body.meetings || [],
        body.featuredCard || null
      );
      onSetActionItems((prev) => {
        const existingPinnedRunners = prev.filter(
          (i) => i.kind === 'RUNNER_CARD'
        );
        const merged = [...freshItems];
        for (const r of existingPinnedRunners) {
          if (!merged.some((m) => m.id === r.id)) {
            merged.push(r);
          }
        }
        return merged;
      });
      setFeedback(
        `Synced ${freshItems.length} Aus Gallops items from FormFav MCP (${body.date || syncDate}).`
      );
    } catch (err) {
      setSyncError(
        err instanceof Error ? err.message : 'Unable to sync FormFav feed.'
      );
    } finally {
      setSyncing(false);
    }
  };

  const updateItemStatus = (
    itemId: string,
    status: DataHubActionItem['status']
  ) => {
    onSetActionItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, status } : item))
    );
  };

  const ensureRaceCardForItem = async (item: DataHubActionItem) => {
    if (item.raceCard) return item.raceCard;
    const raceNum = item.raceNumber || item.meeting?.races?.[0]?.raceNumber || 1;
    const res = await fetch('/api/formfav/race-card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: item.date,
        track: item.slug || item.track,
        race: raceNum,
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      if (body.missing_api_key) setMissingKey(true);
      throw new Error(body.error || 'Failed to load race card from FormFav MCP.');
    }
    return body.card;
  };

  const handleCommitItemToDolt = async (item: DataHubActionItem) => {
    setBusyItemId(item.id);
    setSyncError(null);
    setFeedback(null);
    try {
      const card = await ensureRaceCardForItem(item);
      const mapped = buildDoltCardFromRaceCard(card);
      const res = await fetch('/api/dolt/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch: 'racing-daily',
          message: `DataHub Bridge: ${card.track} R${card.raceNumber} (${card.date})`,
          author: 'formfav-bridge',
          table: 'racing_cards',
          record_id: `${card.track.toLowerCase().replace(/\s+/g, '-')}-r${card.raceNumber}-${card.date}`,
          data: mapped,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Dolt commit failed.');
      onCommitCreated(body.commit);
      updateItemStatus(item.id, 'COMMITTED_DOLT');
      setFeedback(`Committed ${body.commit.branch_ref} to Dolt racing-daily.`);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Commit error.');
    } finally {
      setBusyItemId(null);
    }
  };

  const handleIndexItemToRag = async (item: DataHubActionItem) => {
    setBusyItemId(item.id);
    setSyncError(null);
    setFeedback(null);
    try {
      const card = await ensureRaceCardForItem(item);
      const ragPayload =
        item.kind === 'RUNNER_CARD' && item.runner
          ? buildRagNoteFromRunner(card, item.runner)
          : buildRagNoteFromRaceCard(card);

      const res = await fetch('/api/rag/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ragPayload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'RAG indexing failed.');
      onDocumentAdded(body.document);
      updateItemStatus(item.id, 'INDEXED_RAG');
      setFeedback(`Indexed "${ragPayload.title}" into RAG Vector Store.`);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'RAG index error.');
    } finally {
      setBusyItemId(null);
    }
  };

  const handleAnalyzeItem = async (item: DataHubActionItem) => {
    setBusyItemId(item.id);
    setSyncError(null);
    try {
      const card = await ensureRaceCardForItem(item);
      const mapped = buildDoltCardFromRaceCard(card);
      updateItemStatus(item.id, 'ANALYZED');
      onSendFormFavToOrchestrator(mapped);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Orchestrator handoff error.');
    } finally {
      setBusyItemId(null);
    }
  };

  const handleInspectInFormFav = (item: DataHubActionItem) => {
    const raceNum =
      item.raceNumber ||
      item.meeting?.races?.find((r) => !r.abandoned)?.raceNumber ||
      1;
    setInspectTarget({
      date: item.date,
      track: item.slug || item.track,
      race: raceNum,
      key: Date.now(),
    });
    setSubTab('formfav');
  };

  const handleOpenTrifectaForItem = (item: DataHubActionItem) => {
    const raceNum =
      item.raceNumber ||
      item.meeting?.races?.find((r) => !r.abandoned)?.raceNumber ||
      1;
    setTrifectaTarget({
      source: 'formfav_mcp',
      date: item.date,
      track: item.slug || item.track,
      race: raceNum,
      raceCard: item.raceCard,
      key: Date.now(),
    });
    setSubTab('trifecta');
  };

  const handleFirecrawlToTrifecta = (intel: FirecrawlRacingIntel) => {
    setTrifectaTarget({
      source: 'custom_input',
      date: intel.date,
      track: intel.track,
      race: intel.race_number || 1,
      firecrawlIntel: intel,
      key: Date.now(),
    });
    setSubTab('trifecta');
  };

  const handlePinToBridge = (item: DataHubActionItem) => {
    onSetActionItems((prev) => {
      const filtered = prev.filter((p) => p.id !== item.id);
      return [item, ...filtered];
    });
    setFeedback(`Pinned "${item.title}" to DataHub Action Bridge.`);
  };

  const handlePushMeetCardsToBridge = (
    incomingItems: DataHubActionItem[],
    summaryLabel?: string
  ) => {
    onSetActionItems((prev) => {
      const incomingIds = new Set(incomingItems.map((i) => i.id));
      const preserved = prev.filter((p) => !incomingIds.has(p.id));
      return [...incomingItems, ...preserved];
    });
    setFeedback(
      summaryLabel ||
        `Added ${incomingItems.length} race field & runner card items to Action Bridge.`
    );
  };

  const handleLoadAllMeetCards = async (params: {
    date: string;
    track: string;
    raceNumbers?: number[];
    sourceId: string;
  }) => {
    if (!params.track.trim()) return;
    setLoadingMeetFor(params.sourceId);
    setSyncError(null);
    setFeedback(null);
    try {
      const res = await fetch('/api/formfav/meet-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: params.date,
          track: params.track.trim(),
          raceNumbers: params.raceNumbers,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body.missing_api_key) setMissingKey(true);
        throw new Error(
          body.error || 'Failed to load all runner cards for meet.'
        );
      }
      setMissingKey(false);
      const cards = body.raceCards || [];
      const newItems = meetCardsToActionItems(cards);
      handlePushMeetCardsToBridge(
        newItems,
        `Loaded ${body.totalRunners ?? 0} runner cards across ${body.racesCount ?? cards.length} races for ${body.track || params.track} (${body.date || params.date}).`
      );
      if (kindFilter === 'MEETING') {
        setKindFilter('RUNNER_CARD');
      }
    } catch (err) {
      setSyncError(
        err instanceof Error ? err.message : 'Unable to load meet runner cards.'
      );
    } finally {
      setLoadingMeetFor(null);
    }
  };

  const visibleItems = actionItems.filter((item) =>
    kindFilter === 'ALL' ? true : item.kind === kindFilter
  );

  const racingCommits = commits.filter((c) => c.table === 'racing_cards');

  return (
    <div className="space-y-6">
      <div className="inline-flex p-1 bg-slate-100 rounded-lg gap-1 overflow-x-auto">
        {(
          [
            { id: 'bridge', label: 'Action Bridge' },
            { id: 'formfav', label: 'FormFav MCP' },
            { id: 'firecrawl', label: 'Firecrawl Odds & Map' },
            { id: 'trifecta', label: 'Trifecta' },
            { id: 'dolt', label: 'Dolt Racing' },
            { id: 'rag', label: 'Track Bias RAG' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSubTab(tab.id)}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              subTab === tab.id
                ? 'bg-white text-slate-900'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {subTab === 'bridge' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-slate-200">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                DataHub Action Bridge
              </h1>
              <p className="mt-1 text-sm text-slate-600 max-w-2xl">
                Real-time Australian Gallops meetings, event fields, and runner form cards streamed from FormFav MCP as actionable pipeline items.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <input
                type="date"
                value={syncDate}
                onChange={(e) => setSyncDate(e.target.value)}
                className="px-3 py-2 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
              />
              <button
                type="button"
                onClick={handleSyncLiveFeed}
                disabled={syncing}
                className="px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`}
                />
                {syncing ? 'Syncing FormFav...' : 'Sync Aus Gallops Feed'}
              </button>
            </div>
          </div>

          {missingKey && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 text-xs text-amber-900 leading-relaxed">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">
                    Live FormFav MCP feed requires FORMFAV_API_KEY in Settings &gt; Secrets
                  </p>
                  <p className="text-amber-800 mt-0.5">
                    Generate a free FormFav API key and add it as{' '}
                    <code className="font-mono px-1 py-0.5 bg-amber-100 rounded">
                      FORMFAV_API_KEY
                    </code>{' '}
                    in Secrets to stream live Australian Gallops meetings and runner cards.
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

          {syncError && !missingKey && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
              {syncError}
            </div>
          )}

          {feedback && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{feedback}</span>
            </div>
          )}

          {/* Quick Meet Runner Cards Loader & Filter Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="inline-flex p-1 bg-slate-100 rounded-lg gap-1 self-start">
              {(
                [
                  { id: 'ALL', label: 'All Items' },
                  { id: 'MEETING', label: 'Meetings' },
                  { id: 'RACE_FIELD', label: 'Event Fields' },
                  { id: 'RUNNER_CARD', label: 'Runner Cards' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setKindFilter(tab.id)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    kindFilter === tab.id
                      ? 'bg-white text-slate-900'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleLoadAllMeetCards({
                    date: syncDate,
                    track: quickMeetTrack,
                    sourceId: '__quick_meet__',
                  });
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={quickMeetTrack}
                  onChange={(e) => setQuickMeetTrack(e.target.value)}
                  placeholder="Track slug (e.g. randwick)"
                  className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700 w-44"
                />
                <button
                  type="submit"
                  disabled={!quickMeetTrack.trim() || loadingMeetFor !== null}
                  className="px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Layers className="w-3.5 h-3.5" />
                  {loadingMeetFor === '__quick_meet__'
                    ? 'Loading Meet...'
                    : 'Get All Meet Runner Cards'}
                </button>
              </form>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                {visibleItems.length} items · {racingCommits.length} Dolt commits
              </span>
            </div>
          </div>

          {/* Actionable Items Queue */}
          {visibleItems.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
              <p className="text-sm font-semibold text-slate-900">
                No live FormFav items synced in the DataHub queue yet
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                Click Sync Aus Gallops Feed above to pull today&apos;s Australian Thoroughbred meetings and event fields, or open the FormFav MCP tab to pin individual runner form cards.
              </p>
              <div className="pt-1 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={handleSyncLiveFeed}
                  disabled={syncing}
                  className="px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
                >
                  Sync Aus Gallops Feed
                </button>
                <button
                  type="button"
                  onClick={() => setSubTab('formfav')}
                  className="px-4 py-2 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Open FormFav MCP Explorer
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden">
              {visibleItems.map((item) => {
                const isBusy = busyItemId === item.id;
                return (
                  <div
                    key={item.id}
                    className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono font-semibold text-teal-800">
                          {item.kind}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {item.date}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-slate-700">
                          Status: {item.status}
                        </span>
                      </div>
                      <h2 className="text-sm font-semibold text-slate-900 truncate">
                        {item.title}
                      </h2>
                      <p className="text-xs text-slate-600">{item.subtitle}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {item.kind === 'MEETING' && (
                        <button
                          type="button"
                          disabled={loadingMeetFor !== null}
                          onClick={() =>
                            handleLoadAllMeetCards({
                              date: item.date,
                              track: item.slug || item.track,
                              raceNumbers: item.meeting?.races
                                ?.filter((r) => !r.abandoned)
                                .map((r) => r.raceNumber),
                              sourceId: item.id,
                            })
                          }
                          className="px-2.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Layers className="w-3.5 h-3.5" />
                          {loadingMeetFor === item.id
                            ? 'Loading Cards...'
                            : 'Load All Runner Cards'}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleInspectInFormFav(item)}
                        className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                      >
                        Inspect Card
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleCommitItemToDolt(item)}
                        className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <GitCommitHorizontal className="w-3.5 h-3.5" />
                        Commit Dolt
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleIndexItemToRag(item)}
                        className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Database className="w-3.5 h-3.5" />
                        Index RAG
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleOpenTrifectaForItem(item)}
                        className="px-2.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Award className="w-3.5 h-3.5" />
                        Trifecta
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleAnalyzeItem(item)}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Race Tips
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          onRoutePrompt(buildRouterPromptFromItem(item))
                        }
                        className="px-2.5 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Route A2A
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Live AU Gallops Results So Far & Next-to-Go Slate Parser */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xs font-semibold text-slate-900">
                  Live AU Gallops Results So Far &amp; Upcoming Slate Parser
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Paste TAB/meeting results &amp; upcoming race times — automatically filters out NZ/overseas tracks and launches Trifecta, FormFav, or Firecrawl on any remaining AU race.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSlatePanel((prev) => !prev)}
                className="px-3 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer whitespace-nowrap"
              >
                {showSlatePanel ? 'Hide Slate Parser' : 'Paste AU Results Slate'}
              </button>
            </div>

            {showSlatePanel && (
              <div className="p-5 space-y-4">
                <div className="space-y-2">
                  <textarea
                    rows={5}
                    value={slateText}
                    onChange={(e) => setSlateText(e.target.value)}
                    placeholder="Paste meeting blocks (e.g. Sandown / Australia / 10,12,3 / 15:15 ...). Non-Australia meetings such as New Zealand are automatically excluded."
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700 focus:bg-white"
                  />
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-500">
                      Parses completed top-3 results (`10,12,3`), `CLSD`/`SUS`/`ABND` statuses, and upcoming race times.
                    </span>
                    <div className="flex items-center gap-2">
                      {parsedSlate && (
                        <button
                          type="button"
                          onClick={() => {
                            setSlateText('');
                            setParsedSlate(null);
                          }}
                          className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={!slateText.trim()}
                        onClick={() =>
                          setParsedSlate(parseAusGallopsSlate(slateText))
                        }
                        className="px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg cursor-pointer"
                      >
                        Parse Aus Gallops Slate
                      </button>
                    </div>
                  </div>
                </div>

                {parsedSlate && (
                  <div className="space-y-3 pt-2 border-t border-slate-200">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-600 tabular-nums">
                      <span className="font-semibold text-slate-900">
                        {parsedSlate.meetings.length} Australian meetings parsed
                      </span>
                      {parsedSlate.excludedNonAusTracks.length > 0 && (
                        <span className="text-slate-500">
                          Excluded non-AU:{' '}
                          {parsedSlate.excludedNonAusTracks.join(', ')}
                        </span>
                      )}
                    </div>

                    {parsedSlate.meetings.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        No Australian meeting blocks detected. Ensure track names are followed by &quot;Australia&quot;.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {parsedSlate.meetings.map((m) => (
                          <div
                            key={m.track}
                            className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-bold text-slate-900">
                                {m.track}
                              </span>
                              <span className="text-xs font-mono text-slate-500 tabular-nums">
                                {m.completedCount} results · {m.upcomingCount} upcoming
                              </span>
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                              {m.races.map((r) => {
                                if (r.status === 'RESULT') {
                                  return (
                                    <span
                                      key={r.raceNumber}
                                      className="px-2 py-1 text-[11px] font-mono tabular-nums bg-emerald-50 border border-emerald-200 text-emerald-900 rounded"
                                    >
                                      R{r.raceNumber}: {r.trifectaResult}
                                    </span>
                                  );
                                }
                                if (r.status === 'UPCOMING') {
                                  return (
                                    <div
                                      key={r.raceNumber}
                                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-mono tabular-nums bg-white border border-slate-300 rounded"
                                    >
                                      <span className="font-semibold text-slate-900">
                                        R{r.raceNumber} {r.startTime}
                                      </span>
                                      <button
                                        type="button"
                                        title={`Predict Trifecta for ${m.track} R${r.raceNumber}`}
                                        onClick={() => {
                                          setTrifectaTarget({
                                            source: 'formfav_mcp',
                                            date: syncDate,
                                            track: m.track,
                                            race: r.raceNumber,
                                            key: Date.now(),
                                          });
                                          setSubTab('trifecta');
                                        }}
                                        className="text-teal-700 hover:text-teal-900 font-sans font-semibold underline underline-offset-2 ml-1 cursor-pointer"
                                      >
                                        Trifecta
                                      </button>
                                      <button
                                        type="button"
                                        title={`Inspect FormFav card for ${m.track} R${r.raceNumber}`}
                                        onClick={() => {
                                          setInspectTarget({
                                            date: syncDate,
                                            track: m.track,
                                            race: r.raceNumber,
                                            key: Date.now(),
                                          });
                                          setSubTab('formfav');
                                        }}
                                        className="text-slate-600 hover:text-slate-900 font-sans underline underline-offset-2 ml-1 cursor-pointer"
                                      >
                                        Form
                                      </button>
                                      <button
                                        type="button"
                                        title={`Firecrawl odds & speedmap for ${m.track} R${r.raceNumber}`}
                                        onClick={() => {
                                          setFirecrawlTarget({
                                            date: syncDate,
                                            track: m.track,
                                            raceNumber: r.raceNumber,
                                            key: Date.now(),
                                          });
                                          setSubTab('firecrawl');
                                        }}
                                        className="text-slate-600 hover:text-slate-900 font-sans underline underline-offset-2 ml-1 cursor-pointer"
                                      >
                                        Odds
                                      </button>
                                    </div>
                                  );
                                }
                                return (
                                  <span
                                    key={r.raceNumber}
                                    className="px-2 py-1 text-[11px] font-mono tabular-nums bg-slate-200/70 text-slate-600 rounded"
                                  >
                                    R{r.raceNumber}: {r.status}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Dolt Racing Branch Quick Actions */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-xs font-semibold text-slate-900">
                Versioned Dolt Racing Records (racing-daily)
              </h2>
              <button
                type="button"
                onClick={() => setSubTab('dolt')}
                className="text-xs font-medium text-teal-700 hover:text-teal-800 cursor-pointer"
              >
                Open Dolt Store
              </button>
            </div>
            <div className="divide-y divide-slate-200">
              {racingCommits.slice(0, 3).map((commit) => {
                const card = commit.data as RacingCardData;
                return (
                  <div
                    key={commit.branch_ref}
                    className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="text-xs space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-slate-900">
                          {commit.branch_ref}
                        </span>
                        <span className="text-slate-300" aria-hidden="true">
                          ·
                        </span>
                        <span className="font-medium text-slate-800">
                          {card.meeting} R{card.race_number} ({card.distance} ·{' '}
                          {card.track})
                        </span>
                      </div>
                      <p className="text-slate-500">
                        {card.runners.length} runners · {commit.message}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSendFormFavToOrchestrator(card)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Race Tips Preview
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {subTab === 'formfav' && (
        <FormFavMcpView
          initialTarget={inspectTarget}
          onCommitCreated={onCommitCreated}
          onSendToOrchestrator={onSendFormFavToOrchestrator}
          onPinToDataHub={handlePinToBridge}
          onPushMeetCardsToDataHub={handlePushMeetCardsToBridge}
        />
      )}

      {subTab === 'firecrawl' && (
        <FirecrawlView
          initialTarget={firecrawlTarget}
          onCommitCreated={onCommitCreated}
          onDocumentAdded={onDocumentAdded}
          onSendToTrifecta={handleFirecrawlToTrifecta}
        />
      )}

      {subTab === 'trifecta' && (
        <TrifectaView commits={commits} initialTarget={trifectaTarget} />
      )}

      {subTab === 'dolt' && (
        <DoltStoreView
          branches={branches}
          commits={commits}
          onOpenCommitModal={onOpenCommitModal}
        />
      )}

      {subTab === 'rag' && (
        <RagVectorsView
          documents={ragDocuments}
          onDocumentAdded={onDocumentAdded}
        />
      )}
    </div>
  );
};
