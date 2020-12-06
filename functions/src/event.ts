import { verifyRequestSignature } from "@slack/events-api";
import { View } from "@slack/web-api";

import { CONFIG } from "./firebase/config";
import { functions, logger } from "./firebase/functions";
import { ConversationsSelectId } from "./interactive";
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

type ReactionAdded = EventCommonJson<{
  type: "reaction_added";
  user: string;
  reaction: string;
  item_user: "string";
  item: {
    type: string;
    channel: string;
    ts: string;
  };
  event_ts: string;
}>;

type EmojiChanged = EventCommonJson<{
  type: "emoji_changed";
  subtype: "add" | "remove" | "rename";
  name: string;
  value: string;
  event_ts: string;
}>;

type EventBody = AppHomeOpened | ChannelCreated | ReactionAdded | EmojiChanged;

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
    slackOAuthData: { targetChannelId },
    web,
    bot: { token },
  } = client;

  if (type === "app_home_opened") {
    const {
      event: { user },
    } = body as AppHomeOpened;
    const view: View = {
      type: "home",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*[必須]* botの投稿先のチャンネルを設定してください",
          },
          accessory: {
            action_id: ConversationsSelectId,
            type: "conversations_select",
            initial_conversation: targetChannelId,
            placeholder: {
              type: "plain_text",
              text: "[必須]",
            },
            filter: {
              include: ["public"],
              exclude_bot_users: true,
            },
          },
        },
      ],
    };
    await web.views.publish({
      token,
      user_id: user,
      view,
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
