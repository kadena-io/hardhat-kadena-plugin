import {
  DeployContractProperties,
  DeployedContractsOnChains,
} from '@kadena/hardhat-chainweb';
import { BaseContract, BytesLike } from 'ethers';
import { HardhatUserConfig } from 'hardhat/types';

export type DeployUsingCreate2 = <
  T extends BaseContract = BaseContract,
  A extends unknown[] = unknown[],
>(
  args: DeployContractProperties<A> & { salt?: BytesLike },
) => Promise<{
  deployments: DeployedContractsOnChains<T>[];
}>;

export interface Create2Helpers {
  getCreate2FactoryAddress: () => Promise<string>;
  deployUsingCreate2: DeployUsingCreate2;
  deployCreate2Factory: () => Promise<
    {
      contract: unknown;
      address: string;
      chain: number;
      deployer: string;
      network: {
        chainId: number;
        name: string;
      };
    }[]
  >;
  predictContractAddress: (
    contractBytecode: string,
    salt?: BytesLike,
  ) => Promise<string>;
  changeConfig: (userConfig: HardhatUserConfig['create2proxy']) => void;
}

declare module '@kadena/hardhat-chainweb' {
  interface ChainwebPluginApi {
    create2: Create2Helpers;
  }
}

declare module 'hardhat/types' {
  interface HardhatConfig {
    create2proxy: {
      version: number;
      deployerAddress: string;
      defaultSalt: BytesLike;
    };
  }

  interface HardhatUserConfig {
    create2proxy?: {
      version?: number;
      deployerAddress?: string;
      defaultSalt?: string;
    };
  }
}
