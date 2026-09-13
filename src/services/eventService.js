const EVENT_ERROR_MESSAGES = [
  ['Event title is required', 'Enter an event name.'],
  ['Event chapter must reference an active directory location', 'Select a valid active chapter or Volunteer Community.'],
  ['Coordinator must be an active approved Event Coordinator in the selected chapter', 'Select an active Event Coordinator assigned to this chapter.'],
  ['Not authorized to create this event', 'You are not authorized to create events for this chapter.'],
  ['Not authorized to update this event', 'You are not authorized to update this event or its coordinator assignment.'],
  ['Event not found', 'The event no longer exists or is unavailable.'],
];

export const MAX_EVENT_IMAGE_SIZE = 10 * 1024 * 1024;
const EVENT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const validateEventImage = (file) => {
  if (!file || !EVENT_IMAGE_TYPES.has(file.type)) {
    throw new Error('Choose a PNG, JPG, JPEG, or WebP image.');
  }
  if (file.size < 1 || file.size > MAX_EVENT_IMAGE_SIZE) {
    throw new Error('Event images must be 10 MB or smaller.');
  }
  return true;
};

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

  async uploadEventImage(eventId, file) {
    validateEventImage(file);
    const { data: intent, error: intentError } = await client.rpc('prepare_event_image_upload', {
      target_event_id: eventId,
      original_file_name: file.name,
      expected_content_type: file.type,
      expected_size: file.size,
    });
    if (intentError || !intent?.length) throw new Error('Unable to authorize the event image upload.');
    const uploadIntent = intent[0];
    const { error: uploadError } = await client.storage
      .from(uploadIntent.storage_bucket)
      .upload(uploadIntent.storage_path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw new Error('Unable to upload the event image.');
    try {
      const { data, error } = await client.rpc('finalize_event_image_upload', {
        target_upload_intent_id: uploadIntent.upload_intent_id,
      });
      if (error || !data?.length) throw error || new Error('Missing finalized event image.');
      const finalized = data[0];
      if (finalized.previous_storage_path && finalized.previous_storage_path !== finalized.image_storage_path) {
        await client.storage.from(uploadIntent.storage_bucket).remove([finalized.previous_storage_path]);
      }
      const signed = await client.storage.from(uploadIntent.storage_bucket).createSignedUrl(finalized.image_storage_path, 3600);
      return { ...finalized, image_url: signed.data?.signedUrl || null };
    } catch {
      await client.storage.from(uploadIntent.storage_bucket).remove([uploadIntent.storage_path]);
      throw new Error('Unable to attach the uploaded image to this event.');
    }
  },

  async resolveEventImage(event) {
    if (!event.image_storage_path) return event;
    const { data, error } = await client.storage.from('event-images').createSignedUrl(event.image_storage_path, 3600);
    return error ? event : { ...event, image_fallback_url: event.image_url, image_url: data.signedUrl };
  },
});
