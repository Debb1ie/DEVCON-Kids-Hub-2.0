import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = mkdtempSync(join(tmpdir(), 'devcon-modal-e2e-'));
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
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Edge DevTools port was not created.');
};

const port = await waitForPort();
const target = await fetch(`http://127.0.0.1:${port}/json/new?http://127.0.0.1:4174/tests/fixtures/confirmation-modal-harness.html`, { method: 'PUT' }).then((response) => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let commandId = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

const send = (method, params = {}) => new Promise((resolve, reject) => {
  commandId += 1;
  pending.set(commandId, { resolve, reject });
  socket.send(JSON.stringify({ id: commandId, method, params }));
});

const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};

const waitFor = async (expression) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${expression}`);
};

const viewports = [
  [320, 800],
  [375, 812],
  [768, 1024],
  [1024, 768],
  [1440, 900]
];

try {
  await send('Page.enable');
  await send('Runtime.enable');

  for (const [width, height] of viewports) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 800 });
    await send('Page.navigate', { url: 'http://127.0.0.1:4174/tests/fixtures/confirmation-modal-harness.html' });
    await waitFor("document.readyState === 'complete' && Boolean(document.querySelector('#fixture-cancel'))");
    await evaluate("document.querySelector('#fixture-cancel').focus(); document.querySelector('#fixture-cancel').click()");
    await waitFor("document.activeElement?.textContent === 'Stay'");

    const state = await evaluate(`(() => {
      const dialog = document.querySelector('[role="alertdialog"]');
      const rect = dialog.getBoundingClientRect();
      return {
        width: innerWidth,
        height: innerHeight,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        active: document.activeElement?.textContent,
        modal: dialog.getAttribute('aria-modal'),
        labelled: Boolean(document.getElementById(dialog.getAttribute('aria-labelledby'))),
        described: Boolean(document.getElementById(dialog.getAttribute('aria-describedby'))),
        fits: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
        rootInert: document.querySelector('#root').hasAttribute('inert'),
        scrollLocked: document.body.style.overflow === 'hidden'
      };
    })()`);

    assert.deepEqual(state, {
      width,
      height,
      overflow: false,
      active: 'Stay',
      modal: 'true',
      labelled: true,
      described: true,
      fits: true,
      rootInert: true,
      scrollLocked: true
    });

    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
    await waitFor("!document.querySelector('[role=alertdialog]')");
    await waitFor("document.activeElement?.id === 'fixture-cancel'");
    const closed = await evaluate(`({
      focus: document.activeElement?.id,
      inert: document.querySelector('#root').hasAttribute('inert'),
      overflow: document.body.style.overflow
    })`);
    assert.deepEqual(closed, { focus: 'fixture-cancel', inert: false, overflow: '' });
  }

  console.log(`confirmation-modal-responsive-e2e: ${viewports.length} viewports passed`);
} finally {
  try { await send('Browser.close'); } catch {}
  socket.close();
  if (browser.exitCode === null) {
    await Promise.race([
      new Promise((resolve) => browser.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 1000))
    ]);
  }
  if (browser.exitCode === null) {
    const exited = new Promise((resolve) => browser.once('exit', resolve));
    browser.kill();
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) {
    if (error?.code !== 'EPERM') throw error;
    console.warn('Temporary Edge profile cleanup deferred because Windows still holds a file lock.');
  }
}
