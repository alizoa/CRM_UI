import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ChangeDocumentationDialog, type ChangeDocumentationResult } from '../activities/ChangeDocumentationDialog';
import { useAuth } from '../../context/AuthContext';
import { buildChangeSummaryItems } from '../../lib/activity-formatting';
import type { ActivityChangeSource } from '../../lib/activities';
import { shouldRequestChangeDocumentation } from '../../lib/change-documentation-settings';
import type { HttpError } from '../../lib/http';
import { createNote, listNotes, type Note, type NotesResponse } from '../../lib/notes';
import type { MembershipOption } from '../../lib/memberships';
import {
  buildTaskMutationContext,
  completeTask,
  previewTaskComplete,
  previewTaskReopen,
  previewTaskUpdate,
  reopenTask,
  updateTask,
  type Task,
  type TaskActivityPreview,
  type TaskMutationContext,
  type TaskStatus,
  type UpdateTaskInput,
} from '../../lib/tasks';

type TaskDetailModalProps = {
  task: Task;
  memberships: MembershipOption[];
  entityLabel: string;
  entityPath: string;
  mutationSource?: ActivityChangeSource;
  onClose: () => void;
  onSaved: (task: Task) => void;
};

type TaskEditForm = {
  title: string;
  description: string;
  dueAt: string;
  assigneeId: string;
  status: TaskStatus;
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

const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  WAITING: 'Waiting',
  DONE: 'Done',
};

const COMMENT_LIMIT = 20;

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

function toLocalDateTime(value: string | null) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
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

function getMembershipName(membership: MembershipOption) {
  return [membership.user.firstName, membership.user.lastName].filter(Boolean).join(' ') || membership.user.email;
}

function shortId(id: string) {
  return id.slice(0, 8);
}

function buildInitialForm(task: Task): TaskEditForm {
  return {
    title: task.title,
    description: task.description ?? '',
    dueAt: toLocalDateTime(task.dueAt),
    assigneeId: task.assigneeId ?? '',
    status: task.status,
  };
}

function buildUpdateInput(form: TaskEditForm): UpdateTaskInput {
  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
    assigneeId: form.assigneeId || null,
    status: form.status,
  };
}

function getAuthorLabel(authorId: string | null, membershipsByUserId: Map<string, MembershipOption>) {
  if (!authorId) {
    return 'Unknown author';
  }

  const membership = membershipsByUserId.get(authorId);
  if (membership) {
    return getMembershipName(membership);
  }

  return `User ${shortId(authorId)}`;
}

export function TaskDetailModal({ task, memberships, entityLabel, entityPath, mutationSource = 'details', onClose, onSaved }: TaskDetailModalProps) {
  const { accessToken, user } = useAuth();
  const [form, setForm] = useState<TaskEditForm>(() => buildInitialForm(task));
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<RequestError | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [commentsData, setCommentsData] = useState<NotesResponse | null>(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<RequestError | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [commentError, setCommentError] = useState<RequestError | null>(null);
  const [commentRefreshKey, setCommentRefreshKey] = useState(0);
  const [documentationRequest, setDocumentationRequest] = useState<TaskDocumentationRequest | null>(null);
  const [documentationSubmitting, setDocumentationSubmitting] = useState(false);
  const [documentationError, setDocumentationError] = useState<string | null>(null);
  const membershipsByUserId = useMemo(() => new Map(memberships.map((membership) => [membership.userId, membership])), [memberships]);
  const comments = commentsData?.data ?? [];
  const totalComments = commentsData?.total ?? comments.length;

  function shouldPromptForPreview(preview: TaskActivityPreview) {
    return preview.isDirectLeadTask && preview.documentationActions.some((action) => shouldRequestChangeDocumentation(action));
  }

  function openDocumentationDialog(request: TaskDocumentationRequest) {
    setDocumentationError(null);
    setDocumentationRequest(request);
  }

  function runOrPromptTaskChange({
    preview,
    title,
    description,
    confirmLabel,
    run,
  }: {
    preview: TaskActivityPreview;
    title: string;
    description: string;
    confirmLabel?: string;
    run: (context: TaskMutationContext) => Promise<void>;
  }) {
    if (preview.changes.length === 0) return;

    const execute = async (result?: ChangeDocumentationResult) => {
      await run(buildTaskMutationContext(user, mutationSource, result ?? undefined));
    };

    if (!shouldPromptForPreview(preview)) {
      void execute().catch(() => {
        // Save handlers render their own error state.
      });
      return;
    }

    openDocumentationDialog({
      title,
      description,
      subjectLabel: `${task.title}${entityLabel ? ` · ${entityLabel}` : ''}`,
      changes: buildChangeSummaryItems(preview.changes),
      confirmLabel,
      onConfirm: execute,
    });
  }

  useEffect(() => {
    setForm(buildInitialForm(task));
    setSaveError(null);
    setSaveSuccess(null);
    setCommentBody('');
    setCommentError(null);
  }, [task.id]);

  useEffect(() => {
    if (!accessToken) {
      setCommentsData(null);
      setCommentsLoading(false);
      setCommentsError(null);
      return;
    }

    let active = true;
    const token = accessToken;

    async function fetchComments() {
      setCommentsLoading(true);
      setCommentsError(null);

      try {
        const response = await listNotes(token, {
          entityType: 'TASK',
          entityId: task.id,
          page: 1,
          limit: COMMENT_LIMIT,
        });

        if (!active) {
          return;
        }

        setCommentsData(response);
      } catch (error) {
        if (!active) {
          return;
        }

        setCommentsData(null);
        setCommentsError(toRequestError(error, 'Could not load task comments.'));
      } finally {
        if (active) {
          setCommentsLoading(false);
        }
      }
    }

    void fetchComments();

    return () => {
      active = false;
    };
  }, [accessToken, commentRefreshKey, task.id]);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken) {
      setSaveError({ status: 401, message: 'You need to sign in before updating tasks.' });
      return;
    }

    if (!form.title.trim()) {
      setSaveError({ status: 422, message: 'Task title is required.' });
      return;
    }

    const input = buildUpdateInput(form);
    const preview = previewTaskUpdate(task, input);
    if (preview.changes.length === 0) {
      setSaveError(null);
      setSaveSuccess('No task changes to save.');
      return;
    }

    runOrPromptTaskChange({
      preview,
      title: 'Confirm task changes',
      description: 'Review these Task changes before saving.',
      run: async (context) => {
        setSaveLoading(true);
        setSaveError(null);
        setSaveSuccess(null);
        try {
          const updatedTask = await updateTask(accessToken, task.id, input, context);
          setSaveSuccess('Task saved.');
          onSaved(updatedTask);
        } catch (error) {
          const requestError = toRequestError(error, 'Could not save task.');
          setSaveError({
            status: requestError.status,
            message: requestError.status === 403 ? 'You do not have permission to update tasks.' : requestError.message,
          });
          throw error;
        } finally {
          setSaveLoading(false);
        }
      },
    });
  };

  const handleCreateComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken) {
      setCommentError({ status: 401, message: 'You need to sign in before adding comments.' });
      return;
    }

    if (!commentBody.trim()) {
      setCommentError({ status: 422, message: 'Comment is required.' });
      return;
    }

    setCommentLoading(true);
    setCommentError(null);

    try {
      await createNote(accessToken, {
        entityType: 'TASK',
        entityId: task.id,
        body: commentBody.trim(),
      });
      setCommentBody('');
      setCommentRefreshKey((current) => current + 1);
    } catch (error) {
      const requestError = toRequestError(error, 'Could not add comment.');
      setCommentError({
        status: requestError.status,
        message: requestError.status === 403 ? 'You do not have permission to add comments.' : requestError.message,
      });
    } finally {
      setCommentLoading(false);
    }
  };

  const handleCompletionToggle = async () => {
    if (!accessToken) {
      setSaveError({ status: 401, message: 'You need to sign in before updating tasks.' });
      return;
    }

    const completed = task.status === 'DONE';
    const preview = completed ? previewTaskReopen(task) : previewTaskComplete(task);

    runOrPromptTaskChange({
      preview,
      title: completed ? 'Reopen task?' : 'Complete task?',
      description: 'Review this Task status change before saving.',
      confirmLabel: completed ? 'Reopen task' : 'Complete task',
      run: async (context) => {
        setSaveLoading(true);
        setSaveError(null);
        setSaveSuccess(null);
        try {
          const updatedTask = completed ? await reopenTask(accessToken, task.id, context) : await completeTask(accessToken, task.id, context);
          setForm(buildInitialForm(updatedTask));
          setSaveSuccess(completed ? 'Task reopened.' : 'Task completed.');
          onSaved(updatedTask);
        } catch (error) {
          const requestError = toRequestError(error, 'Could not update task.');
          setSaveError({
            status: requestError.status,
            message: requestError.status === 403 ? 'You do not have permission to update tasks.' : requestError.message,
          });
          throw error;
        } finally {
          setSaveLoading(false);
        }
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-900/50 p-4">
      <div className="mx-auto my-6 max-w-5xl rounded border border-gray-200 bg-white shadow-xl">
        <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Task detail</p>
            <h2 className="mt-1 text-xl font-semibold text-gray-900">{task.title}</h2>
            <p className="mt-1 text-sm text-gray-600">
              Lead:{' '}
              <Link className="font-medium underline decoration-gray-300 underline-offset-2 hover:text-gray-700" to={entityPath}>
                {entityLabel}
              </Link>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Close
          </button>
        </div>

        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
          <form className="space-y-4" onSubmit={handleSave}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm font-medium text-gray-700 sm:col-span-2">
                Title
                <input
                  value={form.title}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, title: event.target.value }));
                    setSaveError(null);
                    setSaveSuccess(null);
                  }}
                  className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                Status
                <select
                  value={form.status}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, status: event.target.value as TaskStatus }));
                    setSaveError(null);
                    setSaveSuccess(null);
                  }}
                  className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                >
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                Due date and time
                <input
                  type="datetime-local"
                  value={form.dueAt}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, dueAt: event.target.value }));
                    setSaveError(null);
                    setSaveSuccess(null);
                  }}
                  className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-gray-700 sm:col-span-2">
                Assignee
                <select
                  value={form.assigneeId}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, assigneeId: event.target.value }));
                    setSaveError(null);
                    setSaveSuccess(null);
                  }}
                  className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
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
                  onChange={(event) => {
                    setForm((current) => ({ ...current, description: event.target.value }));
                    setSaveError(null);
                    setSaveSuccess(null);
                  }}
                  className="min-h-32 rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                />
              </label>
            </div>

            <div className="rounded border border-gray-200 bg-gray-50 p-4">
              <h3 className="text-sm font-semibold text-gray-900">Linked lead</h3>
              <Link className="mt-2 inline-block text-sm font-medium underline decoration-gray-300 underline-offset-2 hover:text-gray-700" to={entityPath}>
                {entityLabel}
              </Link>
            </div>

            {saveSuccess ? <p className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">{saveSuccess}</p> : null}
            {saveError ? <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{saveError.message}</p> : null}

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={saveLoading}
                className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {saveLoading ? 'Saving...' : 'Save task'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setForm(buildInitialForm(task));
                  setSaveError(null);
                  setSaveSuccess(null);
                }}
                disabled={saveLoading}
                className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={handleCompletionToggle}
                disabled={saveLoading}
                className={
                  task.status === 'DONE'
                    ? 'rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400'
                    : 'rounded bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400'
                }
              >
                {saveLoading ? 'Updating...' : task.status === 'DONE' ? 'Reopen task' : 'Complete task'}
              </button>
            </div>
          </form>

          <section className="rounded border border-gray-200 bg-gray-50 p-4">
            <div>
              <h3 className="text-base font-semibold text-gray-900">Comments</h3>
              <p className="mt-1 text-sm text-gray-600">{totalComments === 1 ? '1 comment' : `${totalComments} comments`}</p>
            </div>

            <form className="mt-4" onSubmit={handleCreateComment}>
              <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                Add comment
                <textarea
                  value={commentBody}
                  onChange={(event) => {
                    setCommentBody(event.target.value);
                    setCommentError(null);
                  }}
                  className="min-h-24 rounded border border-gray-300 bg-white px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  placeholder="Called customer, no answer."
                />
              </label>
              {commentError ? <p className="mt-2 text-sm text-red-700">{commentError.message}</p> : null}
              <button
                type="submit"
                disabled={commentLoading}
                className="mt-3 rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {commentLoading ? 'Adding...' : 'Add comment'}
              </button>
            </form>

            {commentsLoading ? <p className="mt-5 rounded border border-gray-200 bg-white p-4 text-sm text-gray-700">Loading comments...</p> : null}
            {!commentsLoading && commentsError ? (
              <div className="mt-5 rounded border border-red-200 bg-red-50 p-4">
                <p className="text-sm text-red-700">{commentsError.message}</p>
                <button
                  type="button"
                  onClick={() => setCommentRefreshKey((current) => current + 1)}
                  className="mt-3 rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                >
                  Retry
                </button>
              </div>
            ) : null}
            {!commentsLoading && !commentsError && comments.length === 0 ? (
              <p className="mt-5 rounded border border-gray-200 bg-white p-4 text-sm text-gray-600">No comments yet.</p>
            ) : null}
            {!commentsLoading && !commentsError && comments.length > 0 ? (
              <div className="mt-5 space-y-3">
                {comments.map((comment) => (
                  <CommentCard key={comment.id} comment={comment} authorLabel={getAuthorLabel(comment.authorId, membershipsByUserId)} />
                ))}
                {totalComments > comments.length ? <p className="text-sm text-gray-600">Showing {comments.length} of {totalComments} comments.</p> : null}
              </div>
            ) : null}
          </section>
        </div>
      </div>
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
            setDocumentationError(toRequestError(error, 'Could not save change documentation.').message);
          } finally {
            setDocumentationSubmitting(false);
          }
        }}
      />
    </div>
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

type CommentCardProps = {
  comment: Note;
  authorLabel: string;
};

function CommentCard({ comment, authorLabel }: CommentCardProps) {
  return (
    <article className="rounded border border-gray-200 bg-white p-4">
      <p className="whitespace-pre-wrap text-sm text-gray-800">{comment.body}</p>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <TaskMeta label="Author" value={authorLabel} />
        <TaskMeta label="Created" value={formatDateTime(comment.createdAt)} />
      </dl>
    </article>
  );
}
