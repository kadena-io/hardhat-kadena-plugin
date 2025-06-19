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
      externalHostUrl:
        'http://localhost:1848/chainweb/0.0/evm-development',
      etherscan: {
        apiKey: 'abc', // Any non-empty string works for Blockscout
        apiURLTemplate:
          'http://chain-{cid}.evm.kadena.local:8000/api/',
        browserURLTemplate:
          'http://chain-{cid}.evm.kadena.local:8000/',
      },
    },
    devnet: {
      chains: 5,
      type: 'external',
      chainIdOffset: 1789,
      chainwebChainIdOffset: 20,
      accounts: devnetAccounts.accounts.map((account) => account.privateKey),
      externalHostUrl:
        'https://evm-devnet.kadena.network/chainweb/0.0/evm-development',
      etherscan: {
        apiKey: 'abc', // Any non-empty string works for Blockscout
        apiURLTemplate:
          'http://chain-{cid}.evm.kadena.network/api/',
        browserURLTemplate:
          'http://chain-{cid}.evm.kadena.network/',
      },
    },
  },
  /*
    etherscan: {
      apiKey: {
        sandbox20: "abc", // Any non-empty string works for Blockscout
        sandbox21: "abc",
        sandbox22: "abc",
        sandbox23: "abc",
        sandbox24: "abc",
        devnet20: "abc",
        devnet21: "abc",
        devnet22: "abc",
        devnet23: "abc",
        devnet24: "abc",
  
      },
      customChains: [
        {
          network: "sandbox20",
          chainId: 1789,
          urls: {
            apiURL: "http://chain-20.evm.kadena.local:8000/api/",
            browserURL: "http://chain-20.evm.kadena.local:8000/"
          }
        },
        {
          network: "sandbox21",
          chainId: 1790,
          urls: {
            apiURL: "http://chain-21.evm.kadena.local:8000/api/",
            browserURL: "http://chain-21.evm.kadena.local:8000/"
          }
        },
        {
          network: "sandbox22",
          chainId: 1791,
          urls: {
            apiURL: "http://chain-22.evm.kadena.local:8000/api/",
            browserURL: "http://chain-22.evm.kadena.local:8000/"
          }
        },
        {
          network: "sandbox23",
          chainId: 1792,
          urls: {
            apiURL: "http://chain-23.evm.kadena.local:8000/api/",
            browserURL: "http://chain-23.evm.kadena.local:8000/"
          }
        },
        {
          network: "sandbox24",
          chainId: 1793,
          urls: {
            apiURL: "http://chain-24.evm.kadena.local:8000/api/",
            browserURL: "http://chain-24.evm.kadena.local:8000/"
          }
        },
  
        {
          network: "devnet20",
          chainId: 1789,
          urls: {
            apiURL: "http://chain-20.evm.kadena.network/api/",
            browserURL: "http://chain-20.evm.kadena.network"
          }
        },
        {
          network: "devnet21",
          chainId: 1790,
          urls: {
            apiURL: "http://chain-21.evm.kadena.network/api/",
            browserURL: "http://chain-21.evm.kadena.network"
          }
        },
        {
          network: "devnet22",
          chainId: 1791,
          urls: {
            apiURL: "http://chain-22.evm.kadena.network/api/",
            browserURL: "http://chain-22.evm.kadena.network"
          }
        },
        {
          network: "devnet23",
          chainId: 1792,
          urls: {
            apiURL: "http://chain-23.evm.kadena.network/api/",
            browserURL: "http://chain-23.evm.kadena.network"
          }
        },
        {
          network: "devnet24",
          chainId: 1793,
          urls: {
            apiURL: "http://chain-24.evm.kadena.network/api/",
            browserURL: "http://chain-24.evm.kadena.network"
          }
        },
  
      ]
    }
      */
};

export default config;
