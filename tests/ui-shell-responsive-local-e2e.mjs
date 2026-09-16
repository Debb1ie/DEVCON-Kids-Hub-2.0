import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = mkdtempSync(join(tmpdir(), 'devcon-shell-e2e-'));
const browser = spawn(edgePath, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--disable-background-networking', 'about:blank'], { stdio: 'ignore' });

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
const target = await fetch(`http://127.0.0.1:${port}/json/new?http://127.0.0.1:4175/tests/fixtures/events-harness.html`, { method: 'PUT' }).then((response) => response.json());
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
  const callbacks = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) callbacks.reject(new Error(message.error.message));
  else callbacks.resolve(message.result);
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
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${expression}`);
};
const escape = async () => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
};

const viewports = [[320, 800], [375, 812], [768, 1024], [1024, 768], [1440, 900]];

try {
  await send('Page.enable');
  await send('Runtime.enable');

  for (const [width, height] of viewports) {
    const compact = width <= 768;
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: compact });
    await send('Page.navigate', { url: 'http://127.0.0.1:4175/tests/fixtures/events-harness.html' });
    await waitFor("Boolean(document.querySelector('#create-event-button'))");

    const shell = await evaluate(`(() => {
      const toggle = document.querySelector('button[aria-controls="primary-navigation"]');
      const rect = toggle.getBoundingClientRect();
      const logo = document.querySelector('img[alt="DEVCON Kids"]');
      return {
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        toggleVisible: Boolean(toggle.offsetWidth || toggle.offsetHeight),
        toggleWidth: rect.width,
        toggleHeight: rect.height,
        label: toggle.getAttribute('aria-label'),
        expanded: toggle.getAttribute('aria-expanded'),
        controls: toggle.getAttribute('aria-controls'),
        objectFit: getComputedStyle(logo).objectFit,
        logoRatioPreserved: Math.abs((logo.getBoundingClientRect().width / logo.getBoundingClientRect().height) - (logo.naturalWidth / logo.naturalHeight)) < 0.05
      };
    })()`);
    assert.equal(shell.overflow, false);
    assert.equal(shell.toggleVisible, true);
    assert.ok(shell.toggleWidth >= 44 && shell.toggleHeight >= 44);
    assert.equal(shell.controls, 'primary-navigation');
    assert.equal(shell.objectFit, 'contain');
    assert.equal(shell.logoRatioPreserved, true);

    await evaluate("document.querySelector('button[aria-controls=primary-navigation]').focus(); document.querySelector('button[aria-controls=primary-navigation]').click()");
    if (compact) {
      await waitFor("document.querySelector('button[aria-controls=primary-navigation]').getAttribute('aria-expanded') === 'true'");
      const open = await evaluate(`({
        focusInside: document.querySelector('#primary-navigation').contains(document.activeElement),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        readableLinks: [...document.querySelectorAll('#primary-navigation a')].every((link) => getComputedStyle(link).fontSize !== '0px')
      })`);
      assert.deepEqual(open, { focusInside: true, overflow: false, readableLinks: true });
      await escape();
      await waitFor("document.querySelector('button[aria-controls=primary-navigation]').getAttribute('aria-expanded') === 'false'");
      await waitFor("document.activeElement === document.querySelector('button[aria-controls=primary-navigation]')");
      assert.equal(await evaluate("document.activeElement === document.querySelector('button[aria-controls=primary-navigation]')"), true);
    } else {
      assert.equal(await evaluate("document.querySelector('button[aria-controls=primary-navigation]').getAttribute('aria-expanded')"), 'false');
      await evaluate("document.querySelector('button[aria-controls=primary-navigation]').click()");
      assert.equal(await evaluate("document.querySelector('button[aria-controls=primary-navigation]').getAttribute('aria-expanded')"), 'true');
    }

    await evaluate("document.querySelector('#create-event-button').click()");
    await waitFor("Boolean(document.querySelector('#event-name'))");
    await evaluate(`(() => {
      const input = document.querySelector('#event-name');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'Responsive unsaved fixture');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const trigger = [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Cancel');
      trigger.dataset.testTrigger = 'true';
      trigger.focus();
      trigger.click();
    })()`);
    await waitFor("document.activeElement?.textContent === 'Stay'");
    const dialog = await evaluate(`(() => {
      const root = document.querySelector('[role="alertdialog"]');
      const rect = root.getBoundingClientRect();
      return {
        fits: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        safeFocus: document.activeElement?.textContent === 'Stay'
      };
    })()`);
    assert.deepEqual(dialog, { fits: true, overflow: false, safeFocus: true });
    await evaluate("[...document.querySelectorAll('button')].find((button) => button.textContent === 'Stay').click()");
    await waitFor("document.activeElement?.dataset?.testTrigger === 'true'");
    assert.deepEqual(await evaluate("globalThis.__eventHarnessCalls"), { addEvent: 0, updateEvent: 0, uploadEventImage: 0, deleteEvent: 0 });
  }

  console.log(`ui-shell-responsive-local-e2e: ${viewports.length} viewports passed`);
} finally {
  try { await send('Browser.close'); } catch {}
  socket.close();
  if (browser.exitCode === null) {
    await Promise.race([new Promise((resolve) => browser.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 1000))]);
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
