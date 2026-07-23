import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ChangeDocumentationDialog, type ChangeDocumentationResult } from '../activities/ChangeDocumentationDialog';
import { useAuth } from '../../context/AuthContext';
import { buildChangeSummaryItems } from '../../lib/activity-formatting';
import { shouldRequestChangeDocumentation } from '../../lib/change-documentation-settings';
import type { HttpError } from '../../lib/http';
import { listMembershipOptions, type MembershipOption } from '../../lib/memberships';
import {
  buildTaskMutationContext,
  completeTask,
  createTask,
  listTasks,
  previewTaskComplete,
  previewTaskReopen,
  reopenTask,
  type CreateTaskInput,
  type EntityType,
  type Task,
  type TaskActivityPreview,
  type TaskMutationContext,
  type TaskStatus,
  type TasksResponse,
} from '../../lib/tasks';
import { TaskDetailModal } from './TaskDetailModal';

type EntityTasksPanelProps = {
  entityType: EntityType;
  entityId: string;
  title?: string;
  onTasksChanged?: () => void;
};

type RequestError = {
  status: number;
  message: string;
};

type TaskDocumentationRequest = {
  title: string;
  description: string;
  subjectLabel: string;
  changes: ReturnType<typeof buildChangeSummaryItems>;
  confirmLabel?: string;
  onConfirm: (result: ChangeDocumentationResult) => Promise<void>;
};

type TaskFormState = {
  title: string;
  description: string;
  dueAt: string;
  assigneeId: string;
};

const EMBEDDED_TASK_LIMIT = 5;
const INITIAL_FORM: TaskFormState = {
  title: '',
  description: '',
  dueAt: '',
  assigneeId: '',
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  WAITING: 'Waiting',
  DONE: 'Done',
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

function getMembershipName(membership: MembershipOption) {
  return [membership.user.firstName, membership.user.lastName].filter(Boolean).join(' ') || membership.user.email;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function buildCreateTaskInput(entityType: EntityType, entityId: string, form: TaskFormState): CreateTaskInput {
  const input: CreateTaskInput = {
    entityType,
    entityId,
    title: form.title.trim(),
  };

  const description = form.description.trim();

  if (description) {
    input.description = description;
  }

  if (form.dueAt) {
    input.dueAt = new Date(form.dueAt).toISOString();
  }

  if (form.assigneeId) {
    input.assigneeId = form.assigneeId;
  }

  return input;
}

function getTaskActionError(error: unknown) {
  const requestError = toRequestError(error, 'Could not update task.');

  if (requestError.status === 403) {
    return 'You do not have permission to update tasks.';
  }

  return requestError.message;
}

function isTaskCompleted(task: Task) {
  return task.status === 'DONE';
}

function getStatusClassName(status: TaskStatus) {
  if (status === 'DONE') {
    return 'rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-800';
  }

  if (status === 'IN_PROGRESS') {
    return 'rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800';
  }

  if (status === 'WAITING') {
    return 'rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800';
  }

  return 'rounded bg-white px-2 py-1 text-xs font-medium text-gray-700';
}

export function EntityTasksPanel({ entityType, entityId, title = 'Related tasks', onTasksChanged }: EntityTasksPanelProps) {
  const { accessToken, user } = useAuth();
  const [tasksData, setTasksData] = useState<TasksResponse | null>(null);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<RequestError | null>(null);
  const [memberships, setMemberships] = useState<MembershipOption[]>([]);
  const [membershipsLoading, setMembershipsLoading] = useState(false);
  const [membershipWarning, setMembershipWarning] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState<TaskFormState>(INITIAL_FORM);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<RequestError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [documentationRequest, setDocumentationRequest] = useState<TaskDocumentationRequest | null>(null);
  const [documentationSubmitting, setDocumentationSubmitting] = useState(false);
  const [documentationError, setDocumentationError] = useState<string | null>(null);

  const membershipsByUserId = useMemo(() => new Map(memberships.map((membership) => [membership.userId, membership])), [memberships]);
  const tasks = tasksData?.data ?? [];
  const totalTasks = tasksData?.total ?? tasks.length;
  const entityLabel = selectedTask?.entitySummary?.displayName ?? entityId;
  const entityPath =
    entityType === 'CONTACT'
      ? `/contacts/${entityId}`
      : entityType === 'DEAL'
        ? `/deals/${entityId}`
        : `/leads/${entityId}`;

  const refreshTasks = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!accessToken) {
      setTasksData(null);
      setTasksLoading(false);
      setTasksError(null);
      return;
    }

    let active = true;
    const token = accessToken;

    async function fetchTasks() {
      setTasksLoading(true);
      setTasksError(null);

      try {
        const response = await listTasks(token, {
          entityType,
          entityId,
          page: 1,
          limit: EMBEDDED_TASK_LIMIT,
        });

        if (!active) {
          return;
        }

        setTasksData(response);
      } catch (requestError) {
        if (!active) {
          return;
        }

        setTasksData(null);
        setTasksError(toRequestError(requestError, 'Could not load related tasks.'));
      } finally {
        if (active) {
          setTasksLoading(false);
        }
      }
    }

    void fetchTasks();

    return () => {
      active = false;
    };
  }, [accessToken, entityId, entityType, refreshKey]);

  useEffect(() => {
    if (!accessToken) {
      setMemberships([]);
      setMembershipsLoading(false);
      setMembershipWarning(null);
      return;
    }

    let active = true;
    const token = accessToken;

    async function fetchMemberships() {
      setMembershipsLoading(true);
      setMembershipWarning(null);

      try {
        const response = await listMembershipOptions(token);
        if (!active) {
          return;
        }

        setMemberships(response);
      } catch {
        if (!active) {
          return;
        }

        setMemberships([]);
        setMembershipWarning('Assignee options could not be loaded.');
      } finally {
        if (active) {
          setMembershipsLoading(false);
        }
      }
    }

    void fetchMemberships();

    return () => {
      active = false;
    };
  }, [accessToken]);

  const resetForm = () => {
    setForm(INITIAL_FORM);
    setCreateError(null);
  };

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken) {
      setCreateError({
        status: 401,
        message: 'You need to sign in before creating tasks.',
      });
      return;
    }

    if (!form.title.trim()) {
      setCreateError({
        status: 422,
        message: 'Task title is required.',
      });
      return;
    }

    setCreateLoading(true);
    setCreateError(null);
    setSuccessMessage(null);

    try {
      await createTask(accessToken, buildCreateTaskInput(entityType, entityId, form), buildTaskMutationContext(user, 'embedded_task_panel'));
      resetForm();
      setShowCreateForm(false);
      setSuccessMessage('Task created.');
      refreshTasks();
      onTasksChanged?.();
    } catch (requestError) {
      const error = toRequestError(requestError, 'Could not create task.');
      setCreateError({
        status: error.status,
        message: error.status === 403 ? 'You do not have permission to create tasks.' : error.message,
      });
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <section className="rounded border border-gray-200 bg-white p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <p className="mt-1 text-sm text-gray-600">
            {totalTasks === 1 ? '1 related task' : `${totalTasks} related tasks`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            to="/tasks"
          >
            View all tasks
          </Link>
          <button
            type="button"
            onClick={() => {
              setShowCreateForm((current) => !current);
              setCreateError(null);
              setSuccessMessage(null);
            }}
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            {showCreateForm ? 'Close Create Task' : 'Create Task'}
          </button>
        </div>
      </div>

      {membershipWarning ? <p className="mt-4 rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">{membershipWarning}</p> : null}
      {successMessage ? <p className="mt-4 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">{successMessage}</p> : null}

      {showCreateForm ? (
        <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={handleCreateSubmit}>
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
            Title
            <input
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
            Due date and time
            <input
              type="datetime-local"
              value={form.dueAt}
              onChange={(event) => setForm((current) => ({ ...current, dueAt: event.target.value }))}
              className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
            Assignee
            <select
              value={form.assigneeId}
              onChange={(event) => setForm((current) => ({ ...current, assigneeId: event.target.value }))}
              disabled={membershipsLoading || memberships.length === 0}
              className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
            >
              <option value="">No assignee</option>
              {memberships.map((membership) => (
                <option key={membership.id} value={membership.userId}>
                  {getMembershipName(membership)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-700 sm:col-span-2">
            Description
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              className="min-h-20 rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
          </label>
          <div className="sm:col-span-2">
            {createError ? <p className="mb-3 text-sm text-red-700">{createError.message}</p> : null}
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={createLoading}
                className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {createLoading ? 'Creating...' : 'Create task'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                disabled={createLoading}
                className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
              >
                Reset
              </button>
            </div>
          </div>
        </form>
      ) : null}

      {tasksLoading ? <p className="mt-5 rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">Loading related tasks...</p> : null}

      {!tasksLoading && tasksError ? (
        <div className="mt-5 rounded border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{tasksError.message}</p>
          <button
            type="button"
            onClick={refreshTasks}
            className="mt-3 rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            Retry
          </button>
        </div>
      ) : null}

      {!tasksLoading && !tasksError && tasks.length === 0 ? (
        <p className="mt-5 rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">No related tasks yet.</p>
      ) : null}

      {!tasksLoading && !tasksError && tasks.length > 0 ? (
        <div className="mt-5 space-y-3">
          {tasks.map((task) => (
            <EmbeddedTaskCard
              key={task.id}
              task={task}
              accessToken={accessToken}
              membershipsByUserId={membershipsByUserId}
              onChanged={refreshTasks}
              onTasksChanged={onTasksChanged}
              onOpenTask={setSelectedTask}
              onRequestDocumentation={(request) => {
                setDocumentationError(null);
                setDocumentationRequest(request);
              }}
            />
          ))}
          {totalTasks > tasks.length ? (
            <p className="text-sm text-gray-600">
              Showing {tasks.length} of {totalTasks}.{' '}
              <Link className="font-medium underline decoration-gray-300 underline-offset-2 hover:text-gray-700" to="/tasks">
                View all tasks
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
      {selectedTask ? (
        <TaskDetailModal
          task={selectedTask}
          memberships={memberships}
          entityLabel={entityLabel}
          entityPath={entityPath}
          mutationSource="embedded_task_panel"
          onClose={() => setSelectedTask(null)}
          onSaved={(updatedTask) => {
            setSelectedTask(updatedTask);
            refreshTasks();
            onTasksChanged?.();
          }}
        />
      ) : null}
      <ChangeDocumentationDialog
        open={Boolean(documentationRequest)}
        mode="optional-comment"
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
          } catch (error) {
            setDocumentationError(getTaskActionError(error));
          } finally {
            setDocumentationSubmitting(false);
          }
        }}
      />
    </section>
  );
}

type EmbeddedTaskCardProps = {
  task: Task;
  accessToken: string | null;
  membershipsByUserId: Map<string, MembershipOption>;
  onChanged: () => void;
  onTasksChanged?: () => void;
  onOpenTask: (task: Task) => void;
  onRequestDocumentation: (request: TaskDocumentationRequest) => void;
};

function EmbeddedTaskCard({ task, accessToken, membershipsByUserId, onChanged, onTasksChanged, onOpenTask, onRequestDocumentation }: EmbeddedTaskCardProps) {
  const { user } = useAuth();
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const completed = isTaskCompleted(task);
  const membership = task.assigneeId ? membershipsByUserId.get(task.assigneeId) : undefined;
  const assigneeLabel = membership ? getMembershipName(membership) : task.assigneeId ?? 'Unassigned';

  const runAction = async () => {
    if (!accessToken) {
      setActionError('You need to sign in before updating tasks.');
      return;
    }

    const preview = completed ? previewTaskReopen(task) : previewTaskComplete(task);
    const execute = async (result?: ChangeDocumentationResult) => {
      setActionLoading(true);
      setActionError(null);
      try {
        const context = buildTaskMutationContext(user, 'embedded_task_panel', result ?? undefined);
        if (completed) {
          await reopenTask(accessToken, task.id, context);
        } else {
          await completeTask(accessToken, task.id, context);
        }
        onChanged();
        onTasksChanged?.();
      } catch (requestError) {
        setActionError(getTaskActionError(requestError));
        throw requestError;
      } finally {
        setActionLoading(false);
      }
    };

    if (preview.isDirectLeadTask && preview.documentationActions.some((action) => shouldRequestChangeDocumentation(action))) {
      onRequestDocumentation({
        title: completed ? 'Reopen task?' : 'Complete task?',
        description: 'Review this Task status change before saving.',
        subjectLabel: task.title,
        changes: buildChangeSummaryItems(preview.changes),
        confirmLabel: completed ? 'Reopen task' : 'Complete task',
        onConfirm: execute,
      });
      return;
    }

    void execute().catch(() => {
      // Error state is shown on the task card.
    });
  };

  return (
    <article className="rounded border border-gray-200 bg-gray-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">{task.title}</h3>
            <span className={getStatusClassName(task.status)}>{STATUS_LABELS[task.status]}</span>
          </div>
          {task.description ? <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{task.description}</p> : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => onOpenTask(task)}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Details
          </button>
          <button
            type="button"
            onClick={runAction}
            disabled={actionLoading}
            className={
              completed
                ? 'rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400'
                : 'rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400'
            }
          >
            {actionLoading ? 'Updating...' : completed ? 'Reopen' : 'Complete'}
          </button>
        </div>
      </div>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
        <TaskMeta label="Assignee" value={assigneeLabel} />
        <TaskMeta label="Due" value={formatDateTime(task.dueAt)} />
        <TaskMeta label="Created" value={formatDateTime(task.createdAt)} />
        {task.completedAt ? <TaskMeta label="Completed" value={formatDateTime(task.completedAt)} /> : null}
      </dl>
      {actionError ? <p className="mt-3 text-sm text-red-700">{actionError}</p> : null}
    </article>
  );
}

type TaskMetaProps = {
  label: string;
  value: string;
};

function TaskMeta({ label, value }: TaskMetaProps) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 break-words text-gray-900">{value}</dd>
    </div>
  );
}
