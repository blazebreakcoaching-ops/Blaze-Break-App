// React Native Nova text-chat contract. Uses the existing, authenticated
// Express /api/nova/chat route and the same role/parts history shape as
// src/components/NovaChat.tsx. No model credentials, privileged prompts,
// tokens or raw chat content are logged or stored by this module.
export type NovaMobileRole = 'user' | 'model';
export interface NovaMobileMessage {
  role: NovaMobileRole;
  parts: [{ text: string }];
}

export const NOVA_MOBILE_MAX_MESSAGE_LENGTH = 2000;
export const NOVA_MOBILE_HISTORY_LIMIT = 20;

// Only the bounded, already-visible conversation goes to the server.
// This does not send client-supplied systemInstruction or privileged data.
// History stays in React state for now; no unencrypted device persistence.
export function buildNovaMobileChatBody(
  text: string,
  messages: readonly NovaMobileMessage[],
): { message: string; history: NovaMobileMessage[] } {
  const message = text.trim();
  if (!message || message.length > NOVA_MOBILE_MAX_MESSAGE_LENGTH) {
    throw new Error('Write a message of up to 2,000 characters.');
  }
  return {
    message,
    history: messages.slice(-NOVA_MOBILE_HISTORY_LIMIT).map((m) => ({
      role: m.role,
      parts: [{ text: m.parts[0].text.slice(0, NOVA_MOBILE_MAX_MESSAGE_LENGTH) }],
    })),
  };
}
