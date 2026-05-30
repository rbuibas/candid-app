import { authedRequest } from './client';

export type GroupMember = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  joined_at: string;
};

export function listMembers(groupId: string): Promise<GroupMember[]> {
  return authedRequest<GroupMember[]>(`/groups/${groupId}/members`);
}
