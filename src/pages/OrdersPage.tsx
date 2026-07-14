import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { useAuth } from '../context/AuthContext';
import { listOrders, type Order, type OrderStatus, type OrdersResponse, type PaymentStatus } from '../lib/orders';
import type { HttpError } from '../lib/http';

const PAGE_LIMIT = 20;
const ORDER_STATUSES: OrderStatus[] = ['NEW', 'IN_PROGRESS', 'READY', 'FULFILLED', 'CANCELLED'];
const PAYMENT_STATUSES: PaymentStatus[] = ['UNPAID', 'PARTIAL', 'PAID', 'REFUNDED'];

const LABELS: Record<OrderStatus | PaymentStatus, string> = {
  NEW: 'New', IN_PROGRESS: 'In progress', READY: 'Ready', FULFILLED: 'Fulfilled', CANCELLED: 'Cancelled',
  UNPAID: 'Unpaid', PARTIAL: 'Partial', PAID: 'Paid', REFUNDED: 'Refunded',
};

function toError(error: unknown): HttpError {
  return error && typeof error === 'object' && 'message' in error
    ? (error as HttpError)
    : { status: 0, message: 'Could not load orders.' };
}

function contactName(order: Order) {
  return [order.contact.firstName, order.contact.lastName].filter(Boolean).join(' ') || 'Unnamed contact';
}

function assigneeName(order: Order) {
  if (!order.assignee) return 'Unassigned';
  return [order.assignee.firstName, order.assignee.lastName].filter(Boolean).join(' ') || order.assignee.email;
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)) : '—';
}

function formatAmount(order: Order) {
  if (order.totalAmount === null) return '—';
  const amount = Number(order.totalAmount);
  if (!Number.isFinite(amount)) return `${order.totalAmount}${order.currency ? ` ${order.currency}` : ''}`;
  if (!order.currency) return amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: order.currency }).format(amount);
  } catch {
    return `${amount.toLocaleString()} ${order.currency}`;
  }
}

function badgeClass(value: OrderStatus | PaymentStatus) {
  if (value === 'FULFILLED' || value === 'PAID') return 'border-green-200 bg-green-50 text-green-700';
  if (value === 'CANCELLED' || value === 'REFUNDED') return 'border-red-200 bg-red-50 text-red-700';
  if (value === 'READY' || value === 'PARTIAL') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (value === 'IN_PROGRESS') return 'border-blue-200 bg-blue-50 text-blue-700';
  return 'border-gray-200 bg-gray-100 text-gray-700';
}

function Badge({ value }: { value: OrderStatus | PaymentStatus }) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${badgeClass(value)}`}>{LABELS[value]}</span>;
}

export function OrdersPage() {
  const { accessToken } = useAuth();
  const [data, setData] = useState<OrdersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<HttpError | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | ''>('');
  const [page, setPage] = useState(1);

  const filters = useMemo(() => ({
    search: search || undefined,
    status: status || undefined,
    paymentStatus: paymentStatus || undefined,
    page,
    limit: PAGE_LIMIT,
  }), [page, paymentStatus, search, status]);

  const fetchOrders = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      setData(await listOrders(accessToken, filters));
    } catch (requestError) {
      setError(toError(requestError));
    } finally {
      setLoading(false);
    }
  }, [accessToken, filters]);

  useEffect(() => { void fetchOrders(); }, [fetchOrders]);

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  const reset = () => {
    setSearchInput(''); setSearch(''); setStatus(''); setPaymentStatus(''); setPage(1);
  };

  const orders = data?.data ?? [];
  const currentPage = data?.page ?? page;
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.limit ?? PAGE_LIMIT)));
  const filtered = Boolean(search || status || paymentStatus);

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Orders</h1>
          {!loading || data ? <p className="mt-1 text-sm text-gray-600">{data?.total === 1 ? '1 order' : `${data?.total ?? 0} orders`}</p> : null}
        </div>

        <section className="rounded border border-gray-200 bg-white p-4 sm:p-5">
          <h2 className="text-base font-semibold text-gray-900">Search and filter</h2>
          <form className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto]" onSubmit={handleSearch}>
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">Search
              <input className="rounded border border-gray-300 px-3 py-2 font-normal focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Order title" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">Status
              <select className="rounded border border-gray-300 px-3 py-2 font-normal focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900" value={status} onChange={(e) => { setStatus(e.target.value as OrderStatus | ''); setPage(1); }}>
                <option value="">All statuses</option>
                {ORDER_STATUSES.map((value) => <option key={value} value={value}>{LABELS[value]}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">Payment
              <select className="rounded border border-gray-300 px-3 py-2 font-normal focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900" value={paymentStatus} onChange={(e) => { setPaymentStatus(e.target.value as PaymentStatus | ''); setPage(1); }}>
                <option value="">All payment statuses</option>
                {PAYMENT_STATUSES.map((value) => <option key={value} value={value}>{LABELS[value]}</option>)}
              </select>
            </label>
            <div className="flex items-end gap-2">
              <button className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800" type="submit">Search</button>
              <button className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50" type="button" onClick={reset}>Reset</button>
            </div>
          </form>
        </section>

        {loading ? <p className="rounded border border-gray-200 bg-white p-5 text-sm text-gray-700">Loading orders...</p> : null}
        {!loading && error ? <div className="rounded border border-red-200 bg-white p-5"><h2 className="font-semibold text-red-900">Could not load orders</h2><p className="mt-2 text-sm text-red-700">{error.message}</p><button className="mt-4 rounded bg-red-700 px-4 py-2 text-sm font-medium text-white" onClick={() => void fetchOrders()} type="button">Retry</button></div> : null}
        {!loading && !error && orders.length === 0 ? <div className="rounded border border-gray-200 bg-white p-8 text-center"><h2 className="font-semibold text-gray-900">{filtered ? 'No orders found' : 'No orders yet'}</h2><p className="mt-2 text-sm text-gray-600">{filtered ? 'Try changing or resetting the filters.' : 'Orders will appear here after they are created from a customer or WhatsApp conversation.'}</p></div> : null}

        {!loading && !error && orders.length > 0 ? <>
          <div className="hidden overflow-x-auto rounded border border-gray-200 bg-white md:block">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm"><thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr>
              <th className="px-4 py-3 font-semibold">Title</th><th className="px-4 py-3 font-semibold">Contact</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Payment</th><th className="px-4 py-3 text-right font-semibold">Total</th><th className="px-4 py-3 font-semibold">Assignee</th><th className="px-4 py-3 font-semibold">Expected</th><th className="px-4 py-3 font-semibold">Created</th>
            </tr></thead><tbody className="divide-y divide-gray-200">{orders.map((order) => <tr key={order.id}>
              <td className="px-4 py-3 font-medium"><Link className="underline decoration-gray-300 underline-offset-2" to={`/orders/${order.id}`}>{order.title}</Link></td>
              <td className="px-4 py-3"><Link className="text-gray-700 underline decoration-gray-300 underline-offset-2" to={`/contacts/${order.contact.id}`}>{contactName(order)}</Link></td>
              <td className="px-4 py-3"><Badge value={order.status} /></td><td className="px-4 py-3"><Badge value={order.paymentStatus} /></td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-gray-700">{formatAmount(order)}</td><td className="px-4 py-3 text-gray-700">{assigneeName(order)}</td><td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatDate(order.expectedAt)}</td><td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatDate(order.createdAt)}</td>
            </tr>)}</tbody></table>
          </div>
          <div className="space-y-3 md:hidden">{orders.map((order) => <article className="rounded border border-gray-200 bg-white p-4" key={order.id}><Link className="font-semibold text-gray-900 underline decoration-gray-300" to={`/orders/${order.id}`}>{order.title}</Link><p className="mt-1 text-sm"><Link className="text-gray-600 underline" to={`/contacts/${order.contact.id}`}>{contactName(order)}</Link></p><div className="mt-3 flex flex-wrap gap-2"><Badge value={order.status} /><Badge value={order.paymentStatus} /></div><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs font-semibold uppercase text-gray-500">Total</dt><dd className="mt-1 text-gray-700">{formatAmount(order)}</dd></div><div><dt className="text-xs font-semibold uppercase text-gray-500">Expected</dt><dd className="mt-1 text-gray-700">{formatDate(order.expectedAt)}</dd></div></dl></article>)}</div>
          <div className="flex items-center justify-between rounded border border-gray-200 bg-white p-4"><p className="text-sm text-gray-600">Page {currentPage} of {totalPages}</p><div className="flex gap-2"><button className="rounded border border-gray-300 px-4 py-2 text-sm font-medium disabled:text-gray-400" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">Previous</button><button className="rounded border border-gray-300 px-4 py-2 text-sm font-medium disabled:text-gray-400" disabled={currentPage >= totalPages} onClick={() => setPage((value) => value + 1)} type="button">Next</button></div></div>
        </> : null}
      </div>
    </AppShell>
  );
}
