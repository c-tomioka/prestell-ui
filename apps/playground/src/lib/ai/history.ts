// Trim the locally persisted chat history to what the server accepts per
// request (`MAX_MESSAGES` in server/ai/validate.ts). The full thread stays in
// the browser; only the request window is cut.
import type { UIMessage } from "ai";

/** Below the server's hard limit (60) to leave room for the fix loop. */
export const MAX_CHAT_CONTEXT_MESSAGES = 40;

export function trimForRequest<M extends UIMessage>(
	messages: M[],
	max = MAX_CHAT_CONTEXT_MESSAGES,
): M[] {
	if (messages.length <= max) return messages;
	let window = messages.slice(-max);
	// Providers expect a conversation to start with a user turn.
	const firstUser = window.findIndex((m) => m.role === "user");
	if (firstUser > 0) window = window.slice(firstUser);
	return window;
}
