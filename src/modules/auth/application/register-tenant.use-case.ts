import { ConflictError, ValidationError } from "@shared/domain/errors";
import type { UseCase } from "@shared/domain/use-case";
import { prisma } from "@shared/infrastructure/prisma/client";
import { ensureDefaultRules } from "@modules/ai/infrastructure/ai-rules";
import { Email } from "../domain/value-objects/email";
import { Password } from "../domain/value-objects/password";
import type { PasswordHasher } from "../domain/ports/password-hasher";
import { TRIAL_DAYS } from "@modules/billing/domain/plans";

export interface RegisterTenantInput {
  businessName: string;
  slug: string;
  industry?: string;
  /** Tienda (catálogo y pedidos) o intermediación (vehículos e inmuebles). Define el agente y el panel. */
  agentProfile?: "RETAIL" | "BROKERAGE";
  ownerEmail: string;
  ownerName: string;
  password: string;
}

export interface RegisterTenantOutput {
  tenantId: string;
  userId: string;
  slug: string;
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;

export class RegisterTenantUseCase implements UseCase<RegisterTenantInput, RegisterTenantOutput> {
  constructor(private readonly hasher: PasswordHasher) {}

  async execute(input: RegisterTenantInput): Promise<RegisterTenantOutput> {
    const email = Email.create(input.ownerEmail);
    const password = Password.create(input.password);

    const slug = input.slug.trim().toLowerCase();
    if (!SLUG_RE.test(slug)) {
      throw new ValidationError(
        "El identificador debe ser minúsculas, números o guiones (3-32 caracteres)",
      );
    }
    if (input.businessName.trim().length < 2) {
      throw new ValidationError("Nombre del negocio inválido");
    }
    if (input.ownerName.trim().length < 2) {
      throw new ValidationError("Nombre del responsable inválido");
    }

    const existingTenant = await prisma.tenant.findUnique({ where: { slug } });
    if (existingTenant) throw new ConflictError("Ese identificador ya está en uso");

    const passwordHash = await this.hasher.hash(password.raw);

    const agentProfile = input.agentProfile ?? "RETAIL";

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          slug,
          name: input.businessName.trim(),
          industry: input.industry?.trim() || null,
          agentProfile,
          // Prueba gratis: el administrador ve cuándo vence y registra el primer pago
          paidUntil: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
        },
      });

      const user = await tx.user.upsert({
        where: { email: email.value },
        update: {},
        create: {
          email: email.value,
          name: input.ownerName.trim(),
          passwordHash,
        },
      });

      const membership = await tx.membership.create({
        data: { userId: user.id, tenantId: tenant.id, status: "ACTIVE" },
      });

      const ownerRole = await tx.role.findFirst({
        where: { key: "owner", isSystem: true },
      });
      if (!ownerRole) {
        throw new Error("Rol 'owner' del sistema no existe. Ejecutá `npm run db:seed`.");
      }

      await tx.membershipRole.create({
        data: { membershipId: membership.id, roleId: ownerRole.id },
      });

      return { tenantId: tenant.id, userId: user.id, slug };
    });

    // Las reglas del agente quedan listas desde el registro. Si falla, la IA las crea al primer mensaje.
    await ensureDefaultRules(result.tenantId, agentProfile).catch(() => {});
    return result;
  }
}
