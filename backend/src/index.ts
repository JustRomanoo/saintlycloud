import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { initSchema, getDbPath } from './db.js';
import { authRouter } from './routes/auth.js';
import { syncRouter } from './routes/sync.js';
import { devicesRouter } from './routes/devices.js';
import { oauthRouter } from './routes/oauth.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3721');
const IS_DEV = process.env.NODE_ENV !== 'production';

app.set('trust proxy', 1);

const defaultOrigins = IS_DEV
  ? 'http://localhost:5174,http://localhost:4173,http://localhost:3721,http://tauri.localhost,https://tauri.localhost,tauri://localhost,https://saintlycloud.vercel.app'
  : 'http://tauri.localhost,https://tauri.localhost,tauri://localhost,https://saintlycloud.vercel.app';

const allowedOrigins = (process.env.CORS_ORIGIN || defaultOrigins)
  .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origin === 'null' || origin.startsWith('tauri://') || origin.startsWith('http://tauri.localhost') || origin.startsWith('https://tauri.localhost') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked origin: ${origin}`);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  }
}));
app.use(express.json({ limit: '10mb' }));

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Try again in a minute.' },
});

app.use('/api/create-account', authLimiter);
app.use('/api/recover', authLimiter);
app.use('/api/link-device', authLimiter);

const startTime = Date.now();

if (IS_DEV) {
  app.use((req, _res, next) => {
    const safe = { method: req.method, url: req.url, ip: req.ip };
    console.log(`[${new Date().toISOString()}] ${safe.method} ${safe.url} from ${safe.ip}`);
    next();
  });
}

initSchema();
console.log(`[DB] Schema initialized — all tables ready`);
console.log(`[DB] Database location: ${getDbPath()}`);

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'saintlycloud',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    status: 'ok',
    service: 'saintlycloud',
    version: '1.1.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    environment: IS_DEV ? 'development' : 'production',
    database: getDbPath(),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', authRouter);
app.use('/api', syncRouter);
app.use('/api', devicesRouter);
app.use('/api', oauthRouter);

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(`[ERROR] ${err.message || 'Unknown error'}`);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`SaintlyCloud v1.1.0 running on port ${PORT} [${IS_DEV ? 'development' : 'production'}]`);
});
