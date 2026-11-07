---
name: git-commit-convention
description: Commit after every completed task with a short conventional message under 10 words. Use when finishing any task or discrete unit of work.
---

# Git Commit Convention

## Rule

After **every completed task**, make a git commit. Keep the message **short — 10 words max**.

## Format

Conventional commits, imperative mood, lowercase after the type:

```text
<type>: <short summary>
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build`, `ci`, `perf`.

## Rules

- Summary **under 10 words**. No trailing period.
- One commit per task — do not batch unrelated changes.
- Stage specific files by name, not `git add .` / `-A`.
- Do not `--amend` already-pushed commits; prefer new commits.
- Do not skip hooks (`--no-verify`) unless explicitly asked.
- Never modify git config.

## Good examples

```text
docs: add PRD and learning goals
feat: add storage port and minio adapter
feat: presigned upload endpoint
fix: idempotent transcode consumer
test: cover video metadata service
chore: add pnpm workspace config
```

## Bad examples

```text
updated some files and fixed the upload thing and also docs   # too long, vague
WIP                                                            # meaningless
feat: Added Presigned Upload.                                  # capitalized, trailing period
```

## Flow per task

1. Finish the task.
2. Update `docs/TASKS.md` — mark the task `[x]` (or `[~]` if partial).
3. If the task changed how to run/use anything, update `docs/HOW-TO-RUN.md`.
4. If the task changed an API, update `http/<service>.http` (see `api-http-requests`).
5. Stage the specific files changed (including the docs above).
6. Commit with a short conventional message.
7. Pause for review before the next task.
