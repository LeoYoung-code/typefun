import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";

import { getPoemRepository } from "./corpus.js";

export type BuildAppOptions = {
  logger?: boolean;
};

function parseListQuery(q: Record<string, string | undefined>): {
  page: number;
  pageSize: number;
  category: "all" | "tang" | "song_ci";
} {
  const page = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(q.pageSize ?? "24", 10) || 24)
  );
  const catRaw = q.category ?? "all";
  const category =
    catRaw === "tang" || catRaw === "song_ci" ? catRaw : "all";
  return { page, pageSize, category };
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
      const { page, pageSize, category } = parseListQuery(q);
      const repo = getPoemRepository();
      return repo.listPage(page, pageSize, category);
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

  return app;
}
