import {
  HardhatConfig,
  HardhatRuntimeEnvironment,
  HardhatUserConfig,
} from 'hardhat/types';
import { getUtils } from '../utils';
import { createProvider } from 'hardhat/internal/core/providers/construction';
import { ChainwebExrenalUserConfig, ChainwebPluginApi } from '../type';

export const setChainwebExternalConfig = (
  config: HardhatConfig,
  userConfig: Readonly<HardhatUserConfig>,
) => {
  if (userConfig.chainweb.networkType !== 'external') {
    throw new Error('ChainwebType is external but networkType is not external');
  }
  if (!userConfig.networks) {
    throw new Error('ChainwebType is external but networks are empty');
  }
  const networkStem = userConfig.chainweb.networkStem ?? 'kadena_hardhat_';
  const chains = Object.keys(userConfig.networks).filter((net) =>
    net.startsWith(networkStem),
  );
  const chainsCount = chains.length;
  if (chainsCount === 0) {
    throw new Error(
      'ChainwebType is external but No networks found with networkStem',
    );
  }
  const chainIds = chains.map((chain) =>
    parseInt(chain.slice(networkStem.length)),
  );
  const chainwebConfig: Required<
    ChainwebExrenalUserConfig & { chainIds: number[] }
  > = {
    networkStem,
    chains: chainsCount,
    chainIds,
    spvProofEndpoint:
      userConfig.chainweb.spvProofEndpoint ??
      'http://localhost:1848/chainweb/0.0/evm-development',
    ...userConfig.chainweb,
  };
  config.chainweb = chainwebConfig;
};

export function externalChainsPlugin(hre: HardhatRuntimeEnvironment) {
  const utils = getUtils(hre);

  const originalSwitchNetwork = hre.switchNetwork;
  hre.switchNetwork = async (networkNameOrIndex: string | number) => {
    const networkName =
      typeof networkNameOrIndex === 'number'
        ? `${hre.config.chainweb.networkStem}${networkNameOrIndex}`
        : networkNameOrIndex;
    console.log(`Switching to network ${networkName}`);
    originalSwitchNetwork(networkName);
  };

  const api: ChainwebPluginApi = {
    deployContractOnChains: utils.deployContractOnChains,
    getProvider: (cid: number) => {
      const networkName = `${hre.config.chainweb.networkStem}${cid}`;
      return createProvider(hre.config, networkName, hre.artifacts);
    },
    requestSpvProof: utils.requestSpvProof,
    switchChain: async (cid: number | string) => {
      if (typeof cid === 'string') {
        await hre.switchNetwork(cid);
      } else {
        await hre.switchNetwork(`${hre.config.chainweb.networkStem}${cid}`);
      }
    },
    getChainIds: () => hre.config.chainweb.chainIds,
    callChainIdContract: utils.callChainIdContract,
    createTamperedProof: utils.createTamperedProof,
    computeOriginHash: utils.computeOriginHash,
    deployMocks: utils.deployMocks,
  };

  hre.chainweb = api;
}
