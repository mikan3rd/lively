import { WebClient } from "@slack/web-api";

import {
  FieldValue,
  FirestoreParams,
  SlackOAuth,
  SlackOAuthDB,
  SlackPostedRecommendChannel,
  SlackPostedRecommendChannelDB,
  SlackPostedTrendMessage,
  SlackPostedTrendMessageDB,
  SlackWeeklyTrendMessage,
  SlackWeeklyTrendMessageDB,
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
  web: WebClient;
  bot: BotType;
  slackOAuthData: SlackOAuth;
  slackPostedTrendMessage?: PartiallyPartial<SlackPostedTrendMessage, keyof TimeStamp>;
  slackPostedRecommendChannelIds?: PartiallyPartial<SlackPostedRecommendChannel, keyof TimeStamp>;
  slackWeeklyTrendMessage?: PartiallyPartial<SlackWeeklyTrendMessage, keyof TimeStamp>;

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

  async update(data: FirestoreParams<SlackOAuth>, refetch = false) {
    data.updatedAt = FieldValue.serverTimestamp();
    if (!this.slackOAuthData.createdAt) {
      data.createdAt = FieldValue.serverTimestamp();
    }
    await SlackOAuthDB.doc(this.teamId).set(data, { merge: true });
    if (refetch) {
      await this.refetch();
    }
  }

  async refetch() {
    const slackOAuthData = await SlackClient.getSlackOAuthData(this.teamId);
    this.slackOAuthData = slackOAuthData;
  }

  async deleteAll() {
    await SlackOAuthDB.doc(this.teamId).delete();
    await SlackPostedTrendMessageDB.doc(this.teamId).delete();
  }

  async setPostedTrendMessage(data: FirestoreParams<SlackPostedTrendMessage>) {
    data.updatedAt = FieldValue.serverTimestamp();
    if (!this.slackPostedTrendMessage?.createdAt) {
      data.createdAt = FieldValue.serverTimestamp();
    }
    await SlackPostedTrendMessageDB.doc(this.teamId).set(data, { merge: true });
  }

  async getPostedTrendMessage() {
    const doc = await SlackPostedTrendMessageDB.doc(this.teamId).get();
    let data: PartiallyPartial<SlackPostedTrendMessage, keyof TimeStamp> = {
      teamId: this.teamId,
      messages: [],
    };
    if (doc.exists) {
      data = doc.data() as SlackPostedTrendMessage;
    }
    this.slackPostedTrendMessage = data;
    return data;
  }

  async setPostedRecommendChannelIds(data: FirestoreParams<SlackPostedRecommendChannel>) {
    data.updatedAt = FieldValue.serverTimestamp();
    if (!this.slackPostedTrendMessage?.createdAt) {
      data.createdAt = FieldValue.serverTimestamp();
    }
    await SlackPostedRecommendChannelDB.doc(this.teamId).set(data, { merge: true });
  }

  async getPostedRecommendChannelIds() {
    const doc = await SlackPostedRecommendChannelDB.doc(this.teamId).get();
    let data: PartiallyPartial<SlackPostedRecommendChannel, keyof TimeStamp> = {
      teamId: this.teamId,
      postedChannelIds: [],
    };
    if (doc.exists) {
      data = doc.data() as SlackPostedRecommendChannel;
    }
    this.slackPostedRecommendChannelIds = data;
    return data;
  }

  async setWeeklyTrendMessage(data: FirestoreParams<SlackWeeklyTrendMessage>) {
    data.updatedAt = FieldValue.serverTimestamp();
    if (!this.slackWeeklyTrendMessage?.createdAt) {
      data.createdAt = FieldValue.serverTimestamp();
    }
    await SlackWeeklyTrendMessageDB.doc(this.teamId).set(data, { merge: true });
  }

  async getWeeklyTrendMessage() {
    const doc = await SlackWeeklyTrendMessageDB.doc(this.teamId).get();
    let data: PartiallyPartial<SlackWeeklyTrendMessage, keyof TimeStamp> = {
      teamId: this.teamId,
      messages: [],
    };
    if (doc.exists) {
      data = doc.data() as SlackWeeklyTrendMessage;
    }
    this.slackWeeklyTrendMessage = data;
    return data;
  }

  get teamId() {
    return this.slackOAuthData.installation.team.id;
  }
}
