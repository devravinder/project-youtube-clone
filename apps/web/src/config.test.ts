import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("config", () => {
  it("reads the three settings from the environment", async () => {
    const { config } = await import("./config");

    expect(config).toEqual({
      apiBaseUrl: "/api",
      oidcAuthority: "http://localhost:8180/realms/test",
      oidcClientId: "yt-web",
    });
  });

  it.each(["VITE_API_BASE_URL", "VITE_OIDC_AUTHORITY", "VITE_OIDC_CLIENT_ID"])(
    "fails loudly when %s is missing",
    async (name) => {
      vi.stubEnv(name, "");
      vi.resetModules();

      await expect(import("./config")).rejects.toThrow(`Missing ${name}`);
    },
  );
});
