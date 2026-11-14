import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowDown, Check, Copy, Play, Send } from 'lucide-react';
import type { RouterOutput, WorkerPod } from '../types/engine';

const PRESET_PROMPTS = [
  {
    label: 'FormFav + Firecrawl Speedmap + Trifecta',
    text: 'Fetch Morphettville Race 7 tomorrow via FormFav MCP, crawl live Firecrawl betting odds and speedmap, cross-reference Good 4 track bias in RAG, generate a trifecta infographic with Nanobanana, and draft a Gmail race tips preview.',
  },
  {
    label: 'Full Meet Runner Cards + Dolt Sync',
    text: 'Pull all Australian Gallops runner cards for Ascot today via FormFav MCP, commit key races to Dolt racing-daily, index track bias notes into RAG, and create a Google Task to verify scratchings.',
  },
  {
    label: 'Ambiguous Request (Clarification Test)',
    text: 'proceed with the next race',
  },
];

const POD_DESCRIPTIONS: Record<WorkerPod, string> = {
  INTEL_SEO: 'FormFav MCP · Firecrawl Odds & Speedmaps · Dolt SQL · Track Bias RAG',
  MEDIA_DESIGN: 'Nanobanana Form Guide & Speedmap Graphics',
  EXEC_ADMIN: 'Google Tasks · Gmail Tips Drafts · Google Slides',
  DEV_INFRA: 'Dolt racing-daily Commits · Gemini Embeddings · Cloudflare Workers',
};

interface RouterViewProps {
  initialPrompt?: { text: string; key: number } | null;
}

export const RouterView: React.FC<RouterViewProps> = ({ initialPrompt }) => {
  const [prompt, setPrompt] = useState(
    initialPrompt?.text || PRESET_PROMPTS[0].text
  );
  const [result, setResult] = useState<RouterOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    if (initialPrompt?.text) {
      setPrompt(initialPrompt.text);
      setResult(null);
      setCompletedSteps([]);
    }
  }, [initialPrompt]);

  const handleDispatch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setCompletedSteps([]);

    try {
      const res = await fetch('/api/router/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Routing failed.');
      }
      setResult(body.output);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Central Router error.');
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateDag = async () => {
    if (!result || result.a2a_tasks.length === 0 || simulating) return;
    setSimulating(true);
    setCompletedSteps([]);
    for (const task of result.a2a_tasks) {
      await new Promise((r) => setTimeout(r, 320));
      setCompletedSteps((prev) => [...prev, task.step]);
    }
    setSimulating(false);
  };

  const handleCopyJson = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="space-y-6">
      <div className="pb-5 border-b border-slate-200">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Aus Gallops A2A Router
        </h1>
        <p className="mt-1 text-sm text-slate-600 max-w-2xl">
          Decompose Australian horse racing tip workflows into ordered A2A task dependencies across FormFav MCP, Firecrawl speedmaps, Nanobanana form visuals, and Dolt racing-daily.
        </p>
      </div>

      {/* Prompt Composer */}
      <form
        onSubmit={handleDispatch}
        className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            htmlFor="router-prompt"
            className="text-xs font-semibold text-slate-800"
          >
            Operator Intent
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {PRESET_PROMPTS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => setPrompt(preset.text)}
                className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer whitespace-nowrap"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <textarea
          id="router-prompt"
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the multi-pod workflow to dispatch..."
          className="w-full px-3.5 py-2.5 text-sm leading-relaxed border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
        />

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-slate-500">
            Resolves relative dates and validates missing parameters before dispatch.
          </span>
          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg inline-flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Send className="w-4 h-4" />
            {loading ? 'Routing...' : 'Generate Dispatch Plan'}
          </button>
        </div>
      </form>

      {/* Output Grid */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <div className="h-5 w-1/3 bg-slate-100 rounded animate-pulse" />
          <div className="h-20 w-full bg-slate-100 rounded animate-pulse" />
          <div className="h-20 w-full bg-slate-100 rounded animate-pulse" />
        </div>
      ) : result ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Visual Task DAG */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {result.status === 'READY_TO_DISPATCH' ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                    <Check className="w-4 h-4" />
                    READY_TO_DISPATCH
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                    <AlertTriangle className="w-4 h-4" />
                    NEEDS_CLARIFICATION
                  </span>
                )}
                <span className="text-slate-300" aria-hidden="true">
                  ·
                </span>
                <span className="text-xs text-slate-600 tabular-nums">
                  {result.a2a_tasks.length} steps
                </span>
              </div>

              {result.a2a_tasks.length > 0 && (
                <button
                  type="button"
                  onClick={handleSimulateDag}
                  disabled={simulating}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  {simulating ? 'Executing Pods...' : 'Run Pod Simulation'}
                </button>
              )}
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-700 leading-relaxed">
                {result.intent_summary}
              </p>

              {result.clarification_question && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-1.5">
                  <p className="text-xs font-semibold text-amber-900">
                    Clarification Required
                  </p>
                  <p className="text-sm text-amber-800 leading-relaxed">
                    {result.clarification_question}
                  </p>
                </div>
              )}

              {result.a2a_tasks.length > 0 && (
                <div className="space-y-3 pt-2">
                  {result.a2a_tasks.map((task, idx) => {
                    const isDone = completedSteps.includes(task.step);
                    return (
                      <React.Fragment key={task.step}>
                        <div
                          className={`p-4 border rounded-lg transition-colors ${
                            isDone
                              ? 'border-emerald-300 bg-emerald-50/40'
                              : 'border-slate-200 bg-slate-50/50'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                                Step {task.step}
                              </span>
                              <span className="text-slate-300" aria-hidden="true">
                                ·
                              </span>
                              <span className="font-semibold text-teal-800">
                                {task.target_pod}
                              </span>
                              <span className="text-slate-300" aria-hidden="true">
                                ·
                              </span>
                              <span className="font-mono text-slate-700">
                                {task.tool_action}
                              </span>
                            </div>

                            <span className="text-xs text-slate-500 font-mono tabular-nums">
                              {isDone
                                ? 'Dispatched'
                                : task.depends_on_step
                                ? `After Step ${task.depends_on_step}`
                                : 'Root step'}
                            </span>
                          </div>

                          <p className="text-xs text-slate-500 mb-2">
                            {POD_DESCRIPTIONS[task.target_pod] || task.target_pod}
                          </p>

                          <pre className="p-2.5 bg-white border border-slate-200 rounded text-xs font-mono text-slate-700 overflow-x-auto">
                            {JSON.stringify(task.parameters, null, 2)}
                          </pre>
                        </div>

                        {idx < result.a2a_tasks.length - 1 && (
                          <div className="flex justify-center text-slate-400">
                            <ArrowDown className="w-4 h-4" />
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right: Raw Router JSON */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-xs font-semibold text-slate-900">
                A2A Router Payload
              </h2>
              <button
                type="button"
                onClick={handleCopyJson}
                className="px-2.5 py-1 text-xs font-medium text-slate-700 hover:text-slate-900 border border-slate-200 rounded-md inline-flex items-center gap-1.5 cursor-pointer"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-teal-700" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copied ? 'Copied' : 'Copy JSON'}
              </button>
            </div>
            <div className="p-4">
              <pre className="p-4 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono leading-relaxed overflow-x-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <p className="text-sm font-medium text-slate-900">
            Ready to decompose A2A workflows
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Pick a preset above or type a multi-step command to inspect the generated task DAG.
          </p>
        </div>
      )}
    </div>
  );
};
