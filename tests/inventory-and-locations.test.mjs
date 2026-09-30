import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const page = readFileSync('src/pages/Inventory.jsx', 'utf8');
const css = readFileSync('src/pages/Inventory.css', 'utf8');
const iloilo = readFileSync('supabase/migrations/20260930000200_iloilo_canonical_chapter.sql', 'utf8');

test('inventory modal is one surface with a main column and a media column', () => {
  assert.match(page, /className="inventory-form-body"/);
  assert.match(page, /className="inventory-form-main"[\s\S]*Item Name[\s\S]*Category[\s\S]*Stock Quantity[\s\S]*className="inventory-form-media"[\s\S]*Image URL/);
  assert.doesNotMatch(page, /inventory-form-section/, 'the boxed sections are gone');
  assert.match(css, /\.inventory-form-body \{[\s\S]*?grid-template-columns: minmax\(0, 1\.65fr\) minmax\(0, 1fr\)/);
  assert.match(css, /\.card\.inventory-form-card \{[\s\S]*?padding: 0;[\s\S]*?background: var\(--surface-elevated\)/);
});

test('inventory modal header and footer keep Save Item and Cancel together', () => {
  assert.match(page, /'Add New Inventory Item'/);
  assert.match(page, /aria-label="Close form"/);
  assert.match(page, /className="inventory-form-actions"[\s\S]*?Cancel[\s\S]*?'Save Item'/);
  assert.match(css, /\.inventory-form-actions \{[\s\S]*?justify-content: flex-end;[\s\S]*?position: sticky;/);
});

test('image preview has empty, image and broken states with a fixed frame', () => {
  assert.match(page, /const state = !url \? 'empty' : !valid \|\| failed \? 'broken' : 'image'/);
  assert.match(page, /'Image preview'/);
  assert.match(page, /'Image could not be loaded'/);
  assert.match(page, /onError=\{onError\}/);
  assert.match(css, /\.inventory-image-preview \{[\s\S]*?aspect-ratio: 4 \/ 3;/);
  assert.match(css, /\.inventory-image-preview img \{[\s\S]*?object-fit: contain;/);
});

test('inventory modal stacks into one column on phones and uses theme tokens', () => {
  const phone = css.slice(css.indexOf('@media (max-width: 640px)'));
  assert.match(phone, /\.inventory-form-body,\s*\.inventory-form-row \{\s*grid-template-columns: 1fr;/);
  assert.match(phone, /\.inventory-form-actions \{\s*flex-direction: column-reverse;/);
  assert.match(css, /input::placeholder \{\s*color: var\(--text-placeholder\);\s*opacity: 1;/);
  assert.match(css, /background: var\(--surface-input\)/);
  assert.match(css, /border: 1px solid var\(--border-strong\)/);
});

test('inventory save behavior is unchanged', () => {
  assert.match(page, /onSubmit=\{handleAdd\}/);
  assert.match(page, /await addInventoryItem\(payload\)/);
  assert.match(page, /await updateInventoryItem\(editingId, payload\)/);
});

test('"Ilo Ilo" is not a source-code value; Iloilo is the only seeded spelling', () => {
  const sources = readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql') && !name.includes('iloilo_canonical'));
  for (const name of sources) assert.doesNotMatch(readFileSync(`supabase/migrations/${name}`, 'utf8'), /ilo[\s-]+ilo/i, name);
  assert.match(readFileSync('supabase/migrations/20260909000300_devcon_philippines_chapters.sql', 'utf8'), /\('Iloilo','chapter'\)/);
});

test('Iloilo migration merges duplicates by repointing every chapter foreign key', () => {
  assert.match(iloilo, /lower\(regexp_replace\(c\.name, '\[\^A-Za-z\]', '', 'g'\)\) = 'iloilo'/);
  assert.match(iloilo, /con\.confrelid = 'public\.chapters'::regclass/);
  assert.match(iloilo, /execute format\('update %I\.%I set %I = \$1 where %I = \$2'/);
  assert.match(iloilo, /delete from public\.chapters where id = duplicate\.id/);
  assert.match(iloilo, /'CHAPTER_MERGED'/);
  assert.match(iloilo, /update public\.events set chapter = 'Iloilo'/);
  assert.match(iloilo, /update public\.volunteers set chapter = 'Iloilo'/);
  assert.match(iloilo, /Iloilo chapter merge verification failed/);
});

test('inventory modal and backdrop render at viewport level with a translucent scrim', () => {
  assert.match(page, /createPortal\([\s\S]*?inventory-modal-overlay[\s\S]*?document\.body\s*\)/);
  const overlay = css.slice(css.indexOf('.inventory-modal-overlay {'), css.indexOf('.inventory-modal-container {'));
  assert.match(overlay, /position: fixed;\s*inset: 0;/);
  assert.match(overlay, /background: var\(--scrim\)/);
  assert.doesNotMatch(css, /sidebar-width/, 'the backdrop no longer skips the sidebar');
  const tokens = readFileSync('src/styles/tokens.css', 'utf8');
  assert.match(tokens, /--scrim: rgba\(15, 15, 25, 0\.3\)/);
  assert.match(tokens, /--scrim: rgba\(4, 3, 10, 0\.62\)/);
});
