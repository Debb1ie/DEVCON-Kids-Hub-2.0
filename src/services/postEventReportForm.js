export const buildEventReportForm = (event, data = null) => {
  const report = data?.report;
  return {
    eventId: String(event.id), eventName: event.title || '', chapter: event.chapter || '',
    eventDate: event.event_date || '', venue: report?.venue || event.venue || '',
    coordinator: report?.coordinator_name || event.coordinator || 'No coordinator assigned',
    summary: report?.event_summary || '', registered: data?.attendance?.registered_count ?? '',
    attended: data?.attendance?.attended_count ?? '', children: data?.attendance?.children_reached ?? '',
    volunteers: data?.attendance?.volunteers_involved ?? '', attendanceNotes: data?.attendance?.notes || '',
    budget: data?.finance?.approved_budget ?? '', keyLearnings: data?.impact?.key_learnings || '',
    challenges: data?.impact?.challenges || '', communityImpact: data?.impact?.community_impact || '',
    recommendations: data?.impact?.recommendations || '', satisfaction: data?.impact?.satisfaction_rating || '',
  };
};
