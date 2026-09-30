const TRANSITION_SOURCES = {
  submitted: new Set(['draft', 'needs_revision']),
  needs_revision: new Set(['submitted']),
  approved: new Set(['submitted']),
};

const transitionError = (message, code, cause = null) => {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
};

export const createReportTransition = (client) => async (reportId, status, fields = {}, expectedStatus = null) => {
  if (!reportId) throw transitionError('A report ID is required for this status change.', 'REPORT_ID_REQUIRED');

  const currentResult = await client
    .from('post_event_reports')
    .select('id,status,submitted_by')
    .eq('id', reportId);
  if (currentResult.error) {
    throw transitionError('The report could not be checked. It may be outside your authorized scope.', 'REPORT_LOOKUP_FAILED', currentResult.error);
  }
  const currentRows = currentResult.data || [];
  if (currentRows.length === 0) {
    throw transitionError('The report was not found or is outside your authorized scope.', 'REPORT_NOT_ACCESSIBLE');
  }
  if (currentRows.length > 1) {
    throw transitionError('Report identity is not unique. No status change was made.', 'REPORT_IDENTITY_CONFLICT');
  }

  const currentStatus = currentRows[0].status;
  const allowedSources = TRANSITION_SOURCES[status];
  if ((expectedStatus && currentStatus !== expectedStatus) || (allowedSources && !allowedSources.has(currentStatus))) {
    throw transitionError(`This report cannot change from ${currentStatus} to ${status}. Refresh and try again.`, 'REPORT_STATUS_CONFLICT');
  }

  let mutation = client
    .from('post_event_reports')
    .update({ status, ...fields })
    .eq('id', reportId);
  if (expectedStatus) mutation = mutation.eq('status', expectedStatus);
  const result = await mutation.select('*');
  if (result.error) {
    throw transitionError(`Set report status to ${status}: the status change was rejected.`, 'REPORT_TRANSITION_REJECTED', result.error);
  }

  const rows = result.data || [];
  if (rows.length === 0) {
    if (status === 'approved' && currentRows[0].submitted_by && client.auth?.getUser) {
      const authResult = await client.auth.getUser();
      if (!authResult.error && authResult.data?.user?.id === currentRows[0].submitted_by) {
        throw transitionError(
          'You cannot approve a report you submitted. Another authorized reviewer must review this report.',
          'REPORT_SELF_APPROVAL_FORBIDDEN',
        );
      }
    }
    throw transitionError('The report was not updated because its status changed or you no longer have permission. Refresh and try again.', 'REPORT_TRANSITION_NOT_APPLIED');
  }
  if (rows.length > 1) {
    throw transitionError('More than one report was updated. The report invariant must be reviewed.', 'REPORT_TRANSITION_CARDINALITY');
  }
  return rows[0];
};
