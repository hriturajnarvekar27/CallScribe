import { useCallback, useEffect, useRef, useState } from 'react';
import { getJob } from '../api';
import { Job } from '../types';
import { isProcessingStatus } from '../utils/format';

const POLL_INTERVAL_MS = 2000;

export interface UseJobPollingResult {
  job: Job | null;
  setJob: React.Dispatch<React.SetStateAction<Job | null>>;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Fetches a job and polls GET /api/jobs/{id} every 2 seconds while processing.
 * Isolated here so the transport can be swapped for Server-Sent Events (EventSource)
 * without changing any JobDetailView UI logic.
 */
export function useJobPolling(jobId: string): UseJobPollingResult {
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchOnce = useCallback(
    async (isInitial = false) => {
      if (isInitial) {
        setLoading(true);
        setError(null);
      }
      try {
        const data = await getJob(jobId);
        if (!mountedRef.current) return;
        setJob(data);
        setError(null);
      } catch (err) {
        if (!mountedRef.current) return;
        const message = err instanceof Error ? err.message : 'Failed to load recording';
        setError(message);
      } finally {
        if (mountedRef.current && isInitial) {
          setLoading(false);
        }
      }
    },
    [jobId]
  );

  // Initial load on jobId change
  useEffect(() => {
    setJob(null);
    void fetchOnce(true);
  }, [fetchOnce]);

  // Active polling while job status is in progress
  const shouldPoll = job !== null && isProcessingStatus(job.status);

  useEffect(() => {
    if (!shouldPoll) return;
    const timer = window.setInterval(() => {
      void fetchOnce(false);
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [shouldPoll, fetchOnce]);

  const refetch = useCallback(() => fetchOnce(true), [fetchOnce]);

  return { job, setJob, loading, error, refetch };
}
