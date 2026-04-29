/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { createHelpers } from 'yeoman-test';
import Environment from '../src/index.ts';

type EnvironmentConstructor = typeof Environment;
type CreateEnvArg = string[] | Record<string, unknown> | undefined;

export const getCreateEnv =
  (EnvironmentCtor: EnvironmentConstructor) =>
  (arguments_: CreateEnvArg, ...others: unknown[]) =>
    Array.isArray(arguments_)
      ? new EnvironmentCtor(...(others as ConstructorParameters<EnvironmentConstructor>))
      : new EnvironmentCtor(arguments_, ...(others as ConstructorParameters<EnvironmentConstructor>));

export default createHelpers({
  createEnv: getCreateEnv(Environment),
});

export { result } from 'yeoman-test';
