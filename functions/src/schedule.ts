import { PubSub } from "@google-cloud/pubsub";
import dayjs from "dayjs";

import { SlackOAuth, SlackOAuthDB } from "./firebase/firestore";
import { functions, scheduleFunctions } from "./firebase/functions";
import { Topic, toBufferJson } from "./firebase/pubsub";
import { SlackClient } from "./slack/client";
import {
  ChatGetPermalinkResult,
  ConversationHistoryResult,
  ConversationListResult,
} from "./types/SlackWebAPICallResult";

type TrendMessageType = { channelId: string; ts: string; reactionNum: number };

export const batchTrendMessageScheduler = scheduleFunctions()("0 * * * *").onRun(async (context) => {
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

  const conversationsListResult = (await web.conversations.list({
    token,
    limit: 1000,
    exclude_archived: true,
    types: "public_channel",
  })) as ConversationListResult;

  const oldestTime = dayjs().subtract(1, "day").unix();
  let messages: TrendMessageType[] = [];
  const sortedChannels = conversationsListResult.channels.sort((a, b) => (a.num_members > b.num_members ? -1 : 1));
  for (const channel of sortedChannels) {
    const conversationHistoryResult = (await web.conversations.history({
      token,
      channel: channel.id,
      inclusive: true,
      limit: 1000,
      oldest: String(oldestTime),
    })) as ConversationHistoryResult;
    const formedMessages = conversationHistoryResult.messages.map((message) => ({
      channelId: channel.id,
      ts: message.ts,
      reactionNum: message.reactions?.reduce((acc, reaction) => acc + reaction.count, 0) ?? 0,
    }));
    messages = messages.concat(formedMessages);
  }

  const reactionNumThreshold = 3; // TODO: 調整が必要
  const links: string[] = [];
  const trendMessages: TrendMessageType[] = [];
  for (const message of messages) {
    if (message.reactionNum < reactionNumThreshold) {
      continue;
    }

    if (await client.hasPostedTrendMessage(team.id, message.channelId, message.ts)) {
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

  for (const message of trendMessages) {
    await client.setPostedTrendMessage(team.id, message.channelId, message.ts);
  }
});
