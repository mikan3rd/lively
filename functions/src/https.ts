import dayjs from "dayjs";

import { SlackPostedTrendMessage } from "./firebase/firestore";
import { functions, logger } from "./firebase/functions";
import { updateJoinedChannelIds } from "./services/updateJoinedChannelIds";
import { SlackClient } from "./slack/client";
import { ChatGetPermalinkResult, ConversationHistoryResult } from "./types/SlackWebAPICallResult";

export type JoinChannelBody = { teamId: string; channelIds: string[] };
export type PostTrendMessageBody = { teamId: string; channelIds: string[] };

type TrendMessageType = { channelId: string; ts: string; reactionNum: number };

export const joinChannelTask = functions.https.onRequest(async (request, response) => {
  logger.log(request.headers);
  logger.log(request.body);
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
  logger.log(request.headers);
  logger.log(request.body);
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

    const formedMessages = conversationHistoryResult.messages.map((message) => ({
      channelId,
      ts: message.ts,
      reactionNum: message.reactions?.reduce((acc, reaction) => acc + reaction.count, 0) ?? 0,
    }));
    messages = messages.concat(formedMessages);
  }

  const sortedMessages = messages.sort((a, b) => (a.reactionNum > b.reactionNum ? -1 : 1));

  const postedTrendMessages = await client.getPostedTrendMessage();
  const links: string[] = [];
  const trendMessages: TrendMessageType[] = [];

  const maxPostNum = 3;
  let postNum = 0;

  for (const message of sortedMessages) {
    if (postNum > maxPostNum) {
      break;
    }

    if (message.reactionNum < selectedTrendNum) {
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

    postNum += 1;
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

  response.send();
});
