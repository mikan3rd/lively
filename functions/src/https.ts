import dayjs from "dayjs";

import { SlackPostedTrendMessage } from "./firebase/firestore";
import { functions, logger } from "./firebase/functions";
import { Queue } from "./firebase/task";
import { updateJoinedChannelIds } from "./services/updateJoinedChannelIds";
import { SlackClient } from "./slack/client";
import { ChatGetPermalinkResult, ConversationHistoryResult } from "./types/SlackWebAPICallResult";

export type JoinChannelBody = { teamId: string; channelIds: string[] };
export type PostTrendMessageBody = { teamId: string; channelIds: string[] };
export type CountWeeklyTrendMessageBody = { teamId: string; channelIds: string[] };
export type PostWeeklyTrendMessageBody = { teamId: string };
export type SendFirstMessageBody = { teamId: string; userId: string };

type TrendMessageType = {
  channelId: string;
  ts: string;
  reactions: {
    name: string;
    users: string[];
    count: number;
  }[];
  reactionNum: number;
};

export const joinChannelTask = functions.https.onRequest(async (request, response) => {
  if (request.headers["x-cloudtasks-queuename"] !== Queue.JoinChannel) {
    response.status(400).send();
    return;
  }

  const body: JoinChannelBody = request.body;

  const client = await SlackClient.new(body.teamId);
  const {
    web,
    bot: { token },
    slackOAuthData: { isAllPublicChannel },
  } = client;
  for (const channelId of body.channelIds) {
    await web.conversations.join({ token, channel: channelId }).catch((e) => logger.error(e));
  }

  if (!isAllPublicChannel) {
    await updateJoinedChannelIds(client);
  }

  response.send();
});

export const postTrendMessageTask = functions.https.onRequest(async (request, response) => {
  if (request.headers["x-cloudtasks-queuename"] !== Queue.PostTrendMessage) {
    response.status(400).send();
    return;
  }

  const body: PostTrendMessageBody = request.body;

  const client = await SlackClient.new(body.teamId);
  const {
    web,
    bot: { token },
    slackOAuthData: { targetChannelId, selectedTrendNum = 10 },
  } = client;

  if (!targetChannelId) {
    response.send();
    return;
  }

  const postedTrendMessages = await client.getPostedTrendMessage();

  const oldestTime = dayjs().subtract(2, "day").unix();
  let messages: TrendMessageType[] = [];

  for (const channelId of body.channelIds) {
    const conversationHistoryResult = (await web.conversations.history({
      token,
      channel: channelId,
      inclusive: true,
      limit: 1000,
      oldest: String(oldestTime),
    })) as ConversationHistoryResult;

    const formedMessages = conversationHistoryResult.messages
      .map((message) => ({
        channelId,
        ts: message.ts,
        reactions: message.reactions ?? [],
        reactionNum: message.reactions?.reduce((acc, reaction) => acc + reaction.count, 0) ?? 0,
      }))
      .filter(({ reactionNum, channelId, ts }) => {
        reactionNum >= selectedTrendNum &&
          postedTrendMessages.messages.every(
            (postedMessage) => postedMessage.channelId !== channelId && postedMessage.messageTs !== ts,
          );
      });
    messages = messages.concat(formedMessages);
  }

  const sortedMessages = messages.sort((a, b) => (a.reactionNum > b.reactionNum ? -1 : 1));
  const maxPostNum = 3;
  const trendMessages = sortedMessages.slice(0, maxPostNum);

  for (const [i, { channelId, ts, reactions }] of trendMessages.entries()) {
    if (i === 0) {
      await web.chat.postMessage({
        channel: targetChannelId,
        text: `:tada: この投稿が盛り上がってるよ！`,
        token,
      });
    }

    const { permalink } = (await web.chat.getPermalink({
      token,
      channel: channelId,
      message_ts: ts,
    })) as ChatGetPermalinkResult;

    const reactionText = reactions.reduce((prev, current) => (prev += `:${current.name}: `.repeat(current.count)), "");
    const text = `${reactionText}\n${permalink}`;
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

  response.send();
});

export const countWeeklyTrendMessageTask = functions.https.onRequest(async (request, response) => {
  if (request.headers["x-cloudtasks-queuename"] !== Queue.CountWeeklyTrendMessage || request.method !== "POST") {
    response.status(400).send();
    return;
  }

  const body: CountWeeklyTrendMessageBody = request.body;

  const client = await SlackClient.new(body.teamId);
  const {
    web,
    bot: { token },
    slackOAuthData: { targetChannelId },
  } = client;

  if (!targetChannelId) {
    response.send();
    return;
  }

  const oldestTime = dayjs().subtract(1, "week").unix();
  let messages: TrendMessageType[] = [];

  for (const channelId of body.channelIds) {
    const conversationHistoryResult = (await web.conversations.history({
      token,
      channel: channelId,
      inclusive: true,
      limit: 15000,
      oldest: String(oldestTime),
    })) as ConversationHistoryResult;

    const formedMessages = conversationHistoryResult.messages
      .map((message) => ({
        channelId,
        ts: message.ts,
        reactions: message.reactions ?? [],
        reactionNum: message.reactions?.reduce((acc, reaction) => acc + reaction.count, 0) ?? 0,
      }))
      .filter((message) => message.reactionNum > 0);
    messages = messages.concat(formedMessages);
  }

  const maxCountNum = 5;
  const sortedMessages = messages.sort((a, b) => (a.reactionNum > b.reactionNum ? -1 : 1));
  const trendMessages = sortedMessages.slice(0, maxCountNum);

  const weeklyTrendMessages = await client.getWeeklyTrendMessage();
  weeklyTrendMessages.messages = weeklyTrendMessages.messages.concat(trendMessages);
  await client.setWeeklyTrendMessage(weeklyTrendMessages);

  response.send();
});

export const postWeeklyTrendMessageTask = functions.https.onRequest(async (request, response) => {
  if (request.headers["x-cloudtasks-queuename"] !== Queue.PostWeeklyTrendMessage || request.method !== "POST") {
    response.status(400).send();
    return;
  }

  const body: PostWeeklyTrendMessageBody = request.body;

  const client = await SlackClient.new(body.teamId);
  const {
    web,
    bot: { token },
    slackOAuthData: { targetChannelId },
  } = client;

  if (!targetChannelId) {
    response.send();
    return;
  }

  const weeklyTrendMessages = await client.getWeeklyTrendMessage();
  if (weeklyTrendMessages.messages.length === 0) {
    response.send();
    return;
  }

  const maxCountNum = 5;
  const sortedMessages = weeklyTrendMessages.messages.sort((a, b) => (a.reactionNum > b.reactionNum ? -1 : 1));
  const trendMessages = sortedMessages.slice(0, maxCountNum);

  for (const [i, { channelId, ts, reactions }] of trendMessages.entries()) {
    if (i === 0) {
      await web.chat.postMessage({
        channel: targetChannelId,
        text: `:tada: 今週盛り上がった投稿はこちら！`,
        token,
      });
    }

    const { permalink } = (await web.chat.getPermalink({
      token,
      channel: channelId,
      message_ts: ts,
    })) as ChatGetPermalinkResult;

    const reactionText = reactions.reduce((prev, current) => (prev += `:${current.name}: `.repeat(current.count)), "");
    const text = `*${i + 1}位*\n${reactionText}\n${permalink}`;
    await web.chat.postMessage({
      channel: targetChannelId,
      text,
      token,
    });
  }

  weeklyTrendMessages.messages = [];
  await client.setWeeklyTrendMessage(weeklyTrendMessages);
});

export const sendFirstMessageTask = functions.https.onRequest(async (request, response) => {
  if (request.headers["x-cloudtasks-queuename"] !== Queue.SendFirstMessage) {
    response.status(400).send();
    return;
  }

  const body: SendFirstMessageBody = request.body;

  const client = await SlackClient.new(body.teamId);
  const {
    web,
    bot: { token },
  } = client;

  if (body.userId) {
    await web.chat.postMessage({
      channel: body.userId,
      text: `インストールありがとうございます！\nホームタブから初期設定をしましょう！`,
      token,
    });
  }

  response.send();
});
