import { Link } from 'react-router-dom';
import type { Deal } from '../../lib/deals';

type RelatedContactCardProps = {
  contact: Deal['contact'];
};

function getContactName(contact: NonNullable<Deal['contact']>) {
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email || contact.phone || 'Unnamed contact';
}

export function RelatedContactCard({ contact }: RelatedContactCardProps) {
  return (
    <section className="rounded border border-gray-200 bg-white p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Related customer</h2>
          <p className="mt-1 text-sm text-gray-600">The contact connected to this deal.</p>
        </div>
        {contact?.id ? (
          <Link
            className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            to={`/contacts/${contact.id}`}
          >
            Open contact
          </Link>
        ) : null}
      </div>

      {contact ? (
        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ContactItem label="Name" value={getContactName(contact)} />
          <ContactItem label="Email" value={contact.email ?? 'No email'} />
          <ContactItem label="Phone" value={contact.phone ?? 'No phone'} />
          <ContactItem label="Status" value={contact.status} />
        </dl>
      ) : (
        <p className="mt-5 rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">No customer is linked to this deal yet.</p>
      )}
    </section>
  );
}

type ContactItemProps = {
  label: string;
  value: string;
};

function ContactItem({ label, value }: ContactItemProps) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 break-words text-sm text-gray-900">{value}</dd>
    </div>
  );
}
