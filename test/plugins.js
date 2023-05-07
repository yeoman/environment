import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import fs from 'fs-extra';
import Environment from '../src/index.js';
import YeomanRepository from '../src/util/repository.js';

const tmpdir = path.join(os.tmpdir(), 'yeoman-environment/light');

describe('Generators plugin', () => {
  let repository;

  beforeEach(function () {
    fs.mkdirpSync(tmpdir);
    this.cwd = process.cwd();
    process.chdir(tmpdir);
    repository = new YeomanRepository();
    if (fs.existsSync(repository.repositoryPath)) {
      fs.removeSync(repository.repositoryPath);
    }
  });

  afterEach(function () {
    this.timeout(40_000);
    process.chdir(this.cwd);
    fs.removeSync(tmpdir);
  });

  for (const extended of [undefined, 'super:app']) {
    describe(`#run ${extended}`, () => {
      beforeEach(async function () {
        this.timeout(300_000);
        delete this.execValue;

        this.env = new Environment({ skipInstall: true, experimental: true });

        const self = this;
        const superGenerator = {
          async createGenerator(env) {
            const Generator = await env.requireGenerator(undefined);
            return class extends Generator {
              exec() {}
            };
          },
        };
        this.env.registerStub(superGenerator, 'super:app');

        const dummy = {
          async createGenerator(env) {
            return class extends (await env.requireGenerator(extended)) {
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
