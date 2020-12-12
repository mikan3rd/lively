import { WebClient } from "@slack/web-api";

import {
  FieldValue,
  SlackOAuth,
  SlackOAuthDB,
  SlackPostedTrendMessage,
  SlackPostedTrendMessageDB,
  TimeStamp,
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

  async setPostedTrendMessage(data: PartiallyPartial<SlackPostedTrendMessage, keyof TimeStamp>) {
    data.updatedAt = FieldValue.serverTimestamp();
    if (!data.createdAt) {
      data.createdAt = FieldValue.serverTimestamp();
    }
    await SlackPostedTrendMessageDB.doc(data.teamId).set(data, { merge: true });
  }

  async getPostedTrendMessage(teamId: string) {
    const doc = await SlackPostedTrendMessageDB.doc(teamId).get();
    if (doc.exists) {
      return doc.data() as SlackPostedTrendMessage;
    }
    const defaultData: PartiallyPartial<SlackPostedTrendMessage, keyof TimeStamp> = {
      teamId,
      messages: [],
    };
    return defaultData;
  }

  get teamId() {
    return this.slackOAuthData.installation.team.id;
  }
}
