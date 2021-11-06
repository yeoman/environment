const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const Environment = require('../lib/environment');
const YeomanRepository = require('../lib/util/repository');

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

        this.env = new Environment({skipInstall: true, experimental: true});

        const self = this;
        const superGenerator = {createGenerator(env) {
          return class extends env.requireGenerator(undefined) {
            exec() {}
          };
        }};
        this.env.registerStub(superGenerator, 'super:app');

        const dummy = {createGenerator(env) {
          return class extends env.requireGenerator(extended) {
            exec() {
              self.execValue = 'done';
            }
          };
        }};
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
