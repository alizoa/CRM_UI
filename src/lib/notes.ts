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

let noteSequence = Date.now();
let demoNotes = DEMO_NOTES.map((note) => ({ ...note })) as Note[];

export function listNotes(_token: string, filters: NoteFilters = {}): Promise<NotesResponse> {
  let data = demoNotes.map((note) => ({ ...note }));
  if (filters.entityType) data = data.filter(n => n.entityType === filters.entityType);
  if (filters.entityId) data = data.filter(n => n.entityId === filters.entityId);
  return Promise.resolve({ data, total: data.length, page: filters.page ?? 1, limit: filters.limit ?? 20 });
}

export function createNote(_token: string, input: CreateNoteInput): Promise<Note> {
  const body = input.body.trim();
  if (!body) {
    return Promise.reject(Object.assign(new Error('Note body is required.'), { status: 422 }));
  }

  noteSequence += 1;
  const now = new Date().toISOString();
  const note: Note = {
    id: `note-demo-${noteSequence}`,
    entityType: input.entityType,
    entityId: input.entityId,
    body,
    authorId: 'usr-demo-1',
    createdAt: now,
    updatedAt: now,
  };
  demoNotes = [note, ...demoNotes];
  return Promise.resolve({ ...note });
}
