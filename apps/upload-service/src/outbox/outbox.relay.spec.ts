import { beforeEach, describe, expect, it } from "vitest";
import { FakeTranscodeQueue } from "../testing/fake-transcode-queue.js";
import { testConfig } from "../testing/test-data.js";
import { backoffMs, OutboxRelay } from "./outbox.relay.js";
import type { ClaimedMessage, OutboxStore } from "./outbox.store.js";

interface StoredRow extends ClaimedMessage {
  sentAt: Date | null;
  nextAttemptAt: Date;
  lastError: string | null;
  leased: boolean;
}

class FakeOutboxStore implements OutboxStore {
  readonly rows: StoredRow[] = [];
  claims: { types: string[]; limit: number }[] = [];
  failClaimWith: Error | null = null;

  add(id: string, type = "transcode.command.v1", payload: unknown = { videoId: id }) {
    this.rows.push({
      id,
      type,
      payload,
      attempts: 0,
      sentAt: null,
      nextAttemptAt: new Date(0),
      lastError: null,
      leased: false,
    });
  }

  async claimDue(types: string[], limit: number): Promise<ClaimedMessage[]> {
    this.claims.push({ types, limit });
    if (this.failClaimWith) throw this.failClaimWith;
    const due = this.rows
      .filter(
        (r) => !r.sentAt && !r.leased && types.includes(r.type) && r.nextAttemptAt <= new Date(),
      )
      .slice(0, limit);
    due.forEach((r) => (r.leased = true));
    return due.map(({ id, type, payload, attempts }) => ({ id, type, payload, attempts }));
  }

  async markSent(id: string) {
    const row = this.find(id);
    row.sentAt = new Date();
    row.leased = false;
  }

  async markFailed(id: string, error: string, nextAttemptAt: Date) {
    const row = this.find(id);
    row.attempts += 1;
    row.lastError = error;
    row.nextAttemptAt = nextAttemptAt;
    row.leased = false;
  }

  async deleteSentBefore(cutoff: Date) {
    const before = this.rows.length;
    for (let i = this.rows.length - 1; i >= 0; i--) {
      const sentAt = this.rows[i]?.sentAt;
      if (sentAt && sentAt < cutoff) this.rows.splice(i, 1);
    }
    return before - this.rows.length;
  }

  find(id: string): StoredRow {
    const row = this.rows.find((r) => r.id === id);
    if (!row) throw new Error(`no row ${id}`);
    return row;
  }
}

let store: FakeOutboxStore;
let queue: FakeTranscodeQueue;
let relay: OutboxRelay;

beforeEach(() => {
  store = new FakeOutboxStore();
  queue = new FakeTranscodeQueue();
  relay = new OutboxRelay(store, queue, testConfig);
});

describe("OutboxRelay", () => {
  it("publishes due commands in order and marks them sent", async () => {
    store.add("m1");
    store.add("m2");

    expect(await relay.drain()).toBe(2);

    expect(queue.commands.map((c) => (c as unknown as { videoId: string }).videoId)).toEqual([
      "m1",
      "m2",
    ]);
    expect(store.rows.every((r) => r.sentAt)).toBe(true);
  });

  it("only claims message types it can publish", async () => {
    await relay.drain();

    expect(store.claims[0]).toEqual({ types: ["transcode.command.v1"], limit: 50 });
  });

  it("drains more than one batch in a single run", async () => {
    for (let i = 0; i < 120; i++) store.add(`m${i}`);

    expect(await relay.drain()).toBe(120);
    expect(store.claims.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps a command and schedules a retry with backoff when the broker is down", async () => {
    store.add("m1");
    queue.failWith = new Error("connection refused");
    const before = Date.now();

    expect(await relay.drain()).toBe(0);

    const row = store.find("m1");
    expect(row.sentAt).toBeNull();
    expect(row.attempts).toBe(1);
    expect(row.lastError).toBe("connection refused");
    expect(row.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + 1000);

    // Not due yet, so a second tick does nothing.
    queue.failWith = null;
    expect(await relay.drain()).toBe(0);

    row.nextAttemptAt = new Date(0);
    expect(await relay.drain()).toBe(1);
    expect(row.sentAt).not.toBeNull();
  });

  it("does not lose the rest of a batch when one publish fails", async () => {
    store.add("m1");
    store.add("m2");
    let calls = 0;
    const original = queue.requestTranscode.bind(queue);
    queue.requestTranscode = async (command) => {
      calls += 1;
      if (calls === 1) throw new Error("nack");
      return original(command);
    };

    expect(await relay.drain()).toBe(1);
    expect(store.find("m1").sentAt).toBeNull();
    expect(store.find("m2").sentAt).not.toBeNull();
  });

  it("survives a database error and tries again on the next tick", async () => {
    store.add("m1");
    store.failClaimWith = new Error("db down");
    expect(await relay.drain()).toBe(0);

    store.failClaimWith = null;
    expect(await relay.drain()).toBe(1);
  });

  it("shares a run in progress instead of starting a second one", async () => {
    store.add("m1");
    const [a, b] = await Promise.all([relay.drain(), relay.drain()]);

    expect(a + b).toBe(2);
    expect(queue.commands).toHaveLength(1);
  });

  it("purges sent rows older than the retention", async () => {
    store.add("old");
    store.add("recent");
    store.add("unsent");
    store.find("old").sentAt = new Date(Date.now() - 73 * 3_600_000);
    store.find("recent").sentAt = new Date();

    expect(await relay.purgeSent()).toBe(1);
    expect(store.rows.map((r) => r.id)).toEqual(["recent", "unsent"]);
  });

  it("starts polling on bootstrap and stops on shutdown", async () => {
    store.add("m1");
    relay = new OutboxRelay(store, queue, { ...testConfig, OUTBOX_POLL_INTERVAL_MS: 20 });

    relay.onApplicationBootstrap();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await relay.beforeApplicationShutdown();
    const claims = store.claims.length;
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(store.find("m1").sentAt).not.toBeNull();
    expect(store.claims.length).toBe(claims);
  });
});

describe("backoffMs", () => {
  it("doubles from one second and caps at five minutes", () => {
    expect([0, 1, 2, 3].map(backoffMs)).toEqual([1000, 2000, 4000, 8000]);
    expect(backoffMs(20)).toBe(300_000);
  });
});
