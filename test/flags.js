'use strict';
const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const Environment = require('../lib/environment');

const tmpdir = path.join(os.tmpdir(), 'yeoman-environment/auto-install');

describe('Namespace flags', () => {
  before(function () {
    fs.mkdirpSync(tmpdir);
    this.cwd = process.cwd();
    process.chdir(tmpdir);
    if (fs.existsSync(Environment.repository.repositoryPath)) {
      fs.removeSync(Environment.repository.repositoryPath);
    }
  });

  after(function () {
    process.chdir(this.cwd);
    fs.removeSync(tmpdir);
  });

  beforeEach(function () {
    this.env = new Environment([], {'skip-install': true, experimental: true});
  });

  afterEach(function () {
    this.env.removeAllListeners();
  });

  it('throws if experimental is not true', () => {
    const env = new Environment([], {'skip-install': true});
    assert.equal(env.getByNamespace, undefined);
  });

  it('auto-install a module', function () {
    this.timeout(60000);

    try {
      this.env.get('dummy!?');
      assert.fail();
    } catch (_) {
    }
    assert.ok(this.env.get('dummy!'));
    assert.ok(this.env.get('dummy:app'));
  });

  it('auto-load a module', function () {
    this.timeout(10000);
    assert.ok(this.env.get('dummy:yo!?'));
  });
});
