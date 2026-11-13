// One warning per encounter. Boundary jitter cannot re-arm it immediately.
export class ProximityGate {
  private announced = false;
  private outsideSince: number | null = null;

  update(distanceCm: number | null, obstacle: boolean, now: number) {
    const valid = distanceCm !== null && Number.isFinite(distanceCm) && distanceCm >= 2 && distanceCm <= 400;
    if (valid && distanceCm > 150) {
      if (this.outsideSince === null) this.outsideSince = now;
      if (now - this.outsideSince >= 1500) this.announced = false;
      return { inside: false, entering: false };
    }
    this.outsideSince = null;
    const inside = valid && distanceCm <= 150 && obstacle;
    return { inside, entering: inside && !this.announced };
  }

  markAnnounced() { this.announced = true; }
}
