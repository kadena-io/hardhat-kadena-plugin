import 'hardhat/types';
import type { Origin } from './utils/chainweb';
import type { DeployContractOnChains } from './utils';
import {
  EthereumProvider,
  HardhatNetworkAccountsConfig,
  HardhatNetworkUserConfig,
  HttpNetworkAccountsConfig,
  HttpNetworkUserConfig,
} from 'hardhat/types';
import 'hardhat/types/runtime';
import { Create2Helpers } from './create2';

//HttpNetworkAccountsConfig
export interface ChainwebInProcessUserConfig {
  accounts?: HardhatNetworkAccountsConfig;
  chains: number;
  graph?: { [key: number]: number[] };
  logging?: 'none' | 'info' | 'debug';
  type?: 'in-process';
  chainIdOffset?: number;
  networkOptions?: HardhatNetworkUserConfig;
}

export interface ChainwebInProcessConfig
  extends Required<Omit<ChainwebInProcessUserConfig, 'networkOptions'>> {
  precompiles: {
    chainwebChainId: string;
    spvVerify: string;
  };
  networkOptions?: Omit<HardhatNetworkUserConfig, 'chainId'>;
}

export interface ChainwebExternalUserConfig {
  accounts?: HttpNetworkAccountsConfig;
  chains: number;
  type?: 'external';
  externalHostUrl?: string;
  chainIdOffset?: number;
  precompiles?: {
    chainwebChainId?: string;
    spvVerify?: string;
  };
  networkOptions?: Omit<HttpNetworkUserConfig, 'chainId' | 'url'>;
}

export interface ChainwebExternalConfig
  extends Required<Omit<ChainwebExternalUserConfig, 'networkOptions'>> {
  precompiles: {
    chainwebChainId: string;
    spvVerify: string;
  };
  networkOptions?: Omit<HttpNetworkUserConfig, 'chainId' | 'url'>;
}

export type ChainwebUserConfig =
  | ChainwebInProcessUserConfig
  | ChainwebExternalUserConfig;

export type ChainwebConfig = ChainwebInProcessConfig | ChainwebExternalConfig;

export interface ChainwebPluginApi {
  initialize: (args?: {
    forking?: { url: string; blockNumber?: number };
  }) => void;
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
  runOverChains: <T>(callback: (chainId: number) => Promise<T>) => Promise<T[]>;
  create2Helpers: Create2Helpers;
}

declare module 'hardhat/types' {
  interface HardhatConfig {
    chainweb: {
      hardhat: ChainwebInProcessConfig;
      localhost: ChainwebExternalConfig;
      [chainwebName: string]: ChainwebConfig;
    };
    defaultChainweb: string;
  }

  interface HardhatUserConfig {
    chainweb: {
      hardhat?: ChainwebInProcessUserConfig;
      [chainwebName: string]: ChainwebUserConfig | undefined;
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
