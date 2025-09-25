import { NewTaskActionFunction } from 'hardhat/types/tasks';

interface CleanActionArguments {
  path: string;
  keys: boolean;
  expand?: boolean;
}

const printConfigAction: NewTaskActionFunction<CleanActionArguments> = async (
  { path, keys, expand },
  { config },
) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cfg = config as Record<string, any>;
  if (path) {
    cfg = path.split('.').reduce(
      (obj, key) => (obj && obj[key] !== 'undefined' ? obj[key] : undefined),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config as Record<string, any>,
    );
  }
  if (keys) {
    console.log('Keys:');
    console.log(
      Object.keys(cfg)
        .map((k) => `- ${k}`)
        .join('\n'),
    );
    return;
  }
  console.log('Configuration');
  console.dir(cfg, { depth: expand ? Infinity : 1 });
};

export default printConfigAction;
