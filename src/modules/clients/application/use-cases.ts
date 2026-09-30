import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { ConflictError, NotFoundError } from "@shared/domain/errors";
import type { UseCase } from "@shared/domain/use-case";
import type { Page } from "@shared/domain/repository";
import { prisma } from "@shared/infrastructure/prisma/client";
import type {
  ClientDetailDto,
  ClientListItemDto,
  CreateClientInput,
  ListClientsInput,
  UpdateClientInput,
} from "./dtos";

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

export class ListClientsUseCase implements UseCase<ListClientsInput, Page<ClientListItemDto>> {
  async execute(input: ListClientsInput): Promise<Page<ClientListItemDto>> {
    authorize("clients.read");
    const { tenantId } = TenantContext.require();

    const where = {
      tenantId,
      ...(input.search
        ? {
            OR: [
              { name: { contains: input.search, mode: "insensitive" as const } },
              { phone: { contains: input.search } },
              { email: { contains: input.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.client.findMany({
        where,
        include: {
          orders: { select: { totalCents: true } },
          conversations: { select: { lastMessageAt: true }, orderBy: { lastMessageAt: "desc" }, take: 1 },
        },
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      prisma.client.count({ where }),
    ]);

    const items: ClientListItemDto[] = rows.map((c) => {
      const totalSpentCents = c.orders.reduce((sum, o) => sum + o.totalCents, 0);
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        ordersCount: c.orders.length,
        totalSpentCents,
        totalSpentMajor: totalSpentCents / 100,
        lastInteractionAt: c.conversations[0]?.lastMessageAt?.toISOString() ?? null,
        source: c.source,
        createdAt: c.createdAt.toISOString(),
      };
    });

    return { items, total, page: input.page, pageSize: input.pageSize };
  }
}

export class GetClientUseCase implements UseCase<{ id: string }, ClientDetailDto> {
  async execute({ id }: { id: string }): Promise<ClientDetailDto> {
    authorize("clients.read");
    const { tenantId } = TenantContext.require();

    const c = await prisma.client.findFirst({
      where: { id, tenantId },
      include: {
        orders: { select: { totalCents: true } },
        conversations: { select: { lastMessageAt: true }, orderBy: { lastMessageAt: "desc" }, take: 1 },
      },
    });
    if (!c) throw new NotFoundError("Cliente no encontrado");

    const totalSpentCents = c.orders.reduce((sum, o) => sum + o.totalCents, 0);
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      address: c.address,
      notes: c.notes,
      ordersCount: c.orders.length,
      totalSpentCents,
      totalSpentMajor: totalSpentCents / 100,
      lastInteractionAt: c.conversations[0]?.lastMessageAt?.toISOString() ?? null,
      source: c.source,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  }
}

export class CreateClientUseCase implements UseCase<CreateClientInput, ClientDetailDto> {
  private readonly getOne = new GetClientUseCase();

  async execute(input: CreateClientInput): Promise<ClientDetailDto> {
    authorize("clients.create");
    const { tenantId } = TenantContext.require();
    const phone = normalizePhone(input.phone);

    const exists = await prisma.client.findUnique({
      where: { tenantId_phone: { tenantId, phone } },
    });
    if (exists) throw new ConflictError("Ya existe un cliente con ese teléfono");

    const created = await prisma.client.create({
      data: {
        tenantId,
        name: input.name.trim(),
        phone,
        email: input.email ?? null,
        address: input.address ?? null,
        notes: input.notes ?? null,
        source: "manual",
      },
    });

    return this.getOne.execute({ id: created.id });
  }
}

export class UpdateClientUseCase implements UseCase<{ id: string } & UpdateClientInput, ClientDetailDto> {
  private readonly getOne = new GetClientUseCase();

  async execute(input: { id: string } & UpdateClientInput): Promise<ClientDetailDto> {
    authorize("clients.update");
    const { tenantId } = TenantContext.require();

    const existing = await prisma.client.findFirst({ where: { id: input.id, tenantId } });
    if (!existing) throw new NotFoundError("Cliente no encontrado");

    await prisma.client.update({
      where: { id: input.id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.phone !== undefined ? { phone: normalizePhone(input.phone) } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });

    return this.getOne.execute({ id: input.id });
  }
}
