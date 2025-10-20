import { task } from 'hardhat/config';
import { ArgumentType } from 'hardhat/types/arguments';

export default task('print-config', 'Prints the Hardhat config')
  .addOption({
    name: 'path',
    type: ArgumentType.STRING,
    description: 'the path to show',
    defaultValue: '',
  })
  .addFlag({
    name: 'keys',
    shortName: 'k',
    description: 'show only the keys',
  })
  .addFlag({
    name: 'expand',
    description: 'show all nested properties',
  })
  .setAction(() => import('./print-config-action.js'))
  .build();
