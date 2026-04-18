import { google, gmail_v1 } from "googleapis";
import { prisma } from "./db";
import { env } from "./env";
import { encrypt, decrypt } from "./crypto";

export async function getGmailClient(userId: string): Promise<gmail_v1.Gmail | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google", needsReauth: false },
  });
  if (!account || !account.refresh_token) return null;

  const oauth = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
  oauth.setCredentials({
    refresh_token: decrypt(account.refresh_token),
    access_token: account.access_token ? decrypt(account.access_token) : undefined,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  oauth.on("tokens", async (tokens) => {
    const data: Record<string, unknown> = {};
    if (tokens.access_token) data.access_token = encrypt(tokens.access_token);
    if (tokens.refresh_token) data.refresh_token = encrypt(tokens.refresh_token);
    if (tokens.expiry_date) data.expires_at = Math.floor(tokens.expiry_date / 1000);
    if (Object.keys(data).length === 0) return;
    try {
      await prisma.account.update({ where: { id: account.id }, data });
    } catch (e) {
      console.error("[gmail] failed to persist refreshed tokens", e);
    }
  });

  return google.gmail({ version: "v1", auth: oauth });
}

export function extractPlainText(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf8");
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const t = extractPlainText(part);
      if (t) return t;
    }
  }
  return "";
}

export function extractHtml(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return "";
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf8");
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const t = extractHtml(part);
      if (t) return t;
    }
  }
  return "";
}

export function getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  return headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}
