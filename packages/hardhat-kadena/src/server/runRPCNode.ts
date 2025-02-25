/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  HardhatRuntimeEnvironment,
  EIP1193Provider,
  HardhatNetworkConfig,
} from 'hardhat/types';
import { ChainwebJsonRpcServer } from './server.js';
import fs from 'fs';
import { watchCompilerOutput } from 'hardhat/builtin-tasks/utils/watch';
import { normalizeHardhatNetworkAccountsConfig } from 'hardhat/internal/core/providers/util.js';

import {
  bytesToHex as bufferToHex,
  privateToAddress,
  toBytes,
  toChecksumAddress,
} from '@nomicfoundation/ethereumjs-util';
import { mapChainIdToRoute } from './utils';

export async function runRPCNode(
  taskArgs: any,
  hre: HardhatRuntimeEnvironment,
) {
  const { hostname: hostnameParam, port } = taskArgs;
  let hostname: string;
  if (hostnameParam !== undefined) {
    hostname = hostnameParam;
  } else {
    const insideDocker = fs.existsSync('/.dockerenv');
    if (insideDocker) {
      hostname = '0.0.0.0';
    } else {
      hostname = '127.0.0.1';
    }
  }

  if (hre.config.chainweb) {
    // TODO: run my network
    const providers: [chainId: number, provider: EIP1193Provider][] =
      await Promise.all(
        hre.chainweb
          .getChainIds()
          .map(
            async (cid) => [cid, await hre.chainweb.getProvider(cid)] as const,
          ),
      );
    const server = new ChainwebJsonRpcServer({
      port,
      hostname,
      providers,
    });

    server.listen();

    const watchers = providers.map(([, provider]) => {
      return watchCompilerOutput(provider, hre.config.paths).catch((error) => {
        console.warn(
          "There was a problem watching the compiler output, changes in the contracts won't be reflected in the Hardhat Network. Run Hardhat with --verbose to learn more.",
        );

        console.log(
          "Compilation output can't be watched. Please report this to help us improve Hardhat.\n",
          error,
        );
      });
    });

    console.log(`Started HTTP and WebSocket JSON-RPC server at`);

    providers.forEach(([cid]) => {
      console.log(
        `chain ${cid}: http://${hostname}:${port}${mapChainIdToRoute(cid)}`,
      );
    });

    providers.map(async ([cid]) => {
      const networkName = `${hre.config.chainweb.networkStem}${cid}`;
      const networkConfig = hre.config.networks[networkName];
      console.log(`Chain ${cid}`);
      logHardhatNetworkAccounts(networkConfig as HardhatNetworkConfig);
    });

    await server.waitUntilClosed();
    await Promise.all(watchers.map((w) => w.then((w) => w?.close())));
  }
}
function logHardhatNetworkAccounts(networkConfig: HardhatNetworkConfig) {
  console.log('Accounts');
  console.log('========');

  const accounts = normalizeHardhatNetworkAccountsConfig(
    networkConfig.accounts,
  );

  for (const [index, account] of accounts.entries()) {
    const address = toChecksumAddress(
      bufferToHex(privateToAddress(toBytes(account.privateKey))),
    );

    const balance = (
      BigInt(account.balance) /
      BigInt(10) ** BigInt(18)
    ).toString(10);

    let entry = `Account #${index}: ${address} (${balance} ETH)`;

    const privateKey = bufferToHex(toBytes(account.privateKey));
    entry += `
  Private Key: ${privateKey}`;

    console.log(entry);
    console.log();
  }
}
