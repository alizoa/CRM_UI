// src/lib/attachments.ts — demo mode
import type { EntityType } from './notes';

export const ATTACHMENTS_PATH = '/api/attachments';

export type { EntityType };

export type Attachment = {
  id: string;
  entityType: EntityType;
  entityId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
  uploadedById: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AttachmentFilters = {
  entityType?: EntityType;
  entityId?: string;
  page?: number;
  limit?: number;
};

export type AttachmentsResponse = {
  data: Attachment[];
  total: number;
  page: number;
  limit: number;
};

export function listAttachments(_token: string, filters: AttachmentFilters = {}): Promise<AttachmentsResponse> {
  void filters;
  return Promise.resolve({ data: [], total: 0, page: 1, limit: 20 });
}
