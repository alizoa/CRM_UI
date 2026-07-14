import { useCallback, useEffect, useState } from 'react';
import {
  createContact as createContactRequest,
  listContacts,
  type Contact,
  type ContactFilters,
  type ContactsResponse,
  type CreateContactInput,
} from '../lib/contacts';
import type { HttpError } from '../lib/http';

type RequestError = {
  status: number;
  message: string;
};

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

export function useContacts(token: string | null, filters: ContactFilters = {}) {
  const { search, status, ownerId, leadSourceId, tagId, page, limit } = filters;
  const [data, setData] = useState<ContactsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<RequestError | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<RequestError | null>(null);

  const refetch = useCallback(async () => {
    if (!token) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await listContacts(token, {
        search,
        status,
        ownerId,
        leadSourceId,
        tagId,
        page,
        limit,
      });
      setData(response);
    } catch (requestError) {
      setData(null);
      setError(toRequestError(requestError, 'Could not load contacts.'));
    } finally {
      setLoading(false);
    }
  }, [leadSourceId, limit, ownerId, page, search, status, tagId, token]);

  const createContact = useCallback(
    async (input: CreateContactInput): Promise<Contact | null> => {
      if (!token) {
        const missingTokenError = {
          status: 401,
          message: 'You need to sign in before creating contacts.',
        };
        setCreateError(missingTokenError);
        return null;
      }

      setCreateLoading(true);
      setCreateError(null);

      try {
        const contact = await createContactRequest(token, input);
        await refetch();
        return contact;
      } catch (requestError) {
        setCreateError(toRequestError(requestError, 'Could not create contact.'));
        return null;
      } finally {
        setCreateLoading(false);
      }
    },
    [refetch, token],
  );

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return {
    contacts: data?.data ?? [],
    data,
    loading,
    error,
    refetch,
    createContact,
    createLoading,
    createError,
  };
}
