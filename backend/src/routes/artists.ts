import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { listArtists, getArtistById } from '../services/library.js';

export async function artistRoutes(fastify: FastifyInstance) {
  // GET /artists - list with song counts
  fastify.get('/api/artists', async (request: FastifyRequest<{
    Querystring: { limit?: string; offset?: string }
  }>) => {
    return listArtists(
      request.query.limit ? parseInt(request.query.limit, 10) : 50,
      request.query.offset ? parseInt(request.query.offset, 10) : 0
    );
  });

  // GET /artists/:id - detail + their songs
  fastify.get('/api/artists/:id', async (request: FastifyRequest<{
    Params: { id: string }
  }>, reply: FastifyReply) => {
    const result = getArtistById(request.params.id);
    if (!result) {
      return reply.status(404).send({
        error: { code: 'ARTIST_NOT_FOUND', message: `Artist with ID ${request.params.id} not found` }
      });
    }
    return result;
  });
}
