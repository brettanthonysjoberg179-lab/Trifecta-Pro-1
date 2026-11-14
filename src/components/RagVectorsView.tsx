import React, { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type { RagDocument, RagSearchResult } from '../types/engine';

interface RagVectorsViewProps {
  documents: RagDocument[];
  onDocumentAdded: (doc: RagDocument) => void;
}

export const RagVectorsView: React.FC<RagVectorsViewProps> = ({
  documents,
  onDocumentAdded,
}) => {
  const [query, setQuery] = useState('Good 4 inside barrier bias 1200m');
  const [results, setResults] = useState<RagSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Add new Aus Gallops RAG doc form
  const [title, setTitle] = useState('');
  const [collection, setCollection] = useState('Aus Gallops Track Bias');
  const [content, setContent] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch('/api/rag/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          domain: 'RACING',
          topK: 5,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Vector search failed.');
      setResults(body.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search error.');
    } finally {
      setSearching(false);
    }
  };

  const handleAddDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch('/api/rag/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          collection: collection.trim() || 'Aus Gallops Track Bias',
          domain: 'RACING',
          content: content.trim(),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to add RAG note.');
      onDocumentAdded(body.document);
      setTitle('');
      setContent('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Indexing error.');
    } finally {
      setAdding(false);
    }
  };

  const visibleDocuments = documents.filter((d) => d.domain === 'RACING');

  return (
    <div className="space-y-6">
      <div className="pb-5 border-b border-slate-200">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Aus Gallops Track Bias RAG
        </h1>
        <p className="mt-1 text-sm text-slate-600 max-w-2xl">
          Query and index Australian Thoroughbred track bias splits, rail placement notes, speedmap patterns, and FormFav runner snapshots using Gemini embeddings (gemini-embedding-2).
        </p>
      </div>

      {/* Semantic Search Bar */}
      <form
        onSubmit={handleSearch}
        className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search track bias, barrier stats, rail out splits, or speedmap notes..."
              className="w-full pl-10 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
            />
          </div>

          <button
            type="submit"
            disabled={searching}
            className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
          >
            {searching ? 'Searching...' : 'Search Track Bias'}
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {error}
          </div>
        )}

        {results && (
          <div className="pt-2 border-t border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Ranked Aus Gallops Matches</span>
              <span className="font-mono tabular-nums">{results.length} matches</span>
            </div>
            {results.map((r) => (
              <div
                key={r.document.id}
                className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-900">
                    {r.document.title}
                  </span>
                  <span className="text-xs font-mono text-teal-800 font-medium tabular-nums shrink-0">
                    cos {r.score.toFixed(3)} · {r.method}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {r.document.collection} · AUS GALLOPS
                </p>
                <p className="text-sm text-slate-700 leading-relaxed pt-1">
                  {r.document.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </form>

      {/* Bottom Split: Indexed Corpus + Add Note */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Indexed Track Bias &amp; Form Notes
            </h2>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {visibleDocuments.length} chunks
            </span>
          </div>
          <div className="divide-y divide-slate-200">
            {visibleDocuments.map((doc) => (
              <div key={doc.id} className="p-5 space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {doc.title}
                  </h3>
                  <span className="text-xs font-mono text-slate-500 shrink-0">
                    {doc.has_embedding ? 'Vector Indexed' : 'Ready to Index'}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {doc.collection} · {doc.created_at.slice(0, 10)}
                </p>
                <p className="text-sm text-slate-700 leading-relaxed pt-1">
                  {doc.content}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">
            Index New Aus Gallops Note
          </h2>
          <form onSubmit={handleAddDoc} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Note Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Ascot 1200m Rail Out 6m Tempo Bias"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Collection
              </label>
              <input
                type="text"
                value={collection}
                onChange={(e) => setCollection(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Track Bias / Speedmap Note
              </label>
              <textarea
                rows={4}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Enter factual barrier strike rates, rail position impacts, sectional patterns, or runner notes..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                required
              />
            </div>

            <button
              type="submit"
              disabled={adding}
              className="w-full py-2 px-4 inline-flex items-center justify-center gap-1.5 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {adding ? 'Computing Embedding...' : 'Embed & Store Racing Note'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};
