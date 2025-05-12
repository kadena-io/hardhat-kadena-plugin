import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getCreate2FactoryUtils } from './deployCreate2Factory';
import { getCreate2Utils } from './deployUsingCreate2';
import { ChainwebNetwork } from '../utils/chainweb';
import { Signer } from 'ethers';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { DeployOnChainsUsingCreate2 } from '../utils';

export interface Create2Helpers {
  getCreate2FactoryAddress: (
    signer: Signer,
    version?: number,
  ) => Promise<string>;
  deployOnChainsUsingCreate2: DeployOnChainsUsingCreate2;
  deployCreate2Factory: ({
    signer,
    version,
    fundingDeployerWith,
  }: {
    signer: Signer;
    version?: number;
    fundingDeployerWith?: number;
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

export const getCreate2Helpers = (
  hre: HardhatRuntimeEnvironment,
  chainwebNetwork?: ChainwebNetwork,
): Create2Helpers => {
  const { getCreate2FactoryAddress, deployCreate2Factory } =
    getCreate2FactoryUtils(hre);

  const { deployOnChainsUsingCreate2, predictCreate2Address } = getCreate2Utils(
    hre,
    chainwebNetwork,
  );

  return {
    getCreate2FactoryAddress,
    deployCreate2Factory,
    deployOnChainsUsingCreate2,
    predictCreate2Address,
  };
};
