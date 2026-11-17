// Which assistant answers: the AI one when a provider is set up (aiAssistant.js), otherwise the
// basic one. If the AI provider fails before any text was sent (out of free quota, down, too
// slow), the basic assistant answers that question instead, so the user still gets an answer.
import { aiConfig, reply as aiReply } from './aiAssistant.js';
import { reply as basicReply } from './basicAssistant.js';

export const assistantKind = () => (aiConfig() ? 'ai' : 'basic');

// messages: the conversation, oldest first, ending with the question. Yields the answer in parts.
// answered.by is set to 'ai' or 'basic': which one actually answered this question.
export async function* answer({ messages, user, signal, answered = {} }) {
  const question = messages.at(-1).content.trim();
  if (!aiConfig()) {
    answered.by = 'basic';
    yield* basicReply({ question, user });
    return;
  }
  answered.by = 'ai';
  let started = false;
  try {
    for await (const part of aiReply({ messages, user, signal })) {
      started = true;
      yield part.text;
    }
  } catch (err) {
    if (started || signal?.aborted) throw err;
    console.warn(`AI assistant failed, the basic assistant answers instead: ${err.message}`);
    answered.by = 'basic';
    yield* basicReply({ question, user });
  }
}
