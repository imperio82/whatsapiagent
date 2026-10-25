import { api } from "./api-client";
import type {
  SimulatorMessageInput,
  SimulatorStatusDto,
  SimulatorTurnDto,
} from "@modules/simulator/application/use-cases";

export const simulatorService = {
  status: () => api.get<SimulatorStatusDto>("/api/v1/simulator"),
  send: (input: SimulatorMessageInput) => api.post<{ conversationId: string }>("/api/v1/simulator/messages", input),
  trace: (conversationId: string) =>
    api.get<SimulatorTurnDto[]>(`/api/v1/simulator/conversations/${conversationId}/trace`),
};
