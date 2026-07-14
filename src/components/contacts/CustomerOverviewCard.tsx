import type { Contact } from '../../lib/contacts';

type CustomerOverviewCardProps = {
  contact: Contact;
  editing: boolean;
  lastActivityLabel: string;
  lifecycleLoading: boolean;
  onArchive: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onRestore: () => void;
};

function getContactName(contact: Contact) {
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unnamed contact';
}

function getOwnerName(contact: Contact) {
  if (!contact.owner) {
    return 'Not assigned';
  }

  return [contact.owner.firstName, contact.owner.lastName].filter(Boolean).join(' ') || contact.owner.email;
}

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

function StatusBadge({ status }: { status: Contact['status'] }) {
  const className =
    status === 'CUSTOMER'
      ? 'bg-green-100 text-green-800'
      : status === 'ARCHIVED'
        ? 'bg-gray-200 text-gray-700'
        : 'bg-blue-100 text-blue-800';

  return <span className={`rounded px-2.5 py-1 text-xs font-semibold ${className}`}>{status}</span>;
}

export function CustomerOverviewCard({
  contact,
  editing,
  lastActivityLabel,
  lifecycleLoading,
  onArchive,
  onDelete,
  onEdit,
  onRestore,
}: CustomerOverviewCardProps) {
  return (
    <section className="rounded border border-gray-200 bg-white p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="break-words text-2xl font-semibold text-gray-900">{getContactName(contact)}</h1>
            <StatusBadge status={contact.status} />
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
          {contact.status === 'ARCHIVED' ? (
            <button
              type="button"
              onClick={onRestore}
              disabled={lifecycleLoading}
              className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
            >
              {lifecycleLoading ? 'Working...' : 'Restore as prospect'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onArchive}
              disabled={lifecycleLoading}
              className="rounded border border-yellow-300 bg-yellow-50 px-4 py-2 text-sm font-medium text-yellow-900 hover:bg-yellow-100 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-yellow-400"
            >
              {lifecycleLoading ? 'Working...' : 'Archive'}
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={lifecycleLoading}
            className="rounded border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-red-400"
          >
            {lifecycleLoading ? 'Working...' : 'Delete'}
          </button>
        </div>
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <OverviewItem label="Email" value={contact.email ?? 'No email'} />
        <OverviewItem label="Phone" value={contact.phone ?? 'No phone'} />
        <OverviewItem label="Owner" value={getOwnerName(contact)} />
        <OverviewItem label="Lead source" value={contact.leadSource?.name ?? 'No lead source'} />
        <OverviewItem label="Created" value={formatDate(contact.createdAt)} />
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Tags</dt>
          <dd className="mt-1">
            {contact.tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {contact.tags.map((contactTag) => (
                  <span
                    key={contactTag.id}
                    className="inline-flex items-center gap-1 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700"
                  >
                    {contactTag.tag.color ? (
                      <span className="h-2.5 w-2.5 rounded-full border border-gray-200" style={{ backgroundColor: contactTag.tag.color }} />
                    ) : null}
                    {contactTag.tag.name}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-sm text-gray-900">No tags</span>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}

type OverviewItemProps = {
  label: string;
  value: string;
};

function OverviewItem({ label, value }: OverviewItemProps) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 break-words text-sm text-gray-900">{value}</dd>
    </div>
  );
}
