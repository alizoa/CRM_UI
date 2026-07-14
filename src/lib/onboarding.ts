// src/lib/onboarding.ts — demo mode

export const ONBOARDING_CHECKLIST_PATH = '/api/onboarding/checklist';

export type OnboardingChecklistItem = {
  key: string;
  label: string;
  completed: boolean;
  actionLink: string;
  helperText: string;
};

export type OnboardingChecklist = {
  totalItems: number;
  completedItems: number;
  allComplete: boolean;
  items: OnboardingChecklistItem[];
};

const DEMO_CHECKLIST: OnboardingChecklist = {
  totalItems: 3,
  completedItems: 3,
  allComplete: true,
  items: [
    { key: 'add_contact', label: 'Add your first contact', completed: true, actionLink: '/contacts', helperText: 'Add a contact to get started.' },
    { key: 'create_deal', label: 'Create your first deal', completed: true, actionLink: '/deals', helperText: 'Track your sales pipeline.' },
    { key: 'complete_task', label: 'Complete a task', completed: true, actionLink: '/tasks', helperText: 'Stay on top of your follow-ups.' },
  ],
};

export const getOnboardingChecklist = (_token: string): Promise<OnboardingChecklist> =>
  Promise.resolve(DEMO_CHECKLIST);
