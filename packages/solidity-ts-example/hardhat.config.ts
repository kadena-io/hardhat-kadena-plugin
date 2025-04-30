import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-verify';
import '@kadena/hardhat-chainweb';
import { readFileSync } from 'fs';

const devnetAccounts: {
  accounts: Array<{ privateKey: string; address: string }>;
} = JSON.parse(readFileSync('./devnet-account.json', 'utf-8'));

const config: HardhatUserConfig = {
  solidity: '0.8.28',
  chainweb: {
    hardhat: {
      chains: 2,
      networkOptions: {
        allowUnlimitedContractSize: true,
        // forking: {
        //   url: 'https://eth.drpc.org',
        // },
      },
    },
    devnet: {
      chains: 2,
      type: 'external',
      chainIdOffset: 1789,
      accounts: devnetAccounts.accounts.map((account) => account.privateKey),
      externalHostUrl:
        'https://evm-devnet.kadena.network/chainweb/0.0/evm-development',
    },
  },
};

export default config;
