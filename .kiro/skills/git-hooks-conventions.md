---
name: git-hooks-conventions
description: Set up Husky + lint-staged + commitlint for a polyglot monorepo so lint, format, tests, and conventional commits run automatically. Use when configuring repo quality gates or git hooks.
---

# Git Hooks & Conventions

Automated quality gates on commit, adapted from the reference advanced-starter.

## Tools

- **Husky** — manages git hooks.
- **lint-staged** — runs tools only on staged files.
- **commitlint** + `@commitlint/config-conventional` — enforce conventional commit messages.
- **oxlint** + **prettier** — fast lint/format for TS/JS.
- **spotless** (Gradle) — format Java.

## Hooks

- `pre-commit` → lint-staged (lint + format + relevant tests on changed files).
- `commit-msg` → commitlint (conventional commits).

## lint-staged (polyglot)

```js
// lint-staged.config.js
export default {
  "*.{ts,tsx,js,jsx,mjs,cjs}": ["oxlint", "prettier --write"],
  "*.md": ["markdownlint-cli2 --fix", "prettier --write"],
  "*.{json,yaml,yml,css}": ["prettier --write"],
  // A function returns commands without file args, so Gradle runs once, not per file.
  "apps/transcoder-service/src/**/*.java": () => [
    "pnpm --filter @yt/transcoder-service format",
    "pnpm --filter @yt/transcoder-service test",
  ],
};
```

## commitlint

```js
// commitlint.config.js
export default { extends: ["@commitlint/config-conventional"] };
```

## Conventional commits

`<type>: <summary>` — types: feat, fix, docs, refactor, test, chore, build, ci, perf.
See `git-commit-convention` for the per-task rule (commit after every task, under 10 words).

## Notes

- Keep hooks enabled; do not `--no-verify` unless explicitly required.
- On Windows, Gradle hook commands go through `scripts/gradle.mjs`, which picks `gradlew.bat` or `gradlew`.
- Cross-platform: store `gradlew`, `.husky/*` and every `*.sh` as `100755` (`git add --chmod=+x <file>`;
  Windows never sets the bit itself), give every PowerShell script a bash twin, and check a fresh Linux
  clone with `git ls-files -s` (modes) and `git ls-files --eol` (no `i/crlf`).
- Tooling packages resolve via the org registry (developer's npm settings; not committed).
