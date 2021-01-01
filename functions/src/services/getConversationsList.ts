import { SlackClient } from "@/slack/client";
import { ConversationListResult } from "@/types/SlackWebAPICallResult";

const defaultConversationListParams = {
  limit: 1000,
  exclude_archived: true,
  types: "public_channel",
};

export const getConversationsList = async (client: SlackClient) => {
  const {
    web,
    bot: { token },
  } = client;

  const conversationListParams = {
    ...defaultConversationListParams,
    token,
  };
  return (await web.conversations.list(conversationListParams)) as ConversationListResult;
};
