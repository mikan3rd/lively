import { PubSub } from "@google-cloud/pubsub";

import { toBufferJson } from "./common/utils";
import { CONFIG } from "./firebase/config";
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

export const batchWeeklyTrendMessageScheduler = scheduleFunctions()("0 9 * * mon").onRun(async (context) => {
  const docs = await SlackOAuthDB.get();
  const oauthList: SlackOAuth[] = [];
  docs.forEach((doc) => {
    oauthList.push(doc.data() as SlackOAuth);
  });

  const pubSub = new PubSub();
  for (const oauthData of oauthList) {
    if (oauthData.installation.team.id !== CONFIG.test.team_id) {
      continue;
    }
    await pubSub.topic(Topic.WeeklyTrendMessage).publish(toBufferJson(oauthData));
  }
});

export const batchRecommendChannelScheduler = scheduleFunctions()("0 8 * * mon").onRun(async (context) => {
  const docs = await SlackOAuthDB.get();
  const oauthList: SlackOAuth[] = [];
  docs.forEach((doc) => {
    oauthList.push(doc.data() as SlackOAuth);
  });

  const pubSub = new PubSub();
  for (const oauthData of oauthList) {
    if (!oauthData.targetChannelId || oauthData.isAllPublicChannel) {
      continue;
    }
    await pubSub.topic(Topic.RecommendChannel).publish(toBufferJson(oauthData));
  }
});
