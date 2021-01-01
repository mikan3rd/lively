import { CloudTasksClient } from "@google-cloud/tasks";
import dayjs from "dayjs";

import { chunk, toBase64 } from "@/common/utils";
import { CONFIG } from "@/firebase/config";
import { Queue } from "@/firebase/task";
import { JoinChannelBody } from "@/https";
import { ConversationListResult } from "@/types/SlackWebAPICallResult";

const BulkChannelThreshold = 40;

export const createJoinChannelTask = async (teamId: string, channels: ConversationListResult["channels"]) => {
  const channelIds = channels.filter((channel) => !channel.is_member).map((channel) => channel.id);
  const bulkChannelIds = chunk(channelIds, BulkChannelThreshold);
  const tasksClient = new CloudTasksClient();
  for (const [index, channelIds] of bulkChannelIds.entries()) {
    const body: JoinChannelBody = { teamId, channelIds };
    await tasksClient.createTask({
      parent: tasksClient.queuePath(CONFIG.cloud_task.project, CONFIG.cloud_task.location, Queue.JoinChannel),
      task: {
        scheduleTime: {
          seconds: dayjs()
            .add(index * 2, "minute")
            .unix(),
        },
        httpRequest: {
          headers: { "Content-Type": "application/json" },
          httpMethod: "POST",
          url: `${CONFIG.cloud_task.base_url}/joinChannelTask`,
          body: toBase64(body),
        },
      },
    });
  }
};
