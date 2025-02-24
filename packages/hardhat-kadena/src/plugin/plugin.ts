import { extendEnvironment, extendConfig } from 'hardhat/config';
import { inProcessPlugin, setChainwebInProcessConfig } from './in-process.js';
import { externalChainsPlugin, setChainwebExternalConfig } from './external.js';

extendConfig((config, userConfig) => {
  if (!userConfig.chainweb) {
    throw new Error(
      'hardhat_kadena plugins is imported but chainweb configuration is not presented in hardhat.config.js',
    );
  }

  const networkType = userConfig.chainweb.networkType;

  switch (userConfig.chainweb.networkType) {
    case undefined:
    case 'hardhat':
      setChainwebInProcessConfig(config, userConfig);
      break;
    case 'external':
      setChainwebExternalConfig(config, userConfig);
      break;
    default:
      throw new Error(
        `${networkType} is not a valid type. you can only set ("hardhat" | "external")`,
      );
  }

  config.defaultNetwork =
    userConfig.defaultNetwork ?? `${config.chainweb.networkStem}0`;
});

extendEnvironment((hre) => {
  const networkType = hre.config.chainweb.networkType;
  switch (hre.config.chainweb.networkType) {
    case 'hardhat':
      return inProcessPlugin(hre);
    case 'external':
      return externalChainsPlugin(hre);
    default:
      throw new Error(
        `${networkType} is not a valid type. you can only set ("hardhat" | "external")`,
      );
  }
});
