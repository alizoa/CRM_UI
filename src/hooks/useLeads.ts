import { useCallback, useEffect, useState } from 'react';
import {
  createLead as createLeadRequest,
  listLeads,
  updateLead as updateLeadRequest,
  type CreateLeadInput,
  type Lead,
  type LeadFilters,
  type LeadsResponse,
  type UpdateLeadInput,
} from '../lib/leads';
import type { HttpError } from '../lib/http';
import { subscribeToTaskChanges } from '../lib/tasks';

type RequestError = {
  status: number;
  message: string;
};

function toRequestError(error: unknown, fallback: string): RequestError {
  if (error && typeof error === 'object' && 'status' in error && 'message' in error) {
    const httpError = error as HttpError;
    return { status: httpError.status, message: httpError.message || fallback };
  }
  return { status: 0, message: fallback };
}

export function useLeads(token: string | null, filters: LeadFilters = {}) {
  const { page, limit, search, status, ownerId, temperature, source, includeAll } = filters;
  const [data, setData] = useState<LeadsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<RequestError | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<RequestError | null>(null);

  const refetch = useCallback(async () => {
    if (!token) {
      setData(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setData(await listLeads(token, {
        page,
        limit,
        search,
        status,
        ownerId,
        temperature,
        source,
        includeAll,
      }));
    } catch (requestError) {
      setData(null);
      setError(toRequestError(requestError, 'Could not load leads.'));
    } finally {
      setLoading(false);
    }
  }, [includeAll, limit, ownerId, page, search, source, status, temperature, token]);

  const createLead = useCallback(async (input: CreateLeadInput): Promise<Lead | null> => {
    if (!token) {
      setCreateError({ status: 401, message: 'You need to sign in before creating a lead.' });
      return null;
    }

    setCreateLoading(true);
    setCreateError(null);
    try {
      const lead = await createLeadRequest(token, input);
      await refetch();
      return lead;
    } catch (requestError) {
      setCreateError(toRequestError(requestError, 'Could not create lead.'));
      return null;
    } finally {
      setCreateLoading(false);
    }
  }, [refetch, token]);

  const updateLead = useCallback(async (id: string, input: UpdateLeadInput): Promise<Lead | null> => {
    if (!token) {
      setCreateError({ status: 401, message: 'You need to sign in before updating a lead.' });
      return null;
    }

    try {
      const updatedLead = await updateLeadRequest(token, id, input);
      setData((current) => {
        if (!current) return current;
        const shouldKeep = filters.includeAll
          ? true
          : filters.status
          ? updatedLead.status === filters.status
          : ['NEW', 'CONTACTED', 'FOLLOW_UP_NEEDED', 'QUALIFIED'].includes(updatedLead.status);
        const exists = current.data.some((lead) => lead.id === id);
        const nextData = shouldKeep
          ? exists
            ? current.data.map((lead) => (lead.id === id ? updatedLead : lead))
            : current.data
          : current.data.filter((lead) => lead.id !== id);
        const total = exists && !shouldKeep ? Math.max(0, current.total - 1) : current.total;

        return { ...current, data: nextData, total };
      });
      return updatedLead;
    } catch (requestError) {
      throw toRequestError(requestError, 'Could not update lead.');
    }
  }, [filters.includeAll, filters.status, token]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => subscribeToTaskChanges(() => {
    void refetch();
  }), [refetch]);

  return {
    leads: data?.data ?? [],
    data,
    loading,
    error,
    refetch,
    createLead,
    updateLead,
    createLoading,
    createError,
  };
}
