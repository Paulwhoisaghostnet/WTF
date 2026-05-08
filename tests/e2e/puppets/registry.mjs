export const PUPPET_ACTORS = [
  {
    id: "bert",
    username: "e2e_bert",
    displayName: "Bert",
    role: "contestant",
    walletId: "e2e-bert",
  },
  {
    id: "ernie",
    username: "e2e_ernie",
    displayName: "Ernie",
    role: "contestant",
    walletId: "e2e-ernie",
  },
  {
    id: "elmo",
    username: "e2e_elmo",
    displayName: "Elmo",
    role: "witness",
    walletId: "e2e-elmo",
  },
  {
    id: "bigbird",
    username: "e2e_bigbird",
    displayName: "BigBird",
    role: "host",
    walletId: "e2e-bigbird",
  },
  {
    id: "thecount",
    username: "e2e_thecount",
    displayName: "TheCount",
    role: "admin",
    walletId: "e2e-thecount",
  },
  {
    id: "snuffaluffagus",
    username: "e2e_snuffaluffagus",
    displayName: "Snuffaluffagus",
    role: "cohost",
    walletId: "e2e-snuffaluffagus",
  },
  {
    id: "grover",
    username: "e2e_grover",
    displayName: "Grover",
    role: "resident_wizard",
    walletId: "e2e-grover",
  },
  {
    id: "cookiemonster",
    username: "e2e_cookiemonster",
    displayName: "CookieMonster",
    role: "trusted_creator",
    walletId: "e2e-cookiemonster",
  },
  {
    id: "oscar",
    username: "e2e_oscar",
    displayName: "Oscar",
    role: "witness",
    walletId: "e2e-oscar",
  },
  {
    id: "abbycadabby",
    username: "e2e_abbycadabby",
    displayName: "AbbyCadabby",
    role: "trusted_creator",
    walletId: "e2e-abbycadabby",
  },
  {
    id: "zoe",
    username: "e2e_zoe",
    displayName: "Zoe",
    role: "contestant",
    walletId: "e2e-zoe",
  },
  {
    id: "rosita",
    username: "e2e_rosita",
    displayName: "Rosita",
    role: "contestant",
    walletId: "e2e-rosita",
  },
];

export const PUPPET_ACTOR_COUNT = PUPPET_ACTORS.length;

export function puppetEmail(actor) {
  return `e2e+${actor.id}@wtfgameshow.local`;
}

export function actorForWorkflow(workflow, actors = PUPPET_ACTORS) {
  const admin = actors.find((actor) => actor.role === "admin") ?? actors[0];
  const creator = actors.find((actor) => actor.role === "trusted_creator") ?? actors[0];
  const contestant = actors.find((actor) => actor.role === "contestant") ?? actors[0];
  const name = `${workflow?.name ?? ""} ${workflow?.domain ?? ""}`.toLowerCase();
  const probePaths = (workflow?.apiProbes ?? [])
    .map((probe) => probe?.path ?? "")
    .join(" ")
    .toLowerCase();

  if (/\/api\/admin\b|\/api\/arcade\/admin\b|\/api\/operator-wallet\b|\/api\/factory\b/.test(probePaths)) return admin;
  if (/admin|operator|contract|governance|automation/.test(name)) return admin;
  if (/studio|creator|media|arcade/.test(name)) return creator;
  return contestant;
}
