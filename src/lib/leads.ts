// src/lib/leads.ts — demo mode
import { DEMO_LEADS } from './mock-data';

export const LEADS_PATH = '/api/leads';

export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'CONVERTED' | 'LOST';
export type LeadTemperature = 'HOT' | 'WARM' | 'COLD';
export type LeadSourceChannel =
  | 'WEBSITE'
  | 'WHATSAPP'
  | 'INSTAGRAM'
  | 'FACEBOOK'
  | 'PHONE'
  | 'REFERRAL'
  | 'MANUAL'
  | 'OTHER';

export type Lead = {
  id: string;
  companyId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  status: LeadStatus;
  temperature: LeadTemperature | null;
  ownerId: string | null;
  nextFollowUpAt: string | null;
  source: LeadSourceChannel;
  sourceDetail: string | null;
  leadSourceId: string | null;
  originalMessage: string | null;
  linkedConversationId: string | null;
  linkedConversationProvider: string | null;
  externalSourceId: string | null;
  convertedContactId: string | null;
  convertedAt: string | null;
  createdAt: string;
  updatedAt: string;
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
  convertedContact: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  } | null;
};

export type LeadsResponse = {
  data: Lead[];
  total: number;
  page: number;
  limit: number;
};

export type LeadFilters = {
  page?: number;
  limit?: number;
  search?: string;
  status?: LeadStatus;
  ownerId?: string;
  temperature?: LeadTemperature;
  source?: LeadSourceChannel;
};

export type CreateLeadInput = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  source?: LeadSourceChannel;
  leadSourceId?: string;
  ownerId?: string;
  nextFollowUpAt?: string;
  temperature?: LeadTemperature;
};

export type UpdateLeadInput = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  temperature?: LeadTemperature | null;
  ownerId?: string | null;
  leadSourceId?: string | null;
  nextFollowUpAt?: string | null;
  status?: LeadStatus;
};

export type DuplicateContactCandidate = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
};

export type ConvertLeadResponse = {
  lead: Lead;
  contact: DuplicateContactCandidate;
};

export function listLeads(_token: string, filters: LeadFilters = {}): Promise<LeadsResponse> {
  let data = [...DEMO_LEADS] as Lead[];
  if (filters.search) {
    const q = filters.search.toLowerCase();
    data = data.filter(l =>
      [l.firstName, l.lastName, l.email, l.phone].some(v => v?.toLowerCase().includes(q))
    );
  }
  if (filters.status) data = data.filter(l => l.status === filters.status);
  if (filters.temperature) data = data.filter(l => l.temperature === filters.temperature);
  return Promise.resolve({ data, total: data.length, page: filters.page ?? 1, limit: filters.limit ?? 20 });
}

export function createLead(_token: string, _input: CreateLeadInput): Promise<Lead> {
  return Promise.resolve(DEMO_LEADS[0] as Lead);
}

export function getLead(_token: string, id: string): Promise<Lead> {
  const l = DEMO_LEADS.find(x => x.id === id);
  if (!l) return Promise.reject(Object.assign(new Error('Not found'), { status: 404 }));
  return Promise.resolve(l as Lead);
}

export function updateLead(_token: string, id: string, _input: UpdateLeadInput): Promise<Lead> {
  return Promise.resolve((DEMO_LEADS.find(x => x.id === id) ?? DEMO_LEADS[0]) as Lead);
}

export function markLeadLost(_token: string, _id: string): Promise<Lead> {
  return Promise.resolve({ ...(DEMO_LEADS[0] as Lead), status: 'LOST' as const });
}

export function reopenLead(_token: string, _id: string): Promise<Lead> {
  return Promise.resolve({ ...(DEMO_LEADS[0] as Lead), status: 'NEW' as const });
}

export function deleteLead(_token: string, _id: string): Promise<void> {
  return Promise.resolve();
}

export function convertLead(_token: string, _id: string, _confirmDuplicate: boolean): Promise<ConvertLeadResponse> {
  return Promise.resolve({
    lead: { ...(DEMO_LEADS[0] as Lead), status: 'CONVERTED' as const },
    contact: { id: 'cnt-001', firstName: 'Alice', lastName: 'Example', email: 'alice@example.com', phone: '+1-555-0101', status: 'CUSTOMER' },
  });
}
