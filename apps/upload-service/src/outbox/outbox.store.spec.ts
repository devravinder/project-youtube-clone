import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../generated/prisma/client.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { PrismaOutboxStore } from "./outbox.store.js";

// Real Postgres (compose); skipped when it is not reachable. A unique type keeps
// these rows invisible to a relay running in a dev server.
const URL = process.env.DATABASE_URL ?? "postgresql://yt:yt_password@localhost:5432/youtube_clone";
const TYPE = `test.${randomUUID()}`;

let prisma: PrismaClient | null = null;

beforeAll(async () => {
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL }) });
  try {
    await client.$queryRawUnsafe("SELECT 1 FROM outbox LIMIT 1");
    prisma = client;
  } catch {
    await client.$disconnect();
  }
});

afterAll(async () => {
  await prisma?.outboxMessage.deleteMany({ where: { type: TYPE } });
  await prisma?.$disconnect();
});

const add = (
  data: { nextAttemptAt?: Date; lockedUntil?: Date; sentAt?: Date; createdAt?: Date } = {},
) =>
  prisma!.outboxMessage.create({
    data: { id: randomUUID(), type: TYPE, payload: { n: 1 }, ...data },
  });

describe("PrismaOutboxStore (Postgres)", () => {
  const store = () => new PrismaOutboxStore(prisma as unknown as PrismaService);

  it("claims due rows once, in creation order, and leases them", async (ctx) => {
    if (!prisma) ctx.skip();
    const second = await add({ createdAt: new Date(Date.now() - 1000) });
    const first = await add({ createdAt: new Date(Date.now() - 2000) });
    await add({ nextAttemptAt: new Date(Date.now() + 60_000) });
    await add({ sentAt: new Date() });

    const claimed = await store().claimDue([TYPE], 10, 30);
    expect(claimed.map((m) => m.id)).toEqual([first.id, second.id]);
    expect(claimed[0]).toMatchObject({ type: TYPE, payload: { n: 1 }, attempts: 0 });

    // Leased now, so a second relay gets nothing.
    expect(await store().claimDue([TYPE], 10, 30)).toEqual([]);
    expect(await store().claimDue(["other.type"], 10, 30)).toEqual([]);
  });

  it("gives concurrent relays disjoint rows", async (ctx) => {
    if (!prisma) ctx.skip();
    await prisma!.outboxMessage.deleteMany({ where: { type: TYPE } });
    for (let i = 0; i < 20; i++) await add();

    const [a, b] = await Promise.all([
      store().claimDue([TYPE], 10, 30),
      store().claimDue([TYPE], 10, 30),
    ]);
    const ids = [...a, ...b].map((m) => m.id);
    expect(ids).toHaveLength(20);
    expect(new Set(ids).size).toBe(20);
  });

  it("makes a row due again once its lease expires", async (ctx) => {
    if (!prisma) ctx.skip();
    await prisma!.outboxMessage.deleteMany({ where: { type: TYPE } });
    const row = await add({ lockedUntil: new Date(Date.now() - 1000) });

    expect((await store().claimDue([TYPE], 10, 30)).map((m) => m.id)).toEqual([row.id]);
  });

  it("marks sent, records failures with a next attempt, and purges old sent rows", async (ctx) => {
    if (!prisma) ctx.skip();
    await prisma!.outboxMessage.deleteMany({ where: { type: TYPE } });
    const ok = await add();
    const bad = await add();
    await store().claimDue([TYPE], 10, 30);

    await store().markSent(ok.id);
    const next = new Date(Date.now() + 60_000);
    await store().markFailed(bad.id, "x".repeat(2000), next);

    const sent = await prisma!.outboxMessage.findUniqueOrThrow({ where: { id: ok.id } });
    expect(sent.sentAt).not.toBeNull();
    expect(sent.lockedUntil).toBeNull();
    const failed = await prisma!.outboxMessage.findUniqueOrThrow({ where: { id: bad.id } });
    expect(failed).toMatchObject({ attempts: 1, lockedUntil: null, sentAt: null });
    expect(failed.lastError).toHaveLength(1000);
    expect(failed.nextAttemptAt.getTime()).toBe(next.getTime());
    // Not due until next, even though its lease was cleared.
    expect(await store().claimDue([TYPE], 10, 30)).toEqual([]);

    expect(await store().deleteSentBefore(new Date(Date.now() + 1000))).toBeGreaterThanOrEqual(1);
    expect(await prisma!.outboxMessage.findUnique({ where: { id: ok.id } })).toBeNull();
  });
});
