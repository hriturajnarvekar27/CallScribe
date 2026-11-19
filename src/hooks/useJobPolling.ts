import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, getJob } from '../api';
import { Job } from '../types';
import { isProcessingStatus } from '../utils/format';

const POLL_INTERVAL_MS = 2000;
const MAX_TRANSIENT_FAILURES = 5;

export interface UseJobPollingResult {
  job: Job | null;
  setJob: React.Dispatch<React.SetStateAction<Job | null>>;
  loading: boolean;
  error: string | null;
  pollWarning: string | null;
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
  const [pollWarning, setPollWarning] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);
  const consecutiveFailuresRef = useRef(0);
  const jobRef = useRef<Job | null>(null);
  jobRef.current = job;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const fetchOnce = useCallback(
    async (isInitial = false) => {
      if (!isInitial && inFlightRef.current) {
        return;
      }

      if (isInitial) {
        abortControllerRef.current?.abort();
        setLoading(true);
        setError(null);
        setPollWarning(null);
        consecutiveFailuresRef.current = 0;
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;
      const seq = ++requestSeqRef.current;
      inFlightRef.current = true;

      try {
        const data = await getJob(jobId, controller.signal);
        if (!mountedRef.current || seq !== requestSeqRef.current) return;
        consecutiveFailuresRef.current = 0;
        setJob(data);
        setError(null);
        setPollWarning(null);
      } catch (err) {
        if (!mountedRef.current || seq !== requestSeqRef.current) return;
        if (err instanceof ApiError && err.isAborted) return;

        const message = err instanceof Error ? err.message : 'Failed to load recording';
        const isNotFound = err instanceof ApiError && err.status === 404;

        if (isInitial || !jobRef.current || isNotFound) {
          setError(message);
          setPollWarning(null);
        } else {
          consecutiveFailuresRef.current += 1;
          if (consecutiveFailuresRef.current >= MAX_TRANSIENT_FAILURES) {
            setError(message);
            setPollWarning(null);
          } else {
            setPollWarning(`Temporary connection issue (${message}). Retrying automatically...`);
          }
        }
      } finally {
        if (seq === requestSeqRef.current) {
          inFlightRef.current = false;
        }
        if (mountedRef.current && isInitial && seq === requestSeqRef.current) {
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
    return () => {
      abortControllerRef.current?.abort();
      inFlightRef.current = false;
    };
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

  return { job, setJob, loading, error, pollWarning, refetch };
}

