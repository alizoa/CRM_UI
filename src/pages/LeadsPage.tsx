import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
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
} from '../lib/leads';
import { listMembershipOptions, type MembershipOption } from '../lib/memberships';

const PAGE_LIMIT = 20;
const STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST'];

const STATUS_STYLES: Record<LeadStatus, string> = {
  NEW: 'border-blue-200 bg-blue-50 text-blue-700',
  CONTACTED: 'border-violet-200 bg-violet-50 text-violet-700',
  QUALIFIED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  CONVERTED: 'border-green-200 bg-green-50 text-green-700',
  LOST: 'border-gray-200 bg-gray-100 text-gray-600',
};

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

export function LeadsPage() {
  const { accessToken } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<LeadStatus | ''>('');
  const [ownerId, setOwnerId] = useState('');
  const [page, setPage] = useState(1);
  const [memberships, setMemberships] = useState<MembershipOption[]>([]);
  const [leadSources, setLeadSources] = useState<LeadSourceOption[]>([]);

  const filters = useMemo<LeadFilters>(() => ({
    page,
    limit: PAGE_LIMIT,
    search,
    status: status || undefined,
    ownerId: ownerId || undefined,
  }), [ownerId, page, search, status]);

  const {
    leads,
    data,
    loading,
    error,
    refetch,
    createLead,
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

  async function handleCreate(input: CreateLeadInput) {
    return Boolean(await createLead(input));
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Leads</h1>
            <p className="mt-1 text-sm text-gray-600">Early enquiries live here before they become contacts.</p>
          </div>
          <button type="button" onClick={() => setModalOpen(true)} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
            Add Lead
          </button>
        </header>

        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <form className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_14rem_auto]" onSubmit={handleSearch}>
            <label className="text-sm font-medium text-gray-700">
              Search
              <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Name, email, phone, or message" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Status
              <select value={status} onChange={(event) => { setStatus(event.target.value as LeadStatus | ''); setPage(1); }} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
                <option value="">All statuses</option>
                {STATUSES.map((item) => <option key={item} value={item}>{label(item)}</option>)}
              </select>
            </label>
            {memberships.length > 0 ? (
              <label className="text-sm font-medium text-gray-700">
                Owner
                <select value={ownerId} onChange={(event) => { setOwnerId(event.target.value); setPage(1); }} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
                  <option value="">All owners</option>
                  {memberships.map((membership) => <option key={membership.id} value={membership.userId}>{membershipName(membership)}</option>)}
                </select>
              </label>
            ) : <div />}
            <div className="flex items-end gap-2">
              <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">Search</button>
              {hasFilters(filters) ? (
                <button type="button" onClick={() => { setSearchInput(''); setSearch(''); setStatus(''); setOwnerId(''); setPage(1); }} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                  Reset
                </button>
              ) : null}
            </div>
          </form>
        </section>

        {loading ? <p className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-600">Loading leads...</p> : null}

        {!loading && error ? (
          <section className="rounded-xl border border-red-200 bg-white p-5">
            <h2 className="font-semibold text-red-900">Could not load leads</h2>
            <p className="mt-1 text-sm text-red-700">{error.message}</p>
            <button type="button" onClick={() => void refetch()} className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white">Retry</button>
          </section>
        ) : null}

        {!loading && !error && leads.length === 0 ? (
          <section className="rounded-xl border border-gray-200 bg-white p-8 text-center">
            <h2 className="font-semibold text-gray-900">{hasFilters(filters) ? 'No leads found' : 'No leads yet'}</h2>
            <p className="mt-2 text-sm text-gray-600">
              {hasFilters(filters) ? 'Try changing or resetting your search and filters.' : 'Add the first lead when a new enquiry arrives.'}
            </p>
            {!hasFilters(filters) ? <button type="button" onClick={() => setModalOpen(true)} className="mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Add Lead</button> : null}
          </section>
        ) : null}

        {!loading && !error && leads.length > 0 ? (
          <>
            <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white md:block">
              <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    {['Name', 'Status', 'Temperature', 'Contact', 'Owner', 'Source'].map((heading) => <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {leads.map((lead) => <LeadRow key={lead.id} lead={lead} />)}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {leads.map((lead) => <LeadCard key={lead.id} lead={lead} />)}
            </div>

            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-sm text-gray-600">Page {currentPage} of {totalPages} · {total} {total === 1 ? 'lead' : 'leads'}</p>
              <div className="flex gap-2">
                <button type="button" disabled={currentPage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 disabled:text-gray-400">Previous</button>
                <button type="button" disabled={currentPage * limit >= total} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 disabled:text-gray-400">Next</button>
              </div>
            </div>
          </>
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

function StatusBadge({ status }: { status: LeadStatus }) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}>{label(status)}</span>;
}

function LeadRow({ lead }: { lead: Lead }) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 font-semibold text-gray-900"><Link className="block hover:underline" to={`/leads/${lead.id}`}>{leadName(lead)}</Link></td>
      <td className="px-4 py-3"><StatusBadge status={lead.status} /></td>
      <td className="px-4 py-3 text-gray-700">{lead.temperature ? label(lead.temperature) : 'Not set'}</td>
      <td className="px-4 py-3 text-gray-700">{contactMethod(lead)}</td>
      <td className="px-4 py-3 text-gray-700">{ownerName(lead)}</td>
      <td className="px-4 py-3 text-gray-700">{lead.leadSource?.name ?? label(lead.source)}</td>
    </tr>
  );
}

function LeadCard({ lead }: { lead: Lead }) {
  return (
    <Link className="block rounded-xl border border-gray-200 bg-white p-4 hover:border-gray-300 hover:bg-gray-50" to={`/leads/${lead.id}`}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold text-gray-900">{leadName(lead)}</h2>
        <StatusBadge status={lead.status} />
      </div>
      <p className="mt-3 break-words text-sm text-gray-700">{contactMethod(lead)}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div><p className="font-semibold uppercase tracking-wide text-gray-500">Temperature</p><p className="mt-1 text-gray-700">{lead.temperature ? label(lead.temperature) : 'Not set'}</p></div>
        <div><p className="font-semibold uppercase tracking-wide text-gray-500">Owner</p><p className="mt-1 text-gray-700">{ownerName(lead)}</p></div>
        <div><p className="font-semibold uppercase tracking-wide text-gray-500">Source</p><p className="mt-1 text-gray-700">{lead.leadSource?.name ?? label(lead.source)}</p></div>
      </div>
    </Link>
  );
}
