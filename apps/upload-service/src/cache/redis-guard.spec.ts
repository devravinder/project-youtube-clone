import { describe, expect, it } from "vitest";
import {
  type Redis,
  RedisGuard,
  RedisTimeoutError,
  RedisUnavailableError,
} from "./redis.client.js";

const fakeRedis = (isReady = true) => ({ isReady }) as unknown as Redis;

describe("RedisGuard", () => {
  it("passes results through when Redis answers", async () => {
    const guard = new RedisGuard(fakeRedis(), 50, 1000);

    expect(await guard.run(async () => "ok")).toBe("ok");
  });

  it("times out a hung command, then skips Redis for the cool-down", async () => {
    let now = 0;
    const guard = new RedisGuard(fakeRedis(), 20, 1000, () => now);
    let sent = 0;
    const hang = () => {
      sent++;
      return new Promise<never>(() => undefined);
    };

    await expect(guard.run(hang)).rejects.toBeInstanceOf(RedisTimeoutError);
    // Inside the cool-down nothing is sent at all, so it is "unavailable", not "maybe applied".
    await expect(guard.run(hang)).rejects.toBeInstanceOf(RedisUnavailableError);
    expect(sent).toBe(1);

    now = 1001;
    expect(await guard.run(async () => "back")).toBe("back");
  });

  it("opens on any command error too", async () => {
    let now = 0;
    const guard = new RedisGuard(fakeRedis(), 50, 1000, () => now);

    await expect(guard.run(() => Promise.reject(new Error("WRONGTYPE")))).rejects.toThrow(
      "WRONGTYPE",
    );
    await expect(guard.run(async () => 1)).rejects.toBeInstanceOf(RedisUnavailableError);
    now = 2000;
    expect(await guard.run(async () => 1)).toBe(1);
  });

  it("does not send anything while disconnected", async () => {
    let sent = false;
    const guard = new RedisGuard(fakeRedis(false));

    await expect(
      guard.run(async () => {
        sent = true;
      }),
    ).rejects.toBeInstanceOf(RedisUnavailableError);
    expect(sent).toBe(false);
  });
});
