import { InstallProvider } from "@slack/oauth";

import { CONFIG } from "./firebase/config";
import { FieldValue, SlackOAuth, SlackOAuthDB } from "./firebase/firestore";
import { functions, logger } from "./firebase/functions";

const installer = new InstallProvider({
  clientId: CONFIG.slack.client_id,
  clientSecret: CONFIG.slack.client_secret,
  stateSecret: CONFIG.slack.state_secret,
  authVersion: "v2",
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
    scopes: [
      "channels:history",
      "channels:join",
      "channels:read",
      "chat:write",
      "reactions:read",
      "emoji:read",
      "chat:write.public",
    ],
    redirectUri: CONFIG.slack.redirect_uri,
  });
  logger.debug(url);
  response.redirect(url);
});

export const slackOAuthRedirect = functions.https.onRequest(async (request, response) => {
  await installer.handleCallback(request, response);
});
