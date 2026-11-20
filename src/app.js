import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import morgan from 'morgan';
import hpp from 'hpp';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from './config/env.js';
import authRoutes from './routes/authRoutes.js';
import portfolioRoutes from './routes/portfolioRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { rateLimit } from './middleware/rateLimiters.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.set('trust proxy', 1);
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: env.nodeEnv === 'production' ? undefined : false,
}));
const allowOrigin = (origin, cb) => {
  if (!origin) return cb(null, true);
  if (env.clientUrls.includes(origin)) return cb(null, true);
  // allow Vercel preview/prod frontends if needed
  if (/\.vercel\.app$/.test(new URL(origin).host)) return cb(null, true);
  return cb(null, false);
};

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (env.clientUrls.includes(origin) || /\.vercel\.app$/.test(origin.replace(/^https?:\/\//, ''))) return cb(null, origin);
    return cb(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(compression());
app.use(hpp());

// Basic CSRF mitigation for cookie-based auth endpoints: enforce same-origin
app.use('/api/auth', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  const ok = env.clientUrls.includes(origin) || /\.vercel\.app$/.test(origin.replace(/^https?:\/\//, ''));
  if (!ok) return res.status(403).json({ message: 'Invalid origin' });
  next();
});

// serve static repo assets/uploads
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'kemmstudio-backend', timestamp: new Date().toISOString() }));

app.get(['/', '/health'], async (req, res) => {
  let dbStatus = 'unknown';
  try {
    const { dbReady, pgPool } = await import('./config/db.js');
    if (dbReady) {
      await pgPool.query('SELECT 1');
      dbStatus = 'connected';
    } else {
      dbStatus = 'not connected (in-memory fallback)';
    }
  } catch {
    dbStatus = 'error';
  }
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Kemmstudio Backend Health</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0a0a0a;color:#f5f5f5;margin:0;padding:40px} .card{max-width:720px;margin:0 auto;background:#171717;border:1px solid #2a2a2a;border-radius:16px;padding:24px} h1{margin:0 0 8px} .ok{color:#2ecc71;font-weight:700} .muted{color:#b3b3b3} .row{margin:10px 0} code{background:#101010;padding:2px 6px;border-radius:6px}</style>
</head><body><div class="card">
<h1>Kemmstudio Backend</h1>
<p class="muted">Kuria Entertainment Music and Movie Studio — API service</p>
<div class="row"><strong>Status:</strong> <span class="ok">OK</span></div>
<div class="row"><strong>Database:</strong> ${dbStatus}</div>
<div class="row"><strong>Timestamp:</strong> ${new Date().toISOString()}</div>
<div class="row"><strong>Health endpoint:</strong> <code>/api/health</code></div>
<div class="row"><strong>API base:</strong> <code>/api</code></div>
</div></body></html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
});
app.use('/api', rateLimit('api'));
app.use('/api/auth', authRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api', bookingRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
