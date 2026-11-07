import type { User } from "oidc-client-ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAccessToken, userManager } from "./user-manager";

const userWith = (overrides: Partial<User>) =>
  ({ access_token: "token-abc", expired: false, ...overrides }) as User;

afterEach(() => vi.restoreAllMocks());

describe("getAccessToken", () => {
  it("returns the token of a signed-in user", async () => {
    vi.spyOn(userManager, "getUser").mockResolvedValue(userWith({}));
    expect(await getAccessToken()).toBe("token-abc");
  });

  it("returns nothing when nobody is signed in", async () => {
    vi.spyOn(userManager, "getUser").mockResolvedValue(null);
    expect(await getAccessToken()).toBeUndefined();
  });

  it("never returns an expired token", async () => {
    vi.spyOn(userManager, "getUser").mockResolvedValue(userWith({ expired: true }));
    expect(await getAccessToken()).toBeUndefined();
  });
});

describe("userManager settings", () => {
  it("uses the code flow with the configured client and keeps tokens per tab", () => {
    expect(userManager.settings).toMatchObject({
      authority: "http://localhost:8180/realms/test",
      client_id: "yt-web",
      response_type: "code",
      scope: "openid profile",
      automaticSilentRenew: true,
    });
  });
});
