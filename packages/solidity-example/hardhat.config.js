require('@nomicfoundation/hardhat-toolbox');
require('hardhat-switch-network');
require('@nomicfoundation/hardhat-verify');
require('@kadena/hardhat-chainweb');

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: '0.8.28',
  chainweb: {
    hardhat: {
      chains: 2,
    },
  },
};
