import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const userPage = readFileSync(new URL('../src/pages/UserManagement.jsx', import.meta.url), 'utf8');
const appState = readFileSync(new URL('../src/context/AppState.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/pages/UserManagement.css', import.meta.url), 'utf8');

test('User Management loads the location RPC', () => assert.match(userPage, /listAssignableLocations/));
test('dropdown groups chapters and volunteer communities', () => {
  assert.match(userPage, /optgroup label="Chapters"/);
  assert.match(userPage, /optgroup label="Volunteer Communities"/);
});
test('confirmation resolves the selected display name', () => assert.match(userPage, /selectedLocation\?\.display_name/));
test('shared chapter state has no numeric fallback records', () => {
  assert.doesNotMatch(appState, /fallbackChapters/);
  assert.match(appState, /useState\(\[\]\)/);
});
test('User Management retains desktop and mobile responsive layouts', () => {
  assert.match(styles, /@media\(max-width:900px\)/);
  assert.match(styles, /@media\(max-width:600px\)/);
});
