require('@nomicfoundation/hardhat-toolbox');
require('hardhat-switch-network');
require('@nomicfoundation/hardhat-verify');
require('@kadena/hardhat-chainweb');
require('dotenv').config();
const { readFileSync } = require('fs');

const devnetAccounts = JSON.parse(
  readFileSync('./devnet-accounts.json', 'utf-8'),
);

console.log(
  'DEPLOYER_PRIVATE_KEY in hardhat config file',
  process.env.DEPLOYER_PRIVATE_KEY,
);
/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: '0.8.28',
  chainweb: {
    hardhat: {
      chains: 2,
    },
    testnet: {
      type: 'external',
      chains: 5,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY],
      chainIdOffset: 5920,
      chainwebChainIdOffset: 20,
      externalHostUrl:
        'https://evm-testnet.chainweb.com/chainweb/0.0/evm-testnet',
      etherscan: {
        apiKey: 'abc', // Any non-empty string works for Blockscout
        apiURLTemplate:
          'https://chain-{cid}.evm-testnet-blockscout.chainweb.com/api/',
        browserURLTemplate:
          'https://chain-{cid}.evm-testnet-blockscout.chainweb.com',
      },
    },
  },
};
