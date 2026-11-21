import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { getDb } from './db.ts';
import authRoutes from './routes/auth.ts';
import vaultRoutes from './routes/vault.ts';
import clientRoutes from './routes/clients.ts';
import settingsRoutes from './routes/settings.ts';
import feedsRoutes from './routes/feeds.ts';

const PORT = Number(process.env.PORT || 4848);
const HOST = process.env.HOST || '127.0.0.1';

export function createApp() {
  getDb();

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '15mb' }));

  // Basic local security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, app: 'PersonVault', time: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/vault', vaultRoutes);
  app.use('/api/clients', clientRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/feeds', feedsRoutes);

  // Serve built frontend in production (single-port local app)
  const distDir = path.resolve(process.cwd(), 'dist');
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        next();
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  return app;
}

const currentFile = fileURLToPath(import.meta.url);
const isDirectRun =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]).toLowerCase() === path.resolve(currentFile).toLowerCase();

if (isDirectRun) {
  const app = createApp();
  app.listen(PORT, HOST, () => {
    console.log(`\n  ✦ PersonVault yerel sunucusu hazır: http://${HOST}:${PORT}\n`);
  });
}
