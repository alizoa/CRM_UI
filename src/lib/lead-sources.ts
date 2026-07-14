// src/lib/lead-sources.ts — demo mode
import { DEMO_LEAD_SOURCES } from './mock-data';

export const LEAD_SOURCES_PATH = '/api/settings/lead-sources';

export type LeadSource = {
  id: string;
  name: string;
};

export type LeadSourceOption = LeadSource;

export type LeadSourceInput = {
  name: string;
};

export async function listLeadSources(_token: string): Promise<LeadSource[]> {
  return DEMO_LEAD_SOURCES.map(ls => ({ id: ls.id, name: ls.name }));
}

export async function listLeadSourceOptions(_token: string): Promise<LeadSourceOption[]> {
  return listLeadSources(_token);
}

export async function createLeadSource(_token: string, input: LeadSourceInput): Promise<LeadSource> {
  return { id: `ls-new-${Date.now()}`, name: input.name };
}

export async function updateLeadSource(_token: string, id: string, input: LeadSourceInput): Promise<LeadSource> {
  return { id, name: input.name };
}

export function deleteLeadSource(_token: string, _id: string): Promise<void> {
  return Promise.resolve();
}
