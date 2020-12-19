import { SlackOAuth } from "../firebase/firestore";
import { SlackClient } from "../slack/client";

import { getConversationsList } from "./getConversationsList";

export const updateJoinedChannelIds = async (client: SlackClient, refetch = false) => {
  const conversationsListResult = await getConversationsList(client);

  const joinedChannelIds = conversationsListResult.channels
    .filter((channel) => channel.is_member)
    .map((channel) => channel.id);

  const slackOAuthData: Partial<SlackOAuth> = {
    isAllPublicChannel: false,
    joinedChannelIds,
  };
  await client.update(slackOAuthData, refetch);
};
