import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import type { UseCase } from "@shared/domain/use-case";
import { prisma } from "@shared/infrastructure/prisma/client";

export interface MemberDto {
  membershipId: string;
  userId: string;
  email: string;
  name: string;
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
  roles: Array<{ key: string; name: string }>;
  joinedAt: string;
}

export class ListMembersUseCase implements UseCase<void, MemberDto[]> {
  async execute(): Promise<MemberDto[]> {
    authorize("team.read");
    const { tenantId } = TenantContext.require();

    const memberships = await prisma.membership.findMany({
      where: { tenantId },
      include: {
        user: true,
        roles: { include: { role: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return memberships.map((m) => ({
      membershipId: m.id,
      userId: m.userId,
      email: m.user.email,
      name: m.user.name,
      status: m.status,
      roles: m.roles.map((r) => ({ key: r.role.key, name: r.role.name })),
      joinedAt: m.createdAt.toISOString(),
    }));
  }
}
