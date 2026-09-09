import { buildApp } from './app.js';
import { PORT, HOST } from './config.js';
import { initRecommendationsScheduler } from './services/recommendations.js';

async function startServer() {
  const app = await buildApp();
  initRecommendationsScheduler();

  try {
    const address = await app.listen({ port: PORT, host: HOST });
    console.log(`Backend server listening at ${address}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
