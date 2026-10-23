import { ListMembersUseCase, type MemberDto } from "../application/list-members.use-case";
import { UpdateMemberPhoneUseCase, type UpdateMemberPhoneInput } from "../application/update-member-phone.use-case";

export class UsersController {
  private readonly list = new ListMembersUseCase();
  private readonly updatePhone = new UpdateMemberPhoneUseCase();

  async listMembers(): Promise<MemberDto[]> {
    return this.list.execute();
  }

  async updateMemberPhone(membershipId: string, input: UpdateMemberPhoneInput): Promise<void> {
    return this.updatePhone.execute(membershipId, input);
  }
}
