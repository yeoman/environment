'use strict';
var fs = require('fs');
var path = require('path');
var assert = require('assert');
var shell = require('shelljs');
var pathExists = require('path-exists');
var Environment = require('../lib/environment');

var globalLookupTest = process.env.NODE_PATH ? it : xit;

describe('Environment Resolver', function () {
  this.timeout(100000);

  describe('#lookup()', function () {
    var scopedFolder = path.resolve('./node_modules/@dummyscope');
    var scopedGenerator = path.join(scopedFolder, 'generator-scoped');

    before(function () {
      this.projectRoot = path.join(__dirname, 'fixtures/lookup-project');
      process.chdir(this.projectRoot);
      shell.exec('npm install', { silent: true });
      shell.exec('npm install generator-jquery', { silent: true });
      shell.exec('npm install -g generator-dummytest generator-dummy', { silent: true });

      fs.symlinkSync(
        path.resolve('../custom-generator-extend'),
        path.resolve('./node_modules/generator-extend'),
        'dir'
      );

      if (!pathExists.sync(scopedFolder)) {
        fs.mkdirSync(scopedFolder);
      }

      if (!pathExists.sync(scopedGenerator)) {
        fs.symlinkSync(
          path.resolve('../custom-generator-scoped'),
          scopedGenerator,
          'dir'
        );
      }
    });

    after(function () {
      fs.unlinkSync(path.join(this.projectRoot, './node_modules/generator-extend'));
      fs.unlinkSync(scopedGenerator);
      fs.rmdirSync(scopedFolder);
      process.chdir(__dirname);
    });

    beforeEach(function (done) {
      this.env = new Environment();
      assert.equal(this.env.namespaces().length, 0, 'ensure env is empty');
      this.env.lookup(done);
    });

    it('register local generators', function () {
      assert.ok(this.env.get('dummy:app'));
      assert.ok(this.env.get('dummy:yo'));
    });

    it('register generators in scoped packages', function () {
      assert.ok(this.env.get('@dummyscope/scoped:app'));
    });

    it('register non-dependency local generator', function () {
      assert.ok(this.env.get('jquery:app'));
    });

    if (!process.env.NODE_PATH) {
      console.log('Skipping tests for global generators. Please setup `NODE_PATH` ' +
        'environment variable to run it.');
    }

    it('local generators prioritized over global', function () {
      assert.ok(this.env.get('dummy:app').resolved.indexOf('lookup-project') !== -1);
    });

    globalLookupTest('register global generators', function () {
      assert.ok(this.env.get('dummytest:app'));
      assert.ok(this.env.get('dummytest:controller'));
    });

    it('register symlinked generators', function () {
      assert.ok(this.env.get('extend:support:scaffold'));
    });

    describe('when there\'s ancestor node_modules/ folder', function () {
      before(function () {
        this.projectSubRoot = path.join(this.projectRoot, 'subdir');
        process.chdir(this.projectSubRoot);
        shell.exec('npm install', { silent: true });
      });

      beforeEach(function () {
        this.env = new Environment();
        assert.equal(this.env.namespaces().length, 0, 'ensure env is empty');
        this.env.lookup();
      });

      it('register generators in ancestor node_modules directory', function () {
        assert.ok(this.env.get('jquery:app'));
      });

      it('local generators are prioritized over ancestor', function () {
        assert.ok(this.env.get('dummy:app').resolved.indexOf('subdir') !== -1);
      });
    });
  });

  describe('#getNpmPaths()', function () {
    beforeEach(function () {
      this.NODE_PATH = process.env.NODE_PATH;
      this.bestBet = path.join(__dirname, '../../../..');
      this.bestBet2 = path.join(path.dirname(process.argv[1]), '../..');
      this.env = new Environment();
    });

    afterEach(function () {
      process.env.NODE_PATH = this.NODE_PATH;
    });

    describe('with NODE_PATH', function () {
      beforeEach(function () {
        process.env.NODE_PATH = '/some/dummy/path';
      });

      it('walk up the CWD lookups dir', function () {
        var paths = this.env.getNpmPaths();
        assert.equal(paths[0], path.join(process.cwd(), 'node_modules'));
        var prevdir = process.cwd().split(path.sep).slice(0, -1).join(path.sep);
        assert.equal(paths[1], path.join(prevdir, 'node_modules'));
      });

      it('append NODE_PATH', function () {
        assert(this.env.getNpmPaths().indexOf(process.env.NODE_PATH) >= 0);
      });
    });

    describe('without NODE_PATH', function () {
      beforeEach(function () {
        delete process.env.NODE_PATH;
      });

      it('walk up the CWD lookups dir', function () {
        var paths = this.env.getNpmPaths();
        assert.equal(paths[3], path.join(process.cwd(), 'node_modules'));
        var prevdir = process.cwd().split(path.sep).slice(0, -1).join(path.sep);
        assert.equal(paths[4], path.join(prevdir, 'node_modules'));
      });

      it('append best bet if NODE_PATH is unset', function () {
        assert(this.env.getNpmPaths().indexOf(this.bestBet) >= 0);
        assert(this.env.getNpmPaths().indexOf(this.bestBet2) >= 0);
      });

      it('append default NPM dir depending on your OS', function () {
        if (process.platform === 'win32') {
          assert(this.env.getNpmPaths().indexOf(path.join(process.env.APPDATA, 'npm/node_modules')) >= 0);
        } else {
          assert(this.env.getNpmPaths().indexOf('/usr/lib/node_modules') >= 0);
        }
      });
    });
  });
});
