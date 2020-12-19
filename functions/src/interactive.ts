import { PubSub } from "@google-cloud/pubsub";
import { createMessageAdapter } from "@slack/interactive-messages";

import { toBufferJson } from "./common/utils";
import { CONFIG } from "./firebase/config";
import { functions, logger } from "./firebase/functions";
import { Action } from "./slack/actionIds";

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
