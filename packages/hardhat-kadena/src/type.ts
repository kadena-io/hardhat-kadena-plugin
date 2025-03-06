import 'hardhat/types';
import type { Origin } from './utils/chainweb';
import type { DeployContractOnChains } from './utils';
import {
  EthereumProvider,
  HardhatNetworkAccountsConfig,
  HardhatNetworkUserConfig,
  HttpNetworkAccountsConfig,
} from 'hardhat/types';
import 'hardhat/types/runtime';

//HttpNetworkAccountsConfig
export interface ChainwebInProcessConfig {
  accounts?: HardhatNetworkAccountsConfig;
  chains: number;
  graph?: { [key: number]: number[] };
  logging?: 'none' | 'info' | 'debug';
  type?: 'in-process';
  chainIdOffset?: number;
}

export interface ChainwebExternalConfig {
  accounts?: HttpNetworkAccountsConfig;
  chains: number;
  type?: 'external';
  externalHostUrl?: string;
  chainIdOffset?: number;
}

export type ChainwebConfig = ChainwebInProcessConfig | ChainwebExternalConfig;

export interface ChainwebPluginApi {
  initialize: () => void;
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
    chainweb: {
      hardhat: Required<ChainwebInProcessConfig>;
      localhost: Required<ChainwebExternalConfig>;
      [chainwenName: string]: Required<ChainwebConfig>;
    };
    defaultChainweb: string;
  }

  interface HardhatUserConfig {
    chainweb: {
      hardhat?: ChainwebInProcessConfig;
      localhost?: ChainwebExternalConfig;
      [chainwenName: string]: ChainwebConfig | undefined;
    };
    defaultChainweb?: string;
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
    type?: 'chainweb:in-process';
  }
}
declare module 'hardhat/types/runtime' {
  interface HardhatRuntimeEnvironment {
    chainweb: ChainwebPluginApi;
  }
}
