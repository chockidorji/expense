import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./db";
import { env } from "./env";
import { encrypt } from "./crypto";

const GMAIL_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
].join(" ");

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: GMAIL_SCOPES,
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  session: { strategy: "database" },
  secret: env.NEXTAUTH_SECRET,
  events: {
    async linkAccount({ account }) {
      if (account.provider !== "google") return;
      const data: Record<string, unknown> = {};
      if (account.refresh_token) data.refresh_token = encrypt(account.refresh_token);
      if (account.access_token) data.access_token = encrypt(account.access_token);
      if (Object.keys(data).length === 0) return;
      try {
        await prisma.account.update({
          where: { provider_providerAccountId: { provider: account.provider, providerAccountId: account.providerAccountId } },
          data: { ...data, needsReauth: false },
        });
      } catch (err) {
        // Rollback: the Prisma adapter already inserted the row with PLAINTEXT tokens.
        // Encryption/update failed, so we must not leave plaintext on disk.
        // Delete the row and re-throw so NextAuth surfaces an error to the user.
        console.error("[auth] failed to encrypt tokens on linkAccount — rolling back Account row", err);
        await prisma.account.delete({
          where: { provider_providerAccountId: { provider: account.provider, providerAccountId: account.providerAccountId } },
        }).catch(delErr => console.error("[auth] rollback delete failed", delErr));
        throw err;
      }
    },

    /**
     * Fires on EVERY successful sign-in (including re-auth with the same
     * Google account). `linkAccount` above only fires on first-time linking,
     * so re-auth flows would otherwise:
     *   1. Leave the new Google tokens plaintext on disk (the Prisma adapter
     *      writes them as-received).
     *   2. Never clear the `needsReauth` flag set by gmail-sync after a
     *      previous invalid_grant — so the dashboard banner sticks even
     *      though the user just reconnected.
     *
     * We encrypt the fresh tokens in-place and clear `needsReauth` here.
     */
    async signIn({ account }) {
      if (!account || account.provider !== "google") return;
      // Persist the actual scope Google granted on this re-auth. Without this,
      // the DB keeps reporting the original scope from first link, masking the
      // case where a re-auth lost gmail.readonly. (We saw this in production:
      // DB showed gmail.readonly granted, but the live token only had profile.)
      const grantedScope = account.scope ?? "";
      // Gmail's gmail.readonly is a "sensitive" scope — Google shows it as an
      // UNCHECKED box on the consent screen. If the user clicks Continue
      // without ticking it, sign-in still succeeds but with profile-only
      // scope. The cron then 403s every tick and the user thinks they're
      // connected. Catch that partial-consent case here at the source: if the
      // granted scope set lacks gmail.readonly, immediately re-flip the
      // re-auth banner so the user retries with the right box checked.
      const hasGmailReadonly = grantedScope.includes("gmail.readonly");
      const data: Record<string, unknown> = { needsReauth: !hasGmailReadonly };
      if (account.refresh_token) data.refresh_token = encrypt(account.refresh_token);
      if (account.access_token) data.access_token = encrypt(account.access_token);
      if (account.scope) data.scope = account.scope;
      if (!hasGmailReadonly) {
        console.warn("[auth] signIn missing gmail.readonly scope — granted=%s", grantedScope);
      }
      try {
        await prisma.account.update({
          where: { provider_providerAccountId: { provider: account.provider, providerAccountId: account.providerAccountId } },
          data,
        });
      } catch (err) {
        // P2025 = row doesn't exist yet (first sign-in). linkAccount handles
        // that path. Other errors are real and should be logged.
        if (!(err as { code?: string }).code || (err as { code?: string }).code !== "P2025") {
          console.error("[auth] failed to refresh tokens / clear needsReauth on signIn", err);
        }
      }
    },
  },
  callbacks: {
    async session({ session, user }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (session.user) (session.user as any).id = user.id;
      return session;
    },
  },
};
