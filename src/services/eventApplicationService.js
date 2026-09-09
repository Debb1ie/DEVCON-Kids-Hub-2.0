import { supabase } from '../lib/supabase';
import { toServiceError } from './serviceErrors';

const rpc = async (name, parameters = {}) => {
  const { data, error } = await supabase.rpc(name, parameters);
  if (error) throw toServiceError(error);
  return data || [];
};

export const listOpenVolunteerEvents = () => rpc('list_open_events_for_volunteers');
export const listMyEventApplications = () => rpc('list_my_event_applications');
export const applyToEvent = (eventId) => rpc('apply_to_event', { target_event_id: eventId });
export const withdrawEventApplication = (applicationId) => rpc('withdraw_event_application', { target_application_id: applicationId });
export const listManagedEventApplications = (eventId) => rpc('list_event_applications_for_management', { target_event_id: eventId });
export const decideEventApplication = (applicationId, decision) => rpc('decide_event_application', {
  target_application_id: applicationId,
  new_status: decision,
});
