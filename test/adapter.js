import assert from 'yeoman-assert';
import sinon from 'sinon';
import logSymbols from 'log-symbols';
import stripAnsi from 'strip-ansi';
import { TerminalAdapter } from '../lib/index.mjs';
import createLog from '../lib/util/log.js';
import process from 'node:process';

describe('TerminalAdapter', () => {
  beforeEach(function () {
    this.adapter = new TerminalAdapter();
  });

  describe('#prompt()', () => {
    let fakeAnswers;

    beforeEach(function () {
      fakeAnswers = { foo: 'bar' };
      this.stub = sinon.stub().resolves(fakeAnswers);
      this.adapter = new TerminalAdapter({ promptModule: this.stub });
    });

    it('pass its arguments to inquirer', async function () {
      const questions = [];
      const returnValue = await this.adapter.prompt(questions);
      sinon.assert.calledWith(this.stub, questions);
      assert.equal(returnValue, fakeAnswers);
    });

    it('pass its arguments with answers to inquirer', async function () {
      const questions = [];
      const answers = {};
      const returnValue = await this.adapter.prompt(questions, answers);
      sinon.assert.calledWith(this.stub, questions, answers);
      assert.equal(returnValue, fakeAnswers);
    });
  });

  describe('#prompt() with answers', () => {
    it('pass its arguments to inquirer', function (done) {
      const questions = [];
      const answers = { prompt1: 'foo' };
      this.adapter.prompt(questions, answers).then(returnValue => {
        assert.equal(returnValue.prompt1, answers.prompt1);
        done();
      });
    });
  });

  describe('#prompt() with callback for backwards compatibility for generator < 5', () => {
    it('should call the callback with answers', function (done) {
      const questions = [];
      const answers = { prompt1: 'foo' };
      this.adapter.prompt(questions, answers, returnValue => {
        assert.equal(returnValue.prompt1, answers.prompt1);
        done();
      });
    });
  });

  describe('#diff()', () => {
    it('returns properly colored diffs', function () {
      const diff = this.adapter.diff('var', 'let');
      assert.textEqual(stripAnsi(diff), '\nremoved added\n\nvarlet\n');
    });
  });

  describe('#log()', () => {
    let logMessage;
    const stderrWriteBackup = process.stderr.write;

    beforeEach(function () {
      this.spyerror = sinon.spy(this.adapter.console, 'error');

      logMessage = '';
      process.stderr.write = (() => string => {
        logMessage = string;
      })(process.stderr.write);
    });

    afterEach(function () {
      this.adapter.console.error.restore();
      process.stderr.write = stderrWriteBackup;
    });

    it('calls console.error and perform strings interpolation', function () {
      this.adapter.log('%has %many %reps', {
        has: 'has',
        many: 'many',
        reps: 'reps',
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
        another: 12,
      };

      this.adapter.log(outputObject);
      assert(this.spyerror.withArgs(outputObject).calledOnce);
      assert.equal(stripAnsi(logMessage), '{ something: 72, another: 12 }\n');
    });
  });

  describe('#log', () => {
    beforeEach(function () {
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

    describe('statuses', () => {
      it('#skip()');
      it('#force()');
      it('#create()');
      it('#invoke()');
      it('#conflict()');
      it('#identical()');
      it('#info()');
    });
  });

  describe('#log', () => {
    const funcs = ['write', 'writeln', 'ok', 'error', 'table'];
    const defaultColors = ['skip', 'force', 'create', 'invoke', 'conflict', 'identical', 'info'];
    it('log has functions', function () {
      this.adapter.log = createLog();
      for (const k of [...funcs, ...defaultColors]) {
        assert.equal(typeof this.adapter.log[k], 'function');
      }
    });
    it('log can be added custom status', function () {
      this.adapter.log = createLog({ colors: { merge: 'yellow' } });
      for (const k of [...funcs, ...defaultColors, 'merge']) {
        assert.equal(typeof this.adapter.log[k], 'function');
      }
    });
  });
});
