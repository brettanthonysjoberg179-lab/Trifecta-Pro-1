import type {
  FirecrawlRacingIntel,
  FirecrawlSourceLink,
} from '../src/types/engine.ts';
import { extractMarketAndSpeedmapFromMarkdown } from './gemini.ts';

const FIRECRAWL_BASE_URL = 'https://api.firecrawl.dev/v1';

export class FirecrawlAuthError extends Error {
  public readonly missingFirecrawlKey = true;
  constructor(message: string) {
    super(message);
    this.name = 'FirecrawlAuthError';
  }
}

function getFirecrawlApiKey(): string {
  const key = (process.env.FIRECRAWL_API_KEY || '').trim();
  if (!key) {
    throw new FirecrawlAuthError(
      'FIRECRAWL_API_KEY is not configured in Settings > Secrets. Add your Firecrawl API key to scrape live betting markets and speedmaps.'
    );
  }
  return key;
}

export function getFirecrawlStatus(): {
  endpoint: string;
  hasApiKey: boolean;
} {
  return {
    endpoint: FIRECRAWL_BASE_URL,
    hasApiKey: Boolean((process.env.FIRECRAWL_API_KEY || '').trim()),
  };
}

interface FirecrawlScrapeApiResponse {
  success?: boolean;
  error?: string;
  data?: {
    markdown?: string;
    metadata?: {
      title?: string;
      sourceURL?: string;
      url?: string;
    };
  };
}

interface FirecrawlSearchApiResponse {
  success?: boolean;
  error?: string;
  data?: Array<{
    title?: string;
    url?: string;
    description?: string;
    markdown?: string;
  }>;
}

export async function scrapeUrlWithFirecrawl(url: string): Promise<{
  markdown: string;
  sources: FirecrawlSourceLink[];
}> {
  const apiKey = getFirecrawlApiKey();
  const res = await fetch(`${FIRECRAWL_BASE_URL}/scrape`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      url: url.trim(),
      formats: ['markdown'],
      onlyMainContent: true,
    }),
  });

  if (res.status === 401 || res.status === 403) {
    throw new FirecrawlAuthError(
      'Firecrawl API key was rejected (401/403). Please verify FIRECRAWL_API_KEY in Settings > Secrets.'
    );
  }

  const body = (await res.json()) as FirecrawlScrapeApiResponse;
  if (!res.ok || body.success === false) {
    throw new Error(
      body.error || `Firecrawl scrape failed with HTTP ${res.status}.`
    );
  }

  const markdown = body.data?.markdown || '';
  if (!markdown.trim()) {
    throw new Error(
      `Firecrawl returned empty markdown content for ${url}.`
    );
  }

  const title = body.data?.metadata?.title || url;
  const resolvedUrl =
    body.data?.metadata?.sourceURL || body.data?.metadata?.url || url;

  return {
    markdown,
    sources: [{ title, url: resolvedUrl }],
  };
}

export async function searchWithFirecrawl(
  query: string,
  limit = 4
): Promise<{
  markdown: string;
  sources: FirecrawlSourceLink[];
}> {
  const apiKey = getFirecrawlApiKey();
  const res = await fetch(`${FIRECRAWL_BASE_URL}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query: query.trim(),
      limit,
      lang: 'en',
      country: 'au',
      scrapeOptions: {
        formats: ['markdown'],
        onlyMainContent: true,
      },
    }),
  });

  if (res.status === 401 || res.status === 403) {
    throw new FirecrawlAuthError(
      'Firecrawl API key was rejected (401/403). Please verify FIRECRAWL_API_KEY in Settings > Secrets.'
    );
  }

  const body = (await res.json()) as FirecrawlSearchApiResponse;
  if (!res.ok || body.success === false) {
    throw new Error(
      body.error || `Firecrawl search failed with HTTP ${res.status}.`
    );
  }

  const items = Array.isArray(body.data) ? body.data : [];
  if (items.length === 0) {
    throw new Error(
      `Firecrawl search returned no racing market or speedmap pages for "${query}".`
    );
  }

  const sources: FirecrawlSourceLink[] = [];
  const markdownBlocks: string[] = [];

  for (const item of items) {
    if (item.url) {
      sources.push({
        title: item.title || item.url,
        url: item.url,
      });
    }
    const content = (item.markdown || item.description || '').trim();
    if (content) {
      markdownBlocks.push(
        `### SOURCE: ${item.title || item.url || 'Web Result'} (${item.url || ''})\n${content.slice(0, 7500)}`
      );
    }
  }

  const combined = markdownBlocks.join('\n\n---\n\n');
  if (!combined.trim()) {
    throw new Error(
      `Firecrawl found ${items.length} links for "${query}" but no readable market/speedmap text.`
    );
  }

  return {
    markdown: combined,
    sources,
  };
}

export async function fetchRacingMarketAndSpeedmap(params: {
  url?: string;
  track?: string;
  raceNumber?: number | null;
  date?: string;
  customQuery?: string;
}): Promise<FirecrawlRacingIntel> {
  const cleanUrl = (params.url || '').trim();
  const cleanTrack = (params.track || '').trim();
  const cleanDate =
    params.date ||
    new Date().toLocaleDateString('en-CA', {
      timeZone: 'Australia/Sydney',
    });
  const raceNum =
    typeof params.raceNumber === 'number' && params.raceNumber > 0
      ? params.raceNumber
      : null;

  let modeUsed: 'scrape' | 'search' = 'search';
  let scraped: { markdown: string; sources: FirecrawlSourceLink[] };

  if (cleanUrl) {
    modeUsed = 'scrape';
    scraped = await scrapeUrlWithFirecrawl(cleanUrl);
  } else {
    const query =
      (params.customQuery || '').trim() ||
      [
        cleanTrack,
        raceNum ? `Race ${raceNum}` : '',
        cleanDate,
        'horse racing betting odds speed map form runners',
      ]
        .filter(Boolean)
        .join(' ');

    if (!query) {
      throw new Error(
        'Provide a racing URL, track name, or search query for Firecrawl.'
      );
    }
    scraped = await searchWithFirecrawl(query, 4);
  }

  return await extractMarketAndSpeedmapFromMarkdown({
    track: cleanTrack || 'Target Race',
    raceNumber: raceNum,
    date: cleanDate,
    markdown: scraped.markdown,
    sources: scraped.sources,
    modeUsed,
  });
}
