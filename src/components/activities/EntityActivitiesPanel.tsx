import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { listActivities, type ActivitiesResponse, type Activity } from '../../lib/activities';
import type { HttpError } from '../../lib/http';
import { listLeadSourceOptions, type LeadSourceOption } from '../../lib/lead-sources';
import { listMembershipOptions, type MembershipOption } from '../../lib/memberships';
import type { EntityType } from '../../lib/notes';

type EntityActivitiesPanelProps = {
  entityType: EntityType;
  entityId: string;
  title?: string;
  variant?: 'default' | 'mobile';
};

type RequestError = {
  status: number;
  message: string;
};

const EMBEDDED_ACTIVITY_LIMIT = 10;

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

function shortId(id: string) {
  return id.slice(0, 8);
}

function getMembershipDisplayName(membership: MembershipOption) {
  return [membership.user.firstName, membership.user.lastName].filter(Boolean).join(' ') || membership.user.email;
}

function resolveActorLabel(actorId: string | null, membershipsByUserId: Map<string, MembershipOption>) {
  if (!actorId) {
    return 'System';
  }

  const membership = membershipsByUserId.get(actorId);
  if (membership) {
    return getMembershipDisplayName(membership);
  }

  return `User ${shortId(actorId)}`;
}

function stringifyPayload(payload: unknown) {
  if (payload === null || payload === undefined) {
    return '';
  }

  if (typeof payload === 'string') {
    return payload;
  }

  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

const ENUM_LABELS: Record<string, Record<string, string>> = {
  status: {
    NEW: 'New',
    CONTACTED: 'Contacted',
    QUALIFIED: 'Qualified',
    LOST: 'Lost',
    CONVERTED: 'Converted',
  },
  temperature: {
    HOT: 'Hot',
    WARM: 'Warm',
    COLD: 'Cold',
  },
  source: {
    MANUAL: 'Manual',
    WEBSITE: 'Website',
    WHATSAPP: 'WhatsApp',
    INSTAGRAM: 'Instagram',
    FACEBOOK: 'Facebook',
    PHONE: 'Phone',
    REFERRAL: 'Referral',
    OTHER: 'Other',
  },
};

const DATE_FIELDS = new Set(['nextFollowUpAt', 'lostAt', 'convertedAt']);
const HIDDEN_CHANGE_FIELDS = new Set(['convertedContactId']);

function formatDisplayValue(
  value: unknown,
  field?: string,
  membershipsByUserId?: Map<string, MembershipOption>,
  leadSourcesById?: Map<string, LeadSourceOption>,
) {
  if (value === null || value === undefined) {
    return '\u2014';
  }

  if (typeof value === 'string') {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return '\u2014';
    }

    if (field && ENUM_LABELS[field]?.[trimmedValue]) {
      return ENUM_LABELS[field][trimmedValue];
    }

    if (field && DATE_FIELDS.has(field)) {
      return formatDateTime(trimmedValue);
    }

    if (field === 'ownerId') {
      const membership = membershipsByUserId?.get(trimmedValue);
      return membership ? getMembershipDisplayName(membership) : 'Unknown user';
    }

    if (field === 'leadSourceId') {
      return leadSourcesById?.get(trimmedValue)?.name ?? 'Unknown lead source';
    }

    return trimmedValue;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function humanizePayloadKey(key: string) {
  const labels: Record<string, string> = {
    status: 'Status',
    temperature: 'Temperature',
    ownerId: 'Owner',
    leadSourceId: 'Lead source',
    nextFollowUpAt: 'Next follow-up',
    firstName: 'First name',
    lastName: 'Last name',
    email: 'Email',
    phone: 'Phone',
    lostAt: 'Lost on',
    convertedAt: 'Converted on',
    lostReason: 'Lost reason',
    source: 'Source',
    sourceDetail: 'Source detail',
    stageName: 'Stage',
    pipelineName: 'Pipeline',
  };

  if (labels[key]) {
    return labels[key];
  }

  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (first) => first.toUpperCase());
}

function formatActivityAction(action: string) {
  const labels: Record<string, string> = {
    'contact.created': 'Contact created',
    'contact.updated': 'Contact updated',
    'contact.archived': 'Contact archived',
    'contact.restored': 'Contact restored',
    'contact.created_from_lead': 'Created from converted lead',
    'lead.created': 'Lead created',
    'lead.updated': 'Lead updated',
    'lead.marked_lost': 'Lead marked as lost',
    'lead.reopened': 'Lead reopened',
    'lead.converted': 'Lead converted to contact',
    'deal.created': 'Deal created',
    'deal.updated': 'Deal updated',
    'deal.moved': 'Deal moved',
    'deal.won': 'Deal marked as won',
    'deal.lost': 'Deal marked as lost',
    'deal.reopened': 'Deal reopened',
    'whatsapp.message.received': 'WhatsApp message received',
  };

  return labels[action] ?? action;
}

function hasStringField(payload: unknown, key: string): payload is Record<string, string> {
  return Boolean(isRecord(payload) && key in payload && typeof payload[key] === 'string');
}

function formatChangeLines(
  payload: unknown,
  membershipsByUserId: Map<string, MembershipOption>,
  leadSourcesById: Map<string, LeadSourceOption>,
) {
  if (!isRecord(payload) || !Array.isArray(payload.changes)) {
    return [];
  }

  return payload.changes.flatMap((change) => {
    if (!isRecord(change)) {
      return [];
    }

    const field = typeof change.field === 'string' ? change.field.trim() : '';
    if (HIDDEN_CHANGE_FIELDS.has(field)) {
      return [];
    }

    const label = typeof change.label === 'string' && change.label.trim()
      ? change.label.trim()
      : field
        ? humanizePayloadKey(field)
        : '';

    if (!label || (!('from' in change) && !('to' in change))) {
      return [];
    }

    return [`${label}: ${formatDisplayValue(change.from, field, membershipsByUserId, leadSourcesById)} \u2192 ${formatDisplayValue(change.to, field, membershipsByUserId, leadSourcesById)}`];
  });
}

function formatTransitionLines(
  payload: unknown,
  membershipsByUserId: Map<string, MembershipOption>,
  leadSourcesById: Map<string, LeadSourceOption>,
) {
  if (!isRecord(payload)) {
    return [];
  }

  const from = isRecord(payload.from) ? payload.from : {};
  const to = isRecord(payload.to) ? payload.to : {};
  const keys = Array.from(new Set([...Object.keys(from), ...Object.keys(to)]));

  return keys.flatMap((key) => {
    if (HIDDEN_CHANGE_FIELDS.has(key)) {
      return [];
    }

    const hasFromValue = Object.prototype.hasOwnProperty.call(from, key);
    const hasToValue = Object.prototype.hasOwnProperty.call(to, key);

    if (!hasFromValue && !hasToValue) {
      return [];
    }

    return [`${humanizePayloadKey(key)}: ${formatDisplayValue(from[key], key, membershipsByUserId, leadSourcesById)} \u2192 ${formatDisplayValue(to[key], key, membershipsByUserId, leadSourcesById)}`];
  });
}

function formatActivityPayload(
  action: string,
  payload: unknown,
  membershipsByUserId: Map<string, MembershipOption>,
  leadSourcesById: Map<string, LeadSourceOption>,
) {
  if (action === 'whatsapp.message.received') {
    if (hasStringField(payload, 'from') && hasStringField(payload, 'text')) {
      return {
        lines: [`From: ${payload.from}`, `Message: ${payload.text}`],
        raw: '',
      };
    }

    return {
      lines: [],
      raw: stringifyPayload(payload),
    };
  }

  if (action === 'lead.converted') {
    return { lines: [], raw: '' };
  }

  const changeLines = formatChangeLines(payload, membershipsByUserId, leadSourcesById);
  if (changeLines.length > 0) {
    return { lines: changeLines, raw: '' };
  }

  const transitionLines = formatTransitionLines(payload, membershipsByUserId, leadSourcesById);
  if (transitionLines.length > 0) {
    return { lines: transitionLines, raw: '' };
  }

  const raw = stringifyPayload(payload);
  if (raw && !formatActivityAction(action).includes(action)) {
    return { lines: [], raw };
  }

  return { lines: [], raw: formatActivityAction(action) === action ? raw : '' };
}

export function EntityActivitiesPanel({ entityType, entityId, title = 'Recent activities', variant = 'default' }: EntityActivitiesPanelProps) {
  const { accessToken } = useAuth();
  const [activitiesData, setActivitiesData] = useState<ActivitiesResponse | null>(null);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [activitiesError, setActivitiesError] = useState<RequestError | null>(null);
  const [memberships, setMemberships] = useState<MembershipOption[]>([]);
  const [leadSources, setLeadSources] = useState<LeadSourceOption[]>([]);
  const [membershipWarning, setMembershipWarning] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const membershipsByUserId = useMemo(() => new Map(memberships.map((membership) => [membership.userId, membership])), [memberships]);
  const leadSourcesById = useMemo(() => new Map(leadSources.map((leadSource) => [leadSource.id, leadSource])), [leadSources]);
  const activities = activitiesData?.data ?? [];
  const totalActivities = activitiesData?.total ?? activities.length;

  const refreshActivities = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!accessToken) {
      setActivitiesData(null);
      setActivitiesLoading(false);
      setActivitiesError(null);
      return;
    }

    let active = true;
    const token = accessToken;

    async function fetchActivities() {
      setActivitiesLoading(true);
      setActivitiesError(null);

      try {
        const response = await listActivities(token, {
          entityType,
          entityId,
          page: 1,
          limit: EMBEDDED_ACTIVITY_LIMIT,
        });

        if (!active) {
          return;
        }

        setActivitiesData(response);
      } catch (requestError) {
        if (!active) {
          return;
        }

        setActivitiesData(null);
        setActivitiesError(toRequestError(requestError, 'Could not load recent activities.'));
      } finally {
        if (active) {
          setActivitiesLoading(false);
        }
      }
    }

    void fetchActivities();

    return () => {
      active = false;
    };
  }, [accessToken, entityId, entityType, refreshKey]);

  useEffect(() => {
    if (!accessToken) {
      setMemberships([]);
      setMembershipWarning(null);
      return;
    }

    let active = true;
    const token = accessToken;

    async function fetchMemberships() {
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
        setMembershipWarning('Actor names could not be loaded.');
      }
    }

    void fetchMemberships();

    return () => {
      active = false;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || entityType !== 'LEAD') {
      setLeadSources([]);
      return;
    }

    let active = true;
    const token = accessToken;

    async function fetchLeadSources() {
      try {
        const response = await listLeadSourceOptions(token);
        if (active) {
          setLeadSources(response);
        }
      } catch {
        if (active) {
          setLeadSources([]);
        }
      }
    }

    void fetchLeadSources();

    return () => {
      active = false;
    };
  }, [accessToken, entityType]);

  return (
    <section className={variant === 'mobile' ? 'rounded-xl border border-gray-200 bg-white p-3 shadow-sm' : 'rounded border border-gray-200 bg-white p-5'}>
      <div className={variant === 'mobile' ? 'flex items-start justify-between gap-3' : 'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'}>
        <div>
          <h2 className={variant === 'mobile' ? 'text-sm font-semibold text-gray-950' : 'text-base font-semibold text-gray-900'}>{title}</h2>
          <p className={variant === 'mobile' ? 'mt-0.5 text-xs text-gray-500' : 'mt-1 text-sm text-gray-600'}>
            {totalActivities === 1 ? '1 related activity' : `${totalActivities} related activities`}
          </p>
        </div>
        <button
          type="button"
          onClick={refreshActivities}
          className={variant === 'mobile' ? 'shrink-0 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50' : 'rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2'}
        >
          Refresh
        </button>
      </div>
      {membershipWarning ? <p className="mt-4 rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">{membershipWarning}</p> : null}

      {activitiesLoading ? <p className="mt-5 rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">Loading recent activities...</p> : null}

      {!activitiesLoading && activitiesError ? (
        <div className="mt-5 rounded border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{activitiesError.message}</p>
          <button
            type="button"
            onClick={refreshActivities}
            className="mt-3 rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            Retry
          </button>
        </div>
      ) : null}

      {!activitiesLoading && !activitiesError && activities.length === 0 ? (
        <p className="mt-5 rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">No recent activities yet.</p>
      ) : null}

      {!activitiesLoading && !activitiesError && activities.length > 0 ? (
        <div className={variant === 'mobile' ? 'mt-3 space-y-2' : 'mt-5 space-y-3'}>
          {activities.map((activity) => (
            <EmbeddedActivityCard
              key={activity.id}
              activity={activity}
              actorLabel={resolveActorLabel(activity.actorId, membershipsByUserId)}
              compact={variant === 'mobile'}
              membershipsByUserId={membershipsByUserId}
              leadSourcesById={leadSourcesById}
            />
          ))}
          {totalActivities > activities.length ? (
            <p className="text-sm text-gray-600">Showing {activities.length} of {totalActivities} related activities.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

type EmbeddedActivityCardProps = {
  activity: Activity;
  actorLabel: string;
  compact: boolean;
  membershipsByUserId: Map<string, MembershipOption>;
  leadSourcesById: Map<string, LeadSourceOption>;
};

function EmbeddedActivityCard({ activity, actorLabel, compact, membershipsByUserId, leadSourcesById }: EmbeddedActivityCardProps) {
  const payload = formatActivityPayload(activity.action, activity.payload, membershipsByUserId, leadSourcesById);

  return (
    <article className={compact ? 'rounded-lg border border-gray-100 bg-gray-50 p-2.5' : 'rounded border border-gray-200 bg-gray-50 p-4'}>
      <div className={compact ? 'flex items-start justify-between gap-3' : 'flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between'}>
        <h3 className="break-words text-sm font-semibold text-gray-900">{formatActivityAction(activity.action)}</h3>
        <div className={compact ? 'shrink-0 text-right text-[10px] leading-4 text-gray-500' : 'text-sm text-gray-600 sm:text-right'}>
          <p>{actorLabel}</p>
          <p>{formatDateTime(activity.createdAt)}</p>
        </div>
      </div>
      {payload.lines.length > 0 ? (
        <div className="mt-3 space-y-1 text-sm text-gray-700">
          {payload.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
      {!compact && payload.raw ? <pre className="mt-3 whitespace-pre-wrap break-words text-sm text-gray-700">{payload.raw}</pre> : null}
    </article>
  );
}
