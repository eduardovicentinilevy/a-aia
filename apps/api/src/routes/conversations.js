import { Router } from 'express';
import { z } from 'zod';
import { openEventStream } from '../lib/sse.js';
import { notFound } from '../middleware/errors.js';

const Title = z.string().trim().min(1, 'O título está vazio.').max(120, 'O título passou de 120 caracteres.');

const CreateConversationBody = z.strictObject({ title: Title.optional() });

const RenameConversationBody = z.strictObject({ title: Title });

const SendMessageBody = z.strictObject({
  content: z.string().trim().min(1, 'A mensagem está vazia.').max(8000, 'A mensagem passou de 8000 caracteres.'),
});

/**
 * Conversation routes: CRUD, history and sending a message (answer streamed as SSE).
 * Every route only sees the conversations of the logged-in user (req.user.id).
 * @param {object} deps
 * @param {import('../db/store.js').Store} deps.store
 * @param {ReturnType<typeof import('../orchestrator/pipeline.js').createChatPipeline>} deps.pipeline
 * @param {ReturnType<typeof import('../orchestrator/usage.js').createUsageLimits>} deps.usageLimits
 * @param {import('express').RequestHandler} deps.messageRateLimit
 * @param {import('../lib/logger.js').Logger} deps.logger
 */
export function createConversationsRouter({ store, pipeline, usageLimits, messageRateLimit, logger }) {
  const router = Router();

  /**
   * Loads a conversation owned by the current user or throws 404.
   * @param {import('express').Request} req
   */
  async function findOwnedConversation(req) {
    const id = z.uuid().safeParse(req.params.id);
    const conversation = id.success ? await store.getConversation(id.data, /** @type {any} */ (req).user.id) : null;
    if (!conversation) throw notFound('Conversa não encontrada.');
    return conversation;
  }

  router.post('/', async (req, res) => {
    const body = CreateConversationBody.parse(req.body ?? {});
    const conversation = await store.createConversation({ userId: /** @type {any} */ (req).user.id, title: body.title });
    res.status(201).json(conversation);
  });

  router.get('/', async (req, res) => {
    res.json({ conversations: await store.listConversations(/** @type {any} */ (req).user.id) });
  });

  router.patch('/:id', async (req, res) => {
    const body = RenameConversationBody.parse(req.body ?? {});
    const conversation = await findOwnedConversation(req);
    await store.updateConversation(conversation.id, { title: body.title });
    res.json(await store.getConversation(conversation.id, /** @type {any} */ (req).user.id));
  });

  router.delete('/:id', async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    const deleted = id.success && (await store.deleteConversation(id.data, /** @type {any} */ (req).user.id));
    if (!deleted) throw notFound('Conversa não encontrada.');
    res.status(204).end();
  });

  router.get('/:id/messages', async (req, res) => {
    const conversation = await findOwnedConversation(req);
    res.json({ messages: await store.listMessages(conversation.id) });
  });

  // Sends a user message and streams the answer as Server-Sent Events:
  // meta → token* → done   (or meta → token* → error). `done` may carry `replacement`
  // when output moderation replaced the answer.
  router.post('/:id/messages', messageRateLimit, async (req, res) => {
    const body = SendMessageBody.parse(req.body);
    const conversation = await findOwnedConversation(req);
    const userId = /** @type {any} */ (req).user.id;
    // Limits are checked BEFORE streaming starts, so they come back as a normal JSON error (429/503).
    await usageLimits.assertWithinLimits(userId);

    // If the client disconnects (closes the tab, presses "stop"), cancel the model call.
    const controller = new AbortController();
    res.once('close', () => {
      if (!res.writableFinished) controller.abort();
    });

    const stream = openEventStream(res);
    try {
      await pipeline.handleMessage({
        userId,
        conversation,
        content: body.content,
        signal: controller.signal,
        emit: stream.send,
      });
    } catch (err) {
      logger.error('chat_pipeline_failed', { conversationId: conversation.id, error: err });
      stream.send('error', { code: 'internal', message: 'Algo deu errado ao gerar a resposta. Tente de novo.' });
    } finally {
      stream.end();
    }
  });

  return router;
}
