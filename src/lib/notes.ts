// src/lib/notes.ts — demo mode
import { DEMO_NOTES } from './mock-data';

export const NOTES_PATH = '/api/notes';

export type EntityType = 'CONTACT' | 'DEAL' | 'LEAD' | 'TASK';

export type Note = {
  id: string;
  entityType: EntityType;
  entityId: string;
  body: string;
  authorId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NoteFilters = {
  entityType?: EntityType;
  entityId?: string;
  page?: number;
  limit?: number;
};

export type NotesResponse = {
  data: Note[];
  total: number;
  page: number;
  limit: number;
};

export type CreateNoteInput = {
  entityType: EntityType;
  entityId: string;
  body: string;
};

export function listNotes(_token: string, filters: NoteFilters = {}): Promise<NotesResponse> {
  let data = [...DEMO_NOTES] as Note[];
  if (filters.entityType) data = data.filter(n => n.entityType === filters.entityType);
  if (filters.entityId) data = data.filter(n => n.entityId === filters.entityId);
  return Promise.resolve({ data, total: data.length, page: filters.page ?? 1, limit: filters.limit ?? 20 });
}

export function createNote(_token: string, _input: CreateNoteInput): Promise<Note> {
  return Promise.resolve(DEMO_NOTES[0] as Note);
}
