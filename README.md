# Alozix CRM — UI Preview

This is a **standalone UI preview** of the Alozix CRM frontend. It runs entirely in the browser with no backend, no API calls, and no environment variables required.

## Quick Start

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173 — the app opens directly into the CRM with demo data.

## What This Is

- Visual preview of the full CRM interface
- All data is static demo data (fake names, example contacts, sample deals)
- Navigation, modals, tabs, dropdowns, and filters all work
- Create/edit/delete actions do not persist — data resets on page reload

## Demo Data

The demo includes:
- 5 sample contacts (Alice Example, Bob Sample, Carol Demo, David Testuser, Eve Placeholder)
- 5 demo leads (Frank DemoLead, Grace SampleLead, Henry FakeLead, Iris TestLead, Jack ExampleLead)
- 4 example deals (Demo Website Project, Example Service Retainer, Sample Consulting Package, Placeholder Enterprise Deal)
- 5 tasks, 3 orders, 2 notes

## Tech Stack

React 18 · Vite · TypeScript · Tailwind CSS · React Router v6
