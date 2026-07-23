import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTaskChangeDocumentation } from '../tasks/useTaskChangeDocumentation';
import { useAuth } from '../../context/AuthContext';
import { markDealLost, markDealWon, moveDeal } from '../../lib/deals';
import type { HttpError } from '../../lib/http';
import { listMembershipOptions, type MembershipOption } from '../../lib/memberships';
import { listPipelines, listPipelineStages, type Pipeline, type PipelineStage } from '../../lib/pipelines';
import { buildTaskMutationContext, completeTask, listTasks, previewTaskComplete } from '../../lib/tasks';
import {
  createWhatsappConversationDeal,
  createWhatsappConversationNote,
  createWhatsappConversationTask,
  getWhatsappConversationCrmContext,
  type WhatsappConversation,
  type WhatsappCrmContext,
} from '../../lib/whatsapp';

type CrmContextPanelProps = {
  conversation: WhatsappConversation;
  onCreateOrder?: () => void;
  onContextChanged?: () => void;
  variant?: 'default' | 'compact' | 'sidebar' | 'mobile';
};

type RequestError = {
  status: number;
  message: string;
};

type QuickAction = 'task' | 'note' | 'deal';

type TaskFormState = {
  title: string;
  description: string;
  dueAt: string;
  assigneeId: string;
};

type NoteFormState = {
  body: string;
};

type DealFormState = {
  title: string;
  value: string;
  currency: string;
  pipelineId: string;
  stageId: string;
  expectedCloseAt: string;
};

const INITIAL_TASK_FORM: TaskFormState = {
  title: 'Follow up from WhatsApp',
  description: '',
  dueAt: '',
  assigneeId: '',
};

const INITIAL_NOTE_FORM: NoteFormState = {
  body: '',
};

const INITIAL_DEAL_FORM: DealFormState = {
  title: '',
  value: '',
  currency: 'USD',
  pipelineId: '',
  stageId: '',
  expectedCloseAt: '',
};

function toRequestError(error: unknown, fallback: string): RequestError {
  if (error && typeof error === 'object' && 'status' in error && 'message' in error) {
    const httpError = error as HttpError;
    return { status: httpError.status, message: httpError.message || fallback };
  }

  return { status: 0, message: fallback };
}

function formatDateTime(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatMoney(value: number | null, currency: string) {
  if (value === null) {
    return '—';
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value);
  } catch {
    return `${value.toLocaleString()} ${currency}`;
  }
}

function truncateNote(body: string) {
  return body.length > 180 ? `${body.slice(0, 177).trimEnd()}...` : body;
}

function getDefaultPipelineId(pipelines: Pipeline[]) {
  return (
    pipelines.find((pipeline) => pipeline.isDefault && !pipeline.archivedAt)?.id ??
    pipelines.find((pipeline) => !pipeline.archivedAt)?.id ??
    pipelines[0]?.id ??
    ''
  );
}

function getOpenStages(stages: PipelineStage[]) {
  return [...stages]
    .sort((first, second) => first.position - second.position)
    .filter((stage) => !stage.archivedAt && !stage.isClosedWon && !stage.isClosedLost);
}

function getMembershipName(membership: MembershipOption) {
  return [membership.user.firstName, membership.user.lastName].filter(Boolean).join(' ') || membership.user.email;
}

function EmptyState({ children }: { children: string }) {
  return <p className="rounded-md bg-gray-50 px-2.5 py-2 text-sm text-gray-500">{children}</p>;
}

const inlineActionClass =
  'inline-flex min-h-8 min-w-0 items-center justify-center rounded-md border px-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400';

function DealStageSelector({
  deal,
  onChanged,
}: {
  deal: WhatsappCrmContext['deals'][number];
  onChanged: () => void;
}) {
  const { accessToken, user } = useAuth();
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lifecycleAction, setLifecycleAction] = useState<'won' | 'lost' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [selectedStageId, setSelectedStageId] = useState(deal.stage.id);
  const openStages = useMemo(() => getOpenStages(stages), [stages]);

  useEffect(() => {
    setSelectedStageId(deal.stage.id);
  }, [deal.stage.id]);

  useEffect(() => {
    setSuccess(null);
  }, [deal.id]);

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    listPipelineStages(accessToken, deal.pipeline.id)
      .then((response) => {
        if (!cancelled) setStages(response);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) {
          setStages([]);
          setError(toRequestError(requestError, 'Could not load stages.').message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, deal.pipeline.id, loadKey]);

  async function handleStageChange(stageId: string) {
    if (!accessToken || !stageId || stageId === deal.stage.id) return;

    setSelectedStageId(stageId);
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await moveDeal(accessToken, deal.id, stageId);
      setSelectedStageId(stageId);
      const stageName = openStages.find((stage) => stage.id === stageId)?.name;
      setSuccess(stageName ? `Deal moved to ${stageName}.` : 'Deal stage updated.');
      onChanged();
    } catch (requestError) {
      setSelectedStageId(deal.stage.id);
      setError(toRequestError(requestError, 'Could not move deal.').message);
    } finally {
      setSaving(false);
    }
  }

  async function handleLifecycleAction(action: 'won' | 'lost') {
    if (!accessToken || saving || lifecycleAction) return;

    const label = action === 'won' ? 'won' : 'lost';
    if (!window.confirm(`Mark this deal as ${label}?`)) return;

    setLifecycleAction(action);
    setError(null);
    setSuccess(null);
    try {
      await (action === 'won'
        ? markDealWon(accessToken, deal.id)
        : markDealLost(accessToken, deal.id));
      setSuccess(`Deal marked ${label}.`);
      onChanged();
    } catch (requestError) {
      setError(toRequestError(requestError, `Could not mark deal ${label}.`).message);
    } finally {
      setLifecycleAction(null);
    }
  }

  return (
    <div className="mt-2">
      <label className="block text-[11px] font-medium text-gray-500">
        Stage
        <select
          value={selectedStageId}
          onChange={(event) => void handleStageChange(event.target.value)}
          disabled={loading || saving || lifecycleAction !== null || openStages.length === 0}
          aria-label={`Stage for ${deal.title}`}
          className="mt-1 min-h-8 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-gray-100"
        >
          {openStages.length === 0 ? <option value={deal.stage.id}>{deal.stage.name}</option> : null}
          {openStages.map((stage) => (
            <option key={stage.id} value={stage.id}>{stage.name}</option>
          ))}
        </select>
      </label>
      {loading ? <p className="mt-1 text-[11px] text-gray-500">Loading stages…</p> : null}
      {saving ? <p role="status" className="mt-1 rounded-md bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-700">Saving…</p> : null}
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => void handleLifecycleAction('won')}
          disabled={saving || lifecycleAction !== null}
          className={`${inlineActionClass} border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 focus:ring-emerald-600`}
        >
          {lifecycleAction === 'won' ? 'Marking…' : 'Mark won'}
        </button>
        <button
          type="button"
          onClick={() => void handleLifecycleAction('lost')}
          disabled={saving || lifecycleAction !== null}
          className={`${inlineActionClass} border-red-200 bg-white text-red-700 hover:bg-red-50 focus:ring-red-500`}
        >
          {lifecycleAction === 'lost' ? 'Marking…' : 'Mark lost'}
        </button>
      </div>
      {success && !saving ? <p role="status" className="mt-1 rounded-md bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-700">{success}</p> : null}
      {error ? (
        <div role="alert" className="mt-1 flex items-center justify-between gap-2 rounded-md bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
          <span className="min-w-0">{error}</span>
          {stages.length === 0 ? (
            <button type="button" onClick={() => setLoadKey((current) => current + 1)} className="shrink-0 font-semibold hover:text-red-900">
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CrmContextSkeleton({ variant = 'default' }: { variant?: CrmContextPanelProps['variant'] }) {
  return (
    <div className={`grid gap-3 ${variant === 'sidebar' ? 'grid-cols-1' : 'md:grid-cols-3'}`}>
      {[0, 1, 2].map((item) => (
        <div key={item} className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="h-3 w-20 animate-pulse rounded bg-gray-100" />
          <div className="mt-3 h-4 w-36 animate-pulse rounded bg-gray-200" />
          <div className="mt-2 h-3 w-28 animate-pulse rounded bg-gray-100" />
        </div>
      ))}
    </div>
  );
}

function QuickActionButtons({
  loading,
  onCancel,
  submitLabel,
}: {
  loading: boolean;
  onCancel: () => void;
  submitLabel: string;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={onCancel}
        disabled={loading}
        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300"
      >
        {loading ? 'Saving...' : submitLabel}
      </button>
    </div>
  );
}

export function CrmContextPanel({
  conversation,
  onCreateOrder,
  onContextChanged,
  variant = 'default',
}: CrmContextPanelProps) {
  const { accessToken, user } = useAuth();
  const [context, setContext] = useState<WhatsappCrmContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [taskFeedback, setTaskFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const { runTaskChange, documentationDialog } = useTaskChangeDocumentation({
    getErrorMessage: (requestError) => toRequestError(requestError, 'Could not complete task.').message,
  });
  const [activeAction, setActiveAction] = useState<QuickAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState<TaskFormState>(INITIAL_TASK_FORM);
  const [noteForm, setNoteForm] = useState<NoteFormState>(INITIAL_NOTE_FORM);
  const [dealForm, setDealForm] = useState<DealFormState>(INITIAL_DEAL_FORM);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [pipelinesLoading, setPipelinesLoading] = useState(false);
  const [stagesLoading, setStagesLoading] = useState(false);
  const [memberships, setMemberships] = useState<MembershipOption[]>([]);
  const [membershipsLoading, setMembershipsLoading] = useState(false);
  const [membershipsError, setMembershipsError] = useState<string | null>(null);
  const openStages = useMemo(() => getOpenStages(stages), [stages]);
  const assignableMemberships = useMemo(
    () => memberships.filter((membership) => membership.role !== 'VIEWER'),
    [memberships],
  );

  useEffect(() => {
    if (!accessToken || !conversation.contactId) {
      setContext(null);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    getWhatsappConversationCrmContext(accessToken, conversation.id, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setContext(result);
        }
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setContext(null);
          setError(toRequestError(requestError, 'Could not load CRM context.').message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [accessToken, conversation.id, conversation.contactId, refreshKey]);

  useEffect(() => {
    setActiveAction(null);
    setActionLoading(false);
    setActionError(null);
    setCompletingTaskId(null);
    setTaskFeedback(null);
    setTaskForm(INITIAL_TASK_FORM);
    setNoteForm(INITIAL_NOTE_FORM);
    setDealForm(INITIAL_DEAL_FORM);
    setPipelines([]);
    setStages([]);
  }, [conversation.id, conversation.contactId]);

  useEffect(() => {
    if (!accessToken || activeAction !== 'deal') {
      return;
    }

    let cancelled = false;
    setPipelinesLoading(true);
    setActionError(null);

    listPipelines(accessToken)
      .then((response) => {
        if (cancelled) return;

        setPipelines(response);
        const pipelineId = getDefaultPipelineId(response);
        setDealForm((current) => ({
          ...current,
          pipelineId,
          stageId: '',
        }));
      })
      .catch((requestError: unknown) => {
        if (!cancelled) {
          setActionError(toRequestError(requestError, 'Could not load pipelines.').message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPipelinesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, activeAction]);

  useEffect(() => {
    if (!accessToken || activeAction !== 'deal' || !dealForm.pipelineId) {
      setStages([]);
      return;
    }

    let cancelled = false;
    setStagesLoading(true);

    listPipelineStages(accessToken, dealForm.pipelineId)
      .then((response) => {
        if (cancelled) return;

        const nextOpenStages = getOpenStages(response);
        setStages(response);
        setDealForm((current) => ({
          ...current,
          stageId: nextOpenStages.some((stage) => stage.id === current.stageId)
            ? current.stageId
            : nextOpenStages[0]?.id ?? '',
        }));
      })
      .catch((requestError: unknown) => {
        if (!cancelled) {
          setActionError(toRequestError(requestError, 'Could not load pipeline stages.').message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setStagesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, activeAction, dealForm.pipelineId]);

  useEffect(() => {
    if (!accessToken || activeAction !== 'task') return;

    let cancelled = false;
    setMembershipsLoading(true);
    setMembershipsError(null);
    listMembershipOptions(accessToken)
      .then((response) => {
        if (!cancelled) setMemberships(response);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) {
          setMemberships([]);
          setMembershipsError(toRequestError(requestError, 'Could not load team members.').message);
        }
      })
      .finally(() => {
        if (!cancelled) setMembershipsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, activeAction]);

  function openAction(action: QuickAction) {
    setActiveAction(action);
    setActionError(null);
    setTaskForm(INITIAL_TASK_FORM);
    setNoteForm(INITIAL_NOTE_FORM);
    setDealForm(INITIAL_DEAL_FORM);
  }

  function closeAction() {
    if (actionLoading) return;
    setActiveAction(null);
    setActionError(null);
  }

  async function handleCompleteTask(taskId: string) {
    if (!accessToken || completingTaskId) return;

    const task = (await listTasks(accessToken, { limit: 500 })).data.find((item) => item.id === taskId);
    const complete = async (context = buildTaskMutationContext(user, 'whatsapp_context')) => {
      setCompletingTaskId(taskId);
      setTaskFeedback(null);
      try {
        await completeTask(accessToken, taskId, context);
        setTaskFeedback({ kind: 'success', message: 'Task completed.' });
        setRefreshKey((current) => current + 1);
        onContextChanged?.();
      } finally {
        setCompletingTaskId(null);
      }
    };

    if (!task) {
      try {
        await complete();
      } catch (requestError) {
        setTaskFeedback({
          kind: 'error',
          message: toRequestError(requestError, 'Could not complete task.').message,
        });
      }
      return;
    }

    runTaskChange({
      task,
      preview: previewTaskComplete(task),
      source: 'whatsapp_context',
      title: 'Complete task?',
      description: 'Review this Task completion before saving.',
      confirmLabel: 'Complete task',
      run: complete,
      onError: (requestError) => {
        setTaskFeedback({
          kind: 'error',
          message: toRequestError(requestError, 'Could not complete task.').message,
        });
      },
    });
  }

  async function handleTaskSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !conversation.contactId) return;

    const title = taskForm.title.trim();
    if (!title) {
      setActionError('Task title is required.');
      return;
    }

    setActionLoading(true);
    setActionError(null);
    try {
      await createWhatsappConversationTask(accessToken, conversation.id, {
        title,
        description: taskForm.description.trim() || undefined,
        dueAt: taskForm.dueAt || null,
        assigneeId: taskForm.assigneeId || undefined,
      });
      setActiveAction(null);
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      setActionError(toRequestError(requestError, 'Could not create task.').message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleNoteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !conversation.contactId) return;

    const body = noteForm.body.trim();
    if (!body) {
      setActionError('Note body is required.');
      return;
    }

    setActionLoading(true);
    setActionError(null);
    try {
      await createWhatsappConversationNote(accessToken, conversation.id, { body });
      setActiveAction(null);
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      setActionError(toRequestError(requestError, 'Could not add note.').message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDealSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !conversation.contactId) return;

    const title = dealForm.title.trim();
    if (!title) {
      setActionError('Deal title is required.');
      return;
    }

    if (!dealForm.pipelineId || !dealForm.stageId) {
      setActionError('Choose a pipeline with an open stage before creating the deal.');
      return;
    }

    setActionLoading(true);
    setActionError(null);
    try {
      await createWhatsappConversationDeal(accessToken, conversation.id, {
        title,
        pipelineId: dealForm.pipelineId,
        stageId: dealForm.stageId,
        value: dealForm.value.trim() || undefined,
        currency: dealForm.currency.trim() || 'USD',
        expectedCloseAt: dealForm.expectedCloseAt || null,
      });
      setActiveAction(null);
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      setActionError(toRequestError(requestError, 'Could not create deal.').message);
    } finally {
      setActionLoading(false);
    }
  }

  if (!conversation.contactId) {
    return null;
  }

  const isCompactWorkspace = variant === 'sidebar' || variant === 'mobile';
  const sectionClass =
    isCompactWorkspace
      ? ''
      : 'shrink-0 border-b border-gray-200 bg-slate-50 px-3 py-3 sm:px-5 lg:px-6';
  const innerClass = isCompactWorkspace ? 'min-w-0 w-full overflow-x-hidden' : 'mx-auto min-w-0 w-full max-w-5xl';
  const contextGridClass = `grid min-w-0 gap-2 ${
    variant === 'mobile' ? 'grid-cols-2' : variant === 'sidebar' ? 'grid-cols-1' : 'md:grid-cols-3'
  }`;
  const cardClass =
    variant === 'mobile'
      ? 'rounded-xl border border-gray-200 bg-white p-2.5'
      : isCompactWorkspace
        ? 'rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm'
      : 'rounded-xl border border-gray-200 bg-white p-3 shadow-sm';
  const quickActionCardClass =
    variant === 'mobile'
      ? 'mb-2 rounded-xl border border-gray-200 bg-white p-2.5'
      : isCompactWorkspace
        ? 'mb-2 rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm'
      : 'mb-2.5 rounded-xl border border-gray-200 bg-white p-3 shadow-sm';
  const quickActionButtonClass =
    variant === 'mobile'
      ? 'min-w-0 whitespace-normal rounded-lg bg-gray-50 px-1.5 py-2 text-center text-[11px] font-semibold leading-4 text-gray-700 hover:bg-emerald-50 hover:text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-1'
      : 'min-w-0 whitespace-normal rounded-lg border border-gray-200 bg-white px-1.5 py-2 text-center text-[11px] font-semibold leading-4 text-gray-700 shadow-sm hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-1';

  return (
    <>
    <section className={`${sectionClass} min-w-0 overflow-x-hidden`}>
      <div className={innerClass}>
        <div className="mb-1.5 flex min-w-0 items-center justify-between gap-3">
          <h2 className={variant === 'mobile' ? 'text-xs font-semibold uppercase tracking-wide text-gray-500' : 'text-sm font-semibold text-gray-900'}>CRM context</h2>
          <Link
            to={`/contacts/${conversation.contactId}`}
            className="shrink-0 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
          >
            View all
          </Link>
        </div>

        <div className={quickActionCardClass}>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-gray-950">Quick actions</p>
            <div className={`grid min-w-0 gap-1.5 ${onCreateOrder ? 'grid-cols-2' : 'grid-cols-3'}`}>
              <button
                type="button"
                onClick={() => openAction('task')}
                className={quickActionButtonClass}
              >
                Create task
              </button>
              <button
                type="button"
                onClick={() => openAction('note')}
                className={quickActionButtonClass}
              >
                Add note
              </button>
              <button
                type="button"
                onClick={() => openAction('deal')}
                className={quickActionButtonClass}
              >
                Create deal
              </button>
              {onCreateOrder ? (
                <button type="button" onClick={onCreateOrder} className={quickActionButtonClass}>
                  Create order
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {loading && !context ? <CrmContextSkeleton variant={variant} /> : null}

        {error ? (
          <div className="rounded-lg border border-red-200 bg-white px-3 py-3">
            <p className="text-sm font-medium text-red-800">Failed to load CRM context</p>
            <p className="mt-1 text-xs text-red-700">{error}</p>
            <button
              type="button"
              onClick={() => setRefreshKey((current) => current + 1)}
              className="mt-2 text-xs font-semibold text-red-800 hover:text-red-900"
            >
              Try again
            </button>
          </div>
        ) : null}

        {!loading && !error && context ? (
          <div className={contextGridClass}>
            <div className={`${cardClass} ${variant === 'mobile' ? 'col-span-2 sm:col-span-1' : ''}`}>
              <p className="text-sm font-semibold text-gray-950">Open tasks</p>
              {taskFeedback ? (
                <p
                  role={taskFeedback.kind === 'error' ? 'alert' : 'status'}
                  className={`mt-1.5 rounded-md px-2 py-1.5 text-xs ${
                    taskFeedback.kind === 'error'
                      ? 'bg-red-50 text-red-700'
                      : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {taskFeedback.message}
                </p>
              ) : null}
              <div className="mt-1.5 space-y-1.5">
                {context.tasks.length === 0 ? (
                  <EmptyState>No open tasks for this contact.</EmptyState>
                ) : (
                  context.tasks.map((task) => {
                    const dueLabel = formatDateTime(task.dueAt);
                    return (
                      <div key={task.id} className="flex min-w-0 flex-wrap items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900" title={task.title}>
                            {task.title}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                            <span className={task.isOverdue ? 'font-semibold text-red-700' : undefined}>
                              {dueLabel ?? 'No due date'}
                            </span>
                            {task.assignee ? <span>Assigned to {task.assignee.name}</span> : null}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleCompleteTask(task.id)}
                          disabled={completingTaskId !== null}
                          aria-label={`Complete task: ${task.title}`}
                          className={`${inlineActionClass} shrink-0 border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 focus:ring-emerald-600`}
                        >
                          {completingTaskId === task.id ? 'Completing…' : 'Complete'}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className={cardClass}>
              <p className="text-sm font-semibold text-gray-950">Active deals</p>
              <div className="mt-1.5 space-y-1.5">
                {context.deals.length === 0 ? (
                  <EmptyState>No active deals for this contact.</EmptyState>
                ) : (
                  context.deals.map((deal) => (
                    <div key={deal.id} className="min-w-0 rounded-md border border-gray-100 p-2">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <Link to={`/deals/${deal.id}`} className="truncate text-sm font-medium text-gray-900 hover:text-emerald-700" title={deal.title}>{deal.title}</Link>
                        <span className="shrink-0 text-xs font-semibold text-gray-700">
                          {formatMoney(deal.value, deal.currency)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-gray-500">
                        {deal.pipeline.name}
                      </p>
                      <DealStageSelector
                        deal={deal}
                        onChanged={() => {
                          setRefreshKey((current) => current + 1);
                          onContextChanged?.();
                        }}
                      />
                      <Link to={`/deals/${deal.id}`} className="mt-2 inline-block text-[11px] font-semibold text-emerald-700 hover:text-emerald-800">Open deal</Link>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className={cardClass}>
              <p className="text-sm font-semibold text-gray-950">Latest note</p>
              <div className="mt-1.5">
                {!context.latestNote ? (
                  <EmptyState>No notes have been added yet.</EmptyState>
                ) : (
                  <>
                    <p className="text-sm leading-5 text-gray-800" title={context.latestNote.body}>
                      {truncateNote(context.latestNote.body)}
                    </p>
                    <p className="mt-2 text-xs text-gray-500">
                      {formatDateTime(context.latestNote.createdAt)}
                      {context.latestNote.author ? ` by ${context.latestNote.author.name}` : ''}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
    {activeAction ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
        <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {activeAction === 'task'
                  ? 'Create task'
                  : activeAction === 'note'
                    ? 'Add note'
                    : 'Create deal'}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                This will be linked to the selected CRM contact.
              </p>
            </div>
            <button
              type="button"
              onClick={closeAction}
              disabled={actionLoading}
              className="rounded-md px-2 py-1 text-sm font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:cursor-not-allowed disabled:text-gray-300"
            >
              Close
            </button>
          </div>

          {actionError ? (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {actionError}
            </p>
          ) : null}

          {activeAction === 'task' ? (
            <form onSubmit={handleTaskSubmit} className="mt-4 space-y-4">
              <label className="block text-sm font-medium text-gray-700">
                Title
                <input
                  value={taskForm.title}
                  onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Due date
                <input
                  type="datetime-local"
                  value={taskForm.dueAt}
                  onChange={(event) => setTaskForm((current) => ({ ...current, dueAt: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Assignee (optional)
                <select
                  value={taskForm.assigneeId}
                  onChange={(event) => setTaskForm((current) => ({ ...current, assigneeId: event.target.value }))}
                  disabled={membershipsLoading}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:bg-gray-100"
                >
                  <option value="">Unassigned</option>
                  {assignableMemberships.map((membership) => (
                    <option key={membership.userId} value={membership.userId}>
                      {getMembershipName(membership)}
                    </option>
                  ))}
                </select>
              </label>
              {membershipsLoading ? <p className="text-sm text-gray-500">Loading team members...</p> : null}
              {membershipsError ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Team members could not be loaded. You can still create this task unassigned.
                </p>
              ) : null}
              <label className="block text-sm font-medium text-gray-700">
                Description
                <textarea
                  value={taskForm.description}
                  onChange={(event) => setTaskForm((current) => ({ ...current, description: event.target.value }))}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              <QuickActionButtons loading={actionLoading} onCancel={closeAction} submitLabel="Create task" />
            </form>
          ) : null}

          {activeAction === 'note' ? (
            <form onSubmit={handleNoteSubmit} className="mt-4 space-y-4">
              <label className="block text-sm font-medium text-gray-700">
                Note
                <textarea
                  value={noteForm.body}
                  onChange={(event) => setNoteForm({ body: event.target.value })}
                  rows={5}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              <QuickActionButtons loading={actionLoading} onCancel={closeAction} submitLabel="Add note" />
            </form>
          ) : null}

          {activeAction === 'deal' ? (
            <form onSubmit={handleDealSubmit} className="mt-4 space-y-4">
              <label className="block text-sm font-medium text-gray-700">
                Title
                <input
                  value={dealForm.title}
                  onChange={(event) => setDealForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="New WhatsApp opportunity"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium text-gray-700">
                  Value
                  <input
                    value={dealForm.value}
                    onChange={(event) => setDealForm((current) => ({ ...current, value: event.target.value }))}
                    inputMode="decimal"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Currency
                  <input
                    value={dealForm.currency}
                    onChange={(event) => setDealForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
                    maxLength={3}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium text-gray-700">
                  Pipeline
                  <select
                    value={dealForm.pipelineId}
                    onChange={(event) =>
                      setDealForm((current) => ({ ...current, pipelineId: event.target.value, stageId: '' }))
                    }
                    disabled={pipelinesLoading}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:bg-gray-100"
                  >
                    <option value="">Select pipeline</option>
                    {pipelines.map((pipeline) => (
                      <option key={pipeline.id} value={pipeline.id}>
                        {pipeline.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Stage
                  <select
                    value={dealForm.stageId}
                    onChange={(event) => setDealForm((current) => ({ ...current, stageId: event.target.value }))}
                    disabled={stagesLoading || openStages.length === 0}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:bg-gray-100"
                  >
                    <option value="">Select stage</option>
                    {openStages.map((stage) => (
                      <option key={stage.id} value={stage.id}>
                        {stage.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-sm font-medium text-gray-700">
                Expected close date
                <input
                  type="date"
                  value={dealForm.expectedCloseAt}
                  onChange={(event) => setDealForm((current) => ({ ...current, expectedCloseAt: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              <QuickActionButtons loading={actionLoading} onCancel={closeAction} submitLabel="Create deal" />
            </form>
          ) : null}
        </div>
      </div>
    ) : null}
      {documentationDialog}
    </>
  );
}
