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
    passwordHash: "$2a$10$YqpVQPH3S4kzWJlVwcINZuKNW7P0BHoL3GCB8ZL5rHqRMaZLR1eHm", // "Admin@123"
    name: "Administrador",
    role: "ADMIN",
    email: "admin@nexusops.local",
  },
  "lucas@universoaventura.com": {
    passwordHash: "$2a$10$YqpVQPH3S4kzWJlVwcINZuKNW7P0BHoL3GCB8ZL5rHqRMaZLR1eHm", // "Admin@123"
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
        const user = TEST_USERS[email];

        if (!user) {
          return null;
        }

        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
          return null;
        }

        // Bridge: estos usuarios viven hardcodeados en TEST_USERS, pero las
        // tablas Account/Credential/Metric requieren un User real (FK) en la
        // base. Garantizamos que exista una fila User con el mismo email
        // como username, y devolvemos su id real para usarlo como
        // session.user.id en el resto de la app.
        let userId: string = email;
        try {
          const dbUser = await prisma.user.upsert({
            where: { username: email },
            update: {
              name: user.name,
              role: user.role as Role,
              status: true,
            },
            create: {
              username: email,
              pin: "0000",
              name: user.name,
              role: user.role as Role,
              status: true,
            },
          });
          userId = dbUser.id;
        } catch (error) {
          console.error("No se pudo sincronizar el usuario con la base de datos:", error);
        }

        return {
          id: userId,
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
