const EVENT_ERROR_MESSAGES = [
  ['Event title is required', 'Enter an event name.'],
  ['Event chapter must reference an active directory location', 'Select a valid active chapter or Volunteer Community.'],
  ['Coordinator must be an active approved Event Coordinator in the selected chapter', 'Select an active Event Coordinator assigned to this chapter.'],
  ['Not authorized to create this event', 'You are not authorized to create events for this chapter.'],
  ['Not authorized to update this event', 'You are not authorized to update this event or its coordinator assignment.'],
  ['Event not found', 'The event no longer exists or is unavailable.'],
];

export const getEventErrorMessage = (error) => {
  const details = `${error?.message || ''} ${error?.details || ''}`;
  return EVENT_ERROR_MESSAGES.find(([pattern]) => details.includes(pattern))?.[1]
    || 'The event could not be saved. Check the selected chapter and coordinator, then try again.';
};

export const createEventRepository = (client) => ({
  async listEligibleCoordinators(chapterId) {
    if (!chapterId) return [];
    const { data, error } = await client.rpc('list_eligible_event_coordinators', {
      target_chapter_id: chapterId,
    });
    if (error) throw error;
    return data || [];
  },

  async saveEvent({ eventId = null, event, coordinatorUserId }) {
    const { data, error } = await client.rpc('save_event_with_coordinator', {
      target_event_id: eventId,
      target_chapter_id: event.chapter_id,
      target_coordinator_id: coordinatorUserId,
      event_title: event.title,
      event_type: event.type || null,
      event_description: event.description || null,
      event_image_url: event.image_url || null,
      event_status_value: event.status,
      event_date_value: event.event_date || null,
    });
    if (error) throw error;
    return data;
  },
});
