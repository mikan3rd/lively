import * as cloudFunctions from "firebase-functions";

type Config = {
  slack: {
    client_id: string;
    client_secret: string;
    redirect_uri: string;
    state_secret: string;
    signing_secret: string;
    test_auth_token: string;
  };
};

export const CONFIG = cloudFunctions.config() as Config;
