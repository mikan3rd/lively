import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

export * from "./oauth";
export * from "./event";
export * from "./interactive";
export * from "./schedule";
