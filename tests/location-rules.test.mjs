import test from 'node:test';
import assert from 'node:assert/strict';
import { isKnownLocationId, validateLocationSelection } from '../src/auth/locationRules.js';

const locations = [
  { location_id: '11111111-1111-4111-8111-111111111111', is_active: true },
  { location_id: '22222222-2222-4222-8222-222222222222', is_active: false },
];

test('accepts only an active directory UUID', () => assert.equal(isKnownLocationId(locations[0].location_id, locations), true));
test('rejects numeric mock IDs', () => assert.equal(isKnownLocationId('1', locations), false));
test('rejects unknown UUIDs', () => assert.equal(isKnownLocationId('33333333-3333-4333-8333-333333333333', locations), false));
test('rejects inactive locations', () => assert.equal(isKnownLocationId(locations[1].location_id, locations), false));
test('chapter-scoped roles reject malformed IDs before RPC execution', () => {
  assert.throws(
    () => validateLocationSelection('volunteer', '1', locations, ['volunteer']),
    /valid location/,
  );
});
test('administrative roles safely clear location selection', () => {
  assert.doesNotThrow(() => validateLocationSelection('admin', '', locations, ['volunteer']));
});
