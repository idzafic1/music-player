import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { THUMBNAILS_DIR } from './config.js';
import { runMigrations } from './db/migrate.js';
import { authMiddleware } from './middleware/auth.js';
import { healthRoutes } from './routes/health.js';
import { songRoutes } from './routes/songs.js';
import { artistRoutes } from './routes/artists.js';
import { playlistRoutes } from './routes/playlists.js';
import { favoriteRoutes } from './routes/favorites.js';
import { ratingRoutes } from './routes/ratings.js';
import { genreRoutes } from './routes/genres.js';
import { playRoutes } from './routes/plays.js';
import { statsRoutes } from './routes/stats.js';
import { settingRoutes } from './routes/settings.js';
import { downloadRoutes } from './routes/downloads.js';
import { searchRoutes } from './routes/search.js';
import { recommendationRoutes } from './routes/recommendations.js';

export async function buildApp(): Promise<FastifyInstance> {
  runMigrations();

  const fastify = Fastify({
    logger: false
  });

  await fastify.register(cors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length']
  });

  await fastify.register(fastifyStatic, {
    root: THUMBNAILS_DIR,
    prefix: '/thumbnails/'
  });

  fastify.addHook('preHandler', authMiddleware);

  fastify.setErrorHandler((error: any, request, reply) => {
    const statusCode = error.statusCode || 500;
    const code = error.code || 'INTERNAL_SERVER_ERROR';
    reply.status(statusCode).send({
      error: {
        code,
        message: error.message || 'An unexpected error occurred'
      }
    });
  });

  await fastify.register(healthRoutes);
  await fastify.register(songRoutes);
  await fastify.register(artistRoutes);
  await fastify.register(playlistRoutes);
  await fastify.register(favoriteRoutes);
  await fastify.register(ratingRoutes);
  await fastify.register(genreRoutes);
  await fastify.register(playRoutes);
  await fastify.register(statsRoutes);
  await fastify.register(settingRoutes);
  await fastify.register(downloadRoutes);
  await fastify.register(searchRoutes);
  await fastify.register(recommendationRoutes);

  return fastify;
}
