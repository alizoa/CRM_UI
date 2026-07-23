import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  ACTIVITY_COMMENT_MAX_LENGTH,
  createComment,
  type Activity,
  type ActivityChange,
} from '../../lib/activities';
import { formatRelativeTime } from '../../lib/relative-time';
import type { Task } from '../../lib/tasks';

type TimelineFilter = 'ALL' | 'ACTIVITY' | 'COMMENTS';

type Props = {
  leadId: string;
  activities: Activity[];
  loading: boolean;
  error: string | null;
  tasks: Task[];
  onRefresh: () => void;
};

const INITIAL_VISIBLE_TOP_LEVEL = 8;
const LINKED_COMMENT_COLLAPSE_THRESHOLD = 3;
const INITIAL_VISIBLE_LINKED_COMMENTS = 2;

function userDisplayName(user: ReturnType<typeof useAuth>['user']) {
  if (!user) return 'Demo User';
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
}

function getTimestamp(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatExactTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'string') return value.toLowerCase().replace(/_/g, ' ');
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    'lead.created': 'Lead created',
    'lead.updated': 'Lead updated',
    'lead.marked_lost': 'Lead marked lost',
    'lead.reopened': 'Lead reopened',
    'lead.converted': 'Lead marked won',
    'lead.owner_changed': 'Owner changed',
    'task.created': 'Task created',
    'task.updated': 'Task updated',
    'task.rescheduled': 'Task rescheduled',
    'task.assigned': 'Task assigned',
    'task.completed': 'Task completed',
    'task.reopened': 'Task reopened',
  };

  return labels[action] ?? action.replace(/[._-]+/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
}

function changeLines(changes: ActivityChange[] | null) {
  return changes?.map((change) => ({
    id: `${change.field}-${formatValue(change.from)}-${formatValue(change.to)}`,
    label: change.label || change.field,
    from: formatValue(change.from),
    to: formatValue(change.to),
  })) ?? [];
}

function canAddLinkedComment(activity: Activity) {
  if (activity.kind !== 'CHANGE') return false;
  if (activity.action === 'lead.created') return false;
  if ((activity.action === 'lead.marked_lost' || activity.action === 'lead.reopened') && activity.reason) return false;
  return !activity.comment;
}

export function ActivityCommentTimeline({ leadId, activities, loading, error, tasks, onRefresh }: Props) {
  const { user } = useAuth();
  const actor = useMemo(() => ({ actorId: user?.id ?? null, actorDisplayName: userDisplayName(user) }), [user]);
  const [filter, setFilter] = useState<TimelineFilter>('ALL');
  const [expanded, setExpanded] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [openContextActivityId, setOpenContextActivityId] = useState<string | null>(null);

  const topLevelActivities = useMemo(
    () => activities
      .filter((activity) => !activity.parentActivityId)
      .sort((left, right) => getTimestamp(right.createdAt) - getTimestamp(left.createdAt)),
    [activities],
  );

  const linkedCommentsByParent = useMemo(() => {
    const grouped = new Map<string, Activity[]>();
    for (const activity of activities) {
      if (activity.kind !== 'COMMENT' || !activity.parentActivityId) continue;
      const comments = grouped.get(activity.parentActivityId) ?? [];
      comments.push(activity);
      grouped.set(activity.parentActivityId, comments);
    }

    for (const comments of grouped.values()) {
      comments.sort((left, right) => getTimestamp(left.createdAt) - getTimestamp(right.createdAt));
    }

    return grouped;
  }, [activities]);

  const orphanLinkedComments = useMemo(
    () => activities.filter((activity) => activity.kind === 'COMMENT' && activity.parentActivityId && !topLevelActivities.some((parent) => parent.id === activity.parentActivityId)),
    [activities, topLevelActivities],
  );

  const filteredTopLevelActivities = useMemo(() => {
    if (filter === 'ACTIVITY') return topLevelActivities.filter((activity) => activity.kind === 'CHANGE');
    if (filter === 'COMMENTS') return topLevelActivities.filter((activity) => activity.kind === 'COMMENT');
    return topLevelActivities;
  }, [filter, topLevelActivities]);

  const showFilter = topLevelActivities.length > INITIAL_VISIBLE_TOP_LEVEL;
  const visibleTopLevelActivities = showFilter && !expanded
    ? filteredTopLevelActivities.slice(0, INITIAL_VISIBLE_TOP_LEVEL)
    : filteredTopLevelActivities;

  const handleContextOpen = (activityId: string) => {
    setOpenContextActivityId((current) => (current === activityId ? null : activityId));
  };

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Activity & Comments</h2>
          <p className="mt-1 text-sm text-gray-600">
            Change history and event-specific comments for this lead.
          </p>
        </div>
        {showFilter ? (
          <TimelineFilterMenu
            value={filter}
            onChange={(nextFilter) => {
              setFilter(nextFilter);
              setExpanded(false);
            }}
          />
        ) : null}
      </div>

      <StandaloneCommentComposer
        leadId={leadId}
        open={composerOpen}
        actor={actor}
        onOpenChange={setComposerOpen}
        onSaved={onRefresh}
      />

      {loading ? <TimelineSkeleton /> : null}
      {!loading && error ? (
        <div className="mt-5 rounded border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={onRefresh} className="mt-3 rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2">
            Retry
          </button>
        </div>
      ) : null}

      {!loading && !error && orphanLinkedComments.length > 0 ? (
        <p className="mt-5 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {orphanLinkedComments.length === 1 ? 'A linked comment references an activity that is not available.' : `${orphanLinkedComments.length} linked comments reference activities that are not available.`}
        </p>
      ) : null}

      {!loading && !error && topLevelActivities.length === 0 ? (
        <p className="mt-5 rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          No activity yet. Changes and activity comments will show up here.
        </p>
      ) : null}

      {!loading && !error && topLevelActivities.length > 0 && filteredTopLevelActivities.length === 0 ? (
        <div className="mt-5 rounded border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm text-gray-600">No {filter === 'ACTIVITY' ? 'activity changes' : 'comments'} yet.</p>
          <button type="button" onClick={() => setFilter('ALL')} className="mt-3 text-sm font-semibold text-gray-800 underline decoration-gray-300 underline-offset-4 hover:text-gray-950">
            Show all
          </button>
        </div>
      ) : null}

      {!loading && !error && visibleTopLevelActivities.length > 0 ? (
        <ol className="mt-5 space-y-3" aria-live="polite">
          {visibleTopLevelActivities.map((activity) => (
            <TimelineEntry
              key={activity.id}
              activity={activity}
              linkedComments={linkedCommentsByParent.get(activity.id) ?? []}
              task={activity.relatedTaskId ? tasks.find((item) => item.id === activity.relatedTaskId) ?? null : null}
              contextComposerOpen={openContextActivityId === activity.id}
              actor={actor}
              onToggleContext={() => handleContextOpen(activity.id)}
              onSaved={onRefresh}
            />
          ))}
        </ol>
      ) : null}

      {!loading && !error && showFilter && filteredTopLevelActivities.length > INITIAL_VISIBLE_TOP_LEVEL ? (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="mx-auto mt-5 block rounded border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          aria-expanded={expanded}
        >
          {expanded ? 'Show less' : `Show ${filteredTopLevelActivities.length - INITIAL_VISIBLE_TOP_LEVEL} more`}
        </button>
      ) : null}
    </section>
  );
}

function TimelineFilterMenu({ value, onChange }: { value: TimelineFilter; onChange: (value: TimelineFilter) => void }) {
  const id = useId();

  return (
    <label className="flex items-center gap-2 text-sm font-medium text-gray-700" htmlFor={id}>
      Filter
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as TimelineFilter)}
        className="rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
      >
        <option value="ALL">All</option>
        <option value="ACTIVITY">Activity</option>
        <option value="COMMENTS">Comments</option>
      </select>
    </label>
  );
}

function StandaloneCommentComposer({
  leadId,
  open,
  actor,
  onOpenChange,
  onSaved,
}: {
  leadId: string;
  open: boolean;
  actor: { actorId: string | null; actorDisplayName: string };
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const id = useId();

  return (
    <div className="mt-5 border-t border-gray-100 pt-4">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
        aria-expanded={open}
        aria-controls={id}
      >
        Add comment
      </button>
      {open ? (
        <div id={id} className="mt-3">
          <CommentForm
            entityId={leadId}
            actor={actor}
            submitLabel="Save"
            autoFocus
            onCancel={() => onOpenChange(false)}
            onSaved={() => {
              onOpenChange(false);
              onSaved();
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function TimelineEntry({
  activity,
  linkedComments,
  task,
  contextComposerOpen,
  actor,
  onToggleContext,
  onSaved,
}: {
  activity: Activity;
  linkedComments: Activity[];
  task: Task | null;
  contextComposerOpen: boolean;
  actor: { actorId: string | null; actorDisplayName: string };
  onToggleContext: () => void;
  onSaved: () => void;
}) {
  const isComment = activity.kind === 'COMMENT';
  const contextComposerId = useId();

  return (
    <li className="rounded border border-gray-200 bg-white p-4">
      <article className="flex gap-3">
        <span className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${isComment ? 'border-gray-300 bg-gray-900 text-white' : 'border-emerald-200 bg-white text-emerald-700'}`} aria-hidden="true">
          {isComment ? 'C' : 'A'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h3 className="break-words text-sm font-semibold text-gray-900">{isComment ? 'Comment' : actionLabel(activity.action)}</h3>
              <p className="mt-1 text-xs text-gray-500">
                {activity.actorDisplayName || 'System'} · <time dateTime={activity.createdAt} title={formatExactTime(activity.createdAt)}>{formatRelativeTime(activity.createdAt) || formatExactTime(activity.createdAt)}</time>
              </p>
            </div>
            {!isComment && canAddLinkedComment(activity) ? (
              <button
                type="button"
                onClick={onToggleContext}
                className="w-fit rounded px-2 py-1 text-xs font-semibold text-gray-700 underline decoration-gray-300 underline-offset-4 hover:text-gray-950 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                aria-label="Add comment to this activity"
                aria-expanded={contextComposerOpen}
                aria-controls={contextComposerId}
              >
                Add comment
              </button>
            ) : null}
          </div>

          {isComment ? <CommentBody activity={activity} /> : <ChangeBody activity={activity} task={task} />}

          {contextComposerOpen ? (
            <div id={contextComposerId} className="mt-3 rounded border border-gray-200 bg-gray-50 p-3">
              <CommentForm
                entityId={activity.entityId}
                parentActivityId={activity.id}
                actor={actor}
                submitLabel="Save"
                autoFocus
                onCancel={onToggleContext}
                onSaved={() => {
                  onToggleContext();
                  onSaved();
                }}
              />
            </div>
          ) : null}

          {!isComment && linkedComments.length > 0 ? (
            <LinkedComments comments={linkedComments} />
          ) : null}
        </div>
      </article>
    </li>
  );
}

function ChangeBody({ activity, task }: { activity: Activity; task: Task | null }) {
  const lines = changeLines(activity.changes);

  return (
    <div className="mt-3 space-y-3">
      {lines.length > 0 ? (
        <dl className="space-y-2">
          {lines.map((line) => (
            <div key={line.id} className="rounded border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
              <dt className="font-medium text-gray-900">{line.label}</dt>
              <dd className="mt-1 break-words text-gray-700">{line.from} → {line.to}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-gray-700">Activity recorded.</p>
      )}
      {activity.reason ? <DetailBlock label="Reason" value={activity.reason} /> : null}
      {activity.comment ? <DetailBlock label="Comment" value={activity.comment} /> : null}
      {activity.relatedTaskId ? (
        <p className="rounded border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          Task: {task?.title ?? activity.relatedTaskId}
        </p>
      ) : null}
    </div>
  );
}

function CommentBody({ activity }: { activity: Activity }) {
  return (
    <p className="mt-3 whitespace-pre-wrap break-words text-sm text-gray-800">
      {activity.comment || 'Comment content is unavailable.'}
    </p>
  );
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-gray-800">{value}</p>
    </div>
  );
}

function LinkedComments({ comments }: { comments: Activity[] }) {
  const [expanded, setExpanded] = useState(false);
  const shouldCollapse = comments.length > LINKED_COMMENT_COLLAPSE_THRESHOLD;
  const visibleComments = shouldCollapse && !expanded ? comments.slice(0, INITIAL_VISIBLE_LINKED_COMMENTS) : comments;
  const remaining = comments.length - INITIAL_VISIBLE_LINKED_COMMENTS;

  return (
    <div className="mt-4 border-l-2 border-gray-200 pl-3">
      <ol className="space-y-2">
        {visibleComments.map((comment) => (
          <li key={comment.id} className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
            <p className="whitespace-pre-wrap break-words text-sm text-gray-800">{comment.comment || 'Comment content is unavailable.'}</p>
            <p className="mt-1 text-xs text-gray-500">
              {comment.actorDisplayName || 'System'} · <time dateTime={comment.createdAt} title={formatExactTime(comment.createdAt)}>{formatRelativeTime(comment.createdAt) || formatExactTime(comment.createdAt)}</time>
            </p>
          </li>
        ))}
      </ol>
      {shouldCollapse ? (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="mt-2 text-xs font-semibold text-gray-700 underline decoration-gray-300 underline-offset-4 hover:text-gray-950 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          aria-expanded={expanded}
        >
          {expanded ? 'Show fewer comments' : `+${remaining} more comments`}
        </button>
      ) : null}
    </div>
  );
}

function CommentForm({
  entityId,
  parentActivityId = null,
  actor,
  submitLabel,
  autoFocus = false,
  onCancel,
  onSaved,
}: {
  entityId: string;
  parentActivityId?: string | null;
  actor: { actorId: string | null; actorDisplayName: string };
  submitLabel: string;
  autoFocus?: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const remaining = ACTIVITY_COMMENT_MAX_LENGTH - body.length;
  const trimmedBody = body.trim();

  useEffect(() => {
    if (autoFocus) {
      textareaRef.current?.focus();
    }
  }, [autoFocus]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmedBody) {
      setError('Comment cannot be empty.');
      return;
    }

    if (body.length > ACTIVITY_COMMENT_MAX_LENGTH) {
      setError(`Comment cannot exceed ${ACTIVITY_COMMENT_MAX_LENGTH} characters.`);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      createComment('LEAD', entityId, body, {
        parentActivityId,
        actorId: actor.actorId,
        actorDisplayName: actor.actorDisplayName,
      });
      setBody('');
      onSaved();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not save comment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
        Comment
        <textarea
          ref={textareaRef}
          value={body}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              onCancel();
            }
          }}
          onChange={(event) => {
            setBody(event.target.value.slice(0, ACTIVITY_COMMENT_MAX_LENGTH));
            setError(null);
          }}
          className="min-h-20 rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          maxLength={ACTIVITY_COMMENT_MAX_LENGTH}
        />
      </label>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className={`text-xs ${remaining < 20 ? 'text-amber-700' : 'text-gray-500'}`}>{remaining} characters remaining</p>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving || !trimmedBody}
            className="rounded bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {saving ? 'Saving...' : submitLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
          >
            Cancel
          </button>
        </div>
      </div>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </form>
  );
}

function TimelineSkeleton() {
  return (
    <div className="mt-5 space-y-3" aria-label="Loading activity">
      {[0, 1, 2].map((item) => (
        <div key={item} className="rounded border border-gray-200 bg-gray-50 p-4">
          <div className="h-4 w-1/3 rounded bg-gray-200" />
          <div className="mt-3 h-3 w-2/3 rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}
