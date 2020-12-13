import { Installation } from "@slack/oauth";
import * as admin from "firebase-admin";

export const db = admin.firestore();
export const { FieldValue } = admin.firestore;

export const SlackOAuthDB = db.collection("slackOAuth");
export const SlackTrendQueueDB = db.collection("slackTrendQueue");
export const SlackPostedTrendMessageDB = db.collection("slackPostedTrendMessage");

export type TimeStamp = {
  updatedAt: FirebaseFirestore.FieldValue;
  createdAt: FirebaseFirestore.FieldValue;
};

export type SlackOAuth = {
  installation: Installation<"v1" | "v2", false>;
  targetChannelId?: string;
  joinedChannelIds?: string[];
  isAllPublicChannel?: boolean;
} & TimeStamp;

export type SlackTrendMessageQueue = {
  teamId: string;
  bulkChannelIds: string[][];
} & TimeStamp;

export type SlackPostedTrendMessage = {
  teamId: string;
  messages: { channelId: string; messageTs: string }[];
} & TimeStamp;
