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
            ...(await import('./deploy-create2-factory')),
            ...(await import('./deploy-on-chains-using-create2')),
          };
        }
        const result = cb(api)(...args);
        return result as R;
      };

  hre.chainweb.create2 = {
    getCreate2FactoryAddress: safeCall((api) => api.getCreate2FactoryAddress),
    deployCreate2Factory: safeCall((api) => api.deployCreate2Factory),
    deployOnChainsUsingCreate2: safeCall(
      (api) => api.deployOnChainsUsingCreate2,
    ),
  };
});
