// CPU: a rising, open-model request rate on the hot read paths, to push the upload- and search-service
// pods past their CPU target and watch the HPA add replicas (kubectl get hpa -w).
//   k6 run tests/load/cpu.ts -e PEAK_RPS=300
// Open model (arrival rate): requests keep coming even when responses slow down, like real users.
import { check } from "k6";
import http from "k6/http";
import type { Options } from "k6/options";
import { API, pick, readyVideoIds, SEARCH, SEARCH_TERMS } from "./lib.ts";

const PEAK = Number(__ENV.PEAK_RPS ?? 200);

export const options: Options = {
  scenarios: {
    reads: {
      executor: "ramping-arrival-rate",
      startRate: 10,
      timeUnit: "1s",
      preAllocatedVUs: 50,
      maxVUs: 400,
      stages: [
        { target: PEAK, duration: "2m" }, // ramp: the HPA needs time to see the trend
        { target: PEAK, duration: "5m" }, // hold: replicas are added, latency should recover
        { target: 0, duration: "1m" }, // drop: scale-down waits the 300 s stabilisation window
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.02"],
    "http_req_duration{name:GET /videos/:id}": ["p(95)<800"],
    dropped_iterations: ["count<100"],
  },
};

export function setup() {
  const ids = readyVideoIds(50);
  if (ids.length === 0) throw new Error("No READY videos to read; upload a few first.");
  return { ids };
}

export default function ({ ids }: { ids: string[] }) {
  // Mostly detail reads (Redis cache-aside), some searches (Elasticsearch), and view counts (Redis Lua).
  const roll = Math.random();
  if (roll < 0.6) {
    const res = http.get(`${API}/videos/${pick(ids)}`, { tags: { name: "GET /videos/:id" } });
    check(res, { "detail 200": (r) => r.status === 200 });
  } else if (roll < 0.9) {
    const res = http.get(`${SEARCH}/search?q=${encodeURIComponent(pick(SEARCH_TERMS))}`, {
      tags: { name: "GET /search" },
    });
    check(res, { "search 200": (r) => r.status === 200 });
  } else {
    // A fresh viewer key per request (user agent), so every view counts and the flusher has work.
    const res = http.post(`${API}/videos/${pick(ids)}/views`, null, {
      headers: { "User-Agent": `k6-viewer-${__VU}-${__ITER}` },
      tags: { name: "POST /videos/:id/views" },
    });
    check(res, { "view 202": (r) => r.status === 202 });
  }
}
