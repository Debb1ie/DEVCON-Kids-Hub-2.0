import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// The DEVCON Kids PNG logo was retired by the approved Spark Hub rebrand. These checks keep it
// from coming back into shipped frontend source. Generated folders are intentionally not scanned.
const root = fileURLToPath(new URL('..', import.meta.url));
const DEPRECATED = /devcon-kids-logo\.png/;
const TEXT_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx', '.css', '.html', '.svg', '.json']);

const listFiles = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? listFiles(path) : [path];
});

test('the deprecated PNG logo asset is removed', () => {
  assert.equal(existsSync(join(root, 'src/assets/devcon-kids-logo.png')), false);
});

test('active frontend source never references the deprecated PNG logo', () => {
  const files = [...listFiles(join(root, 'src')), ...listFiles(join(root, 'public')), join(root, 'index.html')]
    .filter((file) => TEXT_EXTENSIONS.has(extname(file)));
  assert.ok(files.length > 20, 'frontend source was scanned');
  const offenders = files.filter((file) => DEPRECATED.test(readFileSync(file, 'utf8')));
  assert.deepEqual(offenders, []);
});

test('the document identity uses the Spark Hub favicon and product title', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.match(html, /<title>DEVCON Kids Hub<\/title>/);
  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg" \/>/);
  const favicon = readFileSync(join(root, 'public/favicon.svg'), 'utf8');
  assert.match(favicon, /#5638D8/i, 'favicon uses Orbit Purple');
  assert.match(favicon, /#FFC93C/i, 'favicon carries the Spark Hub spark');
});
