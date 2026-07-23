import { useState, type ReactNode } from 'react';
import { useAuth } from '../../context/AuthContext';
import { buildChangeSummaryItems } from '../../lib/activity-formatting';
import type { ActivityChangeSource } from '../../lib/activities';
import { shouldRequestChangeDocumentation } from '../../lib/change-documentation-settings';
import {
  buildTaskMutationContext,
  type Task,
  type TaskActivityPreview,
  type TaskMutationContext,
} from '../../lib/tasks';
import { ChangeDocumentationDialog, type ChangeDocumentationResult } from '../activities/ChangeDocumentationDialog';

type TaskDocumentationRequest = {
  title: string;
  description: string;
  subjectLabel: string;
  changes: ReturnType<typeof buildChangeSummaryItems>;
  confirmLabel?: string;
  onCancel?: () => void;
  onConfirm: (result: ChangeDocumentationResult) => Promise<void>;
};

type RunTaskChangeOptions = {
  task: Task;
  preview: TaskActivityPreview;
  source: ActivityChangeSource;
  title: string;
  description: string;
  confirmLabel?: string;
  run: (context: TaskMutationContext) => Promise<void>;
  onCancel?: () => void;
  onError?: (error: unknown) => void;
  subjectLabel?: string;
};

type UseTaskChangeDocumentationOptions = {
  getErrorMessage: (error: unknown) => string;
};

export function useTaskChangeDocumentation({ getErrorMessage }: UseTaskChangeDocumentationOptions) {
  const { user } = useAuth();
  const [documentationRequest, setDocumentationRequest] = useState<TaskDocumentationRequest | null>(null);
  const [documentationSubmitting, setDocumentationSubmitting] = useState(false);
  const [documentationError, setDocumentationError] = useState<string | null>(null);

  function shouldPrompt(preview: TaskActivityPreview) {
    return preview.isDirectLeadTask && preview.documentationActions.some((action) => shouldRequestChangeDocumentation(action));
  }

  function runTaskChange({
    task,
    preview,
    source,
    title,
    description,
    confirmLabel,
    run,
    onCancel,
    onError,
    subjectLabel,
  }: RunTaskChangeOptions) {
    if (preview.changes.length === 0) {
      return;
    }

    const execute = async (result?: ChangeDocumentationResult) => {
      try {
        await run(buildTaskMutationContext(user, source, result ?? undefined));
      } catch (error) {
        onError?.(error);
        throw error;
      }
    };

    if (!shouldPrompt(preview)) {
      void execute().catch(() => {
        // The surface-specific onError handler has already rendered the error.
      });
      return;
    }

    setDocumentationError(null);
    setDocumentationRequest({
      title,
      description,
      subjectLabel: subjectLabel ?? task.title,
      changes: buildChangeSummaryItems(preview.changes),
      confirmLabel,
      onCancel,
      onConfirm: execute,
    });
  }

  const documentationDialog: ReactNode = (
    <ChangeDocumentationDialog
      open={Boolean(documentationRequest)}
      mode="optional-comment"
      title={documentationRequest?.title ?? ''}
      description={documentationRequest?.description}
      subjectLabel={documentationRequest?.subjectLabel}
      changes={documentationRequest?.changes ?? []}
      confirmLabel={documentationRequest?.confirmLabel}
      submitting={documentationSubmitting}
      error={documentationError}
      onCancel={() => {
        if (!documentationSubmitting) {
          documentationRequest?.onCancel?.();
          setDocumentationRequest(null);
          setDocumentationError(null);
        }
      }}
      onConfirm={async (result) => {
        if (!documentationRequest) return;
        setDocumentationSubmitting(true);
        setDocumentationError(null);
        try {
          await documentationRequest.onConfirm(result);
          setDocumentationRequest(null);
        } catch (error) {
          setDocumentationError(getErrorMessage(error));
        } finally {
          setDocumentationSubmitting(false);
        }
      }}
    />
  );

  return { runTaskChange, documentationDialog };
}
