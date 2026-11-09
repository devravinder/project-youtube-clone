// Checks the Helm chart without a cluster: dependency build, strict lint, render, and the rules a
// cluster would only reveal at deploy time. Usage: node scripts/check-helm.mjs   (pnpm k8s:check)
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { parseAllDocuments } from "yaml";

const CHART = "infra/helm/youtube-clone";
const SERVICES = [
  "upload-service",
  "transcoder-service",
  "search-service",
  "notification-service",
  "web",
];
const helm = process.env.HELM ?? "helm";
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  [${detail}]` : ""}`);
};

function run(args) {
  const r = spawnSync(helm, args, { encoding: "utf8" });
  if (r.error) {
    console.error(`Cannot run ${helm}: ${r.error.message}. Install Helm or set HELM to its path.`);
    process.exit(2);
  }
  return r;
}

const render = (...set) => {
  const r = run([
    "template",
    "yt",
    CHART,
    "--namespace",
    "mini-youtube",
    ...set.flatMap((s) => ["--set", s]),
  ]);
  if (r.status !== 0) throw new Error(r.stderr);
  return parseAllDocuments(r.stdout)
    .map((d) => d.toJS())
    .filter(Boolean);
};

for (const dir of readdirSync(join(CHART, "charts"))) {
  const r = run(["dependency", "build", join(CHART, "charts", dir)]);
  if (r.status !== 0) check(`dependency build ${dir}`, false, r.stderr.trim());
}
const lint = run(["lint", CHART, "--strict"]);
check("helm lint --strict", lint.status === 0, lint.status === 0 ? "" : lint.stdout + lint.stderr);

const docs = render();
const of = (kind) => docs.filter((d) => d.kind === kind);
const byName = (kind, name) => of(kind).find((d) => d.metadata.name === name);

check(
  "one Deployment, Service, ConfigMap and Secret per service, named as the apps expect",
  SERVICES.every((s) =>
    ["Deployment", "Service", "ConfigMap", "Secret"].every((k) => byName(k, s)),
  ),
  `${of("Deployment").length} deployments`,
);

for (const dep of of("Deployment")) {
  const name = dep.metadata.name;
  const pod = dep.spec.template;
  const c = pod.spec.containers[0];
  const svc = byName("Service", name);
  check(
    `${name}: Service selects the pods`,
    Object.entries(svc.spec.selector).every(([k, v]) => pod.metadata.labels[k] === v),
  );
  check(
    `${name}: envFrom points at its ConfigMap and Secret`,
    c.envFrom.every(
      (e) =>
        (e.configMapRef && byName("ConfigMap", e.configMapRef.name)) ||
        (e.secretRef && byName("Secret", e.secretRef.name)),
    ),
  );
  check(
    `${name}: startup, readiness and liveness probes`,
    Boolean(c.startupProbe && c.readinessProbe && c.livenessProbe),
    c.readinessProbe?.httpGet?.path,
  );
  check(
    `${name}: CPU and memory requests (HPA needs them), a memory limit`,
    Boolean(
      c.resources?.requests?.cpu && c.resources?.requests?.memory && c.resources?.limits?.memory,
    ),
  );
  check(
    `${name}: no privilege escalation, all capabilities dropped`,
    c.securityContext?.allowPrivilegeEscalation === false &&
      c.securityContext?.capabilities?.drop?.includes("ALL"),
  );
  const hpa = of("HorizontalPodAutoscaler").find((h) => h.spec.scaleTargetRef.name === name);
  check(
    `${name}: replicas left to the HPA when there is one`,
    hpa ? dep.spec.replicas === undefined : dep.spec.replicas >= 1,
    hpa ? `HPA ${hpa.spec.minReplicas}-${hpa.spec.maxReplicas}` : `replicas ${dep.spec.replicas}`,
  );
}

for (const hpa of of("HorizontalPodAutoscaler")) {
  const metrics = hpa.spec.metrics.map(
    (m) => `${m.resource.name}@${m.resource.target.averageUtilization}%`,
  );
  check(
    `HPA ${hpa.metadata.name}: targets an existing Deployment on CPU/memory`,
    Boolean(byName("Deployment", hpa.spec.scaleTargetRef.name)) && metrics.length > 0,
    metrics.join(","),
  );
}

const web = byName("Service", "web");
check(
  "web is reachable on node port 30090 (kind maps it to localhost:8090)",
  web.spec.type === "NodePort" && web.spec.ports[0].nodePort === 30090,
);
const urls = byName("ConfigMap", "web").data;
check(
  "web proxies to the Service names",
  ["UPLOAD_SERVICE_URL", "SEARCH_SERVICE_URL", "NOTIFICATION_SERVICE_URL"].every((k) =>
    byName("Service", new URL(urls[k]).hostname),
  ),
);

const job = byName("Job", "upload-service-migrate");
check(
  "migrations run as a pre-install/pre-upgrade hook",
  job?.metadata.annotations["helm.sh/hook"] === "pre-install,pre-upgrade",
  job?.spec.template.spec.containers[0].command.join(" "),
);
check(
  "secrets are in Secrets, not ConfigMaps",
  of("ConfigMap").every(
    (cm) =>
      !Object.keys(cm.data ?? {}).some((k) => /PASSWORD|SECRET|DATABASE_URL|RABBITMQ_URL/.test(k)),
  ),
);
check(
  "a global setting reaches every service",
  of("ConfigMap").every((cm) => cm.data.KAFKA_BROKERS === "kafka:9092"),
);

const retag = render("global.imageRegistry=registry.example:5000", "global.imageTag=1.2.3");
check(
  "global.imageRegistry and imageTag retarget every image",
  retag
    .filter((d) => d.kind === "Deployment")
    .every(
      (d) =>
        d.spec.template.spec.containers[0].image.startsWith("registry.example:5000/yt/") &&
        d.spec.template.spec.containers[0].image.endsWith(":1.2.3"),
    ),
);

const queue = render("transcoder-service.queueScaling.enabled=true");
const so = queue.find((d) => d.kind === "ScaledObject");
check(
  "queue scaling: KEDA ScaledObject on the transcode queue",
  so?.spec.triggers[0].metadata.queueName === "transcoder.transcode-video",
  `max ${so?.spec.maxReplicaCount}`,
);
check(
  "queue scaling: the CPU HPA steps aside (no two autoscalers)",
  !queue.some(
    (d) =>
      d.kind === "HorizontalPodAutoscaler" && d.spec.scaleTargetRef.name === "transcoder-service",
  ),
);
check(
  "queue scaling: Deployment leaves replicas to KEDA",
  queue.find((d) => d.kind === "Deployment" && d.metadata.name === "transcoder-service").spec
    .replicas === undefined,
);

const without = render("search-service.enabled=false");
check("a service can be switched off", !without.some((d) => d.metadata.name === "search-service"));

console.log(failures ? `${failures} FAILED` : "ALL PASSED");
process.exit(failures ? 1 : 0);
