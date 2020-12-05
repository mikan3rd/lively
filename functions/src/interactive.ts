import { createMessageAdapter } from "@slack/interactive-messages";
// import { View, WebClient } from "@slack/web-api";

import { CONFIG } from "./firebase/config";
import { functions, logger } from "./firebase/functions";

export const OpenModalId = "open_modal" as const;

const slackInteractions = createMessageAdapter(CONFIG.slack.signing_secret);

slackInteractions.action({ actionId: OpenModalId }, async (payload, respond) => {
  logger.info(payload);
  //   const view: View = {};
  //   await web.views.publish({
  //     token,
  //     user_id: user,
  //     view,
  //   });
});

export const slackInteractive = functions.https.onRequest(slackInteractions.requestListener());
