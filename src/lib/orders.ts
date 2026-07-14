// src/lib/orders.ts — demo mode
import { DEMO_ORDERS } from './mock-data';

export const ORDERS_PATH = '/api/orders';

export type OrderStatus = 'NEW' | 'IN_PROGRESS' | 'READY' | 'FULFILLED' | 'CANCELLED';
export type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'REFUNDED';

export type Order = {
  id: string;
  contactId: string;
  conversationId: string | null;
  assigneeId: string | null;
  title: string;
  description: string | null;
  totalAmount: string | number | null;
  currency: string | null;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  expectedAt: string | null;
  createdAt: string;
  updatedAt: string;
  contact: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    status: 'PROSPECT' | 'CUSTOMER' | 'ARCHIVED';
    archivedAt: string | null;
  };
  conversation: { id: string; status: 'OPEN' | 'CLOSED' } | null;
  assignee: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
};

export type OrderFilters = {
  contactId?: string;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  search?: string;
  page?: number;
  limit?: number;
};

export type OrdersResponse = {
  data: Order[];
  total: number;
  page: number;
  limit: number;
};

export type CreateOrderInput = {
  title: string;
  contactId: string;
  conversationId?: string | null;
  assigneeId?: string | null;
  description?: string | null;
  totalAmount?: number | null;
  currency?: string | null;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  expectedAt?: string | null;
};

export type UpdateOrderInput = Omit<Partial<CreateOrderInput>, 'contactId'>;

export function listOrders(_token: string, filters: OrderFilters = {}): Promise<OrdersResponse> {
  let data = [...DEMO_ORDERS] as Order[];
  if (filters.contactId) data = data.filter(o => o.contactId === filters.contactId);
  if (filters.status) data = data.filter(o => o.status === filters.status);
  if (filters.paymentStatus) data = data.filter(o => o.paymentStatus === filters.paymentStatus);
  return Promise.resolve({ data, total: data.length, page: filters.page ?? 1, limit: filters.limit ?? 20 });
}

export function createOrder(_token: string, _input: CreateOrderInput): Promise<Order> {
  return Promise.resolve(DEMO_ORDERS[0] as Order);
}

export function getOrder(_token: string, id: string): Promise<Order> {
  const o = DEMO_ORDERS.find(x => x.id === id);
  if (!o) return Promise.reject(Object.assign(new Error('Not found'), { status: 404 }));
  return Promise.resolve(o as Order);
}

export function updateOrder(_token: string, id: string, _input: UpdateOrderInput): Promise<Order> {
  return Promise.resolve((DEMO_ORDERS.find(x => x.id === id) ?? DEMO_ORDERS[0]) as Order);
}

export function deleteOrder(_token: string, _id: string): Promise<{ success: true }> {
  return Promise.resolve({ success: true });
}
