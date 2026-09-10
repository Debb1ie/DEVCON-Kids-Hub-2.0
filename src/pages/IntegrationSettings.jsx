import { useCallback, useEffect, useState } from 'react';
import { CloudCog, FolderSync, Link2, RefreshCcw, Save, Sheet, Unlink } from 'lucide-react';
import { useApp } from '../context/AppState.jsx';
import { googleWorkspaceService } from '../services/googleWorkspaceService.js';
import './IntegrationSettings.css';

const EMPTY = { googleDriveRoot: '', reportSheet: '', automaticFolders: false, sheetSync: false, sheetTabName: 'Post Event Reports', connectedEmail: '', connectedAt: null };
const oauthResult = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('google');

export default function IntegrationSettings() {
  const { roleKey } = useApp();
  const [form, setForm] = useState(EMPTY);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(oauthResult === 'connected' ? 'Google account connected.' : '');
  const [error, setError] = useState(oauthResult && oauthResult !== 'connected' ? 'Google authorization was not completed. Please connect again.' : '');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await googleWorkspaceService.load(roleKey);
      const settings = result.settings;
      setForm(settings ? {
        googleDriveRoot: settings.google_drive_root_folder_id || '',
        reportSheet: settings.report_sheet_id || '',
        automaticFolders: settings.automatic_folder_creation_enabled,
        sheetSync: settings.sheet_synchronization_enabled,
        sheetTabName: settings.report_sheet_tab_name || 'Post Event Reports',
        connectedEmail: settings.connected_google_email || '',
        connectedAt: settings.google_connected_at,
      } : EMPTY);
      setJobs(result.jobs);
    } catch (cause) { setError(cause.message); }
    finally { setLoading(false); }
  }, [roleKey]);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    if (oauthResult) window.history.replaceState({}, document.title, '/dashboard/integrations');
  }, []);
  const change = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const connect = async () => {
    setBusy(true); setError('');
    try { window.location.assign(await googleWorkspaceService.beginAuthorization(roleKey)); }
    catch (cause) { setError(cause.message); setBusy(false); }
  };

  const disconnect = async () => {
    setBusy(true); setError(''); setNotice('');
    try { await googleWorkspaceService.disconnect(roleKey); setNotice('Google access revoked and disconnected.'); await load(); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };

  const save = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try { await googleWorkspaceService.save(roleKey, form); setNotice('Integration settings saved.'); await load(); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };

  const retry = async (id) => {
    setBusy(true); setError(''); setNotice('');
    try { await googleWorkspaceService.retry(roleKey, id); setNotice('The job is queued for retry.'); await load(); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };

  const process = async () => {
    setBusy(true); setError(''); setNotice('');
    try { const result = await googleWorkspaceService.process(roleKey); setNotice(`${result?.processed || 0} integration jobs processed.`); await load(); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="integration-state">Loading integration settings…</div>;
  return <div className="integration-page">
    <header className="integration-hero card"><div><span className="eyebrow"><CloudCog size={15}/> Server-side integration</span><h1>Google Workspace</h1><p>Connect the authorized DEVCON Google account and manage My Drive report automation.</p></div></header>
    {error && <div className="integration-alert error" role="alert">{error}</div>}
    {notice && <div className="integration-alert success" role="status">{notice}</div>}
    <section className="card integration-connection"><div><h2>Google authorization</h2>{form.connectedAt?<p>Connected as <strong>{form.connectedEmail}</strong>. Tokens remain encrypted and server-side.</p>:<p>No Google account is connected. A Super Admin must authorize the dedicated DEVCON account.</p>}</div>{form.connectedAt?<button type="button" className="btn-secondary" disabled={busy} onClick={disconnect}><Unlink size={16}/> Disconnect and revoke access</button>:<button type="button" className="btn-primary" disabled={busy} onClick={connect}><Link2 size={16}/> Connect Google account</button>}</section>
    <form className="card integration-form" onSubmit={save}>
      <div className="section-head"><div><h2>Integration settings</h2><p>Only non-secret resource references are stored here. Credentials stay in Supabase secrets.</p></div></div>
      <label><span><FolderSync size={17}/> Google Drive root folder URL or ID</span><input value={form.googleDriveRoot} onChange={(e)=>change('googleDriveRoot',e.target.value)} placeholder="My Drive folder URL or ID" autoComplete="off" /></label>
      <label><span><Sheet size={17}/> Google Sheet URL or ID</span><input value={form.reportSheet} onChange={(e)=>change('reportSheet',e.target.value)} placeholder="Google Sheet URL or ID" autoComplete="off" /></label>
      <label><span>Report sheet tab name</span><input value={form.sheetTabName} onChange={(e)=>change('sheetTabName',e.target.value)} maxLength={100} /></label>
      <label className="integration-toggle"><span><strong>Automatic event folders</strong><small>Create one deterministic folder when the first valid report is submitted.</small></span><input type="checkbox" disabled={!form.connectedAt} checked={form.automaticFolders} onChange={(e)=>change('automaticFolders',e.target.checked)} /></label>
      <label className="integration-toggle"><span><strong>Post Event Report Sheet sync</strong><small>Queue updates after submission, revision requests, and approval.</small></span><input type="checkbox" disabled={!form.connectedAt} checked={form.sheetSync} onChange={(e)=>change('sheetSync',e.target.checked)} /></label>
      <button className="btn-primary" disabled={busy} type="submit"><Save size={17}/> {busy?'Saving…':'Save integration settings'}</button>
    </form>
    <section className="card integration-jobs">
      <div className="section-head"><div><h2>Job history</h2><p>Failures never invalidate the event or report stored in Supabase.</p></div><button className="btn-secondary" type="button" disabled={busy} onClick={process}><RefreshCcw size={16}/> Process pending jobs</button></div>
      {jobs.length === 0 ? <div className="integration-state">No integration jobs yet.</div> : <div className="integration-table-wrap"><table><thead><tr><th>Type</th><th>Status</th><th>Attempts</th><th>Updated</th><th>Action</th></tr></thead><tbody>{jobs.map((job)=><tr key={job.id}><td>{job.job_type==='create_event_folder'?'Event folder':'Report Sheet sync'}</td><td><span className={`integration-status ${job.status}`}>{job.status}</span>{job.safe_error_message&&<small>{job.safe_error_message}</small>}</td><td>{job.attempt_count}</td><td>{new Date(job.updated_at).toLocaleString()}</td><td>{job.status==='failed'?<button type="button" disabled={busy} onClick={()=>retry(job.id)}>Retry</button>:'—'}</td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}
