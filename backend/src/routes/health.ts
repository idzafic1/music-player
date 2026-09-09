import { FastifyInstance } from 'fastify';

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: Math.floor(Date.now() / 1000) };
  });

  fastify.get('/api/health', async () => {
    return { status: 'ok', timestamp: Math.floor(Date.now() / 1000) };
  });
}
