import { FastifyInstance } from 'fastify';
import { listGenres } from '../services/library.js';

export async function genreRoutes(fastify: FastifyInstance) {
  // GET /genres - list all genres with song counts
  fastify.get('/api/genres', async () => {
    return listGenres();
  });
}
