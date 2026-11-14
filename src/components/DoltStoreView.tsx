import React, { useMemo, useState } from 'react';
import { GitCommitHorizontal, Plus, Search } from 'lucide-react';
import type { DoltCommit, RacingCardData } from '../types/engine';

interface DoltStoreViewProps {
  branches: string[];
  commits: DoltCommit[];
  onOpenCommitModal: () => void;
}

export const DoltStoreView: React.FC<DoltStoreViewProps> = ({
  branches,
  commits,
  onOpenCommitModal,
}) => {
  const racingCommits = useMemo(
    () => commits.filter((c) => c.table === 'racing_cards'),
    [commits]
  );

  const racingBranches = useMemo(() => {
    const set = new Set<string>(['racing-daily']);
    for (const c of racingCommits) set.add(c.branch);
    return branches.filter((b) => set.has(b));
  }, [branches, racingCommits]);

  const [branchFilter, setBranchFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCommitHash, setSelectedCommitHash] = useState<string>(
    racingCommits[0]?.hash ?? ''
  );

  const filteredCommits = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return racingCommits.filter((c) => {
      if (branchFilter !== 'ALL' && c.branch !== branchFilter) return false;
      if (!q) return true;
      return (
        c.branch_ref.toLowerCase().includes(q) ||
        c.message.toLowerCase().includes(q) ||
        JSON.stringify(c.data).toLowerCase().includes(q)
      );
    });
  }, [racingCommits, branchFilter, searchQuery]);

  const activeCommit =
    filteredCommits.find((c) => c.hash === selectedCommitHash) ??
    filteredCommits[0] ??
    null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Dolt Aus Gallops Store
          </h1>
          <p className="mt-1 text-sm text-slate-600 max-w-2xl">
            Inspect immutable commit hashes, racing-daily branch state, and versioned Australian Thoroughbred race cards from FormFav MCP and Firecrawl.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenCommitModal}
          className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Commit Race Card
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex p-1 bg-slate-100 rounded-lg gap-1 self-start">
          <button
            type="button"
            onClick={() => setBranchFilter('ALL')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              branchFilter === 'ALL'
                ? 'bg-white text-slate-900'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Racing Branches
          </button>
          {racingBranches.map((branch) => (
            <button
              key={branch}
              type="button"
              onClick={() => setBranchFilter(branch)}
              className={`px-3 py-1.5 text-xs font-mono font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                branchFilter === branch
                  ? 'bg-white text-slate-900'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {branch}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter tracks, runners, or commits..."
            className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
          />
        </div>
      </div>

      {/* Table + Inspector Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          {filteredCommits.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No Aus Gallops Dolt commits match your current filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="py-2.5 px-4">Commit Ref</th>
                    <th className="py-2.5 px-4">Table</th>
                    <th className="py-2.5 px-4">Summary</th>
                    <th className="py-2.5 px-4 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {filteredCommits.map((commit) => {
                    const isSelected = activeCommit?.hash === commit.hash;
                    return (
                      <tr
                        key={commit.branch_ref}
                        onClick={() => setSelectedCommitHash(commit.hash)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-teal-50/60' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-3 px-4 font-mono text-xs text-slate-900 whitespace-nowrap tabular-nums">
                          {commit.branch_ref}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                          {commit.table}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-700 max-w-xs truncate">
                          {commit.message}
                        </td>
                        <td className="py-3 px-4 text-xs font-mono text-slate-500 text-right whitespace-nowrap tabular-nums">
                          {commit.timestamp.slice(0, 16).replace('T', ' ')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Commit Inspector */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
          {activeCommit ? (
            <div className="divide-y divide-slate-200">
              <div className="px-5 py-4 space-y-1">
                <div className="flex items-center gap-2 text-xs font-mono text-teal-800">
                  <GitCommitHorizontal className="w-4 h-4" />
                  <span>{activeCommit.branch_ref}</span>
                </div>
                <p className="text-sm font-semibold text-slate-900">
                  {activeCommit.message}
                </p>
                <p className="text-xs text-slate-500">
                  Author: {activeCommit.author} · Table: {activeCommit.table} · Record: {activeCommit.record_id}
                </p>
              </div>

              <div className="p-5 space-y-3">
                {(() => {
                  const card = activeCommit.data as RacingCardData;
                  return (
                    <>
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span className="font-semibold text-slate-900">
                          {card.meeting} Race {card.race_number}
                        </span>
                        <span className="font-mono tabular-nums">
                          {card.distance} · {card.track}
                        </span>
                      </div>
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500">
                            <th className="py-1.5 text-left">#</th>
                            <th className="py-1.5 text-left">Runner</th>
                            <th className="py-1.5 text-right">Bar</th>
                            <th className="py-1.5 text-right">Odds</th>
                            <th className="py-1.5 text-right">Win / Map</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 tabular-nums font-mono">
                          {card.runners.map((r) => (
                            <tr key={`${r.no}-${r.name}`}>
                              <td className="py-2 text-slate-600">{r.no}</td>
                              <td className="py-2 font-sans font-medium text-slate-900">
                                {r.name}
                              </td>
                              <td className="py-2 text-right text-slate-600">
                                {r.barrier}
                              </td>
                              <td className="py-2 text-right text-slate-900">
                                {r.odds ? `$${r.odds.toFixed(2)}` : '—'}
                              </td>
                              <td className="py-2 text-right text-teal-700 font-medium">
                                {r.dolt_win_rate_1200m}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  );
                })()}
              </div>

              <div className="p-4 bg-slate-50">
                <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto">
                  {JSON.stringify(activeCommit.data, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-slate-500">
              Select a commit row to inspect its race card JSON payload.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
