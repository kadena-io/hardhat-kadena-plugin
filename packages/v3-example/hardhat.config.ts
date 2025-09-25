import type { HardhatUserConfig } from 'hardhat/config';

import hardhatToolboxMochaEthersPlugin from '@nomicfoundation/hardhat-toolbox-mocha-ethers';
import { configVariable } from 'hardhat/config';
import myPlugin from './plugin/plugin.js';
import { readFileSync } from 'fs';

const devnetAccounts: {
  accounts: Array<{ privateKey: string; address: string }>;
} = JSON.parse(readFileSync('./devnet-account.json', 'utf-8'));

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxMochaEthersPlugin, myPlugin],
  solidity: {
    profiles: {
      default: {
        version: '0.8.28',
      },
      production: {
        version: '0.8.28',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: 'edr-simulated',
      chainType: 'l1',
    },
    hardhatOp: {
      type: 'edr-simulated',
      chainType: 'op',
    },
    sepolia: {
      type: 'http',
      chainType: 'l1',
      url: configVariable('SEPOLIA_RPC_URL'),
      accounts: [configVariable('SEPOLIA_PRIVATE_KEY')],
    },
  },
  chainweb: {
    hardhat: {
      chains: 2,
      networkOptions: {
        allowUnlimitedContractSize: true,
      },
    },
    sandbox: {
      chains: 5,
      type: 'http',
      chainIdOffset: 1789,
      chainwebChainIdOffset: 20,
      accounts: devnetAccounts.accounts.map((account) => account.privateKey),
      externalHostUrl: 'http://localhost:1848/chainweb/0.0/evm-development',
    },
  },
};

export default config;
