require('@nomicfoundation/hardhat-toolbox');
require('hardhat-switch-network');
require('@nomicfoundation/hardhat-verify');
require('@kadena/hardhat-chainweb');

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: '0.8.28',
  networks: {
    chainweb_ext0: {
      url: 'http://localhost:8545/chain/0',
      chainId: 626000,
    },
    chainweb_ext1: {
      url: 'http://localhost:8545/chain/1',
      chainId: 626001,
    },
  },
  chainweb: {
    chains: 2,
    type: 'external',
    networkStem: 'chainweb_ext',
    externalHostUrl: 'http://localhost:8545',
  },
};
