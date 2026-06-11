import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";
import type { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import "@/lib/auth.types";

const credentialsSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

// Hardcoded test users with bcrypt hashed passwords
const TEST_USERS: Record<
  string,
  { passwordHash: string; name: string; role: string; email: string }
> = {
  "admin@nexusops.local": {
    passwordHash: "$2b$10$PfNJcSaWrIjcdJvm9EpOLO1FxhiEJM5gHwmdlLmiFVfB4foD81M0q", // "Admin@123"
    name: "Administrador",
    role: "ADMIN",
    email: "admin@nexusops.local",
  },
  "lucas@universoaventura.com": {
    passwordHash: "$2b$10$PfNJcSaWrIjcdJvm9EpOLO1FxhiEJM5gHwmdlLmiFVfB4foD81M0q", // "Admin@123"
    name: "Lucas",
    role: "ADMIN",
    email: "lucas@universoaventura.com",
  },
};

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Email and Password",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "tu@email.com" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        const validatedCredentials = credentialsSchema.safeParse(credentials);
        if (!validatedCredentials.success) {
          return null;
        }

        const { email, password } = validatedCredentials.data;

        // Primero intentar con TEST_USERS (hardcodeados)
        const testUser = TEST_USERS[email];
        if (testUser) {
          const isPasswordValid = await bcrypt.compare(password, testUser.passwordHash);
          if (!isPasswordValid) {
            return null;
          }

          // Sincronizar con BD
          let userId: string = email;
          try {
            const dbUser = await prisma.user.upsert({
              where: { username: email },
              update: {
                name: testUser.name,
                role: testUser.role as Role,
                status: true,
              },
              create: {
                username: email,
                pin: "0000",
                name: testUser.name,
                role: testUser.role as Role,
                status: true,
              },
            });
            userId = dbUser.id;
          } catch (error) {
            console.error("Error sincronizando usuario TEST_USER:", error);
          }

          return {
            id: userId,
            email: testUser.email,
            name: testUser.name,
            role: testUser.role as Role,
          };
        }

        // Si no está en TEST_USERS, buscar en BD (usuarios creados vía /api/users)
        // Validar contra PIN (4 dígitos simples)
        const dbUser = await prisma.user.findUnique({
          where: { username: email },
        });

        if (!dbUser || !dbUser.status) {
          return null;
        }

        // Validar PIN simple (sin hash)
        if (password !== dbUser.pin) {
          return null;
        }

        return {
          id: dbUser.id,
          email: dbUser.username,
          name: dbUser.name,
          role: dbUser.role as Role,
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
