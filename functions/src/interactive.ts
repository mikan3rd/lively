import { PubSub } from "@google-cloud/pubsub";
import { CloudTasksClient } from "@google-cloud/tasks";
import { createMessageAdapter } from "@slack/interactive-messages";
import dayjs from "dayjs";

import { chunk, toBase64, toBufferJson } from "./common/utils";
import { CONFIG } from "./firebase/config";
import { SlackOAuth } from "./firebase/firestore";
import { functions, logger } from "./firebase/functions";
import { Action } from "./slack/actionIds";
import { SlackClient } from "./slack/client";
import { createHomeView } from "./slack/createHomeView";
import { ConversationListResult } from "./types/SlackWebAPICallResult";

export const JoinTaskQueue = "join-channel" as const;

const BulkChannelThreshold = 40;

type JoinChannelBody = { teamId: string; channelIds: string[] };

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
  actions: (T & { block_id: string; action_ts: string; action_id: string })[];
};

type ConversationsSelectPayload = CommonPayload<{
  type: "conversations_select";
  selected_conversation: string;
}>;

type MultiChannelsSelectPayload = CommonPayload<{
  type: "multi_channels_select";
  selected_channels: string[];
}>;

type CheckBoxPayload = CommonPayload<{
  type: "checkboxes";
  selected_options: {
    text: { type: string; verbatim: boolean; text: string };
    value: string;
  }[];
}>;

type StaticSelectPayload = CommonPayload<{
  type: "static_select";
  selected_option: {
    text: { type: string; verbatim: boolean; text: string };
    value: string;
  };
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

slackInteractions.action({ actionId: Action.SelectTrendNum }, async (payload, respond) => {
  logger.info(payload);
  const pubSub = new PubSub();
  await pubSub.topic(Action.SelectTrendNum).publish(toBufferJson(payload));
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

    const joinChannels = conversationsListResult.channels.filter((channel) => selectedChannelIds.includes(channel.id));
    await createJoinChannelTask(team.id, joinChannels);

    for (const channel of conversationsListResult.channels) {
      if (!selectedChannelIds.includes(channel.id) && channel.is_member) {
        await web.conversations.leave({ token, channel: channel.id }).catch((e) => logger.error(e));
      }
    }
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
      await updateJoinedChannelIds(client, true);
      await web.views.publish({
        token,
        user_id: user.id,
        view: createHomeView(client.slackOAuthData),
      });
      return;
    }

    const conversationListParams = {
      ...defaultConversationListParams,
      token,
    };
    const conversationsListResult = (await web.conversations.list(conversationListParams)) as ConversationListResult;

    await createJoinChannelTask(team.id, conversationsListResult.channels);

    const slackOAuthData: Partial<SlackOAuth> = {
      isAllPublicChannel,
    };
    await client.update(slackOAuthData, true);

    await web.views.publish({
      token,
      user_id: user.id,
      view: createHomeView(client.slackOAuthData),
    });
  });

export const selectTrendNumPubSub = functions
  .runWith({ maxInstances: 1 })
  .pubsub.topic(Action.SelectTrendNum)
  .onPublish(async (message) => {
    const { team, actions, user }: StaticSelectPayload = message.json;
    const selectedOption = actions.find((action) => action.action_id === Action.SelectTrendNum)?.selected_option;

    if (!selectedOption) {
      return;
    }

    const client = await SlackClient.new(team.id);
    const {
      web,
      bot: { token },
    } = client;

    const slackOAuthData: Partial<SlackOAuth> = {
      selectedTrendNum: Number(selectedOption.value),
    };
    await client.update(slackOAuthData, true);

    await web.views.publish({
      token,
      user_id: user.id,
      view: createHomeView(client.slackOAuthData),
    });
  });

export const joinChannelTask = functions.https.onRequest(async (request, response) => {
  logger.log(request.body);
  const body: JoinChannelBody = request.body;
  const client = await SlackClient.new(body.teamId);
  const {
    web,
    bot: { token },
    slackOAuthData: { isAllPublicChannel },
  } = client;
  for (const channelId of body.channelIds) {
    await web.conversations.join({ token, channel: channelId }).catch((e) => logger.error(e));
  }

  if (!isAllPublicChannel) {
    await updateJoinedChannelIds(client);
  }

  response.send();
});

const createJoinChannelTask = async (teamId: string, channels: ConversationListResult["channels"]) => {
  const channelIds = channels.filter((channel) => !channel.is_member).map((channel) => channel.id);
  const bulkChannelIds = chunk(channelIds, BulkChannelThreshold);
  const tasksClient = new CloudTasksClient();
  for (const [index, channelIds] of bulkChannelIds.entries()) {
    const body: JoinChannelBody = { teamId, channelIds };
    const [response] = await tasksClient.createTask({
      parent: tasksClient.queuePath(CONFIG.cloud_task.project, CONFIG.cloud_task.location, JoinTaskQueue),
      task: {
        scheduleTime: {
          seconds: dayjs()
            .add(index * 2, "minute")
            .unix(),
        },
        httpRequest: {
          headers: { "Content-Type": "application/json" },
          httpMethod: "POST",
          url: `${CONFIG.cloud_task.base_url}/joinChannelTask`,
          body: toBase64(body),
        },
      },
    });
    logger.log(response);
  }
};

const updateJoinedChannelIds = async (client: SlackClient, refetch = false) => {
  const {
    web,
    bot: { token },
  } = client;
  const conversationsListResult = (await web.conversations.list({
    ...defaultConversationListParams,
    token,
  })) as ConversationListResult;

  const joinedChannelIds = conversationsListResult.channels
    .filter((channel) => channel.is_member)
    .map((channel) => channel.id);

  const slackOAuthData: Partial<SlackOAuth> = {
    isAllPublicChannel: false,
    joinedChannelIds,
  };
  await client.update(slackOAuthData, refetch);
};
