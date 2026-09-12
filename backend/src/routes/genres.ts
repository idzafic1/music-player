import { FastifyInstance, FastifyRequest } from 'fastify';
import { listGenres } from '../services/library.js';

export async function genreRoutes(fastify: FastifyInstance) {
  // GET /genres - list all genres with song counts
  fastify.get('/api/genres', async (request: FastifyRequest<{
    Querystring: { limit?: string; offset?: string }
  }>) => {
    return listGenres(
      request.query.limit ? parseInt(request.query.limit, 10) : 50,
      request.query.offset ? parseInt(request.query.offset, 10) : 0
    );
  });
}
