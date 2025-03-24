import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-verify';
import '@kadena/hardhat-chainweb';

const config: HardhatUserConfig = {
  solidity: '0.8.28',
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
  },
  chainweb: {
    hardhat: {
      chains: 2,
      logging: 'none',
    },
    mychainweb: {
      chains: 3,
    },
  },
};

export default config;
