import { Link } from 'react-router-dom';
import type { Lead, LeadStatus, LeadTemperature } from '../../lib/leads';

type Props = {
  lead: Lead;
  busy: boolean;
  editing: boolean;
  onConvert: () => void;
  onDelete: () => void;
  onMarkContacted: () => void;
  onMarkQualified: () => void;
  onEdit: () => void;
  onMarkLost: () => void;
  onReopen: () => void;
};

const STATUS_STYLES: Record<LeadStatus, string> = {
  NEW: 'border-blue-200 bg-blue-50 text-blue-700',
  CONTACTED: 'border-violet-200 bg-violet-50 text-violet-700',
  QUALIFIED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  CONVERTED: 'border-green-200 bg-green-50 text-green-700',
  LOST: 'border-gray-200 bg-gray-100 text-gray-600',
};

const TEMPERATURE_STYLES: Record<LeadTemperature, string> = {
  HOT: 'border-red-200 bg-red-50 text-red-700',
  WARM: 'border-amber-200 bg-amber-50 text-amber-700',
  COLD: 'border-sky-200 bg-sky-50 text-sky-700',
};

function label(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');
}

function formatDate(value: string | null) {
  if (!value) return 'Not set';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function ownerName(lead: Lead) {
  if (!lead.owner) return 'Unassigned';
  return [lead.owner.firstName, lead.owner.lastName].filter(Boolean).join(' ') || lead.owner.email;
}

export function LeadOverviewCard({ lead, busy, editing, onConvert, onDelete, onMarkContacted, onMarkQualified, onEdit, onMarkLost, onReopen }: Props) {
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unnamed lead';
  const active = ['NEW', 'CONTACTED', 'QUALIFIED'].includes(lead.status);
  const canConvert = active && Boolean(lead.firstName?.trim());

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-gray-900">{name}</h1>
            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[lead.status]}`}>{label(lead.status)}</span>
            {lead.temperature ? <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${TEMPERATURE_STYLES[lead.temperature]}`}>{label(lead.temperature)}</span> : null}
          </div>
          {lead.status === 'CONVERTED' ? (
            <p className="mt-2 text-sm text-green-700">
              This lead has already been converted.
              {lead.convertedContactId ? <> <Link className="font-semibold underline" to={`/contacts/${lead.convertedContactId}`}>View contact</Link>.</> : null}
            </p>
          ) : null}
          {active && !canConvert ? <p className="mt-2 text-sm text-amber-700">Add a first name before converting this lead.</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {active ? <button type="button" disabled={busy || !canConvert} onClick={onConvert} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-gray-300">Convert to Contact</button> : null}
          {lead.status === 'NEW' ? <button type="button" disabled={busy} onClick={onMarkContacted} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:text-gray-400">Mark Contacted</button> : null}
          {lead.status === 'NEW' || lead.status === 'CONTACTED' ? <button type="button" disabled={busy} onClick={onMarkQualified} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:text-gray-400">Mark Qualified</button> : null}
          {lead.status !== 'CONVERTED' ? <button type="button" disabled={busy || editing} onClick={onEdit} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:text-gray-400">Edit</button> : null}
          {active ? <button type="button" disabled={busy} onClick={onMarkLost} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:text-gray-400">Mark Lost</button> : null}
          {lead.status === 'LOST' ? <button type="button" disabled={busy} onClick={onReopen} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:text-gray-400">Reopen</button> : null}
          <button type="button" disabled={busy} onClick={onDelete} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:text-red-300">Delete</button>
        </div>
      </div>

      <dl className="mt-6 grid gap-4 border-t border-gray-100 pt-5 sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Owner</dt><dd className="mt-1 text-sm text-gray-900">{ownerName(lead)}</dd></div>
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Contact</dt><dd className="mt-1 break-words text-sm text-gray-900">{lead.email || 'No email'}<br />{lead.phone || 'No phone'}</dd></div>
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Source</dt><dd className="mt-1 text-sm text-gray-900">{lead.leadSource?.name ?? label(lead.source)}</dd></div>
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Next follow-up</dt><dd className="mt-1 text-sm text-gray-900">{formatDate(lead.nextFollowUpAt)}</dd></div>
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Created</dt><dd className="mt-1 text-sm text-gray-900">{formatDate(lead.createdAt)}</dd></div>
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Updated</dt><dd className="mt-1 text-sm text-gray-900">{formatDate(lead.updatedAt)}</dd></div>
      </dl>
    </section>
  );
}
