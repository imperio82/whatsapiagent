import type { Prisma } from "@prisma/client";
import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { NotFoundError } from "@shared/domain/errors";
import { prisma } from "@shared/infrastructure/prisma/client";
import type { MatchingService } from "@modules/matching/application/matching.service";
import {
  createListingSchema,
  type CreateListingInput,
  type ListingDto,
  type ListListingsInput,
  type UpdateListingInput,
  updateListingSchema,
} from "./dtos";

/**
 * Inventario de bienes (vehículos e inmuebles) del perfil de intermediación.
 * Usa los permisos de productos: el inventario es el catálogo de este tipo de negocio.
 */

type ListingRow = Prisma.ListingGetPayload<{ include: typeof include }>;

function toDto(l: ListingRow): ListingDto {
  const attributes =
    l.attributes && typeof l.attributes === "object" && !Array.isArray(l.attributes)
      ? Object.fromEntries(Object.entries(l.attributes).map(([k, v]) => [k, String(v)]))
      : {};
  return {
    id: l.id,
    code: l.code,
    kind: l.kind,
    operation: l.operation,
    title: l.title,
    description: l.description,
    priceCop: Number(l.priceCop),
    city: l.city,
    zone: l.zone,
    attributes,
    photos: l.photos,
    status: l.status,
    ownerName: l.ownerName,
    ownerPhone: l.ownerPhone,
    exactAddress: l.exactAddress,
    privateNotes: l.privateNotes,
    interestedCount: l._count.leads,
    pendingMatches: l._count.matches,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

const include = {
  _count: { select: { leads: true, matches: { where: { status: "PENDING" as const } } } },
} as const;

/** Cruza el bien con los compradores; si falla, el bien igual queda guardado. */
async function runMatches(matching: MatchingService | undefined, tenantId: string, listingId: string): Promise<number> {
  if (!matching) return 0;
  try {
    const { created } = await matching.findMatchesForListing(tenantId, listingId);
    return created;
  } catch (err) {
    console.error("[listings] no se pudieron buscar compradores:", err);
    return 0;
  }
}

export class ListListingsUseCase {
  async execute(input: ListListingsInput): Promise<ListingDto[]> {
    authorize("products.read");
    const { tenantId } = TenantContext.require();
    const search = input.search;
    const rows = await prisma.listing.findMany({
      where: {
        tenantId,
        ...(input.kind ? { kind: input.kind } : {}),
        ...(input.status ? { status: input.status } : { status: { not: "ARCHIVED" } }),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: "insensitive" } },
                { code: { contains: search, mode: "insensitive" } },
                { city: { contains: search, mode: "insensitive" } },
                { zone: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include,
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 500,
    });
    return rows.map(toDto);
  }
}

export class CreateListingUseCase {
  constructor(private readonly matching?: MatchingService) {}

  async execute(raw: CreateListingInput): Promise<ListingDto> {
    authorize("products.create");
    const { tenantId } = TenantContext.require();
    const input = createListingSchema.parse(raw);

    const created = await prisma.$transaction(async (tx) => {
      const { listingSeq } = await tx.tenant.update({
        where: { id: tenantId },
        data: { listingSeq: { increment: 1 } },
        select: { listingSeq: true },
      });
      return tx.listing.create({
        data: {
          ...input,
          tenantId,
          code: `INV-${String(listingSeq).padStart(4, "0")}`,
          priceCop: BigInt(input.priceCop),
          photos: input.photos ?? [],
          status: input.status ?? "AVAILABLE",
        },
        include,
      });
    });
    const newMatches = created.status === "AVAILABLE" ? await runMatches(this.matching, tenantId, created.id) : 0;
    return { ...toDto(created), newMatches };
  }
}

export class UpdateListingUseCase {
  constructor(private readonly matching?: MatchingService) {}

  async execute(id: string, raw: UpdateListingInput): Promise<ListingDto> {
    authorize("products.update");
    const { tenantId } = TenantContext.require();
    const input = updateListingSchema.parse(raw);
    const existing = await prisma.listing.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundError("Bien no encontrado");

    const { priceCop, ...rest } = input;
    const updated = await prisma.listing.update({
      where: { id },
      data: { ...rest, ...(priceCop !== undefined ? { priceCop: BigInt(priceCop) } : {}) },
      include,
    });
    // Al aprobarlo o reactivarlo se buscan compradores (los que ya recibieron propuesta no se repiten)
    const becameAvailable = existing.status !== "AVAILABLE" && updated.status === "AVAILABLE";
    const newMatches = becameAvailable ? await runMatches(this.matching, tenantId, id) : 0;
    return { ...toDto(updated), newMatches };
  }
}

/** No se borra: se archiva, para no perder los leads y citas que lo referencian. */
export class ArchiveListingUseCase {
  async execute(id: string): Promise<void> {
    authorize("products.delete");
    const { tenantId } = TenantContext.require();
    const { count } = await prisma.listing.updateMany({ where: { id, tenantId }, data: { status: "ARCHIVED" } });
    if (count === 0) throw new NotFoundError("Bien no encontrado");
  }
}
