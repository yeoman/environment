import { createHelpers } from 'yeoman-test';
import BaseEnvironment from '../src/environment-base.ts';
import FullEnvironment from '../src/index.ts';

type EnvironmentConstructor = typeof BaseEnvironment;
type CreateEnvArg = string[] | Record<string, unknown> | undefined;

export const getCreateEnv =
  (EnvironmentCtor: EnvironmentConstructor) =>
  (arguments_: CreateEnvArg, ...others: unknown[]) =>
    Array.isArray(arguments_)
      ? new EnvironmentCtor(...(others as ConstructorParameters<EnvironmentConstructor>))
      : new (EnvironmentCtor as any)(arguments_, ...others);

export default createHelpers({
  createEnv: getCreateEnv(FullEnvironment),
});

export { result } from 'yeoman-test';
