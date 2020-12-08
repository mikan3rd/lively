import { createMessageAdapter } from "@slack/interactive-messages";

import { CONFIG } from "./firebase/config";
import { FieldValue, SlackOAuth, SlackOAuthDB } from "./firebase/firestore";
import { functions, logger } from "./firebase/functions";
import { SlackClient } from "./slack/client";
import { ConversationListResult } from "./types/SlackWebAPICallResult";

export const Action = {
  SelectTargetChannel: "target_channel",
  JoinChennelList: "join_channel_list",
  JoinAllChannel: "join_all_channel",
} as const;

type ConversationsSelectPayload = {
  team: {
    id: string;
  };
  actions: {
    type: "conversations_select";
    block_id: string;
    selected_conversation: string;
    action_ts: string;
    action_id: string;
  }[];
};

type MultiChannelsSelectPayload = {
  team: {
    id: string;
  };
  actions: {
    type: "multi_channels_select";
    block_id: string;
    selected_channels: string[];
    action_ts: string;
    action_id: string;
  }[];
};

const slackInteractions = createMessageAdapter(CONFIG.slack.signing_secret);

slackInteractions.action({ actionId: Action.SelectTargetChannel }, async (payload, respond) => {
  logger.info(payload);

  const { team, actions } = payload as ConversationsSelectPayload;
  const channelId = actions.find((action) => action.action_id === Action.SelectTargetChannel)?.selected_conversation;
  if (!channelId) {
    return;
  }

  const client = await SlackClient.new(team.id);
  const { web, bot } = client;

  const slackOAuthData: Partial<SlackOAuth> = {
    targetChannelId: channelId,
    updatedAt: FieldValue.serverTimestamp(),
  };
  await SlackOAuthDB.doc(team.id).set(slackOAuthData, { merge: true });

  const { token, userId } = bot;
  await web.chat.postMessage({
    channel: channelId,
    text: `:tada: <@${userId}> が投稿を開始します！ お楽しみに！`,
    token,
  });
});

slackInteractions.action({ actionId: Action.JoinChennelList }, async (payload, respond) => {
  logger.info(payload);

  const { team, actions } = payload as MultiChannelsSelectPayload;
  const selectedChannelIds = actions.find((action) => action.action_id === Action.JoinChennelList)?.selected_channels;
  if (!selectedChannelIds || selectedChannelIds.length === 0) {
    return;
  }

  const client = await SlackClient.new(team.id);
  const {
    web,
    bot: { token },
  } = client;

  const conversationListParams = {
    token,
    limit: 1000,
    exclude_archived: true,
    types: "public_channel",
  };
  const conversationsListResult = (await web.conversations.list(conversationListParams)) as ConversationListResult;

  for (const channel of conversationsListResult.channels) {
    if (selectedChannelIds.includes(channel.id) && !channel.is_member) {
      await web.conversations.join({ token, channel: channel.id }).catch((e) => logger.error(e));
    }
    if (!selectedChannelIds.includes(channel.id) && channel.is_member) {
      await web.conversations.leave({ token, channel: channel.id }).catch((e) => logger.error(e));
    }
  }

  const updatedConversationsListResult = (await web.conversations.list(
    conversationListParams,
  )) as ConversationListResult;

  const nextJoinedChannelIds = updatedConversationsListResult.channels
    .filter((channel) => channel.is_member)
    .map((channel) => channel.id);

  const slackOAuthData: Partial<SlackOAuth> = {
    joinedChannelIds: nextJoinedChannelIds,
    updatedAt: FieldValue.serverTimestamp(),
  };
  await SlackOAuthDB.doc(team.id).set(slackOAuthData, { merge: true });
});

slackInteractions.action({ actionId: Action.JoinAllChannel }, async (payload, respond) => {
  logger.info(payload);
});

export const slackInteractive = functions.https.onRequest(slackInteractions.requestListener());
