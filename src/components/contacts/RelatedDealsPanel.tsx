import { Link } from 'react-router-dom';
import type { Deal } from '../../lib/deals';

type RelatedDealsPanelProps = {
  deals: Deal[];
  errorMessage: string | null;
  loading: boolean;
  total: number;
  onRetry: () => void;
};

function formatValue(deal: Deal) {
  if (deal.value === null || deal.value === undefined || deal.value === '') {
    return '-';
  }

  return `${deal.value} ${deal.currency}`;
}

function StatusBadge({ status }: { status: Deal['status'] }) {
  const className =
    status === 'WON' ? 'bg-green-100 text-green-800' : status === 'LOST' ? 'bg-gray-200 text-gray-700' : 'bg-blue-100 text-blue-800';

  return <span className={`rounded px-2 py-1 text-xs font-medium ${className}`}>{status}</span>;
}

export function RelatedDealsPanel({ deals, errorMessage, loading, total, onRetry }: RelatedDealsPanelProps) {
  return (
    <section className="rounded border border-gray-200 bg-white p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Related deals</h2>
          <p className="mt-1 text-sm text-gray-600">{total === 1 ? '1 related deal' : `${total} related deals`}</p>
        </div>
        <Link
          className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          to="/deals"
        >
          View deals
        </Link>
      </div>

      {loading ? <p className="mt-5 rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">Loading related deals...</p> : null}

      {!loading && errorMessage ? (
        <div className="mt-5 rounded border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{errorMessage}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            Retry
          </button>
        </div>
      ) : null}

      {!loading && !errorMessage && deals.length === 0 ? (
        <p className="mt-5 rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">No related deals yet.</p>
      ) : null}

      {!loading && !errorMessage && deals.length > 0 ? (
        <div className="mt-5 divide-y divide-gray-200 rounded border border-gray-200">
          {deals.map((deal) => (
            <article key={deal.id} className="p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <Link className="break-words text-sm font-semibold text-gray-900 underline decoration-gray-300 underline-offset-2 hover:text-gray-700" to={`/deals/${deal.id}`}>
                    {deal.title}
                  </Link>
                  <p className="mt-1 text-sm text-gray-600">{deal.stage?.name ?? 'No stage'}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <StatusBadge status={deal.status} />
                  <span className="text-sm text-gray-700">{formatValue(deal)}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
