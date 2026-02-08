import { FastifyInstance } from 'fastify';
import { config } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { verifyGitHubSignature } from './verifyHmac.js';

export async function githubWebhookRoutes(app: FastifyInstance) {
  app.post('/webhooks/github', async (request, reply) => {
    const rawBody = (request as unknown as { rawBody: string }).rawBody;

    // Verify HMAC signature
    const signature = request.headers['x-hub-signature-256'] as string | undefined;
    if (
      !signature ||
      !verifyGitHubSignature(rawBody, config.GITHUB_WEBHOOK_SECRET, signature)
    ) {
      return reply.code(401).send({ error: 'Invalid signature' });
    }

    const deliveryId = request.headers['x-github-delivery'] as string | undefined;
    const event = request.headers['x-github-event'] as string | undefined;

    if (!deliveryId || !event) {
      return reply.code(400).send({ error: 'Missing GitHub headers' });
    }

    // Dedupe by delivery ID
    const existing = await prisma.webhookDelivery.findUnique({
      where: { source_deliveryId: { source: 'github', deliveryId } },
    });
    if (existing) {
      return reply.code(200).send({ status: 'already_processed' });
    }

    // Record delivery
    await prisma.webhookDelivery.create({
      data: { source: 'github', deliveryId, event },
    });

    const body = request.body as Record<string, unknown>;
    const action = body.action as string | undefined;

    // Only process submitted pull_request_review events
    if (event === 'pull_request_review' && action === 'submitted') {
      import('../services/reviewIngestService.js')
        .then(({ handleReviewIngest }) => handleReviewIngest(body, app.log))
        .catch((err) => app.log.error({ err }, 'Error processing GitHub review webhook'));
    }

    return reply.code(202).send({ status: 'accepted' });
  });
}
