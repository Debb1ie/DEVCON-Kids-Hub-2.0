import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const imagePath = resolve('src/assets/devcon-kids-logo.jpg');
const profile = mkdtempSync(join(tmpdir(), 'devcon-image-e2e-'));
const browser = spawn(edgePath, [
  '--headless=new',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--disable-background-networking',
  'about:blank'
], { stdio: 'ignore' });

const waitForPort = async () => {
  const portFile = join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const [port] = readFileSync(portFile, 'utf8').split(/\r?\n/);
      if (port) return Number(port);
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error('Edge DevTools port was not created.');
};

const port = await waitForPort();
const target = await fetch(`http://127.0.0.1:${port}/json/new?http://127.0.0.1:4175/tests/fixtures/events-harness.html`, { method: 'PUT' }).then((response) => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolveOpen, reject) => {
  socket.addEventListener('open', resolveOpen, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let commandId = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const callbacks = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) callbacks.reject(new Error(message.error.message));
  else callbacks.resolve(message.result);
});
const send = (method, params = {}) => new Promise((resolveCommand, reject) => {
  commandId += 1;
  pending.set(commandId, { resolve: resolveCommand, reject });
  socket.send(JSON.stringify({ id: commandId, method, params }));
});
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};
const waitFor = async (expression) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await evaluate(expression)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error(`Timed out waiting for ${expression}`);
};
const choose = (selector, label) => evaluate(`(() => {
  const select = document.querySelector(${JSON.stringify(selector)});
  const option = [...select.options].find((candidate) => candidate.textContent.trim() === ${JSON.stringify(label)});
  if (!option) return false;
  select.value = option.value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`);
const clickText = (label) => evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent.trim() === ${JSON.stringify(label)});
  if (!button) return false;
  button.focus();
  button.click();
  return true;
})()`);
const attachImage = async () => {
  const documentNode = await send('DOM.getDocument');
  const inputNode = await send('DOM.querySelector', { nodeId: documentNode.root.nodeId, selector: '#event-image-file' });
  assert.ok(inputNode.nodeId);
  await send('DOM.setFileInputFiles', { nodeId: inputNode.nodeId, files: [imagePath] });
};

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');
  await waitFor("Boolean([...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Create event'))");
  assert.equal(await clickText('Create event'), true);
  assert.equal(await choose('#event-chapter', 'Manila'), true);
  assert.equal(await clickText('Continue'), true);
  await waitFor("document.querySelectorAll('#event-coordinator option').length > 1");
  assert.equal(await choose('#event-coordinator', 'Sinag Exe — sinag@example.test'), true);

  await attachImage();
  await waitFor("document.body.innerText.includes('Staged locally')");
  const staged = await evaluate(`(() => {
    const image = document.querySelector('.event-image-preview-16-9 img');
    const frame = document.querySelector('.event-image-preview-16-9');
    return {
      blob: image.src.startsWith('blob:'),
      staged: document.body.innerText.includes('Staged locally'),
      aspectRatio: getComputedStyle(frame).aspectRatio,
      objectFit: getComputedStyle(image).objectFit,
      calls: globalThis.__eventHarnessCalls,
      remoteRequests: performance.getEntriesByType('resource').filter((entry) => !entry.name.startsWith(location.origin) && /supabase|storage|upload-intent/i.test(entry.name)).length
    };
  })()`);
  assert.equal(staged.blob, true);
  assert.equal(staged.staged, true);
  assert.equal(staged.aspectRatio, '16 / 9');
  assert.equal(staged.objectFit, 'cover');
  assert.deepEqual(staged.calls, { addEvent: 0, updateEvent: 0, uploadEventImage: 0, deleteEvent: 0 });
  assert.equal(staged.remoteRequests, 0);

  assert.equal(await clickText('Back'), true);
  assert.equal(await clickText('Continue'), true);
  await waitFor("document.body.innerText.includes('Staged locally')");
  assert.equal(await evaluate("document.querySelector('.event-image-preview-16-9 img').src.startsWith('blob:')"), true);

  assert.equal(await clickText('Remove'), true);
  await waitFor("!document.body.innerText.includes('Staged locally')");
  await attachImage();
  await waitFor("document.body.innerText.includes('Staged locally')");
  assert.equal(await clickText('Remove'), true);
  await waitFor("!document.body.innerText.includes('Staged locally')");

  const finalState = await evaluate(`({
    calls: globalThis.__eventHarnessCalls,
    preview: Boolean(document.querySelector('.event-image-preview-16-9 img')),
    remoteRequests: performance.getEntriesByType('resource').filter((entry) => !entry.name.startsWith(location.origin) && /supabase|storage|upload-intent/i.test(entry.name)).length
  })`);
  assert.deepEqual(finalState.calls, { addEvent: 0, updateEvent: 0, uploadEventImage: 0, deleteEvent: 0 });
  assert.equal(finalState.preview, false);
  assert.equal(finalState.remoteRequests, 0);
  console.log('event-image-staging-local-e2e: 12 assertions passed');
} finally {
  try { await send('Browser.close'); } catch {}
  socket.close();
  if (browser.exitCode === null) {
    await Promise.race([
      new Promise((resolveExit) => browser.once('exit', resolveExit)),
      new Promise((resolveExit) => setTimeout(resolveExit, 1000))
    ]);
  }
  if (browser.exitCode === null) {
    const exited = new Promise((resolveExit) => browser.once('exit', resolveExit));
    browser.kill();
    await Promise.race([exited, new Promise((resolveExit) => setTimeout(resolveExit, 2000))]);
  }
  await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) {
    if (error?.code !== 'EPERM') throw error;
    console.warn('Temporary Edge profile cleanup deferred because Windows still holds a file lock.');
  }
}
