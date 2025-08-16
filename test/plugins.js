import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { mkdirSync, rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, it } from 'esmocha';
import Environment from '../src/index.ts';

const tmpdir = path.join(os.tmpdir(), 'yeoman-environment/light');

describe('Generators plugin', () => {
  beforeEach(function () {
    mkdirSync(tmpdir, { recursive: true });
    this.cwd = process.cwd();
    process.chdir(tmpdir);
  });

  afterEach(function () {
    this.timeout(40_000);
    process.chdir(this.cwd);
    rmSync(tmpdir, { recursive: true });
  });

  for (const extended of [undefined, 'super:app']) {
    describe(`#run ${extended}`, () => {
      beforeEach(async function () {
        this.timeout(300_000);
        delete this.execValue;

        this.env = new Environment({ skipInstall: true, experimental: true });

        const self = this;
        const superGenerator = {
          async createGenerator(environment) {
            const Generator = await environment.requireGenerator();
            return class extends Generator {
              exec() {}
            };
          },
        };
        this.env.registerStub(superGenerator, 'super:app');

        const dummy = {
          async createGenerator(environment) {
            return class extends (await environment.requireGenerator(extended)) {
              exec() {
                self.execValue = 'done';
              }
            };
          },
        };
        this.env.registerStub(dummy, 'dummy:app');
      });

      it(`runs generators plugin with requireGenerator value ${extended}`, function () {
        this.timeout(100_000);
        const self = this;
        return this.env.run('dummy:app').then(() => {
          assert.equal(self.execValue, 'done');
        });
      });
    });
  }
});
