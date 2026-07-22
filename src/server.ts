import "dotenv/config";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { Store } from "./store.js";
import { TelegramAgent } from "./telegram.js";

const port = Number(process.env.PORT ?? 8787);
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!token) console.warn("TELEGRAM_BOT_TOKEN no configurado: el renderer y /health siguen disponibles.");
const store = new Store(process.env.DATABASE_PATH ?? "./data/agent.sqlite");
const agent = token ? new TelegramAgent(token, store, process.env.ORIGINAL_WEB_URL ?? "http://localhost:3000", process.env.PUBLIC_AGENT_URL ?? "http://localhost:8787") : null;

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true, telegramConfigured: Boolean(agent) })); return; }
  if (req.method === "POST" && req.url === "/webhook/telegram") {
    if (secret && req.headers["x-telegram-bot-api-secret-token"] !== secret) { res.writeHead(401); res.end("unauthorized"); return; }
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    try {
      if (agent) await agent.handle(JSON.parse(Buffer.concat(chunks).toString()));
      res.writeHead(200); res.end("ok");
    } catch (error) {
      console.error(error);
      res.writeHead(500); res.end("error");
    }
    return;
  }
  if (req.method === "GET" && req.url === "/") { const html = await readFile(new URL("../../public/index.html", import.meta.url)); res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html); return; }
  res.writeHead(404); res.end("not found");
});
server.listen(port, () => console.log(`SLA Media Agent escuchando en http://localhost:${port}`));
