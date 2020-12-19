import { PubSub } from "@google-cloud/pubsub";

import { toBufferJson } from "./common/utils";
import { SlackOAuth, SlackOAuthDB } from "./firebase/firestore";
import { scheduleFunctions } from "./firebase/functions";
import { Topic } from "./firebase/pubsub";

export const batchTrendMessageQueueScheduler = scheduleFunctions()("0 * * * *").onRun(async (context) => {
  const docs = await SlackOAuthDB.get();
  const oauthList: SlackOAuth[] = [];
  docs.forEach((doc) => {
    oauthList.push(doc.data() as SlackOAuth);
  });

  const pubSub = new PubSub();
  for (const oauthData of oauthList) {
    if (!oauthData.targetChannelId) {
      continue;
    }
    await pubSub.topic(Topic.BulkTrendMessageQueue).publish(toBufferJson(oauthData));
  }
});
