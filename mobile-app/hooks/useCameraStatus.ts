import { useEffect, useState } from 'react';

export type Decision = 'WAITING' | 'UNKNOWN' | 'CLEAR' | 'OBSTACLE' | 'RED_STOP' | 'GREEN_GO';
type CameraStatus = {
  source: string | null;
  connection: 'disconnected' | 'connecting' | 'connected' | 'error';
  decision: Decision | null;
  distanceCm: number | null;
};

const decisions = new Set<unknown>(['WAITING', 'UNKNOWN', 'CLEAR', 'OBSTACLE', 'RED_STOP', 'GREEN_GO']);

export function useCameraStatus(streamUrl: string | null) {
  const [status, setStatus] = useState<CameraStatus>({
    source: null, connection: 'disconnected', decision: null, distanceCm: null,
  });

  useEffect(() => {
    if (!streamUrl) return;
    const endpoint = new URL(streamUrl);
    endpoint.port = '81';
    endpoint.pathname = '/status';
    endpoint.search = '';
    endpoint.hash = '';
    let cancelled = false;
    let nextPoll: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    setStatus({ source: streamUrl, connection: 'connecting', decision: null, distanceCm: null });

    const poll = async () => {
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 2500);
      try {
        const response = await fetch(endpoint.toString(), {
          signal: controller.signal,
          headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
        });
        if (!response.ok) throw new Error(`Status HTTP ${response.status}`);
        const data: unknown = await response.json();
        if (!data || typeof data !== 'object' || !('decision' in data) || !decisions.has(data.decision)) {
          throw new Error('Invalid camera status');
        }
        if (!cancelled) {
          if (!('age_ms' in data) || typeof data.age_ms !== 'number' || !Number.isFinite(data.age_ms) || data.age_ms < 0) {
            throw new Error('Missing status freshness');
          }
          const decision = data.age_ms > 1500 ? 'UNKNOWN' : data.decision as Decision;
          const rawDistance = 'distance_cm' in data ? data.distance_cm : null;
          const distanceCm = data.age_ms <= 1500 && typeof rawDistance === 'number' && Number.isFinite(rawDistance) && rawDistance >= 2 && rawDistance <= 400
            ? rawDistance : null;
          if (decision === 'OBSTACLE' && distanceCm === null) throw new Error('Missing obstacle distance');
          setStatus(previous => previous.source === streamUrl && previous.connection === 'connected' && previous.decision === decision
            && previous.distanceCm === distanceCm
            ? previous
            : { source: streamUrl, connection: 'connected', decision, distanceCm });
        }
      } catch {
        if (!cancelled) setStatus(previous => previous.source === streamUrl && previous.connection === 'error'
          ? previous
          : { source: streamUrl, connection: 'error', decision: null, distanceCm: null });
      } finally {
        clearTimeout(timeout);
        // Schedule after completion so slow requests never overlap.
        if (!cancelled) nextPoll = setTimeout(poll, 500);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(nextPoll);
      controller?.abort();
    };
  }, [streamUrl]);

  if (!streamUrl) return { connection: 'disconnected' as const, decision: null, distanceCm: null };
  if (status.source !== streamUrl) return { connection: 'connecting' as const, decision: null, distanceCm: null };
  return status;
}
