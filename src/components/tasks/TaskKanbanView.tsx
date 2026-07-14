import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Contact } from '../../lib/contacts';
import type { Deal } from '../../lib/deals';
import type { Lead } from '../../lib/leads';
import type { MembershipOption } from '../../lib/memberships';
import {
  completeTask,
  reopenTask,
  updateTaskStatus,
  type EntityType,
  type Task,
  type TaskStatus,
} from '../../lib/tasks';

const ENTITY_LABELS: Record<EntityType, string> = {
  LEAD: 'Lead',
  CONTACT: 'Contact',
  DEAL: 'Deal',
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  WAITING: 'Waiting',
  DONE: 'Done',
};

const KANBAN_COLUMNS: Array<{ status: TaskStatus; helper: string }> = [
  { status: 'TODO', helper: 'Tasks not started yet.' },
  { status: 'IN_PROGRESS', helper: 'Tasks being worked on.' },
  { status: 'WAITING', helper: 'Waiting for customer, approval, or response.' },
  { status: 'DONE', helper: 'Completed tasks.' },
];

function getContactOptionName(contact: Contact) {
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email || contact.phone || 'Unnamed contact';
}

function getLeadOptionName(lead: Lead) {
  return [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email || lead.phone || 'Unnamed lead';
}

function getDealOptionName(deal: Deal) {
  return `${deal.title} (${deal.status})`;
}

function getMembershipName(membership: MembershipOption) {
  return [membership.user.firstName, membership.user.lastName].filter(Boolean).join(' ') || membership.user.email;
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function getLocalDayStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

type DueStatus = {
  label: string;
  tone: 'overdue' | 'today' | 'future' | 'none' | 'completed';
};

function isTaskCompleted(task: Task) {
  return task.status === 'DONE';
}

function getDueStatus(task: Task): DueStatus {
  if (isTaskCompleted(task)) {
    return {
      label: task.completedAt ? `Completed ${formatShortDate(task.completedAt)}` : 'Completed',
      tone: 'completed',
    };
  }

  if (!task.dueAt) {
    return {
      label: 'No due date',
      tone: 'none',
    };
  }

  const dueDate = new Date(task.dueAt);
  if (Number.isNaN(dueDate.getTime())) {
    return {
      label: `Due ${task.dueAt}`,
      tone: 'future',
    };
  }

  const today = getLocalDayStart(new Date());
  const dueDay = getLocalDayStart(dueDate);
  const dayDifference = Math.round((dueDay.getTime() - today.getTime()) / 86400000);

  if (dayDifference < 0) {
    const overdueDays = Math.abs(dayDifference);

    return {
      label: `Overdue by ${overdueDays} ${overdueDays === 1 ? 'day' : 'days'}`,
      tone: 'overdue',
    };
  }

  if (dayDifference === 0) {
    return {
      label: 'Due today',
      tone: 'today',
    };
  }

  if (dayDifference === 1) {
    return {
      label: 'Due tomorrow',
      tone: 'future',
    };
  }

  return {
    label: `Due ${formatShortDate(task.dueAt)}`,
    tone: 'future',
  };
}

function getDueClassName(dueStatus: DueStatus) {
  if (dueStatus.tone === 'overdue') {
    return 'rounded bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700';
  }

  if (dueStatus.tone === 'today') {
    return 'rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800';
  }

  if (dueStatus.tone === 'completed') {
    return 'rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700';
  }

  return 'rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600';
}

function getEntityClassName(entityType: EntityType) {
  if (entityType === 'LEAD') {
    return 'rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700';
  }

  if (entityType === 'DEAL') {
    return 'rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700';
  }

  return 'rounded bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700';
}

function getTaskEntityPath(task: Task) {
  if (task.entityType === 'CONTACT') {
    return `/contacts/${task.entityId}`;
  }

  if (task.entityType === 'DEAL') {
    return `/deals/${task.entityId}`;
  }

  return `/leads/${task.entityId}`;
}

function getTaskEntityLabel(
  task: Task,
  contactsById: Map<string, Contact>,
  dealsById: Map<string, Deal>,
  leadsById: Map<string, Lead>,
) {
  const contact = task.entityType === 'CONTACT' ? contactsById.get(task.entityId) : undefined;
  const deal = task.entityType === 'DEAL' ? dealsById.get(task.entityId) : undefined;
  const lead = task.entityType === 'LEAD' ? leadsById.get(task.entityId) : undefined;

  return (
    task.entitySummary?.displayName ??
    (contact ? getContactOptionName(contact) : deal ? getDealOptionName(deal) : lead ? getLeadOptionName(lead) : task.entityId)
  );
}

function getTaskAssigneeLabel(task: Task, membershipsByUserId: Map<string, MembershipOption>) {
  const membership = task.assigneeId ? membershipsByUserId.get(task.assigneeId) : undefined;
  return task.assigneeSummary?.displayName ?? (membership ? getMembershipName(membership) : task.assigneeId ?? 'Unassigned');
}

function compareNullableDates(left: string | null, right: string | null) {
  if (!left && !right) {
    return 0;
  }

  if (!left) {
    return 1;
  }

  if (!right) {
    return -1;
  }

  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();

  if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) {
    return left.localeCompare(right);
  }

  if (Number.isNaN(leftTime)) {
    return 1;
  }

  if (Number.isNaN(rightTime)) {
    return -1;
  }

  return leftTime - rightTime;
}

function sortKanbanTasks(tasks: Task[]) {
  return [...tasks].sort((left, right) => {
    const dueComparison = compareNullableDates(left.dueAt, right.dueAt);
    if (dueComparison !== 0) {
      return dueComparison;
    }

    return compareNullableDates(right.createdAt, left.createdAt);
  });
}

function formatTaskCount(count: number) {
  return count === 1 ? '1 task' : `${count} tasks`;
}

function getTaskActionError(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message?: unknown }).message ?? '');
    if (message) {
      return message;
    }
  }

  return 'Could not update task.';
}

type TaskKanbanViewProps = {
  tasks: Task[];
  contactsById: Map<string, Contact>;
  dealsById: Map<string, Deal>;
  leadsById: Map<string, Lead>;
  membershipsByUserId: Map<string, MembershipOption>;
  accessToken: string | null;
  onChanged: () => void;
  onOpenTask: (task: Task) => void;
};

export function TaskKanbanView({
  tasks,
  contactsById,
  dealsById,
  leadsById,
  membershipsByUserId,
  accessToken,
  onChanged,
  onOpenTask,
}: TaskKanbanViewProps) {
  const [localTasks, setLocalTasks] = useState(tasks);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  const tasksByStatus = useMemo(() => {
    const groups = new Map<TaskStatus, Task[]>();

    for (const column of KANBAN_COLUMNS) {
      groups.set(column.status, []);
    }

    for (const task of localTasks) {
      groups.set(task.status, [...(groups.get(task.status) ?? []), task]);
    }

    for (const [status, statusTasks] of groups) {
      groups.set(status, sortKanbanTasks(statusTasks));
    }

    return groups;
  }, [localTasks]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const taskId = String(event.active.id);
    const nextStatus = event.over?.id as TaskStatus | undefined;
    const task = localTasks.find((current) => current.id === taskId);

    if (!task || !nextStatus || task.status === nextStatus || !KANBAN_COLUMNS.some((column) => column.status === nextStatus)) {
      return;
    }

    if (!accessToken) {
      setActionError('You need to sign in before updating tasks.');
      return;
    }

    const previousTasks = localTasks;
    setActionError(null);
    setSavingTaskId(task.id);
    setLocalTasks((current) =>
      current.map((currentTask) => (currentTask.id === task.id ? { ...currentTask, status: nextStatus } : currentTask)),
    );

    try {
      await updateTaskStatus(accessToken, task.id, nextStatus);
      onChanged();
    } catch (error) {
      setLocalTasks(previousTasks);
      setActionError(getTaskActionError(error));
    } finally {
      setSavingTaskId(null);
    }
  };

  return (
    <section className="space-y-3">
      {actionError ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError}</div>
      ) : null}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[1120px] grid-cols-4 gap-4">
            {KANBAN_COLUMNS.map((column) => (
              <TaskKanbanColumn
                key={column.status}
                status={column.status}
                helper={column.helper}
                tasks={tasksByStatus.get(column.status) ?? []}
                contactsById={contactsById}
                dealsById={dealsById}
                leadsById={leadsById}
                membershipsByUserId={membershipsByUserId}
                accessToken={accessToken}
                savingTaskId={savingTaskId}
                onChanged={onChanged}
                onOpenTask={onOpenTask}
              />
            ))}
          </div>
        </div>
      </DndContext>
    </section>
  );
}

type TaskKanbanColumnProps = {
  status: TaskStatus;
  helper: string;
  tasks: Task[];
  contactsById: Map<string, Contact>;
  dealsById: Map<string, Deal>;
  leadsById: Map<string, Lead>;
  membershipsByUserId: Map<string, MembershipOption>;
  accessToken: string | null;
  savingTaskId: string | null;
  onChanged: () => void;
  onOpenTask: (task: Task) => void;
};

function TaskKanbanColumn({
  status,
  helper,
  tasks,
  contactsById,
  dealsById,
  leadsById,
  membershipsByUserId,
  accessToken,
  savingTaskId,
  onChanged,
  onOpenTask,
}: TaskKanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
  });

  return (
    <section
      ref={setNodeRef}
      className={[
        'flex min-h-[28rem] flex-col rounded border bg-gray-50',
        isOver ? 'border-gray-900 ring-2 ring-gray-300' : 'border-gray-200',
      ].join(' ')}
    >
      <div className="border-b border-gray-200 bg-white p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{STATUS_LABELS[status]}</h2>
            <p className="mt-1 text-xs text-gray-600">{helper}</p>
          </div>
          <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">{tasks.length}</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3">
        {tasks.length > 0 ? (
          tasks.map((task) => (
            <TaskKanbanCard
              key={task.id}
              task={task}
              contactsById={contactsById}
              dealsById={dealsById}
              leadsById={leadsById}
              membershipsByUserId={membershipsByUserId}
              accessToken={accessToken}
              saving={savingTaskId === task.id}
              onChanged={onChanged}
              onOpenTask={onOpenTask}
            />
          ))
        ) : (
          <p className="rounded border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500">No tasks in this column.</p>
        )}
      </div>
    </section>
  );
}

type TaskKanbanCardProps = {
  task: Task;
  contactsById: Map<string, Contact>;
  dealsById: Map<string, Deal>;
  leadsById: Map<string, Lead>;
  membershipsByUserId: Map<string, MembershipOption>;
  accessToken: string | null;
  saving: boolean;
  onChanged: () => void;
  onOpenTask: (task: Task) => void;
};

function TaskKanbanCard({
  task,
  contactsById,
  dealsById,
  leadsById,
  membershipsByUserId,
  accessToken,
  saving,
  onChanged,
  onOpenTask,
}: TaskKanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: {
      status: task.status,
    },
  });
  const entityLabel = getTaskEntityLabel(task, contactsById, dealsById, leadsById);
  const entityPath = getTaskEntityPath(task);
  const assigneeLabel = getTaskAssigneeLabel(task, membershipsByUserId);
  const dueStatus = getDueStatus(task);
  const style = {
    transform: transform ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` : undefined,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={[
        'rounded border border-gray-200 bg-white p-3 shadow-sm',
        isDragging ? 'z-10 opacity-80 shadow-md' : '',
        saving ? 'opacity-60' : '',
      ].join(' ')}
    >
      <button
        type="button"
        className="w-full cursor-grab text-left focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 active:cursor-grabbing"
        {...listeners}
        {...attributes}
      >
        <h3 className="text-sm font-semibold text-gray-900">{task.title}</h3>
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={getEntityClassName(task.entityType)}>{ENTITY_LABELS[task.entityType]}</span>
        <Link className="break-words text-sm font-medium text-gray-800 underline decoration-gray-300 underline-offset-2 hover:text-gray-700" to={entityPath}>
          {entityLabel}
        </Link>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={getDueClassName(dueStatus)}>{dueStatus.label}</span>
        <span className="text-sm text-gray-600">Assigned to {assigneeLabel}</span>
      </div>
      {task.description ? <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm text-gray-600">{task.description}</p> : null}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => onOpenTask(task)}
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
        >
          Details
        </button>
        <Link
          to={entityPath}
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
        >
          Open {ENTITY_LABELS[task.entityType].toLowerCase()}
        </Link>
        <TaskCompletionButton task={task} accessToken={accessToken} onChanged={onChanged} />
      </div>
    </article>
  );
}

type TaskCompletionButtonProps = {
  task: Task;
  accessToken: string | null;
  onChanged: () => void;
};

function TaskCompletionButton({ task, accessToken, onChanged }: TaskCompletionButtonProps) {
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const completed = isTaskCompleted(task);

  const runAction = async () => {
    if (!accessToken) {
      setActionError('You need to sign in before updating tasks.');
      return;
    }

    setActionLoading(true);
    setActionError(null);

    try {
      if (completed) {
        await reopenTask(accessToken, task.id);
      } else {
        await completeTask(accessToken, task.id);
      }

      onChanged();
    } catch (requestError) {
      setActionError(getTaskActionError(requestError));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={runAction}
        disabled={actionLoading}
        className={
          completed
            ? 'w-full rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400'
            : 'w-full rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400'
        }
      >
        {actionLoading ? 'Updating...' : completed ? 'Reopen' : 'Complete'}
      </button>
      {actionError ? <p className="mt-2 text-sm text-red-700">{actionError}</p> : null}
    </div>
  );
}
