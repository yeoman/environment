import { type SyncOptions, execaSync } from 'execa';

export const execaOutput = (cmg: string, arguments_: string[], options: SyncOptions) => {
  try {
    const result = execaSync(cmg, arguments_, options);
    if (!result.failed) {
      return result.stdout;
    }
  } catch {
    // ignore error
  }

  return;
};

/**
 * Two-step argument splitting function that first splits arguments in quotes,
 * and then splits up the remaining arguments if they are not part of a quote.
 */
export function splitArgsFromString(argumentsString: string | string[]): string[] {
  if (Array.isArray(argumentsString)) {
    return argumentsString;
  }

  let result: string[] = [];
  if (!argumentsString) {
    return result;
  }

  const quoteSeparatedArguments = argumentsString.split(/("[^"]*")/).filter(Boolean);
  for (const argument of quoteSeparatedArguments) {
    if (argument.includes('"')) {
      result.push(argument.replaceAll('"', ''));
    } else {
      result = result.concat(argument.trim().split(' '));
    }
  }

  return result;
}
