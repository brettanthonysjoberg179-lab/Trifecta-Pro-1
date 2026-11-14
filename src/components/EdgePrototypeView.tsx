import React, { useEffect, useState } from 'react';
import { Check, Copy, Play } from 'lucide-react';
import type {
  EdgeWebhookResponse,
  OrchestratorOutput,
} from '../types/engine';

interface EdgePrototypeViewProps {
  branches: string[];
  initialWebhookPayload: OrchestratorOutput | null;
}

type ScriptTab = 'runner' | 'worker' | 'ingest' | 'bridge';

const SCRIPTS: Record<
  ScriptTab,
  { filename: string; subtitle: string; code: string }
> = {
  runner: {
    filename: 'prototype_runner.py',
    subtitle:
      'Step C Upgraded: Dolt SQL + Hugging Face BAAI/bge-small-en-v1.5 local vector search + Cloudflare AI Gateway',
    code: `import subprocess
import json
import os
import numpy as np
from sentence_transformers import SentenceTransformer
from google import genai
from google.genai import types

# 1. Pull latest Dolt commit & knowledge_items row
commit_hash = subprocess.check_output(
    ["dolt", "log", "-n", "1", "--oneline"]
).decode().strip().split()[0]

raw_rows = subprocess.check_output(
    ["dolt", "sql", "-r", "json", "-q", "SELECT * FROM knowledge_items ORDER BY id DESC LIMIT 1;"]
).decode()
dolt_data = json.loads(raw_rows)["rows"][0]

# 2. Semantic Vector RAG Lookup (BAAI/bge-small-en-v1.5)
embed_model = SentenceTransformer("BAAI/bge-small-en-v1.5")
corpus = [
    "Style Rule: Keep all Fair Dinkum Press guides practical, concise, and free of corporate jargon.",
    "Australian SMBs deploying AI must document human-in-the-loop review under the Privacy Act 1988.",
    "Morphettville 1200m on a Good 4 historically favours inside barriers (1-4) by +14% win strike rate."
]
corpus_vecs = embed_model.encode(corpus, normalize_embeddings=True)
query_vec = embed_model.encode(f"{dolt_data['title']} {dolt_data['notes']}", normalize_embeddings=True)
scores = np.dot(corpus_vecs, query_vec)
top_idx = int(np.argmax(scores))
rag_context = corpus[top_idx]

# 3. Route Gemini through Cloudflare AI Gateway (standard gateway.ai.cloudflare.com endpoint)
cf_account_id = os.environ["CF_ACCOUNT_ID"]
client = genai.Client(
    api_key=os.environ["GEMINI_API_KEY"],
    http_options={
        "base_url": f"https://gateway.ai.cloudflare.com/v1/{cf_account_id}/a2a-core-gateway/google-ai-studio"
    }
)

prompt = f"""
Dolt Commit: {commit_hash}
Data: {json.dumps(dolt_data)}
RAG Context: {rag_context}

Generate a JSON A2A response with keys: 'commit_ref', 'headline', 'action_plan', and 'next_agent'.
"""

response = client.models.generate_content(
    model="gemini-3.1-flash-lite",
    contents=prompt,
    config=types.GenerateContentConfig(response_mime_type="application/json")
)

print(response.text)`,
  },
  worker: {
    filename: 'worker.js',
    subtitle:
      'Step D Corrected: Cloudflare Worker Edge A2A Webhook targeting gateway.ai.cloudflare.com',
    code: `export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("A2A Endpoint Ready", { status: 200 });
    }

    const a2aPayload = await request.json();

    // Forward A2A task through Cloudflare AI Gateway -> Google AI Studio
    const gatewayUrl = \`https://gateway.ai.cloudflare.com/v1/\${env.CF_ACCOUNT_ID}/a2a-core-gateway/google-ai-studio/v1beta/models/gemini-3.1-flash-lite:generateContent\`;

    const geminiResponse = await fetch(gatewayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: JSON.stringify(a2aPayload) }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    const data = await geminiResponse.json();
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" }
    });
  }
};`,
  },
  ingest: {
    filename: 'ingest_feeds.py',
    subtitle:
      'Expansion Module 2: Automated daily FormFav & Ahrefs ingestion with Dolt versioned commits',
    code: `import json
import os
import subprocess
from datetime import date
import requests

def dolt_sql(query: str):
    subprocess.run(["dolt", "sql", "-q", query], check=True)

def ingest_ahrefs_keyword(keyword: str, country: str = "au"):
    resp = requests.get(
        "https://api.ahrefs.com/v3/keywords-explorer/overview",
        headers={"Authorization": f"Bearer {os.environ['AHREFS_API_KEY']}"},
        params={"keywords": keyword, "country": country, "select": "keyword,volume,difficulty,cpc"},
        timeout=15
    )
    resp.raise_for_status()
    row = resp.json()["keywords"][0]
    metrics_json = json.dumps({
        "keyword": row["keyword"],
        "country": country.upper(),
        "search_volume": row["volume"],
        "kd": row["difficulty"],
        "cpc": row["cpc"]
    }).replace("'", "''")

    dolt_sql(
        f"INSERT INTO knowledge_items (domain, title, raw_metrics, notes) "
        f"VALUES ('PUBLISHING', '{keyword} ({country.upper()})', '{metrics_json}', 'Daily Ahrefs ingest');"
    )

if __name__ == "__main__":
    ingest_ahrefs_keyword("australian ai compliance")
    subprocess.run(["dolt", "add", "."], check=True)
    subprocess.run(["dolt", "commit", "-m", f"Daily Ahrefs ingest {date.today().isoformat()}"], check=True)`,
  },
  bridge: {
    filename: 'mcp_bridge.ts',
    subtitle:
      'Expansion Module 3: Dispatching A2A Orchestrator outputs to GitHub REST API and Google Workspace',
    code: `interface A2AOrchestratorAsset {
  mode: "RACING" | "PUBLISHING";
  dolt_branch_ref: string;
  seo_target_keyword: string;
  markdown_content: string;
  nanobanana_prompt: string;
  slides_summary_bullets: string[];
  gmail_subject_line: string;
  next_a2a_agent: string;
}

export async function dispatchToOpsPublisher(
  asset: A2AOrchestratorAsset,
  githubToken: string,
  repoSlug: string
) {
  const filename = \`content/\${asset.mode.toLowerCase()}/\${asset.dolt_branch_ref.replace("@", "-")}.md\`;
  const encoded = Buffer.from(asset.markdown_content, "utf-8").toString("base64");

  const ghRes = await fetch(\`https://api.github.com/repos/\${repoSlug}/contents/\${filename}\`, {
    method: "PUT",
    headers: {
      Authorization: \`Bearer \${githubToken}\`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: \`Publish \${asset.seo_target_keyword} (\${asset.dolt_branch_ref})\`,
      content: encoded
    })
  });

  if (!ghRes.ok) {
    throw new Error(\`GitHub commit failed: \${ghRes.status}\`);
  }

  return {
    committed_file: filename,
    gmail_subject_line: asset.gmail_subject_line,
    slides_bullets_count: asset.slides_summary_bullets.length
  };
}`,
  },
};

export const EdgePrototypeView: React.FC<EdgePrototypeViewProps> = ({
  branches,
  initialWebhookPayload,
}) => {
  const [selectedBranch, setSelectedBranch] = useState(
    branches.includes('publishing-main') ? 'publishing-main' : branches[0] ?? 'publishing-main'
  );
  const [payloadText, setPayloadText] = useState(
    JSON.stringify(
      {
        trigger: 'cron_daily_publish',
        target_agent: 'OPS_PUBLISHER',
        requested_action: 'Generate actionable checklist headline & next dispatch steps',
      },
      null,
      2
    )
  );
  const [webhookResult, setWebhookResult] = useState<EdgeWebhookResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeScript, setActiveScript] = useState<ScriptTab>('runner');
  const [copiedScript, setCopiedScript] = useState(false);

  useEffect(() => {
    if (initialWebhookPayload) {
      setSelectedBranch(
        initialWebhookPayload.mode === 'RACING' ? 'racing-daily' : 'publishing-main'
      );
      setPayloadText(JSON.stringify(initialWebhookPayload, null, 2));
    }
  }, [initialWebhookPayload]);

  const handleTriggerWebhook = async () => {
    setLoading(true);
    setError(null);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(payloadText);
      } catch {
        throw new Error('Webhook JSON payload is invalid.');
      }
      const res = await fetch('/api/a2a/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch: selectedBranch,
          payload: parsed,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Webhook call failed.');
      setWebhookResult(body.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Webhook execution error.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(SCRIPTS[activeScript].code);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 1600);
    } catch {
      // ignore
    }
  };

  const currentScript = SCRIPTS[activeScript];

  return (
    <div className="space-y-8">
      <div className="pb-5 border-b border-slate-200">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Edge Webhook & Prototype Scripts
        </h1>
        <p className="mt-1 text-sm text-slate-600 max-w-2xl">
          Test the live Part 3 Edge A2A responder locally against your Dolt commits and copy the corrected Python, Cloudflare Worker, and MCP bridge modules.
        </p>
      </div>

      {/* Live Edge Webhook Tester */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              POST /api/a2a/webhook Simulator
            </h2>
            <span className="text-xs font-mono text-slate-500">
              gemini-3.1-flash-lite
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Target Dolt Branch (Head Commit)
            </label>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
            >
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Incoming A2A JSON Payload
            </label>
            <textarea
              rows={8}
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
              spellCheck={false}
              className="w-full px-3 py-2.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700 focus:bg-white"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleTriggerWebhook}
            disabled={loading}
            className="w-full py-2.5 px-4 inline-flex items-center justify-center gap-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg cursor-pointer"
          >
            <Play className="w-4 h-4" />
            {loading ? 'Invoking Edge Responder...' : 'Send Edge Webhook POST'}
          </button>
        </div>

        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Edge JSON Response
            </h2>
            {webhookResult && (
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                {webhookResult.latency_ms} ms · {webhookResult.model_used}
              </span>
            )}
          </div>

          {loading ? (
            <div className="p-6 space-y-3">
              <div className="h-5 w-1/2 bg-slate-100 rounded animate-pulse" />
              <div className="h-24 w-full bg-slate-100 rounded animate-pulse" />
            </div>
          ) : webhookResult ? (
            <div className="p-5 space-y-4">
              <div className="space-y-1">
                <p className="text-xs font-mono text-teal-800">
                  {webhookResult.commit_ref} → {webhookResult.next_agent}
                </p>
                <p className="text-base font-semibold text-slate-900">
                  {webhookResult.headline}
                </p>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-700 mb-1.5">
                  Action Plan
                </h3>
                <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
                  {webhookResult.action_plan.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ul>
              </div>

              <pre className="p-3.5 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto">
                {JSON.stringify(webhookResult, null, 2)}
              </pre>
            </div>
          ) : (
            <div className="p-10 text-center space-y-2">
              <p className="text-sm font-medium text-slate-900">
                Edge responder standing by
              </p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Send a webhook POST to verify the Versioned RAG + Edge Responder loop against your selected Dolt branch.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Part 3 Code Workbench */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex p-1 bg-slate-100 rounded-lg gap-1 overflow-x-auto">
            {(Object.keys(SCRIPTS) as ScriptTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveScript(tab)}
                className={`px-3 py-1.5 text-xs font-mono font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  activeScript === tab
                    ? 'bg-white text-slate-900'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {SCRIPTS[tab].filename}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleCopyScript}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 border border-slate-200 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
          >
            {copiedScript ? (
              <Check className="w-3.5 h-3.5 text-teal-700" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            {copiedScript ? 'Copied' : 'Copy Code'}
          </button>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-xs text-slate-600">{currentScript.subtitle}</p>
          <pre className="p-4 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono leading-relaxed overflow-x-auto">
            {currentScript.code}
          </pre>
        </div>
      </section>
    </div>
  );
};
