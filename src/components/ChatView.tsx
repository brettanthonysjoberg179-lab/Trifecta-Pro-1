import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, Globe, RotateCcw, Send } from 'lucide-react';
import type { ChatMessage, ChatModelId } from '../types/engine';
import { MarkdownRenderer } from './MarkdownRenderer';

interface RolePreset {
  id: string;
  label: string;
  defaultModel: ChatModelId;
  instruction: string;
}

const ROLE_PRESETS: RolePreset[] = [
  {
    id: 'tipster',
    label: 'Aus Gallops Tipster',
    defaultModel: 'gemini-4-hydrogen',
    instruction:
      'You are an Australian Thoroughbred (Aus Gallops) Racing Tipster. Deliver punchy, evidence-backed race previews, top-4 selections, and barrier/track-condition analysis strictly grounded in provided form cards, odds, and track bias. Never invent runner stats.',
  },
  {
    id: 'speedmap',
    label: 'Speedmap & Market Analyst',
    defaultModel: 'gemini-4-argon',
    instruction:
      'You are a Quantitative Australian Gallops Speedmap & Market Analyst specializing in settle positions, tempo forecasts, firming/drifting Firecrawl betting markets, and market-implied vs. historical Dolt win probabilities.',
  },
  {
    id: 'trifecta',
    label: 'Trifecta & Exotic Strategist',
    defaultModel: 'gemini-4-carbon',
    instruction:
      'You are an Exotic Betting & Trifecta Strategist for Australian metropolitan and provincial gallops. Construct boxed, standout, and roving-banker trifecta structures backed by barrier draw, pace map, and track/distance splits.',
  },
  {
    id: 'trackside',
    label: 'Fast Trackside Triage',
    defaultModel: 'gemini-3.1-flash-lite',
    instruction:
      'You are a high-speed Trackside Racing Assistant for Australian Gallops. Return ultra-crisp, scannable bullet points for scratchings updates, track downgrades, barrier changes, and quick race-day tips.',
  },
];

const MODEL_OPTIONS: Array<{
  id: ChatModelId;
  label: string;
  tierNote: string;
}> = [
  {
    id: 'gemini-4-hydrogen',
    label: 'gemini-4-hydrogen',
    tierNote: 'General tasks & Search grounding',
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'gemini-3.1-flash-lite',
    tierNote: 'Fast low-latency tasks',
  },
  {
    id: 'gemini-4-argon',
    label: 'gemini-4-argon',
    tierNote: 'Complex interactive tasks',
  },
  {
    id: 'gemini-4-carbon',
    label: 'gemini-4-carbon',
    tierNote: 'Deep reasoning tasks',
  },
];

export const ChatView: React.FC = () => {
  const [selectedRoleId, setSelectedRoleId] = useState<string>('tipster');
  const [model, setModel] = useState<ChatModelId>('gemini-4-hydrogen');
  const [systemInstruction, setSystemInstruction] = useState<string>(
    ROLE_PRESETS[0].instruction
  );
  const [useGoogleSearch, setUseGoogleSearch] = useState<boolean>(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const threadEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const handleSelectRole = (preset: RolePreset) => {
    setSelectedRoleId(preset.id);
    setSystemInstruction(preset.instruction);
    setModel(preset.defaultModel);
  };

  const handleClear = () => {
    setMessages([]);
    setError(null);
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmed,
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    const nextHistory = messages.map((m) => ({
      role: m.role,
      text: m.text,
    }));

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);
    setError(null);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          systemInstruction,
          history: nextHistory,
          message: trimmed,
          useGoogleSearch,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Chat request failed.');
      }

      const modelMsg: ChatMessage = {
        id: `model-${Date.now()}`,
        role: 'model',
        text: body.reply,
        model: body.model_used || model,
        sources: body.sources || [],
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };

      setMessages((prev) => [...prev, modelMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send message.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="pb-5 border-b border-slate-200">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Aus Gallops Form Chat
        </h1>
        <p className="mt-1 text-sm text-slate-600 max-w-2xl">
          Multi-turn Australian Thoroughbred tipping assistant with specialist racing personas, task-matched Gemini models, and optional Google Search grounding for live track conditions &amp; scratchings.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Role, Model & System Instruction */}
        <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div>
            <h2 className="text-xs font-semibold text-slate-900 mb-2">
              Chatbot Role Preset
            </h2>
            <div className="grid grid-cols-2 gap-1.5">
              {ROLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectRole(preset)}
                  className={`px-2.5 py-2 text-xs font-medium rounded-lg border text-left transition-colors cursor-pointer ${
                    selectedRoleId === preset.id
                      ? 'border-teal-700 bg-teal-50/60 text-teal-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="chat-model-select"
              className="block text-xs font-semibold text-slate-900 mb-1.5"
            >
              Gemini Model
            </label>
            <select
              id="chat-model-select"
              value={model}
              onChange={(e) => setModel(e.target.value as ChatModelId)}
              className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
            >
              {MODEL_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label} — {opt.tierNote}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-500">
              Hydrogen for general tasks, Flash-Lite for fast replies, Argon for complex workflows, Carbon for deep reasoning.
            </p>
          </div>

          <div>
            <label
              htmlFor="chat-system-instruction"
              className="block text-xs font-semibold text-slate-900 mb-1.5"
            >
              System Instruction
            </label>
            <textarea
              id="chat-system-instruction"
              rows={5}
              value={systemInstruction}
              onChange={(e) => {
                setSelectedRoleId('custom');
                setSystemInstruction(e.target.value);
              }}
              className="w-full px-3 py-2 text-xs leading-relaxed bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700 focus:bg-white"
            />
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer select-none pt-1">
            <input
              type="checkbox"
              checked={useGoogleSearch}
              onChange={(e) => setUseGoogleSearch(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
            />
            <span className="text-xs text-slate-700 leading-snug">
              <strong className="font-semibold text-slate-900 block">
                Enable Google Search Grounding
              </strong>
              Fetch live web facts and cite sources in replies.
            </span>
          </label>
        </aside>

        {/* Right: Scrollable Chat Thread */}
        <section className="lg:col-span-8 bg-white border border-slate-200 rounded-xl flex flex-col h-[640px] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span className="font-mono font-semibold text-slate-900">
                {model}
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{messages.length} messages</span>
              {useGoogleSearch && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 text-teal-800 font-medium">
                    <Globe className="w-3.5 h-3.5" />
                    Search Grounded
                  </span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={handleClear}
              disabled={messages.length === 0}
              className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-40 inline-flex items-center gap-1.5 rounded-md hover:bg-slate-100 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Clear Thread
            </button>
          </div>

          {/* Scrollable Message Thread */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-6 space-y-3">
                <p className="text-sm font-semibold text-slate-900">
                  Start an Aus Gallops tipping session
                </p>
                <p className="text-xs text-slate-500 max-w-md leading-relaxed">
                  Ask about Australian track conditions, weather &amp; scratchings, barrier bias impacts, speedmap tempo, or trifecta staking structures.
                </p>
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                  {[
                    'Compare implied probability vs Dolt 38% win rate for a $3.40 Morphettville runner.',
                    'How should rail out 6m on a Good 4 affect a 1200m trifecta box?',
                    'Check live track rating and weather updates for Ascot and Sandown today.',
                  ].map((sample) => (
                    <button
                      key={sample}
                      type="button"
                      onClick={() => setInput(sample)}
                      className="px-3 py-1.5 text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg text-left transition-colors cursor-pointer"
                    >
                      {sample}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-1 px-1">
                    <span className="font-semibold text-slate-700">
                      {msg.role === 'user' ? 'Operator' : msg.model || model}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{msg.timestamp}</span>
                  </div>

                  <div
                    className={`max-w-[85%] rounded-xl px-4 py-3 ${
                      msg.role === 'user'
                        ? 'bg-slate-900 text-white text-sm leading-relaxed'
                        : 'bg-slate-50 border border-slate-200 text-slate-800'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    ) : (
                      <div className="space-y-3">
                        <MarkdownRenderer content={msg.text} />
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="pt-2.5 border-t border-slate-200 space-y-1">
                            <p className="text-[11px] font-semibold text-slate-600">
                              Google Search Sources
                            </p>
                            <div className="flex flex-col gap-1">
                              {msg.sources.map((src) => (
                                <a
                                  key={src.uri}
                                  href={src.uri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-xs text-teal-800 hover:underline truncate"
                                >
                                  <ExternalLink className="w-3 h-3 shrink-0" />
                                  <span className="truncate">{src.title}</span>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            {sending && (
              <div className="flex flex-col items-start">
                <div className="text-[11px] text-slate-500 mb-1 px-1 font-mono">
                  {model} · thinking...
                </div>
                <div className="w-64 h-12 bg-slate-100 rounded-xl animate-pulse" />
              </div>
            )}
            <div ref={threadEndRef} />
          </div>

          {/* Error Banner & Input Bar */}
          <div className="border-t border-slate-200 p-4 space-y-3 shrink-0 bg-white">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSend} className="flex items-end gap-3">
              <textarea
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={`Message ${model}... (Enter to send, Shift+Enter for new line)`}
                className="flex-1 px-3.5 py-2 text-sm border border-slate-300 rounded-lg resize-none focus:outline-none focus:border-teal-700"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="px-4 py-2.5 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg inline-flex items-center gap-2 cursor-pointer shrink-0"
              >
                <Send className="w-4 h-4" />
                Send
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
};
