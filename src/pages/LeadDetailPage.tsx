import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LeadOverviewCard } from '../components/leads/LeadOverviewCard';
import { LeadSourceContextCard } from '../components/leads/LeadSourceContextCard';
import { AppShell } from '../components/layout/AppShell';
import { EntityNotesPanel } from '../components/notes/EntityNotesPanel';
import { EntityTasksPanel } from '../components/tasks/EntityTasksPanel';
import { TaskDetailModal } from '../components/tasks/TaskDetailModal';
import { useAuth } from '../context/AuthContext';
import type { HttpError } from '../lib/http';
import { listLeadSourceOptions, type LeadSourceOption } from '../lib/lead-sources';
import {
  convertLead,
  deleteLead,
  getLead,
  markLeadLost,
  reopenLead,
  updateLead,
  type Lead,
  type LeadStatus,
  type LeadTemperature,
  type UpdateLeadInput,
} from '../lib/leads';
import { listMembershipOptions, type MembershipOption } from '../lib/memberships';
import { completeTask, listTasks, type Task, type TaskStatus } from '../lib/tasks';

type RequestError = { status: number; message: string };
type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  temperature: LeadTemperature | '';
  ownerId: string;
  leadSourceId: string;
};

type MainStage = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'WON' | 'LOST';
type ProgressStep =
  | {
      kind: 'stage';
      id: MainStage;
      label: string;
      date: string | null;
      completed: boolean;
      current: boolean;
      lost: boolean;
    }
  | {
      kind: 'follow-up';
      id: 'FOLLOW_UP';
      label: string;
      sequence: number;
      overdue: boolean;
      dueAt: string | null;
    };

const MAIN_STAGES: Array<{ id: MainStage; label: string }> = [
  { id: 'NEW', label: 'New' },
  { id: 'CONTACTED', label: 'Contacted' },
  { id: 'QUALIFIED', label: 'Qualified' },
  { id: 'WON', label: 'Converted' },
  { id: 'LOST', label: 'Lost' },
];

const STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  FOLLOW_UP_NEEDED: 'Follow-up Needed',
  QUALIFIED: 'Qualified',
  WON: 'Won',
  LOST: 'Lost',
};

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  WAITING: 'Waiting',
  DONE: 'Done',
};

const HISTORICAL_FOLLOW_UP_COUNTS: Record<string, number> = {
  'led-001': 1,
  'led-003': 1,
};

function requestError(error: unknown, fallback: string): RequestError {
  if (error && typeof error === 'object' && 'status' in error && 'message' in error) {
    const value = error as HttpError;
    return { status: value.status, message: value.message || fallback };
  }
  return { status: 0, message: fallback };
}

function formState(lead: Lead): FormState {
  return {
    firstName: lead.firstName ?? '',
    lastName: lead.lastName ?? '',
    email: lead.email ?? '',
    phone: lead.phone ?? '',
    temperature: lead.temperature ?? '',
    ownerId: lead.ownerId ?? '',
    leadSourceId: lead.leadSourceId ?? '',
  };
}

function updateInput(form: FormState): UpdateLeadInput {
  return {
    firstName: form.firstName.trim() || null,
    lastName: form.lastName.trim() || null,
    email: form.email.trim() || null,
    phone: form.phone.trim() || null,
    temperature: form.temperature || null,
    ownerId: form.ownerId || null,
    leadSourceId: form.leadSourceId || null,
  };
}

function optionName(option: MembershipOption) {
  return [option.user.firstName, option.user.lastName].filter(Boolean).join(' ') || option.user.email;
}

function leadName(lead: Lead) {
  return [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email || lead.phone || 'Unnamed lead';
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: 'numeric' });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatRelativeDate(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((dateStart.getTime() - todayStart.getTime()) / 86_400_000);

  if (days === 0) return 'today';
  if (days === 1) return 'in 1 day';
  if (days > 1) return `in ${days} days`;
  if (days === -1) return 'overdue by 1 day';
  return `overdue by ${Math.abs(days)} days`;
}

function isOverdue(value: string | null | undefined) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

function sourceLabel(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');
}

function currentMainStage(lead: Lead): MainStage {
  if (lead.status === 'FOLLOW_UP_NEEDED') return 'CONTACTED';
  if (lead.status === 'WON' || lead.status === 'LOST' || lead.status === 'QUALIFIED' || lead.status === 'CONTACTED') return lead.status;
  return 'NEW';
}

function stageDate(lead: Lead, stage: MainStage) {
  if (stage === 'NEW') return lead.createdAt;
  if (stage === currentMainStage(lead) || (stage === 'WON' && lead.status === 'WON') || (stage === 'LOST' && lead.status === 'LOST')) {
    return lead.updatedAt;
  }
  return null;
}

function isOpenTask(task: Task) {
  return task.status !== 'DONE' && Boolean(task.dueAt);
}

function getNextActionTask(tasks: Task[]) {
  return tasks
    .filter(isOpenTask)
    .sort((left, right) => {
      const leftTime = left.dueAt ? new Date(left.dueAt).getTime() : Number.POSITIVE_INFINITY;
      const rightTime = right.dueAt ? new Date(right.dueAt).getTime() : Number.POSITIVE_INFINITY;
      return leftTime - rightTime;
    })[0] ?? null;
}

function followUpSequence(lead: Lead, tasks: Task[]) {
  const completedCount = tasks.filter((task) => task.status === 'DONE').length;
  return Math.max(1, completedCount + (HISTORICAL_FOLLOW_UP_COUNTS[lead.id] ?? 0) + 1);
}

function buildProgressSteps(lead: Lead, tasks: Task[], nextTask: Task | null): ProgressStep[] {
  const currentStage = currentMainStage(lead);
  const currentStageIndex = MAIN_STAGES.findIndex((stage) => stage.id === currentStage);
  const shouldShowFollowUp = Boolean(nextTask) || lead.status === 'FOLLOW_UP_NEEDED';
  const sequence = followUpSequence(lead, tasks);
  const steps: ProgressStep[] = [];

  for (const [index, stage] of MAIN_STAGES.entries()) {
    const isLostPath = lead.status === 'LOST';
    const isWonPath = lead.status === 'WON';
    const completed = isWonPath
      ? stage.id !== 'LOST' && index <= currentStageIndex
      : !isLostPath && (shouldShowFollowUp ? index <= currentStageIndex : index < currentStageIndex);
    const current = isLostPath ? stage.id === 'LOST' : !shouldShowFollowUp && stage.id === currentStage;

    steps.push({
      kind: 'stage',
      id: stage.id,
      label: stage.label,
      date: stageDate(lead, stage.id),
      completed,
      current,
      lost: stage.id === 'LOST',
    });

    if (shouldShowFollowUp && stage.id === currentStage && lead.status !== 'WON' && lead.status !== 'LOST') {
      steps.push({
        kind: 'follow-up',
        id: 'FOLLOW_UP',
        label: `Follow-up ${sequence}`,
        sequence,
        overdue: isOverdue(nextTask?.dueAt),
        dueAt: nextTask?.dueAt ?? null,
      });
    }
  }

  return steps;
}

function assigneeName(task: Task | null, memberships: MembershipOption[]) {
  if (!task?.assigneeId) return 'Unassigned';
  const membership = memberships.find((item) => item.userId === task.assigneeId);
  if (membership) return optionName(membership);
  return task.assigneeSummary?.displayName ?? 'Unassigned';
}

function priorityLabel(lead: Lead) {
  if (lead.temperature === 'HOT') return 'High';
  if (lead.temperature === 'WARM') return 'Medium';
  return 'Normal';
}

function Icon({ path, className = 'h-4 w-4' }: { path: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={path} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ICONS = {
  check: 'm6 12 4 4 8-8',
  refresh: 'M21 12a9 9 0 0 1-15.5 6.2M3 12A9 9 0 0 1 18.5 5.8M18 3v4h-4M6 21v-4h4',
  close: 'M7 7l10 10M17 7 7 17',
  phone: 'M6.5 4.5 9 4l1.5 4-2 1.2a11 11 0 0 0 5.3 5.3l1.2-2 4 1.5-.5 2.5c-.2 1-1.1 1.6-2.1 1.5C9.9 17.5 4.5 12.1 4 5.6c-.1-1 .5-1.9 1.5-2.1Z',
  calendar: 'M7 3v4M17 3v4M4 8h16M5 5h14v15H5V5Z',
  user: 'M20 21a8 8 0 0 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  flag: 'M5 21V5m0 0h12l-2 5 2 5H5',
  plus: 'M12 5v14M5 12h14',
  note: 'M7 4h10l3 3v13H7V4Zm10 0v4h4M10 12h7M10 16h7',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0',
};

export function LeadDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const [lead, setLead] = useState<Lead | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [leadTasks, setLeadTasks] = useState<Task[]>([]);
  const [tasksRefreshKey, setTasksRefreshKey] = useState(0);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [error, setError] = useState<RequestError | null>(null);
  const [editing, setEditing] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<RequestError | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [taskActionLoading, setTaskActionLoading] = useState(false);
  const [actionError, setActionError] = useState<RequestError | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<MembershipOption[]>([]);
  const [leadSources, setLeadSources] = useState<LeadSourceOption[]>([]);

  const fetchLead = useCallback(async () => {
    if (!accessToken || !id) {
      setError(!id ? { status: 404, message: 'Lead not found.' } : null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await getLead(accessToken, id);
      setLead(response);
      setForm(formState(response));
    } catch (requestFailure) {
      setError(requestError(requestFailure, 'Could not load lead.'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, id]);

  const fetchLeadTasks = useCallback(async () => {
    if (!accessToken || !id) {
      setLeadTasks([]);
      return;
    }
    setTasksLoading(true);
    try {
      const response = await listTasks(accessToken, { entityType: 'LEAD', entityId: id, page: 1, limit: 50 });
      setLeadTasks(response.data);
    } finally {
      setTasksLoading(false);
    }
  }, [accessToken, id]);

  const refreshLeadTasks = useCallback(() => {
    setTasksRefreshKey((current) => current + 1);
    void fetchLeadTasks();
    void fetchLead();
  }, [fetchLead, fetchLeadTasks]);

  useEffect(() => { void fetchLead(); }, [fetchLead]);
  useEffect(() => { void fetchLeadTasks(); }, [fetchLeadTasks, tasksRefreshKey]);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    Promise.allSettled([listMembershipOptions(accessToken), listLeadSourceOptions(accessToken)]).then(([members, sources]) => {
      if (!active) return;
      setMemberships(members.status === 'fulfilled' ? members.value : []);
      setLeadSources(sources.status === 'fulfilled' ? sources.value : []);
    });
    return () => { active = false; };
  }, [accessToken]);

  const nextActionTask = useMemo(() => getNextActionTask(leadTasks), [leadTasks]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !lead || !form) return;
    setSaveLoading(true);
    setSaveError(null);
    setSuccess(null);
    try {
      const response = await updateLead(accessToken, lead.id, updateInput(form));
      setLead(response);
      setForm(formState(response));
      setEditing(false);
      setSuccess('Lead updated.');
    } catch (requestFailure) {
      setSaveError(requestError(requestFailure, 'Could not update lead.'));
    } finally {
      setSaveLoading(false);
    }
  }

  async function lifecycle(action: 'lost' | 'reopen') {
    if (!accessToken || !lead) return;
    const prompt = action === 'lost' ? 'Mark this lead as lost?' : 'Reopen this lead?';
    if (!window.confirm(prompt)) return;
    setActionLoading(true);
    setActionError(null);
    setSuccess(null);
    try {
      const response = action === 'lost'
        ? await markLeadLost(accessToken, lead.id)
        : await reopenLead(accessToken, lead.id);
      setLead(response);
      setForm(formState(response));
      setEditing(false);
      setSuccess(action === 'lost' ? 'Lead marked lost.' : 'Lead reopened.');
    } catch (requestFailure) {
      setActionError(requestError(requestFailure, 'Could not update lead lifecycle.'));
    } finally {
      setActionLoading(false);
    }
  }

  async function updateStatus(status: 'CONTACTED' | 'QUALIFIED') {
    if (!accessToken || !lead) return;
    setActionLoading(true);
    setActionError(null);
    setSuccess(null);
    try {
      const response = await updateLead(accessToken, lead.id, { status });
      setLead(response);
      setForm(formState(response));
      setEditing(false);
      setSuccess(status === 'CONTACTED' ? 'Lead marked contacted.' : 'Lead marked qualified.');
    } catch (requestFailure) {
      setActionError(requestError(requestFailure, 'Could not update lead status.'));
    } finally {
      setActionLoading(false);
    }
  }

  async function remove() {
    if (!accessToken || !lead || !window.confirm('Delete this lead?')) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await deleteLead(accessToken, lead.id);
      navigate('/leads');
    } catch (requestFailure) {
      setActionError(requestError(requestFailure, 'Could not delete lead.'));
      setActionLoading(false);
    }
  }

  async function convert(confirmDuplicate: boolean) {
    if (!accessToken || !lead) return;
    if (!lead.firstName?.trim()) {
      setActionError({ status: 422, message: 'Add a first name before marking this lead won.' });
      return;
    }
    setActionLoading(true);
    setActionError(null);
    setSuccess(null);
    try {
      const response = await convertLead(accessToken, lead.id, confirmDuplicate);
      setLead(response.lead);
      setForm(formState(response.lead));
      setEditing(false);
      setSuccess('Lead marked won.');
    } catch (requestFailure) {
      setActionError(requestError(requestFailure, 'Could not mark lead won.'));
    } finally {
      setActionLoading(false);
    }
  }

  async function completeFollowUp() {
    if (!accessToken || !nextActionTask) return;
    setTaskActionLoading(true);
    setActionError(null);
    setSuccess(null);
    try {
      await completeTask(accessToken, nextActionTask.id);
      setSuccess('Follow-up completed.');
      refreshLeadTasks();
    } catch (requestFailure) {
      setActionError(requestError(requestFailure, 'Could not complete follow-up.'));
    } finally {
      setTaskActionLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-4">
        <Link className="inline-flex text-sm font-medium text-gray-800 underline decoration-gray-400 underline-offset-2 hover:text-gray-950" to="/leads">
          Back to Leads
        </Link>
        {loading ? <p className="rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-600">Loading lead...</p> : null}
        {!loading && error ? (
          <section className="rounded-lg border border-red-200 bg-white p-5">
            <h1 className="font-semibold text-red-900">{error.status === 404 ? 'Lead not found' : 'Could not load lead'}</h1>
            <p className="mt-2 text-sm text-red-700">{error.message}</p>
            {error.status !== 404 ? <button type="button" onClick={() => void fetchLead()} className="mt-4 rounded bg-red-700 px-4 py-2 text-sm font-semibold text-white">Retry</button> : null}
          </section>
        ) : null}

        {!loading && !error && lead ? (
          <>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(340px,1fr)]">
              <LeadProgressCard lead={lead} tasks={leadTasks} nextTask={nextActionTask} tasksLoading={tasksLoading} />
              <NextActionCard
                lead={lead}
                task={nextActionTask}
                tasksLoading={tasksLoading}
                assignee={assigneeName(nextActionTask, memberships)}
                sequence={followUpSequence(lead, leadTasks)}
                busy={taskActionLoading}
                onComplete={() => void completeFollowUp()}
                onReschedule={() => nextActionTask ? setSelectedTask(nextActionTask) : undefined}
              />
            </div>

            <LeadOverviewCard
              lead={lead}
              busy={actionLoading || saveLoading || taskActionLoading}
              editing={editing}
              onConvert={() => void convert(false)}
              onDelete={() => void remove()}
              onEdit={() => { setForm(formState(lead)); setEditing(true); setSaveError(null); setSuccess(null); }}
              onMarkContacted={() => void updateStatus('CONTACTED')}
              onMarkQualified={() => void updateStatus('QUALIFIED')}
              onMarkLost={() => void lifecycle('lost')}
              onReopen={() => void lifecycle('reopen')}
            />
            {success ? <p className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">{success}</p> : null}
            {actionError ? <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{actionError.message}</p> : null}

            {editing && form ? (
              <EditLeadCard
                form={form}
                memberships={memberships}
                leadSources={leadSources}
                saveLoading={saveLoading}
                saveError={saveError}
                onSubmit={save}
                onChange={setForm}
                onCancel={() => { setForm(formState(lead)); setEditing(false); setSaveError(null); }}
              />
            ) : null}

            <div className="grid gap-4 xl:grid-cols-3">
              <LeadSourceContextCard lead={lead} />
              <div id="lead-tasks">
                <EntityTasksPanel
                  key={tasksRefreshKey}
                  entityType="LEAD"
                  entityId={lead.id}
                  title="Lead follow-up tasks"
                  onTasksChanged={refreshLeadTasks}
                />
              </div>
              <EntityNotesPanel
                entityType="LEAD"
                entityId={lead.id}
                title="Lead notes"
              />
            </div>

            <RecentLeadTimeline lead={lead} tasks={leadTasks} onRefresh={refreshLeadTasks} />

            {selectedTask ? (
              <TaskDetailModal
                task={selectedTask}
                memberships={memberships}
                entityLabel={leadName(lead)}
                entityPath={`/leads/${lead.id}`}
                onClose={() => setSelectedTask(null)}
                onSaved={(updatedTask) => {
                  setSelectedTask(updatedTask);
                  refreshLeadTasks();
                }}
              />
            ) : null}
          </>
        ) : null}
      </div>

    </AppShell>
  );
}

function EditLeadCard({
  form,
  memberships,
  leadSources,
  saveLoading,
  saveError,
  onSubmit,
  onChange,
  onCancel,
}: {
  form: FormState;
  memberships: MembershipOption[];
  leadSources: LeadSourceOption[];
  saveLoading: boolean;
  saveError: RequestError | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onChange: (form: FormState) => void;
  onCancel: () => void;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-base font-semibold text-gray-900">Edit lead details</h2>
      <p className="mt-1 text-sm text-gray-600">Update lead information without changing lifecycle status.</p>
      <form className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={onSubmit}>
        <Field label="First name"><input value={form.firstName} onChange={(event) => onChange({ ...form, firstName: event.target.value })} className="rounded border border-gray-300 px-3 py-2 text-sm" /></Field>
        <Field label="Last name"><input value={form.lastName} onChange={(event) => onChange({ ...form, lastName: event.target.value })} className="rounded border border-gray-300 px-3 py-2 text-sm" /></Field>
        <Field label="Email"><input type="email" value={form.email} onChange={(event) => onChange({ ...form, email: event.target.value })} className="rounded border border-gray-300 px-3 py-2 text-sm" /></Field>
        <Field label="Phone"><input value={form.phone} onChange={(event) => onChange({ ...form, phone: event.target.value })} className="rounded border border-gray-300 px-3 py-2 text-sm" /></Field>
        <Field label="Temperature"><select value={form.temperature} onChange={(event) => onChange({ ...form, temperature: event.target.value as LeadTemperature | '' })} className="rounded border border-gray-300 bg-white px-3 py-2 text-sm"><option value="">Not set</option><option value="HOT">Hot</option><option value="WARM">Warm</option><option value="COLD">Cold</option></select></Field>
        <Field label="Owner"><select value={form.ownerId} onChange={(event) => onChange({ ...form, ownerId: event.target.value })} className="rounded border border-gray-300 bg-white px-3 py-2 text-sm"><option value="">Unassigned</option>{memberships.map((item) => <option key={item.id} value={item.userId}>{optionName(item)}</option>)}</select></Field>
        <Field label="Lead source"><select value={form.leadSourceId} onChange={(event) => onChange({ ...form, leadSourceId: event.target.value })} className="rounded border border-gray-300 bg-white px-3 py-2 text-sm"><option value="">No configured source</option>{leadSources.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        {saveError ? <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 sm:col-span-2 lg:col-span-4">{saveError.message}</p> : null}
        <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
          <button type="submit" disabled={saveLoading} className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:bg-emerald-300">{saveLoading ? 'Saving...' : 'Save'}</button>
          <button type="button" disabled={saveLoading} onClick={onCancel} className="rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700">Cancel</button>
        </div>
      </form>
    </section>
  );
}

function LeadProgressCard({ lead, tasks, nextTask, tasksLoading }: { lead: Lead; tasks: Task[]; nextTask: Task | null; tasksLoading: boolean }) {
  const shouldShowFollowUp = Boolean(nextTask) || lead.status === 'FOLLOW_UP_NEEDED';
  const sequence = followUpSequence(lead, tasks);
  const followUpOverdue = isOverdue(nextTask?.dueAt);
  const progressSteps = buildProgressSteps(lead, tasks, nextTask);
  const relativeDue = formatRelativeDate(nextTask?.dueAt);
  const statusMessage = shouldShowFollowUp
    ? followUpOverdue
      ? `Follow-up #${sequence} is ${relativeDue || 'overdue'}`
      : `This lead is waiting for follow-up #${sequence}`
    : lead.status === 'WON'
      ? 'This lead has been won.'
      : 'No active follow-up is currently waiting.';

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Lead Progress</h2>
        <p className="mt-1 text-sm text-gray-600">Track where this lead stands in the journey</p>
      </div>
      <div className="mt-7">
        <ol className="hidden items-start sm:flex">
          {progressSteps.map((step, index) => (
            <li key={`${step.kind}-${step.id}-${index}`} className="flex min-w-0 flex-1 items-start">
              <ProgressStepView step={step} />
              {index < progressSteps.length - 1 ? (
                <ProgressConnector
                  from={step}
                  to={progressSteps[index + 1]}
                />
              ) : null}
            </li>
          ))}
        </ol>
        <ol className="space-y-0 sm:hidden">
          {progressSteps.map((step, index) => (
            <li key={`${step.kind}-${step.id}-${index}`} className="flex">
              <ProgressMobileRail step={step} isLast={index === progressSteps.length - 1} />
              <ProgressMobileContent step={step} />
            </li>
          ))}
        </ol>
      </div>
      {tasksLoading ? <p className="mt-5 rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">Loading follow-up state...</p> : null}
      {!tasksLoading && shouldShowFollowUp ? (
        <p className={`mt-5 rounded border p-3 text-sm ${followUpOverdue ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
          {statusMessage}
        </p>
      ) : null}
      {!tasksLoading && !shouldShowFollowUp ? (
        <p className={`mt-5 rounded border p-3 text-sm ${lead.status === 'WON' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>{statusMessage}</p>
      ) : null}
    </section>
  );
}

function ProgressStepView({ step }: { step: ProgressStep }) {
  if (step.kind === 'follow-up') {
    return <FollowUpNode step={step} />;
  }

  return <ProgressStageNode step={step} />;
}

function ProgressStageNode({ step }: { step: Extract<ProgressStep, { kind: 'stage' }> }) {
  const nodeClassName = step.completed
    ? 'border-emerald-700 bg-emerald-700 text-white'
    : step.current && step.lost
      ? 'border-red-300 bg-red-50 text-red-700'
      : step.current
        ? 'border-emerald-700 bg-white text-emerald-700'
        : 'border-gray-300 bg-white text-gray-400';

  return (
    <div className="flex min-w-0 shrink-0 flex-col items-center text-center">
      <span className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${nodeClassName}`}>
        {step.completed ? <Icon path={ICONS.check} /> : step.lost ? <Icon path={ICONS.close} /> : null}
      </span>
      <span className="mt-3 block w-24 max-w-24">
        <span className="block truncate text-sm font-semibold text-gray-900" title={step.label}>{step.label}</span>
        <span className="mt-1 block text-xs text-gray-500">{formatDate(step.date)}</span>
      </span>
    </div>
  );
}

function FollowUpNode({ step }: { step: Extract<ProgressStep, { kind: 'follow-up' }> }) {
  return (
    <div className="flex min-w-0 shrink-0 flex-col items-center text-center">
      <span className={`relative flex h-10 w-10 items-center justify-center rounded-full border-2 bg-white ${step.overdue ? 'border-red-300 text-red-700 ring-4 ring-red-50' : 'border-amber-300 text-amber-700 ring-4 ring-amber-50'}`}>
        <Icon path={ICONS.refresh} />
        <span className={`absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold text-white ${step.overdue ? 'bg-red-600' : 'bg-amber-500'}`}>
          {step.sequence}
        </span>
      </span>
      <span className="mt-3 block w-28 max-w-28">
        <span className="block text-sm font-semibold text-gray-900">
          {step.label}
        </span>
        <span className={`mt-1 block text-xs font-semibold ${step.overdue ? 'text-red-700' : 'text-amber-700'}`}>{step.overdue ? 'Overdue' : 'Waiting'}</span>
        <span className="mt-1 block text-xs text-gray-500">{step.dueAt ? formatRelativeDate(step.dueAt) : '-'}</span>
      </span>
    </div>
  );
}

function ProgressConnector({ from, to }: { from: ProgressStep; to: ProgressStep }) {
  const temporarySegment = from.kind === 'follow-up' || to.kind === 'follow-up';
  const overdueSegment = from.kind === 'follow-up' ? from.overdue : to.kind === 'follow-up' ? to.overdue : false;
  const color = overdueSegment ? 'border-red-300' : temporarySegment ? 'border-amber-300' : 'border-gray-300';
  const completed = from.kind === 'stage' && from.completed && to.kind === 'stage' && to.completed;

  return (
    <span className="mt-5 min-w-8 flex-1 px-2" aria-hidden="true">
      <span className={`block border-t ${temporarySegment ? 'border-dashed' : 'border-solid'} ${completed ? 'border-emerald-600' : color}`} />
    </span>
  );
}

function ProgressMobileRail({ step, isLast }: { step: ProgressStep; isLast: boolean }) {
  return (
    <div className="flex w-10 shrink-0 flex-col items-center">
      {step.kind === 'follow-up' ? <MobileFollowUpCircle step={step} /> : <MobileStageCircle step={step} />}
      {!isLast ? <span className={`h-8 border-l ${step.kind === 'follow-up' ? step.overdue ? 'border-dashed border-red-300' : 'border-dashed border-amber-300' : 'border-gray-300'}`} aria-hidden="true" /> : null}
    </div>
  );
}

function ProgressMobileContent({ step }: { step: ProgressStep }) {
  if (step.kind === 'follow-up') {
    return (
      <div className="min-w-0 pb-4 pl-3">
        <p className="text-sm font-semibold text-gray-900">{step.label}</p>
        <p className={`mt-1 text-xs font-semibold ${step.overdue ? 'text-red-700' : 'text-amber-700'}`}>{step.overdue ? 'Overdue' : 'Waiting'}</p>
        <p className="mt-1 text-xs text-gray-500">{step.dueAt ? formatRelativeDate(step.dueAt) : '-'}</p>
      </div>
    );
  }

  return (
    <div className="min-w-0 pb-4 pl-3">
      <p className="text-sm font-semibold text-gray-900">{step.label}</p>
      <p className="mt-1 text-xs text-gray-500">{formatDate(step.date)}</p>
    </div>
  );
}

function MobileStageCircle({ step }: { step: Extract<ProgressStep, { kind: 'stage' }> }) {
  const className = step.completed
    ? 'border-emerald-700 bg-emerald-700 text-white'
    : step.current && step.lost
      ? 'border-red-300 bg-red-50 text-red-700'
      : step.current
        ? 'border-emerald-700 bg-white text-emerald-700'
        : 'border-gray-300 bg-white text-gray-400';

  return (
    <span className={`flex h-9 w-9 items-center justify-center rounded-full border-2 ${className}`}>
      {step.completed ? <Icon path={ICONS.check} /> : step.lost ? <Icon path={ICONS.close} /> : null}
    </span>
  );
}

function MobileFollowUpCircle({ step }: { step: Extract<ProgressStep, { kind: 'follow-up' }> }) {
  return (
    <span className={`relative flex h-9 w-9 items-center justify-center rounded-full border-2 bg-white ${step.overdue ? 'border-red-300 text-red-700' : 'border-amber-300 text-amber-700'}`}>
      <Icon path={ICONS.refresh} />
      <span className={`absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white ${step.overdue ? 'bg-red-600' : 'bg-amber-500'}`}>{step.sequence}</span>
    </span>
  );
}

function NextActionCard({
  lead,
  task,
  tasksLoading,
  assignee,
  sequence,
  busy,
  onComplete,
  onReschedule,
}: {
  lead: Lead;
  task: Task | null;
  tasksLoading: boolean;
  assignee: string;
  sequence: number;
  busy: boolean;
  onComplete: () => void;
  onReschedule: () => void;
}) {
  const overdue = isOverdue(task?.dueAt);
  const statusLabel = task ? overdue ? 'Overdue' : TASK_STATUS_LABELS[task.status] : 'No active follow-up';

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900">Next Action (Follow-up)</h2>
        <span className={`rounded-full px-2 py-1 text-xs font-medium ${overdue ? 'bg-red-100 text-red-800' : task ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
          {statusLabel}
        </span>
      </div>
      {tasksLoading ? <p className="mt-5 rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">Loading next action...</p> : null}
      {!tasksLoading && !task ? (
        <div className="mt-5 rounded border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-medium text-gray-900">No follow-up task is scheduled.</p>
          <a className="mt-3 inline-flex rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800" href="#lead-tasks">Create Task</a>
        </div>
      ) : null}
      {!tasksLoading && task ? (
        <div className="mt-5 space-y-3 text-sm text-gray-700">
          <p className="flex items-start gap-2 font-medium text-gray-900"><Icon path={ICONS.phone} />{task.title}</p>
          <p className={`flex items-start gap-2 ${overdue ? 'font-semibold text-red-700' : 'font-semibold text-gray-900'}`}>
            <Icon path={ICONS.calendar} />
            Due: {formatDateTime(task.dueAt)} {task.dueAt ? `(${formatRelativeDate(task.dueAt)})` : ''}
          </p>
          <p className="flex items-start gap-2"><Icon path={ICONS.user} />Assigned to: {assignee}</p>
          <p className="flex items-start gap-2">
            <Icon path={ICONS.flag} />
            Priority:
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${priorityLabel(lead) === 'High' ? 'bg-red-100 text-red-700' : priorityLabel(lead) === 'Medium' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'}`}>
              {priorityLabel(lead)}
            </span>
          </p>
          <p className="text-xs text-gray-500">Follow-up #{sequence}</p>
          <div className="flex flex-wrap gap-3 pt-2">
            <button type="button" disabled={busy} onClick={onComplete} className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:bg-emerald-300">
              {busy ? 'Completing...' : 'Complete Follow-up'}
            </button>
            <button type="button" disabled={busy} onClick={onReschedule} className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:text-gray-400">
              Reschedule
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function RecentLeadTimeline({ lead, tasks, onRefresh }: { lead: Lead; tasks: Task[]; onRefresh: () => void }) {
  const source = lead.leadSource?.name ?? sourceLabel(lead.source);
  const nextTask = getNextActionTask(tasks);
  const events = [
    { id: 'created', title: 'Lead created', context: `From ${source}`, actor: source, date: lead.createdAt, icon: ICONS.plus, tone: 'green' },
    { id: 'contacted', title: 'Contacted the lead', context: lead.status === 'NEW' ? 'Awaiting first contact' : 'By Demo User', actor: 'Demo User', date: lead.updatedAt, icon: ICONS.phone, tone: 'green' },
    { id: 'completed', title: 'Follow-up completed', context: 'Discussed needs', actor: 'Demo User', date: '2024-06-17T11:40:00.000Z', icon: ICONS.calendar, tone: 'blue' },
    { id: 'note', title: 'Note added', context: 'Interested in pricing', actor: 'Demo User', date: '2024-06-18T14:15:00.000Z', icon: ICONS.note, tone: 'purple' },
    { id: 'scheduled', title: 'Follow-up scheduled', context: nextTask ? `Follow-up #${followUpSequence(lead, tasks)}` : 'No active follow-up', actor: 'Demo User', date: nextTask?.updatedAt ?? lead.updatedAt, icon: ICONS.calendar, tone: 'amber' },
    { id: 'stage', title: 'Stage updated', context: `Moved to ${STATUS_LABELS[lead.status]}`, actor: 'Demo User', date: lead.updatedAt, icon: ICONS.person, tone: 'green' },
  ];

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Recent lead activity</h2>
          <p className="mt-1 text-sm text-gray-600">{events.length} related activities</p>
        </div>
        <button type="button" onClick={onRefresh} className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
          Refresh
        </button>
      </div>
      <ol className="mt-6 grid gap-5 md:grid-cols-3 xl:grid-cols-6">
        {events.map((event, index) => (
          <li key={event.id} className="relative flex gap-3 md:block">
            {index < events.length - 1 ? <span className="absolute left-5 top-10 h-[calc(100%-1rem)] w-px bg-gray-200 md:left-1/2 md:top-5 md:h-px md:w-full" aria-hidden="true" /> : null}
            <span className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-white ${timelineTone(event.tone)}`}>
              <Icon path={event.icon} />
            </span>
            <div className="min-w-0 md:mt-3">
              <p className="text-sm font-semibold text-gray-900">{event.title}</p>
              <p className="mt-1 text-xs text-gray-600">{event.context}</p>
              <p className="mt-1 text-xs text-gray-500">{event.actor}</p>
              <time className="mt-2 block text-xs text-gray-600" dateTime={event.date}>{formatDateTime(event.date)}</time>
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className="mx-auto mt-6 block text-sm font-semibold text-gray-800 underline decoration-gray-300 underline-offset-4 hover:text-gray-950">
        View all activity
      </button>
    </section>
  );
}

function timelineTone(tone: string) {
  if (tone === 'blue') return 'border-blue-200 text-blue-700';
  if (tone === 'purple') return 'border-purple-200 text-purple-700';
  if (tone === 'amber') return 'border-amber-200 text-amber-700';
  return 'border-emerald-200 text-emerald-700';
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">{label}{children}</label>;
}
