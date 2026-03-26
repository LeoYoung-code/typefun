import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import path from "node:path";

import { getPoemRepository } from "./corpus.js";

export type BuildAppOptions = {
  logger?: boolean;
};

const SEARCH_Q_MAX_LEN = 64;

function parseListQuery(q: Record<string, string | undefined>): {
  page: number;
  pageSize: number;
  category: "all" | "tang" | "song_ci";
  searchQuery: string | undefined;
} {
  const page = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(q.pageSize ?? "24", 10) || 24)
  );
  const catRaw = q.category ?? "all";
  const category =
    catRaw === "tang" || catRaw === "song_ci" ? catRaw : "all";
  const trimmed = (q.q ?? "").trim();
  const searchQuery =
    trimmed.length === 0
      ? undefined
      : trimmed.slice(0, SEARCH_Q_MAX_LEN);
  return { page, pageSize, category, searchQuery };
}

function parseRandomQuery(q: Record<string, string | undefined>): {
  category: "all" | "tang" | "song_ci";
} {
  const catRaw = q.category;
  if (catRaw === "tang" || catRaw === "song_ci") return { category: catRaw };
  return { category: "all" };
}

export async function buildApp(
  options: BuildAppOptions = {}
): Promise<FastifyInstance> {
  const logger = options.logger ?? true;
  const app = Fastify({ logger });

  await app.register(cors, {
    origin: true
  });

  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/poems", async (req, reply) => {
    try {
      const q = req.query as Record<string, string | undefined>;
      const { page, pageSize, category, searchQuery } = parseListQuery(q);
      const repo = getPoemRepository();
      return repo.listPage(page, pageSize, category, searchQuery);
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "failed_to_list_poems" });
    }
  });

  app.get("/api/poems/random", async (req, reply) => {
    try {
      const q = req.query as Record<string, string | undefined>;
      const { category } = parseRandomQuery(q);
      const repo = getPoemRepository();
      const item = repo.randomSummary(category);
      if (!item) {
        return reply.code(404).send({ error: "empty" });
      }
      return item;
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "failed_to_pick_random" });
    }
  });

  app.get("/api/poems/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (id === "random") {
      return reply.code(404).send({ error: "not_found" });
    }
    try {
      const repo = getPoemRepository();
      const poem = repo.getById(id);
      if (!poem) {
        return reply.code(404).send({ error: "not_found" });
      }
      return poem;
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "failed_to_load_poem" });
    }
  });

  const staticRoot = process.env.STATIC_ROOT?.trim();
  if (staticRoot) {
    const root = path.resolve(staticRoot);
    await app.register(fastifyStatic, {
      root,
      prefix: "/",
      decorateReply: true
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return reply.code(404).send({ error: "not_found" });
      }
      const pathname = request.url.split("?")[0] ?? "";
      if (pathname.startsWith("/api")) {
        return reply.code(404).send({ error: "not_found" });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}
