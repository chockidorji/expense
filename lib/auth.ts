import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./db";
import { env } from "./env";
import { encrypt } from "./crypto";

// Google OAuth is identity-only now: openid + email + profile. Gmail data is
// read via IMAP + app password instead — this avoids the sensitive-scope
// refresh-token revocation policy Google enforces on unverified apps.
const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
].join(" ");

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: GOOGLE_SCOPES,
          // Identity-only OAuth doesn't need offline access — drop access_type
          // and prompt:consent so re-sign-in is silent when the session
          // expires. (Sensitive-scope OAuth needed these; we don't anymore.)
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
     * Fires on every successful sign-in (including re-auth). We just
     * re-encrypt the fresh tokens. The `needsReauth` flag is now driven by
     * IMAP auth failures (in gmail-sync.ts), not by Google OAuth scope
     * checks — so we clear it on any successful sign-in as a recovery hint
     * even though Gmail data flows through IMAP, not OAuth.
     */
    async signIn({ account }) {
      if (!account || account.provider !== "google") return;
      const data: Record<string, unknown> = { needsReauth: false };
      if (account.refresh_token) data.refresh_token = encrypt(account.refresh_token);
      if (account.access_token) data.access_token = encrypt(account.access_token);
      if (account.scope) data.scope = account.scope;
      try {
        await prisma.account.update({
          where: { provider_providerAccountId: { provider: account.provider, providerAccountId: account.providerAccountId } },
          data,
        });
      } catch (err) {
        // P2025 = row doesn't exist yet (first sign-in). linkAccount handles
        // that path. Other errors are real and should be logged.
        if (!(err as { code?: string }).code || (err as { code?: string }).code !== "P2025") {
          console.error("[auth] failed to persist tokens on signIn", err);
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
