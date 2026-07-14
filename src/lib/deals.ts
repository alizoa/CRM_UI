// src/lib/deals.ts — demo mode
import { DEMO_DEALS } from './mock-data';

export const DEALS_PATH = '/api/deals';

export type DealStatus = 'OPEN' | 'WON' | 'LOST';

export type DealFilters = {
  pipelineId?: string;
  stageId?: string;
  status?: DealStatus;
  contactId?: string;
  ownerId?: string;
  search?: string;
  page?: number;
  limit?: number;
};

export type Deal = {
  id: string;
  title: string;
  value: string | number | null;
  currency: string;
  status: DealStatus;
  pipelineId: string;
  stageId: string;
  contactId: string | null;
  ownerId: string | null;
  leadSourceId: string | null;
  expectedCloseAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  contact?: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    status: string;
  } | null;
  stage?: {
    id: string;
    name: string;
    position: number;
    isClosedWon: boolean;
    isClosedLost: boolean;
  } | null;
  pipeline?: {
    id: string;
    name: string;
  } | null;
  owner?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
  leadSource?: {
    id: string;
    name: string;
  } | null;
};

export type DealsResponse = {
  data: Deal[];
  total: number;
  page: number;
  limit: number;
};

export type CreateDealInput = {
  title: string;
  pipelineId: string;
  stageId: string;
  value?: string | number;
  currency?: string;
  contactId?: string | null;
  ownerId?: string | null;
  leadSourceId?: string | null;
  expectedCloseAt?: string | null;
};

export type UpdateDealInput = {
  title?: string;
  value?: string | number | null;
  currency?: string;
  contactId?: string | null;
  ownerId?: string | null;
  leadSourceId?: string | null;
  expectedCloseAt?: string | null;
};

export function listDeals(_token: string, filters: DealFilters = {}): Promise<DealsResponse> {
  let data = [...DEMO_DEALS] as Deal[];
  if (filters.status) data = data.filter(d => d.status === filters.status);
  if (filters.pipelineId) data = data.filter(d => d.pipelineId === filters.pipelineId);
  if (filters.stageId) data = data.filter(d => d.stageId === filters.stageId);
  if (filters.contactId) data = data.filter(d => d.contactId === filters.contactId);
  return Promise.resolve({ data, total: data.length, page: filters.page ?? 1, limit: filters.limit ?? 20 });
}

export function createDeal(_token: string, _input: CreateDealInput): Promise<Deal> {
  return Promise.resolve(DEMO_DEALS[0] as Deal);
}

export function getDeal(_token: string, id: string): Promise<Deal> {
  const d = DEMO_DEALS.find(x => x.id === id);
  if (!d) return Promise.reject(Object.assign(new Error('Not found'), { status: 404 }));
  return Promise.resolve(d as Deal);
}

export function updateDeal(_token: string, id: string, _input: UpdateDealInput): Promise<Deal> {
  return Promise.resolve((DEMO_DEALS.find(x => x.id === id) ?? DEMO_DEALS[0]) as Deal);
}

export function moveDeal(_token: string, id: string, _stageId: string): Promise<Deal> {
  return Promise.resolve((DEMO_DEALS.find(x => x.id === id) ?? DEMO_DEALS[0]) as Deal);
}

export function markDealWon(_token: string, _id: string): Promise<Deal> {
  return Promise.resolve({ ...(DEMO_DEALS[0] as Deal), status: 'WON' as const });
}

export function markDealLost(_token: string, _id: string): Promise<Deal> {
  return Promise.resolve({ ...(DEMO_DEALS[0] as Deal), status: 'LOST' as const });
}

export function reopenDeal(_token: string, _id: string): Promise<Deal> {
  return Promise.resolve({ ...(DEMO_DEALS[0] as Deal), status: 'OPEN' as const });
}
