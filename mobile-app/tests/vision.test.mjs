import test from 'node:test';
import assert from 'node:assert/strict';
import { centralCandidate, objectName } from '../lib/vision.ts';

const chair = { label: 'chair', confidence: 0.8, x: 0.35, y: 0.3, width: 0.3, height: 0.6 };
test('central object is eligible independently of ultrasonic distance', () => {
  assert.equal(centralCandidate([chair])?.label, 'chair');
});
test('peripheral and tiny objects are excluded', () => {
  assert.equal(centralCandidate([{ ...chair, x: 0, width: 0.1 }]), null);
  assert.equal(centralCandidate([{ ...chair, width: 0.03, height: 0.03 }]), null);
});
test('weak, invalid, and absent detections never become an object', () => {
  assert.equal(centralCandidate([{ ...chair, confidence: 0.3 }]), null);
  assert.equal(centralCandidate([{ ...chair, confidence: NaN }]), null);
  assert.equal(centralCandidate([{ ...chair, width: -1 }]), null);
  assert.equal(centralCandidate([]), null);
});
test('larger central object takes priority', () => {
  assert.equal(centralCandidate([{ ...chair, label: 'bottle', width: 0.1, height: 0.3 }, chair])?.label, 'chair');
});
test('object labels translate without fabricating an unknown class name', () => {
  assert.equal(objectName('chair', true), 'сандал');
  assert.equal(objectName('unrecognized label', true), 'объект');
  assert.equal(objectName('chair', false), 'chair');
});
