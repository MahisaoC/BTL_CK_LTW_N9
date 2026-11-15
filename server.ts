import express from 'express';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createApiApp } from './backend/app.ts';

dotenv.config();

async function startServer() {
  const app = createApiApp();
  const PORT = Number(process.env.PORT) || 3000;
  const distPath = path.join(process.cwd(), 'dist');
  const isProductionStart =
    process.env.NODE_ENV === 'production' ||
    (process.env.npm_lifecycle_event === 'start' &&
      fs.existsSync(path.join(distPath, 'index.html')));

  if (!isProductionStart) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.use((_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Full-stack server (Backend + Frontend) running on http://localhost:${PORT}`);
  });
}

startServer();
