import express, { type Express } from 'express';
import { db, resolveMediaFileBuffer } from './db.ts';
import {
  hydrateMemoryStateFromMongo,
  hasCompletedInitialMongoHydration,
  markMongoStateMutated,
} from './models/mongooseSchemas.ts';
import { authRouter } from './routes/authRoutes.ts';
import { postRouter } from './routes/postRoutes.ts';
import { userRouter } from './routes/userRoutes.ts';
import { notificationRouter } from './routes/notificationRoutes.ts';
import { messageRouter } from './routes/messageRoutes.ts';
import { reportRouter, statsRouter } from './routes/reportAndStatsRoutes.ts';
import { uploadRouter } from './routes/uploadRoutes.ts';
import {
  centralizedErrorHandler,
  notFoundHandler,
} from './middleware/errorMiddleware.ts';

const renderAvatarSvg = (seed: string): string => {
  const palettes = [
    { bg: '#0f172a', accent: '#f97316', ring: '#fdba74' },
    { bg: '#064e3b', accent: '#10b981', ring: '#6ee7b7' },
    { bg: '#31102f', accent: '#f43f5e', ring: '#fda4af' },
    { bg: '#1e1b4b', accent: '#38bdf8', ring: '#bae6fd' },
    { bg: '#451a03', accent: '#eab308', ring: '#fef08a' },
  ];
  const hash = seed.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const pal = palettes[hash % palettes.length];
  const initials = seed
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .trim()
    .split(/\s+/)
    .map((s) => s[0]?.toUpperCase() ?? 'U')
    .slice(0, 2)
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <rect width="200" height="200" rx="100" fill="${pal.bg}" />
  <circle cx="155" cy="45" r="65" fill="${pal.accent}" opacity="0.35" />
  <circle cx="45" cy="165" r="55" fill="${pal.ring}" opacity="0.2" />
  <circle cx="100" cy="100" r="90" fill="none" stroke="${pal.ring}" stroke-opacity="0.3" stroke-width="3" />
  <text x="100" y="116" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="52" font-weight="bold" letter-spacing="2">${initials || 'VN'}</text>
</svg>`;
};

export const createApiApp = (): Express => {
  const app = express();

  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // Khởi tạo kết nối, tạo 6 bảng (Collections) và nạp dữ liệu từ MongoDB Atlas ngay khi khởi động
  hydrateMemoryStateFromMongo(db.state, true).catch(() => {});

  // Tạo ảnh đại diện chữ cái mặc định cho người dùng chưa tải ảnh riêng
  app.get('/api/media/avatar/:seed', (req, res) => {
    const svg = renderAvatarSvg(req.params.seed);
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(200).send(svg);
  });

  // Phục vụ file ảnh nhị phân tốc độ cao với bộ nhớ đệm trình duyệt (tránh nhúng chuỗi base64 nhiều MB vào JSON)
  app.get('/api/media/file/:filename', (req, res) => {
    const media = resolveMediaFileBuffer(req.params.filename);
    if (!media) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', media.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.status(200).send(media.buffer);
  });

  // Đồng bộ dữ liệu từ MongoDB Atlas không chặn luồng (non-blocking sau khi đã khởi tạo)
  app.use('/api', async (req, _res, next) => {
    if (!req.path.startsWith('/media/') && !req.path.startsWith('/messages/stream')) {
      if (!hasCompletedInitialMongoHydration() && db.state.users.length <= 1) {
        await Promise.race([
          hydrateMemoryStateFromMongo(db.state),
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
      } else if (req.method === 'GET') {
        hydrateMemoryStateFromMongo(db.state).catch(() => {});
      } else {
        markMongoStateMutated();
      }
    }
    next();
  });

  // Resource-separated REST API Routers
  app.use('/api/auth', authRouter);
  app.use('/api/posts', postRouter);
  app.use('/api/users', userRouter);
  app.use('/api/notifications', notificationRouter);
  app.use('/api/messages', messageRouter);
  app.use('/api/reports', reportRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/uploads', uploadRouter);

  // Catch unmatched /api/* routes with 404 JSON
  app.use('/api', notFoundHandler);

  // Centralized error handling middleware
  app.use(centralizedErrorHandler);

  return app;
};

