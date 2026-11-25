import { Router } from 'express';

/**
 * GET /health — always 200 while the process is alive (liveness);
 * `status: "degraded"` tells that a dependency (the database) is down.
 * @param {{ checkDb: () => Promise<import('../db/pool.js').DatabaseStatus>, version: string }} deps
 */
export function createHealthRouter({ checkDb, version }) {
  const router = Router();
  router.get('/', async (_req, res) => {
    const db = await checkDb();
    res.set('Cache-Control', 'no-store').json({
      status: db.ok ? 'ok' : 'degraded',
      version,
      uptimeS: Math.round(process.uptime()),
      checks: { db },
    });
  });
  return router;
}
