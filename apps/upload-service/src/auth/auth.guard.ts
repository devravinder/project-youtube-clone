import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { APP_CONFIG, type AppConfig } from "../config/app.config.js";
import type { AuthUser } from "./auth-user.js";

interface AuthenticatedRequest {
  headers: { authorization?: string };
  user?: AuthUser;
}

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly keys;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    // Cached; refetched on an unknown key id.
    this.keys = createRemoteJWKSet(
      new URL(`${config.OIDC_ISSUER_URL}/protocol/openid-connect/certs`),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException("Missing bearer token");
    }

    try {
      const { payload } = await jwtVerify(token, this.keys, {
        issuer: this.config.OIDC_ISSUER_URL,
        audience: this.config.OIDC_AUDIENCE,
      });
      request.user = {
        id: payload.sub ?? "",
        username: String(payload["preferred_username"] ?? ""),
      };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}

function bearerToken(header: string | undefined): string | null {
  const [scheme, token] = header?.split(" ") ?? [];
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}
