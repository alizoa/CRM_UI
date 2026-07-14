import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { useAuth } from '../context/AuthContext';
import {
  createLeadSource,
  deleteLeadSource,
  listLeadSources,
  updateLeadSource,
  type LeadSource,
} from '../lib/lead-sources';
import { createTag, deleteTag, listTags, updateTag, type Tag } from '../lib/tags';
import type { HttpError } from '../lib/http';
import {
  deleteWhatsappConfig,
  getWhatsappConfig,
  getWhatsappDiagnostics,
  saveWhatsappConfig,
  toggleWhatsappConfig,
  type WhatsappConfig,
  type WhatsappDiagnostics,
} from '../lib/whatsapp-config';
import {
  buildWebsiteCaptureDeveloperInstructions,
  buildWebsiteCaptureSnippet,
  createWebsiteCaptureConfig,
  getWebsiteCaptureConfig,
  revealWebsiteCaptureKey,
  rotateWebsiteCaptureKey,
  sendWebsiteTestLead,
  toggleWebsiteCaptureConfig,
  type WebsiteCaptureConfig,
} from '../lib/website-capture-config';
import { listLeads, type Lead } from '../lib/leads';
import {
  createApprovedTemplate,
  deleteApprovedTemplate,
  listApprovedTemplates,
  updateApprovedTemplate,
  type WhatsappApprovedTemplate,
} from '../lib/whatsapp-approved-templates';
import { WorkspaceSettingsSection } from '../components/settings/WorkspaceSettingsSection';

type RequestError = {
  status: number;
  message: string;
};

function toRequestError(error: unknown, fallback: string): RequestError {
  if (error && typeof error === 'object' && 'status' in error && 'message' in error) {
    const httpError = error as HttpError;

    return {
      status: httpError.status,
      message: getFriendlyMessage(httpError.status, httpError.message || fallback),
    };
  }

  return {
    status: 0,
    message: fallback,
  };
}

function getFriendlyMessage(status: number, fallback: string) {
  if (status === 403) {
    return 'You do not have permission to manage settings.';
  }

  if (status === 400) {
    return 'This item is already used and cannot be deleted.';
  }

  return fallback;
}

function emptyToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function SettingsPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
          <p className="mt-1 text-sm text-gray-600">Manage your workspace, contact options, and integrations.</p>
        </div>

        <WorkspaceSettingsSection />
        <WhatsappIntegrationSection />
        <WebsiteCaptureSection />
        <WhatsappApprovedTemplatesSection />
        <LeadSourcesSection />
        <TagsSection />
      </div>
    </AppShell>
  );
}

function formatConfigDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatDiagnosticDate(value: string | null) {
  return value ? formatConfigDate(value) : 'No activity yet';
}

function getWhatsappSetupStatus(diagnostics: WhatsappDiagnostics) {
  if (!diagnostics.integrationExists) return 'Not configured';
  if (!diagnostics.isActive) return 'Inactive';
  if (
    !diagnostics.phoneNumberIdConfigured ||
    !diagnostics.businessIdConfigured ||
    !diagnostics.tokenConfigured
  ) {
    return 'Setup incomplete';
  }
  if (diagnostics.lastInboundMessageAt) return 'Active - inbound messages received';
  if (diagnostics.lastWebhookReceivedAt) return 'Active - receiving webhooks';
  return 'Active - no webhook received yet';
}

function toWhatsappRequestError(error: unknown, fallback: string): RequestError {
  if (error && typeof error === 'object' && 'status' in error && 'message' in error) {
    const httpError = error as HttpError;

    if (httpError.status === 403) {
      return {
        status: httpError.status,
        message: 'You do not have permission to manage WhatsApp integration settings.',
      };
    }

    if (httpError.status === 401) {
      return {
        status: httpError.status,
        message: 'You need to sign in before managing WhatsApp integration settings.',
      };
    }

    return {
      status: httpError.status,
      message: httpError.message || fallback,
    };
  }

  return { status: 0, message: fallback };
}

function WhatsappIntegrationSection() {
  const { accessToken } = useAuth();
  const [config, setConfig] = useState<WhatsappConfig | null>(null);
  const [diagnostics, setDiagnostics] = useState<WhatsappDiagnostics | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<RequestError | null>(null);
  const [actionError, setActionError] = useState<RequestError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [businessId, setBusinessId] = useState('');
  const [accessTokenInput, setAccessTokenInput] = useState('');
  const [restartTemplateName, setRestartTemplateName] = useState('');
  const [restartTemplateLanguageCode, setRestartTemplateLanguageCode] = useState('');

  const fetchWhatsappState = useCallback(async (showLoadedMessage = false) => {
    if (!accessToken) {
      setConfig(null);
      setDiagnostics(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [configResponse, diagnosticsResponse] = await Promise.all([
        getWhatsappConfig(accessToken),
        getWhatsappDiagnostics(accessToken),
      ]);
      setConfig(configResponse);
      setDiagnostics(diagnosticsResponse);
      setDisplayName(configResponse?.displayName ?? '');
      setRestartTemplateName(configResponse?.restartTemplateName ?? '');
      setRestartTemplateLanguageCode(configResponse?.restartTemplateLanguageCode ?? '');
      if (showLoadedMessage) {
        setSuccessMessage(configResponse ? 'WhatsApp configuration loaded.' : null);
      }
    } catch (requestError) {
      setConfig(null);
      setDiagnostics(null);
      setError(toWhatsappRequestError(requestError, 'Could not load WhatsApp configuration and diagnostics.'));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void fetchWhatsappState(true);
  }, [fetchWhatsappState]);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken) {
      setActionError({
        status: 401,
        message: 'You need to sign in before managing WhatsApp integration settings.',
      });
      return;
    }

    const trimmedPhoneNumberId = phoneNumberId.trim();
    const trimmedBusinessId = businessId.trim();
    const trimmedAccessToken = accessTokenInput.trim();
    const trimmedRestartTemplateName = restartTemplateName.trim();
    const trimmedRestartTemplateLanguageCode = restartTemplateLanguageCode.trim();

    if (!trimmedPhoneNumberId || !trimmedBusinessId || !trimmedAccessToken) {
      setActionError({
        status: 422,
        message: 'Phone number ID, business ID, and access token are required on every save.',
      });
      return;
    }

    if (
      (trimmedRestartTemplateName && !trimmedRestartTemplateLanguageCode) ||
      (!trimmedRestartTemplateName && trimmedRestartTemplateLanguageCode)
    ) {
      setActionError({
        status: 422,
        message: 'Enter both restart template name and language code, or leave both empty.',
      });
      return;
    }

    setSaving(true);
    setActionError(null);
    setSuccessMessage(null);

    try {
      const response = await saveWhatsappConfig(accessToken, {
        phoneNumberId: trimmedPhoneNumberId,
        businessId: trimmedBusinessId,
        accessToken: trimmedAccessToken,
        restartTemplateName: emptyToNull(trimmedRestartTemplateName),
        restartTemplateLanguageCode: emptyToNull(trimmedRestartTemplateLanguageCode),
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
      });
      setConfig(response);
      setDisplayName(response.displayName ?? '');
      setRestartTemplateName(response.restartTemplateName ?? '');
      setRestartTemplateLanguageCode(response.restartTemplateLanguageCode ?? '');
      setPhoneNumberId('');
      setBusinessId('');
      setAccessTokenInput('');
      setDiagnostics(await getWhatsappDiagnostics(accessToken));
      setSuccessMessage('WhatsApp configuration saved.');
    } catch (requestError) {
      setActionError(toWhatsappRequestError(requestError, 'Could not save WhatsApp configuration.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (
      !accessToken ||
      !window.confirm(
        'Delete the WhatsApp integration? Saved credentials cannot be recovered after deletion.',
      )
    ) {
      return;
    }

    setDeleting(true);
    setActionError(null);
    setSuccessMessage(null);

    try {
      await deleteWhatsappConfig(accessToken);
      setConfig(null);
      setDisplayName('');
      setPhoneNumberId('');
      setBusinessId('');
      setAccessTokenInput('');
      setRestartTemplateName('');
      setRestartTemplateLanguageCode('');
      setDiagnostics(await getWhatsappDiagnostics(accessToken));
      setSuccessMessage('WhatsApp configuration deleted.');
    } catch (requestError) {
      setActionError(toWhatsappRequestError(requestError, 'Could not delete WhatsApp configuration.'));
    } finally {
      setDeleting(false);
    }
  };

  const handleToggle = async () => {
    if (!accessToken || !config) {
      return;
    }

    const nextIsActive = !config.isActive;
    if (
      !nextIsActive &&
      !window.confirm(
        'Disabling WhatsApp will stop receiving and sending messages. Your credentials will be kept.',
      )
    ) {
      return;
    }

    setToggling(true);
    setActionError(null);
    setSuccessMessage(null);

    try {
      await toggleWhatsappConfig(accessToken, nextIsActive);
      const [configResponse, diagnosticsResponse] = await Promise.all([
        getWhatsappConfig(accessToken),
        getWhatsappDiagnostics(accessToken),
      ]);
      setConfig(configResponse);
      setDiagnostics(diagnosticsResponse);
      setSuccessMessage(nextIsActive ? 'WhatsApp integration enabled.' : 'WhatsApp integration disabled.');
    } catch (requestError) {
      setActionError(toWhatsappRequestError(requestError, 'Could not update WhatsApp integration status.'));
    } finally {
      setToggling(false);
    }
  };

  return (
    <section className="rounded border border-gray-200 bg-white p-5">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Integrations</p>
        <h2 className="text-base font-semibold text-gray-900">WhatsApp</h2>
        <p className="text-sm text-gray-600">
          Configure company-specific WhatsApp Cloud API credentials. Sensitive credentials are never displayed after saving.
        </p>
      </div>

      {loading ? (
        <p className="mt-4 rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
          Loading WhatsApp configuration...
        </p>
      ) : null}

      {!loading && error ? (
        <div className="mt-4 rounded border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">{error.message}</p>
          {error.status !== 403 ? (
            <button
              type="button"
              onClick={() => {
                void fetchWhatsappState();
              }}
              className="mt-3 rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      {!loading && !error && config ? (
        <div className="mt-4 rounded border border-gray-200 bg-gray-50 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">{config.displayName || 'WhatsApp integration'}</p>
              <p className="mt-1 text-xs text-gray-500">Provider: WhatsApp</p>
            </div>
            <span
              className={`w-fit rounded border px-2 py-0.5 text-xs font-semibold ${
                config.isActive
                  ? 'border-green-200 bg-green-50 text-green-800'
                  : 'border-gray-200 bg-gray-100 text-gray-600'
              }`}
            >
              {config.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <ConfigDetail label="Phone number ID" value={config.phoneNumberIdMasked || 'Not saved'} />
            <ConfigDetail label="Business ID" value={config.businessIdMasked || 'Not saved'} />
            <ConfigDetail label="Access token" value={config.accessTokenSaved ? 'Saved' : 'Not saved'} />
            <ConfigDetail label="Restart template" value={config.restartTemplateName || 'Not configured'} />
            <ConfigDetail
              label="Restart language"
              value={config.restartTemplateLanguageCode || 'Not configured'}
            />
            <ConfigDetail label="Created" value={formatConfigDate(config.createdAt)} />
            <ConfigDetail label="Last updated" value={formatConfigDate(config.updatedAt)} />
          </dl>
          <button
            type="button"
            onClick={() => {
              void handleToggle();
            }}
            disabled={saving || deleting || toggling}
            className="mt-4 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
          >
            {toggling ? 'Updating...' : config.isActive ? 'Disable WhatsApp' : 'Enable WhatsApp'}
          </button>
        </div>
      ) : null}

      {!loading && !error && !config ? (
        <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">WhatsApp is not configured.</p>
          <p className="mt-1 text-sm text-amber-800">
            Save the company credentials below before inbound and outbound messaging can work reliably.
          </p>
        </div>
      ) : null}

      {!loading && !error && diagnostics ? (
        <div className="mt-4 rounded border border-gray-200 bg-white p-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Diagnostics</h3>
            <span className="text-sm font-medium text-gray-700">
              {getWhatsappSetupStatus(diagnostics)}
            </span>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <ConfigDetail label="Integration exists" value={diagnostics.integrationExists ? 'Yes' : 'No'} />
            <ConfigDetail label="Status" value={diagnostics.isActive ? 'Active' : 'Inactive'} />
            <ConfigDetail
              label="Phone number ID"
              value={
                diagnostics.phoneNumberIdConfigured
                  ? diagnostics.phoneNumberIdMasked || 'Configured'
                  : 'Not configured'
              }
            />
            <ConfigDetail
              label="Business ID"
              value={
                diagnostics.businessIdConfigured
                  ? diagnostics.businessIdMasked || 'Configured'
                  : 'Not configured'
              }
            />
            <ConfigDetail label="Access token" value={diagnostics.tokenConfigured ? 'Configured' : 'Not configured'} />
            <ConfigDetail
              label="Signature verification"
              value={diagnostics.signatureVerificationEnabled ? 'Enabled' : 'Not enabled'}
            />
            <ConfigDetail label="Last webhook received" value={formatDiagnosticDate(diagnostics.lastWebhookReceivedAt)} />
            <ConfigDetail label="Last inbound message" value={formatDiagnosticDate(diagnostics.lastInboundMessageAt)} />
            <ConfigDetail label="Last outbound message" value={formatDiagnosticDate(diagnostics.lastOutboundMessageAt)} />
            <ConfigDetail label="Open conversations" value={String(diagnostics.openConversationCount)} />
          </dl>
          {!diagnostics.signatureVerificationEnabled ? (
            <p className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Webhook signature verification is not enabled.
            </p>
          ) : null}
          {diagnostics.isActive &&
          (!diagnostics.phoneNumberIdConfigured ||
            !diagnostics.businessIdConfigured ||
            !diagnostics.tokenConfigured) ? (
            <p className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Setup incomplete.
            </p>
          ) : null}
        </div>
      ) : null}

      {!error ? (
        <form className="mt-5 space-y-4" onSubmit={handleSave}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">
              Display name
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={100}
                placeholder="Support Line"
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Phone number ID
              <input
                value={phoneNumberId}
                onChange={(event) => setPhoneNumberId(event.target.value)}
                required
                autoComplete="off"
                placeholder={config?.phoneNumberIdMasked || 'Meta phone number ID'}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Business ID
              <input
                value={businessId}
                onChange={(event) => setBusinessId(event.target.value)}
                required
                autoComplete="off"
                placeholder={config?.businessIdMasked || 'Meta business account ID'}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Access token
              <input
                type="password"
                value={accessTokenInput}
                onChange={(event) => setAccessTokenInput(event.target.value)}
                required
                autoComplete="new-password"
                placeholder={config?.accessTokenSaved ? 'Enter a replacement token' : 'Meta access token'}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Restart template name
              <input
                value={restartTemplateName}
                onChange={(event) => setRestartTemplateName(event.target.value)}
                autoComplete="off"
                placeholder="follow_up_restart"
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
              <span className="mt-1 block text-xs font-normal text-gray-500">Example: follow_up_restart</span>
            </label>
            <label className="text-sm font-medium text-gray-700">
              Restart template language code
              <input
                value={restartTemplateLanguageCode}
                onChange={(event) => setRestartTemplateLanguageCode(event.target.value)}
                autoComplete="off"
                placeholder="en_US"
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
              <span className="mt-1 block text-xs font-normal text-gray-500">Example: en_US</span>
            </label>
          </div>

          <p className="text-xs text-gray-500">
            The backend requires the phone number ID, business ID, and access token on every save. Existing credentials are never prefilled.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving || deleting || toggling}
              className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {saving ? 'Saving...' : config ? 'Replace configuration' : 'Save configuration'}
            </button>
            {config ? (
              <button
                type="button"
                onClick={() => {
                  void handleDelete();
                }}
                disabled={saving || deleting || toggling}
                className="rounded border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-red-300"
              >
                {deleting ? 'Deleting...' : 'Delete integration'}
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      <SettingsMessages error={actionError} successMessage={successMessage} />
    </section>
  );
}

function toWebsiteCaptureRequestError(error: unknown, fallback: string): RequestError {
  if (error && typeof error === 'object' && 'status' in error && 'message' in error) {
    const httpError = error as HttpError;

    if (httpError.status === 403) {
      return {
        status: 403,
        message: 'You do not have permission to manage website capture settings.',
      };
    }

    if (httpError.status === 401) {
      return {
        status: 401,
        message: 'You need to sign in before managing website capture settings.',
      };
    }

    return {
      status: httpError.status,
      message: httpError.message || fallback,
    };
  }

  return { status: 0, message: fallback };
}

function getWebsiteCaptureStatus(config: WebsiteCaptureConfig | null) {
  if (!config) {
    return {
      label: 'Not set up yet',
      badgeClassName: 'border-amber-200 bg-amber-50 text-amber-800',
    };
  }

  return config.isActive
    ? { label: 'Connected', badgeClassName: 'border-green-200 bg-green-50 text-green-800' }
    : { label: 'Turned off', badgeClassName: 'border-gray-200 bg-gray-100 text-gray-600' };
}

function getTestLeadErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'status' in error) {
    const httpError = error as HttpError;

    if (httpError.status === 404) {
      return 'Set up website lead capture before sending a test lead.';
    }

    if (httpError.status === 409 || httpError.status === 403) {
      return httpError.message || 'Turn on website lead capture to send a test lead.';
    }

    if (httpError.status === 0) {
      return 'Could not reach the server. Please check your connection and try again.';
    }
  }

  return 'Something went wrong sending the test lead. Please try again in a moment. If this keeps happening, contact support.';
}

function formatRelativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60000);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;

  return formatConfigDate(value);
}

function WebsiteCaptureSection() {
  const { accessToken } = useAuth();
  const [config, setConfig] = useState<WebsiteCaptureConfig | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<'create' | 'reset' | 'toggle' | 'reveal' | 'test' | null>(null);
  const [error, setError] = useState<RequestError | null>(null);
  const [actionError, setActionError] = useState<RequestError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [developerOpen, setDeveloperOpen] = useState(false);

  const [testName, setTestName] = useState('Test Lead');
  const [testPhone, setTestPhone] = useState('');
  const [testEmail, setTestEmail] = useState('test@example.com');
  const [testMessage, setTestMessage] = useState('This is a test enquiry sent from Website Lead Capture settings.');
  const [testValidationError, setTestValidationError] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ leadId: string } | null>(null);

  const [recentLeads, setRecentLeads] = useState<Lead[] | null>(null);
  const [recentLeadsLoading, setRecentLeadsLoading] = useState(false);
  const [recentLeadsError, setRecentLeadsError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    if (!accessToken) {
      setConfig(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setRevealedKey(null);

    try {
      setConfig(await getWebsiteCaptureConfig(accessToken));
    } catch (requestError) {
      setConfig(null);
      setError(toWebsiteCaptureRequestError(
        requestError,
        'Could not load website capture settings.',
      ));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  const fetchRecentLeads = useCallback(async () => {
    if (!accessToken) return;

    setRecentLeadsLoading(true);
    setRecentLeadsError(null);

    try {
      const response = await listLeads(accessToken, { source: 'WEBSITE', limit: 5 });
      setRecentLeads(response.data);
    } catch {
      setRecentLeads(null);
      setRecentLeadsError('Could not load recent website leads.');
    } finally {
      setRecentLeadsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (config) {
      void fetchRecentLeads();
    } else {
      setRecentLeads(null);
    }
  }, [config, fetchRecentLeads]);

  const copyText = async (value: string, success: string) => {
    setActionError(null);
    setSuccessMessage(null);
    try {
      await navigator.clipboard.writeText(value);
      setSuccessMessage(success);
    } catch {
      setActionError({
        status: 0,
        message: 'Copy failed. Please allow clipboard access and try again.',
      });
    }
  };

  const handleCreate = async () => {
    if (!accessToken) return;
    setBusyAction('create');
    setActionError(null);
    setSuccessMessage(null);

    try {
      const response = await createWebsiteCaptureConfig(accessToken);
      setConfig(response);
      setRevealedKey(response.publicKey ?? null);
      setDeveloperOpen(true);
      setSuccessMessage('Website lead capture is on.');
    } catch (requestError) {
      setActionError(toWebsiteCaptureRequestError(
        requestError,
        'Could not turn on website lead capture.',
      ));
    } finally {
      setBusyAction(null);
    }
  };

  const handleReset = async () => {
    if (
      !accessToken ||
      !window.confirm(
        "Reset your website connection key? Any website already using the current setup code will stop sending leads until you update it with the new one. This can't be undone.",
      )
    ) {
      return;
    }

    setBusyAction('reset');
    setActionError(null);
    setSuccessMessage(null);

    try {
      const response = await rotateWebsiteCaptureKey(accessToken);
      setConfig(response);
      setRevealedKey(response.publicKey ?? null);
      setDeveloperOpen(true);
      setSuccessMessage('Key reset. Copy the new setup code now; the old code no longer works.');
    } catch (requestError) {
      setActionError(toWebsiteCaptureRequestError(
        requestError,
        'Could not reset the website connection key.',
      ));
    } finally {
      setBusyAction(null);
    }
  };

  const handleReveal = async () => {
    if (!accessToken) return;
    setBusyAction('reveal');
    setActionError(null);
    setSuccessMessage(null);

    try {
      const response = await revealWebsiteCaptureKey(accessToken);
      setConfig(response);
      setRevealedKey(response.publicKey ?? null);
      setDeveloperOpen(true);
      setSuccessMessage('Key revealed. Copy the setup code below.');
    } catch (requestError) {
      setActionError(toWebsiteCaptureRequestError(
        requestError,
        'Could not reveal the website connection key.',
      ));
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggle = async () => {
    if (!accessToken || !config) return;
    const nextIsActive = !config.isActive;

    if (
      !nextIsActive &&
      !window.confirm(
        'Turn off website lead capture? Your website form will stop creating leads until you turn it back on.',
      )
    ) {
      return;
    }

    setBusyAction('toggle');
    setActionError(null);
    setSuccessMessage(null);

    try {
      const response = await toggleWebsiteCaptureConfig(accessToken, nextIsActive);
      setConfig(response);
      setSuccessMessage(
        nextIsActive ? 'Website lead capture is on.' : 'Website lead capture is turned off.',
      );
    } catch (requestError) {
      setActionError(toWebsiteCaptureRequestError(
        requestError,
        'Could not update website lead capture.',
      ));
    } finally {
      setBusyAction(null);
    }
  };

  const handleTestLead = async () => {
    if (!accessToken || !config || !config.isActive) return;

    setTestValidationError(null);
    setTestError(null);
    setTestResult(null);

    if (!testName.trim()) {
      setTestValidationError('Enter a name for the test lead.');
      return;
    }

    if (!testPhone.trim() && !testEmail.trim()) {
      setTestValidationError('Enter a phone number or email address.');
      return;
    }

    setBusyAction('test');

    try {
      const response = await sendWebsiteTestLead(accessToken, {
        name: testName.trim(),
        ...(testPhone.trim() ? { phone: testPhone.trim() } : {}),
        ...(testEmail.trim() ? { email: testEmail.trim() } : {}),
        ...(testMessage.trim() ? { message: testMessage.trim() } : {}),
      });
      setTestResult({ leadId: response.lead.id });
      void fetchRecentLeads();
    } catch (requestError) {
      setTestError(getTestLeadErrorMessage(requestError));
    } finally {
      setBusyAction(null);
    }
  };

  const isBusy = busyAction !== null;
  const status = getWebsiteCaptureStatus(config);
  const testDisabledReason = !config
    ? 'Set up website lead capture before sending a test lead.'
    : !config.isActive
      ? 'Turn on website lead capture to send a test lead.'
      : null;

  return (
    <section className="rounded border border-gray-200 bg-white p-5">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Integrations</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-gray-900">Website Lead Capture</h2>
          {!loading && !error ? (
            <span className={`w-fit rounded border px-2 py-0.5 text-xs font-semibold ${status.badgeClassName}`}>
              {status.label}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-gray-600">
          Keep using your website&rsquo;s existing contact form. Connect it to Alozix so every submission becomes a lead automatically.
        </p>
        <p className="text-xs text-gray-500">
          You don&rsquo;t need to replace your website form. Give the details below to whoever manages your website, and they&rsquo;ll connect your existing form to Alozix.
        </p>
      </div>

      {loading ? (
        <p className="mt-4 rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
          Loading website capture settings...
        </p>
      ) : null}

      {!loading && error ? (
        <div className="mt-4 rounded border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">{error.message}</p>
          {error.status !== 403 ? (
            <button
              type="button"
              onClick={() => void fetchConfig()}
              className="mt-3 rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      {!loading && !error ? (
        <div className="mt-4 rounded border border-gray-200 bg-gray-50 p-4">
          {!config ? (
            <>
              <p className="text-sm font-semibold text-gray-900">Not set up yet</p>
              <p className="mt-1 text-sm text-gray-600">
                Turn this on to start collecting leads from your website.
              </p>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={isBusy}
                className="mt-4 rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {busyAction === 'create' ? 'Turning on...' : 'Turn on website lead capture'}
              </button>
            </>
          ) : config.isActive ? (
            <>
              <p className="text-sm font-semibold text-gray-900">Website lead capture is on</p>
              <p className="mt-1 text-sm text-gray-600">
                Enquiries submitted through your connected website form become new leads here automatically.
              </p>
              <p className="mt-2 text-sm">
                Leads appear in{' '}
                <Link to="/leads" className="font-medium text-gray-900 underline hover:text-gray-700">
                  Lead Center →
                </Link>
              </p>
              <p className="mt-3 text-xs text-gray-500">
                Connected since {formatConfigDate(config.createdAt)} &middot; Last changed {formatConfigDate(config.updatedAt)}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-gray-900">Website lead capture is turned off</p>
              <p className="mt-1 text-sm text-gray-600">
                Your website form will stop sending leads here until you turn this back on.
              </p>
              <button
                type="button"
                onClick={() => void handleToggle()}
                disabled={isBusy}
                className="mt-4 rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {busyAction === 'toggle' ? 'Turning on...' : 'Turn back on'}
              </button>
            </>
          )}
        </div>
      ) : null}

      {!loading && !error && config ? (
        <div className="mt-5 rounded border border-gray-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">Connect your existing website form</p>
              <p className="mt-1 text-sm text-gray-600">
                Your customer can keep the same website design and form. Their website developer only needs to send submissions to Alozix, and new enquiries will appear automatically in Lead Center.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void copyText(
                buildWebsiteCaptureDeveloperInstructions(
                  config.endpointUrl,
                  revealedKey ?? '[reveal key in Alozix settings first]',
                ),
                'Developer instructions copied.',
              )}
              disabled={isBusy}
              className="w-fit rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              Copy developer instructions
            </button>
          </div>

          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="font-medium text-gray-700">Endpoint</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <code className="break-all rounded border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-xs text-gray-800">
                  {config.endpointUrl}
                </code>
                <button
                  type="button"
                  onClick={() => void copyText(config.endpointUrl, 'Endpoint copied.')}
                  disabled={isBusy}
                  className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
                >
                  Copy
                </button>
              </div>
            </div>
            <div>
              <p className="font-medium text-gray-700">Request details</p>
              <dl className="mt-1 space-y-1 text-xs text-gray-600">
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 font-medium text-gray-700">Method</dt>
                  <dd>POST</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 font-medium text-gray-700">Header</dt>
                  <dd className="break-all font-mono text-gray-800">X-Website-Form-Key</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 font-medium text-gray-700">Key</dt>
                  <dd className="break-all font-mono text-gray-800">{revealedKey ?? config.publicKeyMasked}</dd>
                </div>
              </dl>
              {!revealedKey ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleReveal()}
                    disabled={isBusy}
                    className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
                  >
                    {busyAction === 'reveal' ? 'Revealing...' : 'Reveal key'}
                  </button>
                  <p className="text-xs text-gray-500">Key not shown. Reveal it separately before sharing it.</p>
                </div>
              ) : null}
            </div>
          </div>

          {!config.isActive ? (
            <p className="mt-3 text-xs text-amber-700">
              Website lead capture is turned off, so your site won&rsquo;t create leads until you turn it back on. These details still work once you do.
            </p>
          ) : null}

          <div className="mt-4">
            <p className="text-sm font-semibold text-gray-900">Field mapping reference</p>
            <p className="mt-1 text-xs text-gray-500">
              If your website form uses different field names, map them before sending the JSON to Alozix.
            </p>
            <div className="mt-2 overflow-x-auto rounded border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-semibold">Your website field examples</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Send to Alozix as</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white text-gray-700">
                  <tr>
                    <td className="px-3 py-2 font-mono">fullName / full_name / your_name</td>
                    <td className="px-3 py-2 font-mono text-gray-900">name</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono">mobile / phone_number / tel</td>
                    <td className="px-3 py-2 font-mono text-gray-900">phone</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono">customerEmail / email_address</td>
                    <td className="px-3 py-2 font-mono text-gray-900">email</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono">details / request / comments / message</td>
                    <td className="px-3 py-2 font-mono text-gray-900">message</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              These are examples only. Your developer can keep the form&rsquo;s current field names and send the values under the Alozix names shown on the right.
            </p>
          </div>
        </div>
      ) : null}

      {!loading && !error ? (
        <div className="mt-5 rounded border border-gray-200 bg-white p-4">
          <p className="text-sm font-semibold text-gray-900">Try it now</p>
          <p className="mt-1 text-sm text-gray-600">
            Send a one-time test enquiry to confirm everything is connected correctly. It only takes a few seconds.
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">
              Name
              <input
                value={testName}
                onChange={(event) => setTestName(event.target.value)}
                disabled={isBusy || !!testDisabledReason}
                className="mt-1 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-100"
              />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Phone
              <input
                value={testPhone}
                onChange={(event) => setTestPhone(event.target.value)}
                disabled={isBusy || !!testDisabledReason}
                className="mt-1 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-100"
              />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Email
              <input
                type="email"
                value={testEmail}
                onChange={(event) => setTestEmail(event.target.value)}
                disabled={isBusy || !!testDisabledReason}
                className="mt-1 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-100"
              />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Message
              <input
                value={testMessage}
                onChange={(event) => setTestMessage(event.target.value)}
                disabled={isBusy || !!testDisabledReason}
                className="mt-1 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-100"
              />
            </label>
          </div>

          {testValidationError ? (
            <p className="mt-3 text-sm text-red-700" role="alert">{testValidationError}</p>
          ) : null}

          {testDisabledReason ? (
            <p className="mt-3 text-sm text-gray-600">{testDisabledReason}</p>
          ) : null}

          {testError ? (
            <p className="mt-3 text-sm text-red-700" role="alert">{testError}</p>
          ) : null}

          {testResult ? (
            <p className="mt-3 text-sm text-green-800">
              Test lead sent.{' '}
              <Link
                to={`/leads/${testResult.leadId}`}
                className="font-medium underline hover:text-green-900"
              >
                View it in Lead Center →
              </Link>
            </p>
          ) : null}

          <div className="mt-3">
            <button
              type="button"
              onClick={() => void handleTestLead()}
              disabled={isBusy || !!testDisabledReason}
              className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {busyAction === 'test' ? 'Sending test lead…' : 'Send test lead'}
            </button>
          </div>
        </div>
      ) : null}

      {!loading && !error && config ? (
        <div className="mt-5">
          <p className="text-sm font-semibold text-gray-900">Recent leads from your website</p>
          {recentLeadsLoading ? (
            <p className="mt-2 text-sm text-gray-600">Loading recent leads...</p>
          ) : recentLeadsError ? (
            <p className="mt-2 text-sm text-red-700">{recentLeadsError}</p>
          ) : !recentLeads || recentLeads.length === 0 ? (
            <p className="mt-2 text-sm text-gray-600">
              No website leads yet. Once your site is connected, they&rsquo;ll show up here.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100 rounded border border-gray-200">
              {recentLeads.map((lead) => (
                <li key={lead.id}>
                  <Link
                    to={`/leads/${lead.id}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    <span className="font-medium text-gray-900">
                      {[lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unnamed lead'}
                    </span>
                    <span className="text-xs text-gray-500">{formatRelativeTime(lead.createdAt)}</span>
                    <span className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-semibold text-gray-600">
                      {lead.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-sm">
            <Link to="/leads" className="font-medium text-gray-700 underline hover:text-gray-900">
              See all website leads in Lead Center →
            </Link>
          </p>
        </div>
      ) : null}

      {!loading && !error && config ? (
        <details
          className="mt-5 border-t border-gray-200 pt-4"
          open={developerOpen}
          onToggle={(event) => setDeveloperOpen(event.currentTarget.open)}
        >
          <summary className="cursor-pointer text-sm font-medium text-gray-800">
            Optional technical example
          </summary>
          <p className="mt-1 text-xs text-gray-500">
            This is an example only. If you already have a website form, you do not need to replace it. Your developer can use the simpler connection details above.
          </p>

          {!config.isActive ? (
            <p className="mt-2 text-xs text-amber-700">
              Website lead capture is turned off, so your site won&rsquo;t receive leads until you turn it back on. These details still work once you do.
            </p>
          ) : null}

          <div className="mt-3 space-y-3 text-sm">
            <div>
              <p className="font-medium text-gray-700">Endpoint</p>
              <p className="mt-1 text-xs text-gray-500">The web address your website sends form submissions to.</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <code className="break-all rounded border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-xs text-gray-800">
                  {config.endpointUrl}
                </code>
                <button
                  type="button"
                  onClick={() => void copyText(config.endpointUrl, 'Endpoint copied.')}
                  disabled={isBusy}
                  className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
                >
                  Copy
                </button>
              </div>
            </div>

            <div>
              <p className="font-medium text-gray-700">Setup code</p>
              <p className="mt-1 text-xs text-gray-500">Use this only if you want a working sample form to copy from. Existing forms can stay as they are.</p>
              {revealedKey ? (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void copyText(
                      buildWebsiteCaptureSnippet(config.endpointUrl, revealedKey),
                      'Website setup code copied.',
                    )}
                    disabled={isBusy}
                    className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
                  >
                    Copy setup code
                  </button>
                </div>
              ) : (
                <div className="mt-1">
                  <p className="text-sm text-gray-600">To copy the setup code, reveal your connection key first.</p>
                  <button
                    type="button"
                    onClick={() => void handleReveal()}
                    disabled={isBusy}
                    className="mt-2 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
                  >
                    {busyAction === 'reveal' ? 'Revealing...' : 'Reveal key'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </details>
      ) : null}

      {!loading && !error && config ? (
        <div className="mt-5 border-t border-gray-200 pt-4">
          <p className="text-sm font-semibold text-gray-900">Security</p>
          <p className="mt-1 text-xs text-gray-500">
            Your connection key works like a password for your website form. Reveal it only when you need to connect or update your website form. If you think it was exposed, use Reset key.
          </p>

          <div className="mt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Connection key</p>
            <p className="mt-1 font-mono text-sm text-gray-900">{config.publicKeyMasked}</p>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleReveal()}
              disabled={isBusy}
              className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
            >
              {busyAction === 'reveal' ? 'Revealing...' : 'Reveal key'}
            </button>
            <button
              type="button"
              onClick={() => void handleReset()}
              disabled={isBusy}
              className="rounded border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-red-300"
            >
              {busyAction === 'reset' ? 'Resetting...' : 'Reset key'}
            </button>
            <button
              type="button"
              onClick={() => void handleToggle()}
              disabled={isBusy}
              className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
            >
              {busyAction === 'toggle'
                ? 'Updating...'
                : config.isActive
                  ? 'Turn off website lead capture'
                  : 'Turn back on'}
            </button>
          </div>
        </div>
      ) : null}

      <SettingsMessages error={actionError} successMessage={successMessage} />
    </section>
  );
}

type FormVariable = {
  key: string;
  label: string;
};

function WhatsappApprovedTemplatesSection() {
  const { accessToken } = useAuth();
  const varKeyRef = useRef(0);

  const [templates, setTemplates] = useState<WhatsappApprovedTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<RequestError | null>(null);
  const [actionError, setActionError] = useState<RequestError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<RequestError | null>(null);
  const [formName, setFormName] = useState('');
  const [formLanguage, setFormLanguage] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formBodyPreview, setFormBodyPreview] = useState('');
  const [formVariables, setFormVariables] = useState<FormVariable[]>([]);

  function nextKey() {
    varKeyRef.current += 1;
    return `v${varKeyRef.current}`;
  }

  const fetchTemplates = useCallback(async () => {
    if (!accessToken) {
      setTemplates([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await listApprovedTemplates(accessToken);
      setTemplates(result);
    } catch (requestError) {
      setTemplates([]);
      setError(toRequestError(requestError, 'Could not load WhatsApp approved templates.'));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  const openCreate = () => {
    setModalMode('create');
    setEditingId(null);
    setFormName('');
    setFormLanguage('');
    setFormCategory('');
    setFormBodyPreview('');
    setFormVariables([]);
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (template: WhatsappApprovedTemplate) => {
    setModalMode('edit');
    setEditingId(template.id);
    setFormName(template.name);
    setFormLanguage(template.languageCode);
    setFormCategory(template.category ?? '');
    setFormBodyPreview(template.bodyPreview ?? '');
    setFormVariables(
      [...template.variables]
        .sort((a, b) => a.position - b.position)
        .map((v) => ({ key: nextKey(), label: v.label })),
    );
    setFormError(null);
    setShowModal(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken) {
      setFormError({ status: 401, message: 'You need to sign in before managing templates.' });
      return;
    }

    const name = formName.trim();
    if (!name) {
      setFormError({ status: 422, message: 'Template name is required.' });
      return;
    }

    const languageCode = formLanguage.trim();
    if (!languageCode) {
      setFormError({ status: 422, message: 'Language code is required.' });
      return;
    }

    for (const v of formVariables) {
      if (!v.label.trim()) {
        setFormError({ status: 422, message: 'All variable labels must be filled in.' });
        return;
      }
    }

    const input = {
      name,
      languageCode,
      category: emptyToNull(formCategory),
      bodyPreview: emptyToNull(formBodyPreview),
      variables: formVariables.map((v, i) => ({
        position: i + 1,
        label: v.label.trim(),
      })),
    };

    setFormSubmitting(true);
    setFormError(null);

    try {
      if (modalMode === 'create') {
        await createApprovedTemplate(accessToken, input);
        setSuccessMessage('Template registered.');
      } else if (editingId) {
        await updateApprovedTemplate(accessToken, editingId, input);
        setSuccessMessage('Template updated.');
      }
      setShowModal(false);
      await fetchTemplates();
    } catch (requestError) {
      setFormError(
        toRequestError(
          requestError,
          modalMode === 'create' ? 'Could not register template.' : 'Could not update template.',
        ),
      );
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeactivate = async (template: WhatsappApprovedTemplate) => {
    if (!accessToken) return;
    if (!window.confirm(`Deactivate "${template.name}"? It will be removed from the list.`)) return;

    setBusyId(template.id);
    setActionError(null);
    setSuccessMessage(null);

    try {
      await deleteApprovedTemplate(accessToken, template.id);
      setSuccessMessage('Template deactivated.');
      await fetchTemplates();
    } catch (requestError) {
      setActionError(toRequestError(requestError, 'Could not deactivate template.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">WhatsApp</p>
          <h2 className="text-base font-semibold text-gray-900">Approved Templates</h2>
          <p className="text-sm text-gray-600">
            Register Meta-approved WhatsApp templates from your Business Manager account.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="shrink-0 rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
        >
          Add template
        </button>
      </div>

      <SettingsMessages error={actionError} successMessage={successMessage} />
      <ListState
        loading={loading}
        error={error}
        empty={!loading && !error && templates.length === 0}
        emptyText="No approved templates registered yet."
        onRetry={fetchTemplates}
      />

      {!loading && !error && templates.length > 0 ? (
        <div className="mt-4 divide-y divide-gray-200 rounded border border-gray-200">
          {templates.map((template) => (
            <div key={template.id} className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">{template.name}</p>
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      {template.languageCode}
                    </span>
                    {template.category ? (
                      <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        {template.category}
                      </span>
                    ) : null}
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        template.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {template.isActive ? 'Active' : 'Inactive'}
                    </span>
                    {template.variables.length > 0 ? (
                      <span className="text-xs text-gray-500">
                        {template.variables.length} variable{template.variables.length !== 1 ? 's' : ''}
                      </span>
                    ) : null}
                  </div>
                  {template.bodyPreview ? (
                    <p className="max-w-lg text-sm text-gray-600 line-clamp-2">{template.bodyPreview}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(template)}
                    className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleDeactivate(template);
                    }}
                    disabled={busyId === template.id}
                    className="rounded border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-red-300"
                  >
                    {busyId === template.id ? 'Deactivating...' : 'Deactivate'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h3 className="text-base font-semibold text-gray-900">
                {modalMode === 'create' ? 'Add Approved Template' : 'Edit Approved Template'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                aria-label="Close"
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>

            <form onSubmit={(e) => { void handleSubmit(e); }}>
              <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Template name <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="e.g. order_confirmation"
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Language code <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={formLanguage}
                      onChange={(e) => setFormLanguage(e.target.value)}
                      placeholder="e.g. en_US"
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
                    <input
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                      placeholder="e.g. MARKETING"
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-gray-700">Body preview</label>
                    <textarea
                      value={formBodyPreview}
                      onChange={(e) => setFormBodyPreview(e.target.value)}
                      rows={3}
                      placeholder="Hello {{1}}, your order {{2}} is confirmed."
                      className="w-full resize-none rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-700">Variables</p>
                    <button
                      type="button"
                      onClick={() =>
                        setFormVariables((prev) => [...prev, { key: nextKey(), label: '' }])
                      }
                      className="rounded border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-gray-500"
                    >
                      + Add variable
                    </button>
                  </div>

                  {formVariables.length === 0 ? (
                    <p className="text-xs text-gray-500">No variables added.</p>
                  ) : (
                    <div className="space-y-2">
                      {formVariables.map((v, index) => (
                        <div key={v.key} className="flex items-center gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">
                            {index + 1}
                          </span>
                          <input
                            value={v.label}
                            onChange={(e) => {
                              const label = e.target.value;
                              setFormVariables((prev) =>
                                prev.map((fv) => (fv.key === v.key ? { ...fv, label } : fv)),
                              );
                            }}
                            placeholder="e.g. Customer name"
                            className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setFormVariables((prev) => prev.filter((fv) => fv.key !== v.key))
                            }
                            aria-label="Remove variable"
                            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600 focus:outline-none focus:ring-1 focus:ring-red-500"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {formError ? (
                  <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {formError.message}
                  </p>
                ) : null}
              </div>

              <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={formSubmitting}
                  className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
                >
                  {formSubmitting
                    ? modalMode === 'create'
                      ? 'Registering...'
                      : 'Saving...'
                    : modalMode === 'create'
                      ? 'Register template'
                      : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ConfigDetail({
  label,
  value,
  helpText,
}: {
  label: string;
  value: string;
  helpText?: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
        {helpText ? (
          <span
            title={helpText}
            aria-label={`${label}: ${helpText}`}
            className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-gray-300 text-[10px] font-semibold normal-case text-gray-500"
          >
            ?
          </span>
        ) : null}
      </dt>
      <dd className="mt-1 break-words font-medium text-gray-900">{value}</dd>
    </div>
  );
}

function LeadSourcesSection() {
  const { accessToken } = useAuth();
  const [leadSources, setLeadSources] = useState<LeadSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<RequestError | null>(null);
  const [actionError, setActionError] = useState<RequestError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [createName, setCreateName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const fetchLeadSources = useCallback(async () => {
    if (!accessToken) {
      setLeadSources([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await listLeadSources(accessToken);
      setLeadSources(response);
    } catch (requestError) {
      setLeadSources([]);
      setError(toRequestError(requestError, 'Could not load lead sources.'));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void fetchLeadSources();
  }, [fetchLeadSources]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken) {
      setActionError({ status: 401, message: 'You need to sign in before managing settings.' });
      return;
    }

    const name = createName.trim();
    if (!name) {
      setActionError({ status: 422, message: 'Lead source name is required.' });
      return;
    }

    setCreating(true);
    setActionError(null);
    setSuccessMessage(null);

    try {
      await createLeadSource(accessToken, { name });
      setCreateName('');
      setSuccessMessage('Lead source created.');
      await fetchLeadSources();
    } catch (requestError) {
      setActionError(toRequestError(requestError, 'Could not create lead source.'));
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (leadSource: LeadSource) => {
    setEditId(leadSource.id);
    setEditName(leadSource.name);
    setActionError(null);
    setSuccessMessage(null);
  };

  const handleUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken || !editId) {
      return;
    }

    const name = editName.trim();
    if (!name) {
      setActionError({ status: 422, message: 'Lead source name is required.' });
      return;
    }

    setBusyId(editId);
    setActionError(null);
    setSuccessMessage(null);

    try {
      await updateLeadSource(accessToken, editId, { name });
      setEditId(null);
      setEditName('');
      setSuccessMessage('Lead source updated.');
      await fetchLeadSources();
    } catch (requestError) {
      setActionError(toRequestError(requestError, 'Could not update lead source.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (leadSource: LeadSource) => {
    if (!accessToken || !window.confirm(`Delete "${leadSource.name}"?`)) {
      return;
    }

    setBusyId(leadSource.id);
    setActionError(null);
    setSuccessMessage(null);

    try {
      await deleteLeadSource(accessToken, leadSource.id);
      setSuccessMessage('Lead source deleted.');
      if (editId === leadSource.id) {
        setEditId(null);
        setEditName('');
      }
      await fetchLeadSources();
    } catch (requestError) {
      setActionError(toRequestError(requestError, 'Could not delete lead source.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded border border-gray-200 bg-white p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-gray-900">Lead Sources</h2>
        <p className="text-sm text-gray-600">Create and rename the lead source options used on contacts.</p>
      </div>

      <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={handleCreate}>
        <input
          value={createName}
          onChange={(event) => setCreateName(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 sm:max-w-sm sm:flex-1"
          placeholder="New lead source"
        />
        <button
          type="submit"
          disabled={creating}
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          {creating ? 'Creating...' : 'Create'}
        </button>
      </form>

      <SettingsMessages error={actionError} successMessage={successMessage} />
      <ListState loading={loading} error={error} empty={!loading && !error && leadSources.length === 0} emptyText="No lead sources yet." onRetry={fetchLeadSources} />

      {!loading && !error && leadSources.length > 0 ? (
        <div className="mt-4 divide-y divide-gray-200 rounded border border-gray-200">
          {leadSources.map((leadSource) => (
            <div key={leadSource.id} className="p-3">
              {editId === leadSource.id ? (
                <form className="flex flex-col gap-3 sm:flex-row sm:items-center" onSubmit={handleUpdate}>
                  <input
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 sm:flex-1"
                  />
                  <RowActions
                    busy={busyId === leadSource.id}
                    primaryLabel="Save"
                    busyLabel="Saving..."
                    onCancel={() => {
                      setEditId(null);
                      setEditName('');
                    }}
                  />
                </form>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-medium text-gray-900">{leadSource.name}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(leadSource)}
                      className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleDelete(leadSource);
                      }}
                      disabled={busyId === leadSource.id}
                      className="rounded border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-red-300"
                    >
                      {busyId === leadSource.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function TagsSection() {
  const { accessToken } = useAuth();
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<RequestError | null>(null);
  const [actionError, setActionError] = useState<RequestError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [createName, setCreateName] = useState('');
  const [createColor, setCreateColor] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const fetchTags = useCallback(async () => {
    if (!accessToken) {
      setTags([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await listTags(accessToken);
      setTags(response);
    } catch (requestError) {
      setTags([]);
      setError(toRequestError(requestError, 'Could not load tags.'));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void fetchTags();
  }, [fetchTags]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken) {
      setActionError({ status: 401, message: 'You need to sign in before managing settings.' });
      return;
    }

    const name = createName.trim();
    if (!name) {
      setActionError({ status: 422, message: 'Tag name is required.' });
      return;
    }

    setCreating(true);
    setActionError(null);
    setSuccessMessage(null);

    try {
      await createTag(accessToken, {
        name,
        ...(emptyToUndefined(createColor) ? { color: emptyToUndefined(createColor) } : {}),
      });
      setCreateName('');
      setCreateColor('');
      setSuccessMessage('Tag created.');
      await fetchTags();
    } catch (requestError) {
      setActionError(toRequestError(requestError, 'Could not create tag.'));
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (tag: Tag) => {
    setEditId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color ?? '');
    setActionError(null);
    setSuccessMessage(null);
  };

  const handleUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken || !editId) {
      return;
    }

    const name = editName.trim();
    if (!name) {
      setActionError({ status: 422, message: 'Tag name is required.' });
      return;
    }

    setBusyId(editId);
    setActionError(null);
    setSuccessMessage(null);

    try {
      await updateTag(accessToken, editId, {
        name,
        color: emptyToNull(editColor),
      });
      setEditId(null);
      setEditName('');
      setEditColor('');
      setSuccessMessage('Tag updated.');
      await fetchTags();
    } catch (requestError) {
      setActionError(toRequestError(requestError, 'Could not update tag.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (tag: Tag) => {
    if (!accessToken || !window.confirm(`Delete "${tag.name}"?`)) {
      return;
    }

    setBusyId(tag.id);
    setActionError(null);
    setSuccessMessage(null);

    try {
      await deleteTag(accessToken, tag.id);
      setSuccessMessage('Tag deleted.');
      if (editId === tag.id) {
        setEditId(null);
        setEditName('');
        setEditColor('');
      }
      await fetchTags();
    } catch (requestError) {
      setActionError(toRequestError(requestError, 'Could not delete tag.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded border border-gray-200 bg-white p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-gray-900">Tags</h2>
        <p className="text-sm text-gray-600">Create and edit the tag options used on contacts.</p>
      </div>

      <form className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,220px)_auto]" onSubmit={handleCreate}>
        <input
          value={createName}
          onChange={(event) => setCreateName(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          placeholder="New tag"
        />
        <input
          value={createColor}
          onChange={(event) => setCreateColor(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          placeholder="Color, optional"
        />
        <button
          type="submit"
          disabled={creating}
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          {creating ? 'Creating...' : 'Create'}
        </button>
      </form>

      <SettingsMessages error={actionError} successMessage={successMessage} />
      <ListState loading={loading} error={error} empty={!loading && !error && tags.length === 0} emptyText="No tags yet." onRetry={fetchTags} />

      {!loading && !error && tags.length > 0 ? (
        <div className="mt-4 divide-y divide-gray-200 rounded border border-gray-200">
          {tags.map((tag) => (
            <div key={tag.id} className="p-3">
              {editId === tag.id ? (
                <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,220px)_auto]" onSubmit={handleUpdate}>
                  <input
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  />
                  <input
                    value={editColor}
                    onChange={(event) => setEditColor(event.target.value)}
                    className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                    placeholder="Color, optional"
                  />
                  <RowActions
                    busy={busyId === tag.id}
                    primaryLabel="Save"
                    busyLabel="Saving..."
                    onCancel={() => {
                      setEditId(null);
                      setEditName('');
                      setEditColor('');
                    }}
                  />
                </form>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    {tag.color ? <span className="h-3 w-3 rounded-full border border-gray-200" style={{ backgroundColor: tag.color }} /> : null}
                    <p className="text-sm font-medium text-gray-900">{tag.name}</p>
                    {tag.color ? <span className="text-xs text-gray-500">{tag.color}</span> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(tag)}
                      className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleDelete(tag);
                      }}
                      disabled={busyId === tag.id}
                      className="rounded border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-red-300"
                    >
                      {busyId === tag.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

type SettingsMessagesProps = {
  error: RequestError | null;
  successMessage: string | null;
};

function SettingsMessages({ error, successMessage }: SettingsMessagesProps) {
  return (
    <>
      {error ? <p className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error.message}</p> : null}
      {successMessage ? <p className="mt-4 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">{successMessage}</p> : null}
    </>
  );
}

type ListStateProps = {
  loading: boolean;
  error: RequestError | null;
  empty: boolean;
  emptyText: string;
  onRetry: () => void;
};

function ListState({ loading, error, empty, emptyText, onRetry }: ListStateProps) {
  if (loading) {
    return <p className="mt-4 rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">Loading...</p>;
  }

  if (error) {
    return (
      <div className="mt-4 rounded border border-red-200 bg-red-50 p-3">
        <p className="text-sm text-red-700">{error.message}</p>
        <button
          type="button"
          onClick={() => {
            onRetry();
          }}
          className="mt-3 rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
        >
          Retry
        </button>
      </div>
    );
  }

  if (empty) {
    return <p className="mt-4 rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">{emptyText}</p>;
  }

  return null;
}

type RowActionsProps = {
  busy: boolean;
  primaryLabel: string;
  busyLabel: string;
  onCancel: () => void;
};

function RowActions({ busy, primaryLabel, busyLabel, onCancel }: RowActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="submit"
        disabled={busy}
        className="rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
      >
        {busy ? busyLabel : primaryLabel}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
      >
        Cancel
      </button>
    </div>
  );
}
