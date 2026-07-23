// src/lib/change-documentation-settings.ts - demo mode

const CHANGE_DOCUMENTATION_SETTINGS_CHANGED_EVENT = 'alozix-demo-change-documentation-settings-changed';

export type LeadChangeDocumentationSettings = {
  statusChanges: boolean;
  temperatureChanges: boolean;
  ownerChanges: boolean;
  detailChanges: boolean;
  markWon: boolean;
  markLostReasonRequired: true;
  reopenLostReasonRequired: true;
};

export type TaskChangeDocumentationSettings = {
  statusChanges: boolean;
  detailChanges: boolean;
  assigneeChanges: boolean;
  dueDateChanges: boolean;
  completeReopen: boolean;
};

export type ChangeDocumentationSettings = {
  lead: LeadChangeDocumentationSettings;
  task: TaskChangeDocumentationSettings;
};

export type LeadChangeDocumentationAction =
  | 'lead.status_changed'
  | 'lead.temperature_changed'
  | 'lead.owner_changed'
  | 'lead.detail_changed'
  | 'lead.marked_won'
  | 'lead.marked_lost'
  | 'lead.reopened';

export type TaskChangeDocumentationAction =
  | 'task.status_changed'
  | 'task.detail_changed'
  | 'task.assignee_changed'
  | 'task.due_date_changed'
  | 'task.complete_reopen';

export type ChangeDocumentationAction = LeadChangeDocumentationAction | TaskChangeDocumentationAction;

export type ConfigurableChangeDocumentationAction = Exclude<
  ChangeDocumentationAction,
  'lead.marked_lost' | 'lead.reopened'
>;

export const LEAD_CHANGE_DOCUMENTATION_ACTIONS = [
  'lead.status_changed',
  'lead.temperature_changed',
  'lead.owner_changed',
  'lead.detail_changed',
  'lead.marked_won',
  'lead.marked_lost',
  'lead.reopened',
] as const satisfies readonly LeadChangeDocumentationAction[];

export const TASK_CHANGE_DOCUMENTATION_ACTIONS = [
  'task.status_changed',
  'task.detail_changed',
  'task.assignee_changed',
  'task.due_date_changed',
  'task.complete_reopen',
] as const satisfies readonly TaskChangeDocumentationAction[];

export const CONFIGURABLE_LEAD_CHANGE_DOCUMENTATION_ACTIONS = [
  'lead.status_changed',
  'lead.temperature_changed',
  'lead.owner_changed',
  'lead.detail_changed',
  'lead.marked_won',
] as const satisfies readonly ConfigurableChangeDocumentationAction[];

export const CONFIGURABLE_TASK_CHANGE_DOCUMENTATION_ACTIONS = [
  'task.status_changed',
  'task.detail_changed',
  'task.assignee_changed',
  'task.due_date_changed',
  'task.complete_reopen',
] as const satisfies readonly ConfigurableChangeDocumentationAction[];

const ACTION_SETTING_PATHS: Record<
  ConfigurableChangeDocumentationAction,
  { group: 'lead' | 'task'; setting: keyof Omit<LeadChangeDocumentationSettings, 'markLostReasonRequired' | 'reopenLostReasonRequired'> | keyof TaskChangeDocumentationSettings }
> = {
  'lead.status_changed': { group: 'lead', setting: 'statusChanges' },
  'lead.temperature_changed': { group: 'lead', setting: 'temperatureChanges' },
  'lead.owner_changed': { group: 'lead', setting: 'ownerChanges' },
  'lead.detail_changed': { group: 'lead', setting: 'detailChanges' },
  'lead.marked_won': { group: 'lead', setting: 'markWon' },
  'task.status_changed': { group: 'task', setting: 'statusChanges' },
  'task.detail_changed': { group: 'task', setting: 'detailChanges' },
  'task.assignee_changed': { group: 'task', setting: 'assigneeChanges' },
  'task.due_date_changed': { group: 'task', setting: 'dueDateChanges' },
  'task.complete_reopen': { group: 'task', setting: 'completeReopen' },
};

export const DEFAULT_CHANGE_DOCUMENTATION_SETTINGS: Readonly<ChangeDocumentationSettings> = deepFreeze({
  lead: {
    statusChanges: true,
    temperatureChanges: true,
    ownerChanges: true,
    detailChanges: true,
    markWon: true,
    markLostReasonRequired: true,
    reopenLostReasonRequired: true,
  },
  task: {
    statusChanges: true,
    detailChanges: true,
    assigneeChanges: true,
    dueDateChanges: true,
    completeReopen: true,
  },
});

let currentSettings = cloneSettings(DEFAULT_CHANGE_DOCUMENTATION_SETTINGS);

function deepFreeze<T extends Record<string, unknown>>(value: T): Readonly<T> {
  Object.freeze(value);
  for (const item of Object.values(value)) {
    if (item && typeof item === 'object') {
      deepFreeze(item as Record<string, unknown>);
    }
  }
  return value;
}

function cloneSettings(settings: Readonly<ChangeDocumentationSettings>): ChangeDocumentationSettings {
  return {
    lead: { ...settings.lead },
    task: { ...settings.task },
  };
}

function notifyChangeDocumentationSettingsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHANGE_DOCUMENTATION_SETTINGS_CHANGED_EVENT));
  }
}

function applySettings(nextSettings: ChangeDocumentationSettings) {
  if (settingsEqual(currentSettings, nextSettings)) {
    return false;
  }

  currentSettings = cloneSettings(nextSettings);
  notifyChangeDocumentationSettingsChanged();
  return true;
}

function settingsEqual(left: ChangeDocumentationSettings, right: ChangeDocumentationSettings) {
  return (
    left.lead.statusChanges === right.lead.statusChanges &&
    left.lead.temperatureChanges === right.lead.temperatureChanges &&
    left.lead.ownerChanges === right.lead.ownerChanges &&
    left.lead.detailChanges === right.lead.detailChanges &&
    left.lead.markWon === right.lead.markWon &&
    left.lead.markLostReasonRequired === right.lead.markLostReasonRequired &&
    left.lead.reopenLostReasonRequired === right.lead.reopenLostReasonRequired &&
    left.task.statusChanges === right.task.statusChanges &&
    left.task.detailChanges === right.task.detailChanges &&
    left.task.assigneeChanges === right.task.assigneeChanges &&
    left.task.dueDateChanges === right.task.dueDateChanges &&
    left.task.completeReopen === right.task.completeReopen
  );
}

function isCriticalAction(action: ChangeDocumentationAction) {
  return action === 'lead.marked_lost' || action === 'lead.reopened';
}

function requireConfigurableAction(action: ChangeDocumentationAction): ConfigurableChangeDocumentationAction {
  if (isCriticalAction(action)) {
    throw new Error('Critical change documentation rules cannot be disabled.');
  }

  return action as ConfigurableChangeDocumentationAction;
}

export function getChangeDocumentationSettings(): ChangeDocumentationSettings {
  return cloneSettings(currentSettings);
}

export function updateChangeDocumentationSetting(action: ConfigurableChangeDocumentationAction, enabled: boolean): ChangeDocumentationSettings {
  const configurableAction = requireConfigurableAction(action);
  const path = ACTION_SETTING_PATHS[configurableAction];
  const nextSettings = cloneSettings(currentSettings);

  if (path.group === 'lead') {
    nextSettings.lead[path.setting as keyof Omit<LeadChangeDocumentationSettings, 'markLostReasonRequired' | 'reopenLostReasonRequired'>] = enabled;
  } else {
    nextSettings.task[path.setting as keyof TaskChangeDocumentationSettings] = enabled;
  }

  applySettings(nextSettings);
  return getChangeDocumentationSettings();
}

export function updateChangeDocumentationSettings(
  updates: Partial<Record<ConfigurableChangeDocumentationAction, boolean>>,
): ChangeDocumentationSettings {
  const nextSettings = cloneSettings(currentSettings);

  for (const [action, enabled] of Object.entries(updates) as Array<[ConfigurableChangeDocumentationAction, boolean | undefined]>) {
    if (enabled === undefined) {
      continue;
    }

    const configurableAction = requireConfigurableAction(action);
    const path = ACTION_SETTING_PATHS[configurableAction];
    if (path.group === 'lead') {
      nextSettings.lead[path.setting as keyof Omit<LeadChangeDocumentationSettings, 'markLostReasonRequired' | 'reopenLostReasonRequired'>] = enabled;
    } else {
      nextSettings.task[path.setting as keyof TaskChangeDocumentationSettings] = enabled;
    }
  }

  applySettings(nextSettings);
  return getChangeDocumentationSettings();
}

export function enableAllLeadDocumentationPrompts(): ChangeDocumentationSettings {
  return updateChangeDocumentationSettings(Object.fromEntries(
    CONFIGURABLE_LEAD_CHANGE_DOCUMENTATION_ACTIONS.map((action) => [action, true]),
  ) as Partial<Record<ConfigurableChangeDocumentationAction, boolean>>);
}

export function enableAllTaskDocumentationPrompts(): ChangeDocumentationSettings {
  return updateChangeDocumentationSettings(Object.fromEntries(
    CONFIGURABLE_TASK_CHANGE_DOCUMENTATION_ACTIONS.map((action) => [action, true]),
  ) as Partial<Record<ConfigurableChangeDocumentationAction, boolean>>);
}

export function restoreDefaultChangeDocumentationSettings(): ChangeDocumentationSettings {
  applySettings(cloneSettings(DEFAULT_CHANGE_DOCUMENTATION_SETTINGS));
  return getChangeDocumentationSettings();
}

export function shouldRequestChangeDocumentation(action: ChangeDocumentationAction): boolean {
  if (isCriticalAction(action)) {
    return true;
  }

  const path = ACTION_SETTING_PATHS[action];
  return path.group === 'lead'
    ? Boolean(currentSettings.lead[path.setting as keyof Omit<LeadChangeDocumentationSettings, 'markLostReasonRequired' | 'reopenLostReasonRequired'>])
    : Boolean(currentSettings.task[path.setting as keyof TaskChangeDocumentationSettings]);
}

export function isChangeReasonRequired(action: ChangeDocumentationAction): boolean {
  return isCriticalAction(action);
}

export function subscribeToChangeDocumentationSettings(listener: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  window.addEventListener(CHANGE_DOCUMENTATION_SETTINGS_CHANGED_EVENT, listener);
  return () => window.removeEventListener(CHANGE_DOCUMENTATION_SETTINGS_CHANGED_EVENT, listener);
}
