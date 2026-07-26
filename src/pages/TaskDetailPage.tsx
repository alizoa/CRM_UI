import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ActivityCommentTimeline } from '../components/leads/ActivityCommentTimeline';
import { AppShell } from '../components/layout/AppShell';
import { EntityNotesPanel } from '../components/notes/EntityNotesPanel';
import { TaskProgress } from '../components/tasks/TaskProgress';
import { useTaskActivities } from '../components/tasks/useTaskActivities';
import { useTaskChangeDocumentation } from '../components/tasks/useTaskChangeDocumentation';
import { useAuth } from '../context/AuthContext';
import { listMembershipOptions, type MembershipOption } from '../lib/memberships';
import {
  completeTask,
  listTasks,
  previewTaskComplete,
  previewTaskReopen,
  previewTaskUpdate,
  reopenTask,
  subscribeToTaskChanges,
  updateTask,
  type Task,
  type TaskStatus,
  type TaskType,
  type UpdateTaskInput,
} from '../lib/tasks';

type FormState = {
  title: string;
  taskType: TaskType;
  status: TaskStatus;
  description: string;
  dueAt: string;
  assigneeId: string;
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  WAITING: 'Waiting',
  DONE: 'Done',
};

function toLocalDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formState(task: Task): FormState {
  return {
    title: task.title,
    taskType: task.taskType,
    status: task.status,
    description: task.description ?? '',
    dueAt: toLocalDateTime(task.dueAt),
    assigneeId: task.assigneeId ?? '',
  };
}

function updateInput(form: FormState): UpdateTaskInput {
  return {
    title: form.title.trim(),
    taskType: form.taskType,
    status: form.status,
    description: form.description.trim() || null,
    dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
    assigneeId: form.assigneeId || null,
  };
}

function memberName(membership: MembershipOption) {
  return [membership.user.firstName, membership.user.lastName].filter(Boolean).join(' ') || membership.user.email;
}

function errorMessage(error: unknown, fallback = 'Could not update task.') {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { accessToken } = useAuth();
  const validId = Boolean(id?.trim()) && !id?.includes('/');
  const [task, setTask] = useState<Task | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [memberships, setMemberships] = useState<MembershipOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { runTaskChange, documentationDialog } = useTaskChangeDocumentation({
    getErrorMessage: (error) => errorMessage(error, 'Could not save change documentation.'),
  });
  const { activities, loading: activitiesLoading, error: activitiesError, refresh: fetchActivities } = useTaskActivities(id);

  const fetchTask = useCallback(async () => {
    if (!accessToken || !id || !validId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const response = await listTasks(accessToken, { page: 1, limit: 1000 });
      const nextTask = response.data.find((item) => item.id === id) ?? null;
      setTask(nextTask);
      setForm(nextTask ? formState(nextTask) : null);
    } catch (error) {
      setLoadError(errorMessage(error, 'Could not load task.'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, id, validId]);

  useEffect(() => {
    void fetchTask();
  }, [fetchTask]);

  useEffect(() => {
    if (!accessToken) return;
    void listMembershipOptions(accessToken).then(setMemberships).catch(() => setMemberships([]));
  }, [accessToken]);

  useEffect(() => subscribeToTaskChanges(() => void fetchTask()), [fetchTask]);

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !task || !form) return;
    if (!form.title.trim()) {
      setSaveError('Task title is required.');
      return;
    }
    const input = updateInput(form);
    const preview = previewTaskUpdate(task, input);
    if (preview.changes.length === 0) {
      setSaveError(null);
      setSuccess('No task changes to save.');
      return;
    }
    runTaskChange({
      task,
      preview,
      source: 'details',
      title: 'Confirm task changes',
      description: 'Review these Task changes before saving.',
      run: async (context) => {
        setSaving(true);
        setSaveError(null);
        setSuccess(null);
        try {
          const updated = await updateTask(accessToken, task.id, input, context);
          setTask(updated);
          setForm(formState(updated));
          setSuccess('Task saved.');
        } finally {
          setSaving(false);
        }
      },
      onError: (error) => setSaveError(errorMessage(error)),
    });
  };

  const toggleCompletion = () => {
    if (!accessToken || !task) return;
    const completed = task.status === 'DONE';
    const preview = completed ? previewTaskReopen(task) : previewTaskComplete(task);
    runTaskChange({
      task,
      preview,
      source: 'details',
      title: completed ? 'Reopen task?' : 'Complete task?',
      description: 'Review this Task status change before saving.',
      confirmLabel: completed ? 'Reopen task' : 'Complete task',
      run: async (context) => {
        setSaving(true);
        setSaveError(null);
        setSuccess(null);
        try {
          const updated = completed
            ? await reopenTask(accessToken, task.id, context)
            : await completeTask(accessToken, task.id, context);
          setTask(updated);
          setForm(formState(updated));
          setSuccess(completed ? 'Task reopened.' : 'Task completed.');
        } finally {
          setSaving(false);
        }
      },
      onError: (error) => setSaveError(errorMessage(error)),
    });
  };

  return (
    <AppShell>
      <div className="space-y-4">
        <Link to="/tasks" className="inline-flex text-sm font-medium text-gray-800 underline decoration-gray-400 underline-offset-2 hover:text-gray-950">
          Back to Tasks
        </Link>

        {!validId ? (
          <section className="rounded-lg border border-red-200 bg-white p-5">
            <h1 className="font-semibold text-red-900">Invalid task ID</h1>
            <p className="mt-2 text-sm text-red-700">The task address is not valid.</p>
          </section>
        ) : null}
        {validId && loading ? <p className="rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-600">Loading task...</p> : null}
        {validId && !loading && loadError ? (
          <section className="rounded-lg border border-red-200 bg-white p-5">
            <h1 className="font-semibold text-red-900">Could not load task</h1>
            <p className="mt-2 text-sm text-red-700">{loadError}</p>
            <button type="button" onClick={() => void fetchTask()} className="mt-4 rounded bg-red-700 px-4 py-2 text-sm font-semibold text-white">Retry</button>
          </section>
        ) : null}
        {validId && !loading && !loadError && !task ? (
          <section className="rounded-lg border border-gray-200 bg-white p-5">
            <h1 className="font-semibold text-gray-900">Task not found</h1>
            <p className="mt-2 text-sm text-gray-600">This task does not exist in the demo workspace.</p>
          </section>
        ) : null}

        {task && form ? (
          <>
            <TaskProgress
              task={{
                ...task,
                status: form.status,
                waitingFromStatus: form.status === 'WAITING'
                  ? task.status === 'WAITING'
                    ? task.waitingFromStatus
                    : task.status === 'TODO'
                      ? 'TODO'
                      : 'IN_PROGRESS'
                  : null,
              }}
              activities={task.status === 'WAITING' ? activities : []}
            />

            <form onSubmit={save} className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
                <h1 className="text-xl font-semibold text-gray-900">Task details</h1>
                <dl className="grid gap-4 rounded border border-gray-200 bg-gray-50 px-4 py-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                  <div className="xl:border-r xl:border-gray-200 xl:pr-4">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Related {task.entityType.toLowerCase()}</dt>
                    <dd className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-gray-900">
                      <span>{task.entitySummary?.displayName ?? task.entityId}</span>
                      <Link to={`/${task.entityType.toLowerCase()}s/${task.entityId}`} className="font-medium underline decoration-gray-300 underline-offset-2 hover:text-gray-700">
                        Open {task.entityType.toLowerCase()}
                      </Link>
                    </dd>
                  </div>
                  <Meta label="Created" value={formatDateTime(task.createdAt)} />
                  <Meta label="Last updated" value={formatDateTime(task.updatedAt)} />
                  <Meta label="Completed" value={task.completedAt ? formatDateTime(task.completedAt) : '—'} />
                </dl>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Title" wide><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="rounded border border-gray-300 px-3 py-2 font-normal" /></Field>
                  <Field label="Status"><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as TaskStatus })} className="rounded border border-gray-300 bg-white px-3 py-2 font-normal">{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                  <Field label="Task type"><select value={form.taskType} onChange={(event) => setForm({ ...form, taskType: event.target.value as TaskType })} className="rounded border border-gray-300 bg-white px-3 py-2 font-normal"><option value="GENERAL">General</option><option value="FOLLOW_UP">Follow up</option></select></Field>
                  <Field label="Due date and time"><input type="datetime-local" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} className="rounded border border-gray-300 px-3 py-2 font-normal" /></Field>
                  <Field label="Assignee"><select value={form.assigneeId} onChange={(event) => setForm({ ...form, assigneeId: event.target.value })} className="rounded border border-gray-300 bg-white px-3 py-2 font-normal"><option value="">No assignee</option>{memberships.map((membership) => <option key={membership.id} value={membership.userId}>{memberName(membership)}</option>)}</select></Field>
                  <Field label="Description" wide><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="min-h-28 rounded border border-gray-300 px-3 py-2 font-normal" /></Field>
                </div>
                {success ? <p className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">{success}</p> : null}
                {saveError ? <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{saveError}</p> : null}
                <div className="flex flex-wrap gap-3">
                  <button disabled={saving} className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:bg-gray-400">{saving ? 'Saving...' : 'Save task'}</button>
                  <button type="button" disabled={saving} onClick={toggleCompletion} className={task.status === 'DONE' ? 'rounded border border-gray-300 px-4 py-2 text-sm font-medium' : 'rounded bg-green-700 px-4 py-2 text-sm font-medium text-white'}>{task.status === 'DONE' ? 'Reopen task' : 'Complete task'}</button>
                </div>
            </form>

            <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(280px,1fr)_minmax(0,2fr)]">
              <EntityNotesPanel entityType="TASK" entityId={task.id} title="Notes" description="General information about this task." collapsibleComposer />
              <ActivityCommentTimeline
                entityType="TASK"
                entityId={task.id}
                relatedTaskId={task.id}
                subtitle="Change history and event-specific comments for this task."
                activities={activities}
                loading={activitiesLoading}
                error={activitiesError}
                tasks={[task]}
                onRefresh={fetchActivities}
              />
            </div>
          </>
        ) : null}
      </div>
      {documentationDialog}
    </AppShell>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return <label className={`flex flex-col gap-1 text-sm font-medium text-gray-700 ${wide ? 'sm:col-span-2' : ''}`}>{label}{children}</label>;
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</dt><dd className="mt-1 break-words text-gray-900">{value}</dd></div>;
}
