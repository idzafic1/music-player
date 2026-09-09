import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { downloadSingleSong, importYouTubePlaylist, getJob } from '../services/downloader.js';

export async function downloadRoutes(fastify: FastifyInstance) {
  // POST /downloads - single song download (url or query)
  fastify.post('/api/downloads', async (request: FastifyRequest<{
    Body: { url?: string; query?: string }
  }>, reply: FastifyReply) => {
    const { url, query } = request.body || {};
    const target = (url || query || '').trim();

    if (!target) {
      return reply.status(400).send({
        error: { code: 'INVALID_REQUEST', message: 'url or query is required' }
      });
    }

    const jobId = await downloadSingleSong(target);
    return reply.status(202).send({ jobId });
  });

  // GET /downloads/:jobId - poll status
  fastify.get('/api/downloads/:jobId', async (request: FastifyRequest<{
    Params: { jobId: string }
  }>, reply: FastifyReply) => {
    const job = getJob(request.params.jobId);
    if (!job) {
      return reply.status(404).send({
        error: { code: 'JOB_NOT_FOUND', message: `Download job ${request.params.jobId} not found` }
      });
    }

    return {
      jobId: job.id,
      type: job.type,
      status: job.status,
      songId: job.songId || null,
      playlistId: job.playlistId || null,
      title: job.title || null,
      artistName: job.artistName || null,
      error: job.error || null,
      completedCount: job.completedCount !== undefined ? job.completedCount : null,
      totalCount: job.totalCount !== undefined ? job.totalCount : null,
      failedVideos: job.failedVideos || []
    };
  });

  // POST /downloads/youtube-playlist - import playlist
  fastify.post('/api/downloads/youtube-playlist', async (request: FastifyRequest<{
    Body: { url: string; playlistName?: string }
  }>, reply: FastifyReply) => {
    const { url, playlistName } = request.body || {};
    if (!url || !url.trim()) {
      return reply.status(400).send({
        error: { code: 'INVALID_REQUEST', message: 'url is required' }
      });
    }

    const jobId = await importYouTubePlaylist(url.trim(), playlistName);
    return reply.status(202).send({ jobId });
  });
}
