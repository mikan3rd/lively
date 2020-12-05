import { Installation } from "@slack/oauth";
import * as admin from "firebase-admin";

export const db = admin.firestore();
export const { FieldValue } = admin.firestore;

export const SlackOAuthDB = db.collection("slackOAuth");

type TimeStamp = {
  updatedAt: FirebaseFirestore.FieldValue;
  createdAt: FirebaseFirestore.FieldValue;
};

export type SlackOAuth = {
  installation: Installation<"v1" | "v2", false>;
} & TimeStamp;
