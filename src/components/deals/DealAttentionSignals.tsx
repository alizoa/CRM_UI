export type DealAttentionSignal = {
  label: string;
  detail: string;
};

type DealAttentionSignalsProps = {
  errorMessage: string | null;
  loading: boolean;
  openTaskCount: number;
  overdueTaskCount: number;
  signals: DealAttentionSignal[];
};

export function DealAttentionSignals({ errorMessage, loading, openTaskCount, overdueTaskCount, signals }: DealAttentionSignalsProps) {
  return (
    <aside className="rounded border border-gray-200 bg-white p-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Needs attention</h2>
        <p className="mt-1 text-sm text-gray-600">
          {openTaskCount === 1 ? '1 open task' : `${openTaskCount} open tasks`}
          {overdueTaskCount > 0 ? `, ${overdueTaskCount} overdue` : ''}
        </p>
      </div>

      {loading ? <p className="mt-5 rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">Checking deal signals...</p> : null}
      {!loading && errorMessage ? <p className="mt-5 rounded border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">{errorMessage}</p> : null}
      {!loading && !errorMessage && signals.length === 0 ? (
        <p className="mt-5 rounded border border-green-200 bg-green-50 p-4 text-sm text-green-800">Deal looks organized.</p>
      ) : null}
      {!loading && !errorMessage && signals.length > 0 ? (
        <div className="mt-5 space-y-3">
          {signals.map((signal) => (
            <div key={signal.label} className="rounded border border-gray-200 bg-gray-50 p-3">
              <h3 className="text-sm font-semibold text-gray-900">{signal.label}</h3>
              <p className="mt-1 text-sm text-gray-600">{signal.detail}</p>
            </div>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
