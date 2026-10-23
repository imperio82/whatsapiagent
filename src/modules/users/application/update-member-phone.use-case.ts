import { z } from "zod";
import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { ConflictError, NotFoundError } from "@shared/domain/errors";
import { prisma } from "@shared/infrastructure/prisma/client";
import { samePhone } from "@modules/ai/domain/advisor-phone";

/**
 * WhatsApp de un miembro del equipo. Desde ese número habla con el asistente del asesor
 * (agenda, compradores, inventario) en vez de ser atendido como cliente.
 */
export const updateMemberPhoneSchema = z.object({
  whatsappPhone: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v === "" || (v.length >= 10 && v.length <= 15), "El número debe tener indicativo y entre 10 y 15 dígitos")
    .transform((v) => v || null)
    .nullable(),
});
export type UpdateMemberPhoneInput = z.input<typeof updateMemberPhoneSchema>;

export class UpdateMemberPhoneUseCase {
  async execute(membershipId: string, raw: UpdateMemberPhoneInput): Promise<void> {
    authorize("tenant.settings");
    const { tenantId } = TenantContext.require();
    const { whatsappPhone } = updateMemberPhoneSchema.parse(raw);

    const membership = await prisma.membership.findFirst({ where: { id: membershipId, tenantId } });
    if (!membership) throw new NotFoundError("Miembro no encontrado");

    if (whatsappPhone) {
      // Con o sin indicativo es el mismo número: no puede quedar en dos asesores
      const others = await prisma.membership.findMany({
        where: { tenantId, id: { not: membershipId }, whatsappPhone: { not: null } },
        select: { whatsappPhone: true, user: { select: { name: true } } },
      });
      const taken = others.find((o) => samePhone(o.whatsappPhone, whatsappPhone));
      if (taken) throw new ConflictError(`Ese número ya lo tiene ${taken.user.name}`);
    }

    await prisma.membership.update({ where: { id: membershipId }, data: { whatsappPhone } });
  }
}
