import { TezosWatcher } from "./adapters/tezos-watcher.mjs";
import { loadCompanionConfig } from "./config.mjs";
import { runDoctor } from "./doctor-lib.mjs";
import { CompanionFulfillmentRuntime } from "./fulfillment.mjs";
import { createCompanionHttpServer } from "./http-service.mjs";
import { openJournal } from "./journal.mjs";
import { CompanionProjectService } from "./project-service.mjs";
import { CompanionCreatorSetup } from "./creator-setup.mjs";

async function main() {
  const { config, errors } = loadCompanionConfig();
  const doctor = await runDoctor({ config, configErrors: errors });
  if (!doctor.ready) {
    process.stderr.write(`${JSON.stringify(doctor, null, 2)}\n`);
    throw new Error("Macaroni Companion remains fail-closed because readiness checks did not pass");
  }

  const watcher = new TezosWatcher({
    rpcUrl: config.rpcUrl,
    indexerUrl: config.indexerUrl,
    duplicateCheckUrl: config.duplicateCheckUrl,
    duplicateCheckMode: config.duplicateCheckMode,
    network: config.network,
    expectedChainId: config.expectedChainId,
    signerKeyFile: config.signerKeyFile,
    abiPath: config.abiPath,
  });
  await watcher.initialize();
  const blockTimingMs = await watcher.blockTimingMs();
  const journal = openJournal(config.journalPath);
  const projectService = new CompanionProjectService({ config, journal, watcher });
  await projectService.initializeDirectories();
  const runtime = new CompanionFulfillmentRuntime({ config, journal, watcher, projectService, blockTimingMs });
  const creatorSetup = new CompanionCreatorSetup({ config, journal, watcher, projectService, runtime });
  const server = await createCompanionHttpServer({ config, doctor, projectService, watcher, runtime, creatorSetup });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, resolve);
  });
  runtime.start();
  process.stdout.write(`Macaroni V3.5 Companion is ready at ${config.publicBaseUrl}\n`);

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    runtime.stop();
    await runtime.activeTick?.catch(() => undefined);
    await new Promise((resolve) => server.close(resolve));
    journal.close();
  };
  process.once("SIGINT", () => void stop().then(() => process.exit(0)));
  process.once("SIGTERM", () => void stop().then(() => process.exit(0)));
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
