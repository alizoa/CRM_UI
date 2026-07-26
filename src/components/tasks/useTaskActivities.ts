import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { listActivities, subscribeToActivityChanges, type Activity } from '../../lib/activities';

export function useTaskActivities(taskId: string | null | undefined) {
  const { accessToken } = useAuth();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!accessToken || !taskId) {
      setActivities([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await listActivities(accessToken, { relatedTaskId: taskId, page: 1, limit: 100 });
      setActivities(response.data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load task activity.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, taskId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => subscribeToActivityChanges(() => void refresh()), [refresh]);

  return { activities, loading, error, refresh };
}
