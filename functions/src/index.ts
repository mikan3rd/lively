import dayjs from "dayjs";
import admin from "firebase-admin";
import "dayjs/locale/ja";

process.env.TZ = "Asia/Tokyo";

dayjs.locale("ja");

admin.initializeApp();
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

// SlackAPIの機能に合わせて分類
export * from "./oauth";
export * from "./event";
export * from "./interactive";
export * from "./interactivePubSub";

// その他の独自処理をトリガーに合わせて分類
export * from "./schedule";
export * from "./pubSub";
export * from "./https";
