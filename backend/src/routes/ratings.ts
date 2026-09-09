import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { setRating, removeRating } from '../services/library.js';

export async function ratingRoutes(fastify: FastifyInstance) {
  // PUT /ratings/:songId - set/overwrite rating
  fastify.put('/api/ratings/:songId', async (request: FastifyRequest<{
    Params: { songId: string };
    Body: { stars: number }
  }>, reply: FastifyReply) => {
    const { stars } = request.body || {};
    if (typeof stars !== 'number' || stars < 1 || stars > 5) {
      return reply.status(400).send({
        error: { code: 'INVALID_RATING', message: 'stars must be an integer between 1 and 5' }
      });
    }
    const success = setRating(request.params.songId, stars);
    if (!success) {
      return reply.status(404).send({
        error: { code: 'SONG_NOT_FOUND', message: `Song with ID ${request.params.songId} not found` }
      });
    }
    return { success: true, stars };
  });

  // DELETE /ratings/:songId - clear rating
  fastify.delete('/api/ratings/:songId', async (request: FastifyRequest<{
    Params: { songId: string }
  }>) => {
    removeRating(request.params.songId);
    return { success: true, stars: null };
  });
}
