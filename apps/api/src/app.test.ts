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

  it("GET /api/poems returns array", async () => {
    const res = await app.inject({ method: "GET", url: "/api/poems" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { id: string }[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toHaveProperty("id");
  });

  it("GET /api/poems/:id returns one poem", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/poems/jingyesi"
    });
    expect(res.statusCode).toBe(200);
    const poem = JSON.parse(res.body) as { id: string; title: string };
    expect(poem.id).toBe("jingyesi");
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
