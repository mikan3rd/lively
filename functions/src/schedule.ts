import { WebClient } from "@slack/web-api";

import { CONFIG } from "./firebase/config";
import { functions } from "./firebase/functions";
import { ConversationHistoryResult, ConversationListResult } from "./types/SlackWebAPICallResult";

export const slackReactionList = functions.https.onRequest(async (request, response) => {
  const token = CONFIG.slack.test_auth_token;
  const web = new WebClient(token);

  const conversationsListResult = (await web.conversations.list({
    token,
    limit: 1000,
    exclude_archived: true,
    types: "public_channel",
  })) as ConversationListResult;

  const sortedChannels = conversationsListResult.channels.sort((a, b) => (a.num_members > b.num_members ? -1 : 1));
  for (const channel of sortedChannels) {
    console.log(channel.id);
    const conversationHistoryResult = (await web.conversations.history({
      token,
      channel: channel.id,
      inclusive: true,
      limit: 1000,
    })) as ConversationHistoryResult;
    console.log(conversationHistoryResult);
  }

  response.send();
});
