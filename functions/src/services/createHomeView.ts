import { Checkboxes, Option, SectionBlock, View } from "@slack/web-api";

import { SlackOAuth } from "../firebase/firestore";
import { logger } from "../firebase/functions";
import { Action } from "../slack/actionIds";

export const createHomeView = (slackOAuthData: SlackOAuth) => {
  const { isAllPublicChannel = false, joinedChannelIds, targetChannelId, selectedTrendNum = 10 } = slackOAuthData;

  const joinChannelListBlock: SectionBlock = {
    type: "section",
    text: {
      type: "mrkdwn",
      text:
        "【必須】botと連携するチャンネルを設定してください\n\n連携したチャンネルのみ人気のメッセージをチェックできます",
    },
  };

  const joinAllChannelOption: Option = {
    text: {
      type: "mrkdwn",
      text: "*全てのpublicチャンネルと連携する*",
    },
    description: {
      type: "plain_text",
      text: "新しく作成されたpublicチャンネルにも自動で連携されます",
    },
    value: "checked",
  };

  const joinAllChannelCheckbox: Checkboxes = {
    type: "checkboxes",
    action_id: Action.JoinAllChannel,
    options: [joinAllChannelOption],
    confirm: {
      title: {
        type: "plain_text",
        text: isAllPublicChannel ? "連携を解除しますか？" : "連携しますか？",
      },
      text: {
        type: "mrkdwn",
        text: "人気のメッセージをチェックするには連携が必要です",
      },
      confirm: {
        type: "plain_text",
        text: isAllPublicChannel ? "連携解除" : "連携する",
      },
      deny: {
        type: "plain_text",
        text: "キャンセル",
      },
      style: isAllPublicChannel ? "danger" : "primary",
    },
  };

  if (isAllPublicChannel) {
    joinAllChannelCheckbox.initial_options = [joinAllChannelOption];
  } else {
    joinChannelListBlock.accessory = {
      action_id: Action.JoinChennelList,
      type: "multi_channels_select",
      initial_channels: joinedChannelIds ?? [],
      placeholder: {
        type: "plain_text",
        text: "【必須】チャンネル選択",
      },
    };
  }

  const trendNumList = [5, 10, 15, 20, 30, 40, 50, 100];
  const trendNumOptions: Option[] = trendNumList.map((num) => {
    const numString = String(num);
    return {
      text: {
        type: "plain_text",
        text: numString,
      },
      value: numString,
    };
  });
  const initialTrendOption = trendNumOptions.find((option) => Number(option.value) === selectedTrendNum);

  const view: View = {
    type: "home",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*【必須】* botの投稿先のチャンネルを設定してください",
        },
        accessory: {
          action_id: Action.SelectTargetChannel,
          type: "channels_select",
          initial_channel: targetChannelId,
          placeholder: {
            type: "plain_text",
            text: "【必須】チャンネル選択",
          },
        },
      },
      { type: "divider" },
      joinChannelListBlock,
      {
        type: "actions",
        elements: [joinAllChannelCheckbox],
      },
      { type: "divider" },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "人気投稿に必要なリアクション数の設定",
        },
        accessory: {
          action_id: Action.SelectTrendNum,
          type: "static_select",
          initial_option: initialTrendOption,
          options: trendNumOptions,
        },
      },
      { type: "divider" },
    ],
  };
  logger.debug(view);
  return view;
};
