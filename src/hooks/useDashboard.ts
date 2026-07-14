import { useCallback, useEffect, useState } from 'react';
import { getDashboardSummary, type DashboardSummary } from '../lib/dashboard';
import type { HttpError } from '../lib/http';

export type DashboardError = {
  status: number;
  message: string;
};

function toDashboardError(error: unknown): DashboardError {
  if (error && typeof error === 'object' && 'status' in error && 'message' in error) {
    const httpError = error as HttpError;

    return {
      status: httpError.status,
      message: httpError.message || 'Could not load dashboard data.',
    };
  }

  return {
    status: 0,
    message: 'Could not load dashboard data.',
  };
}

export function useDashboard(token: string | null) {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<DashboardError | null>(null);

  const refetch = useCallback(async () => {
    if (!token) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const summary = await getDashboardSummary(token);
      setData(summary);
    } catch (requestError) {
      setData(null);
      setError(toDashboardError(requestError));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return {
    data,
    loading,
    error,
    refetch,
  };
}
