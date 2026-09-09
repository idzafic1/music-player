import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { search } from '../services/youtubeMusic.js';

export async function searchRoutes(fastify: FastifyInstance) {
  // GET /search/online?q=
  fastify.get('/api/search/online', async (request: FastifyRequest<{
    Querystring: { q?: string; limit?: string }
  }>, reply: FastifyReply) => {
    const { q, limit } = request.query;
    if (!q || !q.trim()) {
      return reply.status(400).send({
        error: { code: 'INVALID_REQUEST', message: 'Query parameter q is required' }
      });
    }

    const results = await search(q.trim(), limit ? parseInt(limit, 10) : 15);
    return results;
  });
}
