import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ACTIVITY_COMMENT_MAX_LENGTH } from '../../lib/activities';
import type { ChangeSummaryItem } from '../../lib/activity-formatting';

export type ChangeDocumentationMode = 'optional-comment' | 'required-reason';

export type ChangeDocumentationResult = {
  comment: string | null;
  reason: string | null;
};

export type ChangeDocumentationDialogProps = {
  open: boolean;
  mode: ChangeDocumentationMode;
  title: string;
  description?: string;
  subjectLabel?: string;
  changes: ChangeSummaryItem[];
  confirmLabel?: string;
  submitting?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (result: ChangeDocumentationResult) => void | Promise<void>;
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement | null) {
  if (!container) {
    return [];
  }

  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => !element.hasAttribute('disabled'));
}

function getDisplayValue(value: string) {
  return value.trim() ? value : 'Not set';
}

export function ChangeDocumentationDialog({
  open,
  mode,
  title,
  description,
  subjectLabel,
  changes,
  confirmLabel = 'Confirm change',
  submitting = false,
  error = null,
  onCancel,
  onConfirm,
}: ChangeDocumentationDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const textareaId = useId();
  const helperId = useId();
  const validationId = useId();
  const errorId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const [draft, setDraft] = useState('');
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const trimmedDraft = draft.trim();
  const remainingCharacters = ACTIVITY_COMMENT_MAX_LENGTH - draft.length;
  const overLimit = draft.length > ACTIVITY_COMMENT_MAX_LENGTH;
  const reasonMissing = mode === 'required-reason' && !trimmedDraft;
  const showRequiredValidation = reasonMissing && (attemptedSubmit || draft.length > 0);
  const validationMessage = showRequiredValidation
    ? 'Reason is required.'
    : overLimit
      ? `Use ${ACTIVITY_COMMENT_MAX_LENGTH} characters or fewer.`
      : null;
  const describedBy = [
    description ? descriptionId : null,
    helperId,
    validationMessage ? validationId : null,
    error ? errorId : null,
  ].filter(Boolean).join(' ');
  const inputLabel = mode === 'required-reason' ? 'Reason — required' : 'Comment — optional';
  const helperText = mode === 'required-reason'
    ? 'Explain why this change is being made.'
    : 'Add useful context for your team about this change.';
  const confirmDisabled = submitting || overLimit || (mode === 'required-reason' && !trimmedDraft);

  function restoreFocusOnce() {
    const previouslyFocusedElement = previouslyFocusedElementRef.current;
    if (!previouslyFocusedElement) {
      return;
    }

    previouslyFocusedElementRef.current = null;
    previouslyFocusedElement.focus();
  }

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      previouslyFocusedElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setDraft('');
      setAttemptedSubmit(false);
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    }

    if (!open && wasOpenRef.current) {
      restoreFocusOnce();
    }

    wasOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    return () => {
      if (wasOpenRef.current) {
        restoreFocusOnce();
      }
    };
  }, []);

  useEffect(() => {
    if (open) {
      setAttemptedSubmit(false);
    }
  }, [mode, open]);

  const summaryItems = useMemo(() => changes, [changes]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleDocumentKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleCancel();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusableElements = getFocusableElements(dialogRef.current);
      if (focusableElements.length === 0) {
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (!dialogRef.current?.contains(activeElement)) {
        event.preventDefault();
        firstElement.focus();
        return;
      }

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => document.removeEventListener('keydown', handleDocumentKeyDown);
  });

  if (!open) {
    return null;
  }

  function handleCancel() {
    if (!submitting) {
      onCancel();
    }
  }

  function handleConfirm() {
    setAttemptedSubmit(true);
    if (confirmDisabled) {
      return;
    }

    void onConfirm({
      comment: mode === 'optional-comment' && trimmedDraft ? trimmedDraft : null,
      reason: mode === 'required-reason' ? trimmedDraft : null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-900/50 p-4" role="presentation">
      <button
        type="button"
        aria-label="Cancel change confirmation"
        className="fixed inset-0 h-full w-full cursor-default"
        disabled={submitting}
        onClick={handleCancel}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy || undefined}
        className="relative mx-auto my-12 max-w-xl rounded border border-gray-200 bg-white shadow-xl"
      >
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="mt-1 text-sm text-gray-600">
              {description}
            </p>
          ) : null}
          {subjectLabel ? (
            <p className="mt-2 break-words text-sm font-medium text-gray-800">
              {subjectLabel}
            </p>
          ) : null}
        </div>

        <div className="space-y-4 px-5 py-4">
          <section className="rounded border border-gray-200 bg-gray-50 px-3 py-3" aria-label="Proposed changes">
            <h3 className="text-sm font-semibold text-gray-900">Proposed changes</h3>
            {summaryItems.length > 0 ? (
              <dl className="mt-3 space-y-2">
                {summaryItems.map((change) => (
                  <div key={`${change.field}-${change.label}-${change.from}-${change.to}`} className="text-sm">
                    <dt className="font-medium text-gray-900">{change.label}</dt>
                    <dd className="mt-0.5 break-words text-gray-700">
                      <span>{getDisplayValue(change.from)}</span>
                      <span aria-hidden="true"> {'->'} </span>
                      <span className="sr-only"> changes to </span>
                      <span>{getDisplayValue(change.to)}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-2 text-sm text-gray-600">This action will be recorded in Activity.</p>
            )}
          </section>

          <div>
            <label htmlFor={textareaId} className="text-sm font-medium text-gray-900">
              {inputLabel}
            </label>
            <p id={helperId} className="mt-1 text-sm text-gray-600">
              {helperText}
            </p>
            <textarea
              ref={textareaRef}
              id={textareaId}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setAttemptedSubmit(false);
              }}
              disabled={submitting}
              aria-invalid={Boolean(validationMessage)}
              aria-describedby={describedBy || undefined}
              className="mt-2 min-h-28 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100"
            />
            <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
              <div>
                {validationMessage ? (
                  <p id={validationId} role="alert" className="text-sm text-red-700">
                    {validationMessage}
                  </p>
                ) : null}
                {error ? (
                  <p id={errorId} role="alert" className="text-sm text-red-700">
                    {error}
                  </p>
                ) : null}
              </div>
              <p className={overLimit ? 'text-sm text-red-700' : 'text-sm text-gray-500'} aria-live="polite">
                {remainingCharacters >= 0 ? `${remainingCharacters} characters remaining` : `${Math.abs(remainingCharacters)} characters over limit`}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-200 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={handleCancel}
            disabled={submitting}
            className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirmDisabled}
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {submitting ? 'Confirming...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
