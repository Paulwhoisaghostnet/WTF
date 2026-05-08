import type { TriggerDefinition } from "../events/types";

export const triggerRegistry: TriggerDefinition[] = [
  {
    key: "messageboard.post.created",
    label: "User posts on messageboard",
    description: "Fires when a user creates any messageboard post or reply.",
    sourceModule: "messageboard",
    requiredParameters: [],
    optionalParameters: [
      {
        key: "channelId",
        label: "Channel ID",
        type: "number",
        description: "Restrict to a specific messageboard channel.",
      },
    ],
    eventTypes: ["messageboard.post.created"],
    comparisonModes: ["exists", "not_exists", "count_gte", "count_eq", "count_lte"],
    timingMode: "counted",
  },
  {
    key: "messageboard.channel.post.created",
    label: "User posts in channel",
    description: "Fires when a user posts in a configured messageboard channel.",
    sourceModule: "messageboard",
    requiredParameters: [
      {
        key: "channelId",
        label: "Channel ID",
        type: "number",
      },
    ],
    optionalParameters: [],
    eventTypes: ["messageboard.channel.post.created"],
    comparisonModes: ["exists", "not_exists", "count_gte", "count_eq", "count_lte"],
    timingMode: "counted",
  },
  {
    key: "user.wallet.connected",
    label: "User connects wallet",
    description: "Fires after a user proves ownership and links a wallet.",
    sourceModule: "wallets",
    requiredParameters: [],
    optionalParameters: [
      {
        key: "walletAddress",
        label: "Wallet address",
        type: "string",
      },
    ],
    eventTypes: ["user.wallet.connected"],
    comparisonModes: ["exists", "not_exists", "count_gte"],
    timingMode: "instant",
  },
  {
    key: "tezos.owns_contract",
    label: "User owns NFT from contract",
    description: "Externally verifies whether a linked Tezos wallet owns any FA2 token from a contract.",
    sourceModule: "tezos",
    requiredParameters: [
      {
        key: "contractAddress",
        label: "FA2 contract",
        type: "string",
      },
    ],
    optionalParameters: [
      {
        key: "minimumQuantity",
        label: "Minimum quantity",
        type: "number",
      },
    ],
    eventTypes: ["token.contract.owned", "nft.ownership.verified"],
    comparisonModes: ["exists"],
    timingMode: "externally_verified",
  },
  {
    key: "tezos.owns_specific_token_id",
    label: "User owns specific token id",
    description: "Externally verifies whether a linked Tezos wallet owns a token id from a FA2 contract.",
    sourceModule: "tezos",
    requiredParameters: [
      {
        key: "contractAddress",
        label: "FA2 contract",
        type: "string",
      },
      {
        key: "tokenId",
        label: "Token ID",
        type: "string",
      },
    ],
    optionalParameters: [
      {
        key: "minimumQuantity",
        label: "Minimum quantity",
        type: "number",
      },
    ],
    eventTypes: ["token.id.owned", "nft.ownership.verified"],
    comparisonModes: ["exists"],
    timingMode: "externally_verified",
  },
  {
    key: "desktop.object.clicked",
    label: "User clicks desktop object",
    description: "Fires when a tracked desktop object is clicked.",
    sourceModule: "desktop",
    requiredParameters: [
      {
        key: "objectId",
        label: "Object ID",
        type: "string",
      },
    ],
    optionalParameters: [],
    eventTypes: ["desktop.object.clicked"],
    comparisonModes: ["exists", "count_gte", "count_eq", "count_lte"],
    timingMode: "instant",
  },
  {
    key: "desktop.pet.interacted",
    label: "User interacts with desktop pet",
    description: "Fires when the desktop pet receives a care/customize interaction.",
    sourceModule: "desktop",
    requiredParameters: [],
    optionalParameters: [
      {
        key: "action",
        label: "Pet action",
        type: "string",
      },
    ],
    eventTypes: ["desktop.pet.interacted"],
    comparisonModes: ["exists", "count_gte", "count_eq", "count_lte"],
    timingMode: "counted",
  },
  {
    key: "map.node.visited",
    label: "User visits map node",
    description: "Fires when a tracked map node is visited.",
    sourceModule: "map",
    requiredParameters: [
      {
        key: "nodeId",
        label: "Node ID",
        type: "string",
      },
    ],
    optionalParameters: [],
    eventTypes: ["map.node.visited"],
    comparisonModes: ["exists", "count_gte", "count_eq", "count_lte"],
    timingMode: "instant",
  },
  {
    key: "gameshow.round.joined",
    label: "User joins gameshow round",
    description: "Fires when a user joins or participates in a gameshow round.",
    sourceModule: "gameshow",
    requiredParameters: [],
    optionalParameters: [
      {
        key: "roundId",
        label: "Round ID",
        type: "number",
      },
    ],
    eventTypes: ["gameshow.round.joined"],
    comparisonModes: ["exists", "count_gte"],
    timingMode: "instant",
  },
  {
    key: "gameshow.challenge.completed",
    label: "User completes challenge",
    description: "Fires when a legacy gameshow challenge or automation challenge is completed.",
    sourceModule: "gameshow",
    requiredParameters: [],
    optionalParameters: [
      {
        key: "challengeId",
        label: "Challenge ID",
        type: "number",
      },
    ],
    eventTypes: ["gameshow.challenge.completed"],
    comparisonModes: ["exists", "count_gte"],
    timingMode: "instant",
  },
  {
    key: "xp.awarded",
    label: "User earns EXP",
    description: "Fires when the existing XP service awards EXP.",
    sourceModule: "rewards",
    requiredParameters: [],
    optionalParameters: [
      {
        key: "minimumAmount",
        label: "Minimum amount",
        type: "number",
      },
      {
        key: "reason",
        label: "Reason",
        type: "string",
      },
    ],
    eventTypes: ["xp.awarded"],
    comparisonModes: ["exists", "count_gte", "count_eq", "count_lte"],
    timingMode: "counted",
  },
  {
    key: "wtf.awarded",
    label: "User earns WTF",
    description: "Fires when an app reward ledger WTF grant is queued or awarded.",
    sourceModule: "rewards",
    requiredParameters: [],
    optionalParameters: [
      {
        key: "minimumAmount",
        label: "Minimum amount",
        type: "number",
      },
    ],
    eventTypes: ["wtf.awarded"],
    comparisonModes: ["exists", "count_gte", "count_eq", "count_lte"],
    timingMode: "counted",
  },
  {
    key: "app.interaction.tracked",
    label: "Any tracked app interaction",
    description: "Counts normalized app interactions across messageboard, desktop, gameshow, map, wallet, and reward surfaces.",
    sourceModule: "platform",
    requiredParameters: [],
    optionalParameters: [
      {
        key: "sourceModule",
        label: "Source module",
        type: "string",
      },
    ],
    eventTypes: ["app.interaction.tracked"],
    comparisonModes: ["exists", "count_gte", "count_eq", "count_lte"],
    timingMode: "time_windowed",
  },
];

const registryByKey = new Map(triggerRegistry.map((trigger) => [trigger.key, trigger]));

export function getTriggerDefinition(key: string) {
  return registryByKey.get(key) ?? null;
}
