import { functions, logger } from "./firebase/functions";
import { JoinChannelBody } from "./services/createJoinChannelTask";
import { updateJoinedChannelIds } from "./services/updateJoinedChannelIds";
import { SlackClient } from "./slack/client";

export const joinChannelTask = functions.https.onRequest(async (request, response) => {
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
