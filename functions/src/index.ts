import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

export * from "./oauth";
