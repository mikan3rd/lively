import * as cloudFunctions from "firebase-functions";

type Config = {
  slack: {
    client_id: string;
    client_secret: string;
    redirect_uri: string;
  };
};

export const CONFIG = cloudFunctions.config() as Config;
