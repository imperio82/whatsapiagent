import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import type { UseCase } from "@shared/domain/use-case";
import { prisma } from "@shared/infrastructure/prisma/client";

export interface RoleDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissionCount: number;
}

export class ListRolesUseCase implements UseCase<void, RoleDto[]> {
  async execute(): Promise<RoleDto[]> {
    authorize("team.read");
    const { tenantId } = TenantContext.require();

    const roles = await prisma.role.findMany({
      where: { OR: [{ isSystem: true }, { tenantId }] },
      include: { _count: { select: { permissions: true } } },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });

    return roles.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      permissionCount: r._count.permissions,
    }));
  }
}
