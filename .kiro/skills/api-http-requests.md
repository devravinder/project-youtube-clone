---
name: api-http-requests
description: Keep httpYac request files in the root http/ folder up to date for every API change. Use whenever an endpoint is added, changed, or removed, or when testing APIs manually.
---

# API HTTP Requests (httpYac)

## Rule

Every time an endpoint changes, update its `.http` file in the same task. No API change is
done until its requests and assertions reflect it.

## Layout

- Root `http/` folder, one file per service: `http/<service>.http`.
- `@baseUrl` at the top of each file; the service port comes from its `.env.sample`.
- Machine-specific values go in `http/.env` (git-ignored). Commit only `http/.env.sample`.
- Run all requests: `pnpm dlx httpyac send http/<service>.http --all`.
- VS Code extension: `anweber.vscode-httpyac`.

## What each file covers

- The happy path of every endpoint, with assertions on status and key response fields.
- Every validation rule, each as its own request expecting 400.
- Untrusted-input cases (odd filenames, paths, oversized values).
- Auth cases once Keycloak is in: no token (401), wrong role (403).

## Conventions

- One request per `###` section; the title says what is expected, not just the URL.
- Always assert: `?? status == 201`, then the fields that matter.
- Chain requests with `# @name` and `# @forceRef`. Use `@forceRef`, not `@ref`, when the
  earlier response expires (presigned URLs last 15 minutes).
- Relative file paths in `.env` resolve from the `http/` folder, not the repo root.
- A missing upload file silently sends an empty body and still returns 200; verify the
  stored object size.

## Example

```http
### Reject a missing filename
POST {{baseUrl}}/uploads/presign
Content-Type: application/json

{
  "contentType": "video/mp4"
}

?? status == 400
```

## Verify before committing

Run the file with the CLI against the live service. For endpoints that write data, also
compare database row counts before and after: accepted requests add rows, rejected ones add
none.
