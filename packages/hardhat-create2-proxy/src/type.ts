import {
  DeployContractProperties,
  DeployedContractsOnChains,
} from '@kadena/hardhat-chainweb';

import { BaseContract, Signer } from 'ethers';

export type DeployUsingCreate2 = <
  T extends BaseContract = BaseContract,
  A extends unknown[] = unknown[],
>(
  args: DeployContractProperties<A> & {
    salt: string;
    create2Factory?: string;
    bindToSender?: boolean;
  },
) => Promise<{
  deployments: DeployedContractsOnChains<T>[];
}>;

export interface Create2Helpers {
  getCreate2FactoryAddress: (
    signer?: Signer,
    version?: number | bigint,
  ) => Promise<string>;
  deployCreate2Factory: (
    signer?: Signer,
    version?: number | bigint,
  ) => Promise<
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
  deployUsingCreate2: DeployUsingCreate2;

  predictContractAddress: (
    contractBytecode: string,
    salt: string,
    create2Factory?: string,
    signer?: Signer,
    bindToSender?: boolean,
    create2FactoryVersion?: number | bigint,
  ) => Promise<string>;
}

declare module '@kadena/hardhat-chainweb' {
  interface ChainwebPluginApi {
    create2: Create2Helpers;
  }
}
