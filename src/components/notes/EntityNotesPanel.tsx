import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { HttpError } from '../../lib/http';
import { listMembershipOptions, type MembershipOption } from '../../lib/memberships';
import { createNote, listNotes, type CreateNoteInput, type EntityType, type Note, type NotesResponse } from '../../lib/notes';

type EntityNotesPanelProps = {
  entityType: EntityType;
  entityId: string;
  title?: string;
  description?: string;
  onNotesChanged?: () => void;
};

type RequestError = {
  status: number;
  message: string;
};

const EMBEDDED_NOTE_LIMIT = 10;

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

function shortId(id: string) {
  return id.slice(0, 8);
}

function getMembershipDisplayName(membership: MembershipOption) {
  return [membership.user.firstName, membership.user.lastName].filter(Boolean).join(' ') || membership.user.email;
}

function resolveAuthorLabel(authorId: string | null, membershipsByUserId: Map<string, MembershipOption>) {
  if (!authorId) {
    return 'Unknown author';
  }

  const membership = membershipsByUserId.get(authorId);
  if (membership) {
    return getMembershipDisplayName(membership);
  }

  return `User ${shortId(authorId)}`;
}

function buildCreateNoteInput(entityType: EntityType, entityId: string, body: string): CreateNoteInput {
  return {
    entityType,
    entityId,
    body: body.trim(),
  };
}

export function EntityNotesPanel({ entityType, entityId, title = 'Related notes', description, onNotesChanged }: EntityNotesPanelProps) {
  const { accessToken } = useAuth();
  const [notesData, setNotesData] = useState<NotesResponse | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<RequestError | null>(null);
  const [body, setBody] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<RequestError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<MembershipOption[]>([]);
  const [membershipWarning, setMembershipWarning] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const membershipsByUserId = useMemo(() => new Map(memberships.map((membership) => [membership.userId, membership])), [memberships]);
  const notes = notesData?.data ?? [];
  const totalNotes = notesData?.total ?? notes.length;

  const refreshNotes = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!accessToken) {
      setNotesData(null);
      setNotesLoading(false);
      setNotesError(null);
      return;
    }

    let active = true;
    const token = accessToken;

    async function fetchNotes() {
      setNotesLoading(true);
      setNotesError(null);

      try {
        const response = await listNotes(token, {
          entityType,
          entityId,
          page: 1,
          limit: EMBEDDED_NOTE_LIMIT,
        });

        if (!active) {
          return;
        }

        setNotesData(response);
      } catch (requestError) {
        if (!active) {
          return;
        }

        setNotesData(null);
        setNotesError(toRequestError(requestError, 'Could not load related notes.'));
      } finally {
        if (active) {
          setNotesLoading(false);
        }
      }
    }

    void fetchNotes();

    return () => {
      active = false;
    };
  }, [accessToken, entityId, entityType, refreshKey]);

  useEffect(() => {
    if (!accessToken) {
      setMemberships([]);
      setMembershipWarning(null);
      return;
    }

    let active = true;
    const token = accessToken;

    async function fetchMemberships() {
      setMembershipWarning(null);

      try {
        const response = await listMembershipOptions(token);
        if (!active) {
          return;
        }

        setMemberships(response);
      } catch {
        if (!active) {
          return;
        }

        setMemberships([]);
        setMembershipWarning('Author names could not be loaded.');
      }
    }

    void fetchMemberships();

    return () => {
      active = false;
    };
  }, [accessToken]);

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken) {
      setCreateError({
        status: 401,
        message: 'You need to sign in before creating notes.',
      });
      return;
    }

    if (!body.trim()) {
      setCreateError({
        status: 422,
        message: 'Note body is required.',
      });
      return;
    }

    setCreateLoading(true);
    setCreateError(null);
    setSuccessMessage(null);

    try {
      await createNote(accessToken, buildCreateNoteInput(entityType, entityId, body));
      setBody('');
      setSuccessMessage('Note created.');
      refreshNotes();
      onNotesChanged?.();
    } catch (requestError) {
      const error = toRequestError(requestError, 'Could not create note.');
      setCreateError({
        status: error.status,
        message: error.status === 403 ? 'You do not have permission to create notes.' : error.message,
      });
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <section className="rounded border border-gray-200 bg-white p-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <p className="mt-1 text-sm text-gray-600">{description ?? (totalNotes === 1 ? '1 related note' : `${totalNotes} related notes`)}</p>
        {description ? <p className="mt-1 text-xs text-gray-500">{totalNotes === 1 ? '1 related note' : `${totalNotes} related notes`}</p> : null}
      </div>

      {successMessage ? <p className="mt-4 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">{successMessage}</p> : null}
      {membershipWarning ? <p className="mt-4 rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">{membershipWarning}</p> : null}

      <form className="mt-5" onSubmit={handleCreateSubmit}>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          New note
          <textarea
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              setCreateError(null);
              setSuccessMessage(null);
            }}
            className="min-h-24 rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            required
          />
        </label>
        {createError ? <p className="mt-3 text-sm text-red-700">{createError.message}</p> : null}
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={createLoading}
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {createLoading ? 'Creating...' : 'Create note'}
          </button>
          <button
            type="button"
            onClick={() => {
              setBody('');
              setCreateError(null);
              setSuccessMessage(null);
            }}
            disabled={createLoading}
            className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
          >
            Reset
          </button>
        </div>
      </form>

      {notesLoading ? <p className="mt-5 rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">Loading related notes...</p> : null}

      {!notesLoading && notesError ? (
        <div className="mt-5 rounded border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{notesError.message}</p>
          <button
            type="button"
            onClick={refreshNotes}
            className="mt-3 rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            Retry
          </button>
        </div>
      ) : null}

      {!notesLoading && !notesError && notes.length === 0 ? (
        <p className="mt-5 rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">No related notes yet.</p>
      ) : null}

      {!notesLoading && !notesError && notes.length > 0 ? (
        <div className="mt-5 space-y-3">
          {notes.map((note) => (
            <EmbeddedNoteCard key={note.id} note={note} authorLabel={resolveAuthorLabel(note.authorId, membershipsByUserId)} />
          ))}
          {totalNotes > notes.length ? <p className="text-sm text-gray-600">Showing {notes.length} of {totalNotes} related notes.</p> : null}
        </div>
      ) : null}
    </section>
  );
}

type EmbeddedNoteCardProps = {
  note: Note;
  authorLabel: string;
};

function EmbeddedNoteCard({ note, authorLabel }: EmbeddedNoteCardProps) {
  return (
    <article className="rounded border border-gray-200 bg-gray-50 p-4">
      <p className="whitespace-pre-wrap text-sm text-gray-800">{note.body}</p>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <NoteMeta label="Author" value={authorLabel} />
        <NoteMeta label="Created" value={formatDateTime(note.createdAt)} />
        <NoteMeta label="Updated" value={formatDateTime(note.updatedAt)} />
      </dl>
    </article>
  );
}

type NoteMetaProps = {
  label: string;
  value: string;
};

function NoteMeta({ label, value }: NoteMetaProps) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 break-words text-gray-900">{value}</dd>
    </div>
  );
}
