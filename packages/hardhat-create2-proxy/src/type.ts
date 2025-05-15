import {
  DeployContractProperties,
  DeployedContractsOnChains,
} from '@kadena/hardhat-chainweb';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { BaseContract, BytesLike, Signer } from 'ethers';

export type DeployUsingCreate2 = <
  T extends BaseContract = BaseContract,
  A extends unknown[] = unknown[],
>(
  args: DeployContractProperties<A> & { salt?: BytesLike },
) => Promise<{
  deployments: DeployedContractsOnChains<T>[];
}>;

export interface Create2Helpers {
  getCreate2FactoryAddress: (
    signer: Signer,
    version?: number,
  ) => Promise<string>;
  deployUsingCreate2: DeployUsingCreate2;
  deployCreate2Factory: (props?: {
    signer?: string;
    version?: number;
    fundingDeployerWith?: string;
  }) => Promise<
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
    signer: Signer | HardhatEthersSigner,
    salt: BytesLike,
  ) => Promise<string>;
  deriveSecondaryKey(
    signer: Signer,
    version?: number,
  ): Promise<{
    publicKey: string;
    privateKey: string;
  }>;
}

declare module '@kadena/hardhat-chainweb' {
  interface ChainwebPluginApi {
    create2: Create2Helpers;
  }
}
