import { InstallURLOptions, Installation } from "@slack/oauth";
import * as admin from "firebase-admin";

export const db = admin.firestore();
export const { FieldValue } = admin.firestore;

export const SlackOAuthDB = db.collection("slackOAuth");
export const SlackOAuthStateDB = db.collection("slackOAuthState");

type TimeStamp = {
  updatedAt: FirebaseFirestore.FieldValue;
  createdAt: FirebaseFirestore.FieldValue;
};

export type SlackOAuthState = {
  installUrlOptions: InstallURLOptions;
} & TimeStamp;

export type SlackOAuth = {
  installation: Installation<"v1" | "v2", false>;
} & TimeStamp;
