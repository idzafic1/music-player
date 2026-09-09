import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index.js';
import { getSongById } from '../services/library.js';

export async function playRoutes(fastify: FastifyInstance) {
  // POST /plays - record qualifying play
  fastify.post('/api/plays', async (request: FastifyRequest<{
    Body: {
      songId: string;
      secondsPlayed: number;
      sourceContext?: string;
    }
  }>, reply: FastifyReply) => {
    const { songId, secondsPlayed, sourceContext } = request.body || {};

    if (!songId || typeof secondsPlayed !== 'number') {
      return reply.status(400).send({
        error: { code: 'INVALID_REQUEST', message: 'songId and secondsPlayed are required' }
      });
    }

    const song = getSongById(songId);
    if (!song) {
      return reply.status(404).send({
        error: { code: 'SONG_NOT_FOUND', message: `Song with ID ${songId} not found` }
      });
    }

    // Sanity check: >= 15 seconds
    if (secondsPlayed < 15) {
      return reply.status(400).send({
        error: { code: 'NOT_QUALIFYING', message: 'secondsPlayed must be >= 15' }
      });
    }

    // Sanity check: <= song.duration_sec (with 5s grace margin)
    if (song.durationSec > 0 && secondsPlayed > song.durationSec + 5) {
      return reply.status(400).send({
        error: { code: 'EXCEEDS_DURATION', message: 'secondsPlayed exceeds song duration' }
      });
    }

    const db = getDb();
    const id = uuidv4();
    const playedAt = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO plays (id, song_id, played_at, seconds_played, source_context)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, songId, playedAt, Math.round(secondsPlayed), sourceContext || 'library');

    return reply.status(201).send({
      id,
      songId,
      playedAt,
      secondsPlayed: Math.round(secondsPlayed),
      sourceContext: sourceContext || 'library'
    });
  });
}
