# Container Images

Single reference for every container image the project uses. Compose files and Helm charts
use the **plain names** below. If your images come from a private registry or mirror, tag
them to these names with `infra/retag-images.ps1` (see [HOW-TO-RUN.md](HOW-TO-RUN.md)).

Availability wins over "latest": tags below are the versions actually obtainable in our
environment (see `ADR-013`).

| Phase | Service       | Image (plain name)            | Notes                                      |
| ----- | ------------- | ----------------------------- | ------------------------------------------ |
| 0     | PostgreSQL    | `postgres:latest`             | Source of truth                            |
| 0     | MinIO         | `minio/minio:latest`          | S3-compatible object storage               |
| 0     | MinIO client  | `minio/mc:latest`             | One-shot bucket setup                      |
| 0     | Keycloak      | `keycloak/keycloak:latest`    | OIDC identity                              |
| 1     | RabbitMQ      | `rabbitmq:3.12.13-management` | Command queue + management UI              |
| 2     | nginx         | `nginx:v1`                    | Edge cache / CDN stand-in                  |
| 3     | Kafka         | `bitnami/kafka:3.5.1`         | KRaft mode, no ZooKeeper                   |
| 3     | Elasticsearch | `elasticsearch:8.19.16`       | 8.x, single-node locally                   |
| 4     | Redis         | `redis:6.2.24`                | Cache + counters                           |
| 5     | Observability | `grafana/otel-lgtm:1.3`       | Loki + Grafana + Tempo + Prometheus + OTLP |

## Not used

- Kafka UI and RedisInsight — not available; use the CLIs inside the containers instead
  (`kafka-topics.sh`, `kafka-console-consumer.sh`, `redis-cli`).
- Redpanda / `apache/kafka` — not available; Bitnami Kafka is upstream Apache Kafka
  repackaged and speaks the same protocol.
