import { HardhatRuntimeEnvironment } from 'hardhat/types/hre';
import './type.js';
import { HardhatRuntimeEnvironmentHooks } from 'hardhat/types/hooks';

export default async (): Promise<Partial<HardhatRuntimeEnvironmentHooks>> => {
  const handlers: Partial<HardhatRuntimeEnvironmentHooks> = {
    created: async (
      _context,
      hre: HardhatRuntimeEnvironment,
    ): Promise<void> => {
      hre.chainweb = {
        getCwChainIds: () => {
          const chainweb = hre.config.defaultChainweb ?? 'hardhat';
          const config = hre.config.chainweb[chainweb];
          if (!config) {
            throw new Error(`Chainweb configuration ${chainweb} not found`);
          }
          const ids = [];
          for (let i = 0; i < config.chains; i++) {
            ids.push(config.chainwebChainIdOffset + i);
          }
          return ids;
        },
        connect: async (options: { cwId: number }) => {
          if (options.cwId === undefined) {
            throw new Error('cwId is required to connect to a chainweb chain');
          }
          const chainweb = hre.config.defaultChainweb ?? 'hardhat';
          const config = hre.config.chainweb[chainweb];
          if (!config) {
            throw new Error(`Chainweb configuration ${chainweb} not found`);
          }
          const cid = options.cwId;
          if (cid < config.chainwebChainIdOffset) {
            throw new Error(
              `Invalid chainId ${cid}, must be >= ${config.chainwebChainIdOffset}`,
            );
          }
          if (cid >= config.chainwebChainIdOffset + config.chains) {
            throw new Error(
              `Invalid chainId ${cid}, must be < ${
                config.chainwebChainIdOffset + config.chains
              }`,
            );
          }
          if (!hre.config.networks[`chainweb_${chainweb}${cid}`]) {
            throw new Error(
              `Network configuration chainweb_${chainweb}${cid} not found`,
            );
          }
          return hre.network.connect(`chainweb_${chainweb}${cid}`);
        },
      };
    },
  };

  return handlers;
};
