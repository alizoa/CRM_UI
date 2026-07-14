// src/lib/whatsapp-saved-replies.ts — demo mode

export type WhatsappSavedReply = {
  id: string;
  name: string;
  body: string;
  category: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateSavedReplyInput = {
  name: string;
  body: string;
  category?: string | null;
};

export type UpdateSavedReplyInput = {
  name?: string;
  body?: string;
  category?: string | null;
  isActive?: boolean;
};

export function listSavedReplies(_token: string): Promise<WhatsappSavedReply[]> {
  return Promise.resolve([]);
}

export function createSavedReply(_token: string, input: CreateSavedReplyInput): Promise<WhatsappSavedReply> {
  return Promise.resolve({
    id: `reply-${Date.now()}`,
    name: input.name,
    body: input.body,
    category: input.category ?? null,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export function updateSavedReply(_token: string, id: string, input: UpdateSavedReplyInput): Promise<WhatsappSavedReply> {
  return Promise.resolve({
    id,
    name: input.name ?? 'Reply',
    body: input.body ?? '',
    category: input.category ?? null,
    isActive: input.isActive ?? true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export function deleteSavedReply(_token: string, _id: string): Promise<WhatsappSavedReply> {
  return Promise.resolve({
    id: _id,
    name: '',
    body: '',
    category: null,
    isActive: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}
