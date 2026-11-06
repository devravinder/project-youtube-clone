---
name: frontend-react-vite-tailwind
description: Scaffold a React 19 + TypeScript + Vite + Tailwind v4 frontend with no shadcn but a shadcn-like token theme, using tailwind-styled-components for reusable components. Use when creating or extending a web UI.
---

# Frontend — React 19 + Vite + Tailwind v4 (no shadcn)

The standard web UI recipe. No shadcn — instead a **shadcn-like theme** via CSS-variable
design tokens, and **tailwind-styled-components** for reusable styled primitives.

## Stack

- React 19 + TypeScript
- Vite (dev server + build)
- Tailwind CSS v4 (via `@tailwindcss/vite`)
- `tailwind-styled-components` for reusable components
- `react-router-dom` for routing
- Vitest + Testing Library (unit), Playwright (e2e)
- oxlint + prettier

## Key rules

- **No shadcn / no component library.** Build primitives ourselves.
- **shadcn-like theme:** define design tokens as CSS variables (`--background`,
  `--foreground`, `--primary`, `--muted`, `--border`, `--radius`) in `index.css`, consumed
  through Tailwind. Support light/dark via a `.dark` class on `:root`.
- **Reusable components** use `tailwind-styled-components` (`tw.button\`...\``) so variants
  are co-located and type-safe.
- Use the native `fetch` API (no axios).
- Vite dev proxy for `/api` and `/auth` to avoid CORS in local dev.

## Tailwind v4 note

Tailwind v4 is config-light: import it in CSS with `@import "tailwindcss";` and use the
Vite plugin. There is no large `tailwind.config.js` by default; theme tokens live in CSS.

### `index.css` (token theme)

```css
@import "tailwindcss";

:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 4%;
  --primary: 240 6% 10%;
  --primary-foreground: 0 0% 98%;
  --muted: 240 5% 96%;
  --border: 240 6% 90%;
  --radius: 0.5rem;
}
.dark {
  --background: 240 10% 4%;
  --foreground: 0 0% 98%;
  --primary: 0 0% 98%;
  --primary-foreground: 240 6% 10%;
  --muted: 240 4% 16%;
  --border: 240 4% 16%;
}
```

### `vite.config.ts`

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": "http://localhost:8080",
      "/auth": "http://localhost:8180",
    },
  },
});
```

### Reusable component (tailwind-styled-components)

```tsx
import tw from "tailwind-styled-components";

export const Button = tw.button`
  inline-flex items-center justify-center rounded-[var(--radius)]
  px-4 py-2 text-sm font-medium
  bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]
  hover:opacity-90 disabled:opacity-50 transition
`;

export const Card = tw.div`
  rounded-[var(--radius)] border border-[hsl(var(--border))]
  bg-[hsl(var(--background))] p-4 shadow-sm
`;
```

## Project layout

```
apps/web/
├── index.html
├── vite.config.ts
├── vitest.config.ts
├── src/
│   ├── main.tsx
│   ├── App.tsx            # routes + guards
│   ├── index.css          # tailwind import + token theme
│   ├── components/ui/     # tailwind-styled-components primitives
│   ├── pages/
│   ├── services/          # api.ts (fetch wrapper), auth.ts (OIDC)
│   ├── context/           # AuthContext, etc.
│   └── test/
└── e2e/                   # Playwright
```

## Testing & quality

- `pnpm test` → Vitest (unit), `pnpm test:e2e` → Playwright.
- `pnpm lint` → oxlint, `pnpm format:code` → prettier.
- Pre-commit runs lint + unit tests on changed files (see `git-hooks-conventions`).
