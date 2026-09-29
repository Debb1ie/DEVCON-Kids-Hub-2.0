import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildVolunteerPayload,
  normalizeVolunteerRole,
  normalizeVolunteerStatus,
  volunteerErrorMessage,
} from '../src/services/volunteerService.js';

const migration = readFileSync(new URL('../supabase/migrations/20260929000100_volunteer_directory_creation.sql', import.meta.url), 'utf8');

test('role stays trimmed free text while status and chapter remain controlled', () => {
  assert.deepEqual(buildVolunteerPayload({
    name: ' presh ', role: 'Lead Instructor', status: 'Pending', chapterId: 'chapter-uuid',
  }), { name: 'presh', role: 'Lead Instructor', status: 'pending', chapter_id: 'chapter-uuid' });
  assert.equal(normalizeVolunteerRole('  Event Logistics  '), 'Event Logistics');
  assert.equal(normalizeVolunteerStatus('Approved'), 'approved');
});

test('empty and absurdly long roles are rejected before insertion', () => {
  assert.throws(() => buildVolunteerPayload({ name: '', role: 'Assistant', status: 'Pending', chapterId: 'id' }), { code: 'VOLUNTEER_VALIDATION' });
  assert.throws(() => buildVolunteerPayload({ name: 'A', role: '   ', status: 'Pending', chapterId: 'id' }), { code: 'VOLUNTEER_VALIDATION' });
  assert.throws(() => buildVolunteerPayload({ name: 'A', role: 'x'.repeat(101), status: 'Pending', chapterId: 'id' }), { code: 'VOLUNTEER_VALIDATION' });
  for (const role of ['Photographer', 'Videographer', 'Lead Instructor', 'Event Logistics', 'Speaker Support']) {
    assert.equal(buildVolunteerPayload({ name: 'A', role, status: 'Pending', chapterId: 'id' }).role, role);
  }
});

test('database failures become safe user-facing messages', () => {
  assert.equal(volunteerErrorMessage({ code: '42501' }), "You don't have permission to add a volunteer to this chapter.");
  assert.equal(volunteerErrorMessage({ code: '23505' }), 'This volunteer already exists.');
  assert.equal(volunteerErrorMessage({ code: '23514' }), 'Please check the volunteer details and try again.');
  assert.equal(volunteerErrorMessage({ code: 'XX000' }), 'Unable to add volunteer right now. Please try again.');
});

test('RLS allows national managers and only same-chapter coordinators to insert', () => {
  assert.match(migration, /has_role\(array\['super_admin','admin'\]\)/i);
  assert.match(migration, /is_chapter_member\(chapter_id,array\['chapter_coordinator'\]\)/i);
  assert.doesNotMatch(migration, /disable row level security/i);
  assert.doesNotMatch(migration, /profile_id\s*=\s*auth\.uid\(\)[\s\S]*or public\.has_role/i);
});

test('manual directory records stay nullable-account records and free-text roles are bounded', () => {
  assert.match(migration, /profile_id nullable/i);
  assert.match(migration, /btrim\(role\) <> '' and char_length\(role\) <= 100/i);
  assert.doesNotMatch(migration, /role in \(/i);
  assert.match(migration, /pending.*approved.*rejected.*active.*inactive/is);
});
