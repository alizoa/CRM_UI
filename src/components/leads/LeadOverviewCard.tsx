import type { Lead, LeadStage, LeadTemperature } from '../../lib/leads';
import type { ReactNode } from 'react';

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
  lastUpdatedByLine?: string;
};

const STAGE_STYLES: Record<LeadStage, string> = {
  NEW: 'border-blue-200 bg-blue-50 text-blue-700',
  CONTACTED: 'border-violet-200 bg-violet-50 text-violet-700',
  QUALIFIED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  WON: 'border-green-200 bg-green-50 text-green-700',
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
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function ownerName(lead: Lead) {
  if (!lead.owner) return 'Unassigned';
  return [lead.owner.firstName, lead.owner.lastName].filter(Boolean).join(' ') || lead.owner.email;
}

function MetadataIcon({ path }: { path: string }) {
  return (
    <svg className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={path} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MetadataItem({ label, children, icon }: { label: string; children: ReactNode; icon: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-2 flex min-w-0 items-start gap-2 text-sm text-gray-900">{icon ? <MetadataIcon path={icon} /> : null}<span className="min-w-0 break-words">{children}</span></dd>
    </div>
  );
}

function ContactMetadata({ lead }: { lead: Lead }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Contact</dt>
      <dd className="mt-2 space-y-1 text-sm text-gray-900">
        <span className="flex min-w-0 items-center gap-2">
          <MetadataIcon path={ICONS.mail} />
          <span className="min-w-0 truncate whitespace-nowrap" title={lead.email ?? 'No email'}>{lead.email || 'No email'}</span>
        </span>
        <span className="flex min-w-0 items-center gap-2">
          <MetadataIcon path={ICONS.phone} />
          <span className="min-w-0 truncate whitespace-nowrap" title={lead.phone ?? 'No phone'}>{lead.phone || 'No phone'}</span>
        </span>
      </dd>
    </div>
  );
}

const ICONS = {
  owner: 'M20 21a8 8 0 0 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  mail: 'M4 6h16v12H4V6Zm0 1 8 6 8-6',
  phone: 'M6.5 4.5 9 4l1.5 4-2 1.2a11 11 0 0 0 5.3 5.3l1.2-2 4 1.5-.5 2.5c-.2 1-1.1 1.6-2.1 1.5C9.9 17.5 4.5 12.1 4 5.6c-.1-1 .5-1.9 1.5-2.1Z',
  source: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3.6 9h16.8M3.6 15h16.8M12 3c2 2.4 3 5.4 3 9s-1 6.6-3 9c-2-2.4-3-5.4-3-9s1-6.6 3-9Z',
  calendar: 'M7 3v4M17 3v4M4 8h16M5 5h14v15H5V5Z',
};

export function LeadOverviewCard({ lead, busy, editing, onConvert, onDelete, onMarkContacted, onMarkQualified, onEdit, onMarkLost, onReopen, lastUpdatedByLine }: Props) {
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unnamed lead';
  const active = lead.stage !== 'WON' && lead.stage !== 'LOST';
  const canConvert = active && Boolean(lead.firstName?.trim());

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-normal text-gray-950">{name}</h1>
            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STAGE_STYLES[lead.stage]}`}>{label(lead.stage)}</span>
            {lead.temperature ? <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${TEMPERATURE_STYLES[lead.temperature]}`}>{label(lead.temperature)}</span> : null}
          </div>
          {lead.stage === 'WON' ? (
            <p className="mt-2 text-sm text-green-700">
              This lead has been won and is read-only.
            </p>
          ) : null}
          {active && !canConvert ? <p className="mt-2 text-sm text-amber-700">Add a first name before marking this lead won.</p> : null}
          {lastUpdatedByLine ? <p className="mt-2 text-sm text-gray-600">{lastUpdatedByLine}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          {active ? <button type="button" disabled={busy || !canConvert} onClick={onConvert} className="rounded bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-gray-300">Mark Won</button> : null}
          {lead.stage === 'NEW' ? <button type="button" disabled={busy} onClick={onMarkContacted} className="rounded border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:text-gray-400">Mark Contacted</button> : null}
          {lead.stage === 'NEW' || lead.stage === 'CONTACTED' ? <button type="button" disabled={busy} onClick={onMarkQualified} className="rounded border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:text-gray-400">Mark Qualified</button> : null}
          {lead.stage !== 'WON' ? <button type="button" disabled={busy || editing} onClick={onEdit} className="rounded border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:text-gray-400">Edit</button> : null}
          {active ? <button type="button" disabled={busy} onClick={onMarkLost} className="rounded border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:text-gray-400">Mark Lost</button> : null}
          {lead.stage === 'LOST' ? <button type="button" disabled={busy} onClick={onReopen} className="rounded border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:text-gray-400">Reopen</button> : null}
          <button type="button" disabled={busy} onClick={onDelete} className="rounded border border-red-200 bg-white px-5 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:text-red-300">Delete</button>
        </div>
      </div>

      <dl className="mt-6 grid gap-x-8 gap-y-5 border-t border-gray-100 pt-5 sm:grid-cols-2 lg:grid-cols-[minmax(130px,0.85fr)_minmax(280px,1.8fr)_minmax(130px,0.85fr)_minmax(180px,1fr)_minmax(180px,1fr)]">
        <MetadataItem label="Owner" icon={ICONS.owner}>{ownerName(lead)}</MetadataItem>
        <ContactMetadata lead={lead} />
        <MetadataItem label="Source" icon={ICONS.source}>{lead.leadSource?.name ?? label(lead.source)}</MetadataItem>
        <MetadataItem label="Created" icon={ICONS.calendar}>{formatDate(lead.createdAt)}</MetadataItem>
        <MetadataItem label="Updated" icon={ICONS.calendar}>{formatDate(lead.updatedAt)}</MetadataItem>
      </dl>
    </section>
  );
}
