import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { useAuth } from '../context/AuthContext';
import { useContacts } from '../hooks/useContacts';
import type { Contact, ContactFilters, ContactStatus, CreateContactInput } from '../lib/contacts';
import { listLeadSourceOptions, type LeadSourceOption } from '../lib/lead-sources';
import { listMembershipOptions, type MembershipOption } from '../lib/memberships';
import { listTagOptions, type TagOption } from '../lib/tags';

type ContactFormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

const INITIAL_FORM_STATE: ContactFormState = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
};

const CONTACTS_PAGE_LIMIT = 20;
const CONTACT_STATUSES: ContactStatus[] = ['PROSPECT', 'CUSTOMER', 'ARCHIVED'];
const STATUS_LABELS: Record<ContactStatus, string> = {
  PROSPECT: 'Prospect',
  CUSTOMER: 'Customer',
  ARCHIVED: 'Archived',
};

function emptyToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function formatValue(value: string | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  return value;
}

function getStatusLabel(status: string) {
  return STATUS_LABELS[status as ContactStatus] ?? status;
}

function getStatusBadgeClass(status: string) {
  if (status === 'CUSTOMER') {
    return 'border-green-200 bg-green-50 text-green-700';
  }

  if (status === 'ARCHIVED') {
    return 'border-gray-200 bg-gray-100 text-gray-600';
  }

  return 'border-blue-200 bg-blue-50 text-blue-700';
}

function getContactName(contact: Contact) {
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unnamed contact';
}

function getOwnerName(contact: Contact) {
  if (!contact.owner) {
    return null;
  }

  return [contact.owner.firstName, contact.owner.lastName].filter(Boolean).join(' ') || contact.owner.email;
}

function getContactMethod(contact: Contact) {
  return contact.email || contact.phone || null;
}

function getMembershipName(membership: MembershipOption) {
  return [membership.user.firstName, membership.user.lastName].filter(Boolean).join(' ') || membership.user.email;
}

function getActiveFilterCount(filters: ContactFilters) {
  return [filters.search, filters.status, filters.ownerId, filters.leadSourceId, filters.tagId].filter(Boolean).length;
}

export function ContactsPage() {
  const { accessToken } = useAuth();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState<ContactFormState>(INITIAL_FORM_STATE);
  const [formError, setFormError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ContactStatus | ''>('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [leadSourceFilter, setLeadSourceFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [page, setPage] = useState(1);
  const [memberships, setMemberships] = useState<MembershipOption[]>([]);
  const [leadSources, setLeadSources] = useState<LeadSourceOption[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [filterOptionsLoading, setFilterOptionsLoading] = useState(false);
  const [filterOptionsWarnings, setFilterOptionsWarnings] = useState<string[]>([]);

  const contactFilters = useMemo<ContactFilters>(
    () => ({
      search,
      status: statusFilter || undefined,
      ownerId: ownerFilter,
      leadSourceId: leadSourceFilter,
      tagId: tagFilter,
      page,
      limit: CONTACTS_PAGE_LIMIT,
    }),
    [leadSourceFilter, ownerFilter, page, search, statusFilter, tagFilter],
  );

  const { contacts, data, loading, error, refetch, createContact, createLoading, createError } = useContacts(accessToken, contactFilters);
  const totalContacts = data?.total ?? contacts.length;
  const currentPage = data?.page ?? page;
  const currentLimit = data?.limit ?? CONTACTS_PAGE_LIMIT;
  const totalPages = Math.max(1, Math.ceil(totalContacts / currentLimit));
  const hasPreviousPage = currentPage > 1;
  const hasNextPage = currentPage * currentLimit < totalContacts;
  const activeFilterCount = getActiveFilterCount(contactFilters);

  useEffect(() => {
    if (!accessToken) {
      setMemberships([]);
      setLeadSources([]);
      setTags([]);
      setFilterOptionsWarnings([]);
      setFilterOptionsLoading(false);
      return;
    }

    let active = true;
    const token = accessToken;

    async function fetchFilterOptions() {
      setFilterOptionsLoading(true);
      setFilterOptionsWarnings([]);

      const [membershipResult, leadSourceResult, tagResult] = await Promise.allSettled([
        listMembershipOptions(token),
        listLeadSourceOptions(token),
        listTagOptions(token),
      ]);

      if (!active) {
        return;
      }

      const warnings: string[] = [];

      if (membershipResult.status === 'fulfilled') {
        setMemberships(membershipResult.value);
      } else {
        setMemberships([]);
        warnings.push('Owner filter options could not be loaded.');
      }

      if (leadSourceResult.status === 'fulfilled') {
        setLeadSources(leadSourceResult.value);
      } else {
        setLeadSources([]);
        warnings.push('Lead source filter options could not be loaded.');
      }

      if (tagResult.status === 'fulfilled') {
        setTags(tagResult.value);
      } else {
        setTags([]);
        warnings.push('Tag filter options could not be loaded.');
      }

      setFilterOptionsWarnings(warnings);
      setFilterOptionsLoading(false);
    }

    void fetchFilterOptions();

    return () => {
      active = false;
    };
  }, [accessToken]);

  const resetForm = () => {
    setForm(INITIAL_FORM_STATE);
    setFormError(null);
  };

  const resetPage = () => {
    setPage(1);
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearch(searchInput.trim());
    resetPage();
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setSearch('');
    setStatusFilter('');
    setOwnerFilter('');
    setLeadSourceFilter('');
    setTagFilter('');
    setPage(1);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const firstName = form.firstName.trim();
    if (!firstName) {
      setFormError('First name is required.');
      return;
    }

    const input: CreateContactInput = {
      firstName,
      ...(emptyToUndefined(form.lastName) ? { lastName: emptyToUndefined(form.lastName) } : {}),
      ...(emptyToUndefined(form.email) ? { email: emptyToUndefined(form.email) } : {}),
      ...(emptyToUndefined(form.phone) ? { phone: emptyToUndefined(form.phone) } : {}),
    };

    const createdContact = await createContact(input);
    if (createdContact) {
      resetForm();
      setShowCreateForm(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Contacts</h1>
            {dataSummary(totalContacts, loading, Boolean(data))}
          </div>
          <button
            type="button"
            onClick={() => {
              setShowCreateForm((current) => !current);
              setFormError(null);
            }}
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            New Contact
          </button>
        </div>

        {showCreateForm ? (
          <section className="rounded border border-gray-200 bg-white p-5">
            <h2 className="text-base font-semibold text-gray-900">Create contact</h2>
            <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
              <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                First name
                <input
                  value={form.firstName}
                  onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))}
                  className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  autoComplete="given-name"
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                Last name
                <input
                  value={form.lastName}
                  onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))}
                  className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  autoComplete="family-name"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                Email
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  autoComplete="email"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                Phone
                <input
                  value={form.phone}
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                  className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  autoComplete="tel"
                />
              </label>
              <div className="sm:col-span-2">
                {formError || createError ? <p className="mb-3 text-sm text-red-700">{formError ?? createError?.message}</p> : null}
                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={createLoading}
                    className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
                  >
                    {createLoading ? 'Creating...' : 'Create contact'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      resetForm();
                      setShowCreateForm(false);
                    }}
                    className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          </section>
        ) : null}

        <section className="rounded border border-gray-200 bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base font-semibold text-gray-900">Search and filter</h2>
            {activeFilterCount > 0 ? (
              <span className="inline-flex w-fit items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-600">
                {activeFilterCount} active
              </span>
            ) : null}
          </div>
          {filterOptionsWarnings.length > 0 ? (
            <div className="mt-3 rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
              {filterOptionsWarnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
          <form className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,1fr))_auto]" onSubmit={handleSearchSubmit}>
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
              Search
              <span className="relative">
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 pr-9 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  placeholder="Name, email, or phone"
                />
                {searchInput ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput('');
                      if (search) {
                        setSearch('');
                        resetPage();
                      }
                    }}
                    className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-sm font-semibold text-gray-400 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                ) : null}
              </span>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
              Status
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as ContactStatus | '');
                  resetPage();
                }}
                className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              >
                <option value="">All statuses</option>
                {CONTACT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {getStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
              Owner
              <select
                value={ownerFilter}
                onChange={(event) => {
                  setOwnerFilter(event.target.value);
                  resetPage();
                }}
                disabled={filterOptionsLoading || memberships.length === 0}
                className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
              >
                <option value="">All owners</option>
                {memberships.map((membership) => (
                  <option key={membership.id} value={membership.userId}>
                    {getMembershipName(membership)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
              Lead source
              <select
                value={leadSourceFilter}
                onChange={(event) => {
                  setLeadSourceFilter(event.target.value);
                  resetPage();
                }}
                disabled={filterOptionsLoading || leadSources.length === 0}
                className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
              >
                <option value="">All lead sources</option>
                {leadSources.map((leadSource) => (
                  <option key={leadSource.id} value={leadSource.id}>
                    {leadSource.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
              Tag
              <select
                value={tagFilter}
                onChange={(event) => {
                  setTagFilter(event.target.value);
                  resetPage();
                }}
                disabled={filterOptionsLoading || tags.length === 0}
                className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
              >
                <option value="">All tags</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              >
                Search
              </button>
              <button
                type="button"
                onClick={handleResetFilters}
                className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              >
                Reset
              </button>
            </div>
          </form>
        </section>

        {loading ? <p className="rounded border border-gray-200 bg-white p-5 text-sm text-gray-700">Loading contacts...</p> : null}

        {!loading && error ? (
          <div className="rounded border border-red-200 bg-white p-5">
            <h2 className="text-base font-semibold text-red-900">Could not load contacts</h2>
            <p className="mt-2 text-sm text-red-700">{error.message}</p>
            <button
              type="button"
              onClick={() => {
                void refetch();
              }}
              className="mt-4 rounded bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              Retry
            </button>
          </div>
        ) : null}

        {!loading && !error && contacts.length === 0 ? (
          <div className="rounded border border-gray-200 bg-white p-8 text-center">
            <h2 className="text-base font-semibold text-gray-900">{hasActiveFilters(contactFilters) ? 'No contacts found' : 'No contacts yet'}</h2>
            <p className="mt-2 text-sm text-gray-600">
              {hasActiveFilters(contactFilters)
                ? 'Try changing or resetting the filters.'
                : 'Create the first contact to start building your customer list.'}
            </p>
            <button
              type="button"
              onClick={() => setShowCreateForm(true)}
              className="mt-4 rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            >
              New Contact
            </button>
          </div>
        ) : null}

        {!loading && !error && contacts.length > 0 ? (
          <>
            <div className="hidden overflow-hidden rounded border border-gray-200 bg-white md:block">
              <table className="min-w-full table-fixed divide-y divide-gray-200 text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="w-[28%] px-4 py-3 font-semibold xl:w-[22%]">Name</th>
                    <th className="w-[17%] px-4 py-3 font-semibold xl:w-[14%]">Status</th>
                    <th className="w-[30%] px-4 py-3 font-semibold xl:w-[22%]">Contact</th>
                    <th className="w-[25%] px-4 py-3 font-semibold xl:w-[18%]">Owner</th>
                    <th className="hidden w-[12%] px-4 py-3 font-semibold xl:table-cell">Lead Source</th>
                    <th className="hidden w-[12%] px-4 py-3 font-semibold xl:table-cell">Tags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {contacts.map((contact) => (
                    <ContactTableRow key={contact.id} contact={contact} />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {contacts.map((contact) => (
                <ContactMobileCard key={contact.id} contact={contact} />
              ))}
            </div>
            <div className="flex flex-col gap-3 rounded border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={!hasPreviousPage || loading}
                  className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={!hasNextPage || loading}
                  className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

function ContactTableRow({ contact }: { contact: Contact }) {
  const isArchived = contact.status === 'ARCHIVED';

  return (
    <tr className={isArchived ? 'bg-gray-50/70' : undefined}>
      <td className="px-4 py-3 font-medium text-gray-900">
        <Link className="underline decoration-gray-300 underline-offset-2 hover:text-gray-700" to={`/contacts/${contact.id}`}>
          {getContactName(contact)}
        </Link>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={contact.status} />
      </td>
      <td className="max-w-56 px-4 py-3 text-gray-700">
        <ContactMethod contact={contact} />
      </td>
      <td className="max-w-44 px-4 py-3 text-gray-700">
        <OwnerDisplay contact={contact} />
      </td>
      <td className="hidden px-4 py-3 text-gray-700 xl:table-cell">{contact.leadSource?.name ?? <span className="text-gray-400">Not set</span>}</td>
      <td className="hidden px-4 py-3 text-gray-700 xl:table-cell">
        <TagPills contact={contact} />
      </td>
    </tr>
  );
}

function ContactMobileCard({ contact }: { contact: Contact }) {
  const isArchived = contact.status === 'ARCHIVED';

  return (
    <article className={['rounded border border-gray-200 bg-white p-4', isArchived ? 'bg-gray-50/70' : ''].filter(Boolean).join(' ')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-sm font-semibold text-gray-900">
            <Link className="underline decoration-gray-300 underline-offset-2 hover:text-gray-700" to={`/contacts/${contact.id}`}>
              {getContactName(contact)}
            </Link>
          </h2>
          <div className="mt-2">
            <StatusBadge status={contact.status} />
          </div>
        </div>
        <div className="shrink-0 text-right text-xs text-gray-500">
          <OwnerDisplay contact={contact} compact />
        </div>
      </div>
      <div className="mt-3 space-y-2 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Contact</p>
          <div className="mt-1 text-gray-700">
            <ContactMethod contact={contact} />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Lead Source</p>
            <p className="mt-1 text-gray-700">{contact.leadSource?.name ?? <span className="text-gray-400">Not set</span>}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Tags</p>
            <div className="mt-1">
              <TagPills contact={contact} />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={['inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold', getStatusBadgeClass(status)].join(' ')}>
      {getStatusLabel(status)}
    </span>
  );
}

function ContactMethod({ contact }: { contact: Contact }) {
  const contactMethod = getContactMethod(contact);

  if (!contactMethod) {
    return <span className="italic text-gray-400">No contact info</span>;
  }

  return <span className="break-words">{contactMethod}</span>;
}

function OwnerDisplay({ contact, compact = false }: { contact: Contact; compact?: boolean }) {
  const ownerName = getOwnerName(contact);

  if (!ownerName) {
    return <span className="italic text-gray-400">Unassigned</span>;
  }

  return <span className={compact ? 'break-words text-gray-600' : 'break-words text-gray-700'}>{ownerName}</span>;
}

function TagPills({ contact }: { contact: Contact }) {
  if (contact.tags.length === 0) {
    return <span className="text-gray-400">Not set</span>;
  }

  const visibleTags = contact.tags.slice(0, 2);
  const hiddenCount = contact.tags.length - visibleTags.length;

  return (
    <div className="flex flex-wrap gap-1">
      {visibleTags.map((tag) => (
        <span key={tag.id} className="inline-flex max-w-36 items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700">
          {tag.tag.color ? <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-gray-200" style={{ backgroundColor: tag.tag.color }} /> : null}
          <span className="truncate">{tag.tag.name}</span>
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span className="inline-flex rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-500">+{hiddenCount} more</span>
      ) : null}
    </div>
  );
}

function dataSummary(count: number, loading: boolean, hasData: boolean) {
  if (loading && !hasData) {
    return null;
  }

  return <p className="mt-1 text-sm text-gray-600">{count === 1 ? '1 contact' : `${count} contacts`}</p>;
}

function hasActiveFilters(filters: ContactFilters) {
  return Boolean(filters.search || filters.status || filters.ownerId || filters.leadSourceId || filters.tagId);
}
