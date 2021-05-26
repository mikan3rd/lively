import { CloudTasksClient } from "@google-cloud/tasks";
import { InstallProvider, Installation, InstallationQuery } from "@slack/oauth";
import dayjs from "dayjs";

import { toBase64 } from "./common/utils";
import { CONFIG } from "./firebase/config";
import { FieldValue, FirestoreParams, SlackOAuth, SlackOAuthDB } from "./firebase/firestore";
import { functions } from "./firebase/functions";
import { Queue } from "./firebase/task";
import { SendFirstMessageBody } from "./https";

const getInstaller = () => {
  const installer = new InstallProvider({
    clientId: CONFIG.slack.client_id,
    clientSecret: CONFIG.slack.client_secret,
    stateSecret: CONFIG.slack.state_secret,
    authVersion: "v2",
    installationStore: {
      storeInstallation: async (_installation) => {
        const installation = _installation as Installation<"v2", false>;
        const teamId = installation.team.id;
        const SlackOAuthDoc = await SlackOAuthDB.doc().get();
        let data: FirestoreParams<SlackOAuth> = {};
        if (SlackOAuthDoc.exists) {
          data = {
            installation,
            updatedAt: FieldValue.serverTimestamp(),
          };
        } else {
          data = {
            installation,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          };
        }

        const tasksClient = new CloudTasksClient();
        const body: SendFirstMessageBody = { teamId, userId: installation.user.id };
        await tasksClient.createTask({
          parent: tasksClient.queuePath(CONFIG.cloud_task.project, CONFIG.cloud_task.location, Queue.SendFirstMessage),
          task: {
            scheduleTime: {
              seconds: dayjs().add(3, "second").unix(),
            },
            httpRequest: {
              headers: { "Content-Type": "application/json" },
              httpMethod: "POST",
              url: `${CONFIG.cloud_task.base_url}/sendFirstMessageTask`,
              body: toBase64(body),
            },
          },
        });
        await SlackOAuthDB.doc(teamId).set(data, { merge: true });
      },
      fetchInstallation: async (_installQuery) => {
        const installQuery = _installQuery as InstallationQuery<false>;
        const SlackOAuthDoc = await SlackOAuthDB.doc(installQuery.teamId).get();
        const data = SlackOAuthDoc.data() as SlackOAuth;
        return data.installation;
      },
    },
  });
  return installer;
};

export const slackOAuthUrl = functions.https.onRequest(async (request, response) => {
  const installer = getInstaller();
  const url = await installer.generateInstallUrl({
    scopes: [
      "channels:history",
      "channels:join",
      "channels:manage",
      "channels:read",
      "chat:write",
      "chat:write.public",
      "emoji:read",
      "reactions:read",
      "im:write",
      "users:read",
    ],
    redirectUri: CONFIG.slack.redirect_uri,
  });
  response.redirect(url);
});

export const slackOAuthRedirect = functions.https.onRequest(async (request, response) => {
  const installer = getInstaller();
  await installer.handleCallback(request, response);
});
