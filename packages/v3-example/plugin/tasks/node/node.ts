import { overrideTask } from 'hardhat/config';
import { ArgumentType } from 'hardhat/types/arguments';

export default overrideTask('node')
  .addOption({
    name: 'chainweb',
    type: ArgumentType.STRING,
    description:
      'The name of the chainweb to use; this should be defined in the config file',
    defaultValue: 'hardhat',
  })
  .setAction(() => import('./node-action.js'))
  .build();
