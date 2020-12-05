import * as crypto from "crypto";

import { InstallProvider, InstallURLOptions, Installation } from "@slack/oauth";

import { CONFIG } from "./firebase/config";
import { SlackOAuthDB, SlackOAuthStateDB } from "./firebase/firestore";
import { functions, logger } from "./firebase/functions";

const authVersion = "v2" as const;

const installer = new InstallProvider({
  clientId: CONFIG.slack.client_id,
  clientSecret: CONFIG.slack.client_secret,
  authVersion,
  stateStore: {
    generateStateParam: async (installUrlOptions, date) => {
      const state = crypto.randomBytes(20).toString("hex");
      await SlackOAuthStateDB.doc(state).set(installUrlOptions);
      return state;
    },
    verifyStateParam: async (date, state) => {
      const SlackOAuthStateDoc = await SlackOAuthStateDB.doc(state).get();
      const data = SlackOAuthStateDoc.data() as InstallURLOptions;
      return data;
    },
  },
  installationStore: {
    storeInstallation: async (installation) => {
      await SlackOAuthDB.doc(installation.team.id).set(installation);
    },
    fetchInstallation: async (installQuery) => {
      const SlackOAuthDoc = await SlackOAuthDB.doc(installQuery.teamId).get();
      const data = SlackOAuthDoc.data() as Installation<typeof authVersion, false>;
      return data;
    },
  },
});

export const slackOAuthUrl = functions.https.onRequest(async (request, response) => {
  const url = await installer.generateInstallUrl({
    scopes: ["channels:history", "reactions:read", "emoji:read"],
    redirectUri: CONFIG.slack.redirect_uri,
  });
  logger.debug(url);
  response.redirect(url);
});

export const slackOAuthRedirect = functions.https.onRequest(async (request, response) => {
  await installer.handleCallback(request, response);
});
