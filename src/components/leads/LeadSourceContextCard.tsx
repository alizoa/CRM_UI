import type { Lead } from '../../lib/leads';

function label(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');
}

export function LeadSourceContextCard({ lead }: { lead: Lead }) {
  const connected = Boolean(lead.linkedConversationId || lead.linkedConversationProvider);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-base font-semibold text-gray-900">Source Context / Connected Conversation</h2>
      <p className="mt-1 text-sm text-gray-600">{connected ? 'Read-only context captured with this lead.' : lead.source === 'MANUAL' ? 'Manual lead' : 'No connected conversation'}</p>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2">
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Source</dt><dd className="mt-1 text-sm text-gray-900">{lead.leadSource?.name ?? label(lead.source)}</dd></div>
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Source detail</dt><dd className="mt-1 text-sm text-gray-900">{lead.sourceDetail || 'Not provided'}</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Original message</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-900">{lead.originalMessage || 'Not provided'}</dd></div>
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Conversation provider</dt><dd className="mt-1 text-sm text-gray-900">{lead.linkedConversationProvider || 'No connected conversation'}</dd></div>
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Conversation ID</dt><dd className="mt-1 break-all text-sm text-gray-900">{lead.linkedConversationId || 'Not available'}</dd></div>
        {lead.externalSourceId ? <div className="sm:col-span-2"><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">External source ID</dt><dd className="mt-1 break-all text-sm text-gray-900">{lead.externalSourceId}</dd></div> : null}
      </dl>
    </section>
  );
}
