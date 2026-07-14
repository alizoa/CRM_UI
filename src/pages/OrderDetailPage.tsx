import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { useAuth } from '../context/AuthContext';
import type { HttpError } from '../lib/http';
import { listMembershipOptions, type MembershipOption } from '../lib/memberships';
import { deleteOrder, getOrder, updateOrder, type Order, type OrderStatus, type PaymentStatus, type UpdateOrderInput } from '../lib/orders';

const ORDER_STATUSES: OrderStatus[] = ['NEW', 'IN_PROGRESS', 'READY', 'FULFILLED', 'CANCELLED'];
const PAYMENT_STATUSES: PaymentStatus[] = ['UNPAID', 'PARTIAL', 'PAID', 'REFUNDED'];
const LABELS: Record<OrderStatus | PaymentStatus, string> = { NEW: 'New', IN_PROGRESS: 'In progress', READY: 'Ready', FULFILLED: 'Fulfilled', CANCELLED: 'Cancelled', UNPAID: 'Unpaid', PARTIAL: 'Partial', PAID: 'Paid', REFUNDED: 'Refunded' };

type FormState = { title: string; description: string; totalAmount: string; currency: string; status: OrderStatus; paymentStatus: PaymentStatus; expectedAt: string; assigneeId: string };

function toError(error: unknown, fallback: string): HttpError {
  return error && typeof error === 'object' && 'message' in error ? (error as HttpError) : { status: 0, message: fallback };
}

function toForm(order: Order): FormState {
  return { title: order.title, description: order.description ?? '', totalAmount: order.totalAmount === null ? '' : String(order.totalAmount), currency: order.currency ?? '', status: order.status, paymentStatus: order.paymentStatus, expectedAt: order.expectedAt ? order.expectedAt.slice(0, 10) : '', assigneeId: order.assigneeId ?? '' };
}

function displayName(person: { firstName: string | null; lastName: string | null; email?: string | null }) {
  return [person.firstName, person.lastName].filter(Boolean).join(' ') || person.email || 'Unnamed';
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatAmount(order: Order) {
  if (order.totalAmount === null) return 'Not set';
  return `${Number(order.totalAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })}${order.currency ? ` ${order.currency}` : ''}`;
}

export function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [memberships, setMemberships] = useState<MembershipOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<HttpError | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<HttpError | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchOrder = useCallback(async () => {
    if (!accessToken || !id) return;
    setLoading(true); setError(null);
    try { const response = await getOrder(accessToken, id); setOrder(response); setForm(toForm(response)); }
    catch (requestError) { setError(toError(requestError, 'Could not load order.')); }
    finally { setLoading(false); }
  }, [accessToken, id]);

  useEffect(() => { void fetchOrder(); }, [fetchOrder]);
  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    void listMembershipOptions(accessToken).then((response) => { if (active) setMemberships(response); }).catch(() => { if (active) setMemberships([]); });
    return () => { active = false; };
  }, [accessToken]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!accessToken || !id || !form) return;
    if (!form.title.trim()) { setSaveError({ status: 422, message: 'Order title is required.' }); return; }
    const parsedAmount = form.totalAmount ? Number(form.totalAmount) : null;
    if (parsedAmount !== null && (!Number.isFinite(parsedAmount) || parsedAmount <= 0)) { setSaveError({ status: 422, message: 'Total amount must be greater than zero.' }); return; }
    if (form.currency && !/^[A-Z]{3}$/.test(form.currency)) { setSaveError({ status: 422, message: 'Currency must be a three-letter uppercase code.' }); return; }
    const input: UpdateOrderInput = { title: form.title.trim(), description: form.description.trim() || null, totalAmount: parsedAmount, currency: form.currency || null, status: form.status, paymentStatus: form.paymentStatus, expectedAt: form.expectedAt ? new Date(`${form.expectedAt}T00:00:00`).toISOString() : null, assigneeId: form.assigneeId || null };
    setSaving(true); setSaveError(null); setSuccess(null);
    try { const response = await updateOrder(accessToken, id, input); setOrder(response); setForm(toForm(response)); setEditing(false); setSuccess('Order updated.'); }
    catch (requestError) { setSaveError(toError(requestError, 'Could not update order.')); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!accessToken || !id || !window.confirm('Delete this order? It will be removed from the active orders list.')) return;
    setDeleting(true); setSaveError(null);
    try { await deleteOrder(accessToken, id); navigate('/orders'); }
    catch (requestError) { setSaveError(toError(requestError, 'Could not delete order.')); setDeleting(false); }
  };

  return <AppShell><div className="space-y-6">
    <Link className="text-sm font-medium text-gray-700 underline" to="/orders">Back to Orders</Link>
    {loading ? <p className="rounded border border-gray-200 bg-white p-5 text-sm text-gray-700">Loading order...</p> : null}
    {!loading && error ? <div className="rounded border border-red-200 bg-white p-5"><h1 className="font-semibold text-red-900">{error.status === 404 ? 'Order not found' : 'Could not load order'}</h1><p className="mt-2 text-sm text-red-700">{error.message}</p>{error.status !== 404 ? <button className="mt-4 rounded bg-red-700 px-4 py-2 text-sm font-medium text-white" onClick={() => void fetchOrder()} type="button">Retry</button> : null}</div> : null}
    {!loading && !error && order && form ? <>
      <section className="rounded border border-gray-200 bg-white p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Order</p><h1 className="mt-1 text-2xl font-semibold text-gray-900">{order.title}</h1><p className="mt-2 text-sm text-gray-600">Customer: <Link className="font-medium underline" to={`/contacts/${order.contact.id}`}>{displayName(order.contact)}</Link></p></div><div className="flex flex-wrap gap-2"><button className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800" onClick={() => { setEditing(true); setSaveError(null); setSuccess(null); }} type="button">Edit</button><button className="rounded border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:text-red-300" disabled={deleting} onClick={() => void handleDelete()} type="button">{deleting ? 'Deleting...' : 'Delete'}</button></div></div>
      </section>
      {success ? <p className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">{success}</p> : null}
      {saveError && !editing ? <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{saveError.message}</p> : null}
      {!editing ? <div className="grid gap-6 lg:grid-cols-2"><section className="rounded border border-gray-200 bg-white p-5"><h2 className="font-semibold text-gray-900">Order details</h2><dl className="mt-4 grid gap-4 sm:grid-cols-2">
        <div><dt className="text-xs font-semibold uppercase text-gray-500">Status</dt><dd className="mt-1 text-sm text-gray-900">{LABELS[order.status]}</dd></div><div><dt className="text-xs font-semibold uppercase text-gray-500">Payment status</dt><dd className="mt-1 text-sm text-gray-900">{LABELS[order.paymentStatus]}</dd></div><div><dt className="text-xs font-semibold uppercase text-gray-500">Total</dt><dd className="mt-1 text-sm text-gray-900">{formatAmount(order)}</dd></div><div><dt className="text-xs font-semibold uppercase text-gray-500">Expected date</dt><dd className="mt-1 text-sm text-gray-900">{order.expectedAt ? formatDateTime(order.expectedAt) : 'Not set'}</dd></div><div><dt className="text-xs font-semibold uppercase text-gray-500">Assignee</dt><dd className="mt-1 text-sm text-gray-900">{order.assignee ? displayName(order.assignee) : 'Unassigned'}</dd></div><div><dt className="text-xs font-semibold uppercase text-gray-500">Contact info</dt><dd className="mt-1 text-sm text-gray-900">{order.contact.email || order.contact.phone || 'Not available'}</dd></div>
      </dl></section><section className="rounded border border-gray-200 bg-white p-5"><h2 className="font-semibold text-gray-900">Additional information</h2><dl className="mt-4 space-y-4"><div><dt className="text-xs font-semibold uppercase text-gray-500">Description</dt><dd className="mt-1 whitespace-pre-wrap text-sm text-gray-900">{order.description || 'No description'}</dd></div><div><dt className="text-xs font-semibold uppercase text-gray-500">Created</dt><dd className="mt-1 text-sm text-gray-900">{formatDateTime(order.createdAt)}</dd></div><div><dt className="text-xs font-semibold uppercase text-gray-500">Updated</dt><dd className="mt-1 text-sm text-gray-900">{formatDateTime(order.updatedAt)}</dd></div></dl></section></div> : null}
      {editing ? <section className="rounded border border-gray-200 bg-white p-5"><h2 className="font-semibold text-gray-900">Edit order</h2><form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700 sm:col-span-2">Title<input className="rounded border border-gray-300 px-3 py-2 font-normal" required maxLength={255} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">Status<select className="rounded border border-gray-300 px-3 py-2 font-normal" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as OrderStatus })}>{ORDER_STATUSES.map((value) => <option key={value} value={value}>{LABELS[value]}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">Payment status<select className="rounded border border-gray-300 px-3 py-2 font-normal" value={form.paymentStatus} onChange={(e) => setForm({ ...form, paymentStatus: e.target.value as PaymentStatus })}>{PAYMENT_STATUSES.map((value) => <option key={value} value={value}>{LABELS[value]}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">Total amount<input className="rounded border border-gray-300 px-3 py-2 font-normal" inputMode="decimal" value={form.totalAmount} onChange={(e) => setForm({ ...form, totalAmount: e.target.value })} placeholder="Optional" /></label>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">Currency<input className="rounded border border-gray-300 px-3 py-2 font-normal" maxLength={3} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase().slice(0, 3) })} placeholder="USD" /></label>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">Expected date<input className="rounded border border-gray-300 px-3 py-2 font-normal" type="date" value={form.expectedAt} onChange={(e) => setForm({ ...form, expectedAt: e.target.value })} /></label>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">Assignee<select className="rounded border border-gray-300 px-3 py-2 font-normal" value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}><option value="">Unassigned</option>{form.assigneeId && !memberships.some((item) => item.userId === form.assigneeId) ? <option value={form.assigneeId}>{order.assignee ? displayName(order.assignee) : 'Current assignee'}</option> : null}{memberships.map((item) => <option key={item.id} value={item.userId}>{displayName(item.user)}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700 sm:col-span-2">Description<textarea className="min-h-28 rounded border border-gray-300 px-3 py-2 font-normal" maxLength={10000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <div className="sm:col-span-2">{saveError ? <p className="mb-3 text-sm text-red-700">{saveError.message}</p> : null}<div className="flex gap-3"><button className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:bg-gray-400" disabled={saving} type="submit">{saving ? 'Saving...' : 'Save'}</button><button className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700" disabled={saving} onClick={() => { setForm(toForm(order)); setEditing(false); setSaveError(null); }} type="button">Cancel</button></div></div>
      </form></section> : null}
    </> : null}
  </div></AppShell>;
}
