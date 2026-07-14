import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { useAuth } from '../context/AuthContext';
import { listContacts, type Contact } from '../lib/contacts';
import {
  createDeal,
  listDeals,
  markDealLost,
  markDealWon,
  moveDeal,
  reopenDeal,
  type CreateDealInput,
  type Deal,
  type DealsResponse,
} from '../lib/deals';
import type { HttpError } from '../lib/http';
import { listLeadSourceOptions, type LeadSourceOption } from '../lib/lead-sources';
import { listMembershipOptions, type MembershipOption } from '../lib/memberships';
import { listPipelines, listPipelineStages, type Pipeline, type PipelineStage } from '../lib/pipelines';

type RequestError = {
  status: number;
  message: string;
};

type DealFormState = {
  title: string;
  pipelineId: string;
  stageId: string;
  value: string;
  currency: string;
  expectedCloseAt: string;
  contactId: string;
  ownerId: string;
  leadSourceId: string;
};

type AttentionIndicator = {
  key: string;
  label: string;
  style: string;
};

type DealsView = 'board' | 'list';
type DealStatusFilter = 'ALL' | Deal['status'];
type DealAttentionFilter = 'ALL' | 'NEEDS_ATTENTION';
type BoardStatusFilter = DealStatusFilter;

type DealListFilters = {
  searchQuery: string;
  statusFilter: DealStatusFilter;
  stageFilter: string;
  attentionFilter: DealAttentionFilter;
};

const DEALS_PAGE_LIMIT = 50;
const DEAL_CONTACTS_LIMIT = 100;
const INITIAL_DEAL_FORM: DealFormState = {
  title: '',
  pipelineId: '',
  stageId: '',
  value: '',
  currency: 'USD',
  expectedCloseAt: '',
  contactId: '',
  ownerId: '',
  leadSourceId: '',
};

function toRequestError(error: unknown, fallback: string): RequestError {
  if (error && typeof error === 'object' && 'status' in error && 'message' in error) {
    const httpError = error as HttpError;

    return {
      status: httpError.status,
      message: httpError.message || fallback,
    };
  }

  return {
    status: 0,
    message: fallback,
  };
}

function getDefaultPipelineId(pipelines: Pipeline[]) {
  return pipelines.find((pipeline) => pipeline.isDefault)?.id ?? pipelines.find((pipeline) => !pipeline.archivedAt)?.id ?? pipelines[0]?.id ?? '';
}

function sortStages(stages: PipelineStage[]) {
  return [...stages].sort((first, second) => first.position - second.position);
}

function getOpenStages(stages: PipelineStage[]) {
  return sortStages(stages).filter((stage) => !stage.archivedAt && !stage.isClosedWon && !stage.isClosedLost);
}

function getContactName(contact: Deal['contact']) {
  if (!contact) {
    return null;
  }

  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email || 'Unnamed contact';
}

function getDealAttentionIndicators(deal: Deal): AttentionIndicator[] {
  if (deal.status !== 'OPEN') {
    return [];
  }

  const indicators: AttentionIndicator[] = [];

  if (!deal.contact) {
    indicators.push({
      key: 'no-contact',
      label: 'No contact',
      style: 'bg-amber-50 text-amber-700 border border-amber-200',
    });
  }

  const expectedCloseAt = typeof deal.expectedCloseAt === 'string' ? deal.expectedCloseAt.trim() : deal.expectedCloseAt;

  if (!expectedCloseAt) {
    indicators.push({
      key: 'no-date',
      label: 'No close date',
      style: 'bg-gray-100 text-gray-500 border border-gray-200',
    });
    return indicators;
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysLater = new Date(todayStart);
  sevenDaysLater.setDate(todayStart.getDate() + 7);

  const closeDateRaw = new Date(expectedCloseAt);
  if (Number.isNaN(closeDateRaw.getTime())) {
    indicators.push({
      key: 'no-date',
      label: 'No close date',
      style: 'bg-gray-100 text-gray-500 border border-gray-200',
    });
    return indicators;
  }

  const closeDate = new Date(closeDateRaw.getFullYear(), closeDateRaw.getMonth(), closeDateRaw.getDate());

  if (closeDate < todayStart) {
    indicators.push({
      key: 'date-passed',
      label: 'Close date passed',
      style: 'bg-red-50 text-red-700 border border-red-200',
    });
  } else if (closeDate >= todayStart && closeDate <= sevenDaysLater) {
    indicators.push({
      key: 'closing-soon',
      label: 'Closing soon',
      style: 'bg-amber-50 text-amber-700 border border-amber-200',
    });
  }

  return indicators;
}

function getContactOptionName(contact: Contact) {
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email || contact.phone || 'Unnamed contact';
}

function getMembershipName(membership: MembershipOption) {
  return [membership.user.firstName, membership.user.lastName].filter(Boolean).join(' ') || membership.user.email;
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString();
}

function formatDealValue(deal: Deal) {
  if (deal.value === null || deal.value === undefined || deal.value === '') {
    return null;
  }

  if (typeof deal.value !== 'string' && typeof deal.value !== 'number') {
    return null;
  }

  return `${deal.value} ${deal.currency}`;
}

function getDealStatusBadgeClass(status: Deal['status']) {
  if (status === 'WON') {
    return 'bg-green-50 text-green-700 border border-green-200';
  }

  if (status === 'LOST') {
    return 'bg-red-50 text-red-700 border border-red-200';
  }

  return 'bg-gray-100 text-gray-700 border border-gray-200';
}

function filterDealsForList(deals: Deal[], filters: DealListFilters) {
  const searchQuery = filters.searchQuery.trim().toLowerCase();

  return deals.filter((deal) => {
    if (filters.statusFilter !== 'ALL' && deal.status !== filters.statusFilter) {
      return false;
    }

    if (filters.stageFilter !== 'ALL' && deal.stageId !== filters.stageFilter) {
      return false;
    }

    if (filters.attentionFilter === 'NEEDS_ATTENTION' && getDealAttentionIndicators(deal).length === 0) {
      return false;
    }

    if (!searchQuery) {
      return true;
    }

    const searchableText = [
      deal.title,
      deal.contact?.firstName,
      deal.contact?.lastName,
      deal.contact?.email,
      deal.contact?.phone,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return searchableText.includes(searchQuery);
  });
}

function groupDealsByStage(deals: Deal[]) {
  return deals.reduce<Record<string, Deal[]>>((groups, deal) => {
    groups[deal.stageId] = groups[deal.stageId] ?? [];
    groups[deal.stageId].push(deal);
    return groups;
  }, {});
}

function getFirstStageId(stages: PipelineStage[]) {
  return getOpenStages(stages)[0]?.id ?? '';
}

function buildCreateDealInput(form: DealFormState): CreateDealInput {
  const input: CreateDealInput = {
    title: form.title.trim(),
    pipelineId: form.pipelineId,
    stageId: form.stageId,
  };

  const value = form.value.trim();
  const currency = form.currency.trim();
  const expectedCloseAt = form.expectedCloseAt.trim();

  if (value) {
    input.value = value;
  }

  if (currency) {
    input.currency = currency;
  }

  if (form.contactId) {
    input.contactId = form.contactId;
  }

  if (form.ownerId) {
    input.ownerId = form.ownerId;
  }

  if (form.leadSourceId) {
    input.leadSourceId = form.leadSourceId;
  }

  if (expectedCloseAt) {
    input.expectedCloseAt = expectedCloseAt;
  }

  return input;
}

export function PipelinesPage() {
  const { accessToken } = useAuth();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState('');
  const [pipelinesLoading, setPipelinesLoading] = useState(false);
  const [pipelinesError, setPipelinesError] = useState<RequestError | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [stagesLoading, setStagesLoading] = useState(false);
  const [stagesError, setStagesError] = useState<RequestError | null>(null);
  const [dealsData, setDealsData] = useState<DealsResponse | null>(null);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [dealsError, setDealsError] = useState<RequestError | null>(null);
  const [page, setPage] = useState(1);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [dealForm, setDealForm] = useState<DealFormState>(INITIAL_DEAL_FORM);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<RequestError | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [memberships, setMemberships] = useState<MembershipOption[]>([]);
  const [leadSources, setLeadSources] = useState<LeadSourceOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState<RequestError | null>(null);
  const [dealsRefreshKey, setDealsRefreshKey] = useState(0);
  const [lifecycleSuccess, setLifecycleSuccess] = useState<string | null>(null);
  const [dealsView, setDealsView] = useState<DealsView>('board');
  const [boardStatusFilter, setBoardStatusFilter] = useState<BoardStatusFilter>('OPEN');
  const [dealSearchQuery, setDealSearchQuery] = useState('');
  const [dealStatusFilter, setDealStatusFilter] = useState<DealStatusFilter>('ALL');
  const [dealStageFilter, setDealStageFilter] = useState('ALL');
  const [dealAttentionFilter, setDealAttentionFilter] = useState<DealAttentionFilter>('ALL');

  useEffect(() => {
    if (!accessToken) {
      setPipelines([]);
      setSelectedPipelineId('');
      setPipelinesLoading(false);
      setPipelinesError(null);
      return;
    }

    let active = true;
    const token = accessToken;

    async function fetchPipelines() {
      setPipelinesLoading(true);
      setPipelinesError(null);

      try {
        const response = await listPipelines(token);
        if (!active) {
          return;
        }

        setPipelines(response);
        setSelectedPipelineId((current) => (current && response.some((pipeline) => pipeline.id === current) ? current : getDefaultPipelineId(response)));
        setPage(1);
      } catch (requestError) {
        if (!active) {
          return;
        }

        setPipelines([]);
        setSelectedPipelineId('');
        setPipelinesError(toRequestError(requestError, 'Could not load pipelines.'));
      } finally {
        if (active) {
          setPipelinesLoading(false);
        }
      }
    }

    void fetchPipelines();

    return () => {
      active = false;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) {
      setContacts([]);
      setMemberships([]);
      setLeadSources([]);
      setOptionsLoading(false);
      setOptionsError(null);
      return;
    }

    let active = true;
    const token = accessToken;

    async function fetchOptions() {
      setOptionsLoading(true);
      setOptionsError(null);

      const [contactsResult, membershipsResult, leadSourcesResult] = await Promise.allSettled([
        listContacts(token, { page: 1, limit: DEAL_CONTACTS_LIMIT }),
        listMembershipOptions(token),
        listLeadSourceOptions(token),
      ]);

      if (!active) {
        return;
      }

      if (contactsResult.status === 'fulfilled') {
        setContacts(contactsResult.value.data);
      } else {
        setContacts([]);
      }

      if (membershipsResult.status === 'fulfilled') {
        setMemberships(membershipsResult.value);
      } else {
        setMemberships([]);
      }

      if (leadSourcesResult.status === 'fulfilled') {
        setLeadSources(leadSourcesResult.value);
      } else {
        setLeadSources([]);
      }

      if (contactsResult.status === 'rejected' || membershipsResult.status === 'rejected' || leadSourcesResult.status === 'rejected') {
        setOptionsError({
          status: 0,
          message: 'Some create deal options could not be loaded.',
        });
      }

      setOptionsLoading(false);
    }

    void fetchOptions();

    return () => {
      active = false;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !selectedPipelineId) {
      setStages([]);
      setStagesLoading(false);
      setStagesError(null);
      return;
    }

    let active = true;
    const token = accessToken;
    const pipelineId = selectedPipelineId;

    async function fetchStages() {
      setStagesLoading(true);
      setStagesError(null);

      try {
        const response = await listPipelineStages(token, pipelineId);
        if (!active) {
          return;
        }

        setStages(sortStages(response));
      } catch (requestError) {
        if (!active) {
          return;
        }

        setStages([]);
        setStagesError(toRequestError(requestError, 'Could not load pipeline stages.'));
      } finally {
        if (active) {
          setStagesLoading(false);
        }
      }
    }

    void fetchStages();

    return () => {
      active = false;
    };
  }, [accessToken, selectedPipelineId]);

  useEffect(() => {
    if (!accessToken || !selectedPipelineId) {
      setDealsData(null);
      setDealsLoading(false);
      setDealsError(null);
      return;
    }

    let active = true;
    const token = accessToken;
    const pipelineId = selectedPipelineId;

    async function fetchDeals() {
      setDealsLoading(true);
      setDealsError(null);

      try {
        const response = await listDeals(token, {
          pipelineId,
          page,
          limit: DEALS_PAGE_LIMIT,
        });
        if (!active) {
          return;
        }

        setDealsData(response);
      } catch (requestError) {
        if (!active) {
          return;
        }

        setDealsData(null);
        setDealsError(toRequestError(requestError, 'Could not load deals.'));
      } finally {
        if (active) {
          setDealsLoading(false);
        }
      }
    }

    void fetchDeals();

    return () => {
      active = false;
    };
  }, [accessToken, dealsRefreshKey, page, selectedPipelineId]);

  useEffect(() => {
    if (!selectedPipelineId) {
      setDealForm((current) => ({
        ...current,
        pipelineId: '',
        stageId: '',
      }));
      return;
    }

    setDealForm((current) => {
      const stageStillValid = current.stageId && getOpenStages(stages).some((stage) => stage.id === current.stageId);

      return {
        ...current,
        pipelineId: selectedPipelineId,
        stageId: stageStillValid ? current.stageId : getFirstStageId(stages),
      };
    });
  }, [selectedPipelineId, stages]);

  const handleCreatePipelineChange = (pipelineId: string) => {
    setSelectedPipelineId(pipelineId);
    setPage(1);
    setBoardStatusFilter('OPEN');
    setCreateError(null);
    setCreateSuccess(null);
    setLifecycleSuccess(null);
    setDealForm((current) => ({
      ...current,
      pipelineId,
      stageId: '',
    }));
  };

  const resetCreateForm = (pipelineId: string, availableStages: PipelineStage[]) => {
    setDealForm({
      ...INITIAL_DEAL_FORM,
      pipelineId,
      stageId: getFirstStageId(availableStages),
    });
  };

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken) {
      setCreateError({
        status: 401,
        message: 'You need to sign in before creating deals.',
      });
      return;
    }

    const title = dealForm.title.trim();
    if (!title) {
      setCreateError({
        status: 422,
        message: 'Deal title is required.',
      });
      return;
    }

    if (!dealForm.pipelineId) {
      setCreateError({
        status: 422,
        message: 'Pipeline is required.',
      });
      return;
    }

    if (!dealForm.stageId) {
      setCreateError({
        status: 422,
        message: 'This pipeline has no open stages available for new deals.',
      });
      return;
    }

    if (!getOpenStages(stages).some((stage) => stage.id === dealForm.stageId)) {
      setCreateError({
        status: 422,
        message: 'This pipeline has no open stages available for new deals.',
      });
      return;
    }

    const input = buildCreateDealInput({
      ...dealForm,
      title,
    });

    setCreateLoading(true);
    setCreateError(null);
    setCreateSuccess(null);
    setLifecycleSuccess(null);

    try {
      const created = await createDeal(accessToken, input);
      setSelectedPipelineId(created.pipelineId);
      setPage(1);
      resetCreateForm(created.pipelineId, stages);
      setCreateSuccess('Deal created.');
      setDealsRefreshKey((current) => current + 1);
    } catch (requestError) {
      setCreateError(toRequestError(requestError, 'Could not create deal.'));
    } finally {
      setCreateLoading(false);
    }
  };

  const refreshDeals = () => {
    setDealsRefreshKey((current) => current + 1);
  };

  const handleMoveDeal = async (deal: Deal, stageId: string) => {
    if (!accessToken) {
      throw {
        status: 401,
        message: 'You need to sign in before updating deal lifecycle.',
      } satisfies HttpError;
    }

    await moveDeal(accessToken, deal.id, stageId);
    setLifecycleSuccess('Deal moved.');
    refreshDeals();
  };

  const handleMarkDealWon = async (deal: Deal) => {
    if (!accessToken) {
      throw {
        status: 401,
        message: 'You need to sign in before updating deal lifecycle.',
      } satisfies HttpError;
    }

    await markDealWon(accessToken, deal.id);
    setLifecycleSuccess('Deal marked won.');
    refreshDeals();
  };

  const handleMarkDealLost = async (deal: Deal) => {
    if (!accessToken) {
      throw {
        status: 401,
        message: 'You need to sign in before updating deal lifecycle.',
      } satisfies HttpError;
    }

    await markDealLost(accessToken, deal.id);
    setLifecycleSuccess('Deal marked lost.');
    refreshDeals();
  };

  const handleReopenDeal = async (deal: Deal) => {
    if (!accessToken) {
      throw {
        status: 401,
        message: 'You need to sign in before updating deal lifecycle.',
      } satisfies HttpError;
    }

    await reopenDeal(accessToken, deal.id);
    setLifecycleSuccess('Deal reopened.');
    refreshDeals();
  };

  const selectedPipeline = pipelines.find((pipeline) => pipeline.id === selectedPipelineId) ?? null;
  const deals = dealsData?.data ?? [];
  const boardDeals = useMemo(
    () => deals.filter((deal) => boardStatusFilter === 'ALL' || deal.status === boardStatusFilter),
    [boardStatusFilter, deals]
  );
  const dealsByStage = useMemo(() => groupDealsByStage(boardDeals), [boardDeals]);
  const openStages = useMemo(() => getOpenStages(stages), [stages]);
  const sortedStages = useMemo(() => sortStages(stages), [stages]);
  const stageIds = useMemo(() => new Set(stages.map((stage) => stage.id)), [stages]);
  const unknownStageDeals = boardDeals.filter((deal) => !stageIds.has(deal.stageId));
  const filteredDeals = useMemo(
    () =>
      filterDealsForList(deals, {
        searchQuery: dealSearchQuery,
        statusFilter: dealStatusFilter,
        stageFilter: dealStageFilter,
        attentionFilter: dealAttentionFilter,
      }),
    [dealAttentionFilter, dealSearchQuery, dealStageFilter, dealStatusFilter, deals]
  );
  const hasActiveListFilters =
    dealSearchQuery.trim() !== '' || dealStatusFilter !== 'ALL' || dealStageFilter !== 'ALL' || dealAttentionFilter !== 'ALL';
  const currentPage = dealsData?.page ?? page;
  const currentLimit = dealsData?.limit ?? DEALS_PAGE_LIMIT;
  const totalDeals = dealsData?.total ?? deals.length;
  const totalPages = Math.max(1, Math.ceil(totalDeals / currentLimit));
  const hasPreviousPage = currentPage > 1;
  const hasNextPage = currentPage * currentLimit < totalDeals;

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Pipelines and Deals</h1>
            <p className="mt-1 text-sm text-gray-600">Pipeline view</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {!pipelinesLoading && !pipelinesError && pipelines.length > 0 ? (
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                Pipeline
                <select
                  value={selectedPipelineId}
                  onChange={(event) => handleCreatePipelineChange(event.target.value)}
                  className="w-full min-w-48 rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 sm:w-56"
                >
                  {pipelines.map((pipeline) => (
                    <option key={pipeline.id} value={pipeline.id}>
                      {pipeline.name}
                      {pipeline.isDefault ? ' (Default)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {pipelines.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm((current) => !current);
                  setCreateError(null);
                  setCreateSuccess(null);
                  setLifecycleSuccess(null);
                }}
                className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              >
                {showCreateForm ? 'Close Create Deal' : 'Create Deal'}
              </button>
            ) : null}
          </div>
        </div>

        {pipelinesLoading ? <p className="rounded border border-gray-200 bg-white p-5 text-sm text-gray-700">Loading pipelines...</p> : null}

        {!pipelinesLoading && pipelinesError ? (
          <div className="rounded border border-red-200 bg-white p-5">
            <h2 className="text-base font-semibold text-red-900">Could not load pipelines</h2>
            <p className="mt-2 text-sm text-red-700">{pipelinesError.message}</p>
          </div>
        ) : null}

        {!pipelinesLoading && !pipelinesError && pipelines.length === 0 ? (
          <div className="rounded border border-gray-200 bg-white p-8 text-center">
            <h2 className="text-base font-semibold text-gray-900">No pipelines found</h2>
            <p className="mt-2 text-sm text-gray-600">Pipelines will appear here after they are available in the backend.</p>
          </div>
        ) : null}

        {!pipelinesLoading && !pipelinesError && pipelines.length > 0 ? (
          <>
            {showCreateForm ? (
              <section className="rounded border border-gray-200 bg-white p-5">
                <h2 className="text-base font-semibold text-gray-900">Create deal</h2>
                {optionsError ? <p className="mt-3 rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">{optionsError.message}</p> : null}
                {createSuccess ? <p className="mt-3 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">{createSuccess}</p> : null}
                {!stagesLoading && openStages.length === 0 ? (
                  <p className="mt-3 rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                    This pipeline has no open stages available for new deals.
                  </p>
                ) : null}
                <form className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" onSubmit={handleCreateSubmit}>
                  <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                    Title
                    <input
                      value={dealForm.title}
                      onChange={(event) => setDealForm((current) => ({ ...current, title: event.target.value }))}
                      className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                      required
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                    Pipeline
                    <select
                      value={dealForm.pipelineId}
                      onChange={(event) => handleCreatePipelineChange(event.target.value)}
                      className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                      required
                    >
                      <option value="">Select pipeline</option>
                      {pipelines.map((pipeline) => (
                        <option key={pipeline.id} value={pipeline.id}>
                          {pipeline.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                    Stage
                    <select
                      value={dealForm.stageId}
                      onChange={(event) => setDealForm((current) => ({ ...current, stageId: event.target.value }))}
                      disabled={stagesLoading || openStages.length === 0}
                      className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                      required
                    >
                      <option value="">Select stage</option>
                      {openStages.map((stage) => (
                        <option key={stage.id} value={stage.id}>
                          {stage.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                    Value
                    <input
                      value={dealForm.value}
                      onChange={(event) => setDealForm((current) => ({ ...current, value: event.target.value }))}
                      className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                      inputMode="decimal"
                      placeholder="Optional"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                    Currency
                    <input
                      value={dealForm.currency}
                      onChange={(event) => setDealForm((current) => ({ ...current, currency: event.target.value.toUpperCase().slice(0, 3) }))}
                      className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                      maxLength={3}
                      placeholder="USD"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                    Expected close date
                    <input
                      type="date"
                      value={dealForm.expectedCloseAt}
                      onChange={(event) => setDealForm((current) => ({ ...current, expectedCloseAt: event.target.value }))}
                      className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                    Contact
                    <select
                      value={dealForm.contactId}
                      onChange={(event) => setDealForm((current) => ({ ...current, contactId: event.target.value }))}
                      disabled={optionsLoading || contacts.length === 0}
                      className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                    >
                      <option value="">No contact</option>
                      {contacts.map((contact) => (
                        <option key={contact.id} value={contact.id}>
                          {getContactOptionName(contact)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                    Owner
                    <select
                      value={dealForm.ownerId}
                      onChange={(event) => setDealForm((current) => ({ ...current, ownerId: event.target.value }))}
                      disabled={optionsLoading || memberships.length === 0}
                      className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                    >
                      <option value="">No owner</option>
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
                      value={dealForm.leadSourceId}
                      onChange={(event) => setDealForm((current) => ({ ...current, leadSourceId: event.target.value }))}
                      disabled={optionsLoading || leadSources.length === 0}
                      className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                    >
                      <option value="">No lead source</option>
                      {leadSources.map((leadSource) => (
                        <option key={leadSource.id} value={leadSource.id}>
                          {leadSource.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="sm:col-span-2 xl:col-span-3">
                    {createError ? <p className="mb-3 text-sm text-red-700">{createError.message}</p> : null}
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="submit"
                        disabled={createLoading || stagesLoading || openStages.length === 0}
                        className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
                      >
                        {createLoading ? 'Creating...' : 'Create deal'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          resetCreateForm(selectedPipelineId, stages);
                          setCreateError(null);
                          setCreateSuccess(null);
                        }}
                        disabled={createLoading}
                        className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                </form>
              </section>
            ) : null}

            <section className="rounded border border-gray-200 bg-white p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">{selectedPipeline?.name ?? 'Selected pipeline'}</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    {totalDeals === 1 ? '1 deal' : `${totalDeals} deals`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex rounded border border-gray-300 bg-white p-0.5">
                    <button
                      type="button"
                      onClick={() => setDealsView('board')}
                      className={`rounded px-3 py-1 text-xs font-medium ${
                        dealsView === 'board' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      Board
                    </button>
                    <button
                      type="button"
                      onClick={() => setDealsView('list')}
                      className={`rounded px-3 py-1 text-xs font-medium ${
                        dealsView === 'list' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      List
                    </button>
                  </div>
                  <p className="text-sm text-gray-500">
                    Page {currentPage} of {totalPages}
                  </p>
                </div>
              </div>

              {stagesLoading ? <p className="mt-4 rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">Loading stages...</p> : null}
              {dealsLoading ? <p className="mt-4 rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">Loading deals...</p> : null}

              {stagesError ? <p className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{stagesError.message}</p> : null}
              {dealsError ? <p className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{dealsError.message}</p> : null}
              {lifecycleSuccess ? <p className="mt-4 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">{lifecycleSuccess}</p> : null}

              {!stagesLoading && !stagesError && stages.length === 0 ? (
                <p className="mt-4 rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">This pipeline has no stages.</p>
              ) : null}

              {!stagesLoading && !stagesError && stages.length > 0 && dealsView === 'board' ? (
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Board status</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Showing {boardDeals.length} loaded {boardDeals.length === 1 ? 'deal' : 'deals'} on the board.
                    </p>
                  </div>
                  <div className="inline-flex rounded border border-gray-300 bg-white p-0.5">
                    {[
                      { label: 'Open', value: 'OPEN' },
                      { label: 'Won', value: 'WON' },
                      { label: 'Lost', value: 'LOST' },
                      { label: 'All', value: 'ALL' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setBoardStatusFilter(option.value as BoardStatusFilter)}
                        className={`rounded px-3 py-1 text-xs font-medium ${
                          boardStatusFilter === option.value ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {!stagesLoading && !stagesError && stages.length > 0 && dealsView === 'board' ? (
                <div className="mt-4 overflow-x-auto pb-2">
                  <div className="flex min-w-max gap-4">
                    {sortedStages.map((stage) => (
                      <StageColumn
                        key={stage.id}
                        stage={stage}
                        deals={dealsByStage[stage.id] ?? []}
                        openStages={openStages}
                        onMoveDeal={handleMoveDeal}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {!dealsLoading && !dealsError && dealsView === 'list' ? (
                <>
                  <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-1 flex-wrap gap-3">
                      <input
                        value={dealSearchQuery}
                        onChange={(event) => setDealSearchQuery(event.target.value)}
                        className="min-w-60 flex-1 rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                        placeholder="Search deals or contacts..."
                      />
                      <select
                        value={dealStatusFilter}
                        onChange={(event) => setDealStatusFilter(event.target.value as DealStatusFilter)}
                        className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                      >
                        <option value="ALL">All statuses</option>
                        <option value="OPEN">Open</option>
                        <option value="WON">Won</option>
                        <option value="LOST">Lost</option>
                      </select>
                      <select
                        value={dealStageFilter}
                        onChange={(event) => setDealStageFilter(event.target.value)}
                        className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                      >
                        <option value="ALL">All stages</option>
                        {sortedStages.map((stage) => (
                          <option key={stage.id} value={stage.id}>
                            {stage.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={dealAttentionFilter}
                        onChange={(event) => setDealAttentionFilter(event.target.value as DealAttentionFilter)}
                        className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                      >
                        <option value="ALL">All deals</option>
                        <option value="NEEDS_ATTENTION">Needs attention</option>
                      </select>
                    </div>
                    <p className="text-sm text-gray-500">
                      {hasActiveListFilters
                        ? `Showing ${filteredDeals.length} of ${deals.length} loaded deals`
                        : `Showing ${deals.length} loaded ${deals.length === 1 ? 'deal' : 'deals'}`}
                    </p>
                  </div>
                  <DealsListView
                    deals={filteredDeals}
                    loadedDealsCount={deals.length}
                    onMarkWon={handleMarkDealWon}
                    onMarkLost={handleMarkDealLost}
                    onReopen={handleReopenDeal}
                  />
                </>
              ) : null}

              {!dealsLoading && !dealsError && dealsView === 'board' && unknownStageDeals.length > 0 ? (
                <div className="mt-5 rounded border border-yellow-200 bg-yellow-50 p-4">
                  <h3 className="text-sm font-semibold text-yellow-900">Unassigned / Unknown stage</h3>
                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {unknownStageDeals.map((deal) => (
                      <DealCard
                        key={deal.id}
                        deal={deal}
                        openStages={openStages}
                        onMoveDeal={handleMoveDeal}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {dealsData && dealsView === 'board' && totalDeals === 0 ? (
                <p className="mt-4 rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">No deals found for this pipeline.</p>
              ) : null}

              {dealsData && totalDeals > currentLimit ? (
                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={!hasPreviousPage || dealsLoading}
                    className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((current) => current + 1)}
                    disabled={!hasNextPage || dealsLoading}
                    className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </section>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

type StageColumnProps = {
  stage: PipelineStage;
  deals: Deal[];
  openStages: PipelineStage[];
  onMoveDeal: (deal: Deal, stageId: string) => Promise<void>;
};

function StageColumn({ stage, deals, openStages, onMoveDeal }: StageColumnProps) {
  return (
    <div className="w-72 shrink-0 rounded border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{stage.name}</h3>
        </div>
        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-600">
          {deals.length}
        </span>
      </div>
      {stage.archivedAt ? <p className="mt-2 text-xs text-yellow-700">Archived stage</p> : null}
      {deals.length > 0 ? (
        <div className="mt-3 space-y-3">
          {deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              openStages={openStages}
              onMoveDeal={onMoveDeal}
            />
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded border border-dashed border-gray-200 bg-white px-3 py-2 text-center text-xs text-gray-400">Empty</p>
      )}
    </div>
  );
}

type DealCardProps = {
  deal: Deal;
  openStages: PipelineStage[];
  onMoveDeal: (deal: Deal, stageId: string) => Promise<void>;
};

function getLifecycleError(error: unknown) {
  const requestError = toRequestError(error, 'Could not update deal lifecycle.');

  if (requestError.status === 403) {
    return 'You do not have permission to update deal lifecycle.';
  }

  return requestError.message;
}

type DealsListViewProps = {
  deals: Deal[];
  loadedDealsCount: number;
  onMarkWon: (deal: Deal) => Promise<void>;
  onMarkLost: (deal: Deal) => Promise<void>;
  onReopen: (deal: Deal) => Promise<void>;
};

function DealsListView({ deals, loadedDealsCount, onMarkWon, onMarkLost, onReopen }: DealsListViewProps) {
  if (deals.length === 0) {
    return (
      <p className="mt-4 rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        {loadedDealsCount > 0 ? 'No deals match your filters.' : 'No deals found for this pipeline.'}
      </p>
    );
  }

  return (
    <div className="mt-5 overflow-x-auto rounded border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">
              Deal / Contact
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Stage / Status
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Value
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Close
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Attention
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {deals.map((deal) => (
            <DealListRow key={deal.id} deal={deal} onMarkWon={onMarkWon} onMarkLost={onMarkLost} onReopen={onReopen} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

type DealListRowProps = {
  deal: Deal;
  onMarkWon: (deal: Deal) => Promise<void>;
  onMarkLost: (deal: Deal) => Promise<void>;
  onReopen: (deal: Deal) => Promise<void>;
};

function DealListRow({ deal, onMarkWon, onMarkLost, onReopen }: DealListRowProps) {
  const value = formatDealValue(deal);
  const expectedCloseAt = formatDate(deal.expectedCloseAt);
  const contactName = getContactName(deal.contact);
  const attentionIndicators = getDealAttentionIndicators(deal);
  const [lifecycleLoading, setLifecycleLoading] = useState(false);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);

  const runLifecycleAction = async (action: () => Promise<void>) => {
    setLifecycleLoading(true);
    setLifecycleError(null);

    try {
      await action();
    } catch (requestError) {
      setLifecycleError(getLifecycleError(requestError));
    } finally {
      setLifecycleLoading(false);
    }
  };

  return (
    <tr className="align-top hover:bg-gray-50">
      <td className="min-w-64 px-4 py-3">
        <div className="space-y-1">
          <Link className="font-medium text-gray-900 underline decoration-gray-300 underline-offset-2 hover:text-gray-700" to={`/deals/${deal.id}`}>
            {deal.title}
          </Link>
          {deal.contact?.id ? (
            <div className="space-y-0.5 text-xs">
              <Link className="font-medium text-gray-700 underline decoration-gray-300 underline-offset-2 hover:text-gray-900" to={`/contacts/${deal.contact.id}`}>
                {contactName}
              </Link>
              {deal.contact.email ? <p className="text-gray-500">{deal.contact.email}</p> : null}
            </div>
          ) : (
            <p className="text-xs text-gray-500">No contact</p>
          )}
        </div>
      </td>
      <td className="min-w-36 px-4 py-3">
        <div className="space-y-1">
          <p className="text-gray-700">{deal.stage?.name ?? 'Unknown stage'}</p>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getDealStatusBadgeClass(deal.status)}`}>{deal.status}</span>
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-700">{value ?? <>&mdash;</>}</td>
      <td className="whitespace-nowrap px-4 py-3 text-gray-600">{expectedCloseAt ?? 'Not set'}</td>
      <td className="min-w-40 px-4 py-3">
        {attentionIndicators.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {attentionIndicators.map((indicator) => (
              <span key={indicator.key} className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${indicator.style}`}>
                {indicator.label}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-gray-400">&mdash;</span>
        )}
      </td>
      <td className="min-w-48 px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {deal.status === 'OPEN' ? (
            <>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Mark this deal as won?')) {
                    void runLifecycleAction(() => onMarkWon(deal));
                  }
                }}
                disabled={lifecycleLoading}
                className="rounded bg-green-700 px-2 py-1 text-xs font-medium text-white hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                Mark won
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Mark this deal as lost?')) {
                    void runLifecycleAction(() => onMarkLost(deal));
                  }
                }}
                disabled={lifecycleLoading}
                className="rounded bg-red-700 px-2 py-1 text-xs font-medium text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                Mark lost
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Reopen this deal?')) {
                  void runLifecycleAction(() => onReopen(deal));
                }
              }}
              disabled={lifecycleLoading}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
            >
              Reopen
            </button>
          )}
        </div>
        {lifecycleError ? <p className="mt-2 text-xs text-red-700">{lifecycleError}</p> : null}
      </td>
    </tr>
  );
}

function DealCard({ deal, openStages, onMoveDeal }: DealCardProps) {
  const value = formatDealValue(deal);
  const expectedCloseAt = formatDate(deal.expectedCloseAt);
  const contactName = getContactName(deal.contact);
  const attentionIndicators = getDealAttentionIndicators(deal);
  const canMoveStage = deal.status === 'OPEN';
  const currentStageInList = openStages.some((stage) => stage.id === deal.stageId);

  return (
    <div className="rounded border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="break-words text-sm font-semibold text-gray-900">
            <Link className="underline decoration-gray-300 underline-offset-2 hover:text-gray-700" to={`/deals/${deal.id}`}>
              {deal.title}
            </Link>
          </h4>
          <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getDealStatusBadgeClass(deal.status)}`}>{deal.status}</span>
        </div>
        {value ? <span className="shrink-0 text-right text-sm font-semibold text-gray-900">{value}</span> : null}
      </div>
      <div className="mt-3 space-y-1 text-xs text-gray-500">
        <p className="break-words">
          {deal.contact?.id ? (
            <Link className="font-medium text-gray-700 underline decoration-gray-300 underline-offset-2 hover:text-gray-900" to={`/contacts/${deal.contact.id}`}>
              {contactName}
            </Link>
          ) : (
            <span className="font-medium text-gray-700">{contactName ?? 'No contact'}</span>
          )}
          {expectedCloseAt ? <span> | Close {expectedCloseAt}</span> : null}
        </p>
      </div>
      {attentionIndicators.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {attentionIndicators.map((indicator) => (
            <span key={indicator.key} className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${indicator.style}`}>
              {indicator.label}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-3 border-t border-gray-100 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          {canMoveStage ? (
            <select
              aria-label="Move stage"
              value={deal.stageId}
              onChange={(event) => {
                const stageId = event.target.value;
                if (!stageId || stageId === deal.stageId) {
                  return;
                }

                void onMoveDeal(deal, stageId);
              }}
              disabled={openStages.length === 0}
              className="w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
            >
              {!currentStageInList ? (
                <option value={deal.stageId}>{deal.stage?.name ?? 'Current stage'}</option>
              ) : null}
              {openStages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          ) : null}
          <Link
            className="inline-flex w-full justify-center rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            to={`/deals/${deal.id}`}
          >
            View deal -&gt;
          </Link>
        </div>
      </div>
    </div>
  );
}
