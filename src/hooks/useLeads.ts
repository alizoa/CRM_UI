import { useCallback, useEffect, useState } from 'react';
import {
  createLead as createLeadRequest,
  listLeads,
  type CreateLeadInput,
  type Lead,
  type LeadFilters,
  type LeadsResponse,
} from '../lib/leads';
import type { HttpError } from '../lib/http';

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
  const { page, limit, search, status, ownerId, temperature, source } = filters;
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
      }));
    } catch (requestError) {
      setData(null);
      setError(toRequestError(requestError, 'Could not load leads.'));
    } finally {
      setLoading(false);
    }
  }, [limit, ownerId, page, search, source, status, temperature, token]);

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

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return {
    leads: data?.data ?? [],
    data,
    loading,
    error,
    refetch,
    createLead,
    createLoading,
    createError,
  };
}
