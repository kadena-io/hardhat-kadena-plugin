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
    sandbox: {
      chains: 5,
      type: 'external',
      chainIdOffset: 1789,
      chainwebChainIdOffset: 20,
      accounts: devnetAccounts.accounts.map((account) => account.privateKey),
      externalHostUrl: 'http://localhost:1848/chainweb/0.0/evm-development',
      etherscan: {
        apiKey: 'abc', // Any non-empty string works for Blockscout
        apiURLTemplate: 'https://chain-{cid}.evm.kadena.internal:8000/api/',
        browserURLTemplate: 'https://chain-{cid}.evm.kadena.internal:8000/',
      },
    },
  },
};

export default config;
