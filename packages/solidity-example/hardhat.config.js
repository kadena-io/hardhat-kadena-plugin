require('@nomicfoundation/hardhat-toolbox');
require('hardhat-switch-network');
require('@nomicfoundation/hardhat-verify');
require('@kadena/hardhat-chainweb');
const { readFileSync } = require('fs');

const devnetAccounts = JSON.parse(
  readFileSync('./devnet-accounts.json', 'utf-8'),
);

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: '0.8.28',
  chainweb: {
    hardhat: {
      chains: 2,
    },
    sandbox: {
      chains: 5,
      type: 'external',
      chainIdOffset: 1789,
      chainwebChainIdOffset: 20,
      accounts: devnetAccounts.accounts.map((account) => account.privateKey),
      externalHostUrl: 'http://localhost:1848/chainweb/0.0/evm-development',
      etherscan: {
        apiKey: 'abc', // Any non-empty string works for Blockscout
        apiURLTemplate: 'http://chain-{cid}.evm.kadena.local:8000/api/',
        browserURLTemplate: 'http://chain-{cid}.evm.kadena.local:8000/',
      },
    },
  },
};
