import { readFile } from "node:fs/promises";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import type { Client } from "@elastic/elasticsearch";
import { errors } from "@elastic/elasticsearch";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../app.module.js";
import { OPENAPI_FILE } from "../contracts/contract-files.js";
import { toDocument } from "../indexer/video-event-handler.js";
import { buildOpenApiDocument } from "../openapi/openapi.js";
import { readyEvent } from "../testing/events.js";
import { FakeSearchIndex } from "../testing/fake-search-index.js";
import {
  buildSearchRequest,
  buildSuggestRequest,
  ElasticsearchIndex,
  INDEX_MAPPINGS,
  indexName,
} from "./elasticsearch-index.adapter.js";
import { SearchController } from "./search.controller.js";
import { SEARCH_INDEX_PORT } from "./search-index.port.js";

describe("SearchController", () => {
  let app: INestApplication;
  const index = new FakeSearchIndex();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [{ provide: SEARCH_INDEX_PORT, useValue: index }],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    const e = readyEvent({ title: "Cats playing piano" });
    await index.upsert(e.video.id, 1, toDocument(e));
  });
  afterAll(() => app.close());
  beforeEach(() => {
    index.searches.length = 0;
  });

  const get = (url: string) => request(app.getHttpServer()).get(url);

  it("searches with defaults and returns hits with a total", async () => {
    const res = await get("/search?q=%20cats%20");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0]).toMatchObject({
      title: "Cats playing piano",
      renditions: ["720p", "360p"],
    });
    expect(index.searches).toEqual([{ q: "cats", limit: 12, offset: 0 }]);
  });

  it("rejects a missing or blank query and out-of-range paging", async () => {
    for (const url of [
      "/search",
      "/search?q=%20",
      "/search?q=a&limit=51",
      "/search?q=a&offset=1001",
    ]) {
      expect((await get(url)).status, url).toBe(400);
    }
    expect(index.searches).toHaveLength(0);
  });

  it("suggests titles by prefix, at most limit", async () => {
    const res = await get("/search/suggest?q=Cat&limit=3");

    expect(res.status).toBe(200);
    expect(res.body.items.map((s: { title: string }) => s.title)).toEqual(["Cats playing piano"]);
    expect(index.suggests.at(-1)).toEqual({ q: "Cat", limit: 3 });
    expect((await get("/search/suggest?q=a&limit=11")).status).toBe(400);
  });
});

describe("Elasticsearch requests", () => {
  it("uses a strict mapping with a search_as_you_type title", () => {
    expect(INDEX_MAPPINGS.dynamic).toBe("strict");
    expect(INDEX_MAPPINGS.properties?.title).toMatchObject({
      type: "text",
      fields: { suggest: { type: "search_as_you_type" } },
    });
    expect(indexName("videos")).toBe("videos-v1");
  });

  it("boosts titles, tolerates typos and matches a partial last word", () => {
    const req = buildSearchRequest("videos", { q: "cat pia", limit: 5, offset: 10 });

    expect(req).toMatchObject({ index: "videos", from: 10, size: 5, track_total_hits: true });
    const should = (req.query as { bool: { should: unknown[] } }).bool.should;
    expect(should).toContainEqual({
      multi_match: { query: "cat pia", fields: ["title^3", "description"], fuzziness: "AUTO" },
    });
    expect(should).toContainEqual({
      multi_match: {
        query: "cat pia",
        type: "bool_prefix",
        fields: ["title.suggest", "title.suggest._2gram", "title.suggest._3gram"],
      },
    });
  });

  it("asks only for titles when suggesting", () => {
    expect(buildSuggestRequest("videos", { q: "ca", limit: 5 })).toMatchObject({
      size: 5,
      _source: ["title"],
      query: { multi_match: { type: "bool_prefix" } },
    });
  });
});

describe("ElasticsearchIndex", () => {
  const responseError = (statusCode: number, body: unknown = {}) =>
    new errors.ResponseError({ statusCode, body, headers: {}, warnings: null, meta: {} } as never);

  const fakeClient = (overrides: Record<string, unknown> = {}) => {
    const calls: { op: string; args: unknown }[] = [];
    const record =
      (op: string, result: unknown = {}) =>
      async (args: unknown) => {
        calls.push({ op, args });
        const value = overrides[op];
        if (value instanceof Error) throw value;
        return value ?? result;
      };
    const client = {
      indices: { existsAlias: record("existsAlias", false), create: record("create") },
      index: record("index"),
      search: record("search", { hits: { total: { value: 0 }, hits: [] } }),
      close: async () => undefined,
    };
    return { client: client as unknown as Client, calls };
  };

  it("creates the versioned index behind the alias once", async () => {
    const { client, calls } = fakeClient();

    await new ElasticsearchIndex("videos", client).ensureIndex();

    expect(calls[1]).toEqual({
      op: "create",
      args: {
        index: "videos-v1",
        settings: { number_of_shards: 1, number_of_replicas: 0 },
        mappings: INDEX_MAPPINGS,
        aliases: { videos: {} },
      },
    });
  });

  it("does nothing when the alias exists, and tolerates a concurrent create", async () => {
    const exists = fakeClient({ existsAlias: true });
    await new ElasticsearchIndex("videos", exists.client).ensureIndex();
    expect(exists.calls.map((c) => c.op)).toEqual(["existsAlias"]);

    const race = fakeClient({
      create: responseError(400, { error: { type: "resource_already_exists_exception" } }),
    });
    await expect(
      new ElasticsearchIndex("videos", race.client).ensureIndex(),
    ).resolves.toBeUndefined();

    const broken = fakeClient({ create: responseError(500) });
    await expect(new ElasticsearchIndex("videos", broken.client).ensureIndex()).rejects.toThrow();
  });

  it("writes with external versioning and maps a version conflict to stale", async () => {
    const e = readyEvent();
    const ok = fakeClient();
    expect(await new ElasticsearchIndex("videos", ok.client).upsert("id1", 5, toDocument(e))).toBe(
      "written",
    );
    expect(ok.calls[0]?.args).toMatchObject({
      index: "videos",
      id: "id1",
      version: 5,
      version_type: "external",
    });

    const conflict = fakeClient({ index: responseError(409) });
    expect(
      await new ElasticsearchIndex("videos", conflict.client).upsert("id1", 5, toDocument(e)),
    ).toBe("stale");

    const down = fakeClient({ index: responseError(503) });
    await expect(
      new ElasticsearchIndex("videos", down.client).upsert("id1", 5, toDocument(e)),
    ).rejects.toThrow();
  });

  it("maps hits to results and suggestions", async () => {
    const hit = {
      _id: "v1",
      _source: {
        title: "Cats",
        description: null,
        renditions: ["360p"],
        createdAt: "2026-11-09T09:00:00.000Z",
      },
    };
    const { client } = fakeClient({ search: { hits: { total: { value: 41 }, hits: [hit] } } });
    const index = new ElasticsearchIndex("videos", client);

    expect(await index.search({ q: "cats", limit: 1, offset: 0 })).toEqual({
      total: 41,
      items: [
        {
          id: "v1",
          title: "Cats",
          description: null,
          renditions: ["360p"],
          createdAt: "2026-11-09T09:00:00.000Z",
        },
      ],
    });
    expect(await index.suggest({ q: "ca", limit: 5 })).toEqual({
      items: [{ id: "v1", title: "Cats" }],
    });
  });
});

describe("OpenAPI contract", () => {
  it("matches the committed contracts/search-service.openapi.json", async () => {
    const app = await NestFactory.create(AppModule, { preview: true, logger: false });
    const generated = JSON.parse(JSON.stringify(buildOpenApiDocument(app)));
    await app.close();

    expect(generated).toEqual(JSON.parse(await readFile(OPENAPI_FILE, "utf8")));
    expect(Object.keys(generated.paths)).toEqual(["/search", "/search/suggest"]);
  });
});
