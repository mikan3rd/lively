import { verifyRequestSignature } from "@slack/events-api";
import { View, WebClient } from "@slack/web-api";

import { CONFIG } from "./firebase/config";
import { SlackOAuth, SlackOAuthDB } from "./firebase/firestore";
import { functions, logger } from "./firebase/functions";
import { OpenModalId } from "./interactive";

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

type MessageEvent = EventCommonJson<{
  type: "message";
  channel: string;
  user: string;
  text: string;
  ts: string;
  event_ts: string;
  channel_type: string;
}>;

type EventBody = AppHomeOpened | ChannelCreated | MessageEvent;

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

  const SlackOAuthDoc = await SlackOAuthDB.doc(team_id).get();
  const oauthData = SlackOAuthDoc.data() as SlackOAuth;
  const token = oauthData.installation.bot?.token;

  if (!token) {
    response.status(400).send();
  }

  const web = new WebClient(token);

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
            text: "*botの投稿先のチャンネルを設定してください*",
          },
          accessory: {
            type: "button",
            action_id: OpenModalId,
            style: "primary",
            text: {
              type: "plain_text",
              text: "Add a Stickie",
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
    await web.chat.postMessage({ channel: channel.id, text: `#${channel.name} が作成されました`, token });
  }

  if (type === "message") {
    const {
      event: { channel, text },
    } = body as MessageEvent;
    await web.chat.postMessage({ channel, text, token });
  }

  response.send(request.body.challenge);
});
