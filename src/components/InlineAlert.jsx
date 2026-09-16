import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

export default function InlineAlert({ tone = 'info', children, id, role }) {
  const Icon = tone === 'error' ? AlertCircle : tone === 'success' ? CheckCircle2 : Info;
  return <div id={id} className={`inline-alert alert-${tone}`} role={role || (tone === 'error' ? 'alert' : 'status')}><Icon size={18} aria-hidden="true" /><div>{children}</div></div>;
}
