/**
 * Thin wrapper around Telegram Bot API sendMessage. Reads the bot token from
 * TELEGRAM_BOT_TOKEN; returns null if not configured so callers can no-op
 * cleanly in dev / until the user wires it up.
 *
 * chatId is per-user and stored alongside the token. For this single-user
 * deployment we keep it in env (TELEGRAM_CHAT_ID); a multi-user build would
 * move this to a `TelegramRecipient` table keyed by userId.
 */

type SendOptions = {
  chatId?: string;
  parseMode?: "MarkdownV2" | "HTML" | "Markdown";
  disableNotification?: boolean;
};

const API_BASE = "https://api.telegram.org/bot";

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

/** Escape text for Telegram MarkdownV2 so `_`, `*`, `[`, `]`, `(`, `)` etc. render literally. */
export function mdv2Escape(s: string): string {
  return s.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

export async function sendTelegramMessage(text: string, opts: SendOptions = {}): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const defaultChat = process.env.TELEGRAM_CHAT_ID;
  const chatId = opts.chatId ?? defaultChat;
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN not set" };
  if (!chatId) return { ok: false, error: "chat_id not provided (set TELEGRAM_CHAT_ID)" };

  try {
    const res = await fetch(`${API_BASE}${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: opts.parseMode ?? "MarkdownV2",
        disable_notification: opts.disableNotification ?? false,
        link_preview_options: { is_disabled: true },
      }),
    });
    const j = (await res.json()) as { ok: boolean; description?: string };
    if (!j.ok) return { ok: false, error: j.description ?? "unknown Telegram error" };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
