import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";
import type { Role } from "@prisma/client";

const credentialsSchema = z.object({
  username: z.string().min(1),
  pin: z.string().regex(/^\d{4}$/, "PIN must be 4 digits"),
});

// Hardcoded test users (for now - until DB schema is fixed)
const TEST_USERS: Record<string, { pin: string; name: string; role: string; email: string }> = {
  admin: { pin: "1234", name: "Administrador", role: "ADMIN", email: "admin@nexusops.local" },
  lucas: { pin: "5678", name: "Lucas", role: "ADMIN", email: "lucas@nexusops.local" },
};

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        pin: { label: "PIN (4 digits)", type: "password" },
      },
      async authorize(credentials) {
        const validatedCredentials = credentialsSchema.safeParse(credentials);
        if (!validatedCredentials.success) {
          return null;
        }

        const { username, pin } = validatedCredentials.data;
        const user = TEST_USERS[username];

        if (!user || user.pin !== pin) {
          return null;
        }

        return {
          id: username,
          email: user.email,
          name: user.name,
          role: user.role as Role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  jwt: {
    secret: process.env.NEXTAUTH_SECRET,
  },
};
