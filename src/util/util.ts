import { execaSync, type SyncOptions } from 'execa';

const execaOutput = (cmg: string, args: string[], options: SyncOptions) => {
  try {
    const result = execaSync(cmg, args, options);
    if (!result.failed) {
      return result.stdout;
    }
  } catch {}

  return undefined;
};

export { execaOutput };
