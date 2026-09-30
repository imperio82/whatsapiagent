import { upsertTemplateSchema, type TemplateDto } from "../application/dtos";
import {
  CreateTemplateUseCase,
  DeleteTemplateUseCase,
  ListTemplatesUseCase,
  UpdateTemplateUseCase,
} from "../application/use-cases";

export class TemplatesController {
  private readonly list = new ListTemplatesUseCase();
  private readonly create = new CreateTemplateUseCase();
  private readonly update = new UpdateTemplateUseCase();
  private readonly remove = new DeleteTemplateUseCase();

  listTemplates(): Promise<TemplateDto[]> {
    return this.list.execute();
  }
  createTemplate(body: unknown): Promise<TemplateDto> {
    return this.create.execute(upsertTemplateSchema.parse(body));
  }
  updateTemplate(id: string, body: unknown): Promise<TemplateDto> {
    const input = upsertTemplateSchema.partial().parse(body);
    return this.update.execute({ id, ...input });
  }
  deleteTemplate(id: string): Promise<void> {
    return this.remove.execute({ id });
  }
}
