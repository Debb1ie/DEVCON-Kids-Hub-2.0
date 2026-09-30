import { NavLink } from 'react-router-dom';
import { useApp } from '../context/AppState';
import { canPerform } from '../auth/permissions';
import '../pages/PostEventReportReviewQueue.css';

export default function PostEventReportNav() {
  const { roleKey } = useApp();
  const canReview = canPerform(roleKey, 'report.review');
  const canAuthor = canPerform(roleKey, 'report.create');

  return (
    <nav className="report-section-nav" aria-label="Post Event Report views">
      {canAuthor && <NavLink to="/dashboard/post-event-report" end>Report Form</NavLink>}
      {canReview && <NavLink to="/dashboard/post-event-report/review">Review Queue</NavLink>}
    </nav>
  );
}
