import { HardhatRuntimeEnvironmentHooks } from 'hardhat/types/hooks';

export default async (): Promise<Partial<HardhatRuntimeEnvironmentHooks>> => {
  const handlers: Partial<HardhatRuntimeEnvironmentHooks> = {
    created: async (_context, hre): Promise<void> => {
      hre.chainweb = {
        getChainIds: () => [0, 1, 2, 3, 4, 5, 6, 7],
      };
    },
  };

  return handlers;
};
