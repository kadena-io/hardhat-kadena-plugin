import '@nomicfoundation/hardhat-ethers';
import '@kadena/hardhat-chainweb';
import {
  extendConfig,
  extendEnvironment,
  HardhatUserConfig,
} from 'hardhat/config';
import { Create2Helpers } from './type';
import { ethers, getBytes } from 'ethers';
export * from './type';

const getSalt = (id: string) => getBytes(ethers.id(id));

extendConfig((config, userConfig) => {
  config.create2proxy = {
    version: userConfig.create2proxy?.version ?? 1,
    deployerAddress: userConfig.create2proxy?.deployerAddress ?? '',
    defaultSalt: getSalt(
      userConfig.create2proxy?.defaultSalt ?? 'KADENA/CREATE2/SALT',
    ),
  };
});

// const spinupChainweb = () =>
extendEnvironment((hre) => {
  let api: Omit<Create2Helpers, 'changeConfig'> | undefined = undefined;

  const safeCall =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <R, T extends (...args: any) => Promise<R>>(
        cb: (api: Omit<Create2Helpers, 'changeConfig'>) => T,
      ) =>
      async (...args: Parameters<T>) => {
        if (api === undefined) {
          api = {
            ...(await import('./deployCreate2Factory')),
            ...(await import('./deployContracts')),
          };
        }
        const result = cb(api)(...args);
        return result as R;
      };

  hre.chainweb.create2 = {
    getCreate2FactoryAddress: safeCall((api) => api.getCreate2FactoryAddress),
    deployCreate2Factory: safeCall((api) => api.deployCreate2Factory),
    deployUsingCreate2: safeCall((api) => api.deployUsingCreate2),
    predictContractAddress: safeCall((api) => api.predictContractAddress),
    changeConfig: (userConfig: HardhatUserConfig['create2proxy']) => {
      hre.config.create2proxy = {
        version: userConfig?.version ?? hre.config.create2proxy.version,
        deployerAddress:
          userConfig?.deployerAddress ??
          hre.config.create2proxy.deployerAddress,
        defaultSalt: userConfig?.defaultSalt
          ? getSalt(userConfig?.defaultSalt)
          : hre.config.create2proxy.defaultSalt,
      };
    },
  };
});
