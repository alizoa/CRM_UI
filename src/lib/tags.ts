// src/lib/tags.ts — demo mode
import { DEMO_TAGS } from './mock-data';

export const TAGS_PATH = '/api/settings/tags';

export type Tag = {
  id: string;
  name: string;
  color: string | null;
};

export type TagOption = Tag;

export type CreateTagInput = {
  name: string;
  color?: string;
};

export type UpdateTagInput = {
  name: string;
  color: string | null;
};

export async function listTags(_token: string): Promise<Tag[]> {
  return DEMO_TAGS.map(t => ({ id: t.id, name: t.name, color: t.color }));
}

export async function listTagOptions(_token: string): Promise<TagOption[]> {
  return listTags(_token);
}

export async function createTag(_token: string, input: CreateTagInput): Promise<Tag> {
  return { id: `tag-new-${Date.now()}`, name: input.name, color: input.color ?? null };
}

export async function updateTag(_token: string, id: string, input: UpdateTagInput): Promise<Tag> {
  const existing = DEMO_TAGS.find(t => t.id === id);
  return { id, name: input.name, color: input.color ?? existing?.color ?? null };
}

export function deleteTag(_token: string, _id: string): Promise<void> {
  return Promise.resolve();
}
