import { Lock } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CONFIGURABLE_LEAD_CHANGE_DOCUMENTATION_ACTIONS,
  CONFIGURABLE_TASK_CHANGE_DOCUMENTATION_ACTIONS,
  enableAllLeadDocumentationPrompts,
  enableAllTaskDocumentationPrompts,
  getChangeDocumentationSettings,
  isChangeReasonRequired,
  restoreDefaultChangeDocumentationSettings,
  shouldRequestChangeDocumentation,
  subscribeToChangeDocumentationSettings,
  updateChangeDocumentationSetting,
  type ChangeDocumentationSettings,
  type ConfigurableChangeDocumentationAction,
  type LeadChangeDocumentationAction,
  type TaskChangeDocumentationAction,
} from '../../lib/change-documentation-settings';

type Feedback = {
  kind: 'success' | 'error';
  message: string;
};

type ConfigurableRow = {
  action: ConfigurableChangeDocumentationAction;
  label: string;
  description: string;
};

type LockedRow = {
  action: LeadChangeDocumentationAction;
  label: string;
  description: string;
};

const LEAD_ROWS: ConfigurableRow[] = [
  {
    action: 'lead.status_changed',
    label: 'Status changes',
    description: 'Ask for context when moving a Lead between lifecycle stages.',
  },
  {
    action: 'lead.temperature_changed',
    label: 'Temperature changes',
    description: 'Ask when changing Hot, Warm, or Cold.',
  },
  {
    action: 'lead.owner_changed',
    label: 'Owner changes',
    description: 'Ask when assigning or reassigning a Lead.',
  },
  {
    action: 'lead.detail_changed',
    label: 'Lead detail changes',
    description: 'Ask when saving meaningful Lead information changes.',
  },
  {
    action: 'lead.marked_won',
    label: 'Mark Lead as Won',
    description: 'Ask for context when completing the Lead lifecycle successfully.',
  },
];

const LOCKED_LEAD_ROWS: LockedRow[] = [
  {
    action: 'lead.marked_lost',
    label: 'Mark Lead as Lost',
    description: 'Always requires a written reason.',
  },
  {
    action: 'lead.reopened',
    label: 'Reopen Lost Lead',
    description: 'Always requires a written reason.',
  },
];

const TASK_ROWS: ConfigurableRow[] = [
  {
    action: 'task.status_changed',
    label: 'Status changes',
    description: 'Ask when moving a Task between working statuses.',
  },
  {
    action: 'task.detail_changed',
    label: 'Task detail changes',
    description: 'Ask when saving meaningful changes to Task information.',
  },
  {
    action: 'task.assignee_changed',
    label: 'Assignee changes',
    description: 'Ask when assigning or reassigning responsibility.',
  },
  {
    action: 'task.due_date_changed',
    label: 'Due-date changes',
    description: 'Ask when rescheduling a Task.',
  },
  {
    action: 'task.complete_reopen',
    label: 'Complete or reopen Task',
    description: 'Ask when completing or reopening a Task.',
  },
];

function getRequestState(action: ConfigurableChangeDocumentationAction) {
  return shouldRequestChangeDocumentation(action);
}

function isDefaultState(settings: ChangeDocumentationSettings) {
  return (
    settings.lead.statusChanges &&
    settings.lead.temperatureChanges &&
    settings.lead.ownerChanges &&
    settings.lead.detailChanges &&
    settings.lead.markWon &&
    settings.task.statusChanges &&
    settings.task.detailChanges &&
    settings.task.assigneeChanges &&
    settings.task.dueDateChanges &&
    settings.task.completeReopen
  );
}

export function ChangeDocumentationSettingsSection() {
  const [settings, setSettings] = useState(() => getChangeDocumentationSettings());
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    return subscribeToChangeDocumentationSettings(() => {
      setSettings(getChangeDocumentationSettings());
    });
  }, []);

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeout = window.setTimeout(() => setFeedback(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const allLeadEnabled = useMemo(
    () => CONFIGURABLE_LEAD_CHANGE_DOCUMENTATION_ACTIONS.every((action) => shouldRequestChangeDocumentation(action)),
    [settings],
  );
  const allTaskEnabled = useMemo(
    () => CONFIGURABLE_TASK_CHANGE_DOCUMENTATION_ACTIONS.every((action) => shouldRequestChangeDocumentation(action)),
    [settings],
  );
  const defaultsRestored = useMemo(() => isDefaultState(settings), [settings]);

  function refreshSettings() {
    setSettings(getChangeDocumentationSettings());
  }

  function handleToggle(action: ConfigurableChangeDocumentationAction, enabled: boolean) {
    if (getRequestState(action) === enabled) {
      return;
    }

    try {
      const updatedSettings = updateChangeDocumentationSetting(action, enabled);
      setSettings(updatedSettings);
      setFeedback({ kind: 'success', message: 'Settings updated.' });
    } catch (error) {
      refreshSettings();
      setFeedback({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Could not update documentation settings.',
      });
    }
  }

  function handleEnableAll(group: 'lead' | 'task') {
    const alreadyEnabled = group === 'lead' ? allLeadEnabled : allTaskEnabled;
    if (alreadyEnabled) {
      return;
    }

    try {
      const updatedSettings = group === 'lead'
        ? enableAllLeadDocumentationPrompts()
        : enableAllTaskDocumentationPrompts();
      setSettings(updatedSettings);
      setFeedback({ kind: 'success', message: group === 'lead' ? 'Lead prompts enabled.' : 'Task prompts enabled.' });
    } catch (error) {
      refreshSettings();
      setFeedback({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Could not update documentation settings.',
      });
    }
  }

  function handleRestoreDefaults() {
    if (defaultsRestored) {
      return;
    }

    try {
      const updatedSettings = restoreDefaultChangeDocumentationSettings();
      setSettings(updatedSettings);
      setFeedback({ kind: 'success', message: 'Defaults restored.' });
    } catch (error) {
      refreshSettings();
      setFeedback({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Could not restore defaults.',
      });
    }
  }

  return (
    <section className="rounded border border-gray-200 bg-white p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Change documentation</h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Choose which changes should ask users to add an optional comment before saving. All important changes are still recorded automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRestoreDefaults}
          disabled={defaultsRestored}
          className="w-fit rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
        >
          Restore defaults
        </button>
      </div>

      <p className="mt-4 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
        Turning a setting off removes the documentation prompt only. Activity tracking stays on.
      </p>

      <div aria-live="polite" className="mt-3 min-h-6">
        {feedback ? (
          <p className={feedback.kind === 'success' ? 'text-sm text-green-700' : 'text-sm text-red-700'}>
            {feedback.message}
          </p>
        ) : null}
      </div>

      <div className="mt-3 grid gap-5 lg:grid-cols-2">
        <SettingsGroup
          title="Lead changes"
          helper="Optional-comment prompts for meaningful Lead updates."
          rows={LEAD_ROWS}
          allEnabled={allLeadEnabled}
          onEnableAll={() => handleEnableAll('lead')}
          onToggle={handleToggle}
        >
          <div className="border-t border-gray-100">
            {LOCKED_LEAD_ROWS.map((row) => (
              <LockedRuleRow key={row.action} row={row} />
            ))}
          </div>
        </SettingsGroup>

        <SettingsGroup
          title="Task changes"
          helper="Optional-comment prompts for meaningful changes to Lead-related Tasks."
          rows={TASK_ROWS}
          allEnabled={allTaskEnabled}
          onEnableAll={() => handleEnableAll('task')}
          onToggle={handleToggle}
        />
      </div>
    </section>
  );
}

function SettingsGroup({
  title,
  helper,
  rows,
  allEnabled,
  onEnableAll,
  onToggle,
  children,
}: {
  title: string;
  helper: string;
  rows: ConfigurableRow[];
  allEnabled: boolean;
  onEnableAll: () => void;
  onToggle: (action: ConfigurableChangeDocumentationAction, enabled: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <section className="rounded border border-gray-200">
      <div className="flex flex-col gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="mt-0.5 text-sm text-gray-600">{helper}</p>
        </div>
        <button
          type="button"
          onClick={onEnableAll}
          disabled={allEnabled}
          className="w-fit rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
        >
          Enable all
        </button>
      </div>
      <div className="divide-y divide-gray-100">
        {rows.map((row) => (
          <PromptToggleRow key={row.action} row={row} onToggle={onToggle} />
        ))}
        {children}
      </div>
    </section>
  );
}

function PromptToggleRow({
  row,
  onToggle,
}: {
  row: ConfigurableRow;
  onToggle: (action: ConfigurableChangeDocumentationAction, enabled: boolean) => void;
}) {
  const id = `change-documentation-${row.action.replace(/[._]/g, '-')}`;
  const descriptionId = `${id}-description`;
  const checked = shouldRequestChangeDocumentation(row.action);

  return (
    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-gray-900">
          {row.label}
        </label>
        <p id={descriptionId} className="mt-0.5 text-sm text-gray-600">
          {row.description}
        </p>
      </div>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        aria-describedby={descriptionId}
        onChange={(event) => onToggle(row.action, event.target.checked)}
        className="h-5 w-10 shrink-0 cursor-pointer appearance-none rounded-full border border-gray-300 bg-gray-200 transition checked:border-gray-900 checked:bg-gray-900 before:block before:h-4 before:w-4 before:translate-x-0.5 before:translate-y-0.5 before:rounded-full before:bg-white before:transition checked:before:translate-x-5 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
      />
    </div>
  );
}

function LockedRuleRow({ row }: { row: LockedRow }) {
  const required = isChangeReasonRequired(row.action);

  return (
    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">{row.label}</p>
        <p className="mt-0.5 text-sm text-gray-600">{row.description}</p>
      </div>
      <span
        aria-label={`${row.label}: ${required ? 'always requires a reason and cannot be changed' : 'not required'}`}
        className="inline-flex w-fit shrink-0 items-center gap-2 rounded border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-700"
      >
        <Lock className="h-4 w-4" aria-hidden="true" />
        Always requires a reason
      </span>
    </div>
  );
}
