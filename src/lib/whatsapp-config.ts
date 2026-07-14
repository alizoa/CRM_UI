// src/lib/whatsapp-config.ts — demo mode

export const WHATSAPP_CONFIG_PATH = '/api/integrations/whatsapp/config';
export const WHATSAPP_CONFIG_TOGGLE_PATH = `${WHATSAPP_CONFIG_PATH}/toggle`;
export const WHATSAPP_CONFIG_DIAGNOSTICS_PATH = `${WHATSAPP_CONFIG_PATH}/diagnostics`;

export type WhatsappConfig = {
  id: string;
  provider: string;
  phoneNumberIdMasked: string | null;
  businessIdMasked: string | null;
  displayName: string | null;
  restartTemplateName: string | null;
  restartTemplateLanguageCode: string | null;
  accessTokenSaved: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SaveWhatsappConfigInput = {
  displayName?: string;
  phoneNumberId: string;
  businessId: string;
  accessToken: string;
  restartTemplateName?: string | null;
  restartTemplateLanguageCode?: string | null;
};

export type DeleteWhatsappConfigResponse = {
  deleted: boolean;
};

export type WhatsappDiagnostics = {
  integrationExists: boolean;
  isActive: boolean;
  phoneNumberIdConfigured: boolean;
  phoneNumberIdMasked: string | null;
  businessIdConfigured: boolean;
  businessIdMasked: string | null;
  tokenConfigured: boolean;
  displayName: string | null;
  signatureVerificationEnabled: boolean;
  lastWebhookReceivedAt: string | null;
  lastInboundMessageAt: string | null;
  lastOutboundMessageAt: string | null;
  openConversationCount: number;
};

export async function getWhatsappConfig(_token: string): Promise<WhatsappConfig | null> {
  return null;
}

export async function saveWhatsappConfig(
  _token: string,
  input: SaveWhatsappConfigInput,
): Promise<WhatsappConfig> {
  return {
    id: 'wa-config-demo',
    provider: 'whatsapp',
    phoneNumberIdMasked: `****${input.phoneNumberId.slice(-4)}`,
    businessIdMasked: `****${input.businessId.slice(-4)}`,
    displayName: input.displayName ?? null,
    restartTemplateName: input.restartTemplateName ?? null,
    restartTemplateLanguageCode: input.restartTemplateLanguageCode ?? null,
    accessTokenSaved: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function deleteWhatsappConfig(_token: string): Promise<DeleteWhatsappConfigResponse> {
  return Promise.resolve({ deleted: true });
}

export async function toggleWhatsappConfig(
  _token: string,
  isActive: boolean,
): Promise<WhatsappConfig> {
  return {
    id: 'wa-config-demo',
    provider: 'whatsapp',
    phoneNumberIdMasked: null,
    businessIdMasked: null,
    displayName: null,
    restartTemplateName: null,
    restartTemplateLanguageCode: null,
    accessTokenSaved: false,
    isActive,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function getWhatsappDiagnostics(_token: string): Promise<WhatsappDiagnostics> {
  return Promise.resolve({
    integrationExists: false,
    isActive: false,
    phoneNumberIdConfigured: false,
    phoneNumberIdMasked: null,
    businessIdConfigured: false,
    businessIdMasked: null,
    tokenConfigured: false,
    displayName: null,
    signatureVerificationEnabled: false,
    lastWebhookReceivedAt: null,
    lastInboundMessageAt: null,
    lastOutboundMessageAt: null,
    openConversationCount: 0,
  });
}
