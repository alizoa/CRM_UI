import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EntityActivitiesPanel } from '../components/activities/EntityActivitiesPanel';
import { LeadOverviewCard } from '../components/leads/LeadOverviewCard';
import { LeadSourceContextCard } from '../components/leads/LeadSourceContextCard';
import { AppShell } from '../components/layout/AppShell';
import { EntityNotesPanel } from '../components/notes/EntityNotesPanel';
import { EntityTasksPanel } from '../components/tasks/EntityTasksPanel';
import { useAuth } from '../context/AuthContext';
import type { HttpError } from '../lib/http';
import { listLeadSourceOptions, type LeadSourceOption } from '../lib/lead-sources';
import {
  convertLead,
  deleteLead,
  getLead,
  markLeadLost,
  reopenLead,
  updateLead,
  type Lead,
  type LeadTemperature,
  type UpdateLeadInput,
} from '../lib/leads';
import { listMembershipOptions, type MembershipOption } from '../lib/memberships';

type RequestError = { status: number; message: string };
type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  temperature: LeadTemperature | '';
  ownerId: string;
  leadSourceId: string;
};

function requestError(error: unknown, fallback: string): RequestError {
  if (error && typeof error === 'object' && 'status' in error && 'message' in error) {
    const value = error as HttpError;
    return { status: value.status, message: value.message || fallback };
  }
  return { status: 0, message: fallback };
}

function formState(lead: Lead): FormState {
  return {
    firstName: lead.firstName ?? '',
    lastName: lead.lastName ?? '',
    email: lead.email ?? '',
    phone: lead.phone ?? '',
    temperature: lead.temperature ?? '',
    ownerId: lead.ownerId ?? '',
    leadSourceId: lead.leadSourceId ?? '',
  };
}

function updateInput(form: FormState): UpdateLeadInput {
  return {
    firstName: form.firstName.trim() || null,
    lastName: form.lastName.trim() || null,
    email: form.email.trim() || null,
    phone: form.phone.trim() || null,
    temperature: form.temperature || null,
    ownerId: form.ownerId || null,
    leadSourceId: form.leadSourceId || null,
  };
}

function optionName(option: MembershipOption) {
  return [option.user.firstName, option.user.lastName].filter(Boolean).join(' ') || option.user.email;
}

export function LeadDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const [lead, setLead] = useState<Lead | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<RequestError | null>(null);
  const [editing, setEditing] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<RequestError | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<RequestError | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<MembershipOption[]>([]);
  const [leadSources, setLeadSources] = useState<LeadSourceOption[]>([]);
  const fetchLead = useCallback(async () => {
    if (!accessToken || !id) {
      setError(!id ? { status: 404, message: 'Lead not found.' } : null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await getLead(accessToken, id);
      setLead(response);
      setForm(formState(response));
    } catch (requestFailure) {
      setError(requestError(requestFailure, 'Could not load lead.'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, id]);

  useEffect(() => { void fetchLead(); }, [fetchLead]);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    Promise.allSettled([listMembershipOptions(accessToken), listLeadSourceOptions(accessToken)]).then(([members, sources]) => {
      if (!active) return;
      setMemberships(members.status === 'fulfilled' ? members.value : []);
      setLeadSources(sources.status === 'fulfilled' ? sources.value : []);
    });
    return () => { active = false; };
  }, [accessToken]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !lead || !form) return;
    setSaveLoading(true);
    setSaveError(null);
    setSuccess(null);
    try {
      const response = await updateLead(accessToken, lead.id, updateInput(form));
      setLead(response);
      setForm(formState(response));
      setEditing(false);
      setSuccess('Lead updated.');
    } catch (requestFailure) {
      setSaveError(requestError(requestFailure, 'Could not update lead.'));
    } finally {
      setSaveLoading(false);
    }
  }

  async function lifecycle(action: 'lost' | 'reopen') {
    if (!accessToken || !lead) return;
    const prompt = action === 'lost' ? 'Mark this lead as lost?' : 'Reopen this lead?';
    if (!window.confirm(prompt)) return;
    setActionLoading(true);
    setActionError(null);
    setSuccess(null);
    try {
      const response = action === 'lost'
        ? await markLeadLost(accessToken, lead.id)
        : await reopenLead(accessToken, lead.id);
      setLead(response);
      setForm(formState(response));
      setEditing(false);
      setSuccess(action === 'lost' ? 'Lead marked lost.' : 'Lead reopened.');
    } catch (requestFailure) {
      setActionError(requestError(requestFailure, 'Could not update lead lifecycle.'));
    } finally {
      setActionLoading(false);
    }
  }

  async function updateStatus(status: 'CONTACTED' | 'QUALIFIED') {
    if (!accessToken || !lead) return;
    setActionLoading(true);
    setActionError(null);
    setSuccess(null);
    try {
      const response = await updateLead(accessToken, lead.id, { status });
      setLead(response);
      setForm(formState(response));
      setEditing(false);
      setSuccess(status === 'CONTACTED' ? 'Lead marked contacted.' : 'Lead marked qualified.');
    } catch (requestFailure) {
      setActionError(requestError(requestFailure, 'Could not update lead status.'));
    } finally {
      setActionLoading(false);
    }
  }

  async function remove() {
    if (!accessToken || !lead || !window.confirm('Delete this lead?')) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await deleteLead(accessToken, lead.id);
      navigate('/leads');
    } catch (requestFailure) {
      setActionError(requestError(requestFailure, 'Could not delete lead.'));
      setActionLoading(false);
    }
  }

  async function convert(confirmDuplicate: boolean) {
    if (!accessToken || !lead) return;
    if (!lead.firstName?.trim()) {
      setActionError({ status: 422, message: 'Add a first name before marking this lead won.' });
      return;
    }
    setActionLoading(true);
    setActionError(null);
    setSuccess(null);
    try {
      const response = await convertLead(accessToken, lead.id, confirmDuplicate);
      setLead(response.lead);
      setForm(formState(response.lead));
      setEditing(false);
      setSuccess('Lead marked won.');
    } catch (requestFailure) {
      setActionError(requestError(requestFailure, 'Could not mark lead won.'));
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <Link className="text-sm font-medium text-gray-700 underline" to="/leads">Back to Leads</Link>
        {loading ? <p className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-600">Loading lead...</p> : null}
        {!loading && error ? (
          <section className="rounded-xl border border-red-200 bg-white p-5">
            <h1 className="font-semibold text-red-900">{error.status === 404 ? 'Lead not found' : 'Could not load lead'}</h1>
            <p className="mt-2 text-sm text-red-700">{error.message}</p>
            {error.status !== 404 ? <button type="button" onClick={() => void fetchLead()} className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white">Retry</button> : null}
          </section>
        ) : null}

        {!loading && !error && lead ? (
          <>
            <LeadOverviewCard
              lead={lead}
              busy={actionLoading || saveLoading}
              editing={editing}
              onConvert={() => void convert(false)}
              onDelete={() => void remove()}
              onEdit={() => { setForm(formState(lead)); setEditing(true); setSaveError(null); setSuccess(null); }}
              onMarkContacted={() => void updateStatus('CONTACTED')}
              onMarkQualified={() => void updateStatus('QUALIFIED')}
              onMarkLost={() => void lifecycle('lost')}
              onReopen={() => void lifecycle('reopen')}
            />
            {success ? <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{success}</p> : null}
            {actionError ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{actionError.message}</p> : null}

            <div className="grid gap-6 xl:grid-cols-2">
              <LeadSourceContextCard lead={lead} />
              {editing && form ? (
                <section className="rounded-xl border border-gray-200 bg-white p-5">
                  <h2 className="text-base font-semibold text-gray-900">Edit lead details</h2>
                  <p className="mt-1 text-sm text-gray-600">Update lead information without changing lifecycle status.</p>
                  <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={save}>
                    <Field label="First name"><input value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" /></Field>
                    <Field label="Last name"><input value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" /></Field>
                    <Field label="Email"><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" /></Field>
                    <Field label="Phone"><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" /></Field>
                    <Field label="Temperature"><select value={form.temperature} onChange={(event) => setForm({ ...form, temperature: event.target.value as LeadTemperature | '' })} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"><option value="">Not set</option><option value="HOT">Hot</option><option value="WARM">Warm</option><option value="COLD">Cold</option></select></Field>
                    <Field label="Owner"><select value={form.ownerId} onChange={(event) => setForm({ ...form, ownerId: event.target.value })} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"><option value="">Unassigned</option>{memberships.map((item) => <option key={item.id} value={item.userId}>{optionName(item)}</option>)}</select></Field>
                    <Field label="Lead source"><select value={form.leadSourceId} onChange={(event) => setForm({ ...form, leadSourceId: event.target.value })} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"><option value="">No configured source</option>{leadSources.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                    {saveError ? <p className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{saveError.message}</p> : null}
                    <div className="flex gap-2 sm:col-span-2">
                      <button type="submit" disabled={saveLoading} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:bg-emerald-300">{saveLoading ? 'Saving...' : 'Save'}</button>
                      <button type="button" disabled={saveLoading} onClick={() => { setForm(formState(lead)); setEditing(false); setSaveError(null); }} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700">Cancel</button>
                    </div>
                  </form>
                </section>
              ) : null}
            </div>
            <div id="lead-tasks">
              <EntityTasksPanel
                entityType="LEAD"
                entityId={lead.id}
                title="Lead follow-up tasks"
                onTasksChanged={() => void fetchLead()}
              />
            </div>
            <EntityNotesPanel
              entityType="LEAD"
              entityId={lead.id}
              title="Lead notes"
            />
            <EntityActivitiesPanel
              entityType="LEAD"
              entityId={lead.id}
              title="Recent lead activity"
            />
          </>
        ) : null}
      </div>

    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">{label}{children}</label>;
}
