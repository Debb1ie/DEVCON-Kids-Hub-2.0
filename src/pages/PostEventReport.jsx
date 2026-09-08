import { useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, FileText, Image, Loader2, Pencil, Plus, Save, Trash2, UploadCloud } from 'lucide-react';
import { useApp } from '../context/AppState';
import { postEventReportRepository, validateReportFile } from '../services/postEventReportService';
import './PostEventReport.css';

const STEPS = ['General Information', 'Attendance', 'Finance', 'Impact and Documentation', 'Review and Submit'];
const EMPTY = { eventId: '', eventName: '', chapter: '', eventDate: '', venue: '', coordinator: '', summary: '', registered: '', attended: '', children: '', volunteers: '', attendanceNotes: '', budget: '', keyLearnings: '', challenges: '', communityImpact: '', recommendations: '', satisfaction: '' };
const EMPTY_TRANSACTION = { description: '', category: '', amount: '' };
const LABELS = { draft: 'Draft', submitted: 'Submitted', needs_revision: 'Needs Revision', approved: 'Approved', archived: 'Archived' };
const money = (value) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value) || 0);

export default function PostEventReport() {
  const { eventsList = [], isAdmin, user } = useApp();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(EMPTY);
  const [reportId, setReportId] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [transaction, setTransaction] = useState(EMPTY_TRANSACTION);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [files, setFiles] = useState([]);
  const [fileCategory, setFileCategory] = useState('event_documentation');
  const [status, setStatus] = useState('draft');
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState('Select an event to load or create its local report.');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);
  const editable = status === 'draft' || status === 'needs_revision';
  const expenses = useMemo(() => transactions.reduce((sum, item) => sum + Number(item.amount || 0), 0), [transactions]);
  const balance = Number(form.budget || 0) - expenses;

  const update = (field, value) => { setForm((current) => ({ ...current, [field]: value })); setErrors((current) => ({ ...current, [field]: '' })); setNotice(''); };

  const loadEvent = async (eventId) => {
    const event = eventsList.find((item) => String(item.id) === eventId);
    if (!event) { setForm(EMPTY); setReportId(null); setTransactions([]); setFiles([]); return; }
    setBusy(true); setNotice('Loading report…');
    try {
      const data = await postEventReportRepository.loadByEvent(event.id);
      const report = data?.report;
      setForm({ ...EMPTY, eventId: String(event.id), eventName: event.title || '', chapter: event.chapter || '', eventDate: event.event_date || '', venue: report?.venue || '', coordinator: report?.coordinator_name || event.coordinator || '', summary: report?.event_summary || '', registered: data?.attendance?.registered_count ?? '', attended: data?.attendance?.attended_count ?? '', children: data?.attendance?.children_reached ?? '', volunteers: data?.attendance?.volunteers_involved ?? '', attendanceNotes: data?.attendance?.notes || '', budget: data?.finance?.approved_budget ?? '', keyLearnings: data?.impact?.key_learnings || '', challenges: data?.impact?.challenges || '', communityImpact: data?.impact?.community_impact || '', recommendations: data?.impact?.recommendations || '', satisfaction: data?.impact?.satisfaction_rating || '' });
      setReportId(report?.id || null); setStatus(report?.status || 'draft');
      setTransactions((data?.transactions || []).map((item) => ({ id: item.id, description: item.description, category: item.expense_category, amount: Number(item.amount), persisted: true })));
      setFiles((data?.attachments || []).map((item) => ({ ...item, persisted: true, name: item.file_name, type: item.file_type, size: item.file_size })));
      setNotice(data ? 'Report loaded from local Supabase.' : 'No report exists yet. Save to create a draft.');
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  };

  const validateStep = (index) => {
    const next = {};
    if (index === 0) { if (!form.eventId) next.eventId = 'Select an existing event.'; if (!form.eventName) next.eventName = 'Event name is required.'; if (!form.chapter) next.chapter = 'Chapter is required.'; if (!form.eventDate) next.eventDate = 'Event date is required.'; if (!form.venue.trim()) next.venue = 'Venue is required.'; }
    if (index === 1) { ['registered', 'attended', 'children', 'volunteers'].forEach((field) => { if (form[field] === '' || Number(form[field]) < 0) next[field] = 'Enter zero or a positive number.'; }); if (Number(form.attended) > Number(form.registered)) next.attended = 'Attendance cannot exceed registrations.'; }
    if (index === 2 && (form.budget === '' || Number(form.budget) < 0)) next.budget = 'Enter zero or a positive budget.';
    if (index === 3) { if (!form.keyLearnings.trim()) next.keyLearnings = 'Key learnings are required.'; if (!form.communityImpact.trim()) next.communityImpact = 'Community impact is required.'; }
    setErrors(next); return Object.keys(next).length === 0;
  };

  const goNext = () => { if (validateStep(step)) { setStep((current) => Math.min(current + 1, 4)); window.scrollTo({ top: 0, behavior: 'smooth' }); } };

  const persistDraft = async () => {
    if (!editable) { setNotice('Submitted and approved reports cannot be edited.'); return null; }
    if (!form.eventId || !user?.id) { setNotice('Select an event and sign in before saving.'); return null; }
    setBusy(true); setNotice('Saving draft to local Supabase…');
    try {
      const result = await postEventReportRepository.saveDraft({ reportId, eventId: form.eventId, userId: user.id, report: { venue: form.venue, coordinatorName: form.coordinator, eventSummary: form.summary }, attendance: { registeredCount: form.registered, attendedCount: form.attended, childrenReached: form.children, volunteersInvolved: form.volunteers, notes: form.attendanceNotes }, finance: { approvedBudget: form.budget }, impact: { keyLearnings: form.keyLearnings, challenges: form.challenges, communityImpact: form.communityImpact, recommendations: form.recommendations, satisfactionRating: form.satisfaction || null }, transactions });
      setReportId(result.report.id); setStatus(result.report.status); setTransactions(result.transactions); setNotice('Draft saved to the isolated local database.'); return result.report;
    } catch (error) { setNotice(error.message); return null; }
    finally { setBusy(false); }
  };

  const addTransaction = () => {
    const amount = Number(transaction.amount);
    if (!transaction.description.trim() || !transaction.category || amount <= 0) { setNotice('Complete the transaction description, category, and a positive amount.'); return; }
    const existing = transactions.find((item) => item.id === editingTransaction);
    const item = { ...transaction, amount, id: editingTransaction || crypto.randomUUID(), persisted: Boolean(existing?.persisted) };
    setTransactions((current) => editingTransaction ? current.map((entry) => entry.id === editingTransaction ? item : entry) : [...current, item]); setTransaction(EMPTY_TRANSACTION); setEditingTransaction(null); setNotice('Transaction updated locally. Save the draft to persist it.');
  };

  const chooseFiles = (event) => {
    const selected = Array.from(event.target.files || []); const staged = [];
    try { selected.forEach((file) => { validateReportFile(file); staged.push({ id: crypto.randomUUID(), file, name: file.name, type: file.type, size: file.size, category: fileCategory, localUrl: URL.createObjectURL(file) }); }); setFiles((current) => [...current, ...staged]); setNotice(`${staged.length} file${staged.length === 1 ? '' : 's'} staged for private upload.`); }
    catch (error) { staged.forEach((item) => URL.revokeObjectURL(item.localUrl)); setNotice(error.message); }
    event.target.value = '';
  };

  const uploadFiles = async () => {
    const saved = reportId ? { id: reportId } : await persistDraft(); if (!saved) return;
    const staged = files.filter((item) => !item.persisted); if (!staged.length) return;
    setBusy(true); setNotice('Uploading privately to local Storage…');
    try { const uploaded = []; for (const item of staged) { const attachment = await postEventReportRepository.uploadAttachment({ reportId: saved.id, eventId: form.eventId, category: item.category, file: item.file }); uploaded.push({ ...attachment, persisted: true, name: attachment.file_name, type: attachment.file_type, size: attachment.file_size }); URL.revokeObjectURL(item.localUrl); } setFiles((current) => [...current.filter((item) => item.persisted), ...uploaded]); setNotice(`${uploaded.length} attachment${uploaded.length === 1 ? '' : 's'} uploaded.`); }
    catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  };

  const preview = async (item) => { if (item.localUrl) return window.open(item.localUrl, '_blank', 'noopener,noreferrer'); try { window.open(await postEventReportRepository.createSignedUrl(item), '_blank', 'noopener,noreferrer'); } catch (error) { setNotice(error.message); } };
  const removeFile = async (item) => { try { if (item.persisted) await postEventReportRepository.deleteAttachment(item); else URL.revokeObjectURL(item.localUrl); setFiles((current) => current.filter((entry) => entry.id !== item.id)); setNotice('Attachment removed.'); } catch (error) { setNotice(error.message); } };

  const submit = async () => {
    for (let index = 0; index < 4; index += 1) { if (!validateStep(index)) { setStep(index); setNotice(`Complete the required fields in ${STEPS[index]}.`); return; } }
    const saved = await persistDraft(); if (!saved) return; setBusy(true);
    try { const updated = status === 'needs_revision' ? await postEventReportRepository.resubmit(saved.id) : await postEventReportRepository.submit(saved.id); setStatus(updated.status); setNotice(status === 'needs_revision' ? 'Report resubmitted.' : 'Report submitted for review.'); }
    catch (error) { setNotice(error.message); } finally { setBusy(false); }
  };

  const review = async (action) => {
    const note = window.prompt(action === 'revision' ? 'Reason for revision:' : 'Optional approval notes:'); if (action === 'revision' && !note?.trim()) return;
    setBusy(true); try { const updated = action === 'revision' ? await postEventReportRepository.requestRevision(reportId, note.trim()) : await postEventReportRepository.approve(reportId, note?.trim() || null); setStatus(updated.status); setNotice(action === 'revision' ? 'Revision requested.' : 'Report approved.'); } catch (error) { setNotice(error.message); } finally { setBusy(false); }
  };

  return <div className="post-report-page">
    <header className="report-hero"><div><p className="report-eyebrow"><FileText size={15}/> Event reporting</p><h1>Post Event Report</h1><p>Capture attendance, finances, impact, and private supporting documentation.</p></div><span className={`report-status status-${status.replace('_','-')}`}>{LABELS[status]}</span></header>
    <nav className="report-steps" aria-label="Report progress">{STEPS.map((label,index)=><button key={label} type="button" className={index===step?'active':index<step?'complete':''} onClick={()=>index<=step&&setStep(index)}><span>{index<step?<Check size={15}/>:index+1}</span><strong>{label}</strong></button>)}</nav>
    {notice&&<div className="report-notice" role="status">{busy&&<Loader2 className="spin" size={16}/>} {notice}</div>}
    <main className="report-panel card"><div className="report-panel-heading"><div><span>Step {step+1} of 5</span><h2>{STEPS[step]}</h2></div><button className="btn-secondary" type="button" disabled={busy||!editable} onClick={persistDraft}><Save size={17}/> Save draft</button></div>
      {step===0&&<General form={form} update={update} errors={errors} events={eventsList} loadEvent={loadEvent} locked={busy||Boolean(reportId)} editable={editable}/>}
      {step===1&&<Attendance form={form} update={update} errors={errors} editable={editable}/>}
      {step===2&&<Finance form={form} update={update} errors={errors} editable={editable} transaction={transaction} setTransaction={setTransaction} addTransaction={addTransaction} transactions={transactions} setTransactions={setTransactions} edit={(item)=>{setTransaction({description:item.description,category:item.category,amount:String(item.amount)});setEditingTransaction(item.id);}} expenses={expenses} balance={balance}/>}
      {step===3&&<Impact form={form} update={update} errors={errors} editable={editable} files={files} category={fileCategory} setCategory={setFileCategory} fileInput={fileInput} chooseFiles={chooseFiles} uploadFiles={uploadFiles} preview={preview} removeFile={removeFile} busy={busy}/>}
      {step===4&&<ReviewPage form={form} expenses={expenses} balance={balance} transactions={transactions} files={files} setStep={setStep} status={status} isAdmin={isAdmin} review={review}/>}
      <footer className="report-actions"><button type="button" className="btn-secondary" disabled={step===0||busy} onClick={()=>setStep((current)=>current-1)}><ChevronLeft size={17}/> Back</button><span>Required fields are marked *</span>{step<4?<button type="button" className="btn-primary" disabled={busy} onClick={goNext}>Continue <ChevronRight size={17}/></button>:editable&&<button type="button" className="btn-primary" disabled={busy} onClick={submit}><Check size={17}/> {status==='needs_revision'?'Resubmit report':'Submit report'}</button>}</footer>
    </main>
  </div>;
}

const Field=({label,required,error,wide,children})=><label className={`report-field ${wide?'wide':''}`}><span>{label}{required&&<b> *</b>}</span>{children}{error&&<small role="alert">{error}</small>}</label>;
const General=({form,update,errors,events,loadEvent,locked,editable})=><div className="report-grid"><Field label="Existing event" required error={errors.eventId}><select disabled={locked} value={form.eventId} onChange={(e)=>loadEvent(e.target.value)}><option value="">Select an event</option>{events.map((event)=><option key={event.id} value={event.id}>{event.title} — {event.chapter||'No chapter'}</option>)}</select></Field><Field label="Event name" required error={errors.eventName}><input disabled value={form.eventName}/></Field><Field label="Chapter" required error={errors.chapter}><input disabled value={form.chapter}/></Field><Field label="Event date" required error={errors.eventDate}><input disabled type="date" value={form.eventDate}/></Field><Field label="Venue" required error={errors.venue}><input disabled={!editable} value={form.venue} onChange={(e)=>update('venue',e.target.value)}/></Field><Field label="Coordinator"><input disabled={!editable} value={form.coordinator} onChange={(e)=>update('coordinator',e.target.value)}/></Field><Field label="Event summary" wide><textarea disabled={!editable} rows="4" value={form.summary} onChange={(e)=>update('summary',e.target.value)}/></Field></div>;
const Attendance=({form,update,errors,editable})=><div className="report-grid">{[['registered','Registered participants'],['attended','Actual attendance'],['children','Children reached'],['volunteers','Volunteers involved']].map(([key,label])=><Field key={key} label={label} required error={errors[key]}><input disabled={!editable} type="number" min="0" value={form[key]} onChange={(e)=>update(key,e.target.value)}/></Field>)}<Field label="Attendance notes" wide><textarea disabled={!editable} rows="5" value={form.attendanceNotes} onChange={(e)=>update('attendanceNotes',e.target.value)}/></Field></div>;
const Finance=({form,update,errors,editable,transaction,setTransaction,addTransaction,transactions,setTransactions,edit,expenses,balance})=><div className="finance-layout"><div className="report-grid"><Field label="Approved budget" required error={errors.budget}><input disabled={!editable} type="number" min="0" step="0.01" value={form.budget} onChange={(e)=>update('budget',e.target.value)}/></Field></div><section className="transaction-card"><div className="section-title"><div><h3>Expense transactions</h3><p>Add each expense manually.</p></div></div><div className="transaction-form"><input disabled={!editable} placeholder="Description" value={transaction.description} onChange={(e)=>setTransaction({...transaction,description:e.target.value})}/><select disabled={!editable} value={transaction.category} onChange={(e)=>setTransaction({...transaction,category:e.target.value})}><option value="">Category</option>{['venue','food','transport','materials','other'].map((item)=><option key={item}>{item}</option>)}</select><input disabled={!editable} type="number" min="0.01" step="0.01" placeholder="Amount" value={transaction.amount} onChange={(e)=>setTransaction({...transaction,amount:e.target.value})}/><button disabled={!editable} type="button" className="btn-primary" onClick={addTransaction}><Plus size={17}/> Add/update</button></div>{transactions.length===0?<div className="empty-state">No expenses added yet.</div>:<div className="transaction-list">{transactions.map((item)=><div key={item.id}><span><strong>{item.description}</strong><small>{item.category}</small></span><b>{money(item.amount)}</b><button disabled={!editable} type="button" onClick={()=>edit(item)}><Pencil size={16}/></button><button disabled={!editable} type="button" onClick={()=>setTransactions((current)=>current.filter((entry)=>entry.id!==item.id))}><Trash2 size={16}/></button></div>)}</div>}</section><div className="finance-summary"><span>Budget<strong>{money(form.budget)}</strong></span><span>Expenses<strong>{money(expenses)}</strong></span><span className={balance<0?'negative':''}>Remaining<strong>{money(balance)}</strong></span></div></div>;
const Impact=({form,update,errors,editable,files,category,setCategory,fileInput,chooseFiles,uploadFiles,preview,removeFile,busy})=><div className="impact-layout"><div className="report-grid">{[['keyLearnings','Key learnings'],['challenges','Challenges'],['communityImpact','Community impact'],['recommendations','Recommendations']].map(([key,label])=><Field key={key} label={label} required={key==='keyLearnings'||key==='communityImpact'} error={errors[key]}><textarea disabled={!editable} rows="4" value={form[key]} onChange={(e)=>update(key,e.target.value)}/></Field>)}<Field label="Participant satisfaction"><select disabled={!editable} value={form.satisfaction} onChange={(e)=>update('satisfaction',e.target.value)}><option value="">Not collected</option>{['excellent','good','fair','poor'].map((item)=><option key={item}>{item}</option>)}</select></Field></div><section className="attachment-section"><div className="section-title"><div><h3>Private attachments</h3><p>Upload intents authorize each path before permanent metadata is stored.</p></div><div className="attachment-controls"><select disabled={!editable} value={category} onChange={(e)=>setCategory(e.target.value)}><option value="event_photo">Event photo</option><option value="event_documentation">Documentation</option><option value="attendance">Attendance</option><option value="finance_support">Finance receipt</option><option value="impact_report">Impact report</option></select><button disabled={!editable} type="button" className="btn-secondary" onClick={()=>fileInput.current?.click()}><UploadCloud size={17}/> Choose</button><input ref={fileInput} hidden multiple type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={chooseFiles}/><button disabled={!editable||busy||!files.some((item)=>!item.persisted)} type="button" className="btn-primary" onClick={uploadFiles}>Upload staged</button></div></div>{files.length===0?<div className="empty-state"><Image size={26}/> No attachments yet.</div>:<div className="file-grid">{files.map((item)=><article key={item.id}>{item.localUrl&&item.type.startsWith('image/')?<img src={item.localUrl} alt=""/>:<FileText size={30}/>}<div><strong>{item.name}</strong><small>{item.category} · {(item.size/1024).toFixed(1)} KB</small></div><button type="button" onClick={()=>preview(item)}>Preview</button><button disabled={!editable} type="button" onClick={()=>removeFile(item)}><Trash2 size={16}/></button></article>)}</div>}</section></div>;
const Review=({title,items,onEdit})=><section className="review-card"><div className="section-title"><h3>{title}</h3><button type="button" onClick={onEdit}><Pencil size={15}/> View</button></div><dl>{items.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'Not provided'}</dd></div>)}</dl></section>;
const ReviewPage=({form,expenses,balance,transactions,files,setStep,status,isAdmin,review})=><div className="review-layout"><div className="review-banner"><Check size={22}/><div><strong>Review before submission</strong><p>Submission becomes read-only until an authorized reviewer requests revision.</p></div></div><Review title="General information" items={[["Event",form.eventName],["Chapter",form.chapter],["Date",form.eventDate],["Venue",form.venue]]} onEdit={()=>setStep(0)}/><Review title="Attendance" items={[["Registered",form.registered],["Attended",form.attended],["Children",form.children],["Volunteers",form.volunteers]]} onEdit={()=>setStep(1)}/><Review title="Finance" items={[["Budget",money(form.budget)],["Expenses",money(expenses)],["Remaining",money(balance)],["Transactions",transactions.length]]} onEdit={()=>setStep(2)}/><Review title="Impact and documentation" items={[["Community impact",form.communityImpact],["Key learnings",form.keyLearnings],["Attachments",files.length]]} onEdit={()=>setStep(3)}/><section className="approval-card"><div><strong>Admin review status: {LABELS[status]}</strong><p>Submitters cannot approve their own reports.</p></div>{isAdmin&&status==='submitted'&&<div className="review-actions"><button className="btn-secondary" type="button" onClick={()=>review('revision')}>Request revision</button><button className="btn-primary" type="button" onClick={()=>review('approve')}>Approve</button></div>}</section></div>;
