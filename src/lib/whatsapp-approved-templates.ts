// src/lib/whatsapp-approved-templates.ts — demo mode

export const WHATSAPP_APPROVED_TEMPLATES_PATH = '/api/integrations/whatsapp/approved-templates';

export type WhatsappTemplateVariable = {
  id: string;
  templateId: string;
  position: number;
  label: string;
};

export type WhatsappApprovedTemplate = {
  id: string;
  name: string;
  languageCode: string;
  category: string | null;
  bodyPreview: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  variables: WhatsappTemplateVariable[];
};

export type ApprovedTemplateVariableInput = {
  position: number;
  label: string;
};

export type CreateApprovedTemplateInput = {
  name: string;
  languageCode: string;
  category?: string | null;
  bodyPreview?: string | null;
  variables?: ApprovedTemplateVariableInput[];
};

export type UpdateApprovedTemplateInput = {
  name?: string;
  languageCode?: string;
  category?: string | null;
  bodyPreview?: string | null;
  isActive?: boolean;
  variables?: ApprovedTemplateVariableInput[];
};

export function listApprovedTemplates(_token: string): Promise<WhatsappApprovedTemplate[]> {
  return Promise.resolve([]);
}

export function createApprovedTemplate(_token: string, input: CreateApprovedTemplateInput): Promise<WhatsappApprovedTemplate> {
  return Promise.resolve({
    id: `tpl-${Date.now()}`,
    name: input.name,
    languageCode: input.languageCode,
    category: input.category ?? null,
    bodyPreview: input.bodyPreview ?? null,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    variables: (input.variables ?? []).map((v, i) => ({ id: `var-${i}`, templateId: `tpl-${Date.now()}`, position: v.position, label: v.label })),
  });
}

export function updateApprovedTemplate(_token: string, id: string, input: UpdateApprovedTemplateInput): Promise<WhatsappApprovedTemplate> {
  return Promise.resolve({
    id,
    name: input.name ?? 'Template',
    languageCode: input.languageCode ?? 'en',
    category: input.category ?? null,
    bodyPreview: input.bodyPreview ?? null,
    isActive: input.isActive ?? true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    variables: (input.variables ?? []).map((v, i) => ({ id: `var-${i}`, templateId: id, position: v.position, label: v.label })),
  });
}

export function deleteApprovedTemplate(_token: string, _id: string): Promise<void> {
  return Promise.resolve();
}
