import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import { exportJWK, generateKeyPair, SignJWT, type JWK, type CryptoKey } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testConfig } from "../testing/test-data.js";
import type { AppConfig } from "../config/app.config.js";
import type { AuthUser } from "./auth-user.js";
import { AuthGuard } from "./auth.guard.js";

const KEY_ID = "test-key";
let jwksServer: Server;
let issuer: string;
let privateKey: CryptoKey;
let guard: AuthGuard;

// Minimal Keycloak stand-in that serves the public keys.
beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: KEY_ID, alg: "RS256", use: "sig" };

  jwksServer = createServer((request, response) => {
    if (request.url === "/realms/test/protocol/openid-connect/certs") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise<void>((resolve) => jwksServer.listen(0, "127.0.0.1", resolve));
  issuer = `http://127.0.0.1:${(jwksServer.address() as AddressInfo).port}/realms/test`;
  guard = new AuthGuard({ ...testConfig, OIDC_ISSUER_URL: issuer } as AppConfig);
});

afterAll(() => new Promise<void>((resolve) => jwksServer.close(() => resolve())));

interface TokenOptions {
  readonly issuer?: string;
  readonly audience?: string;
  readonly expiresIn?: string;
  readonly key?: CryptoKey;
}

async function sign(options: TokenOptions = {}) {
  return new SignJWT({ preferred_username: "alice" })
    .setProtectedHeader({ alg: "RS256", kid: KEY_ID })
    .setSubject("user-alice")
    .setIssuer(options.issuer ?? issuer)
    .setAudience(options.audience ?? "yt-api")
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? "5m")
    .sign(options.key ?? privateKey);
}

function contextFor(authorization?: string) {
  const request: { headers: { authorization?: string }; user?: AuthUser } = {
    headers: { authorization },
  };
  const context = { switchToHttp: () => ({ getRequest: () => request }) } as ExecutionContext;
  return { request, context };
}

describe("AuthGuard", () => {
  it("accepts a valid token and exposes the user", async () => {
    const { request, context } = contextFor(`Bearer ${await sign()}`);

    expect(await guard.canActivate(context)).toBe(true);
    expect(request.user).toEqual({ id: "user-alice", username: "alice" });
  });

  it("accepts a lowercase bearer scheme", async () => {
    const { context } = contextFor(`bearer ${await sign()}`);
    expect(await guard.canActivate(context)).toBe(true);
  });

  it.each([
    ["no Authorization header", undefined],
    ["a non-bearer scheme", "Basic dXNlcjpwYXNz"],
    ["a bearer header without a token", "Bearer"],
    ["a malformed token", "Bearer not.a.token"],
  ])("rejects %s", async (_name, header) => {
    const { context } = contextFor(header);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects an expired token", async () => {
    const { context } = contextFor(`Bearer ${await sign({ expiresIn: "-1m" })}`);
    await expect(guard.canActivate(context)).rejects.toThrow("Invalid or expired token");
  });

  it("rejects a token meant for another audience", async () => {
    const { context } = contextFor(`Bearer ${await sign({ audience: "other-api" })}`);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a token from another issuer", async () => {
    const { context } = contextFor(
      `Bearer ${await sign({ issuer: "http://evil.example/realms/test" })}`,
    );
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a token signed with a key the realm does not publish", async () => {
    const attacker = await generateKeyPair("RS256");
    const { context } = contextFor(`Bearer ${await sign({ key: attacker.privateKey })}`);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
