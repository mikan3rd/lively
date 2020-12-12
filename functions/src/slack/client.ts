import { WebClient } from "@slack/web-api";

import {
  FieldValue,
  SlackOAuth,
  SlackOAuthDB,
  SlackPostedTrendMessage,
  SlackPostedTrendMessageDB,
} from "../firebase/firestore";

type BotType = {
  token: string;
  scopes: string[];
  id: string;
  userId: string;
};

type Constructor = {
  slackOAuthData: SlackOAuth;
  web: WebClient;
  bot: BotType;
};

export class SlackClient {
  slackOAuthData: SlackOAuth;
  web: WebClient;
  bot: BotType;

  constructor({ slackOAuthData, web, bot }: Constructor) {
    this.slackOAuthData = slackOAuthData;
    this.web = web;
    this.bot = bot;
  }

  static async new(team_id: string) {
    const slackOAuthData = await SlackClient.getSlackOAuthData(team_id);
    const {
      installation: { bot },
    } = slackOAuthData;
    if (!bot) {
      throw Error("installation.bot is undefined!!");
    }
    const { token } = bot;
    const web = new WebClient(token);
    return new SlackClient({ slackOAuthData, web, bot });
  }

  static async getSlackOAuthData(team_id: string) {
    const slackOAuthDoc = await SlackOAuthDB.doc(team_id).get();
    const slackOAuthData = slackOAuthDoc.data() as SlackOAuth;
    return slackOAuthData;
  }

  async update(slackOAuthData: Partial<SlackOAuth>, refetch = false) {
    await SlackOAuthDB.doc(this.teamId).set(slackOAuthData, { merge: true });
    if (refetch) {
      await this.refetch();
    }
  }

  async refetch() {
    const slackOAuthData = await SlackClient.getSlackOAuthData(this.teamId);
    this.slackOAuthData = slackOAuthData;
  }

  generatePostedTrendMessageId(teamId: string, channelId: string, messageTs: string) {
    return `${teamId}-${channelId}-${messageTs}`;
  }

  async setPostedTrendMessage(teamId: string, channelId: string, messageTs: string) {
    const docId = this.generatePostedTrendMessageId(teamId, channelId, messageTs);
    const data: Partial<SlackPostedTrendMessage> = {
      teamId,
      channelId,
      messageTs,
      updatedAt: FieldValue.serverTimestamp(),
    };
    await SlackPostedTrendMessageDB.doc(docId).set(data, { merge: true });
  }

  async hasPostedTrendMessage(teamId: string, channelId: string, messageTs: string) {
    const docId = this.generatePostedTrendMessageId(teamId, channelId, messageTs);
    const slackOAuthDocs = await SlackPostedTrendMessageDB.doc(docId).get();
    return slackOAuthDocs.exists;
  }

  get teamId() {
    return this.slackOAuthData.installation.team.id;
  }
}
