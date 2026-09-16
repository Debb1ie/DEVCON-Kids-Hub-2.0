import { CheckCircle2, CircleAlert, Clock3, Info } from 'lucide-react';

const ICONS = { completed: CheckCircle2, approved: CheckCircle2, ongoing: Clock3, scheduled: Clock3, draft: Info, warning: CircleAlert };

export default function StatusBadge({ status = 'Draft' }) {
  const key = String(status).toLowerCase().replace(/\s+/g, '-');
  const Icon = ICONS[key] || Info;
  return <span className={`status-badge status-${key}`}><Icon size={14} aria-hidden="true" />{status}</span>;
}
