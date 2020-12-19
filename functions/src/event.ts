import { verifyRequestSignature } from "@slack/events-api";

import { CONFIG } from "./firebase/config";
import { functions, logger } from "./firebase/functions";
import { createHomeView } from "./services/createHomeView";
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
      view: createHomeView(slackOAuthData),
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
