import '@nomicfoundation/hardhat-ethers';
import 'hardhat-switch-network';
import './type';
import './plugin';
export { Origin } from './utils/chainweb';
export { DeployedContractsOnChains } from './utils';

const test = "test-ci"