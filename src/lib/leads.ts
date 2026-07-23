// src/lib/leads.ts — demo mode
import { DEMO_LEADS, DEMO_LEAD_SOURCES, DEMO_MEMBERSHIPS } from './mock-data';
import {
  ACTIVITY_COMMENT_MAX_LENGTH,
  recordActivity,
  type ActivityActorType,
  type ActivityChange,
  type ActivityChangeSource,
} from './activities';
import type { ChangeDocumentationAction } from './change-documentation-settings';
import { getLeadNextFollowUp } from './tasks';

export const LEADS_PATH = '/api/leads';
const ACTIVE_LEAD_STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'FOLLOW_UP_NEEDED', 'QUALIFIED'];
let demoLeads = DEMO_LEADS.map((lead) => ({ ...lead })) as Lead[];

export type LeadStatus = 'NEW' | 'CONTACTED' | 'FOLLOW_UP_NEEDED' | 'QUALIFIED' | 'WON' | 'LOST';
export type LeadStage = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'WON' | 'LOST';
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
  stage: LeadStage;
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
  includeAll?: boolean;
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
  stage?: LeadStage;
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

export type LeadMutationContext = {
  actorId?: string | null;
  actorDisplayName?: string;
  actorType?: ActivityActorType;
  source?: ActivityChangeSource;
  comment?: string | null;
  reason?: string | null;
};

export type LeadMutationUser = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
} | null;

export type LeadActivityAction =
  | 'lead.created'
  | 'lead.updated'
  | 'lead.status_changed'
  | 'lead.temperature_changed'
  | 'lead.owner_changed'
  | 'lead.converted'
  | 'lead.marked_lost'
  | 'lead.reopened';

export type LeadActivityPreview = {
  action: LeadActivityAction;
  changes: ActivityChange[];
  documentationActions: ChangeDocumentationAction[];
  requiresReason: boolean;
};

type LeadUpdateOptions = {
  action?: LeadActivityAction;
  documentationActions?: ChangeDocumentationAction[];
  requiresReason?: boolean;
  allowSpecializedStatus?: boolean;
  lifecycleAction?: 'mark_lost' | 'reopen' | 'convert';
};

const DETAIL_FIELDS: Array<keyof UpdateLeadInput> = ['firstName', 'lastName', 'email', 'phone', 'leadSourceId'];

function trimOptional(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function validateDocumentation(context: LeadMutationContext | undefined, requiresReason: boolean) {
  const comment = trimOptional(context?.comment);
  const reason = trimOptional(context?.reason);

  if (comment && comment.length > ACTIVITY_COMMENT_MAX_LENGTH) {
    throw Object.assign(new Error(`Comment cannot exceed ${ACTIVITY_COMMENT_MAX_LENGTH} characters.`), { status: 422 });
  }

  if (reason && reason.length > ACTIVITY_COMMENT_MAX_LENGTH) {
    throw Object.assign(new Error(`Reason cannot exceed ${ACTIVITY_COMMENT_MAX_LENGTH} characters.`), { status: 422 });
  }

  if (requiresReason && !reason) {
    throw Object.assign(new Error('Reason is required.'), { status: 422 });
  }

  return { comment, reason: requiresReason ? reason : null };
}

function getMembershipDisplayName(userId: string | null) {
  if (!userId) return 'Unassigned';
  const membership = DEMO_MEMBERSHIPS.find((item) => item.userId === userId);
  if (!membership) return 'Unknown user';
  return [membership.user.firstName, membership.user.lastName].filter(Boolean).join(' ') || membership.user.email;
}

function getLeadSourceName(leadSourceId: string | null) {
  if (!leadSourceId) return 'Not set';
  return DEMO_LEAD_SOURCES.find((source) => source.id === leadSourceId)?.name ?? 'Unknown lead source';
}

function resolveOwner(ownerId: string | null): Lead['owner'] {
  if (!ownerId) return null;
  const membership = DEMO_MEMBERSHIPS.find((item) => item.userId === ownerId);
  if (!membership) return null;
  return {
    id: membership.user.id,
    firstName: membership.user.firstName,
    lastName: membership.user.lastName,
    email: membership.user.email,
  };
}

function resolveLeadSource(leadSourceId: string | null): Lead['leadSource'] {
  if (!leadSourceId) return null;
  const leadSource = DEMO_LEAD_SOURCES.find((source) => source.id === leadSourceId);
  return leadSource ? { id: leadSource.id, name: leadSource.name } : null;
}

function normalizeComparable(value: unknown) {
  return value === undefined || value === '' ? null : value;
}

function valuesEqual(left: unknown, right: unknown) {
  return normalizeComparable(left) === normalizeComparable(right);
}

function fieldLabel(field: keyof Lead | 'status') {
  const labels: Partial<Record<keyof Lead | 'status', string>> = {
    firstName: 'First name',
    lastName: 'Last name',
    email: 'Email',
    phone: 'Phone',
    temperature: 'Temperature',
    ownerId: 'Owner',
    leadSourceId: 'Lead source',
    status: 'Status',
    source: 'Source',
  };
  return labels[field] ?? field;
}

function displayValue(field: keyof Lead | 'status', value: unknown) {
  if (field === 'ownerId') return getMembershipDisplayName(value as string | null);
  if (field === 'leadSourceId') return getLeadSourceName(value as string | null);
  if (value === null || value === undefined || value === '') return 'Not set';
  return value;
}

function buildChange(field: keyof Lead | 'status', from: unknown, to: unknown): ActivityChange | null {
  if (valuesEqual(from, to)) return null;
  return {
    field,
    label: fieldLabel(field),
    from: displayValue(field, from),
    to: displayValue(field, to),
  };
}

function getDocumentationActionForField(field: string): ChangeDocumentationAction {
  if (field === 'status') return 'lead.status_changed';
  if (field === 'temperature') return 'lead.temperature_changed';
  if (field === 'ownerId') return 'lead.owner_changed';
  return 'lead.detail_changed';
}

function uniqueDocumentationActions(changes: ActivityChange[]) {
  return Array.from(new Set(changes.map((change) => getDocumentationActionForField(change.field)))) as ChangeDocumentationAction[];
}

function classifyUpdateAction(changes: ActivityChange[]): LeadActivityAction {
  if (changes.length === 1 && changes[0].field === 'status') return 'lead.status_changed';
  if (changes.length === 1 && changes[0].field === 'temperature') return 'lead.temperature_changed';
  if (changes.length === 1 && changes[0].field === 'ownerId') return 'lead.owner_changed';
  return 'lead.updated';
}

function buildNextLead(current: Lead, input: UpdateLeadInput, now: string): Lead {
  const status = input.status ?? current.status;
  const nextStage = input.stage ?? (input.status && input.status !== 'FOLLOW_UP_NEEDED' ? stageFromStatus(input.status) : current.stage);
  const ownerId = input.ownerId !== undefined ? input.ownerId : current.ownerId;
  const leadSourceId = input.leadSourceId !== undefined ? input.leadSourceId : current.leadSourceId;

  return {
    ...current,
    ...input,
    status,
    stage: nextStage,
    ownerId,
    owner: resolveOwner(ownerId),
    leadSourceId,
    leadSource: resolveLeadSource(leadSourceId),
    updatedAt: now,
    convertedContactId: input.status === 'WON' ? null : current.convertedContactId,
    convertedAt: input.status === 'WON' ? now : current.convertedAt,
    convertedContact: input.status === 'WON' ? null : current.convertedContact,
  };
}

function diffLeads(current: Lead, next: Lead, fields: Array<keyof Lead | 'status'>): ActivityChange[] {
  return fields.flatMap((field) => {
    const change = buildChange(field, current[field as keyof Lead], next[field as keyof Lead]);
    return change ? [change] : [];
  });
}

function getUpdateFields(input: UpdateLeadInput): Array<keyof Lead | 'status'> {
  const fields: Array<keyof Lead | 'status'> = [];
  if (input.status !== undefined) fields.push('status');
  if (input.temperature !== undefined) fields.push('temperature');
  if (input.ownerId !== undefined) fields.push('ownerId');
  for (const field of DETAIL_FIELDS) {
    if (input[field] !== undefined) fields.push(field);
  }
  return Array.from(new Set(fields));
}

function previewLeadUpdateInternal(lead: Lead, input: UpdateLeadInput, options: LeadUpdateOptions = {}): LeadActivityPreview {
  const next = buildNextLead(lead, input, new Date().toISOString());
  const changes = diffLeads(lead, next, getUpdateFields(input));
  return {
    action: options.action ?? classifyUpdateAction(changes),
    changes,
    documentationActions: options.documentationActions ?? uniqueDocumentationActions(changes),
    requiresReason: Boolean(options.requiresReason),
  };
}

function validateSpecializedStatus(current: Lead, input: UpdateLeadInput, options: LeadUpdateOptions) {
  if (options.allowSpecializedStatus) return;
  if (current.status === 'WON') throw Object.assign(new Error('Won leads are read-only.'), { status: 422 });
  if (input.status === 'WON') throw Object.assign(new Error('Use convertLead to mark a lead won.'), { status: 422 });
  if (input.status === 'LOST') throw Object.assign(new Error('Use markLeadLost to mark a lead lost.'), { status: 422 });
  if (current.status === 'LOST' && input.status !== undefined) {
    throw Object.assign(new Error('Use reopenLead to reopen a lost lead.'), { status: 422 });
  }
}

function validateLifecycleState(current: Lead, options: LeadUpdateOptions) {
  if (options.lifecycleAction === 'mark_lost') {
    if (current.status === 'WON') throw Object.assign(new Error('Won leads cannot be marked lost.'), { status: 422 });
    if (current.status === 'LOST') throw Object.assign(new Error('Lead is already lost.'), { status: 422 });
    return;
  }

  if (options.lifecycleAction === 'reopen') {
    if (current.status !== 'LOST') throw Object.assign(new Error('Only lost leads can be reopened.'), { status: 422 });
    return;
  }

  if (options.lifecycleAction === 'convert') {
    if (current.status === 'LOST') throw Object.assign(new Error('Lost leads must be reopened before they can be marked won.'), { status: 422 });
  }
}

function buildLeadCreatedChanges(lead: Lead): ActivityChange[] {
  const changes: ActivityChange[] = [
    { field: 'status', label: 'Status', from: 'Not set', to: lead.status },
    { field: 'source', label: 'Source', from: 'Not set', to: lead.leadSource?.name ?? lead.source },
  ];

  for (const field of ['firstName', 'lastName', 'email', 'phone', 'temperature', 'ownerId', 'leadSourceId'] as const) {
    const change = buildChange(field, null, lead[field]);
    if (change) changes.push(change);
  }

  return changes;
}

export function buildLeadMutationContext(
  user: LeadMutationUser,
  source: ActivityChangeSource,
  documentation?: Pick<LeadMutationContext, 'comment' | 'reason'>,
): LeadMutationContext {
  return {
    actorId: user?.id ?? null,
    actorDisplayName: user ? [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email : 'System',
    actorType: user ? 'USER' : 'SYSTEM',
    source,
    ...documentation,
  };
}

export function previewLeadUpdate(lead: Lead, input: UpdateLeadInput): LeadActivityPreview {
  return previewLeadUpdateInternal(lead, input);
}

export function previewLeadConvert(lead: Lead): LeadActivityPreview {
  return previewLeadUpdateInternal(lead, { status: 'WON' }, {
    action: 'lead.converted',
    documentationActions: ['lead.marked_won'],
    allowSpecializedStatus: true,
  });
}

export function previewLeadLost(lead: Lead): LeadActivityPreview {
  return previewLeadUpdateInternal(lead, { status: 'LOST' }, {
    action: 'lead.marked_lost',
    documentationActions: ['lead.marked_lost'],
    requiresReason: true,
    allowSpecializedStatus: true,
  });
}

export function previewLeadReopen(lead: Lead): LeadActivityPreview {
  return previewLeadUpdateInternal(lead, { status: 'NEW' }, {
    action: 'lead.reopened',
    documentationActions: ['lead.reopened'],
    requiresReason: true,
    allowSpecializedStatus: true,
  });
}

function withDerivedFollowUp(lead: Lead): Lead {
  return {
    ...lead,
    stage: lead.stage ?? stageFromStatus(lead.status),
    nextFollowUpAt: getLeadNextFollowUp(lead.id),
  };
}

function stageFromStatus(status: LeadStatus): LeadStage {
  if (status === 'QUALIFIED' || status === 'WON' || status === 'LOST' || status === 'CONTACTED') {
    return status;
  }

  return 'NEW';
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
  } else if (!filters.includeAll) {
    data = data.filter(l => ACTIVE_LEAD_STATUSES.includes(l.status));
  }
  if (filters.temperature) data = data.filter(l => l.temperature === filters.temperature);
  if (filters.ownerId) data = data.filter(l => l.ownerId === filters.ownerId);
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  const start = (page - 1) * limit;
  return Promise.resolve({ data: data.slice(start, start + limit), total: data.length, page, limit });
}

export function createLead(_token: string, _input: CreateLeadInput, context: LeadMutationContext = {}): Promise<Lead> {
  const documentation = validateDocumentation(context, false);
  const template = demoLeads[0];
  const now = new Date().toISOString();
  const ownerId = _input.ownerId ?? null;
  const leadSourceId = _input.leadSourceId ?? null;
  const lead: Lead = {
    ...template,
    id: `led-demo-${Date.now()}`,
    firstName: _input.firstName ?? null,
    lastName: _input.lastName ?? null,
    email: _input.email ?? null,
    phone: _input.phone ?? null,
    status: 'NEW',
    stage: 'NEW',
    temperature: _input.temperature ?? null,
    ownerId,
    owner: resolveOwner(ownerId),
    nextFollowUpAt: null,
    source: _input.source ?? 'MANUAL',
    leadSourceId,
    leadSource: resolveLeadSource(leadSourceId),
    convertedContactId: null,
    convertedAt: null,
    convertedContact: null,
    createdAt: now,
    updatedAt: now,
  };
  demoLeads = [lead, ...demoLeads];
  recordActivity({
    entityType: 'LEAD',
    entityId: lead.id,
    action: 'lead.created',
    changes: buildLeadCreatedChanges(lead),
    payload: { source: context.source ?? 'system' },
    comment: documentation.comment,
    actorId: context.actorId,
    actorType: context.actorType,
    actorDisplayName: context.actorDisplayName,
  });
  return Promise.resolve(withDerivedFollowUp(lead));
}

export function getLead(_token: string, id: string): Promise<Lead> {
  const l = demoLeads.find(x => x.id === id);
  if (!l) return Promise.reject(Object.assign(new Error('Not found'), { status: 404 }));
  return Promise.resolve(withDerivedFollowUp(l as Lead));
}

function applyLeadUpdate(_token: string, id: string, input: UpdateLeadInput, context: LeadMutationContext = {}, options: LeadUpdateOptions = {}): Promise<Lead> {
  const index = demoLeads.findIndex(x => x.id === id);
  if (index < 0) return Promise.reject(Object.assign(new Error('Not found'), { status: 404 }));
  const current = demoLeads[index];
  validateSpecializedStatus(current, input, options);
  validateLifecycleState(current, options);
  const documentation = validateDocumentation(context, Boolean(options.requiresReason));
  const next = buildNextLead(current, input, new Date().toISOString());
  const preview = previewLeadUpdateInternal(current, input, options);
  if (preview.changes.length === 0) {
    return Promise.resolve(withDerivedFollowUp(current));
  }
  demoLeads = demoLeads.map((lead) => (lead.id === id ? next : lead));
  recordActivity({
    entityType: 'LEAD',
    entityId: id,
    action: preview.action,
    changes: preview.changes,
    payload: { source: context.source ?? 'system' },
    comment: documentation.comment,
    reason: documentation.reason,
    actorId: context.actorId,
    actorType: context.actorType,
    actorDisplayName: context.actorDisplayName,
  });
  return Promise.resolve(withDerivedFollowUp(next));
}

export function updateLead(_token: string, id: string, input: UpdateLeadInput, context?: LeadMutationContext): Promise<Lead> {
  return applyLeadUpdate(_token, id, input, context);
}

export function markLeadLost(_token: string, _id: string, context?: LeadMutationContext): Promise<Lead> {
  return applyLeadUpdate(_token, _id, { status: 'LOST' }, context, {
    action: 'lead.marked_lost',
    documentationActions: ['lead.marked_lost'],
    requiresReason: true,
    allowSpecializedStatus: true,
    lifecycleAction: 'mark_lost',
  });
}

export function reopenLead(_token: string, _id: string, context?: LeadMutationContext): Promise<Lead> {
  return applyLeadUpdate(_token, _id, { status: 'NEW' }, context, {
    action: 'lead.reopened',
    documentationActions: ['lead.reopened'],
    requiresReason: true,
    allowSpecializedStatus: true,
    lifecycleAction: 'reopen',
  });
}

export function deleteLead(_token: string, _id: string): Promise<void> {
  return Promise.resolve();
}

export function convertLead(_token: string, _id: string, _confirmDuplicate: boolean, context?: LeadMutationContext): Promise<ConvertLeadResponse> {
  return applyLeadUpdate(_token, _id, { status: 'WON' }, context, {
    action: 'lead.converted',
    documentationActions: ['lead.marked_won'],
    allowSpecializedStatus: true,
    lifecycleAction: 'convert',
  }).then((lead) => ({ lead }));
}
