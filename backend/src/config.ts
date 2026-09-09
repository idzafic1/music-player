import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';

dotenv.config();

export const PORT = parseInt(process.env.PORT || '3001', 10);
export const HOST = process.env.HOST || '0.0.0.0';
export const API_TOKEN = process.env.API_TOKEN || '';

export const DATA_DIR = process.env.DATA_DIR 
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), 'data');

export const AUDIO_DIR = path.join(DATA_DIR, 'audio');
export const THUMBNAILS_DIR = path.join(DATA_DIR, 'thumbnails');
export const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'music.db');

// Ensure directories exist
fs.mkdirSync(AUDIO_DIR, { recursive: true });
fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
