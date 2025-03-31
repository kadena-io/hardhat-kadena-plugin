import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-verify';
import '@kadena/hardhat-chainweb';

const config: HardhatUserConfig = {
  solidity: '0.8.28',
  chainweb: {
    hardhat: {
      chains: 2,
      networkOptions: {
        allowUnlimitedContractSize: true,
        forking: {
          url: 'https://eth.drpc.org',
          blockNumber: 22166219
        },
       
      },
    },
    mychainweb: {
      chains: 3,
    },
  },

};

export default config;
