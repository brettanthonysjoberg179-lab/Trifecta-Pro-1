import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { DoltCommit, RacingCardData } from '../types/engine';

interface CommitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCommitCreated: (commit: DoltCommit) => void;
}

export const CommitModal: React.FC<CommitModalProps> = ({
  isOpen,
  onClose,
  onCommitCreated,
}) => {
  const [commitMessage, setCommitMessage] = useState('');
  const [meeting, setMeeting] = useState('Flemington');
  const [raceNumber, setRaceNumber] = useState('5');
  const [distance, setDistance] = useState('1400m');
  const [track, setTrack] = useState('Good 4');
  const [runnersJson, setRunnersJson] = useState(
    JSON.stringify(
      [
        { no: 2, name: 'Yarra Flyer', barrier: 2, odds: 3.8, dolt_win_rate_1200m: '35%' },
        { no: 5, name: 'Melbourne Mist', barrier: 4, odds: 5.2, dolt_win_rate_1200m: '29%' },
        { no: 9, name: 'Gippsland Star', barrier: 10, odds: 9.5, dolt_win_rate_1200m: '22%' },
      ],
      null,
      2
    )
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      let parsedRunners;
      try {
        parsedRunners = JSON.parse(runnersJson);
        if (!Array.isArray(parsedRunners) || parsedRunners.length === 0) {
          throw new Error('Runners must be a non-empty JSON array.');
        }
      } catch {
        throw new Error('Runners JSON is invalid.');
      }

      const data: RacingCardData = {
        meeting: meeting.trim(),
        race_number: Number(raceNumber) || 1,
        distance: distance.trim(),
        track: track.trim(),
        runners: parsedRunners,
      };

      const finalMsg =
        commitMessage.trim() ||
        `Ingest Aus Gallops ${meeting.trim()} R${raceNumber} card`;

      const res = await fetch('/api/dolt/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch: 'racing-daily',
          message: finalMsg,
          author: 'aus-gallops-tipster',
          table: 'racing_cards',
          data,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Failed to commit to Dolt store.');
      }

      onCommitCreated(body.commit);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected commit error.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="commit-modal-title"
    >
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 id="commit-modal-title" className="text-base font-semibold text-slate-900">
            Commit Aus Gallops Race Card (`racing-daily`)
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Meeting
              </label>
              <input
                type="text"
                value={meeting}
                onChange={(e) => setMeeting(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Race #
              </label>
              <input
                type="number"
                value={raceNumber}
                onChange={(e) => setRaceNumber(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Distance
              </label>
              <input
                type="text"
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Track
              </label>
              <input
                type="text"
                value={track}
                onChange={(e) => setTrack(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Runners JSON (FormFav + Dolt metrics)
            </label>
            <textarea
              rows={7}
              value={runnersJson}
              onChange={(e) => setRunnersJson(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Commit Message
            </label>
            <input
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Optional commit summary (auto-generated if blank)"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg cursor-pointer"
            >
              {submitting ? 'Committing...' : 'Commit Race Card'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
