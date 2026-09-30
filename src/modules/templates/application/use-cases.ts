import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { ConflictError, NotFoundError } from "@shared/domain/errors";
import type { UseCase } from "@shared/domain/use-case";
import { prisma } from "@shared/infrastructure/prisma/client";
import {
  extractVariables,
  type TemplateCategoryValue,
  type TemplateDto,
  type UpsertTemplateInput,
} from "./dtos";

function toDto(t: {
  id: string;
  key: string;
  name: string;
  body: string;
  category: string;
  variables: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): TemplateDto {
  return {
    id: t.id,
    key: t.key,
    name: t.name,
    body: t.body,
    category: t.category as TemplateCategoryValue,
    variables: t.variables,
    isActive: t.isActive,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export class ListTemplatesUseCase implements UseCase<void, TemplateDto[]> {
  async execute(): Promise<TemplateDto[]> {
    authorize("templates.read");
    const { tenantId } = TenantContext.require();
    const rows = await prisma.messageTemplate.findMany({
      where: { tenantId },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map(toDto);
  }
}

export class CreateTemplateUseCase implements UseCase<UpsertTemplateInput, TemplateDto> {
  async execute(input: UpsertTemplateInput): Promise<TemplateDto> {
    authorize("templates.manage");
    const { tenantId } = TenantContext.require();

    const exists = await prisma.messageTemplate.findUnique({
      where: { tenantId_key: { tenantId, key: input.key } },
    });
    if (exists) throw new ConflictError("Ya existe una plantilla con esa clave");

    const created = await prisma.messageTemplate.create({
      data: {
        tenantId,
        key: input.key,
        name: input.name,
        body: input.body,
        category: input.category,
        variables: extractVariables(input.body),
        isActive: input.isActive,
      },
    });
    return toDto(created);
  }
}

export class UpdateTemplateUseCase
  implements UseCase<{ id: string } & Partial<UpsertTemplateInput>, TemplateDto>
{
  async execute(input: { id: string } & Partial<UpsertTemplateInput>): Promise<TemplateDto> {
    authorize("templates.manage");
    const { tenantId } = TenantContext.require();

    const existing = await prisma.messageTemplate.findFirst({
      where: { id: input.id, tenantId },
    });
    if (!existing) throw new NotFoundError("Plantilla no encontrada");

    const updated = await prisma.messageTemplate.update({
      where: { id: input.id },
      data: {
        ...(input.key !== undefined ? { key: input.key } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.body !== undefined
          ? { body: input.body, variables: extractVariables(input.body) }
          : {}),
      },
    });
    return toDto(updated);
  }
}

export class DeleteTemplateUseCase implements UseCase<{ id: string }, void> {
  async execute({ id }: { id: string }): Promise<void> {
    authorize("templates.manage");
    const { tenantId } = TenantContext.require();
    await prisma.messageTemplate.deleteMany({ where: { id, tenantId } });
  }
}
