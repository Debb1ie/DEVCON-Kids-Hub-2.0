import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync('src/App.jsx', 'utf8');
const sidebar = readFileSync('src/components/Sidebar.jsx', 'utf8');
const state = readFileSync('src/context/AppState.jsx', 'utf8');
const volunteerEvents = readFileSync('src/pages/VolunteerEvents.jsx', 'utf8');
const applicationReview = readFileSync('src/components/EventApplicationsPanel.jsx', 'utf8');
const events = readFileSync('src/pages/Events.jsx', 'utf8');
const knowledgePage = readFileSync('src/pages/KnowledgeBase.jsx', 'utf8');
const faqPage = readFileSync('src/pages/FAQSuggestions.jsx', 'utf8');
const ragService = readFileSync('src/services/ragService.js', 'utf8');

test('routes and sidebar share the centralized permission registry', () => {
  assert.match(app, /canAccessRoute/);
  assert.match(sidebar, /canAccessRoute/);
  assert.doesNotMatch(app, /roles=\{\[/);
});

test('Social Media is deactivated and its former URL redirects to the dashboard', () => {
  assert.doesNotMatch(sidebar, /Social Media|\/dashboard\/social-media/);
  assert.doesNotMatch(app, /SocialMediaCMS/);
  assert.match(app, /path="social-media" element=\{<Navigate to="\/dashboard" replace \/>\}/);
});

test('volunteers receive the application-focused events interface', () => {
  assert.match(app, /roleKey === 'volunteer'.*VolunteerEvents/s);
  assert.match(volunteerEvents, /Apply as Volunteer/);
  assert.match(volunteerEvents, /Withdraw application/);
});

test('protected mutations no longer create local mock records on database failure', () => {
  assert.doesNotMatch(state, /mockNew/);
  assert.doesNotMatch(state, /Falling back to local .* delete/);
});

test('authorized event pages include application review and confirmation controls', () => {
  assert.match(events, /EventApplicationsPanel/);
  assert.match(applicationReview, /listManagedEventApplications/);
  assert.match(applicationReview, /ConfirmationModal/);
  assert.match(applicationReview, /accepted/);
  assert.match(applicationReview, /rejected/);
  assert.match(applicationReview, /withdrawn/);
  assert.match(applicationReview, /Reopen/);
});

test('Knowledge Base route, sidebar, page, and services share the Super Admin permission boundary', () => {
  assert.match(app, /ProtectedRoute route="\/dashboard\/knowledge-base"/);
  assert.match(sidebar, /AI Knowledge Base.*\/dashboard\/knowledge-base/);
  assert.match(knowledgePage, /listDocuments\(roleKey\)/);
  assert.match(knowledgePage, /storeDocumentChunks\([^;]+roleKey\)/s);
  assert.match(ragService, /assertKnowledgeManager\(role\)/);
  assert.match(faqPage, /canManageKnowledge &&/);
});
