export * from './deployCreate2Factory';
export * from './deployUsingCreate2';
import { Signer } from 'ethers';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { DeployOnChainsUsingCreate2 } from '../utils';

export interface Create2Helpers {
  getCreate2FactoryAddress: (
    signer: Signer,
    version?: number,
  ) => Promise<string>;
  deployOnChainsUsingCreate2: DeployOnChainsUsingCreate2;
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
  predictCreate2Address: (
    contractBytecode: string,
    signer: Signer | HardhatEthersSigner,
    userSalt: string,
  ) => Promise<string>;
}
