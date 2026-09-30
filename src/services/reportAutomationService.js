import { supabase } from '../lib/supabase.js';
import { createReportAutomationService } from './reportAutomationDispatch.js';

export { createReportAutomationService, isRecoverablePendingExport } from './reportAutomationDispatch.js';

export const reportAutomationService = createReportAutomationService(supabase);
