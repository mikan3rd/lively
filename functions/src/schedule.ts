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

export const batchWeeklyTrendMessageScheduler = scheduleFunctions()("0 8 * * mon").onRun(async (context) => {
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
    await pubSub.topic(Topic.WeeklyTrendMessage).publish(toBufferJson(oauthData));
  }
});

export const batchMonthlyTrendMessageScheduler = scheduleFunctions()("0 9 1 * *").onRun(async (context) => {
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
    await pubSub.topic(Topic.MonthlyTrendMessage).publish(toBufferJson(oauthData));
  }
});

export const batchRecommendChannelScheduler = scheduleFunctions()("0 12 * * mon").onRun(async (context) => {
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

export const batchDeletePostedTrendMessageScheduler = scheduleFunctions()("0 1 1 * *").onRun(async (context) => {
  const docs = await SlackOAuthDB.get();
  const oauthList: SlackOAuth[] = [];
  docs.forEach((doc) => {
    oauthList.push(doc.data() as SlackOAuth);
  });

  const pubSub = new PubSub();
  for (const oauthData of oauthList) {
    await pubSub.topic(Topic.DeletePostedTrendMessage).publish(toBufferJson(oauthData));
  }
});
