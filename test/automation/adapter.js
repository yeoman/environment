'use strict';

const assert = require('yeoman-assert');
const sinon = require('sinon');
const logSymbols = require('log-symbols');
const stripAnsi = require('strip-ansi');
const AutomationAdapter = require('../../lib/automation/adapter');
const createLog = require('../../lib/util/log');

describe('AutomationAdapter', () => {
  describe('#prompt()', () => {
    it('question is answered', function () {
      const answers = {
        appName: 'test'
      };
      this.adapter = new AutomationAdapter(answers, true);
      const questions = [{
        type: 'input',
        name: 'appName',
        message: 'Your app name'
      }];
      return new Promise(resolve => {
        this.adapter.prompt(questions, resolve);
      })
        .then(resolvedAnswers => {
          assert.equal(resolvedAnswers.appName, 'test');
        });
    });

    it('question is answered using default', function () {
      const answers = {};
      this.adapter = new AutomationAdapter(answers, true);
      const questions = [{
        type: 'input',
        name: 'appName',
        message: 'Your app name',
        default: 'defaultAppName'
      }];
      return new Promise(resolve => {
        this.adapter.prompt(questions, resolve);
      })
        .then(resolvedAnswers => {
          assert.equal(resolvedAnswers.appName, 'defaultAppName');
        });
    });

    it('sets undefined if answer to question is missing', function () {
      const answers = {};
      this.adapter = new AutomationAdapter(answers, true);
      const questions = [{
        type: 'input',
        name: 'appName',
        message: 'Your app name'
      }];
      return new Promise(resolve => {
        this.adapter.prompt(questions, resolve);
      })
        .then(resolvedAnswers => {
          assert.equal(resolvedAnswers.appName, undefined);
        });
    });
  });

  describe('#diff()', () => {
    it('returns default diff message', function () {
      this.adapter = new AutomationAdapter({}, true);
      const diff = this.adapter.diff('var', 'let');
      assert.textEqual(stripAnsi(diff), 'Diff issues, please run manually to resolve');
    });
  });

  describe('#log()', () => {
    let logMessage;
    const stderrWriteBackup = process.stderr.write;

    beforeEach(function () {
      this.adapter = new AutomationAdapter({}, false);
      this.spyerror = sinon.spy(console, 'error');

      logMessage = '';
      process.stderr.write = (() => {
        return str => {
          logMessage = str;
        };
      })(process.stderr.write);
    });

    afterEach(() => {
      console.error.restore();
      process.stderr.write = stderrWriteBackup;
    });

    it('calls console.error and perform strings interpolation', function () {
      this.adapter.log('%has %many %reps', {
        has: 'has',
        many: 'many',
        reps: 'reps'
      });
      assert(this.spyerror.withArgs('has many reps').calledOnce);
      assert.equal(stripAnsi(logMessage), 'has many reps\n');
    });

    it('substitutes strings correctly when context argument is falsey', function () {
      this.adapter.log('Zero = %d, One = %s', 0, 1);
      assert(this.spyerror.calledOnce);
      assert.equal(stripAnsi(logMessage), 'Zero = 0, One = 1\n');
    });

    it('boolean values', function () {
      this.adapter.log(true);
      assert(this.spyerror.withArgs(true).calledOnce);
      assert.equal(stripAnsi(logMessage), 'true\n');
    });

    it('#write() numbers', function () {
      this.adapter.log(42);
      assert(this.spyerror.withArgs(42).calledOnce);
      assert.equal(stripAnsi(logMessage), '42\n');
    });

    it('#write() objects', function () {
      const outputObject = {
        something: 72,
        another: 12
      };

      this.adapter.log(outputObject);
      assert(this.spyerror.withArgs(outputObject).calledOnce);
      assert.equal(
        stripAnsi(logMessage),
        '{ something: 72, another: 12 }\n'
      );
    });
  });

  describe('#log', () => {
    beforeEach(function () {
      this.adapter = new AutomationAdapter({}, false);
      this.spylog = sinon.spy(process.stderr, 'write');
    });

    afterEach(() => {
      process.stderr.write.restore();
    });

    it('#write() pass strings as they are', function () {
      const testString = 'dummy';
      this.adapter.log.write(testString);
      assert(this.spylog.withArgs(testString).calledOnce);
    });

    it('#write() accepts util#format style arguments', function () {
      this.adapter.log.write('A number: %d, a string: %s', 1, 'bla');
      assert(this.spylog.withArgs('A number: 1, a string: bla').calledOnce);
    });

    it('#writeln() adds a \\n at the end', function () {
      this.adapter.log.writeln('dummy');
      assert(this.spylog.withArgs('dummy').calledOnce);
      assert(this.spylog.withArgs('\n').calledOnce);
    });

    it('#ok() adds a green "✔ " at the beginning and \\n at the end', function () {
      this.adapter.log.ok('dummy');
      assert(this.spylog.withArgs(`${logSymbols.success} dummy\n`).calledOnce);
    });

    it('#error() adds a green "✗ " at the beginning and \\n at the end', function () {
      this.adapter.log.error('dummy');
      assert(this.spylog.withArgs(`${logSymbols.error} dummy\n`).calledOnce);
    });
  });

  describe('#log', () => {
    const funcs = ['write', 'writeln', 'ok', 'error', 'table'];
    const defaultColors = [
      'skip', 'force', 'create', 'invoke', 'conflict', 'identical', 'info'];

    beforeEach(function () {
      this.adapter = new AutomationAdapter({}, false);
    });

    it('log has functions', function () {
      this.adapter.log = createLog();
      funcs.concat(defaultColors).forEach(k => {
        assert.equal(typeof this.adapter.log[k], 'function');
      });
    });
    it('log can be added custom status', function () {
      this.adapter.log = createLog({colors: {merge: 'yellow'}});
      funcs.concat(defaultColors, ['merge']).forEach(k => {
        assert.equal(typeof this.adapter.log[k], 'function');
      });
    });
  });

  describe('#log', () => {
    const funcs = ['write', 'writeln', 'ok', 'error'];

    beforeEach(function () {
      this.adapter = new AutomationAdapter({}, true);
      this.spylog = sinon.spy(process.stderr, 'write');
    });

    afterEach(() => {
      process.stderr.write.restore();
    });

    it('silent doesn\'t log anything and returns self', function () {
      funcs.forEach(k => {
        const retLog = this.adapter.log[k]('dummy');
        assert.equal(retLog, this.adapter.log);
      });
      assert.equal(this.spylog.callCount, 0);
    });
  });
});
