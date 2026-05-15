# DocuChat UI

DocuChat UI is a React, TypeScript, Vite, and Tailwind CSS dashboard prototype for exploring document workspaces, uploaded files, active chat tabs, and mock AI replies.

## Tech stack

- React 19
- TypeScript 6
- Vite 8
- Tailwind CSS 4
- shadcn-style UI primitives
- Radix UI primitives
- Zustand for persisted dashboard state
- Recharts for workspace charts
- Vitest and React Testing Library for tests

## Requirements

Use Node 20.19 or newer. The Vite, ESLint, Tailwind, and React Router versions in this project require a modern Node runtime.

## Getting started

Install dependencies:

```sh
npm install
```

Start the local development server:

```sh
npm run dev
```

Build for production:

```sh
npm run build
```

Preview the production build:

```sh
npm run preview
```

## Quality checks

Run linting:

```sh
npm run lint
```

Run tests:

```sh
npm run test
```

Run the main validation sequence:

```sh
npm run lint && npm run test && npm run build
```

## Project structure

- `src/App.tsx` defines routing and default workspace redirection.
- `src/config/dashboard.ts` contains the workspace, document, label, tab, and chart configuration.
- `src/store/dashboard-store.ts` persists active tabs and chat messages with Zustand.
- `src/components/dashboard/` contains feature-level dashboard components.
- `src/components/ui/` contains reusable UI primitives.
- `src/lib/mock-chat.ts` generates mock assistant replies.
- `src/test/setup.ts` configures the Vitest browser-like test environment.

## Notes

Several controls are intentionally placeholder actions in this UI prototype. They now expose accessible labels and show status feedback when clicked until backend upload, workspace creation, explorer, and management flows are connected.
