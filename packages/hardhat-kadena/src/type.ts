import "hardhat/types";
import type { ChainwebNetwork, Origin } from "./utils/chainweb";
import type { DeployContractOnChains } from "./utils";
import {
  HardhatNetworkAccountsConfig,
  HardhatNetworkUserConfig,
} from "hardhat/types";
import "hardhat/types/runtime";
import { HardhatEthersProvider } from "@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider";

export interface ChainwebConfig {
  networkStem?: string;
  accounts?: HardhatNetworkAccountsConfig;
  chains?: number;
  graph?: { [key: number]: number[] };
  logging?: "none" | "info" | "debug";
}

export interface ChainwebPluginApi {
  network: ChainwebNetwork;
  getProvider: (cid: number) => HardhatEthersProvider;
  requestSpvProof: (targetChain: number, origin: Origin) => Promise<string>;
  switchChain: (cid: number) => Promise<void>;
  getChainIds: () => number[];
  callChainIdContract: () => Promise<number>;
  deployContractOnChains: DeployContractOnChains;
  createTamperedProof: (targetChain: number, origin: Origin) => Promise<string>;
  computeOriginHash: (origin: Origin) => string;
  deployMocks: () => ReturnType<DeployContractOnChains>;
}

declare module "hardhat/types" {
  interface HardhatConfig {
    chainweb: Required<ChainwebConfig>;
  }

  interface HardhatUserConfig {
    chainweb: ChainwebConfig;
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
declare module "hardhat/types/runtime" {
  interface HardhatRuntimeEnvironment {
    chainweb: ChainwebPluginApi;
  }
}
