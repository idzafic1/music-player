import fs from 'node:fs';
import path from 'node:path';
import { FastifyRequest, FastifyReply } from 'fastify';

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.m4a':
      return 'audio/mp4';
    case '.mp3':
      return 'audio/mpeg';
    case '.opus':
      return 'audio/ogg';
    case '.ogg':
      return 'audio/ogg';
    case '.webm':
      return 'audio/webm';
    case '.wav':
      return 'audio/wav';
    case '.flac':
      return 'audio/flac';
    default:
      return 'application/octet-stream';
  }
}

export function streamAudioFile(filePath: string, request: FastifyRequest, reply: FastifyReply) {
  if (!fs.existsSync(filePath)) {
    reply.status(404).send({
      error: {
        code: 'FILE_NOT_FOUND',
        message: 'Audio file not found on disk'
      }
    });
    return;
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const mimeType = getMimeType(filePath);
  const rangeHeader = request.headers.range;

  if (!rangeHeader) {
    reply.header('Content-Type', mimeType);
    reply.header('Content-Length', fileSize);
    reply.header('Accept-Ranges', 'bytes');
    return reply.send(fs.createReadStream(filePath));
  }

  // Parse Range header (e.g. "bytes=0-1024" or "bytes=1024-")
  const parts = rangeHeader.replace(/bytes=/, '').split('-');
  const start = parseInt(parts[0], 10);
  const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

  if (isNaN(start) || start >= fileSize || (parts[1] && end >= fileSize) || start > end) {
    reply.status(416).header('Content-Range', `bytes */${fileSize}`).send();
    return;
  }

  const chunkSize = end - start + 1;
  const stream = fs.createReadStream(filePath, { start, end });

  reply.status(206);
  reply.header('Content-Range', `bytes ${start}-${end}/${fileSize}`);
  reply.header('Accept-Ranges', 'bytes');
  reply.header('Content-Length', chunkSize);
  reply.header('Content-Type', mimeType);

  return reply.send(stream);
}
