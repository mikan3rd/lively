import { CloudTasksClient } from "@google-cloud/tasks";
import dayjs from "dayjs";

import { chunk, toBase64 } from "./common/utils";
import { CONFIG } from "./firebase/config";
import { SlackOAuth } from "./firebase/firestore";
import { functions } from "./firebase/functions";
import { Topic } from "./firebase/pubsub";
import { Queue } from "./firebase/task";
import {
  CountMonthlyTrendMessageBody,
  CountWeeklyTrendMessageBody,
  PostMonthlyTrendMessageBody,
  PostTrendMessageBody,
  PostWeeklyTrendMessageBody,
} from "./https";
import { getConversationsList } from "./services/getConversationsList";
import { Action } from "./slack/actionIds";
import { SlackClient } from "./slack/client";

const BulkHistoryThreshold = 20;

export const createTrendMessageQueuePubSub = functions.pubsub
  .topic(Topic.BulkTrendMessageQueue)
  .onPublish(async (message) => {
    const {
      installation: { team },
    }: SlackOAuth = message.json;

    const client = await SlackClient.new(team.id);
    const {
      slackOAuthData: { targetChannelId },
    } = client;

    if (!targetChannelId) {
      return;
    }

    const { channels } = await getConversationsList(client);
    const sortedChannels = channels.sort((a, b) => (a.num_members > b.num_members ? -1 : 1));
    const channelIds = sortedChannels.filter((channel) => channel.is_member).map((channel) => channel.id);

    if (channelIds.length === 0) {
      return;
    }

    const bulkChannelIds = chunk(channelIds, BulkHistoryThreshold);
    const tasksClient = new CloudTasksClient();
    const interval = 2;
    for (const [index, channelIds] of bulkChannelIds.entries()) {
      const body: PostTrendMessageBody = { teamId: team.id, channelIds };
      await tasksClient.createTask({
        parent: tasksClient.queuePath(CONFIG.cloud_task.project, CONFIG.cloud_task.location, Queue.PostTrendMessage),
        task: {
          scheduleTime: {
            seconds: dayjs()
              .add(index * interval, "minute")
              .unix(),
          },
          httpRequest: {
            headers: { "Content-Type": "application/json" },
            httpMethod: "POST",
            url: `${CONFIG.cloud_task.base_url}/postTrendMessageTask`,
            body: toBase64(body),
          },
        },
      });
    }
  });

export const postWeeklyTrendMessagePubSub = functions.pubsub
  .topic(Topic.WeeklyTrendMessage)
  .onPublish(async (message) => {
    const {
      installation: { team },
    }: SlackOAuth = message.json;

    const client = await SlackClient.new(team.id);
    const {
      slackOAuthData: { targetChannelId },
    } = client;

    if (!targetChannelId) {
      return;
    }

    const { channels } = await getConversationsList(client);
    const sortedChannels = channels.sort((a, b) => (a.num_members > b.num_members ? -1 : 1));
    const channelIds = sortedChannels.filter((channel) => channel.is_member).map((channel) => channel.id);

    if (channelIds.length === 0) {
      return;
    }

    const bulkChannelIds = chunk(channelIds, BulkHistoryThreshold);
    const tasksClient = new CloudTasksClient();
    const interval = 3;
    for (const [index, channelIds] of bulkChannelIds.entries()) {
      const body: CountWeeklyTrendMessageBody = { teamId: team.id, channelIds };
      await tasksClient.createTask({
        parent: tasksClient.queuePath(
          CONFIG.cloud_task.project,
          CONFIG.cloud_task.location,
          Queue.CountWeeklyTrendMessage,
        ),
        task: {
          scheduleTime: {
            seconds: dayjs()
              .add(index * interval, "minute")
              .unix(),
          },
          httpRequest: {
            headers: { "Content-Type": "application/json" },
            httpMethod: "POST",
            url: `${CONFIG.cloud_task.base_url}/countWeeklyTrendMessageTask`,
            body: toBase64(body),
          },
        },
      });
    }

    const body: PostWeeklyTrendMessageBody = { teamId: team.id };
    await tasksClient.createTask({
      parent: tasksClient.queuePath(
        CONFIG.cloud_task.project,
        CONFIG.cloud_task.location,
        Queue.PostWeeklyTrendMessage,
      ),
      task: {
        scheduleTime: {
          seconds: dayjs()
            .add(bulkChannelIds.length * interval, "minute")
            .unix(),
        },
        httpRequest: {
          headers: { "Content-Type": "application/json" },
          httpMethod: "POST",
          url: `${CONFIG.cloud_task.base_url}/postWeeklyTrendMessageTask`,
          body: toBase64(body),
        },
      },
    });
  });

export const postMonthlyTrendMessagePubSub = functions.pubsub
  .topic(Topic.MonthlyTrendMessage)
  .onPublish(async (message) => {
    const {
      installation: { team },
    }: SlackOAuth = message.json;

    const client = await SlackClient.new(team.id);
    const {
      slackOAuthData: { targetChannelId },
    } = client;

    if (!targetChannelId) {
      return;
    }

    const { channels } = await getConversationsList(client);
    const sortedChannels = channels.sort((a, b) => (a.num_members > b.num_members ? -1 : 1));
    const channelIds = sortedChannels.filter((channel) => channel.is_member).map((channel) => channel.id);

    if (channelIds.length === 0) {
      return;
    }

    const bulkChannelIds = chunk(channelIds, BulkHistoryThreshold);
    const tasksClient = new CloudTasksClient();
    const interval = 3;
    for (const [index, channelIds] of bulkChannelIds.entries()) {
      const body: CountMonthlyTrendMessageBody = { teamId: team.id, channelIds };
      await tasksClient.createTask({
        parent: tasksClient.queuePath(
          CONFIG.cloud_task.project,
          CONFIG.cloud_task.location,
          Queue.CountMonthlyTrendMessage,
        ),
        task: {
          scheduleTime: {
            seconds: dayjs()
              .add(index * interval, "minute")
              .unix(),
          },
          httpRequest: {
            headers: { "Content-Type": "application/json" },
            httpMethod: "POST",
            url: `${CONFIG.cloud_task.base_url}/countMonthlyTrendMessageTask`,
            body: toBase64(body),
          },
        },
      });
    }

    const body: PostMonthlyTrendMessageBody = { teamId: team.id };
    await tasksClient.createTask({
      parent: tasksClient.queuePath(
        CONFIG.cloud_task.project,
        CONFIG.cloud_task.location,
        Queue.PostMonthlyTrendMessage,
      ),
      task: {
        scheduleTime: {
          seconds: dayjs()
            .add(bulkChannelIds.length * interval, "minute")
            .unix(),
        },
        httpRequest: {
          headers: { "Content-Type": "application/json" },
          httpMethod: "POST",
          url: `${CONFIG.cloud_task.base_url}/postMonthlyTrendMessageTask`,
          body: toBase64(body),
        },
      },
    });
  });

export const postRecommendChannelPubSub = functions.pubsub.topic(Topic.RecommendChannel).onPublish(async (message) => {
  const {
    installation: { team },
  }: SlackOAuth = message.json;

  const client = await SlackClient.new(team.id);

  const {
    web,
    bot: { token },
    slackOAuthData: { targetChannelId, isAllPublicChannel },
  } = client;

  if (isAllPublicChannel) {
    return;
  }

  if (!targetChannelId) {
    return;
  }

  const { postedChannelIds } = await client.getPostedRecommendChannelIds();

  const { channels } = await getConversationsList(client);
  const sortedChannels = channels
    .filter((channel) => !channel.is_member && !postedChannelIds.includes(channel.id))
    .sort((a, b) => (a.num_members > b.num_members ? -1 : 1));

  if (sortedChannels.length === 0) {
    if (postedChannelIds.length > 0) {
      await client.setPostedRecommendChannelIds({ teamId: team.id, postedChannelIds: [] });
    }
    return;
  }

  const targetChannel = sortedChannels[0];

  await web.chat.postMessage({
    token,
    channel: targetChannelId,
    text: "",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `チャンネル <#${targetChannel.id}> と連携しませんか？`,
        },
        accessory: {
          type: "button",
          style: "primary",
          text: {
            type: "plain_text",
            text: "連携する",
            emoji: true,
          },
          action_id: Action.JoinChannelButton,
          value: targetChannel.id,
        },
      },
    ],
  });

  postedChannelIds.push(targetChannel.id);
  await client.setPostedRecommendChannelIds({ teamId: team.id, postedChannelIds });
});

export const deletePostedTrendMessagePubSub = functions.pubsub
  .topic(Topic.DeletePostedTrendMessage)
  .onPublish(async (message) => {
    const {
      installation: { team },
    }: SlackOAuth = message.json;

    const client = await SlackClient.new(team.id);

    const postedTrendMessages = await client.getPostedTrendMessage();

    const filterTime = dayjs().subtract(2, "month").unix();
    postedTrendMessages.messages = postedTrendMessages.messages.filter(
      (message) => Number(message.messageTs) > filterTime,
    );
    await client.setPostedTrendMessage(postedTrendMessages);
  });
