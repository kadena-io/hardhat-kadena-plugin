import '@nomicfoundation/hardhat-ethers';
import '@kadena/hardhat-chainweb';
import { extendEnvironment } from 'hardhat/config';
import { Create2Helpers } from './type';
export * from './type';

// const spinupChainweb = () =>
extendEnvironment((hre) => {
  let api: Create2Helpers | undefined = undefined;

  const safeCall =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <R, T extends (...args: any) => Promise<R>>(
        cb: (api: Create2Helpers) => T,
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
    deriveSecondaryKey: safeCall((api) => api.deriveSecondaryKey),
  };
});
