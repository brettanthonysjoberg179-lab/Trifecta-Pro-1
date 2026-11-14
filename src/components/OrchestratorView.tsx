import React, { useEffect, useState } from 'react';
import {
  Award,
  Check,
  Copy,
  ExternalLink,
  Flame,
  Globe,
  Play,
  Plus,
  Search,
} from 'lucide-react';
import type {
  DoltCommit,
  OrchestratorOutput,
  RacingCardData,
  RagDocument,
  RagSearchResult,
  SearchGroundingResult,
} from '../types/engine';
import { MarkdownRenderer } from './MarkdownRenderer';

interface OrchestratorViewProps {
  commits: DoltCommit[];
  ragDocuments: RagDocument[];
  externalRacingCard?: { card: RacingCardData; biasNote?: string; key: number } | null;
  onOpenFormFav: () => void;
  onOpenFirecrawl: () => void;
  onOpenTrifecta: () => void;
}

export const OrchestratorView: React.FC<OrchestratorViewProps> = ({
  commits,
  ragDocuments,
  externalRacingCard,
  onOpenFormFav,
  onOpenFirecrawl,
  onOpenTrifecta,
}) => {
  const mode = 'RACING' as const;
  const [selectedRef, setSelectedRef] = useState<string>('');
  const [rawJson, setRawJson] = useState<string>('');
  const [ragContext, setRagContext] = useState<string>('');
  const [ragMatches, setRagMatches] = useState<RagSearchResult[]>([]);
  const [searchingRag, setSearchingRag] = useState(false);

  // Google Search Grounding state
  const [webQuery, setWebQuery] = useState<string>(
    'Morphettville racecourse 1200m track bias Good 4'
  );
  const [webGrounding, setWebGrounding] = useState<SearchGroundingResult | null>(
    null
  );
  const [searchingWeb, setSearchingWeb] = useState(false);

  const [outputTab, setOutputTab] = useState<'preview' | 'json'>('preview');
  const [output, setOutput] = useState<OrchestratorOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const matchingCommits = commits.filter((c) => c.table === 'racing_cards');

  useEffect(() => {
    const currentValid = matchingCommits.find((c) => c.branch_ref === selectedRef);
    const target = currentValid ?? matchingCommits[0];
    if (target) {
      setSelectedRef(target.branch_ref);
      setRawJson(JSON.stringify(target.data, null, 2));
      const matchingDocs = ragDocuments.filter((d) => d.domain === 'RACING');
      setRagContext(
        matchingDocs
          .slice(0, 2)
          .map((d) => d.content)
          .join('\n')
      );
      setRagMatches([]);
      setWebGrounding(null);
      setWebQuery('Morphettville racecourse 1200m track bias Good 4');
    }
  }, [commits]);

  useEffect(() => {
    if (!externalRacingCard) return;
    setSelectedRef(
      `formfav-mcp@${externalRacingCard.card.meeting.toLowerCase().replace(/\s+/g, '-')}-r${externalRacingCard.card.race_number}`
    );
    setRawJson(JSON.stringify(externalRacingCard.card, null, 2));
    if (externalRacingCard.biasNote) {
      setRagContext((prev) =>
        prev.trim()
          ? `${externalRacingCard.biasNote}\n\n${prev.trim()}`
          : externalRacingCard.biasNote!
      );
    }
  }, [externalRacingCard]);

  const handleSelectCommit = (branchRef: string) => {
    setSelectedRef(branchRef);
    const found = commits.find((c) => c.branch_ref === branchRef);
    if (found) {
      setRawJson(JSON.stringify(found.data, null, 2));
    }
  };

  const handleRetrieveRag = async () => {
    setSearchingRag(true);
    setError(null);
    try {
      const res = await fetch('/api/rag/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: rawJson,
          domain: mode,
          topK: 2,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'RAG search failed.');
      const results = (body.results || []) as RagSearchResult[];
      setRagMatches(results);
      if (results.length > 0) {
        setRagContext(
          results.map((r) => `[${r.document.title}] ${r.document.content}`).join('\n')
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'RAG retrieval failed.');
    } finally {
      setSearchingRag(false);
    }
  };

  const handleSearchGrounding = async () => {
    if (!webQuery.trim()) return;
    setSearchingWeb(true);
    setError(null);
    try {
      const res = await fetch('/api/search/grounding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: webQuery.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Google Search grounding failed.');
      setWebGrounding(body.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Search lookup failed.');
    } finally {
      setSearchingWeb(false);
    }
  };

  const handleAppendWebToRag = () => {
    if (!webGrounding) return;
    const sourcesNote =
      webGrounding.sources.length > 0
        ? ` Sources: ${webGrounding.sources.map((s) => s.uri).join(', ')}`
        : '';
    const snippet = `[Google Search Grounding] ${webGrounding.answer}${sourcesNote}`;
    setRagContext((prev) => (prev.trim() ? `${prev.trim()}\n\n${snippet}` : snippet));
  };

  const handleRunOrchestrator = async () => {
    setLoading(true);
    setError(null);
    try {
      let parsedData: unknown;
      try {
        parsedData = JSON.parse(rawJson);
      } catch {
        throw new Error('Structured Raw Data must be valid JSON.');
      }

      const res = await fetch('/api/orchestrator/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          dolt_branch_ref: selectedRef || `${mode.toLowerCase()}@manual`,
          raw_data: parsedData,
          rag_context: ragContext,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Orchestrator execution failed.');
      }
      setOutput(body.output);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Execution error.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1600);
    } catch {
      // ignore clipboard restrictions
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Aus Gallops Race Tips Orchestrator
          </h1>
          <p className="mt-1 text-sm text-slate-600 max-w-2xl">
            Synthesize FormFav MCP race cards, Dolt win-rate splits, Track Bias RAG, and live web conditions into Australian Thoroughbred race previews, top 4 selections, and value trifecta boxes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-auto">
          <button
            type="button"
            onClick={onOpenFormFav}
            className="px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer whitespace-nowrap"
          >
            FormFav MCP Cards
          </button>
          <button
            type="button"
            onClick={onOpenFirecrawl}
            className="px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Flame className="w-3.5 h-3.5" />
            Firecrawl Odds &amp; Map
          </button>
          <button
            type="button"
            onClick={onOpenTrifecta}
            className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Award className="w-3.5 h-3.5" />
            Trifecta Studio
          </button>
        </div>
      </div>

      {/* Main Two-Column Workbench */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Input Configuration */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              1. Aus Gallops Field, Track Bias &amp; Search
            </h2>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {matchingCommits.length} race commits
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="dolt-commit-select"
                className="text-xs font-medium text-slate-700"
              >
                Dolt Branch Reference (`racing-daily`)
              </label>
              <button
                type="button"
                onClick={onOpenFormFav}
                className="text-xs font-medium text-teal-700 hover:text-teal-800 cursor-pointer"
              >
                Pull Live AU Gallops
              </button>
            </div>
            <select
              id="dolt-commit-select"
              value={selectedRef}
              onChange={(e) => handleSelectCommit(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
            >
              {matchingCommits.map((commit) => (
                <option key={commit.branch_ref} value={commit.branch_ref}>
                  {commit.branch_ref} — {commit.message}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="raw-json-input"
                className="text-xs font-medium text-slate-700"
              >
                Aus Gallops Structured Data (FormFav + Dolt)
              </label>
              <span className="text-xs text-slate-500">JSON</span>
            </div>
            <textarea
              id="raw-json-input"
              rows={8}
              value={rawJson}
              onChange={(e) => setRawJson(e.target.value)}
              spellCheck={false}
              className="w-full px-3 py-2.5 text-xs font-mono leading-relaxed bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700 focus:bg-white"
            />
          </div>

          {/* Google Search Grounding Panel */}
          <div className="pt-2 border-t border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="web-grounding-query"
                className="text-xs font-medium text-slate-700 inline-flex items-center gap-1.5"
              >
                <Globe className="w-3.5 h-3.5 text-teal-700" />
                Google Search Grounding (gemini-4-hydrogen)
              </label>
            </div>
            <div className="flex gap-2">
              <input
                id="web-grounding-query"
                type="text"
                value={webQuery}
                onChange={(e) => setWebQuery(e.target.value)}
                placeholder="Verify live stats, regulations, or track conditions..."
                className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
              />
              <button
                type="button"
                onClick={handleSearchGrounding}
                disabled={searchingWeb || !webQuery.trim()}
                className="px-3 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
              >
                {searchingWeb ? 'Searching...' : 'Search Web'}
              </button>
            </div>

            {webGrounding && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <p className="text-xs text-slate-700 leading-relaxed line-clamp-4">
                  {webGrounding.answer}
                </p>
                {webGrounding.sources.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-slate-200">
                    {webGrounding.sources.slice(0, 3).map((src) => (
                      <a
                        key={src.uri}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-[11px] text-teal-800 hover:underline truncate"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        <span className="truncate">{src.title}</span>
                      </a>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleAppendWebToRag}
                  className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 cursor-pointer pt-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Append to RAG Context
                </button>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="rag-context-input"
                className="text-xs font-medium text-slate-700"
              >
                Grounded RAG Context
              </label>
              <button
                type="button"
                onClick={handleRetrieveRag}
                disabled={searchingRag}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 hover:text-teal-800 cursor-pointer disabled:opacity-50"
              >
                <Search className="w-3.5 h-3.5" />
                {searchingRag ? 'Retrieving...' : 'Semantic Lookup'}
              </button>
            </div>
            <textarea
              id="rag-context-input"
              rows={4}
              value={ragContext}
              onChange={(e) => setRagContext(e.target.value)}
              className="w-full px-3 py-2.5 text-xs leading-relaxed bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700 focus:bg-white"
            />
            {ragMatches.length > 0 && (
              <div className="mt-2 text-xs text-slate-500 space-y-1">
                {ragMatches.map((m) => (
                  <div
                    key={m.document.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{m.document.title}</span>
                    <span className="font-mono tabular-nums shrink-0">
                      {m.score.toFixed(3)} · {m.method}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleRunOrchestrator}
            disabled={loading}
            className="w-full py-2.5 px-4 inline-flex items-center justify-center gap-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
          >
            <Play className="w-4 h-4" />
            {loading ? 'Generating Aus Gallops Tips...' : 'Generate Race Preview & Tips'}
          </button>
        </section>

        {/* Right: Output Panel */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex p-1 bg-slate-100 rounded-lg gap-1">
              <button
                type="button"
                onClick={() => setOutputTab('preview')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  outputTab === 'preview'
                    ? 'bg-white text-slate-900'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Race Tips Preview
              </button>
              <button
                type="button"
                onClick={() => setOutputTab('json')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  outputTab === 'json'
                    ? 'bg-white text-slate-900'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                A2A JSON Schema
              </button>
            </div>

            {output && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleCopy('full-json', JSON.stringify(output, null, 2))
                  }
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 border border-slate-200 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedKey === 'full-json' ? (
                    <Check className="w-3.5 h-3.5 text-teal-700" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copiedKey === 'full-json' ? 'Copied' : 'Copy JSON'}
                </button>
                <button
                  type="button"
                  onClick={onOpenTrifecta}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Award className="w-3.5 h-3.5" />
                  Open Trifecta Studio
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="p-6 space-y-4">
              <div className="h-5 w-2/3 bg-slate-100 rounded animate-pulse" />
              <div className="h-4 w-full bg-slate-100 rounded animate-pulse" />
              <div className="h-4 w-5/6 bg-slate-100 rounded animate-pulse" />
              <div className="h-32 w-full bg-slate-100 rounded animate-pulse" />
            </div>
          ) : !output ? (
            <div className="p-10 text-center space-y-3">
              <p className="text-sm font-medium text-slate-900">
                No race preview generated yet
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                Select an Aus Gallops race commit or pull live fields from FormFav MCP, enrich with track bias RAG, and click Generate Race Preview &amp; Tips.
              </p>
            </div>
          ) : outputTab === 'preview' ? (
            <div className="divide-y divide-slate-200">
              {/* Metadata summary line (Zero-pill discipline) */}
              <div className="px-6 py-4 bg-slate-50 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                <span className="font-mono text-slate-900 font-medium">
                  {output.dolt_branch_ref}
                </span>
                <span aria-hidden="true">·</span>
                <span>Mode: {output.mode}</span>
                <span aria-hidden="true">·</span>
                <span>Target Keyword: {output.seo_target_keyword}</span>
                <span aria-hidden="true">·</span>
                <span>Next Agent: {output.next_a2a_agent}</span>
              </div>

              {/* Markdown Content */}
              <div className="p-6">
                <MarkdownRenderer content={output.markdown_content} />
              </div>

              {/* Downstream Delivery Payloads */}
              <div className="p-6 space-y-5 bg-slate-50/50">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <h3 className="text-xs font-semibold text-slate-900">
                      Gmail Subject Line
                    </h3>
                    <button
                      type="button"
                      onClick={() => handleCopy('gmail', output.gmail_subject_line)}
                      className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
                    >
                      {copiedKey === 'gmail' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-sm text-slate-800 font-medium">
                    {output.gmail_subject_line}
                  </p>
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-slate-900 mb-2">
                    Google Slides Summary Bullets
                  </h3>
                  <ul className="space-y-1.5 text-sm text-slate-700 list-disc pl-5">
                    {output.slides_summary_bullets.map((bullet, idx) => (
                      <li key={idx}>{bullet}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <h3 className="text-xs font-semibold text-slate-900">
                      Nanobanana Visual Prompt
                    </h3>
                    <button
                      type="button"
                      onClick={() => handleCopy('nano', output.nanobanana_prompt)}
                      className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
                    >
                      {copiedKey === 'nano' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-xs font-mono leading-relaxed text-slate-700 bg-white border border-slate-200 rounded-lg p-3">
                    {output.nanobanana_prompt}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-5">
              <pre className="p-4 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono leading-relaxed overflow-x-auto">
                {JSON.stringify(output, null, 2)}
              </pre>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
