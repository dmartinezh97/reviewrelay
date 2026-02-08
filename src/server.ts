import Fastify from 'fastify';
import rawBody from 'fastify-raw-body';
import { config } from './config/env.js';
import { prisma } from './db/prisma.js';
import { giteaWebhookRoutes } from './webhooks/giteaWebhook.js';
import { githubWebhookRoutes } from './webhooks/githubWebhook.js';

export async function startServer() {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
    },
  });

  await app.register(rawBody, {
    field: 'rawBody',
    global: true,
    encoding: 'utf8',
    runFirst: true,
  });

  await app.register(giteaWebhookRoutes);
  await app.register(githubWebhookRoutes);

  app.get('/healthz', async () => {
    return {
      ok: true,
      version: config.APP_VERSION,
      profile: config.BRIDGE_PROFILE,
    };
  });

  const shutdown = async () => {
    app.log.info('Shutting down...');
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  return app;
}
