import { FastifyInstance, FastifyRequest } from 'fastify';
import { getWrappedStats } from '../services/stats.js';

export async function statsRoutes(fastify: FastifyInstance) {
  // GET /stats/wrapped?from=&to=
  fastify.get('/api/stats/wrapped', async (request: FastifyRequest<{
    Querystring: { from?: string; to?: string }
  }>) => {
    const { from, to } = request.query;
    return getWrappedStats(
      from ? parseInt(from, 10) : undefined,
      to ? parseInt(to, 10) : undefined
    );
  });
}
