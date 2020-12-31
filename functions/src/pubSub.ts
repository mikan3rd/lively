import { CloudTasksClient } from "@google-cloud/tasks";
import dayjs from "dayjs";

import { chunk, toBase64 } from "./common/utils";
import { CONFIG } from "./firebase/config";
import { SlackOAuth } from "./firebase/firestore";
import { functions } from "./firebase/functions";
import { Topic } from "./firebase/pubsub";
import { Queue } from "./firebase/task";
import { PostTrendMessageBody } from "./https";
import { getConversationsList } from "./services/getConversationsList";
import { Action } from "./slack/actionIds";
import { SlackClient } from "./slack/client";

const BulkHistoryThreshold = 40;

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
    for (const [index, channelIds] of bulkChannelIds.entries()) {
      const body: PostTrendMessageBody = { teamId: team.id, channelIds };
      await tasksClient.createTask({
        parent: tasksClient.queuePath(CONFIG.cloud_task.project, CONFIG.cloud_task.location, Queue.PostTrendMessage),
        task: {
          scheduleTime: {
            seconds: dayjs()
              .add(index * 2, "minute")
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

export const postRecommendChannelPubSub = functions.https.onRequest(async (request, response) => {
  const teamId = "";
  const client = await SlackClient.new(teamId);

  const {
    web,
    bot: { token },
    slackOAuthData: { targetChannelId, isAllPublicChannel },
  } = client;

  if (isAllPublicChannel) {
    response.send();
    return;
  }

  if (!targetChannelId) {
    response.send();
    return;
  }

  const { postedChannelIds } = await client.getPostedRecommendChannelIds();

  const { channels } = await getConversationsList(client);
  const sortedChannels = channels.sort((a, b) => (a.num_members > b.num_members ? -1 : 1));

  if (sortedChannels.length === 0) {
    if (postedChannelIds.length > 0) {
      await client.setPostedRecommendChannelIds({ teamId, postedChannelIds: [] });
    }
    response.send();
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
  await client.setPostedRecommendChannelIds({ teamId, postedChannelIds });

  response.send();
});
