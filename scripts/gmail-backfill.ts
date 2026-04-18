/* eslint-disable no-console */
import { prisma } from "../lib/db";
import { syncUserGmail } from "../lib/gmail-sync";

const DAYS = Number(process.argv[2] ?? 365);

async function main() {
  const users = await prisma.user.findMany({
    where: { accounts: { some: { provider: "google", needsReauth: false, refresh_token: { not: null } } } },
    select: { id: true, email: true },
  });
  if (users.length === 0) { console.log("No users to backfill"); await prisma.$disconnect(); return; }
  for (const u of users) {
    console.log(`[backfill] ${u.email} days=${DAYS}`);
    const r = await syncUserGmail(u.id, DAYS);
    console.log(`  fetched=${r.fetched} parsed=${r.parsed} inserted=${r.inserted} dup=${r.duplicates} unrec=${r.unrecognized} errors=${r.errors.length}`);
    if (r.errors.length > 0) r.errors.slice(0, 3).forEach(e => console.log(`    ! ${e}`));
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
