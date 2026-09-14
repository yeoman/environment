import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { mkdirSync, rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, esmocha, expect, it } from 'esmocha';

// Installing yeoman-generator through fly-import/arborist takes several seconds even when it is already cached,
// so resolve it from the bundled latest release instead.
const flyImport = esmocha.fn(async (_specifier: string) => import('@yeoman-environment/generator-tests/generator-latest'));
await esmocha.mock('fly-import', { ...(await import('fly-import')), flyImport });
const { default: Environment } = await import('../src/index.ts');

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
    flyImport.mockClear();
  });

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
      });

      it(`runs generators plugin with requireGenerator value ${extended}`, async () => {
        await env.run('dummy:app');
        expect(execValue).toEqual('done');
        expect(flyImport).toHaveBeenCalledWith('yeoman-generator');
      });
    });
  }
});
