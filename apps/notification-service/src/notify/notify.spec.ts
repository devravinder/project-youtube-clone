import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { INestApplication } from "@nestjs/common";
import { WsAdapter } from "@nestjs/platform-ws";
import { Test } from "@nestjs/testing";
import { type ServerMessage, serverMessageSchema, type VideoReadyEvent } from "@yt/contracts";
import { WebSocket } from "ws";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ClientHub, type Socket } from "./client-hub.js";
import { NotificationsGateway } from "./notifications.gateway.js";
import { Notifier } from "./notifier.js";
import { TOKEN_VERIFIER, type TokenVerifier } from "./token-verifier.js";

class FakeSocket implements Socket {
  readyState = 1;
  readonly sent: ServerMessage[] = [];
  pings = 0;
  terminated = false;
  send(data: string) {
    this.sent.push(serverMessageSchema.parse(JSON.parse(data)));
  }
  ping() {
    this.pings++;
  }
  terminate() {
    this.terminated = true;
  }
}

const NOW = Date.parse("2026-11-09T10:00:00.000Z");

const ready = (overrides: Partial<VideoReadyEvent> = {}): VideoReadyEvent => ({
  eventId: randomUUID(),
  type: "video.ready",
  version: 1,
  occurredAt: new Date(NOW - 1000).toISOString(),
  video: {
    id: randomUUID(),
    title: "Cats",
    description: null,
    ownerId: "alice",
    renditions: ["360p"],
    createdAt: new Date(NOW - 60_000).toISOString(),
  },
  ...overrides,
});

describe("ClientHub", () => {
  let hub: ClientHub;
  let alice: FakeSocket;
  let bob: FakeSocket;
  let anon: FakeSocket;

  beforeEach(() => {
    hub = new ClientHub();
    [alice, bob, anon] = [new FakeSocket(), new FakeSocket(), new FakeSocket()];
    for (const s of [alice, bob, anon]) hub.add(s);
    hub.identify(alice, "alice");
    hub.identify(bob, "bob");
  });

  const msg: ServerMessage = {
    event: "video.published",
    data: { videoId: randomUUID(), title: "t" },
  };

  it("broadcasts to everyone except one user, and targets one user", () => {
    expect(hub.broadcast(msg, "alice")).toBe(2);
    expect([alice.sent.length, bob.sent.length, anon.sent.length]).toEqual([0, 1, 1]);

    expect(hub.sendToUser("alice", msg)).toBe(1);
    expect(alice.sent).toEqual([msg]);
  });

  it("skips sockets that are not open", () => {
    bob.readyState = 3;
    expect(hub.broadcast(msg)).toBe(2);
    hub.send(bob, msg);
    expect(bob.sent).toHaveLength(0);
  });

  it("pings every socket, then drops the ones that never answered", () => {
    hub.heartbeat();
    expect([alice.pings, bob.pings, anon.pings]).toEqual([1, 1, 1]);

    hub.markAlive(alice);
    hub.heartbeat();
    expect(alice.terminated).toBe(false);
    expect(bob.terminated && anon.terminated).toBe(true);
    expect(hub.size).toBe(1);
  });
});

describe("Notifier", () => {
  let hub: ClientHub;
  let notifier: Notifier;
  let owner: FakeSocket;
  let other: FakeSocket;

  beforeEach(() => {
    hub = new ClientHub();
    owner = new FakeSocket();
    other = new FakeSocket();
    hub.add(owner);
    hub.add(other);
    hub.identify(owner, "alice");
    notifier = new Notifier(hub, 600_000, () => NOW);
  });

  it("tells the owner their video is ready and everyone else it was published", () => {
    const e = ready();

    expect(notifier.handle(JSON.stringify(e), "video.ready")).toEqual({
      kind: "delivered",
      published: 1,
      owner: 1,
    });
    const data = { videoId: e.video.id, title: "Cats" };
    expect(owner.sent).toEqual([{ event: "video.ready", data }]);
    expect(other.sent).toEqual([{ event: "video.published", data }]);
  });

  it("broadcasts to all when the video has no owner", () => {
    const e = ready();
    e.video.ownerId = null;

    expect(notifier.handle(JSON.stringify(e), undefined)).toMatchObject({ published: 2, owner: 0 });
  });

  it("delivers a duplicate event (same eventId) only once", () => {
    const value = JSON.stringify(ready());
    notifier.handle(value, "video.ready");

    expect(notifier.handle(value, "video.ready")).toEqual({ kind: "ignored", reason: "duplicate" });
    expect(other.sent).toHaveLength(1);
  });

  it("drops events older than the max age", () => {
    const old = ready({ occurredAt: new Date(NOW - 601_000).toISOString() });

    expect(notifier.handle(JSON.stringify(old), "video.ready")).toEqual({
      kind: "ignored",
      reason: "too old",
    });
    expect(other.sent).toHaveLength(0);
  });

  it("ignores other types, non-JSON and invalid events", () => {
    expect(notifier.handle("{}", "video.deleted").kind).toBe("ignored");
    expect(notifier.handle("{nope", "video.ready")).toMatchObject({ reason: "value is not JSON" });
    expect(notifier.handle("{}", "video.ready")).toMatchObject({ reason: "invalid event" });
  });

  it("remembers the last 1000 event ids, forgetting the oldest", () => {
    const first = JSON.stringify(ready());
    notifier.handle(first, "video.ready");
    for (let i = 0; i < 1000; i++) notifier.handle(JSON.stringify(ready()), "video.ready");

    expect(notifier.handle(first, "video.ready").kind).toBe("delivered");
  });
});

describe("NotificationsGateway over a real WebSocket", () => {
  let app: INestApplication;
  let hub: ClientHub;
  let url: string;
  const verifier: TokenVerifier = {
    verify: async (token) => (token === "good-token" ? "alice" : null),
  };

  beforeAll(async () => {
    hub = new ClientHub();
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsGateway,
        { provide: ClientHub, useValue: hub },
        { provide: TOKEN_VERIFIER, useValue: verifier },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useWebSocketAdapter(new WsAdapter(app));
    await app.listen(0);
    url = `ws://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/ws`;
  });
  afterAll(() => app.close());

  const connect = async () => {
    const ws = new WebSocket(url);
    const messages: ServerMessage[] = [];
    ws.on("message", (raw) => messages.push(serverMessageSchema.parse(JSON.parse(String(raw)))));
    await new Promise((resolve, reject) => ws.once("open", resolve).once("error", reject));
    const next = async (count: number) => {
      for (let i = 0; i < 50 && messages.length < count; i++)
        await new Promise((r) => setTimeout(r, 10));
      return messages;
    };
    return { ws, messages, next };
  };

  it("identifies a socket with a valid token and routes personal messages to it", async () => {
    const { ws, next } = await connect();
    ws.send(JSON.stringify({ event: "auth", data: { token: "good-token" } }));

    expect((await next(1))[0]).toEqual({ event: "auth", data: { ok: true, userId: "alice" } });
    const msg: ServerMessage = {
      event: "video.ready",
      data: { videoId: randomUUID(), title: "t" },
    };
    expect(hub.sendToUser("alice", msg)).toBe(1);
    expect((await next(2))[1]).toEqual(msg);
    ws.close();
  });

  it("keeps a socket anonymous on a bad or malformed token", async () => {
    const { ws, next } = await connect();
    ws.send(JSON.stringify({ event: "auth", data: { token: "forged" } }));
    ws.send(JSON.stringify({ event: "auth", data: {} }));

    expect(await next(2)).toEqual([
      { event: "auth", data: { ok: false, userId: null } },
      { event: "auth", data: { ok: false, userId: null } },
    ]);
    ws.close();
  });

  it("forgets a socket once it disconnects", async () => {
    const settle = async (size: number) => {
      for (let i = 0; i < 100 && hub.size !== size; i++)
        await new Promise((r) => setTimeout(r, 10));
      return hub.size;
    };
    expect(await settle(0)).toBe(0);
    const { ws } = await connect();
    expect(await settle(1)).toBe(1);

    ws.close();
    expect(await settle(0)).toBe(0);
  });
});
