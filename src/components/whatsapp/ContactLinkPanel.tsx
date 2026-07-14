import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { WhatsappConversation } from '../../lib/whatsapp';

type ContactLinkPanelProps = {
  conversation: WhatsappConversation;
  error: string | null;
  loading: boolean;
  onCreate: () => void;
  onLink: () => void;
  onUnlink: () => void;
  variant?: 'default' | 'compact' | 'sidebar';
};

function getUserDisplayName(user: { firstName: string | null; lastName: string | null; email: string } | null | undefined) {
  if (!user) {
    return null;
  }

  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
}

function getContactDisplayName(contact: {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
}) {
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.phone || contact.email || 'Unnamed contact';
}

function getContactInitials(contact: {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
}) {
  const parts = [contact.firstName, contact.lastName].filter(Boolean);
  if (parts.length > 0) {
    return parts
      .slice(0, 2)
      .map((part) => part?.trim().charAt(0).toUpperCase())
      .join('');
  }

  const fallback = contact.phone || contact.email || '?';
  return fallback.replace(/^\+/, '').trim().charAt(0).toUpperCase() || '?';
}

function ContactStatusBadge({ status }: { status: 'PROSPECT' | 'CUSTOMER' | 'ARCHIVED' }) {
  const className =
    status === 'CUSTOMER'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : status === 'ARCHIVED'
        ? 'border-gray-200 bg-gray-100 text-gray-600'
        : 'border-amber-200 bg-amber-50 text-amber-800';

  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${className}`}>
      {status === 'PROSPECT' ? 'Prospect' : status === 'CUSTOMER' ? 'Customer' : 'Archived'}
    </span>
  );
}

function ContactLinkPanelSkeleton({ variant = 'default' }: { variant?: ContactLinkPanelProps['variant'] }) {
  const sectionClass =
    variant === 'sidebar'
      ? ''
      : variant === 'compact'
        ? 'shrink-0 border-b border-gray-100 bg-white px-2.5 py-2 sm:px-4'
        : 'shrink-0 border-b border-gray-200 bg-white px-3 py-3 sm:px-5 lg:px-6';
  const cardClass =
    variant === 'sidebar'
      ? 'rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm'
      : variant === 'compact'
        ? 'mx-auto w-full max-w-5xl rounded-xl border border-gray-100 bg-white px-2.5 py-2'
        : 'mx-auto w-full max-w-5xl rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm';

  return (
    <section className={sectionClass}>
      <div className={cardClass}>
        <div className={`flex items-start justify-between ${variant === 'compact' ? 'gap-2' : 'gap-4'}`}>
          <div className={`flex min-w-0 flex-1 items-start ${variant === 'compact' ? 'gap-2' : 'gap-3'}`}>
            <div className={`${variant === 'compact' ? 'h-8 w-8' : 'h-11 w-11'} animate-pulse rounded-full bg-gray-200`} />
            <div className="min-w-0 flex-1">
              <div className="h-3 w-24 animate-pulse rounded bg-gray-100" />
              <div className={`${variant === 'compact' ? 'mt-1 h-4' : 'mt-2 h-5'} w-40 animate-pulse rounded bg-gray-200`} />
              <div className={`${variant === 'compact' ? 'mt-1' : 'mt-2'} h-3 w-28 animate-pulse rounded bg-gray-100`} />
            </div>
          </div>
          <div className={`${variant === 'compact' ? 'hidden' : 'hidden gap-2 sm:flex'}`}>
            <div className="h-9 w-28 animate-pulse rounded-lg bg-gray-200" />
            <div className="h-9 w-20 animate-pulse rounded-lg bg-gray-100" />
            <div className="h-9 w-20 animate-pulse rounded-lg bg-gray-100" />
          </div>
        </div>
      </div>
    </section>
  );
}

export function ContactLinkPanel({
  conversation,
  error,
  loading,
  onCreate,
  onLink,
  onUnlink,
  variant = 'default',
}: ContactLinkPanelProps) {
  const contact = conversation.contact;
  const ownerName = getUserDisplayName(contact?.owner);
  const [confirmingUnlink, setConfirmingUnlink] = useState(false);

  useEffect(() => {
    setConfirmingUnlink(false);
  }, [conversation.id, conversation.contactId]);

  if (loading && !contact) {
    return <ContactLinkPanelSkeleton variant={variant} />;
  }

  const sectionClass =
    variant === 'sidebar'
      ? ''
      : variant === 'compact'
        ? 'shrink-0 border-b border-gray-100 bg-white px-2.5 py-2 sm:px-4'
        : 'shrink-0 border-b border-gray-200 bg-white px-3 py-3 sm:px-5 lg:px-6';
  const cardClass =
    variant === 'sidebar'
      ? 'rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm'
      : variant === 'compact'
        ? 'mx-auto w-full max-w-5xl rounded-xl border border-gray-100 bg-white px-2.5 py-2'
        : 'mx-auto w-full max-w-5xl rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm';
  const actionClass =
    variant === 'sidebar'
      ? 'grid min-w-0 grid-cols-3 gap-1.5'
      : variant === 'compact'
        ? 'grid min-w-0 grid-cols-3 gap-1'
        : 'flex flex-wrap items-center gap-2 sm:justify-end';

  return (
    <section className={sectionClass}>
      <div className={cardClass}>
        {contact ? (
          <div className={variant === 'compact' ? 'flex flex-col gap-1.5' : 'flex flex-col gap-2.5'}>
            <div className={`flex flex-col ${variant === 'compact' ? 'gap-1.5' : 'gap-2.5'} ${variant === 'sidebar' ? '' : variant === 'compact' ? '' : 'sm:flex-row sm:items-start sm:justify-between'}`}>
              <div className={`flex min-w-0 flex-1 items-start ${variant === 'compact' ? 'gap-2' : 'gap-3'}`}>
                <div className={`flex shrink-0 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-900 ${variant === 'compact' ? 'h-8 w-8 text-[10px]' : 'h-10 w-10 text-xs'}`}>
                  {getContactInitials(contact)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={variant === 'compact' ? 'text-[10px] font-semibold uppercase tracking-wide text-gray-500' : 'text-sm font-semibold text-gray-900'}>
                    {variant === 'sidebar' ? 'Customer summary' : 'Linked contact'}
                  </p>
                  <div className={`${variant === 'compact' ? 'mt-0.5' : 'mt-1'} flex flex-wrap items-center gap-1.5`}>
                    <p className="truncate text-sm font-semibold leading-4 text-gray-950" title={getContactDisplayName(contact)}>
                      {getContactDisplayName(contact)}
                    </p>
                    {contact.status ? <ContactStatusBadge status={contact.status} /> : null}
                  </div>
                  <div className={`${variant === 'compact' ? 'mt-0.5' : 'mt-1.5'} flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-600`}>
                    {contact.phone ? <span>{contact.phone}</span> : null}
                    {ownerName && variant !== 'compact' ? <span>Owner: {ownerName}</span> : null}
                  </div>
                  {variant !== 'compact' && contact.tags && contact.tags.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1" aria-label="Contact tags">
                      {contact.tags.map(({ tag }) => (
                        <span
                          key={tag.id}
                          className="max-w-full truncate rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-700"
                          title={tag.name}
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className={actionClass}>
                <Link
                  to={`/contacts/${contact.id}`}
                  className={`inline-flex min-w-0 items-center justify-center rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 ${variant === 'compact' ? 'min-h-[28px]' : 'min-h-[32px]'}`}
                >
                  Open
                </Link>
                <button
                  type="button"
                  onClick={onLink}
                  disabled={loading || confirmingUnlink}
                  className={`inline-flex min-w-0 items-center justify-center rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400 ${variant === 'compact' ? 'min-h-[28px]' : 'min-h-[32px]'}`}
                >
                  Change
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingUnlink(true)}
                  disabled={loading || confirmingUnlink}
                  className={`inline-flex min-w-0 items-center justify-center rounded-lg border border-red-100 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-red-300 ${variant === 'compact' ? 'min-h-[28px]' : 'min-h-[32px]'}`}
                >
                  Unlink
                </button>
              </div>
            </div>

            {contact.status === 'ARCHIVED' ? (
              <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                This contact is archived. Existing CRM history remains available.
              </p>
            ) : null}

            {confirmingUnlink ? (
              <div className="flex flex-col gap-3 rounded-lg border border-red-100 bg-red-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-medium text-red-900">Unlink this contact?</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingUnlink(false)}
                    disabled={loading}
                    className="inline-flex min-h-[34px] items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onUnlink}
                    disabled={loading}
                    className="inline-flex min-h-[34px] items-center justify-center rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-red-300"
                  >
                    {loading ? 'Unlinking...' : 'Unlink'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className={`flex flex-col gap-3 ${variant === 'sidebar' ? '' : 'sm:flex-row sm:items-center sm:justify-between'}`}>
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-600">
                CRM
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">No contact linked</p>
                <p className="mt-1 text-sm leading-5 text-gray-600">
                  Connect this WhatsApp thread to CRM history for {conversation.waContactPhone}.
                </p>
              </div>
            </div>
            <div className={variant === 'sidebar' ? 'grid min-w-0 grid-cols-2 gap-1.5' : actionClass}>
              <button
                type="button"
                onClick={onCreate}
                disabled={loading}
                className="inline-flex min-h-[34px] items-center justify-center rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                Create contact
              </button>
              <button
                type="button"
                onClick={onLink}
                disabled={loading}
                className="inline-flex min-h-[34px] items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
              >
                Link existing
              </button>
            </div>
          </div>
        )}
        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      </div>
    </section>
  );
}
