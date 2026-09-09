import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { listSongs, getSongById, updateSong, deleteSong, setSongGenres } from '../services/library.js';
import { streamAudioFile } from '../services/streaming.js';

export async function songRoutes(fastify: FastifyInstance) {
  // GET /songs - list with q, genre, sort, limit, offset
  fastify.get('/api/songs', async (request: FastifyRequest<{
    Querystring: {
      q?: string;
      genre?: string;
      sort?: 'title' | 'added_at' | 'play_count';
      limit?: string;
      offset?: string;
    }
  }>, reply: FastifyReply) => {
    const { q, genre, sort, limit, offset } = request.query;
    const result = listSongs({
      q,
      genre,
      sort,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0
    });
    return result;
  });

  // GET /songs/:id - full song detail
  fastify.get('/api/songs/:id', async (request: FastifyRequest<{
    Params: { id: string }
  }>, reply: FastifyReply) => {
    const song = getSongById(request.params.id);
    if (!song) {
      return reply.status(404).send({
        error: { code: 'SONG_NOT_FOUND', message: `Song with ID ${request.params.id} not found` }
      });
    }
    return song;
  });

  // GET /songs/:id/stream - stream audio file with range support
  fastify.get('/api/songs/:id/stream', async (request: FastifyRequest<{
    Params: { id: string }
  }>, reply: FastifyReply) => {
    const song = getSongById(request.params.id);
    if (!song) {
      return reply.status(404).send({
        error: { code: 'SONG_NOT_FOUND', message: `Song with ID ${request.params.id} not found` }
      });
    }
    return streamAudioFile(song.filePath, request, reply);
  });

  // DELETE /songs/:id - remove DB row and disk files
  fastify.delete('/api/songs/:id', async (request: FastifyRequest<{
    Params: { id: string }
  }>, reply: FastifyReply) => {
    const success = deleteSong(request.params.id);
    if (!success) {
      return reply.status(404).send({
        error: { code: 'SONG_NOT_FOUND', message: `Song with ID ${request.params.id} not found` }
      });
    }
    return { success: true };
  });

  // PATCH /songs/:id - update metadata (title, artist, genres)
  fastify.patch('/api/songs/:id', async (request: FastifyRequest<{
    Params: { id: string };
    Body: { title?: string; artistName?: string; genreNames?: string[] }
  }>, reply: FastifyReply) => {
    const updated = updateSong(request.params.id, request.body || {});
    if (!updated) {
      return reply.status(404).send({
        error: { code: 'SONG_NOT_FOUND', message: `Song with ID ${request.params.id} not found` }
      });
    }
    return updated;
  });

  // PATCH /songs/:id/genres - replace a song's genre tags
  fastify.patch('/api/songs/:id/genres', async (request: FastifyRequest<{
    Params: { id: string };
    Body: { genreNames: string[] }
  }>, reply: FastifyReply) => {
    const { genreNames } = request.body || {};
    if (!Array.isArray(genreNames)) {
      return reply.status(400).send({
        error: { code: 'INVALID_REQUEST', message: 'genreNames must be an array of strings' }
      });
    }
    const song = getSongById(request.params.id);
    if (!song) {
      return reply.status(404).send({
        error: { code: 'SONG_NOT_FOUND', message: `Song with ID ${request.params.id} not found` }
      });
    }
    setSongGenres(request.params.id, genreNames);
    return getSongById(request.params.id);
  });
}
