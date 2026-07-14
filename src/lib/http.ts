// src/lib/http.ts
// Stubbed — no network calls in demo mode

export type HttpError = {
  status: number;
  message: string;
  code?: string;
  details?: unknown;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerRefreshCallback(_cb: () => Promise<any>) {}
export function clearRefreshCallback() {}

export async function httpRequest<T>(_path: string, _opts?: unknown): Promise<T> {
  throw new Error('httpRequest: stub — should not be called in demo mode');
}
