import { functions, logger } from "./firebase/functions";

export const helloWorld = functions.https.onRequest((request, response) => {
  logger.info("Hello logs 2", { structuredData: true });
  response.send("Hello from Firebase!");
});
