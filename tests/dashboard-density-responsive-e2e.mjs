import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const edgePath = 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
const profile = mkdtempSync(join(tmpdir(), 'devcon-dashboard-density-'));
const browser = spawn(edgePath, [
  '--headless=new',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--disable-background-networking',
  'about:blank',
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
const target = await fetch(`http://127.0.0.1:${port}/json/new?http://127.0.0.1:4176/tests/fixtures/dashboard-density-harness.html`, { method: 'PUT' }).then((response) => response.json());
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

const viewports = [[375, 812], [768, 1024], [1024, 768], [1440, 900]];

try {
  await send('Page.enable');
  await send('Runtime.enable');
  for (const [width, height] of viewports) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width <= 768 });
    await send('Page.navigate', { url: 'http://127.0.0.1:4176/tests/fixtures/dashboard-density-harness.html' });
    await waitFor("document.readyState === 'complete' && Boolean(document.querySelector('.chart-container'))");
    const state = await evaluate(`(() => {
      const chart = document.querySelector('.chart-container').getBoundingClientRect();
      const chartCard = document.querySelector('.chart-section').getBoundingClientRect();
      const chapters = document.querySelector('.chapters-section').getBoundingClientRect();
      return {
        chartHeight: chart.height,
        cardHeight: chartCard.height,
        chaptersHeight: chapters.height,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    })()`);
    assert.equal(state.overflow, false, `${width}px has no document horizontal overflow`);
    if (width <= 640) assert.ok(state.chartHeight >= 240 && state.chartHeight <= 290);
    else assert.ok(state.chartHeight >= 280 && state.chartHeight <= 340);
    assert.ok(state.cardHeight < state.chaptersHeight, `${width}px chart card does not stretch to its neighbor`);
  }
  console.log(`dashboard-density-responsive-e2e: ${viewports.length} viewports passed`);
} finally {
  try { await send('Browser.close'); } catch {}
  socket.close();
  if (browser.exitCode === null) browser.kill();
  await new Promise((resolve) => setTimeout(resolve, 500));
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
}
