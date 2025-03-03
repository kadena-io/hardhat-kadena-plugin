import 'hardhat/types';
import type { Origin } from './utils/chainweb';
import type { DeployContractOnChains } from './utils';
import {
  EthereumProvider,
  HardhatNetworkAccountsConfig,
  HardhatNetworkUserConfig,
} from 'hardhat/types';
import 'hardhat/types/runtime';

export interface ChainwebConfig {
  networkStem?: string;
  accounts?: HardhatNetworkAccountsConfig;
  chains: number;
  graph?: { [key: number]: number[] };
  logging?: 'none' | 'info' | 'debug';
  type?: 'in-process' | 'external';
  externalHostUrl?: string;
}

export interface ChainwebPluginApi {
  getProvider: (cid: number) => Promise<EthereumProvider>;
  requestSpvProof: (
    targetChain: number,
    origin: Omit<Origin, 'originContractAddress'>,
  ) => Promise<string>;
  switchChain: (cid: number) => Promise<void>;
  getChainIds: () => number[];
  callChainIdContract: () => Promise<number>;
  deployContractOnChains: DeployContractOnChains;
  createTamperedProof: (targetChain: number, origin: Origin) => Promise<string>;
  computeOriginHash: (origin: Origin) => string;
  preCompiles: {
    chainwebChainId: string;
    spvVerify: string;
  };
}

declare module 'hardhat/types' {
  interface HardhatConfig {
    chainweb: Required<ChainwebConfig>;
  }

  interface HardhatUserConfig {
    chainweb: ChainwebConfig;
  }
  interface HardhatNetworkConfig {
    chainwebChainId?: number;
    type?: 'chainweb:in-process';
  }

  interface HttpNetworkConfig {
    chainwebChainId?: number;
    type?: 'chainweb:external';
  }

  interface KadenaNetworkConfig extends HardhatNetworkConfig {
    chainwebChainId: number;
  }

  interface KadenaHardhatNetworkUserConfig extends HardhatNetworkUserConfig {
    chainwebChainId: number;
  }
}
declare module 'hardhat/types/runtime' {
  interface HardhatRuntimeEnvironment {
    chainweb: ChainwebPluginApi;
  }
}
