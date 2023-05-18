import { execaSync, type SyncOptions } from 'execa';

export const execaOutput = (cmg: string, args: string[], options: SyncOptions) => {
  try {
    const result = execaSync(cmg, args, options);
    if (!result.failed) {
      return result.stdout;
    }
  } catch {}

  return undefined;
};

/**
 * Two-step argument splitting function that first splits arguments in quotes,
 * and then splits up the remaining arguments if they are not part of a quote.
 */
export function splitArgsFromString(argsString: string | string[]): string[] {
  if (Array.isArray(argsString)) {
    return argsString;
  }

  let result: string[] = [];
  if (!argsString) {
    return result;
  }

  const quoteSeparatedArgs = argsString.split(/("[^"]*")/).filter(Boolean);
  for (const arg of quoteSeparatedArgs) {
    if (arg.includes('"')) {
      result.push(arg.replace(/"/g, ''));
    } else {
      result = result.concat(arg.trim().split(' '));
    }
  }

  return result;
}
