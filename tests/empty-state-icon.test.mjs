import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TrendingUp } from 'lucide-react';
import { MemoryRouter } from 'react-router-dom';
import { createElement } from 'react';
import { createServer } from 'vite';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('EmptyState instantiates configured Lucide icons instead of rendering component objects', async () => {
  const server = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
    plugins: [
      {
        name: 'dashboard-app-state-fixture',
        enforce: 'pre',
        resolveId(source, importer) {
          if (source === '../context/AppState' && importer?.endsWith('/src/pages/Dashboard.jsx')) {
            return '\0dashboard-app-state-fixture';
          }
          return null;
        },
        load(id) {
          if (id !== '\0dashboard-app-state-fixture') return null;
          return `export const useApp = () => ({
            stats: {}, chapters: [], growthData: [], eventsList: [], inventoryList: [],
            isSuperadmin: true,
            user: { name: 'Test Administrator', role: 'Super Admin', roleKey: 'super_admin' },
            dashboardSettings: {},
          });`;
        },
      },
    ],
  });

  try {
    const { default: EmptyState } = await server.ssrLoadModule('/src/components/EmptyState.jsx');
    const markup = renderToStaticMarkup(
      EmptyState({
        icon: TrendingUp,
        title: 'No growth trends recorded',
        description: 'Learner impact trends will appear here.',
      }),
    );

    assert.match(markup, /<svg/);
    assert.match(markup, /aria-hidden="true"/);
    assert.match(markup, /No growth trends recorded/);

    const { default: Dashboard } = await server.ssrLoadModule('/src/pages/Dashboard.jsx');
    const dashboardMarkup = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(Dashboard)),
    );

    assert.match(dashboardMarkup, /Welcome back, Test Administrator!/);
    assert.match(dashboardMarkup, /No growth trends recorded/);
    assert.match(dashboardMarkup, /No active chapters/);
    assert.match(dashboardMarkup, /No events recorded/);
    assert.match(dashboardMarkup, /No inventory records/);
    assert.equal((dashboardMarkup.match(/<svg/g) || []).length >= 4, true);
  } finally {
    await server.close();
  }
});

test('EmptyState source never renders its configured component as a raw child', () => {
  const source = read('src/components/EmptyState.jsx');

  assert.match(source, /const Icon = icon/);
  assert.match(source, /<Icon aria-hidden="true" \/>/);
  assert.doesNotMatch(source, /\{icon\}/);
});
