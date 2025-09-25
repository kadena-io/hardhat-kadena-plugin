import { TaskOverrideActionFunction } from 'hardhat/types/tasks';

interface CleanActionArguments {
  chainweb: string;
}

const nodeAction: TaskOverrideActionFunction<CleanActionArguments> = async (
  taskArgs,
  hre,
  runSuper,
) => {
  console.log('Node action called with args:', taskArgs);
  runSuper(taskArgs);
  // const hasNetwork = process.argv.includes('--network');
  // if (taskArgs.chainweb && hasNetwork) {
  //   console.error('You can only specify one of chainweb or network, not both');
  //   return;
  // }
  // if (hasNetwork) {
  //   return runSuper(taskArgs);
  // }

  // hre.config.defaultChainweb =
  //   taskArgs.chainweb ?? hre.config.defaultChainweb ?? 'hardhat';

  // const config = hre.config.chainweb[hre.config.defaultChainweb];
  // if (!config) {
  //   console.log(
  //     `Chainweb configuration ${hre.config.defaultChainweb} not found`,
  //   );
  //   return;
  // }
  // if (config.type === 'external') {
  //   console.error('You can only start a node for in-process chainweb');
  //   return;
  // }

  // let options: undefined | { forking: { url: string; blockNumber?: number } } =
  //   undefined;

  // if (taskArgs.fork) {
  //   options = {
  //     forking: {
  //       url: taskArgs.fork,
  //       blockNumber: taskArgs.forkBlockNumber,
  //     },
  //   };
  // }

  // await hre.chainweb.initialize(options);

  // return runRPCNode(taskArgs, hre);
};

export default nodeAction;
