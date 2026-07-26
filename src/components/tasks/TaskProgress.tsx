import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Activity } from '../../lib/activities';
import type { Task } from '../../lib/tasks';

type Props = {
  task: Pick<Task, 'id' | 'status' | 'waitingFromStatus'>;
  activities: Activity[];
};

const stages = [
  { status: 'TODO', label: 'To do' },
  { status: 'IN_PROGRESS', label: 'In progress' },
  { status: 'DONE', label: 'Done' },
] as const;

function timestamp(value: string) {
  const result = new Date(value).getTime();
  return Number.isNaN(result) ? 0 : result;
}

function changedToWaiting(activity: Activity) {
  return activity.kind === 'CHANGE'
    && activity.relatedTaskId
    && activity.changes?.some((change) => change.field === 'status' && String(change.to).toUpperCase() === 'WAITING');
}

export function TaskProgress({ task, activities }: Props) {
  const pausedStatus = task.status === 'WAITING' ? task.waitingFromStatus ?? 'IN_PROGRESS' : null;
  const effectiveStatus = pausedStatus ?? task.status;
  const currentIndex = stages.findIndex((stage) => stage.status === effectiveStatus);
  const waitingActivity = useMemo(
    () => task.status === 'WAITING'
      ? activities
        .filter((activity) => activity.relatedTaskId === task.id && changedToWaiting(activity))
        .sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt))[0] ?? null
      : null,
    [activities, task.id, task.status],
  );

  return (
    <section aria-label="Task progress" className="rounded border border-gray-200 bg-gray-50 px-4 py-4">
      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-0">
        {stages.map((stage, index) => {
          const passed = task.status === 'DONE' || index < currentIndex;
          const current = index === currentIndex && task.status !== 'DONE';
          const waitingHere = pausedStatus === stage.status;
          return (
            <li key={stage.status} className="relative flex min-w-0 items-start sm:block">
              {index > 0 ? <span className={`absolute right-1/2 top-3 hidden h-0.5 w-full sm:block ${passed || current ? 'bg-emerald-500' : 'bg-gray-200'}`} aria-hidden="true" /> : null}
              <div className="relative z-10 flex min-w-0 items-center gap-3 sm:flex-col sm:gap-2">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${passed ? 'border-emerald-600 bg-emerald-600 text-white' : current ? 'border-gray-900 bg-white text-gray-900' : 'border-gray-300 bg-white text-gray-400'}`}>
                  {passed ? '✓' : index + 1}
                </span>
                <span className={`text-sm font-semibold ${passed || current ? 'text-gray-900' : 'text-gray-400'}`}>{stage.label}</span>
              </div>
              {waitingHere ? (
                <div className="ml-9 mt-2 sm:ml-0 sm:flex sm:flex-col sm:items-center">
                  <span className="hidden h-3 w-px bg-amber-400 sm:block" aria-hidden="true" />
                  <WaitingDetails activity={waitingActivity} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function WaitingDetails({ activity }: { activity: Activity | null }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const details = activity?.comment?.trim() || 'No details added.';

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        rootRef.current?.querySelector('button')?.focus();
      }
    };
    document.addEventListener('pointerdown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <span
      ref={rootRef}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 outline-none ring-amber-500 focus:ring-2 focus:ring-offset-2"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={(event) => {
          if (!rootRef.current?.contains(event.relatedTarget as Node)) setOpen(false);
        }}
        onClick={() => setOpen((current) => !current)}
      >
        Waiting
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="absolute left-0 top-full z-50 mt-2 w-max max-w-[min(20rem,calc(100vw-3rem))] whitespace-pre-wrap break-words rounded border border-amber-200 bg-white px-3 py-2 text-left text-sm font-normal text-gray-800 shadow-lg sm:left-1/2 sm:-translate-x-1/2"
        >
          {details}
        </span>
      ) : null}
    </span>
  );
}
