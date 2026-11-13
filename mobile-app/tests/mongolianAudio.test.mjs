import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';

// Metro resolves extensionless TS imports; match that resolution in Node tests.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === './vision' && context.parentURL?.endsWith('/lib/mongolianAudio.ts')) {
    return nextResolve('./vision.ts', context);
  }
  return nextResolve(specifier, context);
} });
const { mongolianClips } = await import('../lib/mongolianAudio.ts');
const reading = { connection: 'connected', decision: 'CLEAR', distanceCm: 200, objectLabel: null, visionUnavailable: false, proximityEntry: true };

test('sensor-only obstacle plays the stop phrase', () => {
  assert.deepEqual(mongolianClips({ ...reading, decision: 'OBSTACLE', distanceCm: 100 }), ['obstacle_stop']);
});
test('stop phrase takes priority over a recognized object', () => {
  assert.deepEqual(mongolianClips({ ...reading, decision: 'OBSTACLE', distanceCm: 25, objectLabel: 'chair' }), ['obstacle_stop']);
});
test('AI still speaks when ultrasonic sensor sees no nearby obstacle', () => {
  assert.deepEqual(mongolianClips({ ...reading, objectLabel: 'person' }), ['object_person']);
});
test('lost measurements do not silence AI or imply a clear path', () => {
  assert.deepEqual(mongolianClips({ ...reading, decision: 'UNKNOWN', distanceCm: null, objectLabel: 'chair' }), ['object_chair']);
  assert.deepEqual(mongolianClips({ ...reading, connection: 'error', distanceCm: null }), ['range_lost']);
  assert.deepEqual(mongolianClips(reading), []);
});
test('unknown classes never fall back to an English audio clip', () => {
  assert.deepEqual(mongolianClips({ ...reading, objectLabel: 'not-a-known-label' }), ['object']);
});
test('invalid distances cannot produce a misleading number clip', () => {
  assert.deepEqual(mongolianClips({ ...reading, decision: 'OBSTACLE', distanceCm: NaN }), []);
  assert.deepEqual(mongolianClips({ ...reading, decision: 'OBSTACLE', distanceCm: 999 }), []);
});

test('151, 153 and 154 cm never produce range warnings', () => {
  for (const cm of [151, 153, 154, 180, 200]) {
    assert.deepEqual(mongolianClips({ ...reading, decision: 'OBSTACLE', distanceCm: cm }), []);
  }
});
test('continued presence inside 150 cm does not repeat the range warning', () => {
  assert.deepEqual(mongolianClips({ ...reading, decision: 'OBSTACLE', distanceCm: 40, proximityEntry: false }), []);
});

test('every supported distance has an actual bundled Mongolian audio clip', () => {
  const directory = new URL('../modules/ai-vision/ios/Audio/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', directory), 'utf8'));
  for (let cm = 2; cm <= 150; cm++) {
    const clips = mongolianClips({ ...reading, decision: 'OBSTACLE', distanceCm: cm });
    for (const clip of clips) {
      assert.ok(manifest[clip], `No Mongolian text for ${clip}`);
      assert.ok(existsSync(new URL(`${clip}.m4a`, directory)), `No offline audio for ${clip}`);
    }
  }
  for (const clip of Object.keys(manifest)) {
    assert.ok(existsSync(new URL(`${clip}.m4a`, directory)), `Missing generated clip: ${clip}`);
  }
});

test('clear speech requires a requested announcement and a valid clear measurement', () => {
  assert.deepEqual(mongolianClips({ ...reading, clearEntry: true }), ['nearby_clear']);
  for (const distanceCm of [null, NaN, 150, 401]) {
    assert.deepEqual(mongolianClips({ ...reading, clearEntry: true, distanceCm }), []);
  }
  assert.deepEqual(mongolianClips({ ...reading, clearEntry: true, decision: 'UNKNOWN' }), []);
});
