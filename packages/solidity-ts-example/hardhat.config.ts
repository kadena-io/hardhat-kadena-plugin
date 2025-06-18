import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import '@kadena/hardhat-chainweb';
import '@kadena/hardhat-kadena-create2';
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
      },
    },
    devnet: {
      chains: 5,
      type: 'external',
      chainIdOffset: 5920,
      chainwebChainIdOffset: 20,
      accounts: devnetAccounts.accounts.map((account) => account.privateKey),
      externalHostUrl:
        'https://evm-testnet.chainweb.com/chainweb/0.0/evm-testnet',
      etherscan: {
        apiKey: 'abc', // Any non-empty string works for Blockscout
        apiURLTemplate:
          'http://chain-{cid}.evm-testnet-blockscout.chainweb.com/api/',
        browserURLTemplate:
          'http://chain-{cid}.evm-testnet-blockscout.chainweb.com/',
      },
    },
  },
};

export default config;
