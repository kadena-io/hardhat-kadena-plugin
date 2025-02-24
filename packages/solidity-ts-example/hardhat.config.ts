import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import 'hardhat-kadena';

const config: HardhatUserConfig = {
  solidity: '0.8.28',
  chainweb: {
    chains: 2,
  },
};

export default config;
