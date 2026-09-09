import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { 
  getDailyRecommendations, 
  refreshDailyRecommendations, 
  getGenreRecommendations 
} from '../services/recommendations.js';

export async function recommendationRoutes(fastify: FastifyInstance) {
  // GET /recommendations/daily
  fastify.get('/api/recommendations/daily', async () => {
    return getDailyRecommendations();
  });

  // POST /recommendations/refresh
  fastify.post('/api/recommendations/refresh', async () => {
    const refreshed = await refreshDailyRecommendations();
    return refreshed;
  });

  // GET /recommendations/genre/:genreName
  fastify.get('/api/recommendations/genre/:genreName', async (request: FastifyRequest<{
    Params: { genreName: string }
  }>, reply: FastifyReply) => {
    const { genreName } = request.params;
    if (!genreName || !genreName.trim()) {
      return reply.status(400).send({
        error: { code: 'INVALID_REQUEST', message: 'genreName is required' }
      });
    }

    const results = await getGenreRecommendations(genreName);
    return results;
  });
}
