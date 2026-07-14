import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { listAttachments, type Attachment, type AttachmentsResponse, type EntityType } from '../../lib/attachments';
import type { HttpError } from '../../lib/http';

type EntityAttachmentsPanelProps = {
  entityType: EntityType;
  entityId: string;
  title?: string;
};

type RequestError = {
  status: number;
  message: string;
};

const EMBEDDED_ATTACHMENT_LIMIT = 10;

function toRequestError(error: unknown, fallback: string): RequestError {
  if (error && typeof error === 'object' && 'status' in error && 'message' in error) {
    const httpError = error as HttpError;

    return {
      status: httpError.status,
      message: httpError.message || fallback,
    };
  }

  return {
    status: 0,
    message: fallback,
  };
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '-';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function EntityAttachmentsPanel({ entityType, entityId, title = 'Attachments' }: EntityAttachmentsPanelProps) {
  const { accessToken } = useAuth();
  const [attachmentsData, setAttachmentsData] = useState<AttachmentsResponse | null>(null);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentsError, setAttachmentsError] = useState<RequestError | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const attachments = attachmentsData?.data ?? [];
  const totalAttachments = attachmentsData?.total ?? attachments.length;

  const refreshAttachments = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!accessToken) {
      setAttachmentsData(null);
      setAttachmentsLoading(false);
      setAttachmentsError(null);
      return;
    }

    let active = true;
    const token = accessToken;

    async function fetchAttachments() {
      setAttachmentsLoading(true);
      setAttachmentsError(null);

      try {
        const response = await listAttachments(token, {
          entityType,
          entityId,
          page: 1,
          limit: EMBEDDED_ATTACHMENT_LIMIT,
        });

        if (!active) {
          return;
        }

        setAttachmentsData(response);
      } catch (requestError) {
        if (!active) {
          return;
        }

        setAttachmentsData(null);
        setAttachmentsError(toRequestError(requestError, 'Could not load attachments.'));
      } finally {
        if (active) {
          setAttachmentsLoading(false);
        }
      }
    }

    void fetchAttachments();

    return () => {
      active = false;
    };
  }, [accessToken, entityId, entityType, refreshKey]);

  return (
    <section className="rounded border border-gray-200 bg-white p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <p className="mt-1 text-sm text-gray-600">
            {totalAttachments === 1 ? '1 attachment metadata record' : `${totalAttachments} attachment metadata records`}
          </p>
          <p className="mt-1 text-sm text-gray-500">Attachment metadata only. File upload is not enabled yet.</p>
        </div>
        <button
          type="button"
          onClick={refreshAttachments}
          className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
        >
          Refresh
        </button>
      </div>

      {attachmentsLoading ? <p className="mt-5 rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">Loading attachments...</p> : null}

      {!attachmentsLoading && attachmentsError ? (
        <div className="mt-5 rounded border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{attachmentsError.message}</p>
          <button
            type="button"
            onClick={refreshAttachments}
            className="mt-3 rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            Retry
          </button>
        </div>
      ) : null}

      {!attachmentsLoading && !attachmentsError && attachments.length === 0 ? (
        <p className="mt-5 rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">No attachments yet.</p>
      ) : null}

      {!attachmentsLoading && !attachmentsError && attachments.length > 0 ? (
        <div className="mt-5 space-y-3">
          {attachments.map((attachment) => (
            <EmbeddedAttachmentCard key={attachment.id} attachment={attachment} />
          ))}
          {totalAttachments > attachments.length ? (
            <p className="text-sm text-gray-600">Showing {attachments.length} of {totalAttachments} attachment metadata records.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

type EmbeddedAttachmentCardProps = {
  attachment: Attachment;
};

function EmbeddedAttachmentCard({ attachment }: EmbeddedAttachmentCardProps) {
  return (
    <article className="rounded border border-gray-200 bg-gray-50 p-4">
      <h3 className="break-words text-sm font-semibold text-gray-900">{attachment.fileName}</h3>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <AttachmentMeta label="Size" value={formatFileSize(attachment.fileSize)} />
        <AttachmentMeta label="MIME type" value={attachment.mimeType || '-'} />
        <AttachmentMeta label="Created" value={formatDateTime(attachment.createdAt)} />
        <AttachmentMeta label="Updated" value={formatDateTime(attachment.updatedAt)} />
      </dl>
    </article>
  );
}

type AttachmentMetaProps = {
  label: string;
  value: string;
};

function AttachmentMeta({ label, value }: AttachmentMetaProps) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 break-words text-gray-900">{value}</dd>
    </div>
  );
}
