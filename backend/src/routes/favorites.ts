import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { listFavorites, setFavorite, removeFavorite } from '../services/library.js';

export async function favoriteRoutes(fastify: FastifyInstance) {
  // GET /favorites
  fastify.get('/api/favorites', async (request: FastifyRequest<{
    Querystring: { limit?: string; offset?: string }
  }>) => {
    const { limit, offset } = request.query;
    return listFavorites(
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0
    );
  });

  // PUT /favorites/:songId - idempotent
  fastify.put('/api/favorites/:songId', async (request: FastifyRequest<{
    Params: { songId: string }
  }>, reply: FastifyReply) => {
    const success = setFavorite(request.params.songId);
    if (!success) {
      return reply.status(404).send({
        error: { code: 'SONG_NOT_FOUND', message: `Song with ID ${request.params.songId} not found` }
      });
    }
    return { success: true, isFavorite: true };
  });

  // DELETE /favorites/:songId - unmark
  fastify.delete('/api/favorites/:songId', async (request: FastifyRequest<{
    Params: { songId: string }
  }>) => {
    removeFavorite(request.params.songId);
    return { success: true, isFavorite: false };
  });
}
