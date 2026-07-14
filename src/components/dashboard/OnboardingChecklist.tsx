import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getOnboardingChecklist, type OnboardingChecklist as Checklist } from '../../lib/onboarding';

const DISMISSED_KEY = 'alozix:onboarding-checklist-dismissed';

export function OnboardingChecklist({ accessToken }: { accessToken: string | null }) {
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let cancelled = false;
    if (!accessToken || dismissed) {
      setChecklist(null);
      return;
    }

    void getOnboardingChecklist(accessToken)
      .then((result) => {
        if (!cancelled) setChecklist(result);
      })
      .catch(() => {
        if (!cancelled) setChecklist(null);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, dismissed]);

  if (dismissed || !checklist || checklist.allComplete) return null;

  const progress = Math.round((checklist.completedItems / checklist.totalItems) * 100);

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISSED_KEY, 'true');
    } catch {
      // The card still hides when browser storage is unavailable.
    }
    setDismissed(true);
  };

  return (
    <section className="rounded border border-blue-200 bg-blue-50 p-5" aria-labelledby="onboarding-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="onboarding-title" className="text-base font-semibold text-gray-900">Get started</h2>
          <p className="mt-1 text-sm text-gray-600">
            {checklist.completedItems} of {checklist.totalItems} complete
          </p>
        </div>
        <button
          type="button"
          className="rounded px-2 py-1 text-sm text-gray-600 hover:bg-blue-100 hover:text-gray-900"
          onClick={dismiss}
          aria-label="Dismiss onboarding checklist for this session"
        >
          Dismiss
        </button>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded bg-blue-100" aria-hidden="true">
        <div className="h-full rounded bg-blue-600" style={{ width: `${progress}%` }} />
      </div>
      <ul className="mt-4 grid gap-3 md:grid-cols-2">
        {checklist.items.map((item) => (
          <li key={item.key} className="rounded border border-blue-100 bg-white p-3">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  item.completed ? 'bg-green-100 text-green-700' : 'border border-gray-300 text-transparent'
                }`}
              >
                ✓
              </span>
              <div>
                <p className={`text-sm font-medium ${item.completed ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                  {item.label}
                </p>
                <p className="mt-1 text-xs text-gray-500">{item.helperText}</p>
                {!item.completed ? (
                  <Link className="mt-2 inline-block text-sm font-medium text-blue-700 hover:text-blue-900" to={item.actionLink}>
                    Continue →
                  </Link>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
