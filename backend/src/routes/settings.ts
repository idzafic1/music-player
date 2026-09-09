import { FastifyInstance, FastifyRequest } from 'fastify';
import { getDb } from '../db/index.js';

export async function settingRoutes(fastify: FastifyInstance) {
  // GET /settings
  fastify.get('/api/settings', async () => {
    const db = getDb();
    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    const result: Record<string, string> = {};
    for (const r of rows) {
      result[r.key] = r.value;
    }
    return result;
  });

  // PATCH /settings
  fastify.patch('/api/settings', async (request: FastifyRequest<{
    Body: Record<string, any>
  }>) => {
    const db = getDb();
    const body = request.body || {};
    const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    
    db.transaction(() => {
      for (const [key, val] of Object.entries(body)) {
        const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
        upsert.run(key, valStr);
      }
    })();

    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    const result: Record<string, string> = {};
    for (const r of rows) {
      result[r.key] = r.value;
    }
    return result;
  });
}
