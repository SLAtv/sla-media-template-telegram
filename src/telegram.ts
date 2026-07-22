import type { Copy, Session } from "./types.js";
import { DEFAULT_DITHER, FIELD_LABELS, FIELD_ORDER } from "./types.js";
import { renderPoster } from "./renderer.js";
import { Store } from "./store.js";

type TelegramMessage = { chat: { id: number }; text?: string; photo?: Array<{ file_id: string }> };
type TelegramUpdate = { message?: TelegramMessage; callback_query?: { id: string; data?: string; message?: TelegramMessage } };

export class TelegramAgent {
  constructor(private token: string, private store: Store, private originalWebUrl: string, private publicUrl: string) {}
  private async api(method: string, body: Record<string, unknown>) { const res = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); if (!res.ok) throw new Error(`Telegram ${method}: ${res.status}`); return res.json() as Promise<{ result?: any }>; }
  private async sendPng(chatId: number, png: Buffer, caption: string, replyMarkup: Record<string, unknown>) {
    const form = new FormData();
    form.set("chat_id", String(chatId));
    form.set("caption", caption);
    form.set("reply_markup", JSON.stringify(replyMarkup));
    form.set("photo", new Blob([png as unknown as BlobPart], { type: "image/png" }), "sla-poster.png");
    const res = await fetch(`https://api.telegram.org/bot${this.token}/sendPhoto`, { method: "POST", body: form });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Telegram sendPhoto: ${res.status} ${detail}`);
    }
    return res.json();
  }
  private async send(chatId: number, text: string, extra: Record<string, unknown> = {}) { return this.api("sendMessage", { chat_id: chatId, text, ...extra }); }
  private nextField(copy: Partial<Copy>) { return FIELD_ORDER.find((field) => !copy[field]); }
  private prompt(field: keyof Copy) { return `¿Cuál es el ${FIELD_LABELS[field]}?`; }
  private async downloadPhoto(fileId: string) { const file = await this.api("getFile", { file_id: fileId }); const path = file.result?.file_path; if (!path) throw new Error("Telegram no devolvió la ruta de la foto"); const response = await fetch(`https://api.telegram.org/file/bot${this.token}/${path}`); return Buffer.from(await response.arrayBuffer()); }
  private keyboard() { return { inline_keyboard: [[{ text: "Cambiar datos", callback_data: "reset" }, { text: "Editar manualmente", url: this.originalWebUrl }]] }; }
  async handle(update: TelegramUpdate) {
    const message = update.message ?? update.callback_query?.message;
    if (!message) return;
    const chatId = message.chat.id;
    if (update.callback_query) { await this.api("answerCallbackQuery", { callback_query_id: update.callback_query.id }); if (update.callback_query.data === "reset") { this.store.clear(chatId); await this.send(chatId, "Perfecto. Enviame una nueva foto para empezar."); } return; }
    if (message.text === "/start" || message.text === "/reset") { this.store.clear(chatId); await this.send(chatId, "Soy el agente de placas de SLA. Enviame la foto del invitado para empezar."); return; }
    let session = this.store.get(chatId) ?? { chatId, photo: null, copy: {}, awaiting: "photo", updatedAt: new Date().toISOString() } satisfies Session;
    if (message.photo?.length) { session.photo = await this.downloadPhoto(message.photo.at(-1)!.file_id); session.awaiting = this.nextField(session.copy) ?? null; session.updatedAt = new Date().toISOString(); this.store.save(session); await this.send(chatId, this.prompt(session.awaiting as keyof Copy)); return; }
    if (!message.text) { await this.send(chatId, "Necesito una foto o un texto para continuar."); return; }
    if (!session.photo) { await this.send(chatId, "Primero enviame la foto del invitado."); return; }
    const field = session.awaiting ?? this.nextField(session.copy);
    if (field && field !== "photo") { session.copy[field] = ["handle", "role", "sponsor", "name"].includes(field) ? message.text.toUpperCase() : message.text; session.awaiting = this.nextField(session.copy) ?? null; session.updatedAt = new Date().toISOString(); this.store.save(session); }
    if (session.awaiting) { await this.send(chatId, this.prompt(session.awaiting as keyof Copy)); return; }
    const copy = session.copy as Copy;
    const png = await renderPoster(session.photo, copy, DEFAULT_DITHER);
    await this.sendPng(chatId, png, "Listo: generé la placa con el preset SLA.", this.keyboard());
  }
}
