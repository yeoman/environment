import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { mkdirSync, rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, it } from 'esmocha';
import Environment from '../src/index.ts';

const tmpdir = path.join(os.tmpdir(), 'yeoman-environment/light');

type PluginEnvironment = InstanceType<typeof Environment>;

type EnvironmentFactory = {
  requireGenerator: (extended?: string) => Promise<abstract new (...arguments_: unknown[]) => object>;
};

describe('Generators plugin', () => {
  let cwd: string;

  beforeEach(() => {
    mkdirSync(tmpdir, { recursive: true });
    cwd = process.cwd();
    process.chdir(tmpdir);
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(tmpdir, { recursive: true });
  }).timeout(40_000);

  for (const extended of [undefined, 'super:app']) {
    describe(`#run ${extended}`, () => {
      let execValue: string | undefined;
      let env: PluginEnvironment;

      beforeEach(async () => {
        execValue = undefined;

        env = new Environment({ skipInstall: true, experimental: true });

        const superGenerator = {
          async createGenerator(environment: EnvironmentFactory) {
            const Generator = await environment.requireGenerator();
            return class extends Generator {
              exec() {}
            };
          },
        };
        env.register(superGenerator, { namespace: 'super:app' });

        const dummy = {
          async createGenerator(environment: EnvironmentFactory) {
            return class extends (await environment.requireGenerator(extended)) {
              exec() {
                execValue = 'done';
              }
            };
          },
        };
        env.register(dummy, { namespace: 'dummy:app' });
      }).timeout(300_000);

      it(`runs generators plugin with requireGenerator value ${extended}`, () => {
        return env.run('dummy:app').then(() => {
          assert.equal(execValue, 'done');
        });
      }).timeout(100_000);
    });
  }
});
