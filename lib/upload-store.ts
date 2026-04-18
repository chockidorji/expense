import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

const DIR = path.join(process.cwd(), "tmp-uploads");

async function ensureDir() { await fs.mkdir(DIR, { recursive: true }); }

/** Write a buffer to /tmp-uploads/<token>.csv. Returns the token. */
export async function stashCsv(buffer: Buffer): Promise<string> {
  await ensureDir();
  const token = randomBytes(16).toString("hex");
  await fs.writeFile(path.join(DIR, `${token}.csv`), buffer);
  // Best-effort cleanup: drop files older than 1 hour.
  try {
    const entries = await fs.readdir(DIR);
    const now = Date.now();
    for (const f of entries) {
      const st = await fs.stat(path.join(DIR, f));
      if (now - st.mtimeMs > 60 * 60 * 1000) await fs.unlink(path.join(DIR, f));
    }
  } catch {}
  return token;
}

export async function readStashed(token: string): Promise<Buffer> {
  if (!/^[a-f0-9]{32}$/.test(token)) throw new Error("Invalid token");
  return fs.readFile(path.join(DIR, `${token}.csv`));
}

export async function deleteStashed(token: string): Promise<void> {
  if (!/^[a-f0-9]{32}$/.test(token)) return;
  await fs.unlink(path.join(DIR, `${token}.csv`)).catch(() => {});
}
