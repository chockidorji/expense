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
      await prisma.account.update({
        where: { provider_providerAccountId: { provider: account.provider, providerAccountId: account.providerAccountId } },
        data,
      });
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
