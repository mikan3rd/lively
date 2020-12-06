import { createMessageAdapter } from "@slack/interactive-messages";

import { CONFIG } from "./firebase/config";
import { FieldValue, SlackOAuthDB } from "./firebase/firestore";
import { functions, logger } from "./firebase/functions";
import { SlackClient } from "./slack/client";

export const ConversationsSelectId = "conversations_select" as const;

type ConversationPayload = {
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

const slackInteractions = createMessageAdapter(CONFIG.slack.signing_secret);

slackInteractions.action({ actionId: ConversationsSelectId }, async (payload, respond) => {
  logger.info(payload);
  const { team, actions } = payload as ConversationPayload;
  const channelId = actions.find((action) => action.type === "conversations_select")?.selected_conversation;
  if (!channelId) {
    return;
  }

  const client = await SlackClient.new(team.id);
  const { web, bot } = client;
  let { slackOAuthData } = client;

  slackOAuthData = {
    ...slackOAuthData,
    targetChannelId: channelId,
    updatedAt: FieldValue.serverTimestamp(),
  };
  await SlackOAuthDB.doc(team.id).set(slackOAuthData);

  const { token, userId } = bot;
  await web.chat.postMessage({
    channel: channelId,
    text: `:tada: <@${userId}> が投稿を開始します！ お楽しみに！`,
    token,
  });
});

export const slackInteractive = functions.https.onRequest(slackInteractions.requestListener());
