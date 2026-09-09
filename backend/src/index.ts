import { buildApp } from './app.js';
import { PORT, HOST } from './config.js';
import { getDb } from './db/index.js';
import { initRecommendationsScheduler } from './services/recommendations.js';
import { initDownloader } from './services/downloader.js';

async function startServer() {
  const app = await buildApp();
  
  // Cleanup stale jobs and start cron scheduler
  initDownloader();
  initRecommendationsScheduler();

  // Graceful shutdown handling
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  signals.forEach((signal) => {
    process.on(signal, async () => {
      console.log(`\nReceived ${signal}. Gracefully shutting down...`);
      try {
        await app.close();
        getDb().close();
        console.log('Server and database closed successfully.');
      } catch (err) {
        console.error('Error during shutdown:', err);
      } finally {
        process.exit(0);
      }
    });
  });

  // Catch unexpected unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  try {
    const address = await app.listen({ port: PORT, host: HOST });
    console.log(`Backend server listening at ${address}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
