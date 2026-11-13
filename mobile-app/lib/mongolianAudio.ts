import { objectClip } from './vision';

export type WarningReading = {
  connection: string;
  decision: string | null;
  distanceCm: number | null;
  objectLabel: string | null;
  visionUnavailable: boolean;
  proximityEntry?: boolean;
  clearEntry?: boolean
};

export function mongolianClips(reading: WarningReading): string[] {
  const object = reading.objectLabel ? [objectClip(reading.objectLabel)] : [];
  if (reading.connection === 'error') return [...object, 'range_lost'];

  const cm = reading.distanceCm;
  if (reading.proximityEntry && reading.connection === 'connected' && reading.decision === 'OBSTACLE' && cm !== null && Number.isFinite(cm) && cm >= 2 && cm <= 150) {
    return ['obstacle_stop'];
  }
  if (
    reading.clearEntry &&
    reading.connection === 'connected' &&
    reading.decision === 'CLEAR' &&
    cm !== null &&
    Number.isFinite(cm) &&
    cm > 150 &&
    cm <= 400
  ) {
    return ['nearby_clear'];
  }
  if (object.length) return object;
  if (reading.connection === 'connected' && reading.decision === 'CLEAR' && reading.visionUnavailable) return ['vision_unavailable'];
  return [];
}
