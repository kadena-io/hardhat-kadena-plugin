import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import '@kadena/hardhat-chainweb';
import '@kadena/hardhat-kadena-create2';
import { config as dotenvConfig } from 'dotenv';

// Load environment variables from .env file
dotenvConfig();

const config: HardhatUserConfig = {
  solidity: '0.8.28',
  chainweb: {
    hardhat: {
      chains: 2,
      networkOptions: {
        allowUnlimitedContractSize: true,
      },
    },
    testnet: {
      type: 'external',
      chains: 5,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY ?? ''],
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

export default config;
