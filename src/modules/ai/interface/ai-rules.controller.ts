import {
  CreateAiRuleUseCase,
  DeleteAiRuleUseCase,
  ListAiRulesUseCase,
  RestoreAiRulesUseCase,
  UpdateAiRuleUseCase,
  createAiRuleSchema,
  updateAiRuleSchema,
  type AiRuleDto,
} from "../application/ai-rules.use-cases";

export class AiRulesController {
  private readonly listUC = new ListAiRulesUseCase();
  private readonly createUC = new CreateAiRuleUseCase();
  private readonly updateUC = new UpdateAiRuleUseCase();
  private readonly deleteUC = new DeleteAiRuleUseCase();
  private readonly restoreUC = new RestoreAiRulesUseCase();

  list(): Promise<AiRuleDto[]> {
    return this.listUC.execute();
  }

  create(body: unknown): Promise<AiRuleDto> {
    return this.createUC.execute(createAiRuleSchema.parse(body));
  }

  update(id: string, body: unknown): Promise<AiRuleDto> {
    return this.updateUC.execute({ id, ...updateAiRuleSchema.parse(body) });
  }

  remove(id: string): Promise<void> {
    return this.deleteUC.execute(id);
  }

  restore(): Promise<AiRuleDto[]> {
    return this.restoreUC.execute();
  }
}
