import { PubSub } from "@google-cloud/pubsub";
import { createMessageAdapter } from "@slack/interactive-messages";

import { createHomeTab } from "./event";
import { CONFIG } from "./firebase/config";
import { FieldValue, SlackOAuth, SlackOAuthDB } from "./firebase/firestore";
import { functions, logger } from "./firebase/functions";
import { toBufferJson } from "./firebase/pubsub";
import { SlackClient } from "./slack/client";
import { ConversationListResult } from "./types/SlackWebAPICallResult";

export const Action = {
  SelectTargetChannel: "target_channel",
  JoinChennelList: "join_channel_list",
  JoinAllChannel: "join_all_channel",
} as const;

export const CheckedValue = "checked" as const;

type CommonPayload<T> = {
  team: {
    id: string;
  };
  user: {
    id: string;
    name: string;
    team_id: string;
    username: string;
  };
  actions: T[];
};

type ConversationsSelectPayload = CommonPayload<{
  type: "conversations_select";
  block_id: string;
  action_ts: string;
  action_id: string;
  selected_conversation: string;
}>;

type MultiChannelsSelectPayload = CommonPayload<{
  type: "multi_channels_select";
  block_id: string;
  action_ts: string;
  action_id: string;
  selected_channels: string[];
}>;

type CheckBoxPayload = CommonPayload<{
  type: "checkboxes";
  block_id: string;
  action_ts: string;
  action_id: string;
  selected_options: {
    text: { type: string; verbatim: boolean; text: string };
    value: typeof CheckedValue;
  }[];
}>;

const defaultConversationListParams = {
  limit: 1000,
  exclude_archived: true,
  types: "public_channel",
};

const slackInteractions = createMessageAdapter(CONFIG.slack.signing_secret);

slackInteractions.action({ actionId: Action.SelectTargetChannel }, async (payload, respond) => {
  logger.info(payload);
  const pubSub = new PubSub();
  await pubSub.topic(Action.SelectTargetChannel).publish(toBufferJson(payload));
});

slackInteractions.action({ actionId: Action.JoinChennelList }, async (payload, respond) => {
  logger.info(payload);
  const pubSub = new PubSub();
  await pubSub.topic(Action.JoinChennelList).publish(toBufferJson(payload));
});

slackInteractions.action({ actionId: Action.JoinAllChannel }, async (payload, respond) => {
  logger.info(payload);
  const pubSub = new PubSub();
  await pubSub.topic(Action.JoinAllChannel).publish(toBufferJson(payload));
});

export const slackInteractive = functions.https.onRequest(slackInteractions.requestListener());

export const selectTargetChannelPubSub = functions
  .runWith({ maxInstances: 1 })
  .pubsub.topic(Action.SelectTargetChannel)
  .onPublish(async (message) => {
    const { team, actions }: ConversationsSelectPayload = message.json;
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
    await client.update(slackOAuthData);

    const { token, userId } = bot;
    await web.chat.postMessage({
      channel: channelId,
      text: `:tada: <@${userId}> が投稿を開始します！ お楽しみに！`,
      token,
    });
  });

export const joinChannelListPubSub = functions
  .runWith({ maxInstances: 1 })
  .pubsub.topic(Action.JoinChennelList)
  .onPublish(async (message) => {
    const { team, actions }: MultiChannelsSelectPayload = message.json;

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
      ...defaultConversationListParams,
      token,
    };
    const conversationsListResult = (await web.conversations.list(conversationListParams)) as ConversationListResult;

    // FIXME: 一度に50以上の場合はレート制限を超える
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

    const nextSlackOAuthData: Partial<SlackOAuth> = {
      joinedChannelIds: nextJoinedChannelIds,
      updatedAt: FieldValue.serverTimestamp(),
    };
    await client.update(nextSlackOAuthData);
  });

export const joinAllChannelPubSub = functions
  .runWith({ maxInstances: 1 })
  .pubsub.topic(Action.JoinAllChannel)
  .onPublish(async (message) => {
    const { team, actions, user }: CheckBoxPayload = message.json;
    const selectedOptions = actions.find((action) => action.action_id === Action.JoinAllChannel)?.selected_options;

    if (!selectedOptions) {
      return;
    }

    const client = await SlackClient.new(team.id);
    const {
      web,
      bot: { token },
    } = client;

    const isAllPublicChannel = selectedOptions.length > 0;
    if (!isAllPublicChannel) {
      const conversationListParams = { ...defaultConversationListParams, token };
      const updatedConversationsListResult = (await web.conversations.list(
        conversationListParams,
      )) as ConversationListResult;

      const nextJoinedChannelIds = updatedConversationsListResult.channels
        .filter((channel) => channel.is_member)
        .map((channel) => channel.id);

      const slackOAuthData: Partial<SlackOAuth> = {
        isAllPublicChannel: false,
        joinedChannelIds: nextJoinedChannelIds,
        updatedAt: FieldValue.serverTimestamp(),
      };
      await client.update(slackOAuthData, true);

      await web.views.publish({
        token,
        user_id: user.id,
        view: createHomeTab(client.slackOAuthData),
      });
      return;
    }

    const conversationListParams = {
      ...defaultConversationListParams,
      token,
    };
    const conversationsListResult = (await web.conversations.list(conversationListParams)) as ConversationListResult;

    // FIXME: 一度に50以上の場合はレート制限を超える
    for (const channel of conversationsListResult.channels) {
      if (!channel.is_member) {
        await web.conversations.join({ token, channel: channel.id }).catch((e) => logger.error(e));
      }
    }

    const slackOAuthData: Partial<SlackOAuth> = {
      isAllPublicChannel,
      updatedAt: FieldValue.serverTimestamp(),
    };
    await client.update(slackOAuthData, true);

    await web.views.publish({
      token,
      user_id: user.id,
      view: createHomeTab(client.slackOAuthData),
    });
  });
