import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core';
import { Link, useNavigate } from 'react-router-dom';
import { AddLeadModal } from '../components/leads/AddLeadModal';
import { AppShell } from '../components/layout/AppShell';
import { useAuth } from '../context/AuthContext';
import { useLeads } from '../hooks/useLeads';
import { listLeadSourceOptions, type LeadSourceOption } from '../lib/lead-sources';
import type {
  CreateLeadInput,
  Lead,
  LeadFilters,
  LeadStatus,
  LeadTemperature,
  UpdateLeadInput,
} from '../lib/leads';
import { listMembershipOptions, type MembershipOption } from '../lib/memberships';

const PAGE_LIMIT = 20;
const VIEW_PREFERENCE_KEY = 'alozix.leads.view';
const ACTIVE_STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'FOLLOW_UP_NEEDED', 'QUALIFIED'];
const TERMINAL_STATUSES: LeadStatus[] = ['WON', 'LOST'];
const STATUS_TABS: Array<{ label: string; value: LeadStatus | '' }> = [
  { label: 'Active', value: '' },
  { label: 'New', value: 'NEW' },
  { label: 'Contacted', value: 'CONTACTED' },
  { label: 'Follow-up Needed', value: 'FOLLOW_UP_NEEDED' },
  { label: 'Qualified', value: 'QUALIFIED' },
  { label: 'Won', value: 'WON' },
  { label: 'Lost', value: 'LOST' },
];
const KANBAN_COLUMNS: Array<{ label: string; value: LeadStatus }> = [
  { label: 'New', value: 'NEW' },
  { label: 'Contacted', value: 'CONTACTED' },
  { label: 'Follow-up Needed', value: 'FOLLOW_UP_NEEDED' },
  { label: 'Qualified', value: 'QUALIFIED' },
];
const STATUS_OPTIONS: Array<{ label: string; value: LeadStatus }> = [
  { label: 'New', value: 'NEW' },
  { label: 'Contacted', value: 'CONTACTED' },
  { label: 'Follow-up Needed', value: 'FOLLOW_UP_NEEDED' },
  { label: 'Qualified', value: 'QUALIFIED' },
  { label: 'Won', value: 'WON' },
  { label: 'Lost', value: 'LOST' },
];
const TEMPERATURE_OPTIONS: Array<{ label: string; value: LeadTemperature | '' }> = [
  { label: 'Not set', value: '' },
  { label: 'Hot', value: 'HOT' },
  { label: 'Warm', value: 'WARM' },
  { label: 'Cold', value: 'COLD' },
];

const STATUS_STYLES: Record<LeadStatus, string> = {
  NEW: 'border-blue-200 bg-blue-50 text-blue-700',
  CONTACTED: 'border-violet-200 bg-violet-50 text-violet-700',
  FOLLOW_UP_NEEDED: 'border-amber-200 bg-amber-50 text-amber-700',
  QUALIFIED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  WON: 'border-green-200 bg-green-50 text-green-700',
  LOST: 'border-gray-200 bg-gray-100 text-gray-600',
};

const TEMPERATURE_STYLES = {
  HOT: 'border-red-200 bg-red-50 text-red-700',
  WARM: 'border-amber-200 bg-amber-50 text-amber-700',
  COLD: 'border-sky-200 bg-sky-50 text-sky-700',
} as const;
const EMPTY_TEMPERATURE_STYLE = 'border-gray-200 bg-gray-50 text-gray-600';

type ViewMode = 'table' | 'kanban';
type PendingField = 'status' | 'temperature';

function label(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');
}

function leadName(lead: Lead) {
  return [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unnamed lead';
}

function ownerName(lead: Lead) {
  if (!lead.owner) return 'Unassigned';
  return [lead.owner.firstName, lead.owner.lastName].filter(Boolean).join(' ') || lead.owner.email;
}

function membershipName(membership: MembershipOption) {
  return [membership.user.firstName, membership.user.lastName].filter(Boolean).join(' ')
    || membership.user.email;
}

function contactMethod(lead: Lead) {
  return lead.email || lead.phone || 'No contact info';
}

function hasFilters(filters: LeadFilters) {
  return Boolean(filters.search || filters.status || filters.ownerId);
}

function isTerminalStatus(status: LeadStatus | '') {
  return status === 'WON' || status === 'LOST';
}

function visibleStatusLabel(status: LeadStatus | '') {
  return status ? label(status) : 'Active leads';
}

function formatFollowUp(value: string | null) {
  if (!value) return 'No follow-up task';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function isOverdue(value: string | null) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

function storedViewPreference(): ViewMode {
  if (typeof window === 'undefined') return 'table';
  return window.localStorage.getItem(VIEW_PREFERENCE_KEY) === 'kanban' ? 'kanban' : 'table';
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest('a, button, input, label, select, textarea'));
}

export function LeadsPage() {
  const { accessToken } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<LeadStatus | ''>('');
  const [ownerId, setOwnerId] = useState('');
  const [page, setPage] = useState(1);
  const [viewPreference, setViewPreference] = useState<ViewMode>(() => storedViewPreference());
  const [memberships, setMemberships] = useState<MembershipOption[]>([]);
  const [leadSources, setLeadSources] = useState<LeadSourceOption[]>([]);
  const [pendingUpdates, setPendingUpdates] = useState<Record<string, PendingField>>({});
  const [updateErrors, setUpdateErrors] = useState<Record<string, string>>({});

  const actualView: ViewMode = isTerminalStatus(status) ? 'table' : viewPreference;

  const filters = useMemo<LeadFilters>(() => ({
    page: actualView === 'kanban' ? 1 : page,
    limit: actualView === 'kanban' ? 200 : PAGE_LIMIT,
    search,
    status: status || undefined,
    ownerId: ownerId || undefined,
  }), [actualView, ownerId, page, search, status]);

  const {
    leads,
    data,
    loading,
    error,
    refetch,
    createLead,
    updateLead,
    createLoading,
    createError,
  } = useLeads(accessToken, filters);

  useEffect(() => {
    if (!accessToken) {
      setMemberships([]);
      setLeadSources([]);
      return;
    }

    let active = true;
    Promise.allSettled([
      listMembershipOptions(accessToken),
      listLeadSourceOptions(accessToken),
    ]).then(([membershipResult, sourceResult]) => {
      if (!active) return;
      setMemberships(membershipResult.status === 'fulfilled' ? membershipResult.value : []);
      setLeadSources(sourceResult.status === 'fulfilled' ? sourceResult.value : []);
    });

    return () => {
      active = false;
    };
  }, [accessToken]);

  const total = data?.total ?? leads.length;
  const currentPage = data?.page ?? page;
  const limit = data?.limit ?? PAGE_LIMIT;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  function resetFilters() {
    setSearchInput('');
    setSearch('');
    setStatus('');
    setOwnerId('');
    setPage(1);
  }

  function changeView(nextView: ViewMode) {
    setViewPreference(nextView);
    setPage(1);
    window.localStorage.setItem(VIEW_PREFERENCE_KEY, nextView);
  }

  async function handleCreate(input: CreateLeadInput) {
    return Boolean(await createLead(input));
  }

  async function updateLeadInline(lead: Lead, input: UpdateLeadInput, field: PendingField) {
    if (pendingUpdates[lead.id]) return false;
    setPendingUpdates((current) => ({ ...current, [lead.id]: field }));
    setUpdateErrors((current) => {
      const next = { ...current };
      delete next[lead.id];
      return next;
    });

    try {
      await updateLead(lead.id, input);
      return true;
    } catch (requestError) {
      const message = requestError && typeof requestError === 'object' && 'message' in requestError
        ? String((requestError as { message?: unknown }).message)
        : 'Could not update lead. Please try again.';
      setUpdateErrors((current) => ({ ...current, [lead.id]: message }));
      return false;
    } finally {
      setPendingUpdates((current) => {
        const next = { ...current };
        delete next[lead.id];
        return next;
      });
    }
  }

  async function updateStatus(lead: Lead, nextStatus: LeadStatus) {
    if (lead.status === nextStatus || pendingUpdates[lead.id]) return;
    if (nextStatus === 'WON' && !window.confirm('Mark this lead as won? Won leads are read-only and will leave the active view.')) return;
    if (nextStatus === 'LOST' && !window.confirm('Mark this lead as lost? Lost leads keep their history and can be reopened later.')) return;
    await updateLeadInline(lead, { status: nextStatus }, 'status');
  }

  async function updateTemperature(lead: Lead, nextTemperature: LeadTemperature | '') {
    const temperature = nextTemperature || null;
    if (lead.temperature === temperature || pendingUpdates[lead.id]) return;
    await updateLeadInline(lead, { temperature }, 'temperature');
  }

  async function handleDragEnd(event: DragEndEvent) {
    const leadId = String(event.active.id);
    const nextStatus = event.over?.id as LeadStatus | undefined;
    if (!nextStatus || !ACTIVE_STATUSES.includes(nextStatus)) return;
    const lead = leads.find((item) => item.id === leadId);
    if (!lead || lead.status === nextStatus) return;
    await updateStatus(lead, nextStatus);
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Leads</h1>
            <p className="mt-1 text-sm text-gray-600">Manage leads from first enquiry through won or lost.</p>
          </div>
          <button type="button" onClick={() => setModalOpen(true)} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
            Add Lead
          </button>
        </header>

        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {STATUS_TABS.map((tab) => {
              const selected = status === tab.value;
              return (
                <button
                  key={tab.label}
                  type="button"
                  onClick={() => { setStatus(tab.value); setPage(1); }}
                  className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold transition ${selected ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'}`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <form className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_14rem_auto]" onSubmit={handleSearch}>
            <label className="text-sm font-medium text-gray-700">
              Search leads
              <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Name, email, phone, or message" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
            </label>
            {memberships.length > 0 ? (
              <label className="text-sm font-medium text-gray-700">
                Owner
                <select value={ownerId} onChange={(event) => { setOwnerId(event.target.value); setPage(1); }} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
                  <option value="">All owners</option>
                  {memberships.map((membership) => <option key={membership.id} value={membership.userId}>{membershipName(membership)}</option>)}
                </select>
              </label>
            ) : null}
            <div className="flex items-end gap-2">
              <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">Search</button>
              {hasFilters(filters) ? (
                <button type="button" onClick={resetFilters} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                  Reset
                </button>
              ) : null}
            </div>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-gray-700">Showing:</span>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-700">{visibleStatusLabel(status)}</span>
              {search ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">Search: {search}</span> : null}
              {ownerId ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">Owner filtered</span> : null}
              {!status ? <span className="text-xs text-gray-500">Won and Lost are hidden until selected.</span> : null}
            </div>

            {!isTerminalStatus(status) ? (
              <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
                {(['table', 'kanban'] as ViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => changeView(mode)}
                    className={`rounded-md px-3 py-1.5 text-sm font-semibold capitalize ${actualView === mode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        {loading ? <p className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-600">Loading leads...</p> : null}

        {!loading && error ? (
          <section className="rounded-xl border border-red-200 bg-white p-5">
            <h2 className="font-semibold text-red-900">Could not load leads</h2>
            <p className="mt-1 text-sm text-red-700">{error.message}</p>
            <button type="button" onClick={() => void refetch()} className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white">Retry</button>
          </section>
        ) : null}

        {!loading && !error && leads.length === 0 && actualView === 'table' ? (
          <section className="rounded-xl border border-gray-200 bg-white p-8 text-center">
            <h2 className="font-semibold text-gray-900">{hasFilters(filters) ? 'No leads found' : 'No active leads'}</h2>
            <p className="mt-2 text-sm text-gray-600">
              {hasFilters(filters) ? 'Try changing or resetting your search and filters.' : 'New, contacted, follow-up needed, and qualified leads will appear here.'}
            </p>
            {!hasFilters(filters) ? <button type="button" onClick={() => setModalOpen(true)} className="mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Add Lead</button> : null}
          </section>
        ) : null}

        {!loading && !error && actualView === 'table' && leads.length > 0 ? (
          <>
            <LeadTable
              leads={leads}
              pendingUpdates={pendingUpdates}
              updateErrors={updateErrors}
              onStatusChange={updateStatus}
              onTemperatureChange={updateTemperature}
            />

            <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-600">Page {currentPage} of {totalPages} - {total} {total === 1 ? 'lead' : 'leads'}</p>
              <div className="flex gap-2">
                <button type="button" disabled={currentPage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 disabled:text-gray-400">Previous</button>
                <button type="button" disabled={currentPage * limit >= total} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 disabled:text-gray-400">Next</button>
              </div>
            </div>
          </>
        ) : null}

        {!loading && !error && actualView === 'kanban' ? (
          <DndContext onDragEnd={(event) => void handleDragEnd(event)}>
            <div className="overflow-x-auto pb-2">
              <div className="grid min-w-[58rem] grid-cols-4 gap-4">
                {KANBAN_COLUMNS.map((column) => (
                  <KanbanColumn
                    key={column.value}
                    status={column.value}
                    title={column.label}
                    leads={leads.filter((lead) => lead.status === column.value)}
                    pendingUpdates={pendingUpdates}
                    updateErrors={updateErrors}
                    onStatusChange={updateStatus}
                  />
                ))}
              </div>
            </div>
          </DndContext>
        ) : null}
      </div>

      {modalOpen ? (
        <AddLeadModal
          memberships={memberships}
          leadSources={leadSources}
          loading={createLoading}
          requestError={createError?.message ?? null}
          onClose={() => setModalOpen(false)}
          onCreate={handleCreate}
        />
      ) : null}
    </AppShell>
  );
}

function LeadTable({
  leads,
  pendingUpdates,
  updateErrors,
  onStatusChange,
  onTemperatureChange,
}: {
  leads: Lead[];
  pendingUpdates: Record<string, PendingField>;
  updateErrors: Record<string, string>;
  onStatusChange: (lead: Lead, status: LeadStatus) => void;
  onTemperatureChange: (lead: Lead, temperature: LeadTemperature | '') => void;
}) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white md:block">
        <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              {['Lead', 'Status', 'Temperature', 'Next follow-up', 'Contact', 'Owner', ''].map((heading) => <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {leads.map((lead) => (
              <LeadRow
                key={lead.id}
                lead={lead}
                pendingField={pendingUpdates[lead.id]}
                error={updateErrors[lead.id]}
                onStatusChange={onStatusChange}
                onTemperatureChange={onTemperatureChange}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {leads.map((lead) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            pendingField={pendingUpdates[lead.id]}
            error={updateErrors[lead.id]}
            onStatusChange={onStatusChange}
            onTemperatureChange={onTemperatureChange}
          />
        ))}
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: LeadStatus }) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}>{label(status)}</span>;
}

function TemperatureBadge({ temperature }: { temperature: Lead['temperature'] }) {
  if (!temperature) return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${EMPTY_TEMPERATURE_STYLE}`}>Not set</span>;
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${TEMPERATURE_STYLES[temperature]}`}>{label(temperature)}</span>;
}

function chevronStyleClass(disabled: boolean) {
  return disabled ? 'text-gray-400' : 'text-current';
}

function FollowUpBadge({ value }: { value: string | null }) {
  const overdue = isOverdue(value);
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${overdue ? 'border-red-200 bg-red-50 text-red-700' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
      {overdue ? 'Overdue: ' : ''}{formatFollowUp(value)}
    </span>
  );
}

function StatusSelect({
  lead,
  pending,
  onStatusChange,
}: {
  lead: Lead;
  pending: boolean;
  onStatusChange: (lead: Lead, status: LeadStatus) => void;
}) {
  if (lead.status === 'WON') return <StatusBadge status={lead.status} />;
  if (lead.status === 'LOST') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={lead.status} />
        <button
          type="button"
          disabled={pending}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (window.confirm('Reopen this lost lead?')) onStatusChange(lead, 'NEW');
          }}
          className="rounded-lg border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:text-gray-400"
        >
          Reopen
        </button>
      </div>
    );
  }

  return (
    <span className="relative inline-flex max-w-full">
      <select
        value={lead.status}
        disabled={pending}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onStatusChange(lead, event.target.value as LeadStatus)}
        className={`min-w-[8.75rem] appearance-none rounded-full border py-1 pl-2.5 pr-7 text-xs font-semibold leading-5 shadow-none outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60 ${STATUS_STYLES[lead.status]}`}
        aria-label={`Status for ${leadName(lead)}`}
      >
        {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <span className={`pointer-events-none absolute right-2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rotate-45 border-b border-r ${chevronStyleClass(pending)}`} aria-hidden="true" />
    </span>
  );
}

function TemperatureSelect({
  lead,
  pending,
  onTemperatureChange,
}: {
  lead: Lead;
  pending: boolean;
  onTemperatureChange: (lead: Lead, temperature: LeadTemperature | '') => void;
}) {
  if (TERMINAL_STATUSES.includes(lead.status)) return <TemperatureBadge temperature={lead.temperature} />;

  return (
    <span className="relative inline-flex max-w-full">
      <select
        value={lead.temperature ?? ''}
        disabled={pending}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onTemperatureChange(lead, event.target.value as LeadTemperature | '')}
        className={`min-w-[5.75rem] appearance-none rounded-full border py-1 pl-2.5 pr-7 text-xs font-semibold leading-5 shadow-none outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60 ${lead.temperature ? TEMPERATURE_STYLES[lead.temperature] : EMPTY_TEMPERATURE_STYLE}`}
        aria-label={`Temperature for ${leadName(lead)}`}
      >
        {TEMPERATURE_OPTIONS.map((option) => <option key={option.value || 'none'} value={option.value}>{option.label}</option>)}
      </select>
      <span className={`pointer-events-none absolute right-2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rotate-45 border-b border-r ${chevronStyleClass(pending)}`} aria-hidden="true" />
    </span>
  );
}

function UpdateState({ pendingField, error }: { pendingField?: PendingField; error?: string }) {
  if (pendingField) return <p className="mt-1 text-xs font-medium text-emerald-700">Updating {pendingField}...</p>;
  if (error) return <p className="mt-1 text-xs font-medium text-red-700">{error}</p>;
  return null;
}

function LeadRow({
  lead,
  pendingField,
  error,
  onStatusChange,
  onTemperatureChange,
}: {
  lead: Lead;
  pendingField?: PendingField;
  error?: string;
  onStatusChange: (lead: Lead, status: LeadStatus) => void;
  onTemperatureChange: (lead: Lead, temperature: LeadTemperature | '') => void;
}) {
  const pending = Boolean(pendingField);
  return (
    <tr className={pending ? 'bg-emerald-50/40' : 'hover:bg-gray-50'}>
      <td className="px-4 py-3">
        <Link className="block font-semibold text-gray-900 hover:underline" to={`/leads/${lead.id}`}>{leadName(lead)}</Link>
        <p className="mt-1 text-xs text-gray-500">{lead.leadSource?.name ?? label(lead.source)}</p>
        <UpdateState pendingField={pendingField} error={error} />
      </td>
      <td className="px-4 py-3"><StatusSelect lead={lead} pending={pending} onStatusChange={onStatusChange} /></td>
      <td className="px-4 py-3"><TemperatureSelect lead={lead} pending={pending} onTemperatureChange={onTemperatureChange} /></td>
      <td className="px-4 py-3"><FollowUpBadge value={lead.nextFollowUpAt} /></td>
      <td className="px-4 py-3 text-gray-700">{contactMethod(lead)}</td>
      <td className="px-4 py-3 text-gray-700">{ownerName(lead)}</td>
      <td className="px-4 py-3 text-right"><Link className="font-semibold text-emerald-700 hover:text-emerald-800" to={`/leads/${lead.id}`}>Open</Link></td>
    </tr>
  );
}

function LeadCard({
  lead,
  pendingField,
  error,
  onStatusChange,
  onTemperatureChange,
}: {
  lead: Lead;
  pendingField?: PendingField;
  error?: string;
  onStatusChange: (lead: Lead, status: LeadStatus) => void;
  onTemperatureChange: (lead: Lead, temperature: LeadTemperature | '') => void;
}) {
  const pending = Boolean(pendingField);
  const navigate = useNavigate();
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={(event) => {
        if (!isInteractiveTarget(event.target)) navigate(`/leads/${lead.id}`);
      }}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && !isInteractiveTarget(event.target)) {
          event.preventDefault();
          navigate(`/leads/${lead.id}`);
        }
      }}
      className={`cursor-pointer rounded-xl border bg-white p-4 hover:border-gray-300 hover:bg-gray-50 ${isOverdue(lead.nextFollowUpAt) ? 'border-red-200' : 'border-gray-200'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <Link className="min-w-0" to={`/leads/${lead.id}`}>
          <h2 className="font-semibold text-gray-900">{leadName(lead)}</h2>
          <p className="mt-1 break-words text-sm text-gray-700">{contactMethod(lead)}</p>
        </Link>
        <span className="shrink-0"><StatusBadge status={lead.status} /></span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <StatusSelect lead={lead} pending={pending} onStatusChange={onStatusChange} />
        <TemperatureSelect lead={lead} pending={pending} onTemperatureChange={onTemperatureChange} />
      </div>
      <UpdateState pendingField={pendingField} error={error} />
      <div className="mt-4 flex flex-wrap gap-2">
        <FollowUpBadge value={lead.nextFollowUpAt} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div><p className="font-semibold uppercase tracking-wide text-gray-500">Owner</p><p className="mt-1 text-gray-700">{ownerName(lead)}</p></div>
        <div><p className="font-semibold uppercase tracking-wide text-gray-500">Source</p><p className="mt-1 text-gray-700">{lead.leadSource?.name ?? label(lead.source)}</p></div>
      </div>
      <Link className="mt-4 inline-block text-sm font-semibold text-emerald-700" to={`/leads/${lead.id}`}>Open lead</Link>
    </div>
  );
}

function KanbanColumn({
  status,
  title,
  leads,
  pendingUpdates,
  updateErrors,
  onStatusChange,
}: {
  status: LeadStatus;
  title: string;
  leads: Lead[];
  pendingUpdates: Record<string, PendingField>;
  updateErrors: Record<string, string>;
  onStatusChange: (lead: Lead, status: LeadStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section ref={setNodeRef} className={`min-h-[24rem] rounded-xl border bg-gray-50 p-3 ${isOver ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-gray-200'}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-gray-600">{leads.length}</span>
      </div>
      <div className="space-y-3">
        {leads.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-center text-sm text-gray-500">No leads here</p>
        ) : leads.map((lead) => (
          <KanbanLeadCard
            key={lead.id}
            lead={lead}
            pendingField={pendingUpdates[lead.id]}
            error={updateErrors[lead.id]}
            onStatusChange={onStatusChange}
          />
        ))}
      </div>
    </section>
  );
}

function KanbanLeadCard({
  lead,
  pendingField,
  error,
  onStatusChange,
}: {
  lead: Lead;
  pendingField?: PendingField;
  error?: string;
  onStatusChange: (lead: Lead, status: LeadStatus) => void;
}) {
  const navigate = useNavigate();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
    disabled: Boolean(pendingField),
  });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <article
      ref={setNodeRef}
      style={style}
      role="link"
      tabIndex={0}
      onClick={(event) => {
        if (!isInteractiveTarget(event.target)) navigate(`/leads/${lead.id}`);
      }}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && !isInteractiveTarget(event.target)) {
          event.preventDefault();
          navigate(`/leads/${lead.id}`);
        }
      }}
      className={`cursor-pointer rounded-lg border bg-white p-3 shadow-sm ${isDragging ? 'z-10 opacity-80' : ''} ${isOverdue(lead.nextFollowUpAt) ? 'border-red-200' : 'border-gray-200'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <Link className="min-w-0 font-semibold text-gray-900 hover:underline" to={`/leads/${lead.id}`}>{leadName(lead)}</Link>
        <button
          type="button"
          className="shrink-0 rounded border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:text-gray-400"
          disabled={Boolean(pendingField)}
          aria-label={`Drag ${leadName(lead)}`}
          {...attributes}
          {...listeners}
        >
          Drag
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <TemperatureBadge temperature={lead.temperature} />
        <FollowUpBadge value={lead.nextFollowUpAt} />
      </div>
      <p className="mt-3 break-words text-sm text-gray-700">{contactMethod(lead)}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div><p className="font-semibold uppercase tracking-wide text-gray-500">Owner</p><p className="mt-1 text-gray-700">{ownerName(lead)}</p></div>
        <div><p className="font-semibold uppercase tracking-wide text-gray-500">Source</p><p className="mt-1 text-gray-700">{lead.leadSource?.name ?? label(lead.source)}</p></div>
      </div>
      <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-gray-500">
        Move to
        <select
          value={lead.status}
          disabled={Boolean(pendingField)}
          onChange={(event) => onStatusChange(lead, event.target.value as LeadStatus)}
          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm normal-case tracking-normal text-gray-800 disabled:bg-gray-100 disabled:text-gray-400"
          aria-label={`Move ${leadName(lead)} to status`}
        >
          {KANBAN_COLUMNS.map((column) => <option key={column.value} value={column.value}>{column.label}</option>)}
        </select>
      </label>
      <UpdateState pendingField={pendingField} error={error} />
    </article>
  );
}
