import { SlackOAuth } from "./firebase/firestore";
import { functions, logger } from "./firebase/functions";
import { createHomeView } from "./services/createHomeView";
import { createJoinChannelTask } from "./services/createJoinChannelTask";
import { getConversationsList } from "./services/getConversationsList";
import { updateJoinedChannelIds } from "./services/updateJoinedChannelIds";
import { Action } from "./slack/actionIds";
import { SlackClient } from "./slack/client";

type CommonBasePayload = {
  team: {
    id: string;
  };
  user: {
    id: string;
    name: string;
    team_id: string;
    username: string;
  };
};

type CommonBaseAction = {
  block_id: string;
  action_ts: string;
  action_id: string;
};

type CommonPayload<T> = {
  actions: (T & CommonBaseAction)[];
} & CommonBasePayload;

type ChannelsSelectPayload = CommonPayload<{
  type: "channels_select";
  selected_channel: string;
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

type MessageButtonPayload = {
  message: {
    type: "message";
    ts: string;
  };
  channel: {
    id: string;
  };
  actions: ({
    type: "button";
    action_id: string;
    value: string;
  } & CommonBaseAction)[];
} & CommonBasePayload;

export const selectTargetChannelPubSub = functions
  .runWith({ maxInstances: 1 })
  .pubsub.topic(Action.SelectTargetChannel)
  .onPublish(async (message) => {
    const { team, actions }: ChannelsSelectPayload = message.json;
    const channelId = actions.find((action) => action.action_id === Action.SelectTargetChannel)?.selected_channel;
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

    const { channels } = await getConversationsList(client);

    const joinChannels = channels.filter((channel) => selectedChannelIds.includes(channel.id));
    await createJoinChannelTask(team.id, joinChannels);

    for (const channel of channels) {
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

    const { channels } = await getConversationsList(client);

    await createJoinChannelTask(team.id, channels);

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

export const joinChannelButtonPubSub = functions
  .runWith({ maxInstances: 1 })
  .pubsub.topic(Action.JoinChannelButton)
  .onPublish(async (message) => {
    const {
      team,
      channel,
      message: { ts },
      actions,
    }: MessageButtonPayload = message.json;
    const tagrettChannelId = actions.find((action) => action.action_id === Action.JoinChannelButton)?.value;
    if (!tagrettChannelId) {
      return;
    }

    const client = await SlackClient.new(team.id);
    const {
      web,
      bot: { token },
      slackOAuthData: { isAllPublicChannel },
    } = client;

    await web.conversations.join({ token, channel: tagrettChannelId });

    if (!isAllPublicChannel) {
      await updateJoinedChannelIds(client);
    }

    await web.chat.update({
      token,
      channel: channel.id,
      ts,
      text: "",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `~チャンネル <#${tagrettChannelId}> と連携しませんか？~\n*連携しました！*`,
          },
        },
      ],
    });
  });
