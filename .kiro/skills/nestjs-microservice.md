---
name: nestjs-microservice
description: Scaffold a NestJS + TypeScript microservice using ports/adapters (hexagonal), zod-validated typed config, and Jest + supertest. Use when creating or extending a Node backend service.
---

# NestJS Microservice

Standard Node backend service: NestJS + TypeScript, hexagonal (ports & adapters), typed
config, and a clear test strategy.

## Principles

- **Ports & adapters.** Every external dependency (storage, queue, search, cache) sits
  behind a `*Port` interface. Adapters implement it (e.g. `MinioStorageAdapter`,
  `S3StorageAdapter`). Local↔cloud swap is a module binding + config change, not a rewrite.
- **Config as typed, validated object.** Parse `process.env` with **zod** into a typed
  config once at startup. Never read `process.env` deep in the code, never hardcode.
- **Module structure:** controller → service (interface + impl) → port → adapter.
- **DTOs validated** with `class-validator` / zod at the boundary.

## Structure

```
apps/<service>/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── config/            # zod schema + typed config provider
│   ├── <feature>/
│   │   ├── <feature>.controller.ts
│   │   ├── <feature>.service.ts        # interface
│   │   ├── <feature>.service.impl.ts
│   │   ├── dto/
│   │   └── ports/                      # StoragePort, QueuePort, ...
│   └── adapters/          # minio.adapter.ts, rabbitmq.adapter.ts, ...
└── test/                  # *.spec.ts (unit), *.e2e-spec.ts (supertest)
```

## Config with zod

```ts
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(8080),
  DATABASE_URL: z.string().url(),
  STORAGE_ENDPOINT: z.string().url(),
  RABBITMQ_URL: z.string(),
});

export type AppConfig = z.infer<typeof schema>;
export const loadConfig = (): AppConfig => schema.parse(process.env);
```

## Port + adapter

```ts
export interface StoragePort {
  presignedPut(key: string): Promise<string>;
  getObjectUrl(key: string): string;
}

// adapters/minio.adapter.ts implements StoragePort
// adapters/s3.adapter.ts   implements StoragePort
// bound in the module by env (local -> minio, aws -> s3)
```

## Testing

- **Unit:** Jest, mock ports. Fast, no infra.
- **Controller/e2e:** supertest against the Nest app.
- **Architecture boundaries:** `dependency-cruiser` rule — services may depend on ports,
  never on adapters directly (the ArchUnit analogue for TS).
- Coverage gate in CI/pre-commit.

## Conventions

- Native `fetch` for outbound HTTP (no axios unless needed).
- Structured logging + OpenTelemetry (see `observability-otel`).
- Idempotent queue consumers (see `messaging-patterns`).
- Internal packages resolve via the org registry (configured in `.npmrc`).
