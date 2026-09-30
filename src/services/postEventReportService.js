import { supabase } from '../lib/supabase.js';
import { createReportTransition } from './postEventReportTransition.js';
import { normalizePostEventReports } from './postEventReportQueue.js';

export const REPORT_BUCKET = 'event-report-attachments';
export const MAX_REPORT_FILE_SIZE = 25 * 1024 * 1024;
export const REPORT_FILE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export const validateReportFile = (file) => {
  if (!REPORT_FILE_TYPES.has(file?.type)) {
    throw new Error('Only JPEG, PNG, WebP, and PDF files are supported.');
  }
  if (!file.size || file.size > MAX_REPORT_FILE_SIZE) {
    throw new Error('Files must be larger than 0 bytes and no more than 25 MB.');
  }
};

const unwrap = (result, context) => {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
};

export const createPostEventReportRepository = ({
  client,
}) => {
  const transition = createReportTransition(client);
  const listEligibleEvents = async () => {
    const authResult = await client.auth.getUser();
    if (authResult.error || !authResult.data?.user?.id) throw new Error('Load reportable events: authentication is required.');
    const userId = authResult.data.user.id;
    const rows = unwrap(await client
      .from('events')
      .select('id,title,chapter_id,chapter,event_date,venue,status,coordinator,event_assignments!inner(user_id,assignment_role),post_event_reports(id,status)')
      .eq('event_assignments.user_id', userId)
      .eq('event_assignments.assignment_role', 'event_coordinator')
      .order('event_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }), 'Load reportable events');
    return (rows || []).map((event) => ({
      ...event,
      post_event_reports: normalizePostEventReports(event.post_event_reports),
    }));
  };

  // Report state per event for the Events page. RLS decides visibility:
  // reviewers only receive submitted or later reports, authors their own.
  const listReportStatesForEvents = async (eventIds = []) => {
    const ids = [...new Set(eventIds.filter(Boolean))];
    if (!ids.length) return new Map();
    const reports = unwrap(await client
      .from('post_event_reports')
      .select('id,event_id,status,submitted_by,submitted_at,approved_at')
      .in('event_id', ids), 'Load event report states') || [];
    const reportIds = reports.map((report) => report.id);
    const exportsResult = reportIds.length
      ? await client.from('post_event_report_exports').select('report_id,status').in('report_id', reportIds)
      : { data: [] };
    const exportByReport = new Map((exportsResult.error ? [] : exportsResult.data || []).map((entry) => [entry.report_id, entry.status]));
    return new Map(reports.map((report) => [report.event_id, { ...report, exportStatus: exportByReport.get(report.id) || null }]));
  };

  const listReviewQueue = async () => {
    const reports = unwrap(await client
      .from('post_event_reports')
      .select('id,event_id,submitted_by,status,submitted_at,updated_at,coordinator_name,events(id,title,chapter,chapter_id,event_date)')
      .in('status', ['submitted', 'needs_revision', 'approved'])
      .order('updated_at', { ascending: false }), 'Load report review queue') || [];
    if (!reports.length) return [];

    const submitterIds = [...new Set(reports.map((report) => report.submitted_by).filter(Boolean))];
    const reportIds = reports.map((report) => report.id);
    const [profilesResult, exportsResult] = await Promise.all([
      client.from('profiles').select('id,full_name,email').in('id', submitterIds),
      client.from('post_event_report_exports').select('report_id,status').in('report_id', reportIds),
    ]);
    const profiles = unwrap(profilesResult, 'Resolve report submitters') || [];
    const exports = exportsResult.error?.code === '42P01' || exportsResult.error?.code === 'PGRST205'
      ? []
      : unwrap(exportsResult, 'Load report export states') || [];
    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
    const exportByReport = new Map(exports.map((entry) => [entry.report_id, entry]));

    return reports.map((report) => {
      const event = Array.isArray(report.events) ? report.events[0] : report.events;
      const submitter = profileById.get(report.submitted_by);
      return {
        id: report.id,
        eventId: report.event_id,
        eventName: event?.title || 'Unnamed event',
        chapter: event?.chapter || 'Unassigned',
        chapterId: event?.chapter_id || null,
        eventDate: event?.event_date || null,
        submitterId: report.submitted_by,
        submitterName: submitter?.full_name || submitter?.email || 'Unknown submitter',
        coordinatorName: report.coordinator_name || 'Unassigned',
        submittedAt: report.submitted_at,
        updatedAt: report.updated_at,
        status: report.status,
        exportStatus: exportByReport.get(report.id)?.status || null,
      };
    });
  };

  const loadReportDetail = async (report) => {
    const [attendance, impact, finance, transactions, attachments, reviews] = await Promise.all([
      client.from('post_event_report_attendance').select('*').eq('report_id', report.id).maybeSingle(),
      client.from('post_event_report_impact').select('*').eq('report_id', report.id).maybeSingle(),
      client.from('post_event_report_finance').select('*').eq('report_id', report.id).maybeSingle(),
      client.from('post_event_report_transactions').select('*').eq('report_id', report.id).order('created_at'),
      client.from('post_event_report_attachments').select('*').eq('report_id', report.id).order('created_at'),
      client.from('post_event_report_reviews').select('*').eq('report_id', report.id).order('created_at'),
    ]);

    [attendance, impact, finance, transactions, attachments, reviews].forEach((result) => unwrap(result, 'Load report detail'));
    return {
      report,
      attendance: attendance.data,
      impact: impact.data,
      finance: finance.data,
      transactions: transactions.data || [],
      attachments: attachments.data || [],
      reviews: reviews.data || [],
    };
  };

  const loadByEvent = async (eventId) => {
    const report = unwrap(await client.from('post_event_reports').select('*').eq('event_id', eventId).maybeSingle(), 'Load report');
    return report ? loadReportDetail(report) : null;
  };

  const loadById = async (reportId) => {
    const report = unwrap(await client.from('post_event_reports').select('*').eq('id', reportId).maybeSingle(), 'Load requested report');
    if (!report) return null;
    const event = unwrap(await client
      .from('events')
      .select('id,title,chapter_id,chapter,event_date,venue,status,coordinator,event_assignments(user_id),post_event_reports(id,status)')
      .eq('id', report.event_id)
      .maybeSingle(), 'Load requested report event');
    if (!event) throw new Error('Unable to load this report.');
    const submitter = report.submitted_by
      ? unwrap(await client.from('profiles').select('id,full_name,email').eq('id', report.submitted_by).maybeSingle(), 'Resolve report submitter')
      : null;
    return {
      event: { ...event, post_event_reports: normalizePostEventReports(event.post_event_reports) },
      submitter,
      ...(await loadReportDetail(report)),
    };
  };

  const saveDraft = async ({ reportId, eventId, userId, report, attendance, impact, finance, transactions }) => {
    const reportPayload = {
      event_id: eventId,
      submitted_by: userId,
      venue: report.venue || null,
      coordinator_name: report.coordinatorName || null,
      event_summary: report.eventSummary || null,
    };
    let savedReport;
    if (reportId) {
      savedReport = unwrap(await client.from('post_event_reports').update(reportPayload).eq('id', reportId).select().single(), 'Update draft');
    } else {
      unwrap(await client.from('post_event_reports').insert(reportPayload), 'Create draft');
      savedReport = unwrap(await client.from('post_event_reports').select('*').eq('event_id', eventId).single(), 'Reload new draft');
    }

    const id = savedReport.id;
    unwrap(await client.from('post_event_report_attendance').upsert({
      report_id: id,
      registered_count: Number(attendance.registeredCount) || 0,
      attended_count: Number(attendance.attendedCount) || 0,
      children_reached: Number(attendance.childrenReached) || 0,
      volunteers_involved: Number(attendance.volunteersInvolved) || 0,
      notes: attendance.notes || null,
    }), 'Save attendance');
    unwrap(await client.from('post_event_report_finance').upsert({
      report_id: id,
      currency_code: 'PHP',
      approved_budget: Number(finance.approvedBudget) || 0,
    }), 'Save finance');

    if (impact.keyLearnings?.trim() && impact.communityImpact?.trim()) {
      unwrap(await client.from('post_event_report_impact').upsert({
        report_id: id,
        key_learnings: impact.keyLearnings.trim(),
        challenges: impact.challenges || null,
        community_impact: impact.communityImpact.trim(),
        recommendations: impact.recommendations || null,
        satisfaction_rating: impact.satisfactionRating || null,
      }), 'Save impact');
    }

    const existing = unwrap(await client.from('post_event_report_transactions').select('id').eq('report_id', id), 'Load transactions');
    const incomingIds = new Set(transactions.filter((item) => item.persisted).map((item) => item.id));
    const removedIds = existing.filter((item) => !incomingIds.has(item.id)).map((item) => item.id);
    if (removedIds.length) {
      unwrap(await client.from('post_event_report_transactions').delete().in('id', removedIds), 'Remove transactions');
    }
    const savedTransactions = [];
    for (const item of transactions) {
      const payload = {
        report_id: id,
        description: item.description.trim(),
        expense_category: item.category.toLowerCase(),
        amount: Number(item.amount),
      };
      const result = item.persisted
        ? await client.from('post_event_report_transactions').update(payload).eq('id', item.id).select().single()
        : await client.from('post_event_report_transactions').insert(payload).select().single();
      const saved = unwrap(result, 'Save transaction');
      savedTransactions.push({
        id: saved.id,
        description: saved.description,
        category: saved.expense_category,
        amount: Number(saved.amount),
        persisted: true,
      });
    }
    return { report: savedReport, transactions: savedTransactions };
  };

  const uploadAttachment = async ({ reportId, eventId, category, file, transactionId = null, caption = null }) => {
    validateReportFile(file);
    const attachmentId = crypto.randomUUID();
    const intent = unwrap(await client.from('post_event_report_upload_intents').insert({
      id: attachmentId,
      report_id: reportId,
      event_id: eventId,
      category,
      original_file_name: file.name,
      expected_content_type: file.type,
      expected_size: file.size,
    }).select().single(), 'Create upload intent');

    unwrap(await client.storage.from(REPORT_BUCKET).upload(intent.storage_path, file, {
      contentType: file.type,
      upsert: false,
    }), 'Upload attachment');

    try {
      const attachment = unwrap(await client.from('post_event_report_attachments').insert({
        id: attachmentId,
        upload_intent_id: intent.id,
        report_id: reportId,
        event_id: eventId,
        storage_bucket: REPORT_BUCKET,
        storage_path: intent.storage_path,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        category,
        caption,
      }).select().single(), 'Save attachment metadata');
      if (transactionId) {
        unwrap(await client.from('post_event_report_transaction_attachments').insert({
          transaction_id: transactionId,
          attachment_id: attachment.id,
        }), 'Link receipt to transaction');
      }
      return attachment;
    } catch (error) {
      await client.storage.from(REPORT_BUCKET).remove([intent.storage_path]);
      throw error;
    }
  };

  const createSignedUrl = async (attachment, expiresIn = 300) => {
    const data = unwrap(await client.storage.from(attachment.storage_bucket).createSignedUrl(attachment.storage_path, expiresIn), 'Create signed URL');
    return data.signedUrl;
  };

  const deleteAttachment = async (attachment) => {
    unwrap(await client.storage.from(attachment.storage_bucket).remove([attachment.storage_path]), 'Delete attachment object');
    unwrap(await client.from('post_event_report_attachments').delete().eq('id', attachment.id), 'Delete attachment metadata');
  };

  return {
    listEligibleEvents,
    listReviewQueue,
    listReportStatesForEvents,
    loadByEvent,
    loadById,
    saveDraft,
    submit: (id) => transition(id, 'submitted', {}, 'draft'),
    requestRevision: (id, reason) => transition(id, 'needs_revision', { revision_reason: reason }, 'submitted'),
    resubmit: (id) => transition(id, 'submitted', {}, 'needs_revision'),
    approve: (id, notes = null) => transition(id, 'approved', { review_notes: notes }, 'submitted'),
    uploadAttachment,
    createSignedUrl,
    deleteAttachment,
  };
};

export const postEventReportRepository = createPostEventReportRepository({
  client: supabase,
});
