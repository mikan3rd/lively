import { SlackOAuth } from "@/firebase/firestore";
import { getConversationsList } from "@/services/getConversationsList";
import { SlackClient } from "@/slack/client";

export const updateJoinedChannelIds = async (client: SlackClient, refetch = false) => {
  const { channels } = await getConversationsList(client);

  const joinedChannelIds = channels.filter((channel) => channel.is_member).map((channel) => channel.id);

  const slackOAuthData: Partial<SlackOAuth> = {
    isAllPublicChannel: false,
    joinedChannelIds,
  };
  await client.update(slackOAuthData, refetch);
};
