import { PubSub } from "@google-cloud/pubsub";
import dayjs from "dayjs";

import { chunk, toBufferJson } from "./common/utils";
import { SlackOAuth, SlackOAuthDB, SlackPostedTrendMessage } from "./firebase/firestore";
import { functions, scheduleFunctions } from "./firebase/functions";
import { Topic } from "./firebase/pubsub";
import { SlackClient } from "./slack/client";
import {
  ChatGetPermalinkResult,
  ConversationHistoryResult,
  ConversationListResult,
} from "./types/SlackWebAPICallResult";

type TrendMessageType = { channelId: string; ts: string; reactionNum: number };

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

export const createTrendMessageQueuePubSub = functions.pubsub
  .topic(Topic.BulkTrendMessageQueue)
  .onPublish(async (message) => {
    const {
      installation: { team },
    }: SlackOAuth = message.json;

    const client = await SlackClient.new(team.id);
    const {
      web,
      bot: { token },
      slackOAuthData: { targetChannelId },
    } = client;

    if (!targetChannelId) {
      return;
    }

    const conversationsListResult = (await web.conversations.list({
      token,
      limit: 1000,
      exclude_archived: true,
      types: "public_channel",
    })) as ConversationListResult;
    const sortedChannels = conversationsListResult.channels.sort((a, b) => (a.num_members > b.num_members ? -1 : 1));
    const channelIds = sortedChannels.filter((channel) => channel.is_member).map((channel) => channel.id);

    const bulkChannelThreshold = 30;
    const bulkChannelIds = chunk(channelIds, bulkChannelThreshold).map((channelIds) => ({ channelIds }));
    await client.setTrendMessageQueue({ teamId: team.id, bulkChannelIds });
  });

export const batchTrendMessageScheduler = scheduleFunctions()("10,20,30 * * * *").onRun(async (context) => {
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
    await pubSub.topic(Topic.PostTrendMessage).publish(toBufferJson(oauthData));
  }
});

export const postTrendMessagePubSub = functions.pubsub.topic(Topic.PostTrendMessage).onPublish(async (message) => {
  const {
    installation: { team },
  }: SlackOAuth = message.json;

  const client = await SlackClient.new(team.id);
  const {
    web,
    bot: { token },
    slackOAuthData: { targetChannelId },
  } = client;

  if (!targetChannelId) {
    return;
  }

  const { bulkChannelIds } = await client.getTrendMessageQueue();
  const bulkChannelId = bulkChannelIds.shift();

  if (!bulkChannelId) {
    return;
  }

  const oldestTime = dayjs().subtract(2, "day").unix();
  let messages: TrendMessageType[] = [];

  for (const channelId of bulkChannelId.channelIds) {
    const conversationHistoryResult = (await web.conversations.history({
      token,
      channel: channelId,
      inclusive: true,
      limit: 1000,
      oldest: String(oldestTime),
    })) as ConversationHistoryResult;
    const formedMessages = conversationHistoryResult.messages.map((message) => ({
      channelId,
      ts: message.ts,
      reactionNum: message.reactions?.reduce((acc, reaction) => acc + reaction.count, 0) ?? 0,
    }));
    messages = messages.concat(formedMessages);
  }

  const postedTrendMessages = await client.getPostedTrendMessage();
  const reactionNumThreshold = 10;
  const links: string[] = [];
  const trendMessages: TrendMessageType[] = [];
  for (const message of messages) {
    if (message.reactionNum < reactionNumThreshold) {
      continue;
    }

    if (
      postedTrendMessages.messages.some(
        (postedMessage) => postedMessage.channelId === message.channelId && postedMessage.messageTs === message.ts,
      )
    ) {
      continue;
    }

    const permalinkResult = (await web.chat.getPermalink({
      token,
      channel: message.channelId,
      message_ts: message.ts,
    })) as ChatGetPermalinkResult;

    links.push(permalinkResult.permalink);
    trendMessages.push(message);
  }

  for (const [i, link] of links.entries()) {
    let text = link;
    if (i === 0) {
      text = `:tada: この投稿が盛り上がってるよ！\n${link}`;
    }
    await web.chat.postMessage({
      channel: targetChannelId,
      text,
      token,
    });
  }

  const postedMessages: SlackPostedTrendMessage["messages"] = trendMessages.map(({ channelId, ts }) => ({
    channelId,
    messageTs: ts,
  }));
  postedTrendMessages.messages = postedTrendMessages.messages.concat(postedMessages);
  await client.setPostedTrendMessage(postedTrendMessages);
  await client.setTrendMessageQueue({ teamId: team.id, bulkChannelIds });
});
