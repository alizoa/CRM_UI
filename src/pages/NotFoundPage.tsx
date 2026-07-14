import { Link } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';

export function NotFoundPage() {
  return (
    <AppShell>
      <div className="rounded border border-gray-200 bg-white p-6">
        <h1 className="text-xl font-semibold text-gray-900">404 — Page not found</h1>
        <Link className="mt-4 inline-block text-sm font-medium text-gray-700 underline" to="/dashboard">
          Back to dashboard
        </Link>
      </div>
    </AppShell>
  );
}
