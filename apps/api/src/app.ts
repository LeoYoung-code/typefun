import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";

const __dirname = dirname(fileURLToPath(import.meta.url));
const poemsPath = join(__dirname, "../../../data/poems.json");

export function loadPoems(): unknown[] {
  const raw = readFileSync(poemsPath, "utf8");
  return JSON.parse(raw) as unknown[];
}

export type BuildAppOptions = {
  logger?: boolean;
};

export async function buildApp(
  options: BuildAppOptions = {}
): Promise<FastifyInstance> {
  const logger = options.logger ?? true;
  const app = Fastify({ logger });

  await app.register(cors, {
    origin: true
  });

  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/poems", async (_req, reply) => {
    try {
      const poems = loadPoems();
      return poems;
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "failed_to_load_poems" });
    }
  });

  app.get("/api/poems/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const poems = loadPoems() as { id: string }[];
      const poem = poems.find((p) => p.id === id);
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
