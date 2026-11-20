import app from '../src/app.js';
import { ensureReady } from '../src/index.js';

export default async function handler(req, res) {
  await ensureReady();
  return app(req, res);
}
