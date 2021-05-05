import { Installation } from "@slack/oauth";
import admin from "firebase-admin";

export const db = admin.firestore();
export const { FieldValue } = admin.firestore;

export const SlackOAuthDB = db.collection("slackOAuth");
export const SlackPostedTrendMessageDB = db.collection("slackPostedTrendMessage");
export const SlackPostedRecommendChannelDB = db.collection("slackPostedRecommendChannelDB");
export const SlackWeeklyTrendMessageDB = db.collection("slackWeeklyTrendMessage");

export type TimeStamp = {
  updatedAt: FirebaseFirestore.Timestamp;
  createdAt: FirebaseFirestore.Timestamp;
};

type UpdateTimeStamp = {
  updatedAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
  createdAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
};

export type FirestoreParams<T> = Partial<Omit<T, keyof TimeStamp> & UpdateTimeStamp>;

export type SlackOAuth = {
  installation: Installation<"v2", false>;
  targetChannelId?: string;
  joinedChannelIds?: string[];
  isAllPublicChannel?: boolean;
  selectedTrendNum?: number;
} & TimeStamp;

export type SlackPostedTrendMessage = {
  teamId: string;
  messages: { channelId: string; messageTs: string }[];
} & TimeStamp;

export type SlackPostedRecommendChannel = {
  teamId: string;
  postedChannelIds: string[];
} & TimeStamp;

export type SlackWeeklyTrendMessage = {
  teamId: string;
  messages: {
    channelId: string;
    ts: string;
    reactions: {
      name: string;
      users: string[];
      count: number;
    }[];
    reactionNum: number;
  }[];
} & TimeStamp;
