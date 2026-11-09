// Builds the app images: node scripts/build-images.mjs [service ...]   (default: all)
// Works on Windows and Linux. The npm registry login (~/.npmrc) and its CA file are passed as
// BuildKit secrets, so they are used during the build but never stored in an image layer.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const TAG = process.env.IMAGE_TAG ?? "local";

export const IMAGES = {
  "upload-service": {
    file: "infra/docker/node-service.Dockerfile",
    args: { SERVICE: "upload-service" },
  },
  "search-service": {
    file: "infra/docker/node-service.Dockerfile",
    args: { SERVICE: "search-service" },
  },
  "notification-service": {
    file: "infra/docker/node-service.Dockerfile",
    args: { SERVICE: "notification-service" },
  },
  "transcoder-service": { file: "infra/docker/transcoder.Dockerfile", args: {} },
  web: { file: "infra/docker/web.Dockerfile", args: {} },
};

export const imageName = (name) => `yt/${name}:${TAG}`;

function secretArgs() {
  const npmrc = process.env.NPM_CONFIG_USERCONFIG ?? join(homedir(), ".npmrc");
  if (!existsSync(npmrc)) return [];
  const args = ["--secret", `id=npmrc,src=${npmrc}`];
  // A host path in .npmrc means nothing inside Linux, so the file itself goes in as a secret.
  const cafile = readFileSync(npmrc, "utf8").match(/^\s*cafile\s*=\s*(.+?)\s*$/m)?.[1];
  if (cafile && existsSync(cafile)) args.push("--secret", `id=npm_ca,src=${cafile}`);
  return args;
}

const wanted = process.argv.slice(2);
const names = wanted.length > 0 ? wanted : Object.keys(IMAGES);
const unknown = names.filter((n) => !IMAGES[n]);
if (unknown.length > 0) {
  console.error(
    `Unknown image(s): ${unknown.join(", ")}. Known: ${Object.keys(IMAGES).join(", ")}`,
  );
  process.exit(1);
}

const secrets = secretArgs();
for (const name of names) {
  const { file, args } = IMAGES[name];
  const buildArgs = Object.entries(args).flatMap(([k, v]) => ["--build-arg", `${k}=${v}`]);
  console.log(`\n=== ${imageName(name)}`);
  const result = spawnSync(
    "docker",
    ["build", "-f", file, "-t", imageName(name), ...buildArgs, ...secrets, "."],
    { stdio: "inherit", env: { ...process.env, DOCKER_BUILDKIT: "1" } },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
