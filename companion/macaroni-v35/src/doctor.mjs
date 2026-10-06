import { runDoctor } from "./doctor-lib.mjs";

const report = await runDoctor();
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.ready) process.exitCode = 1;
