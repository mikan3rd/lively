import { Installation } from "@slack/oauth";
import * as admin from "firebase-admin";

export const db = admin.firestore();
export const { FieldValue } = admin.firestore;

export const SlackOAuthDB = db.collection("slackOAuth");
export const SlackPostedTrendMessageDB = db.collection("slackPostedTrendMessage");

type TimeStamp = {
  updatedAt: FirebaseFirestore.FieldValue;
  createdAt: FirebaseFirestore.FieldValue;
};

export type SlackOAuth = {
  installation: Installation<"v1" | "v2", false>;
  targetChannelId?: string;
  joinedChannelIds?: string[];
  isAllPublicChannel?: boolean;
} & TimeStamp;

export type SlackPostedTrendMessage = {
  teamId: string;
  channelId: string;
  messageTs: string;
} & TimeStamp;
