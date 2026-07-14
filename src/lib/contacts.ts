// src/lib/contacts.ts — demo mode
import { DEMO_CONTACTS } from './mock-data';

export const CONTACTS_PATH = '/api/contacts';

export type ContactStatus = 'PROSPECT' | 'CUSTOMER' | 'ARCHIVED';

export type Contact = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  status: ContactStatus;
  leadSourceId: string | null;
  ownerId: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tags: Array<{
    id: string;
    tagId: string;
    tag: {
      id: string;
      name: string;
      color: string | null;
    };
  }>;
  owner: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
  leadSource: {
    id: string;
    name: string;
  } | null;
};

export type ContactsResponse = {
  data: Contact[];
  total: number;
  page: number;
  limit: number;
};

export type ContactFilters = {
  search?: string;
  status?: ContactStatus;
  ownerId?: string;
  leadSourceId?: string;
  tagId?: string;
  page?: number;
  limit?: number;
};

export type CreateContactInput = {
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  status?: ContactStatus;
  leadSourceId?: string;
  ownerId?: string;
  tagIds?: string[];
};

export type UpdateContactInput = {
  firstName?: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: ContactStatus;
  ownerId?: string | null;
  leadSourceId?: string | null;
  tagIds?: string[];
};

export function listContacts(_token: string, filters: ContactFilters = {}): Promise<ContactsResponse> {
  let data = [...DEMO_CONTACTS] as Contact[];
  if (filters.search) {
    const q = filters.search.toLowerCase();
    data = data.filter(c =>
      [c.firstName, c.lastName, c.email, c.phone].some(v => v?.toLowerCase().includes(q))
    );
  }
  if (filters.status) data = data.filter(c => c.status === filters.status);
  return Promise.resolve({ data, total: data.length, page: filters.page ?? 1, limit: filters.limit ?? 20 });
}

export function getContact(_token: string, id: string): Promise<Contact> {
  const c = DEMO_CONTACTS.find(x => x.id === id);
  if (!c) return Promise.reject(Object.assign(new Error('Not found'), { status: 404 }));
  return Promise.resolve(c as Contact);
}

export function createContact(_token: string, _input: CreateContactInput): Promise<Contact> {
  return Promise.resolve(DEMO_CONTACTS[0] as Contact);
}

export function updateContact(_token: string, id: string, _input: UpdateContactInput): Promise<Contact> {
  const c = DEMO_CONTACTS.find(x => x.id === id) ?? DEMO_CONTACTS[0];
  return Promise.resolve(c as Contact);
}

export function archiveContact(_token: string, _id: string): Promise<Contact> {
  return Promise.resolve({ ...(DEMO_CONTACTS[0] as Contact), status: 'ARCHIVED' as const });
}

export function restoreContact(_token: string, _id: string): Promise<Contact> {
  return Promise.resolve(DEMO_CONTACTS[0] as Contact);
}

export function deleteContact(_token: string, _id: string): Promise<void> {
  return Promise.resolve();
}
