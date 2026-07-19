// src/lib/leads.ts — demo mode
import { DEMO_LEADS } from './mock-data';
import { getLeadNextFollowUp } from './tasks';

export const LEADS_PATH = '/api/leads';
const ACTIVE_LEAD_STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'FOLLOW_UP_NEEDED', 'QUALIFIED'];
let demoLeads = DEMO_LEADS.map((lead) => ({ ...lead })) as Lead[];

export type LeadStatus = 'NEW' | 'CONTACTED' | 'FOLLOW_UP_NEEDED' | 'QUALIFIED' | 'WON' | 'LOST';
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
  readonly nextFollowUpAt: string | null;
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
};

function withDerivedFollowUp(lead: Lead): Lead {
  return {
    ...lead,
    nextFollowUpAt: getLeadNextFollowUp(lead.id),
  };
}

export function listLeads(_token: string, filters: LeadFilters = {}): Promise<LeadsResponse> {
  let data = demoLeads.map(withDerivedFollowUp);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    data = data.filter(l =>
      [l.firstName, l.lastName, l.email, l.phone, l.originalMessage].some(v => v?.toLowerCase().includes(q))
    );
  }
  if (filters.status) {
    data = data.filter(l => l.status === filters.status);
  } else {
    data = data.filter(l => ACTIVE_LEAD_STATUSES.includes(l.status));
  }
  if (filters.temperature) data = data.filter(l => l.temperature === filters.temperature);
  if (filters.ownerId) data = data.filter(l => l.ownerId === filters.ownerId);
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  const start = (page - 1) * limit;
  return Promise.resolve({ data: data.slice(start, start + limit), total: data.length, page, limit });
}

export function createLead(_token: string, _input: CreateLeadInput): Promise<Lead> {
  const template = demoLeads[0];
  const now = new Date().toISOString();
  const lead: Lead = {
    ...template,
    id: `led-demo-${Date.now()}`,
    firstName: _input.firstName ?? null,
    lastName: _input.lastName ?? null,
    email: _input.email ?? null,
    phone: _input.phone ?? null,
    status: 'NEW',
    temperature: _input.temperature ?? null,
    ownerId: _input.ownerId ?? null,
    nextFollowUpAt: null,
    source: _input.source ?? 'MANUAL',
    leadSourceId: _input.leadSourceId ?? null,
    convertedContactId: null,
    convertedAt: null,
    convertedContact: null,
    createdAt: now,
    updatedAt: now,
  };
  demoLeads = [lead, ...demoLeads];
  return Promise.resolve(withDerivedFollowUp(lead));
}

export function getLead(_token: string, id: string): Promise<Lead> {
  const l = demoLeads.find(x => x.id === id);
  if (!l) return Promise.reject(Object.assign(new Error('Not found'), { status: 404 }));
  return Promise.resolve(withDerivedFollowUp(l as Lead));
}

export function updateLead(_token: string, id: string, input: UpdateLeadInput): Promise<Lead> {
  const index = demoLeads.findIndex(x => x.id === id);
  if (index < 0) return Promise.reject(Object.assign(new Error('Not found'), { status: 404 }));
  const current = demoLeads[index];
  const next: Lead = {
    ...current,
    ...input,
    updatedAt: new Date().toISOString(),
    convertedContactId: input.status === 'WON' ? null : current.convertedContactId,
    convertedAt: input.status === 'WON' ? new Date().toISOString() : current.convertedAt,
    convertedContact: input.status === 'WON' ? null : current.convertedContact,
  };
  demoLeads = demoLeads.map((lead) => (lead.id === id ? next : lead));
  return Promise.resolve(withDerivedFollowUp(next));
}

export function markLeadLost(_token: string, _id: string): Promise<Lead> {
  return updateLead(_token, _id, { status: 'LOST' });
}

export function reopenLead(_token: string, _id: string): Promise<Lead> {
  return updateLead(_token, _id, { status: 'NEW' });
}

export function deleteLead(_token: string, _id: string): Promise<void> {
  return Promise.resolve();
}

export function convertLead(_token: string, _id: string, _confirmDuplicate: boolean): Promise<ConvertLeadResponse> {
  return updateLead(_token, _id, { status: 'WON' }).then((lead) => ({ lead }));
}
