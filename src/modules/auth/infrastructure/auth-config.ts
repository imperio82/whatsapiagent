import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@shared/infrastructure/prisma/client";
import { LoginUseCase } from "../application/login.use-case";
import { BcryptHasher } from "./bcrypt-hasher";
import { PrismaAuthUserRepository } from "./prisma-auth-user.repository";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      isPlatformAdmin: boolean;
    };
    activeTenantId?: string;
    tenants: Array<{ id: string; slug: string; name: string }>;
  }

  interface User {
    isPlatformAdmin?: boolean;
    tenants?: Array<{ id: string; slug: string; name: string }>;
    activeTenantId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    isPlatformAdmin: boolean;
    tenants: Array<{ id: string; slug: string; name: string }>;
    activeTenantId?: string;
  }
}

const userRepo = new PrismaAuthUserRepository();
const hasher = new BcryptHasher();

async function listUserTenants(userId: string): Promise<Array<{ id: string; slug: string; name: string }>> {
  const memberships = await prisma.membership.findMany({
    where: { userId, status: "ACTIVE" },
    include: { tenant: true },
  });
  return memberships.map((m) => ({ id: m.tenant.id, slug: m.tenant.slug, name: m.tenant.name }));
}

const loginUseCase = new LoginUseCase(userRepo, hasher, listUserTenants);

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        try {
          const result = await loginUseCase.execute(parsed.data);
          return {
            id: result.userId,
            email: result.email,
            name: result.name,
            isPlatformAdmin: result.isPlatformAdmin,
            tenants: result.tenants,
            activeTenantId: result.tenants[0]?.id,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.userId = user.id as string;
        token.isPlatformAdmin = user.isPlatformAdmin ?? false;
        token.tenants = user.tenants ?? [];
        token.activeTenantId = user.activeTenantId;
      }
      if (trigger === "update" && session?.activeTenantId) {
        token.activeTenantId = session.activeTenantId as string;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.userId;
      session.user.isPlatformAdmin = token.isPlatformAdmin;
      session.tenants = token.tenants;
      session.activeTenantId = token.activeTenantId;
      return session;
    },
  },
});
