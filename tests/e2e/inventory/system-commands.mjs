// Operator commands have no browser route, HTTP probe or emitted SystemEvent.
// This registry records ownership and proof commands; coverage never executes
// a signer, a paid render, a pin, a service install or a daemon automatically.
export const SYSTEM_COMMANDS = [
  {
    id: "aleatory_provider.operator.status",
    domain: "Administration, Governance, and Operations",
    subdomain: "Aleatory provider / operator status",
    access: "Host operator with private receipt-directory access",
    entrypoint: "extensions/aleatory-provider/src/operator.mts",
    invocation: "node --import tsx extensions/aleatory-provider/src/operator.mts status",
    effects: "Reads mainnet provider/registry and wallet balances; may reconcile existing local receipts; submits no chain operation.",
    ownerChecks: ["extensions/aleatory-provider/tests/operator.test.mts"],
  },
  {
    id: "aleatory_provider.operator.estimate",
    domain: "Administration, Governance, and Operations",
    subdomain: "Aleatory provider / operation estimate",
    access: "Host operator with separately controlled operator and agent keyrings",
    entrypoint: "extensions/aleatory-provider/src/operator.mts",
    invocation: "node --import tsx extensions/aleatory-provider/src/operator.mts estimate --for <action>",
    effects: "Estimates originate, register, fund-agent, reveal-agent or set-price with explicit configured identities and price; funding/repricing require explicit amounts; estimate never injects an operation.",
    ownerChecks: ["extensions/aleatory-provider/tests/operator.test.mts"],
  },
  {
    id: "aleatory_provider.operator.execute",
    domain: "Administration, Governance, and Operations",
    subdomain: "Aleatory provider / signed operations",
    access: "Authorized host operator using the action's required custody wallet",
    entrypoint: "extensions/aleatory-provider/src/operator.mts",
    invocation: "node --import tsx extensions/aleatory-provider/src/operator.mts <action> --execute",
    effects: "Executes originate, register, fund-agent, reveal-agent or set-price only after explicit execution; funding/repricing also require --amount-mutez/--price-mutez and --request-id; persists signed-operation receipts before injection and reconciles retries without replacing the original intent.",
    ownerChecks: ["extensions/aleatory-provider/tests/operator.test.mts"],
  },
  {
    id: "aleatory_provider.queue.check",
    domain: "Administration, Governance, and Operations",
    subdomain: "Aleatory provider / read-only chain and queue check",
    access: "Host operator with public configuration and local health-file access; no signing custody required",
    entrypoint: "extensions/aleatory-provider/src/check.mts",
    invocation: "node --import tsx extensions/aleatory-provider/src/check.mts",
    effects: "Verifies RPC/indexer network and router/registry/provider identities, reports upstream-sampled pending tokens and reads health.json; does not render, pin, sign or establish completed delivery.",
    ownerChecks: ["extensions/aleatory-provider/tests/config.test.mts", "extensions/aleatory-provider/vendor/provider/runtime.test.mts"],
  },
  {
    id: "aleatory_provider.render.prove",
    domain: "Administration, Governance, and Operations",
    subdomain: "Aleatory provider / renderer and optional pin proof",
    access: "Host operator with selected Cloudflare credentials; Pinata credential required only for --pin",
    entrypoint: "extensions/aleatory-provider/src/prove.mts",
    invocation: "node --import tsx extensions/aleatory-provider/src/prove.mts [--generator KT1... --token N] [--pin]",
    effects: "Renders the diagnostic fixture or an existing token twice, compares canonical captures/traits/readiness and writes proof files; diagnostic --pin publishes the fixture PNG and unminted metadata document, then verifies public retrieval; never signs or modifies token metadata, and pin proof is rejected for another artist's generator.",
    ownerChecks: ["extensions/aleatory-provider/vendor/provider/runtime.test.mts"],
    liveEvidence: "Successful command output plus preserved proof.json/capture.png and, with --pin, CID and byte-identical public retrieval; this is infrastructure proof, not assigned-token delivery proof.",
  },
  {
    id: "aleatory_provider.daemon.run",
    domain: "Administration, Governance, and Operations",
    subdomain: "Aleatory provider / canonical metadata delivery",
    access: "Dedicated systemd service user with an agent-only encrypted keyring and selected provider credentials",
    entrypoint: "extensions/aleatory-provider/src/daemon.mts",
    invocation: "node --import tsx extensions/aleatory-provider/src/daemon.mts",
    effects: "Polls assigned work using upstream defaults, renders/pins canonical output, signs token-metadata publication with the agent and persists recovery/health state; exposes no public route or push listener.",
    ownerChecks: ["extensions/aleatory-provider/tests/config.test.mts", "extensions/aleatory-provider/vendor/provider/runtime.test.mts"],
    liveEvidence: "Active isolated service and current health state, plus an assigned token's confirmed metadata operation, expected URI/CID and public byte verification; idle polling alone is insufficient.",
  },
  {
    id: "aleatory_provider.release.install",
    domain: "Administration, Governance, and Operations",
    subdomain: "Aleatory provider / isolated release operations",
    access: "Local release operator; host root required for installation/activation",
    entrypoint: "extensions/aleatory-provider/ops/install.sh",
    invocation: "sudo bash extensions/aleatory-provider/ops/install.sh RELEASE.tar.gz [--activate]",
    effects: "Installs only committed provider files and independent locked dependencies under immutable release paths; activation separately validates dedicated agent custody and starts the daemon; does not redeploy the web app or originate/register/fund the provider.",
    ownerChecks: ["extensions/aleatory-provider/ops/test_release.py"],
  },
];

export function assertSystemCommands({ inventoryMarkdown, domainWorkflows, sourceExists }) {
  const failures = [];
  const ids = new Set();
  const referenced = new Set(domainWorkflows.flatMap((workflow) => workflow.systemCommandIds ?? []));
  for (const command of SYSTEM_COMMANDS) {
    if (!/^[a-z0-9_]+(\.[a-z0-9_]+)+$/.test(command.id) || ids.has(command.id)) failures.push(`Invalid/duplicate system command id: ${command.id}`);
    ids.add(command.id);
    for (const key of ["domain", "subdomain", "access", "entrypoint", "invocation", "effects"]) {
      if (!command[key]?.trim()) failures.push(`${command.id} is missing ${key}`);
    }
    if (!inventoryMarkdown.includes(`\`${command.id}\``)) failures.push(`${command.id} is absent from the command inventory`);
    if (!referenced.has(command.id)) failures.push(`${command.id} has no domain workflow owner`);
    if (!command.ownerChecks.length) failures.push(`${command.id} has no local verification owner`);
    for (const source of [command.entrypoint, ...command.ownerChecks]) {
      if (!sourceExists(source)) failures.push(`${command.id} references missing source ${source}`);
    }
  }
  for (const id of referenced) if (!ids.has(id)) failures.push(`Workflow references unknown system command ${id}`);
  return failures;
}
