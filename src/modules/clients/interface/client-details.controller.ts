import { z } from "zod";
import {
  AddClientRelationUseCase,
  DeleteClientDateUseCase,
  DeleteClientRelationUseCase,
  GetClientDetailsUseCase,
  SaveClientDateUseCase,
  SetGreetingsOptOutUseCase,
} from "../application/details.use-cases";

const optOutSchema = z.object({ greetingsOptOut: z.boolean() });

export class ClientDetailsController {
  get(clientId: string) {
    return new GetClientDetailsUseCase().execute(clientId);
  }

  async update(clientId: string, body: unknown) {
    const { greetingsOptOut } = optOutSchema.parse(body);
    await new SetGreetingsOptOutUseCase().execute(clientId, greetingsOptOut);
    return new GetClientDetailsUseCase().execute(clientId);
  }

  addDate(clientId: string, body: unknown) {
    return new SaveClientDateUseCase().execute(clientId, body);
  }

  updateDate(clientId: string, dateId: string, body: unknown) {
    return new SaveClientDateUseCase().execute(clientId, body, dateId);
  }

  deleteDate(clientId: string, dateId: string) {
    return new DeleteClientDateUseCase().execute(clientId, dateId);
  }

  addRelation(clientId: string, body: unknown) {
    return new AddClientRelationUseCase().execute(clientId, body);
  }

  deleteRelation(clientId: string, relationId: string) {
    return new DeleteClientRelationUseCase().execute(clientId, relationId);
  }
}
