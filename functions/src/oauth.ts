import { CloudTasksClient } from "@google-cloud/tasks";
import { InstallProvider } from "@slack/oauth";
import dayjs from "dayjs";

import { toBase64 } from "@/common/utils";
import { CONFIG } from "@/firebase/config";
import { FieldValue, FirestoreParams, SlackOAuth, SlackOAuthDB } from "@/firebase/firestore";
import { functions } from "@/firebase/functions";
import { Queue } from "@/firebase/task";
import { SendFirstMessageBody } from "@/https";

const installer = new InstallProvider({
  clientId: CONFIG.slack.client_id,
  clientSecret: CONFIG.slack.client_secret,
  stateSecret: CONFIG.slack.state_secret,
  authVersion: "v2",
  installationStore: {
    storeInstallation: async (installation) => {
      const SlackOAuthDoc = await SlackOAuthDB.doc(installation.team.id).get();
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
      const body: SendFirstMessageBody = { teamId: installation.team.id, userId: installation.user.id };
      await tasksClient.createTask({
        parent: tasksClient.queuePath(CONFIG.cloud_task.project, CONFIG.cloud_task.location, Queue.SendFirstMessage),
        task: {
          scheduleTime: {
            seconds: dayjs().add(3, "second").unix(),
          },
          httpRequest: {
            headers: { "Content-Type": "application/json" },
            httpMethod: "POST",
            url: `${CONFIG.cloud_task.base_url}/sendFirstmessageTask`,
            body: toBase64(body),
          },
        },
      });

      await SlackOAuthDB.doc(installation.team.id).set(data, { merge: true });
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
      "channels:manage",
      "channels:read",
      "chat:write",
      "chat:write.public",
      "emoji:read",
      "reactions:read",
      "im:write",
    ],
    redirectUri: CONFIG.slack.redirect_uri,
  });
  response.redirect(url);
});

export const slackOAuthRedirect = functions.https.onRequest(async (request, response) => {
  await installer.handleCallback(request, response);
});
