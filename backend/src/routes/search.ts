import { spawn } from 'node:child_process';
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

  // GET /api/search/online/stream?url=
  fastify.get('/api/search/online/stream', async (request: FastifyRequest<{
    Querystring: { url?: string }
  }>, reply: FastifyReply) => {
    const { url } = request.query;
    if (!url) {
      return reply.status(400).send({
        error: { code: 'INVALID_REQUEST', message: 'url is required' }
      });
    }

    reply.header('Content-Type', 'audio/webm');
    reply.header('Cache-Control', 'no-store');

    const child = spawn('yt-dlp', ['-f', 'bestaudio', '-o', '-', url, '--no-warnings']);
    child.on('error', () => { if (!reply.sent) reply.status(502).send(); });
    return reply.send(child.stdout);
  });
}
