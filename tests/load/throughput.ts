// Throughput: real uploads through the whole pipeline. Measures time-to-READY while the transcode queue
// fills, to watch queue depth, retries and (with KEDA) transcoder replicas grow.
//   k6 run tests/load/throughput.ts -e VIDEO=tmp/sample.mp4 -e UPLOADS=30
import { check, fail, sleep } from "k6";
import http from "k6/http";
import { Counter, Trend } from "k6/metrics";
import type { Options } from "k6/options";
import { API, login } from "./lib.ts";

// open() only works in the init stage; every VU gets the same bytes.
const VIDEO = open(__ENV.VIDEO ?? "../../tmp/sample.mp4", "b");
const UPLOADS = Number(__ENV.UPLOADS ?? 20);
const READY_TIMEOUT_S = Number(__ENV.READY_TIMEOUT_S ?? 600);

const timeToReady = new Trend("time_to_ready", true);
const uploadTime = new Trend("upload_time", true);
const failed = new Counter("videos_failed");

export const options: Options = {
  scenarios: {
    uploads: {
      // Each of UPLOADS iterations is one video; 5 uploading at once fills the queue faster than
      // one transcoder can drain it.
      executor: "shared-iterations",
      vus: Number(__ENV.CONCURRENCY ?? 5),
      iterations: UPLOADS,
      maxDuration: "30m",
    },
  },
  thresholds: {
    videos_failed: ["count==0"],
    time_to_ready: [`p(95)<${READY_TIMEOUT_S * 1000}`],
  },
};

export function setup() {
  return { token: login() };
}

export default function ({ token }: { token: string }) {
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const started = Date.now();

  const presign = http.post(
    `${API}/uploads/presign`,
    JSON.stringify({
      filename: "k6.mp4",
      contentType: "video/mp4",
      title: `k6 load ${__VU}-${__ITER}`,
    }),
    { headers: auth, tags: { name: "POST /uploads/presign" } },
  );
  if (!check(presign, { "presign 201": (r) => r.status === 201 }))
    fail(`presign ${presign.status}`);
  const videoId = presign.json("videoId") as string;
  const uploadUrl = presign.json("uploadUrl") as string;

  // Straight to storage, as the browser does; the URL is signed for STORAGE_PUBLIC_ENDPOINT.
  const put = http.put(uploadUrl, VIDEO, {
    headers: { "Content-Type": "video/mp4" },
    tags: { name: "PUT storage" },
  });
  check(put, { "upload 200": (r) => r.status === 200 });
  const done = http.post(`${API}/uploads/${videoId}/complete`, null, {
    headers: auth,
    tags: { name: "POST /uploads/:id/complete" },
  });
  check(done, { "complete 201": (r) => r.status === 201 });
  uploadTime.add(Date.now() - started);

  // Poll like the web app (every 2 s) until the transcoder reports back.
  for (let waited = 0; waited < READY_TIMEOUT_S; waited += 2) {
    const status = http
      .get(`${API}/videos/${videoId}`, { tags: { name: "GET /videos/:id (poll)" } })
      .json("status");
    if (status === "READY") {
      timeToReady.add(Date.now() - started);
      return;
    }
    if (status === "FAILED") break;
    sleep(2);
  }
  failed.add(1);
}
