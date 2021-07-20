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
export type CountMonthlyTrendMessageBody = { teamId: string; channelIds: string[] };
export type PostWeeklyTrendMessageBody = { teamId: string };
export type PostMonthlyTrendMessageBody = { teamId: string };
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

const HourlyMaxCount = 1;
const WeeklyMaxCount = 3;
const MonthlyMaxCount = 5;

export const joinChannelTask = functions.https.onRequest(async (request, response) => {
  if (request.headers["x-cloudtasks-queuename"] !== Queue.JoinChannel) {
    response.status(400).send();
    return;
  }

  const { channelIds, teamId }: JoinChannelBody = request.body;

  const client = await SlackClient.new(teamId);
  const {
    web,
    bot: { token },
    slackOAuthData: { isAllPublicChannel },
  } = client;

  for (const channelId of channelIds) {
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
      .filter(
        ({ reactionNum, channelId, ts }) =>
          reactionNum >= selectedTrendNum &&
          postedTrendMessages.messages.every(
            (postedMessage) => postedMessage.channelId !== channelId || postedMessage.messageTs !== ts,
          ),
      );
    messages = messages.concat(formedMessages);
  }

  const sortedMessages = messages.sort((a, b) => (a.reactionNum > b.reactionNum ? -1 : 1));
  const trendMessages = sortedMessages.slice(0, HourlyMaxCount);

  if (trendMessages.length === 0) {
    response.send();
    return;
  }

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
    const text = `:tada: <#${channelId}> が盛り上がってるよ！\n${reactionText}\n${permalink}`;
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

  const sortedMessages = messages.sort((a, b) => (a.reactionNum > b.reactionNum ? -1 : 1));
  const trendMessages = sortedMessages.slice(0, WeeklyMaxCount);

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

  const sortedMessages = weeklyTrendMessages.messages.sort((a, b) => (a.reactionNum > b.reactionNum ? -1 : 1));
  const trendMessages = sortedMessages.slice(0, WeeklyMaxCount);

  for (const [i, { channelId, ts, reactions }] of trendMessages.entries()) {
    if (i === 0) {
      await web.chat.postMessage({
        channel: targetChannelId,
        text: `:tada: 先週盛り上がった投稿ベスト${WeeklyMaxCount}はこちら！`,
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

  weeklyTrendMessages.messages = [];
  await client.setWeeklyTrendMessage(weeklyTrendMessages);
});

export const countMonthlyTrendMessageTask = functions.https.onRequest(async (request, response) => {
  if (request.headers["x-cloudtasks-queuename"] !== Queue.CountMonthlyTrendMessage || request.method !== "POST") {
    response.status(400).send();
    return;
  }

  const body: CountMonthlyTrendMessageBody = request.body;

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

  const oldestTime = dayjs().subtract(1, "month").unix();
  let messages: TrendMessageType[] = [];

  for (const channelId of body.channelIds) {
    const conversationHistoryResult = (await web.conversations.history({
      token,
      channel: channelId,
      inclusive: true,
      limit: 50000,
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

  const sortedMessages = messages.sort((a, b) => (a.reactionNum > b.reactionNum ? -1 : 1));
  const trendMessages = sortedMessages.slice(0, MonthlyMaxCount);

  const monthlyTrendMessages = await client.getMonthlyTrendMessage();
  monthlyTrendMessages.messages = monthlyTrendMessages.messages.concat(trendMessages);
  await client.setMonthlyTrendMessage(monthlyTrendMessages);

  response.send();
});

export const postMonthlyTrendMessageTask = functions.https.onRequest(async (request, response) => {
  if (request.headers["x-cloudtasks-queuename"] !== Queue.PostMonthlyTrendMessage || request.method !== "POST") {
    response.status(400).send();
    return;
  }

  const body: PostMonthlyTrendMessageBody = request.body;

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

  const monthlyTrendMessages = await client.getMonthlyTrendMessage();
  if (monthlyTrendMessages.messages.length === 0) {
    response.send();
    return;
  }

  const sortedMessages = monthlyTrendMessages.messages.sort((a, b) => (a.reactionNum > b.reactionNum ? -1 : 1));
  const trendMessages = sortedMessages.slice(0, MonthlyMaxCount);

  for (const [i, { channelId, ts, reactions }] of trendMessages.entries()) {
    if (i === 0) {
      await web.chat.postMessage({
        channel: targetChannelId,
        text: `:tada: 先月盛り上がった投稿ベスト${MonthlyMaxCount}はこちら！`,
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

  monthlyTrendMessages.messages = [];
  await client.setMonthlyTrendMessage(monthlyTrendMessages);
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
