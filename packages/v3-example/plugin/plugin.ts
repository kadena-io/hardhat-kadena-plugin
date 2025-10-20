import nodeTask from './tasks/node/node.js';
import { HardhatPlugin } from 'hardhat/types/plugins';
import printConfigTask from './tasks/print-config/print-config.js';

export * from './type.js';

const myPlugin: HardhatPlugin = {
  id: 'hardhat-chainweb-v3',
  hookHandlers: {
    hre: () => import('./chainweb-hre.js'),
    config: () => import('./chainweb-config/chainweb-config.js'),
  },
  tasks: [printConfigTask, nodeTask],
};

export default myPlugin;
