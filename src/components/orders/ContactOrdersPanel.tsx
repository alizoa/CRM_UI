import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import type { HttpError } from '../../lib/http';
import { listOrders, updateOrder, type Order, type OrderStatus, type PaymentStatus } from '../../lib/orders';
import { CreateOrderModal } from './CreateOrderModal';

type ContactOrdersPanelProps = {
  contactId: string | null;
  conversationId?: string | null;
  onContextChanged?: () => void;
  openCreateSignal?: number;
  variant?: 'contact' | 'sidebar';
};

const ACTIVE_STATUSES: OrderStatus[] = ['NEW', 'IN_PROGRESS', 'READY'];
const ORDER_STATUSES: OrderStatus[] = ['NEW', 'IN_PROGRESS', 'READY', 'FULFILLED', 'CANCELLED'];
const LABELS: Record<OrderStatus | PaymentStatus, string> = {
  NEW: 'New',
  IN_PROGRESS: 'In progress',
  READY: 'Ready',
  FULFILLED: 'Fulfilled',
  CANCELLED: 'Cancelled',
  UNPAID: 'Unpaid',
  PARTIAL: 'Partial',
  PAID: 'Paid',
  REFUNDED: 'Refunded',
};

function getError(error: unknown, fallback = 'Could not load orders.') {
  if (error && typeof error === 'object' && 'message' in error) {
    return (error as HttpError).message || fallback;
  }
  return fallback;
}

function formatAmount(order: Order) {
  if (order.totalAmount === null) return null;
  const amount = Number(order.totalAmount);
  if (!Number.isFinite(amount)) return `${order.totalAmount}${order.currency ? ` ${order.currency}` : ''}`;
  if (!order.currency) return amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: order.currency }).format(amount);
  } catch {
    return `${amount.toLocaleString()} ${order.currency}`;
  }
}

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function badgeClass(value: OrderStatus | PaymentStatus) {
  if (value === 'FULFILLED' || value === 'PAID') return 'border-green-200 bg-green-50 text-green-700';
  if (value === 'CANCELLED' || value === 'REFUNDED') return 'border-red-200 bg-red-50 text-red-700';
  if (value === 'READY' || value === 'PARTIAL') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (value === 'IN_PROGRESS') return 'border-blue-200 bg-blue-50 text-blue-700';
  return 'border-gray-200 bg-gray-100 text-gray-700';
}

function Badge({ value, compact }: { value: OrderStatus | PaymentStatus; compact: boolean }) {
  return <span className={`inline-flex rounded-full border font-semibold ${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'} ${badgeClass(value)}`}>{LABELS[value]}</span>;
}

export function ContactOrdersPanel({
  contactId,
  conversationId,
  onContextChanged,
  openCreateSignal = 0,
  variant = 'contact',
}: ContactOrdersPanelProps) {
  const { accessToken } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(Boolean(contactId));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const requestId = useRef(0);
  const compact = variant === 'sidebar';

  const fetchOrders = useCallback(async () => {
    const currentRequestId = requestId.current + 1;
    requestId.current = currentRequestId;

    if (!accessToken || !contactId) {
      setOrders([]);
      setTotal(0);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (compact) {
        const responses = await Promise.all(
          ACTIVE_STATUSES.map((status) => listOrders(accessToken, { contactId, status, page: 1, limit: 3 })),
        );
        const activeOrders = responses
          .flatMap((response) => response.data)
          .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
          .slice(0, 3);
        if (requestId.current !== currentRequestId) return;
        setOrders(activeOrders);
        setTotal(responses.reduce((sum, response) => sum + response.total, 0));
      } else {
        const response = await listOrders(accessToken, { contactId, page: 1, limit: 5 });
        if (requestId.current !== currentRequestId) return;
        setOrders(response.data);
        setTotal(response.total);
      }
    } catch (requestError) {
      if (requestId.current !== currentRequestId) return;
      setOrders([]);
      setTotal(0);
      setError(getError(requestError));
    } finally {
      if (requestId.current === currentRequestId) setLoading(false);
    }
  }, [accessToken, compact, contactId]);

  useEffect(() => {
    setModalOpen(false);
    setSuccess(null);
    setStatusError(null);
    setUpdatingOrderId(null);
    void fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    if (openCreateSignal > 0 && contactId) {
      setSuccess(null);
      setModalOpen(true);
    }
  }, [contactId, openCreateSignal]);

  async function handleStatusChange(order: Order, status: OrderStatus) {
    if (!accessToken || updatingOrderId || status === order.status) return;

    setUpdatingOrderId(order.id);
    setSuccess(null);
    setStatusError(null);
    try {
      const updatedOrder = await updateOrder(accessToken, order.id, { status });
      setOrders((current) => current.map((item) => (item.id === updatedOrder.id ? updatedOrder : item)));
      setSuccess(`Order status updated to ${LABELS[status]}.`);
      await fetchOrders();
      onContextChanged?.();
    } catch (requestError) {
      setStatusError(getError(requestError, 'Could not update order status.'));
    } finally {
      setUpdatingOrderId(null);
    }
  }

  const panelClass = compact
    ? 'rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm'
    : 'rounded border border-gray-200 bg-white p-5';

  if (!contactId) {
    return (
      <section className={panelClass}>
        <h2 className="text-sm font-semibold text-gray-950">Active orders</h2>
        <p className="mt-2 text-xs text-gray-600">Link this conversation to a contact first.</p>
      </section>
    );
  }

  return (
    <>
      <section className={panelClass}>
        <div className={`flex items-start justify-between ${compact ? 'gap-2' : 'gap-4'}`}>
          <div className="min-w-0">
            <h2 className={compact ? 'text-sm font-semibold text-gray-950' : 'text-base font-semibold text-gray-900'}>
              {compact ? 'Active orders' : 'Orders'}
            </h2>
            {!compact ? <p className="mt-1 text-sm text-gray-600">{total === 1 ? '1 order for this contact' : `${total} orders for this contact`}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => { setSuccess(null); setModalOpen(true); }}
            className={compact
              ? 'shrink-0 rounded bg-emerald-700 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-800'
              : 'shrink-0 rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800'}
          >
            Create order
          </button>
        </div>

        {success ? <p role="status" className={`rounded bg-emerald-50 text-emerald-700 ${compact ? 'mt-2 px-2 py-1.5 text-xs' : 'mt-4 border border-green-200 p-3 text-sm'}`}>{success}</p> : null}
        {statusError ? (
          <p role="alert" className={`rounded bg-red-50 text-red-700 ${compact ? 'mt-2 px-2 py-1.5 text-xs' : 'mt-4 border border-red-200 p-3 text-sm'}`}>
            {statusError}
          </p>
        ) : null}
        {loading ? <p className={`${compact ? 'mt-2 text-xs' : 'mt-5 rounded border border-gray-200 bg-gray-50 p-4 text-sm'} text-gray-600`}>Loading orders...</p> : null}
        {!loading && error ? (
          <div className={`rounded border border-red-200 bg-red-50 ${compact ? 'mt-2 p-2' : 'mt-5 p-4'}`}>
            <p className={compact ? 'text-xs text-red-700' : 'text-sm text-red-700'}>{error}</p>
            <button type="button" onClick={() => void fetchOrders()} className="mt-2 text-xs font-semibold text-red-800 hover:text-red-900">Retry</button>
          </div>
        ) : null}
        {!loading && !error && orders.length === 0 ? (
          <p className={`${compact ? 'mt-2 text-xs' : 'mt-5 rounded border border-gray-200 bg-gray-50 p-4 text-sm'} text-gray-600`}>
            {compact ? 'No active orders for this contact.' : 'No orders for this contact yet.'}
          </p>
        ) : null}

        {!loading && !error && orders.length > 0 ? (
          <div className={compact ? 'mt-2 space-y-2' : 'mt-5 divide-y divide-gray-200 rounded border border-gray-200'}>
            {orders.map((order) => {
              const amount = formatAmount(order);
              const expected = formatDate(order.expectedAt);
              return (
                <article key={order.id} className={compact ? 'min-w-0 rounded-md border border-gray-100 p-2' : 'p-4'}>
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <Link to={`/orders/${order.id}`} className={`${compact ? 'truncate text-sm' : 'break-words text-sm'} font-semibold text-gray-900 underline decoration-gray-300 underline-offset-2 hover:text-emerald-700`} title={order.title}>
                      {order.title}
                    </Link>
                    {amount ? <span className={`${compact ? 'text-xs' : 'text-sm'} shrink-0 font-medium text-gray-700`}>{amount}</span> : null}
                  </div>
                  <div className={`flex flex-wrap items-center ${compact ? 'mt-1.5 gap-1' : 'mt-2 gap-2'}`}>
                    {compact ? (
                      <label className="min-w-0 max-w-full">
                        <span className="sr-only">Status for {order.title}</span>
                        <select
                          value={order.status}
                          onChange={(event) => void handleStatusChange(order, event.target.value as OrderStatus)}
                          disabled={updatingOrderId !== null}
                          aria-label={`Status for ${order.title}`}
                          className="min-h-8 w-full max-w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs font-semibold text-gray-700 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                        >
                          {ORDER_STATUSES.map((status) => (
                            <option key={status} value={status}>{LABELS[status]}</option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <Badge value={order.status} compact={compact} />
                    )}
                    <Badge value={order.paymentStatus} compact={compact} />
                    {updatingOrderId === order.id ? <span role="status" className="text-[11px] text-emerald-700">Saving…</span> : null}
                    {!compact && expected ? <span className="text-xs text-gray-600">Expected {expected}</span> : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}

        {!compact && total > orders.length ? (
          <Link to="/orders" className="mt-4 inline-block text-sm font-semibold text-gray-700 underline decoration-gray-300 underline-offset-2 hover:text-gray-900">
            View all orders
          </Link>
        ) : null}
      </section>

      {modalOpen ? (
        <CreateOrderModal
          contactId={contactId}
          conversationId={conversationId}
          onClose={() => setModalOpen(false)}
          onCreated={() => {
            setModalOpen(false);
            setSuccess('Order created.');
            void fetchOrders();
          }}
        />
      ) : null}
    </>
  );
}
