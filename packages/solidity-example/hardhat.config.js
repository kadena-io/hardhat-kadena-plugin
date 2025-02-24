require("@nomicfoundation/hardhat-toolbox");
require("hardhat-switch-network");
require("@nomicfoundation/hardhat-verify");
require("@tovarishfin/hardhat-yul");
require("hardhat-kadena");
const path = require("path");
const fs = require("fs");

// Read and parse the accounts file
const devnetAccountsPath = path.join(__dirname, "devnet-accounts.json");
const devnetAccountsFile = fs.readFileSync(devnetAccountsPath, "utf8");
const devnetAccounts = JSON.parse(devnetAccountsFile);

// Validate account configuration
const requiredAccounts = 20;
if (devnetAccounts.accounts.length !== requiredAccounts) {
  throw new Error(
    `Expected ${requiredAccounts} accounts in devnet-accounts.json, found ${devnetAccounts.accounts.length}`
  );
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.13",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  defaultNetwork: "hardhat",
  networks: {
    // The internal hardhat network
    hardhat: {
      chainId: 1789,
      accounts: devnetAccounts.accounts.map((account) => {
        return {
          privateKey: account.privateKey,
          balance: "1000000000000000000000000",
        };
      }),
    },
    // For running an external hardhat node using `npx hardhat node`
    localhost: {
      url: "http://localhost:8545",
      chainId: 1789,
    },
  },
  chainweb: {
    chains: 2,
    logging: "info",
  },
  sourcify: {
    enabled: false,
  },
  mocha: {
    timeout: 300000,
  },
};
