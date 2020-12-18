import { verifyRequestSignature } from "@slack/events-api";
import { Checkboxes, KnownBlock, Option, View } from "@slack/web-api";

import { CONFIG } from "./firebase/config";
import { SlackOAuth } from "./firebase/firestore";
import { functions, logger } from "./firebase/functions";
import { Action, CheckedValue } from "./interactive";
import { SlackClient } from "./slack/client";

type EventCommonJson<T> = {
  api_app_id: string;
  token: string;
  team_id: string;
  type: string;
  event: T;
};

type AppHomeOpened = EventCommonJson<{
  type: "app_home_opened";
  user: string;
}>;

type ChannelCreated = EventCommonJson<{
  type: "channel_created";
  channel: {
    id: string;
    name: string;
    created: number;
    creator: string;
  };
}>;

type EmojiChanged = EventCommonJson<{
  type: "emoji_changed";
  subtype: "add" | "remove" | "rename";
  name: string;
  value: string;
  event_ts: string;
}>;

type EventBody = AppHomeOpened | ChannelCreated | EmojiChanged;

export const slackEvent = functions.https.onRequest(async (request, response) => {
  verifyRequestSignature({
    signingSecret: CONFIG.slack.signing_secret,
    requestSignature: request.headers["x-slack-signature"] as string,
    requestTimestamp: parseInt(request.headers["x-slack-request-timestamp"] as string, 10),
    body: request.rawBody.toString(),
  });

  logger.info(request.body);

  const body: EventBody = request.body;
  const {
    event: { type },
    team_id,
  } = body;

  const client = await SlackClient.new(team_id);
  const {
    slackOAuthData,
    slackOAuthData: { targetChannelId },
    web,
    bot: { token },
  } = client;

  if (type === "app_home_opened") {
    const {
      event: { user },
    } = body as AppHomeOpened;

    await web.views.publish({
      token,
      user_id: user,
      view: createHomeTab(slackOAuthData),
    });
  }

  if (type === "channel_created") {
    const {
      event: { channel },
    } = body as ChannelCreated;

    if (targetChannelId) {
      await web.chat.postMessage({
        channel: targetChannelId,
        text: `:new: チャンネル <#${channel.id}> が作成されました！ みんなも参加しよう！`,
        token,
      });
    }

    await web.conversations.join({ token, channel: channel.id });
  }

  if (type === "emoji_changed") {
    const {
      event: { subtype, name, value },
    } = body as EmojiChanged;
    if (subtype === "add") {
      if (targetChannelId) {
        await web.chat.postMessage({
          channel: targetChannelId,
          text: `:new: リアクション :${name}: が追加されました！ みんなも使ってみよう！`,
          attachments: [{ blocks: [{ type: "image", image_url: value, alt_text: value }] }],
          token,
        });
      }
    }
  }

  response.send(request.body.challenge);
});

export const createHomeTab = (slackOAuthData: SlackOAuth) => {
  const { isAllPublicChannel, joinedChannelIds, targetChannelId } = slackOAuthData;

  const joinChannelListBlock: KnownBlock = {
    type: "section",
    text: {
      type: "mrkdwn",
      text:
        "【必須】botと連携するチャンネルを設定してください\n\n連携したチャンネルのみ人気のメッセージをチェックできます",
    },
  };

  const joinAllChannelOption: Option = {
    text: {
      type: "mrkdwn",
      text: "*全てのpublicチャンネルと連携する*",
    },
    description: {
      type: "plain_text",
      text: "新しく作成されたpublicチャンネルにも自動で連携されます",
    },
    value: CheckedValue,
  };

  const joinAllChannelCheckbox: Checkboxes = {
    type: "checkboxes",
    action_id: Action.JoinAllChannel,
    options: [joinAllChannelOption],
    confirm: {
      title: {
        type: "plain_text",
        text: isAllPublicChannel ? "連携を解除しますか？" : "連携しますか？",
      },
      text: {
        type: "mrkdwn",
        text: "人気のメッセージをチェックするには連携が必要です",
      },
      confirm: {
        type: "plain_text",
        text: isAllPublicChannel ? "連携解除" : "連携する",
      },
      deny: {
        type: "plain_text",
        text: "キャンセル",
      },
      style: isAllPublicChannel ? "danger" : "primary",
    },
  };

  if (isAllPublicChannel) {
    joinAllChannelCheckbox.initial_options = [joinAllChannelOption];
  } else {
    joinChannelListBlock.accessory = {
      action_id: Action.JoinChennelList,
      type: "multi_channels_select",
      initial_channels: joinedChannelIds ?? [],
      placeholder: {
        type: "plain_text",
        text: "【必須】チャンネル選択",
      },
    };
  }

  const view: View = {
    type: "home",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*【必須】* botの投稿先のチャンネルを設定してください",
        },
        accessory: {
          action_id: Action.SelectTargetChannel,
          type: "channels_select",
          initial_channel: targetChannelId,
          placeholder: {
            type: "plain_text",
            text: "【必須】チャンネル選択",
          },
        },
      },
      { type: "divider" },
      joinChannelListBlock,
      {
        type: "actions",
        elements: [joinAllChannelCheckbox],
      },
      {
        type: "divider",
      },
    ],
  };
  return view;
};
