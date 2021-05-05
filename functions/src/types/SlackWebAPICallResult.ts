import { WebAPICallResult } from "@slack/web-api";

export interface ConversationListResult extends WebAPICallResult {
  channels: {
    id: string;
    name: string;
    num_members: number;
    is_member: boolean;
  }[];
}

export interface ConversationHistoryResult extends WebAPICallResult {
  messages: {
    type: "message";
    subtype?: "channel_join";
    user: string;
    text: string;
    ts: string;
    reactions?: {
      name: string;
      users: string[];
      count: number;
    }[];
  }[];
}

export interface ConversationMembersResult extends WebAPICallResult {
  members: string[];
}

export interface ChatGetPermalinkResult extends WebAPICallResult {
  channel: string;
  permalink: string;
}

export interface UsersInfoResult extends WebAPICallResult {
  user: {
    is_admin: boolean;
    is_owner: boolean;
    is_primary_owner: boolean;
    is_restricted: boolean;
    is_ultra_restricted: boolean;
    is_bot: boolean;
  };
}
