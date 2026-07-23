import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core';
import {
  Ban,
  Bookmark,
  CalendarDays,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock3,
  Flame,
  ListFilter,
  Phone,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Snowflake,
  Trophy,
  User,
  UserPlus,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { ChangeDocumentationDialog, type ChangeDocumentationResult } from '../components/activities/ChangeDocumentationDialog';
import { AddLeadModal } from '../components/leads/AddLeadModal';
import { AppShell } from '../components/layout/AppShell';
import { useAuth } from '../context/AuthContext';
import { useLeads } from '../hooks/useLeads';
import { buildChangeSummaryItems } from '../lib/activity-formatting';
import { shouldRequestChangeDocumentation } from '../lib/change-documentation-settings';
import { listLeadSourceOptions, type LeadSourceOption } from '../lib/lead-sources';
import {
  buildLeadMutationContext,
  convertLead as convertLeadRequest,
  markLeadLost as markLeadLostRequest,
  previewLeadConvert,
  previewLeadLost,
  previewLeadReopen,
  previewLeadUpdate,
  reopenLead as reopenLeadRequest,
  type LeadActivityPreview,
  type LeadMutationContext,
} from '../lib/leads';
import type {
  CreateLeadInput,
  Lead,
  LeadFilters,
  LeadStage,
  LeadStatus,
  LeadTemperature,
  UpdateLeadInput,
} from '../lib/leads';
import { listMembershipOptions, type MembershipOption } from '../lib/memberships';
import {
  createTask,
  getNextFollowUpTask,
  listTasks,
  type CreateTaskInput,
  type Task,
} from '../lib/tasks';
import { TaskDetailModal } from '../components/tasks/TaskDetailModal';

const PAGE_LIMIT = 20;
const VIEW_PREFERENCE_KEY = 'alozix.leads.view';
const ACTIVE_STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'FOLLOW_UP_NEEDED', 'QUALIFIED'];
const TERMINAL_STATUSES: LeadStatus[] = ['WON', 'LOST'];
const ACTIVE_STAGE_FILTERS: LeadStage[] = ['NEW', 'CONTACTED', 'QUALIFIED'];
const STAGE_FILTER_OPTIONS: Array<{ label: string; value: LeadStage; icon: LucideIcon }> = [
  { label: 'New', value: 'NEW', icon: UserPlus },
  { label: 'Contacted', value: 'CONTACTED', icon: Phone },
  { label: 'Qualified', value: 'QUALIFIED', icon: Bookmark },
  { label: 'Won', value: 'WON', icon: Trophy },
  { label: 'Lost', value: 'LOST', icon: CircleX },
];
type FollowUpFilter = 'ANY' | 'WAITING' | 'OVERDUE' | 'NO_FOLLOW_UP';
type QuickPreset = 'ACTIVE' | 'MY' | 'NO_FOLLOW_UP' | 'OVERDUE' | 'CUSTOM';
const FOLLOW_UP_FILTER_OPTIONS: Array<{ label: string; value: FollowUpFilter; icon: LucideIcon }> = [
  { label: 'Any', value: 'ANY', icon: CalendarDays },
  { label: 'Waiting', value: 'WAITING', icon: Clock3 },
  { label: 'Overdue', value: 'OVERDUE', icon: CircleAlert },
  { label: 'No follow-up', value: 'NO_FOLLOW_UP', icon: Ban },
];
const TEMPERATURE_FILTER_OPTIONS: Array<{ label: string; value: LeadTemperature; icon: LucideIcon }> = [
  { label: 'Hot', value: 'HOT', icon: Flame },
  { label: 'Warm', value: 'WARM', icon: Flame },
  { label: 'Cold', value: 'COLD', icon: Snowflake },
];
const QUICK_PRESETS: Array<{ label: string; value: QuickPreset; icon: LucideIcon }> = [
  { label: 'Active leads', value: 'ACTIVE', icon: Users },
  { label: 'My leads', value: 'MY', icon: User },
  { label: 'No follow-up', value: 'NO_FOLLOW_UP', icon: Ban },
  { label: 'Overdue follow-ups', value: 'OVERDUE', icon: CircleAlert },
  { label: 'Custom', value: 'CUSTOM', icon: SlidersHorizontal },
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
type LeadDocumentationRequest = {
  mode: 'optional-comment' | 'required-reason';
  title: string;
  description: string;
  subjectLabel: string;
  changes: ReturnType<typeof buildChangeSummaryItems>;
  confirmLabel?: string;
  onConfirm: (result: ChangeDocumentationResult) => Promise<void>;
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

function hasTerminalStage(stages: LeadStage[]) {
  return stages.includes('WON') || stages.includes('LOST');
}

function arraysEqual<T extends string>(left: T[], right: T[]) {
  return left.length === right.length && left.every((item) => right.includes(item));
}

function temperatureSelectedClass(temperature: LeadTemperature, selected: boolean) {
  if (!selected) return 'border-gray-200 bg-white text-gray-800 hover:border-gray-300 hover:bg-gray-50';
  if (temperature === 'HOT') return 'border-red-300 bg-red-50 text-red-700';
  if (temperature === 'WARM') return 'border-amber-300 bg-amber-50 text-amber-700';
  return 'border-blue-300 bg-blue-50 text-blue-700';
}

function stageSelectedClass(selected: boolean) {
  return selected
    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
    : 'border-gray-200 bg-white text-gray-800 hover:border-gray-300 hover:bg-gray-50';
}

function followUpSelectedClass(value: FollowUpFilter, selected: boolean) {
  if (!selected) return 'border-gray-200 bg-white text-gray-800 hover:border-gray-300 hover:bg-gray-50';
  if (value === 'OVERDUE') return 'border-red-300 bg-red-50 text-red-700';
  if (value === 'WAITING') return 'border-amber-300 bg-amber-50 text-amber-700';
  return 'border-emerald-300 bg-emerald-50 text-emerald-800';
}

function selectedPillClass(kind: 'neutral' | 'danger' | 'warm' = 'neutral') {
  if (kind === 'danger') return 'bg-red-50 text-red-700';
  if (kind === 'warm') return 'bg-amber-50 text-amber-700';
  return 'bg-emerald-50 text-emerald-800';
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
  const { accessToken, user } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selectedStages, setSelectedStages] = useState<LeadStage[]>(ACTIVE_STAGE_FILTERS);
  const [followUpFilter, setFollowUpFilter] = useState<FollowUpFilter>('ANY');
  const [selectedTemperatures, setSelectedTemperatures] = useState<LeadTemperature[]>([]);
  const [activePreset, setActivePreset] = useState<QuickPreset>('ACTIVE');
  const [openFilterMenu, setOpenFilterMenu] = useState<'stage' | 'followUp' | 'temperature' | 'preset' | null>(null);
  const [ownerId, setOwnerId] = useState('');
  const [page, setPage] = useState(1);
  const [viewPreference, setViewPreference] = useState<ViewMode>(() => storedViewPreference());
  const [memberships, setMemberships] = useState<MembershipOption[]>([]);
  const [leadSources, setLeadSources] = useState<LeadSourceOption[]>([]);
  const [leadTasks, setLeadTasks] = useState<Task[]>([]);
  const [followUpLead, setFollowUpLead] = useState<Lead | null>(null);
  const [followUpTask, setFollowUpTask] = useState<Task | null>(null);
  const [createFollowUpOpen, setCreateFollowUpOpen] = useState(false);
  const [pendingUpdates, setPendingUpdates] = useState<Record<string, PendingField>>({});
  const [updateErrors, setUpdateErrors] = useState<Record<string, string>>({});
  const [documentationRequest, setDocumentationRequest] = useState<LeadDocumentationRequest | null>(null);
  const [documentationSubmitting, setDocumentationSubmitting] = useState(false);
  const [documentationError, setDocumentationError] = useState<string | null>(null);

  const actualView: ViewMode = hasTerminalStage(selectedStages) ? 'table' : viewPreference;

  const filters = useMemo<LeadFilters>(() => ({
    page: 1,
    limit: 500,
    search,
    ownerId: ownerId || undefined,
    includeAll: true,
  }), [ownerId, search]);

  const {
    leads,
    loading,
    error,
    refetch,
    createLead,
    updateLead,
    createLoading,
    createError,
  } = useLeads(accessToken, filters);

  const refreshLeadTasks = useCallback(async () => {
    if (!accessToken) {
      setLeadTasks([]);
      return;
    }

    const response = await listTasks(accessToken, { entityType: 'LEAD', page: 1, limit: 500 });
    setLeadTasks(response.data);
  }, [accessToken]);

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

  useEffect(() => {
    void refreshLeadTasks();
  }, [refreshLeadTasks]);

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      if (selectedStages.length > 0 && !selectedStages.includes(lead.stage)) return false;
      if (selectedTemperatures.length > 0 && (!lead.temperature || !selectedTemperatures.includes(lead.temperature))) return false;

      const followUpTask = getNextFollowUpTask(lead.id, leadTasks);
      const overdue = isOverdue(followUpTask?.dueAt ?? null);
      if (followUpFilter === 'WAITING' && (!followUpTask || overdue)) return false;
      if (followUpFilter === 'OVERDUE' && (!followUpTask || !overdue)) return false;
      if (followUpFilter === 'NO_FOLLOW_UP' && followUpTask) return false;

      return true;
    });
  }, [followUpFilter, leadTasks, leads, selectedStages, selectedTemperatures]);

  const total = filteredLeads.length;
  const currentPage = actualView === 'kanban' ? 1 : page;
  const limit = actualView === 'kanban' ? Math.max(filteredLeads.length, 1) : PAGE_LIMIT;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const visibleLeads = actualView === 'kanban'
    ? filteredLeads
    : filteredLeads.slice((currentPage - 1) * PAGE_LIMIT, currentPage * PAGE_LIMIT);
  const ownerFilterLabel = memberships.find((membership) => membership.userId === ownerId);
  const hasActiveFilterSelections = search
    || ownerId
    || followUpFilter !== 'ANY'
    || selectedTemperatures.length > 0
    || !arraysEqual(selectedStages, ACTIVE_STAGE_FILTERS);
  const activePresetLabel = filterLabel(QUICK_PRESETS, activePreset);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setActivePreset('CUSTOM');
    setPage(1);
  }

  function resetFilters() {
    setSearchInput('');
    setSearch('');
    setSelectedStages(ACTIVE_STAGE_FILTERS);
    setFollowUpFilter('ANY');
    setSelectedTemperatures([]);
    setActivePreset('ACTIVE');
    setOwnerId('');
    setPage(1);
  }

  function markCustom() {
    setActivePreset('CUSTOM');
    setPage(1);
  }

  function toggleStage(stage: LeadStage) {
    setSelectedStages((current) => current.includes(stage) ? current.filter((item) => item !== stage) : [...current, stage]);
    markCustom();
  }

  function toggleTemperature(temperature: LeadTemperature) {
    setSelectedTemperatures((current) => current.includes(temperature) ? current.filter((item) => item !== temperature) : [...current, temperature]);
    markCustom();
  }

  function selectFollowUpFilter(value: FollowUpFilter) {
    setFollowUpFilter(value);
    setOpenFilterMenu(null);
    markCustom();
  }

  function applyPreset(preset: QuickPreset) {
    setActivePreset(preset);
    setOpenFilterMenu(null);
    setPage(1);

    if (preset === 'ACTIVE') {
      setSelectedStages(ACTIVE_STAGE_FILTERS);
      setFollowUpFilter('ANY');
      setSelectedTemperatures([]);
      setOwnerId('');
      return;
    }

    if (preset === 'MY') {
      setSelectedStages(ACTIVE_STAGE_FILTERS);
      setFollowUpFilter('ANY');
      setSelectedTemperatures([]);
      setOwnerId(user?.id ?? memberships[0]?.userId ?? '');
      return;
    }

    if (preset === 'NO_FOLLOW_UP') {
      setSelectedStages(ACTIVE_STAGE_FILTERS);
      setFollowUpFilter('NO_FOLLOW_UP');
      setSelectedTemperatures([]);
      return;
    }

    if (preset === 'OVERDUE') {
      setSelectedStages(ACTIVE_STAGE_FILTERS);
      setFollowUpFilter('OVERDUE');
      setSelectedTemperatures([]);
      return;
    }
  }

  function removeSelectedFilter(kind: 'stage' | 'followUp' | 'temperature' | 'owner' | 'search', value?: string) {
    if (kind === 'stage') setSelectedStages((current) => current.filter((item) => item !== value));
    if (kind === 'followUp') setFollowUpFilter('ANY');
    if (kind === 'temperature') setSelectedTemperatures((current) => current.filter((item) => item !== value));
    if (kind === 'owner') setOwnerId('');
    if (kind === 'search') {
      setSearch('');
      setSearchInput('');
    }
    markCustom();
  }

  function changeView(nextView: ViewMode) {
    setViewPreference(nextView);
    setPage(1);
    window.localStorage.setItem(VIEW_PREFERENCE_KEY, nextView);
  }

  async function handleCreate(input: CreateLeadInput) {
    return Boolean(await createLead(input, buildLeadMutationContext(user, 'table')));
  }

  function openFollowUp(lead: Lead) {
    const task = getNextFollowUpTask(lead.id, leadTasks);
    setFollowUpLead(lead);
    setFollowUpTask(task);
    setCreateFollowUpOpen(!task);
  }

  function closeFollowUpModal() {
    setFollowUpLead(null);
    setFollowUpTask(null);
    setCreateFollowUpOpen(false);
  }

  async function handleCreateFollowUp(input: CreateTaskInput) {
    if (!accessToken) return false;
    await createTask(accessToken, input);
    await refreshLeadTasks();
    await refetch();
    closeFollowUpModal();
    return true;
  }

  function shouldPromptForPreview(preview: LeadActivityPreview) {
    return preview.requiresReason || preview.documentationActions.some((action) => shouldRequestChangeDocumentation(action));
  }

  function mutationErrorMessage(requestError: unknown) {
    return requestError && typeof requestError === 'object' && 'message' in requestError
      ? String((requestError as { message?: unknown }).message)
      : 'Could not update lead. Please try again.';
  }

  function openDocumentationDialog(request: LeadDocumentationRequest) {
    setDocumentationError(null);
    setDocumentationRequest(request);
  }

  async function runDocumentedLeadChange({
    lead,
    preview,
    field,
    source,
    title,
    description,
    confirmLabel,
    mutate,
  }: {
    lead: Lead;
    preview: LeadActivityPreview;
    field: PendingField;
    source: 'table' | 'kanban';
    title: string;
    description: string;
    confirmLabel?: string;
    mutate: (context: LeadMutationContext) => Promise<void>;
  }) {
    if (preview.changes.length === 0 || pendingUpdates[lead.id]) return;

    const runMutation = async (result?: ChangeDocumentationResult) => {
      setPendingUpdates((current) => ({ ...current, [lead.id]: field }));
      setUpdateErrors((current) => {
        const next = { ...current };
        delete next[lead.id];
        return next;
      });

      try {
        await mutate(buildLeadMutationContext(user, source, result ?? undefined));
      } catch (requestError) {
        const message = mutationErrorMessage(requestError);
        setUpdateErrors((current) => ({ ...current, [lead.id]: message }));
        throw requestError;
      } finally {
        setPendingUpdates((current) => {
          const next = { ...current };
          delete next[lead.id];
          return next;
        });
      }
    };

    if (!shouldPromptForPreview(preview)) {
      try {
        await runMutation();
      } catch {
        // Error state is shown inline for this lead.
      }
      return;
    }

    openDocumentationDialog({
      mode: preview.requiresReason ? 'required-reason' : 'optional-comment',
      title,
      description,
      subjectLabel: leadName(lead),
      changes: buildChangeSummaryItems(preview.changes),
      confirmLabel,
      onConfirm: runMutation,
    });
  }

  async function updateLeadInline(lead: Lead, input: UpdateLeadInput, field: PendingField, source: 'table' | 'kanban' = 'table') {
    if (pendingUpdates[lead.id]) return false;
    const preview = previewLeadUpdate(lead, input);
    if (preview.changes.length === 0) return false;

    await runDocumentedLeadChange({
      lead,
      preview,
      field,
      source,
      title: field === 'temperature' ? 'Confirm temperature change' : 'Confirm status change',
      description: 'Review this lead change before saving.',
      mutate: async (context) => {
        await updateLead(lead.id, input, context);
      },
    });
    return true;
  }

  async function updateStatus(lead: Lead, nextStatus: LeadStatus, source: 'table' | 'kanban' = 'table') {
    if (!accessToken) return;
    if (lead.status === nextStatus || pendingUpdates[lead.id]) return;
    if (nextStatus === 'WON') {
      await runDocumentedLeadChange({
        lead,
        preview: previewLeadConvert(lead),
        field: 'status',
        source,
        title: 'Mark lead as won?',
        description: 'Won leads are read-only and will leave the active view.',
        confirmLabel: 'Mark won',
        mutate: async (context) => {
          await convertLeadRequest(accessToken ?? '', lead.id, false, context);
          await refetch();
        },
      });
      return;
    }

    if (nextStatus === 'LOST') {
      await runDocumentedLeadChange({
        lead,
        preview: previewLeadLost(lead),
        field: 'status',
        source,
        title: 'Mark lead as lost?',
        description: 'Lost leads keep their history and can be reopened later.',
        confirmLabel: 'Mark lost',
        mutate: async (context) => {
          await markLeadLostRequest(accessToken ?? '', lead.id, context);
          await refetch();
        },
      });
      return;
    }

    if (lead.status === 'LOST') {
      await runDocumentedLeadChange({
        lead,
        preview: previewLeadReopen(lead),
        field: 'status',
        source,
        title: 'Reopen lost lead?',
        description: 'Reopened leads return to the active workflow.',
        confirmLabel: 'Reopen lead',
        mutate: async (context) => {
          await reopenLeadRequest(accessToken ?? '', lead.id, context);
          await refetch();
        },
      });
      return;
    }

    await updateLeadInline(lead, { status: nextStatus }, 'status', source);
  }

  async function updateTemperature(lead: Lead, nextTemperature: LeadTemperature | '') {
    const temperature = nextTemperature || null;
    if (lead.temperature === temperature || pendingUpdates[lead.id]) return;
    await updateLeadInline(lead, { temperature }, 'temperature', 'table');
  }

  async function handleDragEnd(event: DragEndEvent) {
    const leadId = String(event.active.id);
    const nextStatus = event.over?.id as LeadStatus | undefined;
    if (!nextStatus || !ACTIVE_STATUSES.includes(nextStatus)) return;
    const lead = leads.find((item) => item.id === leadId);
    if (!lead || lead.status === nextStatus) return;
    await updateStatus(lead, nextStatus, 'kanban');
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
            <Plus className="mr-2 inline h-4 w-4" aria-hidden="true" />
            Add Lead
          </button>
        </header>

        <section className="overflow-visible rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="grid gap-4 border-b border-gray-200 p-4 lg:grid-cols-[minmax(0,1fr)_16rem_16rem_auto]">
            <form onSubmit={handleSearch}>
              <label className="relative block">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                  <Search className="h-5 w-5" aria-hidden="true" />
                </span>
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search leads..."
                  className="h-14 w-full rounded-lg border border-gray-300 bg-white pl-12 pr-4 text-base text-gray-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </label>
            </form>
            <label className="relative block">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-600">
                <UserRound className="h-5 w-5" aria-hidden="true" />
              </span>
              <select
                value={ownerId}
                onChange={(event) => { setOwnerId(event.target.value); markCustom(); }}
                className="h-14 w-full appearance-none rounded-lg border border-gray-300 bg-white pl-12 pr-10 text-base font-semibold text-gray-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              >
                <option value="">Owner</option>
                {memberships.map((membership) => <option key={membership.id} value={membership.userId}>{membershipName(membership)}</option>)}
              </select>
              <span className="pointer-events-none absolute right-4 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 border-b border-r border-gray-700" />
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMoreFiltersOpen((current) => !current)}
                className="flex h-14 w-full items-center justify-between gap-3 rounded-lg border border-gray-300 bg-white px-4 text-base font-semibold text-gray-900 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                aria-expanded={moreFiltersOpen}
              >
                <span className="flex items-center gap-3">
                  <ListFilter className="h-5 w-5 text-gray-600" aria-hidden="true" />
                  More filters
                </span>
                <span className="h-2 w-2 rotate-45 border-b border-r border-gray-700" />
              </button>
              {moreFiltersOpen ? (
                <div className="absolute left-0 top-full z-20 mt-2 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
                  {['Source', 'Created Date', 'Updated Date', 'Assigned', 'Unassigned'].map((item) => (
                    <button key={item} type="button" className="block w-full rounded px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50">
                      {item}
                    </button>
                  ))}
                  <p className="px-3 pt-2 text-xs text-gray-500">Prepared for future frontend filters.</p>
                </div>
              ) : null}
            </div>
            <button type="button" onClick={resetFilters} className="flex h-14 items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-5 text-base font-semibold text-gray-900 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-100">
              <RotateCcw className="h-5 w-5 text-gray-600" aria-hidden="true" />
              Clear all
            </button>
          </div>

          <div className="border-b border-gray-200 p-4 sm:px-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <FilterDropdown
                id="lead-stage-filter"
                title="Stage"
                valueLabel={String(selectedStages.length)}
                open={openFilterMenu === 'stage'}
                onToggle={() => setOpenFilterMenu((current) => current === 'stage' ? null : 'stage')}
              >
                {STAGE_FILTER_OPTIONS.map((option) => (
                  <FilterOptionButton
                    key={option.value}
                    label={option.label}
                    icon={option.icon}
                    selected={selectedStages.includes(option.value)}
                    className={stageSelectedClass(selectedStages.includes(option.value))}
                    onClick={() => toggleStage(option.value)}
                  />
                ))}
              </FilterDropdown>

              <FilterDropdown
                id="lead-follow-up-filter"
                title="Follow-up"
                valueLabel={filterLabel(FOLLOW_UP_FILTER_OPTIONS, followUpFilter)}
                open={openFilterMenu === 'followUp'}
                onToggle={() => setOpenFilterMenu((current) => current === 'followUp' ? null : 'followUp')}
              >
                {FOLLOW_UP_FILTER_OPTIONS.map((option) => (
                  <FilterOptionButton
                    key={option.value}
                    label={option.label}
                    icon={option.icon}
                    selected={followUpFilter === option.value}
                    className={followUpSelectedClass(option.value, followUpFilter === option.value)}
                    onClick={() => selectFollowUpFilter(option.value)}
                  />
                ))}
              </FilterDropdown>

              <FilterDropdown
                id="lead-temperature-filter"
                title="Temperature"
                valueLabel={selectedTemperatures.length > 0 ? String(selectedTemperatures.length) : 'Any'}
                open={openFilterMenu === 'temperature'}
                onToggle={() => setOpenFilterMenu((current) => current === 'temperature' ? null : 'temperature')}
              >
                {TEMPERATURE_FILTER_OPTIONS.map((option) => (
                  <FilterOptionButton
                    key={option.value}
                    label={option.label}
                    icon={option.icon}
                    selected={selectedTemperatures.includes(option.value)}
                    className={temperatureSelectedClass(option.value, selectedTemperatures.includes(option.value))}
                    onClick={() => toggleTemperature(option.value)}
                  />
                ))}
              </FilterDropdown>

              <FilterDropdown
                id="lead-preset-filter"
                title="Preset"
                valueLabel={activePresetLabel}
                open={openFilterMenu === 'preset'}
                onToggle={() => setOpenFilterMenu((current) => current === 'preset' ? null : 'preset')}
              >
                {QUICK_PRESETS.map((preset) => (
                  <FilterOptionButton
                    key={preset.value}
                    label={preset.label}
                    icon={preset.icon}
                    selected={activePreset === preset.value}
                    className={activePreset === preset.value ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-transparent bg-white text-gray-800 hover:bg-gray-50'}
                    onClick={() => applyPreset(preset.value)}
                  />
                ))}
              </FilterDropdown>
            </div>
          </div>

          <SelectedFilters
            selectedStages={selectedStages}
            followUpFilter={followUpFilter}
            selectedTemperatures={selectedTemperatures}
            ownerId={ownerId}
            ownerLabel={ownerFilterLabel ? membershipName(ownerFilterLabel) : ''}
            search={search}
            onRemove={removeSelectedFilter}
            onClear={resetFilters}
          />
        </section>

        {loading ? <p className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-600">Loading leads...</p> : null}

        {!loading && error ? (
          <section className="rounded-xl border border-red-200 bg-white p-5">
            <h2 className="font-semibold text-red-900">Could not load leads</h2>
            <p className="mt-1 text-sm text-red-700">{error.message}</p>
            <button type="button" onClick={() => void refetch()} className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white">Retry</button>
          </section>
        ) : null}

        {!loading && !error && visibleLeads.length === 0 && actualView === 'table' ? (
          <section className="rounded-xl border border-gray-200 bg-white p-8 text-center">
            <h2 className="font-semibold text-gray-900">{hasActiveFilterSelections ? 'No leads found' : 'No active leads'}</h2>
            <p className="mt-2 text-sm text-gray-600">
              {hasActiveFilterSelections ? 'Try changing or clearing your filters.' : 'New, contacted, and qualified leads will appear here.'}
            </p>
            {!hasActiveFilterSelections ? (
              <button type="button" onClick={() => setModalOpen(true)} className="mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">
                <Plus className="mr-2 inline h-4 w-4" aria-hidden="true" />
                Add Lead
              </button>
            ) : null}
          </section>
        ) : null}

        {!loading && !error && actualView === 'table' && visibleLeads.length > 0 ? (
          <>
            <LeadTable
              leads={visibleLeads}
              leadTasks={leadTasks}
              pendingUpdates={pendingUpdates}
              updateErrors={updateErrors}
              onStatusChange={updateStatus}
              onTemperatureChange={updateTemperature}
              onFollowUpOpen={openFollowUp}
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
                    leads={visibleLeads.filter((lead) => lead.status === column.value)}
                    pendingUpdates={pendingUpdates}
                    updateErrors={updateErrors}
                    onStatusChange={(lead, status) => void updateStatus(lead, status, 'kanban')}
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

      {followUpLead && createFollowUpOpen ? (
        <CreateFollowUpModal
          lead={followUpLead}
          memberships={memberships}
          onClose={closeFollowUpModal}
          onCreate={handleCreateFollowUp}
        />
      ) : null}

      {followUpLead && followUpTask && !createFollowUpOpen ? (
        <TaskDetailModal
          task={followUpTask}
          memberships={memberships}
          entityLabel={leadName(followUpLead)}
          entityPath={`/leads/${followUpLead.id}`}
          onClose={closeFollowUpModal}
          onSaved={(updatedTask) => {
            setFollowUpTask(updatedTask);
            void refreshLeadTasks();
            void refetch();
          }}
        />
      ) : null}

      <ChangeDocumentationDialog
        open={Boolean(documentationRequest)}
        mode={documentationRequest?.mode ?? 'optional-comment'}
        title={documentationRequest?.title ?? ''}
        description={documentationRequest?.description}
        subjectLabel={documentationRequest?.subjectLabel}
        changes={documentationRequest?.changes ?? []}
        confirmLabel={documentationRequest?.confirmLabel}
        submitting={documentationSubmitting}
        error={documentationError}
        onCancel={() => {
          if (!documentationSubmitting) {
            setDocumentationRequest(null);
            setDocumentationError(null);
          }
        }}
        onConfirm={async (result) => {
          if (!documentationRequest) return;
          setDocumentationSubmitting(true);
          setDocumentationError(null);
          try {
            await documentationRequest.onConfirm(result);
            setDocumentationRequest(null);
          } catch (requestError) {
            setDocumentationError(mutationErrorMessage(requestError));
          } finally {
            setDocumentationSubmitting(false);
          }
        }}
      />
    </AppShell>
  );
}

function LeadTable({
  leads,
  leadTasks,
  pendingUpdates,
  updateErrors,
  onStatusChange,
  onTemperatureChange,
  onFollowUpOpen,
}: {
  leads: Lead[];
  leadTasks: Task[];
  pendingUpdates: Record<string, PendingField>;
  updateErrors: Record<string, string>;
  onStatusChange: (lead: Lead, status: LeadStatus) => void;
  onTemperatureChange: (lead: Lead, temperature: LeadTemperature | '') => void;
  onFollowUpOpen: (lead: Lead) => void;
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
                followUpTask={getNextFollowUpTask(lead.id, leadTasks)}
                onStatusChange={onStatusChange}
                onTemperatureChange={onTemperatureChange}
                onFollowUpOpen={onFollowUpOpen}
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
            followUpTask={getNextFollowUpTask(lead.id, leadTasks)}
            onStatusChange={onStatusChange}
            onTemperatureChange={onTemperatureChange}
            onFollowUpOpen={onFollowUpOpen}
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

function filterLabel<T extends string>(options: Array<{ label: string; value: T }>, value: T) {
  return options.find((option) => option.value === value)?.label ?? label(value);
}

function FilterDropdown({
  id,
  title,
  valueLabel,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  valueLabel: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="relative"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          if (open) onToggle();
        }
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        aria-haspopup="menu"
      >
        <span className="min-w-0 truncate">
          {title} <span className="text-gray-500">·</span> <span className="text-gray-700">{valueLabel}</span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-gray-600 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open ? (
        <div
          id={`${id}-menu`}
          role="menu"
          className="absolute left-0 top-full z-30 mt-2 w-full min-w-56 rounded-lg border border-gray-200 bg-white p-2 shadow-lg"
        >
          <div className="space-y-1">{children}</div>
        </div>
      ) : null}
    </div>
  );
}

function FilterOptionButton({
  label: optionLabel,
  icon: Icon,
  selected,
  className,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  selected: boolean;
  className: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={selected}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 ${className}`}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{optionLabel}</span>
      {selected ? <CircleCheck className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
    </button>
  );
}

function SelectedFilterChip({
  children,
  tone = 'neutral',
  onRemove,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'danger' | 'warm';
  onRemove: () => void;
}) {
  return (
    <span className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold ${selectedPillClass(tone)}`}>
      {children}
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 text-current hover:bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1"
        aria-label={`Remove ${String(children)} filter`}
      >
        x
      </button>
    </span>
  );
}

function SelectedFilters({
  selectedStages,
  followUpFilter,
  selectedTemperatures,
  ownerId,
  ownerLabel,
  search,
  onRemove,
  onClear,
}: {
  selectedStages: LeadStage[];
  followUpFilter: FollowUpFilter;
  selectedTemperatures: LeadTemperature[];
  ownerId: string;
  ownerLabel: string;
  search: string;
  onRemove: (kind: 'stage' | 'followUp' | 'temperature' | 'owner' | 'search', value?: string) => void;
  onClear: () => void;
}) {
  const hasSelections = selectedStages.length > 0
    || followUpFilter !== 'ANY'
    || selectedTemperatures.length > 0
    || Boolean(ownerId)
    || Boolean(search);

  if (!hasSelections) return null;

  return (
    <div className="border-t border-gray-200 px-6 py-5">
      <h2 className="text-base font-semibold text-gray-900">Selected filters</h2>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {selectedStages.map((stage) => (
          <SelectedFilterChip key={stage} onRemove={() => onRemove('stage', stage)}>
            {filterLabel(STAGE_FILTER_OPTIONS, stage)}
          </SelectedFilterChip>
        ))}
        {followUpFilter !== 'ANY' ? (
          <SelectedFilterChip
            tone={followUpFilter === 'OVERDUE' ? 'danger' : 'warm'}
            onRemove={() => onRemove('followUp')}
          >
            {filterLabel(FOLLOW_UP_FILTER_OPTIONS, followUpFilter)}
          </SelectedFilterChip>
        ) : null}
        {selectedTemperatures.map((temperature) => (
          <SelectedFilterChip
            key={temperature}
            tone={temperature === 'HOT' ? 'danger' : temperature === 'WARM' ? 'warm' : 'neutral'}
            onRemove={() => onRemove('temperature', temperature)}
          >
            {filterLabel(TEMPERATURE_FILTER_OPTIONS, temperature)}
          </SelectedFilterChip>
        ))}
        {ownerId ? (
          <SelectedFilterChip onRemove={() => onRemove('owner')}>
            Owner: {ownerLabel || 'Selected owner'}
          </SelectedFilterChip>
        ) : null}
        {search ? (
          <SelectedFilterChip onRemove={() => onRemove('search')}>
            Search: {search}
          </SelectedFilterChip>
        ) : null}
        <button
          type="button"
          onClick={onClear}
          className="h-10 rounded-lg px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1"
        >
          Clear all
        </button>
      </div>
    </div>
  );
}

function FollowUpButton({ lead, task, onOpen }: { lead: Lead; task: Task | null; onOpen: (lead: Lead) => void }) {
  const value = task?.dueAt ?? null;
  const overdue = isOverdue(value);

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpen(lead);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
      }}
      className={`flex w-full items-center rounded-lg px-2 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 ${overdue ? 'hover:bg-red-50' : 'hover:bg-gray-50'}`}
      aria-label={task ? `Open follow-up for ${leadName(lead)}` : `Create follow-up for ${leadName(lead)}`}
    >
      <FollowUpBadge value={value} />
    </button>
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
            onStatusChange(lead, 'NEW');
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
  followUpTask,
  onStatusChange,
  onTemperatureChange,
  onFollowUpOpen,
}: {
  lead: Lead;
  pendingField?: PendingField;
  error?: string;
  followUpTask: Task | null;
  onStatusChange: (lead: Lead, status: LeadStatus) => void;
  onTemperatureChange: (lead: Lead, temperature: LeadTemperature | '') => void;
  onFollowUpOpen: (lead: Lead) => void;
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
      <td className="px-2 py-1"><FollowUpButton lead={lead} task={followUpTask} onOpen={onFollowUpOpen} /></td>
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
  followUpTask,
  onStatusChange,
  onTemperatureChange,
  onFollowUpOpen,
}: {
  lead: Lead;
  pendingField?: PendingField;
  error?: string;
  followUpTask: Task | null;
  onStatusChange: (lead: Lead, status: LeadStatus) => void;
  onTemperatureChange: (lead: Lead, temperature: LeadTemperature | '') => void;
  onFollowUpOpen: (lead: Lead) => void;
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
      <div className="mt-4">
        <FollowUpButton lead={lead} task={followUpTask} onOpen={onFollowUpOpen} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div><p className="font-semibold uppercase tracking-wide text-gray-500">Owner</p><p className="mt-1 text-gray-700">{ownerName(lead)}</p></div>
        <div><p className="font-semibold uppercase tracking-wide text-gray-500">Source</p><p className="mt-1 text-gray-700">{lead.leadSource?.name ?? label(lead.source)}</p></div>
      </div>
      <Link className="mt-4 inline-block text-sm font-semibold text-emerald-700" to={`/leads/${lead.id}`}>Open lead</Link>
    </div>
  );
}

type FollowUpFormState = {
  title: string;
  description: string;
  dueAt: string;
  assigneeId: string;
};

function defaultFollowUpForm(lead: Lead): FollowUpFormState {
  return {
    title: `Follow up with ${leadName(lead)}`,
    description: '',
    dueAt: '',
    assigneeId: lead.ownerId ?? '',
  };
}

function CreateFollowUpModal({
  lead,
  memberships,
  onClose,
  onCreate,
}: {
  lead: Lead;
  memberships: MembershipOption[];
  onClose: () => void;
  onCreate: (input: CreateTaskInput) => Promise<boolean>;
}) {
  const [form, setForm] = useState<FollowUpFormState>(() => defaultFollowUpForm(lead));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.title.trim()) {
      setError('Follow-up title is required.');
      return;
    }
    if (!form.dueAt) {
      setError('Due date is required.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await onCreate({
        taskType: 'FOLLOW_UP',
        entityType: 'LEAD',
        entityId: lead.id,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        dueAt: new Date(form.dueAt).toISOString(),
        status: 'WAITING',
        assigneeId: form.assigneeId || null,
      });
    } catch (requestError) {
      const message = requestError && typeof requestError === 'object' && 'message' in requestError
        ? String((requestError as { message?: unknown }).message)
        : 'Could not create follow-up. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-900/50 p-4">
      <div className="mx-auto my-10 max-w-2xl rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">New follow-up</p>
            <h2 className="mt-1 text-xl font-semibold text-gray-900">{leadName(lead)}</h2>
            <p className="mt-1 text-sm text-gray-600">Create the next follow-up task for this lead.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:text-gray-400"
          >
            Close
          </button>
        </div>

        <form className="space-y-4 p-5" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
            Title
            <input
              value={form.title}
              onChange={(event) => {
                setForm((current) => ({ ...current, title: event.target.value }));
                setError(null);
              }}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              required
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
              Due date and time
              <input
                type="datetime-local"
                value={form.dueAt}
                onChange={(event) => {
                  setForm((current) => ({ ...current, dueAt: event.target.value }));
                  setError(null);
                }}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
              Assignee
              <select
                value={form.assigneeId}
                onChange={(event) => {
                  setForm((current) => ({ ...current, assigneeId: event.target.value }));
                  setError(null);
                }}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              >
                <option value="">Unassigned</option>
                {memberships.map((membership) => (
                  <option key={membership.id} value={membership.userId}>
                    {membershipName(membership)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
            Description
            <textarea
              value={form.description}
              onChange={(event) => {
                setForm((current) => ({ ...current, description: event.target.value }));
                setError(null);
              }}
              className="min-h-24 rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              placeholder="Add context for this follow-up."
            />
          </label>
          {error ? <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={loading}
              className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {loading ? 'Creating...' : 'Create follow-up'}
            </button>
            <button
              type="button"
              onClick={() => {
                setForm(defaultFollowUpForm(lead));
                setError(null);
              }}
              disabled={loading}
              className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:text-gray-400"
            >
              Reset
            </button>
          </div>
        </form>
      </div>
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
