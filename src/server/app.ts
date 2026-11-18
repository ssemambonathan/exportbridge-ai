import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { ensureDemoSeed, getDb } from './db/database.ts';
import { createRateLimiter } from './security/rbac.ts';
import authRoutes from './routes/authRoutes.ts';
import supplyRoutes from './routes/supplyRoutes.ts';
import buyerRoutes from './routes/buyerRoutes.ts';
import commercialRoutes from './routes/commercialRoutes.ts';
import governanceRoutes from './routes/governanceRoutes.ts';
import cloudSqlRoutes from './routes/cloudSqlRoutes.ts';
import chatRoutes from './routes/chatRoutes.ts';
import { isGeminiConfigured } from './agents/aiClient.ts';
import { checkSupabaseStatus } from './db/supabaseClient.ts';

dotenv.config();

export function createApp(options?: { seedDemo?: boolean }) {
  getDb();
  if (options?.seedDemo !== false) {
    ensureDemoSeed();
  }

  const app = express();
  app.set('trust proxy', 1);

  // Secure HTTP headers (frameguard disabled to allow AI Studio iframe preview)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      frameguard: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  const apiLimiter = createRateLimiter(300, 60_000);
  app.use('/api', apiLimiter);

  app.get('/api/health', async (_req, res) => {
    const db = getDb();
    const migrations = db.prepare('SELECT COUNT(*) AS cnt FROM schema_migrations').get() as { cnt: number };
    const supabase = await checkSupabaseStatus();
    res.json({
      status: 'ok',
      service: 'ExportBridge AI',
      database: 'sqlite',
      migrationsApplied: migrations.cnt,
      geminiConfigured: isGeminiConfigured(),
      sessionSecretConfigured: Boolean(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16),
      supabase,
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api', authRoutes); // exposes /api/organisations
  app.use('/api', supplyRoutes);
  app.use('/api', buyerRoutes);
  app.use('/api', commercialRoutes);
  app.use('/api', governanceRoutes);
  app.use('/api/cloudsql', cloudSqlRoutes);
  app.use('/api/chat', chatRoutes);

  // 404 handler for unknown API routes
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  // Centralized error handler (sanitizes internal error details)
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File exceeds maximum allowed size (10 MB).' });
    }
    console.error('[SERVER_ERROR]', err);
    return res.status(err?.status || 500).json({
      error: err?.status && err.status < 500 ? err.message : 'Internal server error',
    });
  });

  return app;
}
