import { check } from "k6";
import http from "k6/http";

// Through the web nginx (containers or kind), which proxies /api and /search-api like the dev server.
export const BASE_URL = __ENV.BASE_URL ?? "http://localhost:8090";
export const API = `${BASE_URL}/api`;
export const SEARCH = `${BASE_URL}/search-api`;
const KEYCLOAK = __ENV.KEYCLOAK_URL ?? "http://localhost:8180/realms/youtube-clone";

export interface VideoSummary {
  id: string;
  title: string;
  status: string;
}

/** A demo user's access token (password grant on the public web client; local realm only). */
export function login(
  user = __ENV.YT_USER ?? "alice",
  password = __ENV.YT_PASSWORD ?? "alice",
): string {
  const res = http.post(`${KEYCLOAK}/protocol/openid-connect/token`, {
    grant_type: "password",
    client_id: "yt-web",
    username: user,
    password,
    scope: "openid",
  });
  check(res, { "login ok": (r) => r.status === 200 });
  return res.json("access_token") as string;
}

/** Ids of READY videos to read in the test, so reads hit real rows (and the Redis cache). */
export function readyVideoIds(limit = 20): string[] {
  const res = http.get(`${API}/videos?limit=${limit}`);
  const items = (res.json("items") as unknown as VideoSummary[] | undefined) ?? [];
  return items.filter((v) => v.status === "READY").map((v) => v.id);
}

export const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)] as T;

export const SEARCH_TERMS = ["cat", "piano", "park", "music", "how to", "trailer", "dog", "travel"];
