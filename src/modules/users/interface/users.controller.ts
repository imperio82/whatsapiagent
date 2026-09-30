import { ListMembersUseCase, type MemberDto } from "../application/list-members.use-case";

export class UsersController {
  private readonly list = new ListMembersUseCase();

  async listMembers(): Promise<MemberDto[]> {
    return this.list.execute();
  }
}
