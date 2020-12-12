import { functions } from "./firebase/functions";
import { SlackClient } from "./slack/client";
import {
  ChatGetPermalinkResult,
  ConversationHistoryResult,
  ConversationListResult,
} from "./types/SlackWebAPICallResult";

export const slackReactionList = functions.https.onRequest(async (request, response) => {
  const client = await SlackClient.new();
  const {
    web,
    bot: { token },
    slackOAuthData: { targetChannelId },
  } = client;

  if (!targetChannelId) {
    return;
  }

  const conversationsListResult = (await web.conversations.list({
    token,
    limit: 1000,
    exclude_archived: true,
    types: "public_channel",
  })) as ConversationListResult;

  let messages: { channelId: string; ts: string; reactionNum: number }[] = [];
  const sortedChannels = conversationsListResult.channels.sort((a, b) => (a.num_members > b.num_members ? -1 : 1));
  for (const channel of sortedChannels) {
    const conversationHistoryResult = (await web.conversations.history({
      token,
      channel: channel.id,
      inclusive: true,
      limit: 1000,
    })) as ConversationHistoryResult;
    const formedMessages = conversationHistoryResult.messages.map((message) => ({
      channelId: channel.id,
      ts: message.ts,
      reactionNum: message.reactions?.reduce((acc, reaction) => acc + reaction.count, 0) ?? 0,
    }));
    messages = messages.concat(formedMessages);
  }

  const sortedMessages = messages.sort((a, b) => (a.reactionNum > b.reactionNum ? -1 : 1));
  const targetMeesage = sortedMessages[0];
  const permalinkResult = (await web.chat.getPermalink({
    token,
    channel: targetMeesage.channelId,
    message_ts: targetMeesage.ts,
  })) as ChatGetPermalinkResult;

  await web.chat.postMessage({
    channel: targetChannelId,
    text: `:tada: この投稿が盛り上がってるよ！\n${permalinkResult.permalink}`,
    token,
  });

  response.send();
});
