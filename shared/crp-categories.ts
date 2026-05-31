export type CrpCategory = {
  id: string;
  label: string;
  hashtag: string;
  description: string;
};

/** Official Tezos Community Rewards Program categories (Tezos Commons). */
export const CRP_CATEGORIES: CrpCategory[] = [
  {
    id: "drill-sergeant",
    label: "Drill Sergeant Award",
    hashtag: "TezosCRP",
    description: "Onboarding developers into the Tezos ecosystem.",
  },
  {
    id: "helping-hand",
    label: "Helping Hand Award",
    hashtag: "TezosCRP",
    description: "Helping people onboard and use Tezos.",
  },
  {
    id: "influencer",
    label: "Influencer Award",
    hashtag: "TezosCRP",
    description: "Social engagement, awareness, and education.",
  },
  {
    id: "tez-dev",
    label: "Tez Dev Award",
    hashtag: "TezosCRP",
    description: "Developer contributions on Tezos.",
  },
  {
    id: "assimilation",
    label: "Assimilation Award",
    hashtag: "TezosCRP",
    description: "Artists and collectors onboarding into Tezos.",
  },
  {
    id: "formal-verification",
    label: "Formal Verification Award",
    hashtag: "TezosCRP",
    description: "Constructive discourse and rigorous community debate.",
  },
  {
    id: "patissier",
    label: "Pâtissier Award",
    hashtag: "TezosCRP",
    description: "Baking, decentralization, and moving tez off exchanges.",
  },
  {
    id: "tezos-tutor",
    label: "Tezos Tutor Award",
    hashtag: "TezosCRP",
    description: "Educational content for the ecosystem.",
  },
  {
    id: "teo",
    label: "TEO Award",
    hashtag: "TezosCRP",
    description: "Long-standing service to the Tezos ecosystem.",
  },
];

export function findCrpCategory(id: string): CrpCategory | undefined {
  return CRP_CATEGORIES.find((category) => category.id === id);
}
