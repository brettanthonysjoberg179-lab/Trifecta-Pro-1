import { useEffect, useState } from 'react';
import { ChatView } from './components/ChatView';
import { CommitModal } from './components/CommitModal';
import { DataHubView, type DataSubTab } from './components/DataHubView';
import { OrchestratorView } from './components/OrchestratorView';
import { RouterView } from './components/RouterView';
import { type ActiveTab, TopNav } from './components/TopNav';
import { TrifectaView } from './components/TrifectaView';
import type { DataHubActionItem } from './services/formfavBridge';
import type {
  DoltCommit,
  EngineState,
  RacingCardData,
  RagDocument,
} from './types/engine';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('orchestrator');
  const [dataSubTab, setDataSubTab] = useState<DataSubTab>('bridge');
  const [state, setState] = useState<EngineState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [commitModalOpen, setCommitModalOpen] = useState(false);
  const [actionItems, setActionItems] = useState<DataHubActionItem[]>([]);
  const [routerPrompt, setRouterPrompt] = useState<{
    text: string;
    key: number;
  } | null>(null);
  const [externalRacingCard, setExternalRacingCard] = useState<{
    card: RacingCardData;
    biasNote?: string;
    key: number;
  } | null>(null);

  const fetchState = async () => {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) throw new Error('Failed to load engine state.');
      const data = (await res.json()) as EngineState;
      setState(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to reach backend.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchState();
  }, []);

  const handleCommitCreated = (commit: DoltCommit) => {
    setState((prev) => {
      if (!prev) return prev;
      const branches = prev.branches.includes(commit.branch)
        ? prev.branches
        : [...prev.branches, commit.branch];
      return {
        ...prev,
        branches,
        commits: [commit, ...prev.commits],
      };
    });
  };

  const handleRagDocAdded = (doc: RagDocument) => {
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rag_documents: [doc, ...prev.rag_documents],
      };
    });
  };

  const handleSendFormFavToOrchestrator = (
    card: RacingCardData,
    biasNote?: string
  ) => {
    setExternalRacingCard({ card, biasNote, key: Date.now() });
    setActiveTab('orchestrator');
  };

  const handleOpenFormFav = () => {
    setDataSubTab('formfav');
    setActiveTab('data');
  };

  const handleOpenFirecrawl = () => {
    setDataSubTab('firecrawl');
    setActiveTab('data');
  };

  const handleRoutePrompt = (promptText: string) => {
    setRouterPrompt({ text: promptText, key: Date.now() });
    setActiveTab('router');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <TopNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenCommitModal={() => setCommitModalOpen(true)}
      />

      <main className="flex-1 w-full max-w-[1440px] mx-auto px-6 py-8">
        {loading ? (
          <div className="space-y-6">
            <div className="h-8 w-64 bg-slate-200 rounded animate-pulse" />
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 h-96 bg-white border border-slate-200 rounded-xl animate-pulse" />
              <div className="lg:col-span-7 h-96 bg-white border border-slate-200 rounded-xl animate-pulse" />
            </div>
          </div>
        ) : loadError || !state ? (
          <div className="bg-white border border-red-200 rounded-xl p-6 text-sm text-red-700 flex items-center justify-between">
            <span>{loadError || 'Engine state unavailable.'}</span>
            <button
              type="button"
              onClick={fetchState}
              className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {activeTab === 'orchestrator' && (
              <OrchestratorView
                commits={state.commits}
                ragDocuments={state.rag_documents}
                externalRacingCard={externalRacingCard}
                onOpenFormFav={handleOpenFormFav}
                onOpenFirecrawl={handleOpenFirecrawl}
                onOpenTrifecta={() => setActiveTab('trifecta')}
              />
            )}

            {activeTab === 'trifecta' && (
              <TrifectaView commits={state.commits} />
            )}

            {activeTab === 'router' && (
              <RouterView initialPrompt={routerPrompt} />
            )}

            {activeTab === 'data' && (
              <DataHubView
                initialSubTab={dataSubTab}
                branches={state.branches}
                commits={state.commits}
                ragDocuments={state.rag_documents}
                actionItems={actionItems}
                onSetActionItems={setActionItems}
                onOpenCommitModal={() => setCommitModalOpen(true)}
                onCommitCreated={handleCommitCreated}
                onDocumentAdded={handleRagDocAdded}
                onSendFormFavToOrchestrator={handleSendFormFavToOrchestrator}
                onRoutePrompt={handleRoutePrompt}
              />
            )}

            {activeTab === 'chat' && <ChatView />}
          </>
        )}
      </main>

      <CommitModal
        isOpen={commitModalOpen}
        onClose={() => setCommitModalOpen(false)}
        onCommitCreated={handleCommitCreated}
      />
    </div>
  );
}
