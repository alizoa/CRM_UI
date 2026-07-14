import type { Deal } from '../../lib/deals';

type DealOverviewCardProps = {
  deal: Deal;
  editing: boolean;
  lastActivityLabel: string;
  lifecycleErrorMessage: string | null;
  lifecycleLoading: boolean;
  onEdit: () => void;
  onMarkLost: () => void;
  onMarkWon: () => void;
  onReopen: () => void;
};

function formatDate(value: string | null | undefined) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString();
}

function formatDealValue(deal: Deal) {
  if (deal.value === null || deal.value === undefined || deal.value === '') {
    return 'No value';
  }

  return `${deal.value} ${deal.currency}`;
}

function getOwnerName(deal: Deal) {
  if (!deal.owner) {
    return 'Not assigned';
  }

  return [deal.owner.firstName, deal.owner.lastName].filter(Boolean).join(' ') || deal.owner.email;
}

function StatusBadge({ status }: { status: Deal['status'] }) {
  const className =
    status === 'WON' ? 'bg-green-100 text-green-800' : status === 'LOST' ? 'bg-gray-200 text-gray-700' : 'bg-blue-100 text-blue-800';

  return <span className={`rounded px-2.5 py-1 text-xs font-semibold ${className}`}>{status}</span>;
}

export function DealOverviewCard({
  deal,
  editing,
  lastActivityLabel,
  lifecycleErrorMessage,
  lifecycleLoading,
  onEdit,
  onMarkLost,
  onMarkWon,
  onReopen,
}: DealOverviewCardProps) {
  return (
    <section className="rounded border border-gray-200 bg-white p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="break-words text-2xl font-semibold text-gray-900">{deal.title}</h1>
            <StatusBadge status={deal.status} />
          </div>
          <p className="mt-2 text-sm text-gray-600">{lastActivityLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!editing ? (
            <button
              type="button"
              onClick={onEdit}
              className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            >
              Edit
            </button>
          ) : null}
          {deal.status === 'OPEN' ? (
            <>
              <button
                type="button"
                onClick={onMarkWon}
                disabled={lifecycleLoading}
                className="rounded border border-green-300 bg-green-50 px-4 py-2 text-sm font-medium text-green-800 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-green-400"
              >
                {lifecycleLoading ? 'Working...' : 'Mark Won'}
              </button>
              <button
                type="button"
                onClick={onMarkLost}
                disabled={lifecycleLoading}
                className="rounded border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-red-400"
              >
                {lifecycleLoading ? 'Working...' : 'Mark Lost'}
              </button>
            </>
          ) : null}
          {deal.status === 'WON' || deal.status === 'LOST' ? (
            <button
              type="button"
              onClick={onReopen}
              disabled={lifecycleLoading}
              className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
            >
              {lifecycleLoading ? 'Working...' : 'Reopen'}
            </button>
          ) : null}
        </div>
      </div>
      {lifecycleErrorMessage ? <p className="mt-3 text-sm text-red-700">{lifecycleErrorMessage}</p> : null}

      <dl className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <OverviewItem emphasized label="Value" value={formatDealValue(deal)} />
        <OverviewItem label="Pipeline" value={deal.pipeline?.name ?? deal.pipelineId} />
        <OverviewItem label="Stage" value={deal.stage?.name ?? deal.stageId} />
        <OverviewItem label="Owner" value={getOwnerName(deal)} />
        <OverviewItem label="Expected close" value={formatDate(deal.expectedCloseAt)} />
        <OverviewItem label="Closed" value={formatDate(deal.closedAt)} />
        <OverviewItem label="Lead source" value={deal.leadSource?.name ?? 'No lead source'} />
        <OverviewItem label="Created" value={formatDate(deal.createdAt)} />
        <OverviewItem label="Updated" value={formatDate(deal.updatedAt)} />
      </dl>
    </section>
  );
}

type OverviewItemProps = {
  emphasized?: boolean;
  label: string;
  value: string;
};

function OverviewItem({ emphasized = false, label, value }: OverviewItemProps) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className={`mt-1 break-words text-gray-900 ${emphasized ? 'text-base font-semibold' : 'text-sm'}`}>{value}</dd>
    </div>
  );
}
