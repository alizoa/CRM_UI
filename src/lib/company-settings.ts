// src/lib/company-settings.ts — demo mode
import { DEMO_COMPANY_SETTINGS } from './mock-data';

export const COMPANY_SETTINGS_PATH = '/api/settings/company';

export const COMPANY_TIMEZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Toronto',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Athens',
  'Africa/Johannesburg',
  'Asia/Jerusalem',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
] as const;

export type CompanySettings = {
  id: string;
  name: string;
  timezone: string | null;
  businessHoursStart: string | null;
  businessHoursEnd: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UpdateCompanySettingsInput = {
  name: string;
  timezone: string | null;
  businessHoursStart: string | null;
  businessHoursEnd: string | null;
};

export function getCompanySettings(_token: string, _signal?: AbortSignal): Promise<CompanySettings> {
  return Promise.resolve(DEMO_COMPANY_SETTINGS);
}

export function updateCompanySettings(_token: string, _input: UpdateCompanySettingsInput): Promise<CompanySettings> {
  return Promise.resolve(DEMO_COMPANY_SETTINGS);
}
