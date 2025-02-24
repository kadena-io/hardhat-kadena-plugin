require('@nomicfoundation/hardhat-toolbox');
require('hardhat-switch-network');
require('@nomicfoundation/hardhat-verify');
require('@tovarishfin/hardhat-yul');
require('hardhat-kadena');
const path = require('path');
const fs = require('fs');

// Read and parse the accounts file
const devnetAccountsPath = path.join(__dirname, 'devnet-accounts.json');
const devnetAccountsFile = fs.readFileSync(devnetAccountsPath, 'utf8');
const devnetAccounts = JSON.parse(devnetAccountsFile);

// Validate account configuration
const requiredAccounts = 20;
if (devnetAccounts.accounts.length !== requiredAccounts) {
  throw new Error(
    `Expected ${requiredAccounts} accounts in devnet-accounts.json, found ${devnetAccounts.accounts.length}`,
  );
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [
      {
        version: '0.8.13',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: '0.8.20',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: '0.8.28',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  defaultNetwork: 'hardhat',
  networks: {
    // The internal hardhat network
    hardhat: {
      chainId: 1789,
      accounts: devnetAccounts.accounts.map((account) => {
        return {
          privateKey: account.privateKey,
          balance: '1000000000000000000000000',
        };
      }),
    },
    // uncomment the following to connect to external chainweb nodes
    // kadena_chain0: {
    //   url: 'http://localhost:8545',
    //   chainId: 1789,
    //   accounts: devnetAccounts.accounts.map((account) => account.privateKey),
    //   chainwebChainId: 0,
    // },
    // kadena_chain1: {
    //   url: 'http://localhost:8555',
    //   chainId: 1790,
    //   accounts: devnetAccounts.accounts.map((account) => account.privateKey),
    //   chainwebChainId: 1,
    // },
  },
  chainweb: {
    networkStem: 'hardhat_chain',
    networkType: 'hardhat',
    chains: 2,
  },
  // uncomment the following to enable external chainweb network
  // chainweb: {
  //   networkStem: 'kadena_chain',
  //   networkType: 'external',
  //   accounts: devnetAccounts.accounts.map((account) => {
  //     return {
  //       privateKey: account.privateKey,
  //       balance: '1000000000000000000000000',
  //     };
  //   }),
  // },
  sourcify: {
    enabled: false,
  },
  mocha: {
    timeout: 300000,
  },
};
