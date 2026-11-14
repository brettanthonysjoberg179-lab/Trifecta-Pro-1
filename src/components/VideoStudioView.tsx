import React, { useEffect, useState } from 'react';
import { Download, Film, Play } from 'lucide-react';
import type { VideoAspectRatio, VideoGenerationResult } from '../types/engine';

interface VideoStudioViewProps {
  initialPrompt?: string;
}

const VIDEO_PRESETS = [
  {
    label: 'Fair Dinkum Press Editorial Promo (16:9)',
    aspect: '16:9' as VideoAspectRatio,
    prompt:
      'Clean editorial motion graphic studio shot of a modern Australian small business workspace with warm natural window light, crisp minimalist typography cards gliding across a slate desk representing AI compliance checklists, subtle depth of field, 4K commercial quality.',
  },
  {
    label: 'Morphettville Sprint Preview (9:16)',
    aspect: '9:16' as VideoAspectRatio,
    prompt:
      'Dynamic vertical trackside cinematography of thoroughbred racehorses bursting out of inside barriers on lush green turf at golden hour, crisp emerald grass spray, dramatic telephoto tracking shot, high-speed sports documentary aesthetic.',
  },
];

export const VideoStudioView: React.FC<VideoStudioViewProps> = ({
  initialPrompt,
}) => {
  const [prompt, setPrompt] = useState(
    initialPrompt || VIDEO_PRESETS[0].prompt
  );
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>('16:9');
  const [duration, setDuration] = useState<string>('8s');
  const [result, setResult] = useState<VideoGenerationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialPrompt) {
      setPrompt(initialPrompt);
    }
  }, [initialPrompt]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          aspectRatio,
          duration,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Video generation failed.');
      }
      setResult(body.result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to generate video.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="pb-5 border-b border-slate-200">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Text-to-Video Studio
        </h1>
        <p className="mt-1 text-sm text-slate-600 max-w-2xl">
          Generate 16:9 landscape or 9:16 vertical clips directly from text or Orchestrator visual prompts using gemini-omni-1.2-flash via the Gemini Interactions API.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Controls */}
        <form
          onSubmit={handleGenerate}
          className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-5"
        >
          <div className="flex flex-wrap gap-2">
            {VIDEO_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setPrompt(preset.prompt);
                  setAspectRatio(preset.aspect);
                }}
                className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div>
            <label
              htmlFor="video-prompt-input"
              className="block text-xs font-semibold text-slate-900 mb-1.5"
            >
              Video Prompt
            </label>
            <textarea
              id="video-prompt-input"
              rows={6}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe subject, camera motion, lighting, and setting..."
              className="w-full px-3 py-2.5 text-sm leading-relaxed bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700 focus:bg-white"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-900 mb-1.5">
                Aspect Ratio
              </label>
              <div className="inline-flex p-1 bg-slate-100 rounded-lg gap-1 w-full">
                <button
                  type="button"
                  onClick={() => setAspectRatio('16:9')}
                  className={`flex-1 py-1.5 text-xs font-mono font-medium rounded-md transition-colors cursor-pointer ${
                    aspectRatio === '16:9'
                      ? 'bg-white text-slate-900'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  16:9
                </button>
                <button
                  type="button"
                  onClick={() => setAspectRatio('9:16')}
                  className={`flex-1 py-1.5 text-xs font-mono font-medium rounded-md transition-colors cursor-pointer ${
                    aspectRatio === '9:16'
                      ? 'bg-white text-slate-900'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  9:16
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="video-duration-select"
                className="block text-xs font-semibold text-slate-900 mb-1.5"
              >
                Duration
              </label>
              <select
                id="video-duration-select"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
              >
                <option value="5s">5s</option>
                <option value="8s">8s</option>
                <option value="10s">10s</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 leading-relaxed">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="w-full py-2.5 px-4 inline-flex items-center justify-center gap-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg cursor-pointer"
          >
            <Play className="w-4 h-4" />
            {loading
              ? 'Generating Video (Interactions API)...'
              : 'Generate Video'}
          </button>
        </form>

        {/* Right: Video Player Viewport */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span className="font-mono font-semibold text-slate-900">
                gemini-omni-1.2-flash
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {result ? `${result.aspect_ratio} · ${result.duration}` : aspectRatio}
              </span>
            </div>

            {result?.video_data_url && (
              <a
                href={result.video_data_url}
                download={`a2a-video-${result.aspect_ratio.replace(':', 'x')}.mp4`}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 border border-slate-200 rounded-lg inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Download MP4
              </a>
            )}
          </div>

          <div className="p-6 flex items-center justify-center bg-slate-50 min-h-[420px]">
            {loading ? (
              <div className="text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-full border-2 border-slate-300 border-t-teal-700 animate-spin" />
                <p className="text-sm font-medium text-slate-900">
                  Rendering {aspectRatio} video via Interactions API...
                </p>
                <p className="text-xs text-slate-500">
                  Omni Flash video synthesis typically takes 30–120 seconds.
                </p>
              </div>
            ) : result ? (
              <div
                className={`w-full overflow-hidden rounded-lg bg-slate-900 ${
                  result.aspect_ratio === '9:16' ? 'max-w-xs' : 'max-w-2xl'
                }`}
              >
                <video
                  src={result.video_data_url}
                  controls
                  playsInline
                  className={`w-full h-auto ${
                    result.aspect_ratio === '9:16'
                      ? 'aspect-[9/16]'
                      : 'aspect-video'
                  }`}
                />
              </div>
            ) : (
              <div className="text-center space-y-2 max-w-sm">
                <Film className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-sm font-medium text-slate-900">
                  No video generated yet
                </p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Select a 16:9 or 9:16 aspect ratio and click Generate Video to render a clip with gemini-omni-1.2-flash.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
