import {
  GetSimulatorStatusUseCase,
  GetSimulatorTraceUseCase,
  SendSimulatedMessageUseCase,
  simulatorMessageSchema,
  type SimulatorStatusDto,
  type SimulatorTurnDto,
} from "../application/use-cases";

export class SimulatorController {
  private readonly statusUC = new GetSimulatorStatusUseCase();
  private readonly sendUC = new SendSimulatedMessageUseCase();
  private readonly traceUC = new GetSimulatorTraceUseCase();

  status(): Promise<SimulatorStatusDto> {
    return this.statusUC.execute();
  }

  send(body: unknown): Promise<{ conversationId: string }> {
    return this.sendUC.execute(simulatorMessageSchema.parse(body));
  }

  trace(conversationId: string): Promise<SimulatorTurnDto[]> {
    return this.traceUC.execute(conversationId);
  }
}
