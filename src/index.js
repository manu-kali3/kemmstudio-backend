import app from './app.js';
import { env } from './config/env.js';
import { connectPostgres } from './config/db.js';
import { initRateLimiters } from './middleware/rateLimiters.js';
import Session from './models/Session.js';

async function startHeartbeatSweeper() {
  const sweep = async () => {
    try {
      const cutoff = new Date(Date.now() - env.heartbeatTimeoutMs);
      const all = await Session.find({ valid: true });
      for (const s of all) {
        if (new Date(s.lastHeartbeat).getTime() < cutoff.getTime()) {
          s.valid = false;
          await s.save();
        }
      }
    } catch (e) {
      console.error('[heartbeat-sweeper]', e.message);
    }
  };
  setInterval(sweep, 30000);
}

let initPromise;
export async function ensureReady() {
  if (!initPromise) {
    initPromise = (async () => {
      await connectPostgres();
      await initRateLimiters();
    })();
  }
  return initPromise;
}

async function start() {
  try {
    await ensureReady();
    if (process.env.VERCEL !== '1') await startHeartbeatSweeper();
    app.listen(env.port, () => {
      console.log(`[server] listening on http://localhost:${env.port}`);
    });
  } catch (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
}

if (process.env.VERCEL !== '1') {
  start();
}

export default app;
