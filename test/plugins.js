'use strict';
const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const Environment = require('../lib/environment');

const tmpdir = path.join(os.tmpdir(), 'yeoman-environment/light');

describe('Generators plugin', () => {
  before(function () {
    fs.mkdirpSync(tmpdir);
    this.cwd = process.cwd();
    process.chdir(tmpdir);
    if (fs.existsSync(Environment.repository.repositoryPath)) {
      fs.removeSync(Environment.repository.repositoryPath);
    }
  });

  after(function () {
    this.timeout(20000);
    process.chdir(this.cwd);
    fs.removeSync(tmpdir);
  });

  [undefined, '4.7.2', 'super:app'].forEach(extended => {
    describe('#run', () => {
      beforeEach(function () {
        this.timeout(300000);
        delete this.execValue;

        this.env = new Environment([], {'skip-install': true, experimental: true});

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
        // Pre load the required generator
        this.env.requireGenerator(extended);
      });

      it(`runs generators plugin with requireGenerator value ${extended}`, function () {
        this.timeout(100000);
        const self = this;
        return this.env.run('dummy:app').then(() => {
          assert.equal(self.execValue, 'done');
        });
      });
    });
  });
});
