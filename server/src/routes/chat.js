import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { apiLimiter, chatDailyLimiter, chatLimiter } from '../auth/rateLimit.js';
import { answer, assistantKind } from '../chat/assistant.js';
import { toolsFor } from '../chat/tools.js';

const router = Router();

export const MAX_QUESTION_LENGTH = 500;
export const MAX_MESSAGES = 20;

router.use(apiLimiter);
router.use(requireAuth);

// GET /api/chat/options - whether the assistant is on, and what it can look up for this role.
router.get('/options', (req, res) => {
  res.json({ enabled: true, assistant: assistantKind(), tools: toolsFor(req.user).map((t) => t.name) });
});

// The conversation so far, oldest first, ending with the user's new question.
function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return 'messages must be a non-empty list';
  if (messages.length > MAX_MESSAGES) return `The conversation is too long: at most ${MAX_MESSAGES} messages. Start a new one.`;
  for (const m of messages) {
    if (!m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string') return 'Each message needs a role (user or assistant) and text';
  }
  const last = messages.at(-1);
  if (last.role !== 'user') return 'The last message must be the question';
  if (!last.content.trim()) return 'Ask a question';
  if (last.content.length > MAX_QUESTION_LENGTH) return `A question can be at most ${MAX_QUESTION_LENGTH} characters`;
  return null;
}

// POST /api/chat { messages } - the answer as server-sent events: { type: 'text', text } parts,
// then { type: 'done' }, or { type: 'error', message } if it fails after it started.
router.post('/', chatLimiter, chatDailyLimiter, async (req, res) => {
  const error = validateMessages(req.body.messages);
  if (error) return res.status(400).json({ message: error });

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    // Hosting proxies may otherwise hold the answer back until it's complete.
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  // The user closed the chat or left: stop, including a model call that is still running.
  const stop = new AbortController();
  res.on('close', () => stop.abort());
  try {
    const messages = req.body.messages.map(({ role, content }) => ({ role, content }));
    for await (const text of answer({ messages, user: req.user, signal: stop.signal })) {
      if (stop.signal.aborted) return;
      send({ type: 'text', text });
    }
    send({ type: 'done' });
  } catch (err) {
    if (stop.signal.aborted) return;
    console.error('Assistant failed:', err);
    send({ type: 'error', message: 'Sorry, something went wrong while answering. Please try again.' });
  }
  res.end();
});

export default router;
