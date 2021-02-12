'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const sinon = require('sinon');
const {TestAdapter} = require('yeoman-test/lib/adapter');
const Conflicter = require('../lib/util/conflicter');

const createActions = actions => {
  return {
    _action: actions,
    get action() {
      return this._action.shift();
    }
  };
};

describe('Conflicter', () => {
  beforeEach(function () {
    this.conflicter = new Conflicter(new TestAdapter());
  });

  describe('#checkForCollision()', () => {
    beforeEach(function () {
      this.conflictingFile = {path: __filename, contents: ''};
    });

    it('handles predefined status', function () {
      const contents = fs.readFileSync(__filename, 'utf8');
      return this.conflicter.checkForCollision(
        {path: __filename, contents, conflicter: 'someStatus'}
      ).then(file => {
        assert.equal(file.conflicter, 'someStatus');
      });
    });

    it('identical status', function () {
      const me = fs.readFileSync(__filename, 'utf8');

      return this.conflicter.checkForCollision(
        {
          path: __filename,
          contents: me
        }
      ).then(
        file => {
          assert.equal(file.conflicter, 'identical');
        }
      );
    });

    it('create status', function () {
      return this.conflicter.checkForCollision(
        {
          path: 'file-who-does-not-exist.js',
          contents: ''
        }
      ).then(
        file => {
          assert.equal(file.conflicter, 'create');
        }
      );
    });

    it('user choose "yes"', function () {
      const conflicter = new Conflicter(new TestAdapter({action: 'write'}));

      return conflicter.checkForCollision(this.conflictingFile).then(file => {
        assert.equal(file.conflicter, 'force');
      });
    });

    it('user choose "skip"', function () {
      const conflicter = new Conflicter(new TestAdapter({action: 'skip'}));

      return conflicter.checkForCollision(this.conflictingFile).then(file => {
        assert.equal(file.conflicter, 'skip');
      });
    });

    it('user choose "force"', function () {
      const conflicter = new Conflicter(new TestAdapter({action: 'force'}));

      return conflicter.checkForCollision(this.conflictingFile).then(file => {
        assert.equal(file.conflicter, 'force');
      });
    });

    it('force conflict status', function () {
      this.conflicter.force = true;
      return this.conflicter.checkForCollision(this.conflictingFile).then(file => {
        assert.equal(file.conflicter, 'force');
      });
    });

    it('abort on first conflict', function () {
      this.timeout(4000);
      const conflicter = new Conflicter(new TestAdapter(), false, true);
      return conflicter.checkForCollision(this.conflictingFile).then(
        () => assert.fail('was not supposed to succeed')
      ).catch(error => {
        assert.equal(error.message, 'Process aborted by conflict');
      });
    });

    it('abort on first conflict with whitespace changes', () => {
      const conflicter = new Conflicter(new TestAdapter(), false, {
        bail: true
      });
      return conflicter.checkForCollision(
        {
          path: path.join(__dirname, 'fixtures/conflicter/file-conflict.txt'),
          contents: `initial
                 content
      `
        }
      ).then(
        file => {
          assert.equal(file.conflicter, 'skip');
        }
      );
    });

    it('abort on create new file', () => {
      const conflicter = new Conflicter(new TestAdapter(), false, {
        bail: true
      });
      return conflicter.checkForCollision({
        path: 'file-who-does-not-exist2.js',
        contents: ''
      }).then(
        () => assert.fail('was not supposed to succeed')
      ).catch(error => {
        assert.equal(error.message, 'Process aborted by conflict');
      });
    });

    it('skip file changes with dryRun', () => {
      const conflicter = new Conflicter(new TestAdapter(), false, {
        dryRun: true
      });
      return conflicter.checkForCollision(
        {
          path: path.join(__dirname, 'fixtures/conflicter/file-conflict.txt'),
          contents: `initial
                 content
      `
        }
      ).then(
        file => {
          assert.equal(file.conflicter, 'skip');
        }
      );
    });

    it('skip new file with dryRun', () => {
      const conflicter = new Conflicter(new TestAdapter(), false, {
        dryRun: true
      });
      return conflicter.checkForCollision(
        {
          path: 'file-who-does-not-exist2.js',
          contents: ''
        }
      ).then(
        file => {
          assert.equal(file.conflicter, 'skip');
        }
      );
    });

    it('skip deleted file with dryRun', () => {
      const conflicter = new Conflicter(new TestAdapter(), false, {
        dryRun: true
      });
      return conflicter.checkForCollision(
        {
          path: path.join(__dirname, 'fixtures/conflicter/foo.js'),
          contents: null
        }
      ).then(
        file => {
          assert.equal(file.conflicter, 'skip');
        }
      );
    });

    it('skip whitespace changes with dryRun', () => {
      const conflicter = new Conflicter(new TestAdapter(), false, {
        dryRun: true,
        ignoreWhitespace: true
      });
      return conflicter.checkForCollision(
        {
          path: path.join(__dirname, 'fixtures/conflicter/file-conflict.txt'),
          contents: `initial
                 content
      `
        }
      ).then(
        file => {
          assert.equal(file.conflicter, 'skip');
        }
      );
    });

    it('does not give a conflict with ignoreWhitespace', () => {
      const conflicter = new Conflicter(new TestAdapter(), false, {
        ignoreWhitespace: true
      });

      return conflicter.checkForCollision(
        {
          path: path.join(__dirname, 'fixtures/conflicter/file-conflict.txt'),
          contents: `initial
           content
`
        }
      ).then(
        file => {
          assert.equal(file.conflicter, 'identical');
        }
      );
    });

    it('skip rewrite with ignoreWhitespace and skipRegenerate', () => {
      const conflicter = new Conflicter(new TestAdapter(), false, {
        ignoreWhitespace: true,
        skipRegenerate: true
      });

      return conflicter.checkForCollision(
        {
          path: path.join(__dirname, 'fixtures/conflicter/file-conflict.txt'),
          contents: `initial
           content
`
        }
      ).then(
        file => {
          assert.equal(file.conflicter, 'skip');
        }
      );
    });

    it('does give a conflict without ignoreWhitespace', () => {
      const conflicter = new Conflicter(new TestAdapter({action: 'skip'}));

      return conflicter.checkForCollision(
        {
          path: path.join(__dirname, 'fixtures/conflicter/file-conflict.txt'),
          contents: `initial
           content
`
        }
      ).then(
        file => {
          assert.equal(file.conflicter, 'skip');
        }
      );
    });

    it('does not give a conflict on same binary files', function () {
      return this.conflicter.checkForCollision(
        {
          path: path.join(__dirname, 'fixtures/conflicter/yeoman-logo.png'),
          contents: fs.readFileSync(
            path.join(__dirname, 'fixtures/conflicter/yeoman-logo.png')
          )
        }
      ).then(
        file => {
          assert.equal(file.conflicter, 'identical');
        }
      );
    });

    it('does not provide a diff option for directory', () => {
      const conflicter = new Conflicter(new TestAdapter({action: 'write'}));
      const spy = sinon.spy(conflicter.adapter, 'prompt');
      return conflicter.checkForCollision(
        {
          path: __dirname,
          contents: null
        }
      ).then(
        () => {
          assert.equal(
            _.filter(spy.firstCall.args[0][0].choices, {value: 'diff'}).length,
            0
          );
        }
      );
    });

    it('displays default diff for text files', () => {
      const testAdapter = new TestAdapter(createActions(['diff', 'write']));
      const conflicter = new Conflicter(testAdapter);

      return conflicter.checkForCollision(
        {
          path: path.join(__dirname, 'fixtures/conflicter/foo.js'),
          contents: fs.readFileSync(
            path.join(__dirname, 'fixtures/conflicter/foo-template.js')
          )
        }
      ).then(
        () => {
          sinon.assert.neverCalledWithMatch(
            testAdapter.log.writeln,
            /Existing.*Replacement.*Diff/
          );
          sinon.assert.called(testAdapter.diff);
        }
      );
    });

    it('shows old content for deleted text files', () => {
      const testAdapter = new TestAdapter(createActions(['diff', 'write']));
      const conflicter = new Conflicter(testAdapter);

      return conflicter.checkForCollision(
        {
          path: path.join(__dirname, 'fixtures/conflicter/foo.js'),
          contents: null
        }
      ).then(
        () => {
          sinon.assert.neverCalledWithMatch(
            testAdapter.log.writeln,
            /Existing.*Replacement.*Diff/
          );
          sinon.assert.called(testAdapter.diff);
        }
      );
    });

    it('displays custom diff for binary files', () => {
      const testAdapter = new TestAdapter(createActions(['diff', 'write']));
      const conflicter = new Conflicter(testAdapter);

      return conflicter.checkForCollision(
        {
          path: path.join(__dirname, 'fixtures/conflicter/yeoman-logo.png'),
          contents: fs.readFileSync(
            path.join(__dirname, 'fixtures/conflicter/testFile.tar.gz')
          )
        }
      ).then(
        () => {
          sinon.assert.calledWithMatch(
            testAdapter.log.writeln,
            /Existing.*Replacement.*Diff/
          );
          sinon.assert.notCalled(testAdapter.diff);
        }
      );
    });

    it('displays custom diff for deleted binary files', () => {
      const testAdapter = new TestAdapter(createActions(['diff', 'write']));
      const conflicter = new Conflicter(testAdapter);

      return conflicter.checkForCollision(
        {
          path: path.join(__dirname, 'fixtures/conflicter/yeoman-logo.png'),
          contents: null
        }
      ).then(
        () => {
          sinon.assert.calledWithMatch(
            testAdapter.log.writeln,
            /Existing.*Replacement.*Diff/
          );
          sinon.assert.notCalled(testAdapter.diff);
        }
      );
    });
  });
});
