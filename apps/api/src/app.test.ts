import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { buildApp } from "./app.js";

describe("API", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/health returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
  });

  it("GET /api/poems returns paginated list", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/poems?page=1&pageSize=10&category=all"
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      items: { id: string }[];
      total: number;
      page: number;
      pageSize: number;
    };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0]).toHaveProperty("id");
    expect(body.total).toBeGreaterThan(0);
    expect(body.page).toBe(1);
  });

  it("GET /api/poems/random returns one summary", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/poems/random"
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { id: string; title: string };
    expect(body.id).toBeTruthy();
    expect(body.title).toBeTruthy();
  });

  it("GET /api/poems/:id returns one poem", async () => {
    const list = await app.inject({
      method: "GET",
      url: "/api/poems?page=1&pageSize=1&category=all"
    });
    expect(list.statusCode).toBe(200);
    const { items } = JSON.parse(list.body) as { items: { id: string }[] };
    expect(items.length).toBeGreaterThan(0);
    const id = items[0]!.id;
    const res = await app.inject({
      method: "GET",
      url: `/api/poems/${encodeURIComponent(id)}`
    });
    expect(res.statusCode).toBe(200);
    const poem = JSON.parse(res.body) as { id: string; title: string };
    expect(poem.id).toBe(id);
    expect(poem.title).toBeTruthy();
  });

  it("GET /api/poems/:id 404 when missing", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/poems/__no_such__"
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: "not_found" });
  });
});
