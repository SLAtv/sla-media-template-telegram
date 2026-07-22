import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Session } from "./types.js";

export class Store {
  private db: Database.Database;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.exec("CREATE TABLE IF NOT EXISTS sessions (chat_id INTEGER PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)");
  }
  get(chatId: number): Session | null {
    const row = this.db.prepare("SELECT payload FROM sessions WHERE chat_id = ?").get(chatId) as { payload: string } | undefined;
    return row ? JSON.parse(row.payload, (_key, value) => value?.type === "Buffer" && Array.isArray(value.data) ? Buffer.from(value.data) : value) : null;
  }
  save(session: Session) {
    this.db.prepare("INSERT INTO sessions(chat_id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(chat_id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at").run(session.chatId, JSON.stringify(session), session.updatedAt);
  }
  clear(chatId: number) { this.db.prepare("DELETE FROM sessions WHERE chat_id = ?").run(chatId); }
}
