import {
  ForkConfig,
  MempoolOrder,
} from 'hardhat/internal/hardhat-network/provider/node-types';
import { createHardhatNetworkProvider } from 'hardhat/internal/hardhat-network/provider/provider';
// import { applyProviderWrappers } from "hardhat/internal/core/providers/construction";
import { normalizeHardhatNetworkAccountsConfig } from 'hardhat/internal/core/providers/util';
import { BackwardsCompatibilityProviderAdapter } from 'hardhat/internal/core/providers/backwards-compatibility';
import {
  Artifacts,
  EIP1193Provider,
  EthereumProvider,
  KadenaNetworkConfig,
} from 'hardhat/types';
import path from 'path';
import { Logger } from './logger';

const getForkCacheDirPath = (cache: string) => {
  return path.join(cache, 'kadena-hardhat-fork-cache');
};

/**
 * Hardhat exposes "createHardhatNetworkProvider," which creates an in-process Ethereum provider
 * (including the Ethereum client).
 *
 * The client itself is a Rust-based client, also available via the `@nomicfoundation/edr` package.
 * This means we don’t need to run a separate Hardhat node.
 *
 * This function uses the network configuration to create the providers.
 */

export async function createHardhatProvider(
  hardhatNetConfig: KadenaNetworkConfig,
  logger: Logger,
  artifacts?: Artifacts,
): Promise<EthereumProvider> {
  let forkConfig: ForkConfig | undefined;
  const cachePath: string = `./chainweb/${hardhatNetConfig.chainwebChainId}`;

  if (
    hardhatNetConfig.forking?.enabled === true &&
    hardhatNetConfig.forking?.url !== undefined
  ) {
    forkConfig = {
      jsonRpcUrl: hardhatNetConfig.forking?.url,
      blockNumber: hardhatNetConfig.forking?.blockNumber,
      httpHeaders: hardhatNetConfig.forking.httpHeaders,
    };
  }

  const accounts = normalizeHardhatNetworkAccountsConfig(
    hardhatNetConfig.accounts,
  );

  const eip1193Provider: EIP1193Provider = await createHardhatNetworkProvider(
    {
      chainId: hardhatNetConfig.chainId,
      networkId: hardhatNetConfig.chainId,
      hardfork: hardhatNetConfig.hardfork,
      blockGasLimit: hardhatNetConfig.blockGasLimit,
      initialBaseFeePerGas: hardhatNetConfig.initialBaseFeePerGas,
      minGasPrice: hardhatNetConfig.minGasPrice,
      throwOnTransactionFailures: hardhatNetConfig.throwOnTransactionFailures,
      throwOnCallFailures: hardhatNetConfig.throwOnCallFailures,
      automine: hardhatNetConfig.mining.auto,
      intervalMining: hardhatNetConfig.mining.interval,
      // This cast is valid because of the config validation and resolution
      mempoolOrder: hardhatNetConfig.mining.mempool.order as MempoolOrder,
      chains: hardhatNetConfig.chains,
      coinbase: hardhatNetConfig.coinbase,
      genesisAccounts: accounts,
      allowUnlimitedContractSize: hardhatNetConfig.allowUnlimitedContractSize,
      allowBlocksWithSameTimestamp:
        hardhatNetConfig.allowBlocksWithSameTimestamp ?? false,
      initialDate:
        hardhatNetConfig.initialDate !== undefined
          ? new Date(hardhatNetConfig.initialDate)
          : undefined,
      forkConfig,
      forkCachePath: getForkCacheDirPath(cachePath),
      enableTransientStorage: hardhatNetConfig.enableTransientStorage ?? false,
      enableRip7212: hardhatNetConfig.enableRip7212 ?? false,
    },
    {
      enabled: hardhatNetConfig.loggingEnabled,
      printLineFn: (line: string) => logger.info(line),
      replaceLastLineFn: (line: string) => {
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        logger.info(line);
      },
    },
    artifacts,
  );

  const wrappedProvider = eip1193Provider;

  console.log('Creating provider');

  return new BackwardsCompatibilityProviderAdapter(wrappedProvider);
}
