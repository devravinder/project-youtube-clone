import { createRemoteJWKSet, jwtVerify } from "jose";

export interface TokenVerifier {
  /** The token's subject, or null when it is invalid or expired. */
  verify(token: string): Promise<string | null>;
}

export const TOKEN_VERIFIER = Symbol("TOKEN_VERIFIER");

export class KeycloakTokenVerifier implements TokenVerifier {
  private readonly keys;

  constructor(
    private readonly issuer: string,
    private readonly audience: string,
    jwksUrl = `${issuer}/protocol/openid-connect/certs`,
  ) {
    // Cached; refetched on an unknown key id.
    this.keys = createRemoteJWKSet(new URL(jwksUrl));
  }

  async verify(token: string): Promise<string | null> {
    try {
      const { payload } = await jwtVerify(token, this.keys, {
        issuer: this.issuer,
        audience: this.audience,
      });
      return payload.sub ?? null;
    } catch {
      return null;
    }
  }
}
