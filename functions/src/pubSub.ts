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
