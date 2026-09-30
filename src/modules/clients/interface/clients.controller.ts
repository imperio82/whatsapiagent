import type { Page } from "@shared/domain/repository";
import {
  createClientSchema,
  listClientsSchema,
  updateClientSchema,
  type ClientDetailDto,
  type ClientListItemDto,
} from "../application/dtos";
import {
  CreateClientUseCase,
  GetClientUseCase,
  ListClientsUseCase,
  UpdateClientUseCase,
} from "../application/use-cases";

export class ClientsController {
  private readonly list = new ListClientsUseCase();
  private readonly getOne = new GetClientUseCase();
  private readonly create = new CreateClientUseCase();
  private readonly update = new UpdateClientUseCase();

  async listClients(query: URLSearchParams): Promise<Page<ClientListItemDto>> {
    const input = listClientsSchema.parse(Object.fromEntries(query.entries()));
    return this.list.execute(input);
  }

  async getClient(id: string): Promise<ClientDetailDto> {
    return this.getOne.execute({ id });
  }

  async createClient(body: unknown): Promise<ClientDetailDto> {
    const input = createClientSchema.parse(body);
    return this.create.execute(input);
  }

  async updateClient(id: string, body: unknown): Promise<ClientDetailDto> {
    const input = updateClientSchema.parse(body);
    return this.update.execute({ id, ...input });
  }
}
