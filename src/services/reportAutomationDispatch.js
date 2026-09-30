import { authSessionLifecycle } from '../auth/sessionLifecycle.js';

const SESSION_EXPIRY_SKEW_SECONDS = 30;
const runtimeEnv = import.meta.env || globalThis.process?.env || {};
const defaultSupabaseUrl = runtimeEnv.VITE_SUPABASE_URL;
const defaultSupabaseAnonKey = runtimeEnv.VITE_SUPABASE_ANON_KEY;
const DIAGNOSTIC_TEXT_LIMIT = 500;
const SENSITIVE_KEY = /authorization|apikey|cookie|credential|jwt|key|secret|session|token/i;

const sanitizeDiagnosticText = (value) => String(value || '')
  .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
  .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]')
  .slice(0, DIAGNOSTIC_TEXT_LIMIT);

const sanitizeDiagnostic = (value, depth = 0) => {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return sanitizeDiagnosticText(value);
  if (depth >= 3) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.slice(0, 10).map((item) => sanitizeDiagnostic(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 20).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitizeDiagnostic(item, depth + 1),
    ]));
  }
  return sanitizeDiagnosticText(value);
};

const reportDiagnostic = (diagnostic) => {
  // Intentionally contains no request headers or credentials. This is the
  // browser-visible evidence used by the controlled UAT when dispatch fails.
  console.error('[ReportExportDispatch]', JSON.stringify(diagnostic));
};

export class ReportExportDispatchError extends Error {
  constructor(message, code, options) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = 'ReportExportDispatchError';
    this.code = code;
    this.diagnostic = options?.diagnostic || null;
  }
}

const safeMessage = (error, fallback) => {
  if (error?.code === '42501') return 'You are not authorized to export this report.';
  return error?.message || fallback;
};

export async function getAuthenticatedExportSession(auth) {
  const { data, error } = await auth.getSession();
  let session = !error && data?.session
    ? data.session
    : await authSessionLifecycle.requireSession(auth).catch(() => null);
  const expiresSoon = session?.expires_at
    && session.expires_at <= Math.floor(Date.now() / 1000) + SESSION_EXPIRY_SKEW_SECONDS;

  if (error || !session?.access_token || expiresSoon) {
    const refreshed = await auth.refreshSession().catch(() => ({ data: null, error: true }));
    if (refreshed.error || !refreshed.data?.session?.access_token) return null;
    session = refreshed.data.session;
  }

  authSessionLifecycle.accept(session);
  return session;
}

const dispatchError = (status, diagnostic) => {
  if (status === 401) return new ReportExportDispatchError('Please sign in again before exporting this report.', 'DISPATCH_AUTH_REQUIRED', { diagnostic });
  if (status === 403 || status === 404) return new ReportExportDispatchError('The report export service rejected the request.', 'DISPATCH_GATEWAY_REJECTED', { diagnostic });
  if (status === 400) return new ReportExportDispatchError('The report export request was invalid.', 'DISPATCH_BAD_REQUEST', { diagnostic });
  return new ReportExportDispatchError('Report export could not be started.', 'DISPATCH_WORKER_FAILED', { diagnostic });
};

export const isRecoverablePendingExport = (automation) => Boolean(
  automation
  && automation.status === 'pending'
  && Number(automation.attempt_count || 0) === 0
  && !automation.last_attempted_at
);

export const createReportAutomationService = (client, options = {}) => {
  const supabaseUrl = options.supabaseUrl || defaultSupabaseUrl;
  const supabaseAnonKey = options.supabaseAnonKey || defaultSupabaseAnonKey;
  const fetchImpl = options.fetch || globalThis.fetch;
  const edgeExportUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/report-export` : null;
  const dispatches = new Map();
  const load = async (reportId) => {
    if (!reportId) return null;
    const result = await client.from('post_event_report_exports')
      .select('report_id,status,attempt_count,last_attempted_at,completed_at,safe_error_message,drive_folder_url,final_export_url,sheet_row_reference,automation_version')
      .eq('report_id', reportId).maybeSingle();
    if (result.error?.code === '42P01' || result.error?.code === 'PGRST205') return null;
    if (result.error) throw new Error(safeMessage(result.error, 'Export status could not be loaded.'));
    return result.data;
  };
  const exportReport = async (reportId) => {
    if (!reportId) throw new Error('Save the report before exporting it.');
    const session = await getAuthenticatedExportSession(client.auth);
    if (!session?.access_token) throw new ReportExportDispatchError('Please sign in again before exporting this report.', 'DISPATCH_AUTH_REQUIRED');
    if (!edgeExportUrl || !supabaseAnonKey || !fetchImpl) {
      throw new ReportExportDispatchError('Report export could not be started.', 'DISPATCH_UNAVAILABLE');
    }
    let response;
    try {
      response = await fetchImpl(edgeExportUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reportId }),
      });
    } catch (cause) {
      const diagnostic = {
        requestStarted: true,
        responseReceived: false,
        errorName: sanitizeDiagnosticText(cause?.name || 'Error'),
        errorMessage: sanitizeDiagnosticText(cause?.message || 'Fetch failed without an error message.'),
      };
      reportDiagnostic(diagnostic);
      throw new ReportExportDispatchError('Report export could not be started.', 'DISPATCH_CORS_FAILED', { cause, diagnostic });
    }
    let payload;
    if (typeof response.text === 'function') {
      const rawBody = await response.text().catch(() => '');
      try {
        payload = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        payload = rawBody || null;
      }
    } else {
      payload = await response.json().catch(() => null);
    }
    const diagnostic = {
      requestStarted: true,
      responseReceived: true,
      status: response.status,
      statusText: sanitizeDiagnosticText(response.statusText),
      ok: response.ok,
      body: sanitizeDiagnostic(payload),
    };
    if (!response.ok) {
      reportDiagnostic(diagnostic);
      throw dispatchError(response.status, diagnostic);
    }
    return payload?.export || null;
  };
  const dispatchPending = async (reportId, current = null) => {
    const automation = current || await load(reportId);
    if (!isRecoverablePendingExport(automation)) return { automation, dispatched: false, dispatchError: null };
    if (!dispatches.has(reportId)) dispatches.set(reportId, exportReport(reportId));
    try {
      return { automation: await dispatches.get(reportId), dispatched: true, dispatchError: null };
    } catch (error) {
      return {
        automation: await load(reportId).catch(() => automation),
        dispatched: false,
        dispatchError: error.message || 'Report approved, but export could not be started automatically.',
        dispatchErrorCode: error.code || 'DISPATCH_WORKER_FAILED',
        dispatchDiagnostic: error.diagnostic || null,
      };
    } finally {
      dispatches.delete(reportId);
    }
  };
  const loadAndRecover = async (reportId) => dispatchPending(reportId, await load(reportId));
  return { load, export: exportReport, dispatchPending, loadAndRecover };
};
