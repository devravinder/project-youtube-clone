---
name: frontend-react-vite-tailwind
description: Scaffold a React 19 + TypeScript + Vite + Tailwind v4 frontend with no shadcn but a shadcn-like token theme, tailwind-variants for reusable components, TanStack Query for server state, and react-player for video. Use when creating or extending a web UI.
---

# Frontend — React 19 + Vite + Tailwind v4 (no shadcn)

The standard web UI recipe. No shadcn — instead a **shadcn-like theme** via CSS-variable
design tokens, and **tailwind-variants** for reusable styled primitives.

## Stack

- React 19 + TypeScript
- Vite (dev server + build)
- Tailwind CSS v4 (via `@tailwindcss/vite`)
- `tailwind-variants` + `tailwind-merge` for reusable components
- `@tanstack/react-query` for all server state (fetching, caching, pagination, mutations)
- `react-router-dom` for routing
- `react-player` for video (MP4 now, HLS and DASH lazy-loaded for streaming later)
- `lucide-react` for icons (imported by name, tree-shaken)
- Vitest + Testing Library (unit), Playwright (e2e)
- oxlint + prettier

## Key rules

- **No shadcn / no component library.** Build primitives ourselves.
- **shadcn-like theme:** design tokens as CSS variables, exposed to Tailwind with
  `@theme inline` so utilities like `bg-primary` and `text-muted-foreground` work. Light and
  dark via a `.dark` class on `<html>`. Flat design: no gradients and no shadows; add one
  only when it carries meaning. Use a tinted palette (green by default), never plain white
  and black. Palettes are separate files in `src/themes/`.
- **Never hard-code a hue in a component** (no `from-fuchsia-500`); use tokens, so every
  palette works.
- **Reusable components** are plain function components styled with `tv()` from
  tailwind-variants. Props come from `ComponentProps<"button">` plus `VariantProps`.
- **Do not use tailwind-styled-components.** Last release was 2022, it only concatenates
  classes (overrides are unreliable), and it breaks event-handler typing under React 19.
- **Server state goes through TanStack Query**, never `useEffect` plus `useState`.
- **No global client-state library** (no Redux or Zustand) until a real need appears. See
  "State management" below.
- Use the native `fetch` API (no axios). Use `XMLHttpRequest` only when upload progress
  is needed.
- Vite dev proxy for `/api` (rewrite the prefix away) so the browser needs no CORS.
- Config comes from env files: committed `.env.development` (public `VITE_` values only),
  git-ignored `.env.local` for overrides. Read them once in `src/config.ts`, which throws on a
  missing value; never scatter `import.meta.env` or hardcode fallbacks. Secrets never go in `VITE_`.
- Pin exact versions of every dependency (see `monorepo-pnpm`).
- Restart the dev server after installing a dependency; a running Vite serves a 500 for
  files that import the new package.

## State management

State has four homes, and none needs a store library today:

| Kind                               | Home                               |
| ---------------------------------- | ---------------------------------- |
| Server data (videos, details)      | TanStack Query cache               |
| Location (which page, which video) | URL and React Router               |
| Form fields, toggles               | Local `useState` in the component  |
| Theme                              | `<html>` class plus `localStorage` |

Add a store only when state is shared across distant components and is not server data or
the URL. Likely triggers: the signed-in user (use a small React context first), an upload
that must keep running while the user navigates, live notification counts.

## Data fetching patterns (TanStack Query)

- One `QueryClient` in `query-client.ts`. Do not retry client errors (400, 404).
- Query keys come from a factory (`videoKeys.list()`, `videoKeys.detail(id)`) so mutations
  can invalidate by prefix.
- Lists use `useInfiniteQuery` with a cursor from the API (`getNextPageParam`). Trigger the
  next page from an `IntersectionObserver` sentinel at the end of the list (`useInView`).
  Re-observe when the page count changes, or a sentinel that stays visible never fires again.
- Mutations (`useMutation`) invalidate the affected keys in `onSuccess`, so the new item
  shows up without a reload.
- **Presigned URLs change on every fetch.** Give any query that returns one a long
  `staleTime` (shorter than the URL's life) and `refetchOnWindowFocus: false`, or a refocus
  swaps the URL and restarts the player.

## UI conventions

- Every page that is not the home page has a **Back button**: history back when the user
  navigated inside the app, otherwise a fallback route.
- A finished action (upload) shows a **distinct success view** in place of the form: a solid
  `bg-primary` card with white text, a bold heading, and an uppercase tracked call to action
  with an arrow ("WATCH VIDEO →"), plus plain-link alternatives.
- Surfaces are flat: pale card on a lighter page, bold primary-coloured headings, rounded
  corners, a border instead of a shadow.
- Status badges carry meaning through tone (ready is green, failed is red).
- Equal-height cards in a grid: `h-full flex flex-col` on the card, `mt-auto` on the footer.
- Icons come from `lucide-react`; never hand-draw SVG. Import by name
  (`import { ArrowLeft } from "lucide-react"`) and size with a class (`className="size-5"`).
  A filled glyph takes `fill="currentColor"`. Icon-only buttons need an `aria-label`. If a
  glyph is missing, use `@tabler/icons-react` (5,000+ icons) for that one.

## Tailwind v4 note

Tailwind v4 is config-light: import it in CSS with `@import "tailwindcss";` and use the
Vite plugin. There is no `tailwind.config.js`; theme tokens live in CSS. Gradients are
`bg-linear-to-r`, not `bg-gradient-to-r`.

## Theme palettes

Each palette is one small file in `src/themes/` defining the same tokens for light
(`:root`) and dark (`.dark`). `index.css` imports exactly one, so switching is a one-line
change. Available: `green` (default), `ocean`, `sunset`, `forest`, `royal`.

A new palette is a copy of one file with new hues. Every palette defines the same tokens:
`background`, `foreground`, `card`, `card-foreground`, `primary`, `primary-foreground`, `muted`, `muted-foreground`, `border`,
`destructive`, `success`.

After adding or editing a palette, run `pnpm --filter @yt/web theme:contrast`. It checks
ten text and background pairs per mode against WCAG AA (4.5:1). Light greens are the usual
failure: a bright primary (Tailwind green-500) cannot carry white text (2.3:1), so use
green-700 for filled areas; and a pale background can wash out red error text.

### `src/index.css`

```css
@import "tailwindcss";

/* Palette: green | ocean | sunset | forest | royal. Change this one line to switch. */
@import "./themes/green.css";

@custom-variant dark (&:is(.dark *));

:root {
  --radius: 0.75rem;
}

@theme inline {
  --color-background: hsl(var(--background));
  --color-card: hsl(var(--card));
  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));
  --color-muted: hsl(var(--muted));
  --color-border: hsl(var(--border));
  /* plus foreground, card-foreground, muted-foreground, destructive, success */
  --radius-md: var(--radius);
}
```

### `src/themes/green.css` (abridged)

```css
:root {
  --background: 138 76% 97%;
  --card: 141 84% 93%;
  --primary: 142 72% 29%;
  --primary-foreground: 0 0% 100%;
  /* plus the remaining tokens */
}

.dark {
  --background: 150 30% 6%;
  --primary: 142 70% 50%;
  /* the same token names with dark values */
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

### Infinite list (TanStack Query)

```tsx
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
  queryKey: videoKeys.list(),
  queryFn: ({ pageParam }) => listVideos({ cursor: pageParam, limit: 12 }),
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
});

const sentinel = useInView<HTMLDivElement>(
  () => void fetchNextPage(),
  Boolean(hasNextPage) && !isFetchingNextPage,
  data?.pages.length,
);
```

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
├── scripts/               # check-theme-contrast.mjs
├── public/                # favicon.svg, favicon-32.png, apple-touch-icon.png
├── src/
│   ├── main.tsx           # theme bootstrap, QueryClientProvider, render
│   ├── App.tsx            # routes
│   ├── index.css          # tailwind import, one palette import, token mapping
│   ├── themes/            # one css file per palette
│   ├── query-client.ts    # QueryClient defaults and retry policy
│   ├── types.ts           # API response types
│   ├── components/        # layout, back button, cards
│   │   └── ui/            # tailwind-variants primitives
│   ├── hooks/             # useInView and similar
│   ├── queries/           # TanStack Query hooks and key factories
│   ├── pages/
│   └── services/          # api.ts (fetch wrapper)
└── e2e/                   # Playwright, when added
```

## Verifying the UI

Run a real browser, not only the type-checker. With `playwright-core` and the installed
Chrome (`executablePath`), no browser download is needed. Keep the throwaway test project
outside the repo.

- `locator.isVisible()` does not wait. Use `locator.waitFor()` for content that appears after
  a route change or a fetch.
- Wait a few hundred milliseconds after a theme toggle before a screenshot; colors fade.
- Read the screenshots. Layout flaws (ragged card heights) never fail an assertion.
- To compare palettes, inject token overrides with `page.addStyleTag` and photograph each
  one before editing any file.

## Testing & quality

- `pnpm test` → Vitest (unit), `pnpm test:e2e` → Playwright.
- `pnpm lint` → oxlint, `pnpm format:code` → prettier.
- Pre-commit runs lint on changed files (see `git-hooks-conventions`).

## API types

Types for API payloads are generated from `contracts/*.openapi.json` with `pnpm --filter @yt/web api:types`;
never hand-write them. Re-export named types from `src/types.ts`. See `openapi-contracts`.

## Large file uploads

Slice with `file.slice`, upload parts through XHR (fetch has no upload progress) with a small
worker pool (3), retry each part with backoff, and fetch part URLs in batches shared by all workers.
Stop handing out work after a permanent failure. Resume by asking the server which parts exist and
skipping those whose size matches; key the saved video id by `name:size:lastModified`. Cancel must
abort the XHRs and call the server to discard the upload. Keep this in `services/upload.ts`, not in
components. See ADR-020.
