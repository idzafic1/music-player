import { FastifyRequest, FastifyReply } from 'fastify';
import { API_TOKEN } from '../config.js';

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  // Short-circuit if API_TOKEN is not set (LAN-only mode)
  if (!API_TOKEN) {
    return;
  }

  // Allow health check and static thumbnail previews without auth
  const url = request.raw.url || '';
  if (url === '/health' || url === '/api/health' || url.startsWith('/thumbnails/')) {
    return;
  }

  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid Authorization header'
      }
    });
    return reply;
  }

  const token = authHeader.slice(7).trim();
  if (token !== API_TOKEN) {
    reply.status(403).send({
      error: {
        code: 'FORBIDDEN',
        message: 'Invalid API token'
      }
    });
    return reply;
  }
}
