import { UserManager, WebStorageStateStore } from "oidc-client-ts";
import { config } from "../config";

export const userManager = new UserManager({
  authority: config.oidcAuthority,
  client_id: config.oidcClientId,
  redirect_uri: window.location.origin,
  post_logout_redirect_uri: window.location.origin,
  response_type: "code",
  scope: "openid profile",
  automaticSilentRenew: true,
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
});

export async function getAccessToken(): Promise<string | undefined> {
  const user = await userManager.getUser();
  return user && !user.expired ? user.access_token : undefined;
}
