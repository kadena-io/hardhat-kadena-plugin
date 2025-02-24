/* *************************************************************************** */
/* TODO */

import { spawn } from "child_process";
import { Logger, streamLogger } from "./logger";
import { sleep } from "./sleep";

// * support graphs that include non-evm chains (by just skipping over them)
// * Consider deploying the spv precompile at an hash address that won't colide
//   with future Ethereum extensions.
// * Use mocha root hooks to manage hardhat network
// * move all of this into a hardhat-plugin
// * Make logging verbosity configurable
// * Manage hardhat ports internally

/* *************************************************************************** */
/* Run Hardhat Network */

export async function runHardHatNetwork(port: number, logger: Logger) {
  const child = spawn("npx", ["hardhat", "node", "--port", port.toString()], {
    detached: false, // FIXME not sure why this does not work as it should ...
  });

  let isClosed = false;
  const kill = (signal?: NodeJS.Signals | number) => {
    if (!isClosed) {
      isClosed = child.kill(signal);
    }
  };

  const stdoutBuffer = streamLogger(child.stdout, logger.info);
  const stderrBuffer = streamLogger(child.stderr, logger.error);

  child.on("close", (exitCode) => {
    isClosed = true;
    if (stdoutBuffer.length > 0) {
      logger.info(stdoutBuffer);
    }
    if (stderrBuffer.length > 0) {
      logger.error(stderrBuffer);
    }
    if (exitCode === null) {
      logger.info(`terminated with code ${exitCode}`);
    } else if (exitCode != 0) {
      logger.error(`failed with code ${exitCode}`);
      throw new Error(`hardhat ${port} failed with code ${exitCode}`);
    }
  });

  await new Promise((resolve) => {
    child.on("spawn", resolve);
  });

  // kill child on exit
  process.on("exit", () => kill(0));
  process.on("SIGINT", () => kill("SIGINT"));
  process.on("uncaughtException", () => kill("SIGABRT"));

  // FIXME wait for proper messages and return an event if this triggered
  // actually, we may just block runHardHatNetwork until it's ready...
  logger.info(`wait 2 second for hardhat network to start`);
  await sleep(2000);
  return { kill, pid: child.pid };
}
