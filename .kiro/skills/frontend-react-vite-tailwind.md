---
name: frontend-react-vite-tailwind
description: Scaffold a React 19 + TypeScript + Vite + Tailwind v4 frontend with no shadcn but a shadcn-like token theme, using tailwind-variants and tailwind-merge for reusable components and react-player for video. Use when creating or extending a web UI.
---

# Frontend — React 19 + Vite + Tailwind v4 (no shadcn)

The standard web UI recipe. No shadcn — instead a **shadcn-like theme** via CSS-variable
design tokens, and **tailwind-variants** for reusable styled primitives.

## Stack

- React 19 + TypeScript
- Vite (dev server + build)
- Tailwind CSS v4 (via `@tailwindcss/vite`)
- `tailwind-variants` + `tailwind-merge` for reusable components
- `react-router-dom` for routing
- `react-player` for video (MP4 now, HLS and DASH lazy-loaded for streaming later)
- Vitest + Testing Library (unit), Playwright (e2e)
- oxlint + prettier

## Key rules

- **No shadcn / no component library.** Build primitives ourselves.
- **shadcn-like theme:** design tokens as CSS variables in `index.css`, exposed to Tailwind
  with `@theme inline` so utilities like `bg-primary` and `text-muted-foreground` work.
  Light and dark via a `.dark` class on `<html>`.
- **Reusable components** are plain function components styled with `tv()` from
  tailwind-variants. Props come from `ComponentProps<"button">` plus `VariantProps`.
- **Do not use tailwind-styled-components.** Last release was 2022, it only concatenates
  classes (overrides are unreliable), and it breaks event-handler typing under React 19.
- Use the native `fetch` API (no axios). Use `XMLHttpRequest` only when upload progress
  is needed.
- Vite dev proxy for `/api` (rewrite the prefix away) so the browser needs no CORS.
- Pin exact versions of every dependency (see `monorepo-pnpm`).

## Tailwind v4 note

Tailwind v4 is config-light: import it in CSS with `@import "tailwindcss";` and use the
Vite plugin. There is no `tailwind.config.js`; theme tokens live in CSS.

### `index.css` (token theme)

```css
@import "tailwindcss";

@custom-variant dark (&:is(.dark *));

:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 4%;
  --primary: 240 6% 10%;
  --primary-foreground: 0 0% 98%;
  --muted: 240 5% 96%;
  --muted-foreground: 240 4% 46%;
  --border: 240 6% 90%;
  --destructive: 0 72% 51%;
  --radius: 0.5rem;
}

.dark {
  --background: 240 10% 4%;
  --foreground: 0 0% 98%;
  --primary: 0 0% 98%;
  --primary-foreground: 240 6% 10%;
  --muted: 240 4% 16%;
  --muted-foreground: 240 5% 65%;
  --border: 240 4% 16%;
  --destructive: 0 63% 45%;
}

@theme inline {
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));
  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));
  --color-muted: hsl(var(--muted));
  --color-muted-foreground: hsl(var(--muted-foreground));
  --color-border: hsl(var(--border));
  --color-destructive: hsl(var(--destructive));
  --radius-md: var(--radius);
}
```

### `vite.config.ts`

```ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
```

### Reusable component (tailwind-variants)

```tsx
import type { ComponentProps } from "react";
import { tv, type VariantProps } from "tailwind-variants";

const button = tv({
  base: "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium",
  variants: {
    variant: {
      primary: "bg-primary text-primary-foreground hover:opacity-90",
      outline: "border border-border hover:bg-muted",
    },
  },
  defaultVariants: { variant: "primary" },
});

type ButtonProps = ComponentProps<"button"> & VariantProps<typeof button>;

export function Button({ variant, className, ...props }: ButtonProps) {
  return <button className={button({ variant, className })} {...props} />;
}
```

- A `className` passed by the caller overrides conflicting base classes (tailwind-merge).
- `tv({ extend: other, base: "..." })` builds one primitive on another (Input to Textarea).
- React 19 passes `ref` as a normal prop, so no `forwardRef`.

### Video player (react-player)

```tsx
import ReactPlayer from "react-player";

<div className="aspect-video overflow-hidden rounded-md bg-black">
  <ReactPlayer src={playbackUrl} controls width="100%" height="100%" />
</div>;
```

## Project layout

```text
apps/web/
├── index.html
├── vite.config.ts
├── src/
│   ├── main.tsx           # theme bootstrap + render
│   ├── App.tsx            # routes
│   ├── index.css          # tailwind import + token theme
│   ├── types.ts           # API response types
│   ├── components/        # layout and shared components
│   │   └── ui/            # tailwind-variants primitives
│   ├── hooks/             # useAsync and similar
│   ├── pages/
│   └── services/          # api.ts (fetch wrapper)
└── e2e/                   # Playwright, when added
```

## Testing & quality

- `pnpm test` → Vitest (unit), `pnpm test:e2e` → Playwright.
- `pnpm lint` → oxlint, `pnpm format:code` → prettier.
- Pre-commit runs lint on changed files (see `git-hooks-conventions`).
