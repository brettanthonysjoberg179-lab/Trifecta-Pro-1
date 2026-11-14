import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  DoltCommit,
  EngineMode,
  KnowledgeItemData,
  RacingCardData,
  RagDocument,
  RagSearchResult,
} from '../src/types/engine.ts';
import { embedText } from './gemini.ts';

interface StoredRagDocument extends RagDocument {
  embedding?: number[];
}

interface PersistedEngineData {
  branches: string[];
  commits: DoltCommit[];
  rag_documents: StoredRagDocument[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'engine_store.json');

function createShortHash(input: string): string {
  return crypto.createHash('sha1').update(input).digest('hex').slice(0, 7);
}

function getInitialSeed(): PersistedEngineData {
  const racingSeed: RacingCardData = {
    meeting: 'Morphettville',
    race_number: 7,
    distance: '1200m',
    track: 'Good 4',
    runners: [
      {
        no: 1,
        name: 'Southern Cross',
        barrier: 3,
        odds: 3.4,
        dolt_win_rate_1200m: '38%',
      },
      {
        no: 4,
        name: 'Adelaide Breeze',
        barrier: 11,
        odds: 6.5,
        dolt_win_rate_1200m: '25%',
      },
      {
        no: 7,
        name: 'Barossa Gold',
        barrier: 2,
        odds: 8.0,
        dolt_win_rate_1200m: '33%',
      },
    ],
  };

  return {
    branches: ['racing-daily'],
    commits: [
      {
        hash: 'a1b2c3d',
        branch: 'racing-daily',
        branch_ref: 'racing-daily@a1b2c3d',
        message: 'Seed Morphettville R7 Good 4 FormFav + Dolt win rates',
        author: 'ingest_formfav.py',
        timestamp: '2026-11-13T07:15:00Z',
        table: 'racing_cards',
        record_id: 'morphettville-r7',
        data: racingSeed,
      },
    ],
    rag_documents: [
      {
        id: 'rag-morphettville-bias',
        title: 'Morphettville 1200m Good 4 Barrier Bias Study',
        collection: 'Aus Gallops Track Bias',
        domain: 'RACING',
        content:
          'Morphettville 1200m on a Good 4 historically favours inside barriers (1-4) by +14% win strike rate.',
        created_at: '2026-11-12T14:20:00Z',
        has_embedding: false,
      },
      {
        id: 'rag-aus-gallops-speedmap',
        title: 'Australian Metropolitan 1200m Pace & Barrier Pattern',
        collection: 'Aus Gallops Track Bias',
        domain: 'RACING',
        content:
          'Across Australian Good 4 1200m sprints, on-pace runners drawn inside barriers 1-5 consistently outperform wide closers when rail placement is True to +4m.',
        created_at: '2026-11-13T06:45:00Z',
        has_embedding: false,
      },
    ],
  };
}

class EngineStore {
  private data: PersistedEngineData;

  constructor() {
    this.data = this.load();
  }

  private load(): PersistedEngineData {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as PersistedEngineData;
        if (Array.isArray(parsed.commits) && Array.isArray(parsed.rag_documents)) {
          return parsed;
        }
      }
    } catch {
      // Fallback to initial seed
    }
    const seed = getInitialSeed();
    this.save(seed);
    return seed;
  }

  private save(data: PersistedEngineData = this.data): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch {
      // Non-fatal in ephemeral environments
    }
  }

  getPublicState() {
    const racingCommits = this.data.commits
      .filter((c) => c.table === 'racing_cards')
      .reverse();
    const branchSet = new Set<string>(['racing-daily']);
    for (const c of racingCommits) {
      branchSet.add(c.branch);
    }
    const racingBranches = this.data.branches.filter((b) => branchSet.has(b));
    return {
      branches: racingBranches.length > 0 ? racingBranches : ['racing-daily'],
      commits: racingCommits,
      rag_documents: this.data.rag_documents
        .filter((d) => d.domain === 'RACING')
        .map(({ embedding: _e, ...rest }) => rest),
    };
  }

  getCommitByRef(branchRef: string): DoltCommit | undefined {
    return this.data.commits.find((c) => c.branch_ref === branchRef);
  }

  getLatestCommit(branch?: string): DoltCommit {
    const racingOnly = this.data.commits.filter((c) => c.table === 'racing_cards');
    const pool = racingOnly.length > 0 ? racingOnly : this.data.commits;
    const filtered = branch ? pool.filter((c) => c.branch === branch) : pool;
    return filtered[filtered.length - 1] ?? pool[pool.length - 1];
  }

  createCommit(params: {
    branch: string;
    message: string;
    author?: string;
    table: 'racing_cards' | 'knowledge_items';
    record_id?: string;
    data: RacingCardData | KnowledgeItemData;
  }): DoltCommit {
    const branch = params.branch.trim() || 'racing-daily';
    if (!this.data.branches.includes(branch)) {
      this.data.branches.push(branch);
    }

    const timestamp = new Date().toISOString();
    const hash = createShortHash(
      `${branch}:${params.message}:${timestamp}:${JSON.stringify(params.data)}`
    );
    const branch_ref = `${branch}@${hash}`;

    let dataPayload = params.data;
    if (params.table === 'knowledge_items') {
      const existingMaxId = this.data.commits
        .filter((c) => c.table === 'knowledge_items')
        .reduce((max, c) => {
          const item = c.data as KnowledgeItemData;
          return Math.max(max, Number(item.id) || 0);
        }, 0);
      const itemData = dataPayload as KnowledgeItemData;
      if (!itemData.id) {
        dataPayload = { ...itemData, id: existingMaxId + 1 };
      }
    }

    const commit: DoltCommit = {
      hash,
      branch,
      branch_ref,
      message: params.message.trim(),
      author: params.author?.trim() || 'studio-operator',
      timestamp,
      table: params.table,
      record_id:
        params.record_id?.trim() ||
        (params.table === 'knowledge_items'
          ? `item-${(dataPayload as KnowledgeItemData).id}`
          : `race-${hash}`),
      data: dataPayload,
    };

    this.data.commits.push(commit);
    this.save();
    return commit;
  }

  async addRagDocument(params: {
    title: string;
    collection: string;
    domain: EngineMode;
    content: string;
  }): Promise<RagDocument> {
    const textToEmbed = `${params.title}\n${params.collection}\n${params.content}`;
    const embedding = await embedText(textToEmbed);

    const doc: StoredRagDocument = {
      id: `rag-${createShortHash(textToEmbed + Date.now())}`,
      title: params.title.trim(),
      collection: params.collection.trim() || 'Aus Gallops Track Bias',
      domain: params.domain,
      content: params.content.trim(),
      created_at: new Date().toISOString(),
      has_embedding: Boolean(embedding),
      embedding: embedding ?? undefined,
    };

    this.data.rag_documents.unshift(doc);
    this.save();
    const { embedding: _e, ...publicDoc } = doc;
    return publicDoc;
  }

  async searchRag(params: {
    query: string;
    domain?: EngineMode | 'ALL';
    topK?: number;
  }): Promise<RagSearchResult[]> {
    const candidates = this.data.rag_documents.filter((doc) =>
      params.domain && params.domain !== 'ALL' ? doc.domain === params.domain : true
    );

    if (candidates.length === 0) return [];

    // Compute query embedding and lazily backfill missing doc embeddings
    const queryEmbedding = await embedText(params.query);
    let mutated = false;

    if (queryEmbedding) {
      for (const doc of candidates) {
        if (!doc.embedding) {
          const vec = await embedText(`${doc.title}\n${doc.collection}\n${doc.content}`);
          if (vec) {
            doc.embedding = vec;
            doc.has_embedding = true;
            mutated = true;
          }
        }
      }
      if (mutated) {
        this.save();
      }
    }

    const scored: RagSearchResult[] = candidates.map((doc) => {
      const { embedding, ...publicDoc } = doc;
      if (queryEmbedding && embedding && embedding.length === queryEmbedding.length) {
        return {
          document: publicDoc,
          score: cosineSimilarity(queryEmbedding, embedding),
          method: 'gemini-embedding-2',
        };
      }
      return {
        document: publicDoc,
        score: lexicalOverlapScore(
          params.query,
          `${doc.title} ${doc.collection} ${doc.content}`
        ),
        method: 'lexical-fallback',
      };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, params.topK ?? 4);
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;
  return Number((dot / denom).toFixed(4));
}

function lexicalOverlapScore(query: string, target: string): number {
  const tokenize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);
  const qTokens = new Set(tokenize(query));
  const tTokens = new Set(tokenize(target));
  if (qTokens.size === 0 || tTokens.size === 0) return 0;
  let hits = 0;
  for (const token of qTokens) {
    if (tTokens.has(token)) hits += 1;
  }
  return Number((hits / Math.sqrt(qTokens.size * tTokens.size)).toFixed(4));
}

export const engineStore = new EngineStore();
