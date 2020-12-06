import { createMessageAdapter } from "@slack/interactive-messages";
import { WebClient } from "@slack/web-api";

import { CONFIG } from "./firebase/config";
import { FieldValue, SlackOAuth, SlackOAuthDB } from "./firebase/firestore";
import { functions, logger } from "./firebase/functions";

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

slackInteractions.action({ actionId: ConversationsSelectId }, async (_payload, respond) => {
  logger.info(_payload);
  const payload = _payload as ConversationPayload;
  const channelId = payload.actions.find((action) => action.type === "conversations_select")?.selected_conversation;
  if (!channelId) {
    return;
  }

  const SlackOAuthDoc = await SlackOAuthDB.doc(payload.team.id).get();
  const data = SlackOAuthDoc.data() as SlackOAuth;
  const {
    installation: { bot, team },
  } = data;
  if (!bot) {
    return;
  }

  data.targetChannelId = channelId;
  data.updatedAt = FieldValue.serverTimestamp();
  await SlackOAuthDB.doc(team.id).set(data);

  const { token, userId } = bot;
  const web = new WebClient(token);
  await web.chat.postMessage({
    channel: channelId,
    text: `:wave: <@${userId}> が投稿するよ！`,
    token,
  });
});

export const slackInteractive = functions.https.onRequest(slackInteractions.requestListener());
