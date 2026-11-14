import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  FirecrawlAuthError,
  fetchRacingMarketAndSpeedmap,
  getFirecrawlStatus,
} from './server/firecrawl.ts';
import {
  FormFavAuthError,
  getAllRunnerCardsForMeet,
  getAusGallopsActionableFeed,
  getAusGallopsMeetings,
  getAusGallopsPredictions,
  getAusGallopsPrices,
  getAusGallopsRaceCard,
  getAusTrackBias,
  getFormFavRunnerProfile,
  getFormFavUsage,
  probeFormFavMcp,
  searchAusGallopsRunner,
} from './server/formfavMcp.ts';
import {
  generateTrifectaPrediction,
  generateVideoFromText,
  routeA2ARequest,
  runChatTurn,
  runEdgeWebhook,
  runOrchestrator,
  runSearchGrounding,
} from './server/gemini.ts';
import { engineStore } from './server/store.ts';
import type {
  ChatModelId,
  EngineMode,
  FormFavRaceFormResponse,
  RacingCardData,
  VideoAspectRatio,
} from './src/types/engine.ts';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/state', (_req, res) => {
    res.json(engineStore.getPublicState());
  });

  app.post('/api/dolt/commit', (req, res) => {
    try {
      const { branch, message, author, table, record_id, data } = req.body ?? {};
      if (!branch || !message || !table || !data) {
        res.status(400).json({
          error: 'Missing required fields: branch, message, table, data.',
        });
        return;
      }
      const commit = engineStore.createCommit({
        branch,
        message,
        author,
        table,
        record_id,
        data,
      });
      res.status(201).json({ commit, state: engineStore.getPublicState() });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to create Dolt commit.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/rag/docs', async (req, res) => {
    try {
      const { title, collection, domain, content } = req.body ?? {};
      if (!title || !content || !domain) {
        res.status(400).json({
          error: 'Missing required fields: title, domain, content.',
        });
        return;
      }
      const doc = await engineStore.addRagDocument({
        title,
        collection: collection || 'Aus Gallops Track Bias',
        domain: 'RACING',
        content,
      });
      res.status(201).json({ document: doc, state: engineStore.getPublicState() });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to index RAG document.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/rag/search', async (req, res) => {
    try {
      const { query, domain, topK } = req.body ?? {};
      if (!query || typeof query !== 'string') {
        res.status(400).json({ error: 'Search query string is required.' });
        return;
      }
      const results = await engineStore.searchRag({
        query,
        domain: domain || 'ALL',
        topK: Number(topK) || 4,
      });
      res.json({ results });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Semantic search failed.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/orchestrator/run', async (req, res) => {
    try {
      const { mode, dolt_branch_ref, raw_data, rag_context } = req.body ?? {};
      const resolvedMode: EngineMode = 'RACING';
      const commit = dolt_branch_ref
        ? engineStore.getCommitByRef(dolt_branch_ref)
        : engineStore.getLatestCommit('racing-daily');

      const finalBranchRef =
        dolt_branch_ref || commit?.branch_ref || 'racing-daily@a1b2c3d';
      const finalData = raw_data ?? commit?.data;

      if (!finalData) {
        res.status(400).json({
          error: 'Structured raw_data or valid dolt_branch_ref is required.',
        });
        return;
      }

      let finalRag = typeof rag_context === 'string' ? rag_context.trim() : '';
      if (!finalRag) {
        const searchHits = await engineStore.searchRag({
          query: JSON.stringify(finalData),
          domain: resolvedMode,
          topK: 2,
        });
        finalRag = searchHits
          .map((h) => `[${h.document.title}] ${h.document.content}`)
          .join('\n');
      }

      const output = await runOrchestrator({
        mode: resolvedMode,
        doltBranchRef: finalBranchRef,
        rawData: finalData,
        ragContext: finalRag || 'No additional RAG context supplied.',
      });

      res.json({ output, rag_used: finalRag });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Orchestrator execution failed.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/router/dispatch', async (req, res) => {
    try {
      const { prompt } = req.body ?? {};
      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        res.status(400).json({ error: 'Prompt is required for routing.' });
        return;
      }

      const state = engineStore.getPublicState();
      const summary = [
        `Dolt Branches: ${state.branches.join(', ')}`,
        `Latest Commits: ${state.commits
          .slice(0, 4)
          .map((c) => `${c.branch_ref} (${c.message})`)
          .join('; ')}`,
        `RAG Collections: ${Array.from(
          new Set(state.rag_documents.map((d) => d.collection))
        ).join(', ')}`,
      ].join('\n');

      const todayIso = new Date().toISOString().slice(0, 10);
      const output = await routeA2ARequest({
        userPrompt: prompt.trim(),
        availableContextSummary: summary,
        currentDateIso: todayIso,
      });

      res.json({ output });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Central Router failed.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/a2a/webhook', async (req, res) => {
    try {
      const { payload, branch } = req.body ?? {};
      const commit = engineStore.getLatestCommit(branch || 'racing-daily');
      const searchHits = await engineStore.searchRag({
        query: JSON.stringify(payload ?? commit.data),
        domain: 'RACING',
        topK: 2,
      });
      const ragContext = searchHits
        .map((h) => h.document.content)
        .join(' | ');

      const result = await runEdgeWebhook({
        a2aPayload: payload ?? { trigger: 'manual_racing_test', branch: commit.branch },
        commitRef: commit.branch_ref,
        doltData: commit.data,
        ragContext:
          ragContext ||
          'Morphettville 1200m on a Good 4 historically favours inside barriers (1-4) by +14% win strike rate.',
      });

      res.json({ result, source_commit: commit });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Edge A2A webhook failed.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/search/grounding', async (req, res) => {
    try {
      const { query } = req.body ?? {};
      if (!query || typeof query !== 'string' || !query.trim()) {
        res.status(400).json({ error: 'Search query string is required.' });
        return;
      }
      const result = await runSearchGrounding(query.trim());
      res.json({ result });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Google Search grounding failed.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/chat', async (req, res) => {
    try {
      const { model, systemInstruction, history, message, useGoogleSearch } =
        req.body ?? {};
      if (!message || typeof message !== 'string' || !message.trim()) {
        res.status(400).json({ error: 'Chat message is required.' });
        return;
      }

      const allowedModels: ChatModelId[] = [
        'gemini-4-hydrogen',
        'gemini-3.1-flash-lite',
        'gemini-4-argon',
        'gemini-4-carbon',
      ];
      const selectedModel: ChatModelId = allowedModels.includes(model)
        ? model
        : 'gemini-4-hydrogen';

      const sanitizedHistory = Array.isArray(history)
        ? history
            .filter(
              (h) =>
                h &&
                (h.role === 'user' || h.role === 'model') &&
                typeof h.text === 'string'
            )
            .map((h) => ({
              role: h.role as 'user' | 'model',
              text: h.text as string,
            }))
        : [];

      const output = await runChatTurn({
        model: selectedModel,
        systemInstruction:
          typeof systemInstruction === 'string' ? systemInstruction : '',
        history: sanitizedHistory,
        message: message.trim(),
        useGoogleSearch: Boolean(useGoogleSearch),
      });

      res.json({
        reply: output.reply,
        sources: output.sources,
        model_used: selectedModel,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Chat completion failed.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/video/generate', async (req, res) => {
    try {
      const { prompt, aspectRatio, duration } = req.body ?? {};
      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        res.status(400).json({ error: 'Video prompt is required.' });
        return;
      }
      const validRatio: VideoAspectRatio =
        aspectRatio === '9:16' ? '9:16' : '16:9';
      const result = await generateVideoFromText({
        prompt: prompt.trim(),
        aspectRatio: validRatio,
        duration: typeof duration === 'string' ? duration : '8s',
      });
      res.json({ result });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Video generation failed.';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/formfav/status', async (_req, res) => {
    const status = await probeFormFavMcp();
    res.json({ status });
  });

  app.post('/api/formfav/meetings', async (req, res) => {
    try {
      const { date } = req.body ?? {};
      const targetDate =
        typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
          ? date
          : new Date().toLocaleDateString('en-CA', {
              timeZone: 'Australia/Sydney',
            });
      const data = await getAusGallopsMeetings(targetDate);
      res.json(data);
    } catch (error) {
      if (error instanceof FormFavAuthError) {
        res.status(401).json({
          error: error.message,
          missing_api_key: true,
        });
        return;
      }
      const message =
        error instanceof Error ? error.message : 'Failed to fetch FormFav meetings.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/formfav/race-card', async (req, res) => {
    try {
      const { date, track, race, includeBias } = req.body ?? {};
      if (!date || !track || !race) {
        res.status(400).json({
          error: 'Missing required fields: date, track, race.',
        });
        return;
      }
      const card = await getAusGallopsRaceCard({
        date: String(date),
        track: String(track),
        race: Number(race),
      });

      let trackBias: unknown = null;
      if (includeBias) {
        try {
          trackBias = await getAusTrackBias({
            track: String(track),
            condition: card.condition || undefined,
            distance: card.distance || undefined,
          });
        } catch {
          trackBias = null;
        }
      }

      res.json({ card, trackBias });
    } catch (error) {
      if (error instanceof FormFavAuthError) {
        res.status(401).json({
          error: error.message,
          missing_api_key: true,
        });
        return;
      }
      const message =
        error instanceof Error ? error.message : 'Failed to fetch FormFav race card.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/formfav/runner', async (req, res) => {
    try {
      const { query, runnerId } = req.body ?? {};
      if (runnerId) {
        const profile = await getFormFavRunnerProfile(String(runnerId));
        res.json({ profile });
        return;
      }
      if (!query || typeof query !== 'string') {
        res.status(400).json({ error: 'Runner query or runnerId is required.' });
        return;
      }
      const matches = await searchAusGallopsRunner(query.trim());
      res.json({ matches });
    } catch (error) {
      if (error instanceof FormFavAuthError) {
        res.status(401).json({
          error: error.message,
          missing_api_key: true,
        });
        return;
      }
      const message =
        error instanceof Error ? error.message : 'Failed to query FormFav runner.';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/formfav/usage', async (_req, res) => {
    try {
      const usage = await getFormFavUsage();
      res.json({ usage });
    } catch (error) {
      if (error instanceof FormFavAuthError) {
        res.status(401).json({
          error: error.message,
          missing_api_key: true,
        });
        return;
      }
      const message =
        error instanceof Error ? error.message : 'Failed to check FormFav usage.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/formfav/feed', async (req, res) => {
    try {
      const { date } = req.body ?? {};
      const targetDate =
        typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
          ? date
          : new Date().toLocaleDateString('en-CA', {
              timeZone: 'Australia/Sydney',
            });
      const feed = await getAusGallopsActionableFeed(targetDate);
      res.json(feed);
    } catch (error) {
      if (error instanceof FormFavAuthError) {
        res.status(401).json({
          error: error.message,
          missing_api_key: true,
        });
        return;
      }
      const message =
        error instanceof Error ? error.message : 'Failed to sync FormFav feed.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/formfav/predictions', async (req, res) => {
    try {
      const { date, track, race } = req.body ?? {};
      if (!date || !track || !race) {
        res.status(400).json({ error: 'Missing required fields: date, track, race.' });
        return;
      }
      const [predictions, prices] = await Promise.allSettled([
        getAusGallopsPredictions({
          date: String(date),
          track: String(track),
          race: Number(race),
        }),
        getAusGallopsPrices({
          date: String(date),
          track: String(track),
          race: Number(race),
        }),
      ]);

      res.json({
        predictions:
          predictions.status === 'fulfilled'
            ? predictions.value
            : { error: predictions.reason?.message || 'Pro tier required' },
        prices:
          prices.status === 'fulfilled'
            ? prices.value
            : { error: prices.reason?.message || 'Premium tier required' },
      });
    } catch (error) {
      if (error instanceof FormFavAuthError) {
        res.status(401).json({
          error: error.message,
          missing_api_key: true,
        });
        return;
      }
      const message =
        error instanceof Error ? error.message : 'Failed to fetch predictions.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/formfav/meet-cards', async (req, res) => {
    try {
      const { date, track, raceNumbers } = req.body ?? {};
      if (!track || typeof track !== 'string') {
        res.status(400).json({ error: 'Track name or slug is required.' });
        return;
      }
      const targetDate =
        typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
          ? date
          : new Date().toLocaleDateString('en-CA', {
              timeZone: 'Australia/Sydney',
            });

      const result = await getAllRunnerCardsForMeet({
        date: targetDate,
        track: track.trim(),
        raceNumbers: Array.isArray(raceNumbers) ? raceNumbers : undefined,
      });
      res.json(result);
    } catch (error) {
      if (error instanceof FormFavAuthError) {
        res.status(401).json({
          error: error.message,
          missing_api_key: true,
        });
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to load all runner cards for meet.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/racing/trifecta', async (req, res) => {
    try {
      const body = req.body ?? {};
      const requestedSource: 'formfav_mcp' | 'dolt_commit' | 'custom_input' =
        body.source === 'dolt_commit' || body.source === 'custom_input'
          ? body.source
          : 'formfav_mcp';

      let resolvedRaceCard: FormFavRaceFormResponse | null = null;
      let resolvedTrackBias: unknown = body.trackBias ?? null;
      let raceInfo: {
        date: string;
        track: string;
        race_number: number;
        race_name?: string | null;
        distance: string;
        condition: string;
        race_class?: string | null;
        notes?: string;
      };
      let runners: unknown[] = [];

      if (requestedSource === 'formfav_mcp') {
        if (body.raceCard && Array.isArray(body.raceCard.runners)) {
          resolvedRaceCard = body.raceCard as FormFavRaceFormResponse;
        } else {
          const track = String(body.track || '').trim();
          const raceNum = Number(body.race || body.raceNumber || 1);
          const targetDate =
            typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
              ? body.date
              : new Date().toLocaleDateString('en-CA', {
                  timeZone: 'Australia/Sydney',
                });

          if (!track) {
            res.status(400).json({
              error: 'Track name or slug is required for FormFav trifecta prediction.',
            });
            return;
          }

          resolvedRaceCard = await getAusGallopsRaceCard({
            date: targetDate,
            track,
            race: raceNum,
          });
        }

        if (!resolvedTrackBias && resolvedRaceCard.track) {
          try {
            resolvedTrackBias = await getAusTrackBias({
              track: resolvedRaceCard.track,
              condition: resolvedRaceCard.condition || undefined,
              distance: resolvedRaceCard.distance || undefined,
            });
          } catch {
            resolvedTrackBias = null;
          }
        }

        raceInfo = {
          date: resolvedRaceCard.date,
          track: resolvedRaceCard.track,
          race_number: resolvedRaceCard.raceNumber,
          race_name: resolvedRaceCard.raceName,
          distance: resolvedRaceCard.distance || 'Unknown',
          condition: resolvedRaceCard.condition || 'Unknown',
          race_class: resolvedRaceCard.raceClass,
          notes: typeof body.notes === 'string' ? body.notes : undefined,
        };
        runners = resolvedRaceCard.runners || [];
      } else if (requestedSource === 'dolt_commit') {
        const commit = body.dolt_branch_ref
          ? engineStore.getCommitByRef(String(body.dolt_branch_ref))
          : null;
        const cardData = (body.racingCard || commit?.data) as
          | RacingCardData
          | undefined;

        if (!cardData || !Array.isArray(cardData.runners)) {
          res.status(400).json({
            error: 'Valid dolt_branch_ref or racingCard payload is required.',
          });
          return;
        }

        raceInfo = {
          date: commit?.timestamp?.slice(0, 10) || new Date().toISOString().slice(0, 10),
          track: cardData.meeting,
          race_number: cardData.race_number,
          distance: cardData.distance,
          condition: cardData.track,
          notes: typeof body.notes === 'string' ? body.notes : undefined,
        };
        runners = cardData.runners;
      } else {
        const info = body.raceInfo ?? {};
        const customRunners = Array.isArray(body.runners) ? body.runners : [];
        if (!info.track || customRunners.length < 2) {
          res.status(400).json({
            error:
              'Track name and at least 2 runners are required for custom trifecta prediction.',
          });
          return;
        }
        raceInfo = {
          date: String(info.date || new Date().toISOString().slice(0, 10)),
          track: String(info.track).trim(),
          race_number: Number(info.race_number || 1),
          distance: String(info.distance || 'Unknown'),
          condition: String(info.condition || 'Unknown'),
          notes: typeof info.notes === 'string' ? info.notes : undefined,
        };
        runners = customRunners;
      }

      const ragHits = await engineStore.searchRag({
        query: `${raceInfo.track} ${raceInfo.distance} ${raceInfo.condition} barrier bias trifecta`,
        domain: 'RACING',
        topK: 3,
      });
      const ragText = [
        typeof body.notes === 'string' && body.notes.trim()
          ? `[User Notes] ${body.notes.trim()}`
          : '',
        ...ragHits.map((h) => `[${h.document.title}] ${h.document.content}`),
      ]
        .filter(Boolean)
        .join('\n');

      let resolvedFirecrawlIntel = body.firecrawlIntel ?? null;
      let firecrawlWarning: string | null = null;
      if (!resolvedFirecrawlIntel && body.includeFirecrawl) {
        try {
          resolvedFirecrawlIntel = await fetchRacingMarketAndSpeedmap({
            track: raceInfo.track,
            raceNumber: raceInfo.race_number,
            date: raceInfo.date,
          });
        } catch (err) {
          firecrawlWarning =
            err instanceof Error
              ? err.message
              : 'Firecrawl live market/speedmap enrichment skipped.';
        }
      }

      const prediction = await generateTrifectaPrediction({
        source: requestedSource,
        raceInfo,
        runners,
        trackBias: resolvedTrackBias,
        firecrawlIntel: resolvedFirecrawlIntel,
        ragContext: ragText,
      });

      res.json({
        prediction,
        raceCard: resolvedRaceCard,
        trackBias: resolvedTrackBias,
        firecrawlIntel: resolvedFirecrawlIntel,
        firecrawlWarning,
        ragUsed: ragText,
      });
    } catch (error) {
      if (error instanceof FormFavAuthError) {
        res.status(401).json({
          error: error.message,
          missing_api_key: true,
        });
        return;
      }
      if (error instanceof FirecrawlAuthError) {
        res.status(401).json({
          error: error.message,
          missing_firecrawl_key: true,
        });
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to generate trifecta prediction.';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/firecrawl/status', (_req, res) => {
    res.json({ status: getFirecrawlStatus() });
  });

  app.post('/api/firecrawl/market-speedmap', async (req, res) => {
    try {
      const { url, track, raceNumber, date, customQuery } = req.body ?? {};
      const intel = await fetchRacingMarketAndSpeedmap({
        url: typeof url === 'string' ? url : undefined,
        track: typeof track === 'string' ? track : undefined,
        raceNumber:
          raceNumber !== undefined && raceNumber !== null && raceNumber !== ''
            ? Number(raceNumber)
            : null,
        date: typeof date === 'string' ? date : undefined,
        customQuery: typeof customQuery === 'string' ? customQuery : undefined,
      });
      res.json({ intel });
    } catch (error) {
      if (error instanceof FirecrawlAuthError) {
        res.status(401).json({
          error: error.message,
          missing_firecrawl_key: true,
        });
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : 'Firecrawl market & speedmap lookup failed.';
      res.status(500).json({ error: message });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Aus Gallops Tips Engine listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
