import { supabase } from '../lib/supabase.js';

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
  const listEligibleEvents = async () => {
    const rows = unwrap(await client
      .from('events')
      .select('id,title,chapter_id,chapter,event_date,venue,status,coordinator,event_assignments(user_id),post_event_reports(id,status)')
      .order('event_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }), 'Load reportable events');
    return rows || [];
  };

  const loadByEvent = async (eventId) => {
    const report = unwrap(await client.from('post_event_reports').select('*').eq('event_id', eventId).maybeSingle(), 'Load report');
    if (!report) return null;

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

  const transition = async (reportId, status, fields = {}) => {
    return unwrap(await client.from('post_event_reports').update({ status, ...fields }).eq('id', reportId).select().single(), `Set report status to ${status}`);
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
    loadByEvent,
    saveDraft,
    submit: (id) => transition(id, 'submitted'),
    requestRevision: (id, reason) => transition(id, 'needs_revision', { revision_reason: reason }),
    resubmit: (id) => transition(id, 'submitted'),
    approve: (id, notes = null) => transition(id, 'approved', { review_notes: notes }),
    uploadAttachment,
    createSignedUrl,
    deleteAttachment,
  };
};

export const postEventReportRepository = createPostEventReportRepository({
  client: supabase,
});
