import 'hardhat/types';
import type { ChainwebNetwork, Origin } from './utils/chainweb';
import type { DeployContractOnChains } from './utils';
import {
  EthereumProvider,
  HardhatNetworkAccountsConfig,
  HardhatNetworkUserConfig,
} from 'hardhat/types';
import 'hardhat/types/runtime';

export interface ChainwebExrenalUserConfig {
  networkStem?: string;
  networkType: 'external';
  accounts: HardhatNetworkAccountsConfig;
  spvProofEndpoint?: string;
  chains?: number;
}
export interface ChainwebHardhatUserConfig {
  networkStem?: string;
  accounts?: HardhatNetworkAccountsConfig;
  chains?: number;
  graph?: { [key: number]: number[] };
  logging?: 'none' | 'info' | 'debug';
  networkType?: 'hardhat';
}

export type ChainwebUserConfig =
  | ChainwebHardhatUserConfig
  | ChainwebExrenalUserConfig;

export type ChainwenConfig = Required<ChainwebUserConfig> & {
  chainIds: number[];
};

export interface ChainwebPluginApi {
  network?: ChainwebNetwork;
  getProvider: (cid: number) => Promise<EthereumProvider>;
  requestSpvProof: (targetChain: number, origin: Origin) => Promise<string>;
  switchChain: (cid: number) => Promise<void>;
  getChainIds: () => number[];
  callChainIdContract: () => Promise<number>;
  deployContractOnChains: DeployContractOnChains;
  createTamperedProof: (targetChain: number, origin: Origin) => Promise<string>;
  computeOriginHash: (origin: Origin) => string;
  deployMocks: () => ReturnType<DeployContractOnChains>;
}

declare module 'hardhat/types' {
  interface HardhatConfig {
    chainweb: ChainwenConfig;
  }

  interface HardhatUserConfig {
    chainweb: ChainwebUserConfig;
  }
  interface HardhatNetworkConfig {
    chainwebChainId?: number;
  }

  interface HttpNetworkConfig {
    chainwebChainId?: number;
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
