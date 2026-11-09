// Smoke: one user for 30 s on every read path. Does it work at all? Run before the heavier tests.
//   k6 run tests/load/smoke.ts            (BASE_URL defaults to http://localhost:8090)
import { check, group, sleep } from "k6";
import http from "k6/http";
import type { Options } from "k6/options";
import { API, pick, readyVideoIds, SEARCH, SEARCH_TERMS } from "./lib.ts";

export const options: Options = {
  vus: 1,
  duration: "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
    checks: ["rate>0.99"],
  },
};

export function setup() {
  return { ids: readyVideoIds() };
}

export default function ({ ids }: { ids: string[] }) {
  group("list", () => {
    const res = http.get(`${API}/videos?limit=12`, { tags: { name: "GET /videos" } });
    check(res, { "list 200": (r) => r.status === 200 });
  });
  if (ids.length > 0) {
    group("watch", () => {
      const res = http.get(`${API}/videos/${pick(ids)}`, { tags: { name: "GET /videos/:id" } });
      check(res, {
        "detail 200": (r) => r.status === 200,
        "has playback url": (r) => Boolean(r.json("playbackUrl")),
      });
    });
  }
  group("search", () => {
    const q = pick(SEARCH_TERMS);
    const res = http.get(`${SEARCH}/search?q=${encodeURIComponent(q)}`, {
      tags: { name: "GET /search" },
    });
    check(res, { "search 200": (r) => r.status === 200 });
    const sug = http.get(`${SEARCH}/search/suggest?q=${encodeURIComponent(q.slice(0, 2))}`, {
      tags: { name: "GET /search/suggest" },
    });
    check(sug, { "suggest 200": (r) => r.status === 200 });
  });
  sleep(1);
}
