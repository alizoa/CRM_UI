// src/hooks/useWhatsAppAttentionCount.ts — demo mode

export function markConversationAttentionCleared() {
  // no-op in demo mode
}

export function useWhatsAppAttentionCount() {
  return { attentionCount: 1 };
}
