// src/lib/website-capture-config.ts — demo mode

export const WEBSITE_CONFIG_PATH = '/api/integrations/website/config';

export type WebsiteCaptureConfig = {
  id: string;
  provider: 'website';
  publicKeyMasked: string;
  endpointUrl: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  publicKey?: string;
};

export type WebsiteLeadInput = {
  name: string;
  phone?: string;
  email?: string;
  message?: string;
};

export type WebsiteTestLeadResult = {
  lead: {
    id: string;
    status: string;
    source: string;
    sourceDetail: string;
  };
};

const DEMO_CONFIG: WebsiteCaptureConfig = {
  id: 'wc-demo',
  provider: 'website',
  publicKeyMasked: '****demo',
  endpointUrl: 'https://api.alozix.com/capture/demo',
  isActive: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

export function getWebsiteCaptureConfig(_token: string): Promise<WebsiteCaptureConfig | null> {
  return Promise.resolve(DEMO_CONFIG);
}

export function createWebsiteCaptureConfig(_token: string): Promise<WebsiteCaptureConfig> {
  return Promise.resolve(DEMO_CONFIG);
}

export function rotateWebsiteCaptureKey(_token: string): Promise<WebsiteCaptureConfig> {
  return Promise.resolve(DEMO_CONFIG);
}

export function revealWebsiteCaptureKey(_token: string): Promise<WebsiteCaptureConfig> {
  return Promise.resolve({ ...DEMO_CONFIG, publicKey: 'demo-public-key-12345' });
}

export function toggleWebsiteCaptureConfig(_token: string, isActive: boolean): Promise<WebsiteCaptureConfig> {
  return Promise.resolve({ ...DEMO_CONFIG, isActive });
}

export function sendWebsiteTestLead(_token: string, _input: WebsiteLeadInput): Promise<WebsiteTestLeadResult> {
  return Promise.resolve({
    lead: { id: `led-test-${Date.now()}`, status: 'NEW', source: 'WEBSITE', sourceDetail: 'test' },
  });
}

export function buildWebsiteCaptureSnippet(endpointUrl: string, publicKey: string): string {
  return `<form id="alozix-lead-form">
  <input name="name" placeholder="Name" required>
  <input name="phone" placeholder="Phone">
  <input name="email" type="email" placeholder="Email">
  <textarea name="message" placeholder="How can we help?"></textarea>
  <button type="submit">Send</button>
</form>
<script>
document.getElementById('alozix-lead-form').addEventListener('submit', async function (event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const data = Object.fromEntries(Object.entries(values).filter(([, value]) => value));
  await fetch(${JSON.stringify(endpointUrl)}, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Website-Form-Key': ${JSON.stringify(publicKey)} },
    body: JSON.stringify(data)
  });
});
</script>`;
}

export function buildWebsiteCaptureDeveloperInstructions(endpointUrl: string, publicKey: string): string {
  return `Please connect our existing website form to Alozix Lead Center.

You do not need to change how our form looks or build a new form -
just send each submission to the address below when it's submitted.

Endpoint: ${endpointUrl}
Method: POST
Header: X-Website-Form-Key: ${publicKey}
Content-Type: application/json

Send these fields in the JSON body:
- name (required)
- phone (required if no email)
- email (required if no phone)
- message (optional)`;
}
