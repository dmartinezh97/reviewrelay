import { FastifyInstance } from 'fastify';
import { config } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { verifyGiteaSignature } from './verifyHmac.js';

export async function giteaWebhookRoutes(app: FastifyInstance) {
  app.post('/webhooks/gitea', async (request, reply) => {
    const rawBody = (request as unknown as { rawBody: string }).rawBody;

    // Verify Authorization header if configured
    if (config.GITEA_WEBHOOK_AUTH_HEADER) {
      const authHeader = request.headers['authorization'];
      if (authHeader !== config.GITEA_WEBHOOK_AUTH_HEADER) {
        return reply.code(401).send({ error: 'Invalid authorization header' });
      }
    }

    // Verify HMAC signature if configured
    if (config.GITEA_WEBHOOK_SECRET) {
      const signature = request.headers['x-gitea-signature'] as string | undefined;
      if (!signature || !verifyGiteaSignature(rawBody, config.GITEA_WEBHOOK_SECRET, signature)) {
        return reply.code(401).send({ error: 'Invalid signature' });
      }
    }

    const deliveryId = request.headers['x-gitea-delivery'] as string | undefined;
    const event = request.headers['x-gitea-event'] as string | undefined;

    if (!deliveryId || !event) {
      return reply.code(400).send({ error: 'Missing Gitea headers' });
    }

    // Dedupe by delivery ID
    const existing = await prisma.webhookDelivery.findUnique({
      where: { source_deliveryId: { source: 'gitea', deliveryId } },
    });
    if (existing) {
      return reply.code(200).send({ status: 'already_processed' });
    }

    // Record delivery
    await prisma.webhookDelivery.create({
      data: { source: 'gitea', deliveryId, event },
    });

    const body = request.body as Record<string, unknown>;
    const action = body.action as string | undefined;

    // Only process PR opened/synchronized events
    if (event === 'pull_request' && (action === 'opened' || action === 'synchronized')) {
      // Fire-and-forget: import dynamically to avoid circular deps at startup
      import('../services/prMirrorService.js')
        .then(({ handlePrMirror }) => handlePrMirror(body, app.log))
        .catch((err) => app.log.error({ err }, 'Error processing Gitea PR webhook'));
    }

    return reply.code(202).send({ status: 'accepted' });
  });
}
