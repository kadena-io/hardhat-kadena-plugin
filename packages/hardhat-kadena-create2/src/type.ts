import {
  DeployContractProperties,
  DeployedContractsOnChains,
} from '@kadena/hardhat-chainweb';

import { BaseContract, Signer } from 'ethers';

export type DeployOnChainsUsingCreate2 = <
  T extends BaseContract = BaseContract,
  A extends unknown[] = unknown[],
>(
  args: DeployContractProperties<A> & {
    salt: string;
    create2Factory?: string;
  },
) => Promise<{
  deployments: DeployedContractsOnChains<T>[];
}>;

export interface Create2Helpers {
  getCreate2FactoryAddress: (props?: {
    signer?: Signer;
    version?: number | bigint;
  }) => Promise<string>;
  deployCreate2Factory: (props?: {
    signer?: Signer;
    version?: number | bigint;
  }) => Promise<
    [
      contractAddress: string,
      deployments: {
        contract: unknown;
        address: string;
        chain: number;
        deployer: string;
        network: {
          chainId: number;
          name: string;
        };
      }[],
    ]
  >;
  deployOnChainsUsingCreate2: DeployOnChainsUsingCreate2;
}

declare module '@kadena/hardhat-chainweb' {
  interface ChainwebPluginApi {
    create2: Create2Helpers;
  }
}
