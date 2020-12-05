import * as crypto from "crypto";

import { InstallProvider } from "@slack/oauth";

import { CONFIG } from "./firebase/config";
import { FieldValue, SlackOAuth, SlackOAuthDB, SlackOAuthState, SlackOAuthStateDB } from "./firebase/firestore";
import { functions, logger } from "./firebase/functions";

const installer = new InstallProvider({
  clientId: CONFIG.slack.client_id,
  clientSecret: CONFIG.slack.client_secret,
  authVersion: "v2",
  stateStore: {
    generateStateParam: async (installUrlOptions, date) => {
      const state = crypto.randomBytes(20).toString("hex");
      const data: SlackOAuthState = {
        installUrlOptions,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      };
      await SlackOAuthStateDB.doc(state).set(data);
      return state;
    },
    verifyStateParam: async (date, state) => {
      const SlackOAuthStateDoc = await SlackOAuthStateDB.doc(state).get();
      const data = SlackOAuthStateDoc.data() as SlackOAuthState;
      return data.installUrlOptions;
    },
  },
  installationStore: {
    storeInstallation: async (installation) => {
      const data: SlackOAuth = {
        installation,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      };
      await SlackOAuthDB.doc(installation.team.id).set(data);
    },
    fetchInstallation: async (installQuery) => {
      const SlackOAuthDoc = await SlackOAuthDB.doc(installQuery.teamId).get();
      const data = SlackOAuthDoc.data() as SlackOAuth;
      return data.installation;
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
