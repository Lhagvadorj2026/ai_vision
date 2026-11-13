import { useEffect, useState } from 'react';
import { getAiVision, type DetectedObject } from '../modules/ai-vision';
import { centralCandidate } from '../lib/vision';

type VisionState = {
  source: string | null;
  status: 'idle' | 'loading' | 'running' | 'error' | 'needs-build';
  object: DetectedObject | null;
  seenAt: number;
};

export function useObjectDetection(streamUrl: string | null) {
  const [state, setState] = useState<VisionState>({ source: null, status: 'idle', object: null, seenAt: 0 });
  useEffect(() => {
    if (!state.object || !state.seenAt) return;
    const timer = setTimeout(() => {
      setState(previous => previous.seenAt === state.seenAt
        ? { ...previous, status: 'error', object: null, seenAt: 0 } : previous);
    }, 2500);
    return () => clearTimeout(timer);
  }, [state.object, state.seenAt]);
  useEffect(() => {
    if (!streamUrl) return;
    const url = new URL(streamUrl);
    url.port = '81';
    url.pathname = '/capture';
    url.search = '';
    url.hash = '';
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let previousLabel = '';
    let consecutive = 0;
    setState({ source: streamUrl, status: 'loading', object: null, seenAt: 0 });
    const detect = async () => {
      try {
        const native = getAiVision();
        if (!native) {
          previousLabel = '';
          consecutive = 0;
          if (active) setState({ source: streamUrl, status: 'needs-build', object: null, seenAt: 0 });
          return;
        }
        const requestedAt = Date.now();
        const result = await native.detect(url.toString());
        if (!active) return;
        if (Date.now() - requestedAt > 2500) throw new Error('Camera frame is stale');
        const candidate = centralCandidate(result.objects);
        consecutive = candidate && candidate.label === previousLabel ? consecutive + 1 : 1;
        previousLabel = candidate?.label ?? '';
        setState({ source: streamUrl, status: 'running', object: candidate && consecutive >= 2 ? candidate : null, seenAt: Date.now() });
      } catch {
        previousLabel = '';
        consecutive = 0;
        if (active) setState({ source: streamUrl, status: 'error', object: null, seenAt: 0 });
      } finally {
        if (active) timer = setTimeout(detect, 500);
      }
    };
    void detect();
    return () => { active = false; clearTimeout(timer); };
  }, [streamUrl]);

  if (!streamUrl) return { status: 'idle' as const, object: null, seenAt: 0 };
  if (state.source !== streamUrl) return { status: 'loading' as const, object: null, seenAt: 0 };
  return state;
}
