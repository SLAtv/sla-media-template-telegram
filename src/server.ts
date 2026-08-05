import "dotenv/config";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { Store } from "./store.js";
import { TelegramAgent } from "./telegram.js";

const port = Number(process.env.PORT ?? 8787);
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const MAX_BODY_BYTES = 512 * 1024;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const requestBuckets = new Map<number, number[]>();

if (!token) throw new Error("TELEGRAM_BOT_TOKEN es obligatorio para iniciar el agente.");
if (!secret) throw new Error("TELEGRAM_WEBHOOK_SECRET es obligatorio para iniciar el agente.");
const store = new Store(process.env.DATABASE_PATH ?? "./data/agent.sqlite");
const agent = new TelegramAgent(token, store, process.env.ORIGINAL_WEB_URL ?? "http://localhost:3000", process.env.PUBLIC_AGENT_URL ?? "http://localhost:8787");

function allowRequest(chatId: number): boolean {
  const now = Date.now();
  const timestamps = (requestBuckets.get(chatId) ?? []).filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    requestBuckets.set(chatId, timestamps);
    return false;
  }
  timestamps.push(now);
  requestBuckets.set(chatId, timestamps);
  return true;
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true, telegramConfigured: Boolean(agent) })); return; }
  if (req.method === "POST" && req.url === "/webhook/telegram") {
    if (req.headers["x-telegram-bot-api-secret-token"] !== secret) { res.writeHead(401); res.end("unauthorized"); return; }
    const contentLength = Number(req.headers["content-length"] ?? 0);
    if (contentLength > MAX_BODY_BYTES) { res.writeHead(413); res.end("payload too large"); return; }
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    try {
      const body = Buffer.concat(chunks);
      if (body.length > MAX_BODY_BYTES) { res.writeHead(413); res.end("payload too large"); return; }
      const update = JSON.parse(body.toString());
      const chatId = update.message?.chat?.id ?? update.callback_query?.message?.chat?.id;
      if (typeof chatId !== "number" || !allowRequest(chatId)) { res.writeHead(429); res.end("rate limited"); return; }
      await agent.handle(update);
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
