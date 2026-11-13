import test from 'node:test';
import assert from 'node:assert/strict';
import { ProximityGate } from '../lib/proximityGate.ts';

test('outside 150 cm is silent, including a stale OBSTACLE decision', () => {
  const gate = new ProximityGate();
  for (const cm of [154, 153, 151, 180]) assert.equal(gate.update(cm, true, 0).entering, false);
});
test('only the first entry warns; changing distance or approaching 50 cm does not repeat', () => {
  const gate = new ProximityGate();
  assert.equal(gate.update(150, true, 0).entering, true);
  gate.markAnnounced();
  for (const cm of [149, 120, 50, 25, 140]) assert.equal(gate.update(cm, true, 1000).entering, false);
});
test('boundary jitter does not re-arm, but a sustained exit permits a new warning', () => {
  const gate = new ProximityGate();
  gate.update(100, true, 0); gate.markAnnounced();
  gate.update(153, false, 500);
  assert.equal(gate.update(149, true, 1000).entering, false);
  gate.update(160, false, 2000);
  gate.update(160, false, 3500);
  assert.equal(gate.update(100, true, 4000).entering, true);
});
test('lost measurements are not interpreted as an exit', () => {
  const gate = new ProximityGate();
  gate.update(100, true, 0); gate.markAnnounced();
  gate.update(null, false, 5000);
  assert.equal(gate.update(100, true, 6000).entering, false);
});
