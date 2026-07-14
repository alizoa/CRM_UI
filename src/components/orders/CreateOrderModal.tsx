import { useState, type FormEvent } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { HttpError } from '../../lib/http';
import {
  createOrder,
  type Order,
  type OrderStatus,
  type PaymentStatus,
} from '../../lib/orders';

type CreateOrderModalProps = {
  contactId: string;
  conversationId?: string | null;
  onClose: () => void;
  onCreated: (order: Order) => void;
};

type FormState = {
  title: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  totalAmount: string;
  currency: string;
  expectedAt: string;
};

const INITIAL_FORM: FormState = {
  title: '',
  status: 'NEW',
  paymentStatus: 'UNPAID',
  totalAmount: '',
  currency: 'USD',
  expectedAt: '',
};

const ORDER_STATUSES: Array<{ value: OrderStatus; label: string }> = [
  { value: 'NEW', label: 'New' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'READY', label: 'Ready' },
  { value: 'FULFILLED', label: 'Fulfilled' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const PAYMENT_STATUSES: Array<{ value: PaymentStatus; label: string }> = [
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'PARTIAL', label: 'Partial' },
  { value: 'PAID', label: 'Paid' },
  { value: 'REFUNDED', label: 'Refunded' },
];

function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    return (error as HttpError).message || 'Could not create order.';
  }

  return 'Could not create order.';
}

export function CreateOrderModal({ contactId, conversationId, onClose, onCreated }: CreateOrderModalProps) {
  const { accessToken } = useAuth();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken) {
      setError('You need to sign in before creating an order.');
      return;
    }

    const title = form.title.trim();
    if (!title) {
      setError('Order title is required.');
      return;
    }

    const amount = form.totalAmount.trim() ? Number(form.totalAmount) : null;
    if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) {
      setError('Total amount must be a positive number.');
      return;
    }

    const currency = form.currency.trim().toUpperCase();
    if (currency && !/^[A-Z]{3}$/.test(currency)) {
      setError('Currency must be a 3-letter code.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const order = await createOrder(accessToken, {
        contactId,
        conversationId: conversationId || undefined,
        title,
        status: form.status,
        paymentStatus: form.paymentStatus,
        totalAmount: amount,
        currency: currency || null,
        expectedAt: form.expectedAt || null,
      });
      onCreated(order);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/40 px-4 py-6">
      <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Create order</h2>
            <p className="mt-1 text-sm text-gray-500">This order will be linked to the current contact.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-md px-2 py-1 text-sm font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:text-gray-300"
          >
            Close
          </button>
        </div>

        {error ? <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-gray-700">
            Title
            <input
              autoFocus
              required
              maxLength={255}
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-gray-700">
              Status
              <select
                value={form.status}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as OrderStatus }))}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              >
                {ORDER_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Payment status
              <select
                value={form.paymentStatus}
                onChange={(event) => setForm((current) => ({ ...current, paymentStatus: event.target.value as PaymentStatus }))}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              >
                {PAYMENT_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-gray-700">
              Total amount
              <input
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={form.totalAmount}
                onChange={(event) => setForm((current) => ({ ...current, totalAmount: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Currency
              <input
                maxLength={3}
                value={form.currency}
                onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </label>
          </div>

          <label className="block text-sm font-medium text-gray-700">
            Expected date
            <input
              type="date"
              value={form.expectedAt}
              onChange={(event) => setForm((current) => ({ ...current, expectedAt: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </label>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={loading} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:text-gray-400">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:bg-emerald-400">
              {loading ? 'Creating...' : 'Create order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
