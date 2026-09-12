import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { 
  listPlaylists, 
  createPlaylist, 
  getPlaylistById, 
  updatePlaylist, 
  deletePlaylist, 
  addSongToPlaylist, 
  removeSongFromPlaylist 
} from '../services/library.js';

export async function playlistRoutes(fastify: FastifyInstance) {
  // GET /playlists
  fastify.get('/api/playlists', async (request: FastifyRequest<{
    Querystring: { limit?: string; offset?: string }
  }>) => {
    return listPlaylists(
      request.query.limit ? parseInt(request.query.limit, 10) : 50,
      request.query.offset ? parseInt(request.query.offset, 10) : 0
    );
  });

  // POST /playlists
  fastify.get('/api/playlists/:id', async (request: FastifyRequest<{
    Params: { id: string }
  }>, reply: FastifyReply) => {
    const playlist = getPlaylistById(request.params.id);
    if (!playlist) {
      return reply.status(404).send({
        error: { code: 'PLAYLIST_NOT_FOUND', message: `Playlist with ID ${request.params.id} not found` }
      });
    }
    return playlist;
  });

  fastify.post('/api/playlists', async (request: FastifyRequest<{
    Body: { name: string; description?: string }
  }>, reply: FastifyReply) => {
    const { name, description } = request.body || {};
    if (!name || !name.trim()) {
      return reply.status(400).send({
        error: { code: 'INVALID_REQUEST', message: 'Playlist name is required' }
      });
    }
    const created = createPlaylist(name, description);
    return reply.status(201).send(created);
  });

  // PATCH /playlists/:id
  fastify.patch('/api/playlists/:id', async (request: FastifyRequest<{
    Params: { id: string };
    Body: { name?: string; description?: string; songOrder?: string[] }
  }>, reply: FastifyReply) => {
    const updated = updatePlaylist(request.params.id, request.body || {});
    if (!updated) {
      return reply.status(404).send({
        error: { code: 'PLAYLIST_NOT_FOUND', message: `Playlist with ID ${request.params.id} not found` }
      });
    }
    return updated;
  });

  // DELETE /playlists/:id
  fastify.delete('/api/playlists/:id', async (request: FastifyRequest<{
    Params: { id: string }
  }>, reply: FastifyReply) => {
    const success = deletePlaylist(request.params.id);
    if (!success) {
      return reply.status(404).send({
        error: { code: 'PLAYLIST_NOT_FOUND', message: `Playlist with ID ${request.params.id} not found` }
      });
    }
    return { success: true };
  });

  // POST /playlists/:id/songs - append
  fastify.post('/api/playlists/:id/songs', async (request: FastifyRequest<{
    Params: { id: string };
    Body: { songId: string }
  }>, reply: FastifyReply) => {
    const { songId } = request.body || {};
    if (!songId) {
      return reply.status(400).send({
        error: { code: 'INVALID_REQUEST', message: 'songId is required' }
      });
    }
    const success = addSongToPlaylist(request.params.id, songId);
    if (!success) {
      return reply.status(400).send({
        error: { code: 'ADD_FAILED', message: 'Failed to add song to playlist. Verify both IDs exist.' }
      });
    }
    return { success: true };
  });

  // DELETE /playlists/:id/songs/:songId - remove from playlist
  fastify.delete('/api/playlists/:id/songs/:songId', async (request: FastifyRequest<{
    Params: { id: string; songId: string }
  }>, reply: FastifyReply) => {
    const success = removeSongFromPlaylist(request.params.id, request.params.songId);
    if (!success) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Song or playlist not found in relation' }
      });
    }
    return { success: true };
  });
}
