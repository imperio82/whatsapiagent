import { prisma } from "@shared/infrastructure/prisma/client";
import { AuthUser } from "../domain/entities/user";
import { Email } from "../domain/value-objects/email";
import type { AuthUserRepository } from "../domain/ports/auth-user-repository";

export class PrismaAuthUserRepository implements AuthUserRepository {
  async findByEmail(email: string): Promise<AuthUser | null> {
    const row = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!row) return null;
    return AuthUser.fromPersistence({
      id: row.id,
      email: Email.create(row.email),
      name: row.name,
      passwordHash: row.passwordHash,
      isPlatformAdmin: row.isPlatformAdmin,
    });
  }

  async findById(id: string): Promise<AuthUser | null> {
    const row = await prisma.user.findUnique({ where: { id } });
    if (!row) return null;
    return AuthUser.fromPersistence({
      id: row.id,
      email: Email.create(row.email),
      name: row.name,
      passwordHash: row.passwordHash,
      isPlatformAdmin: row.isPlatformAdmin,
    });
  }
}
