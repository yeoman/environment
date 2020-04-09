'use strict';
const _ = require('lodash');
const inquirer = require('inquirer');
const diff = require('diff');
const chalk = require('chalk');

const logger = require('./util/log');

class TerminalAdapter {
  /**
   * `TerminalAdapter` is the default implementation of `Adapter`, an abstraction
   * layer that defines the I/O interactions.
   *
   * It provides a CLI interaction
   *
   * @constructor
   * @param {Object}          [options]
   * @param {Console} [options.console]
   */
  constructor(options = {}) {
    const stdout = options.stdout || process.stdout;
    const stderr = options.stderr || options.stdout || process.stderr;
    this.promptModule = inquirer.createPromptModule({skipTTYChecks: true, input: options.stdin, output: stdout});
    this.console = options.console || new console.Console(stdout, stderr);

    this.log = logger({console: this.console, stdout: options.stdout});
  }

  get _colorDiffAdded() {
    return chalk.black.bgGreen;
  }

  get _colorDiffRemoved() {
    return chalk.bgRed;
  }

  _colorLines(name, str) {
    return str.split('\n').map(line => this[`_colorDiff${name}`](line)).join('\n');
  }

  /**
   * Prompt a user for one or more questions and pass
   * the answer(s) to the provided callback.
   *
   * It shares its interface with `Base.prompt`
   *
   * (Defined inside the constructor to keep interfaces separated between
   * instances)
   *
   * @param {Object|Object[]} questions
   * @param {Object} [answers] Answers to be passed to inquirer
   * @param {Function} [callback] callback
   */
  prompt(questions, answers, cb) {
    if (typeof answers === 'function') {
      cb = answers;
      answers = undefined;
    }
    const promise = this.promptModule(questions, answers);
    promise.then(cb || _.noop);
    return promise;
  }

  /**
   * Shows a color-based diff of two strings
   *
   * @param {string} actual
   * @param {string} expected
   * @param {Array} changes returned by diff.
   */
  diff(actual, expected, changes) {
    if (Array.isArray(actual)) {
      changes = actual;
    }
    changes = changes || diff.diffLines(actual, expected);
    let msg = changes.map(str => {
      if (str.added) {
        return this._colorLines('Added', str.value);
      }

      if (str.removed) {
        return this._colorLines('Removed', str.value);
      }

      return str.value;
    }).join('');

    // Legend
    msg = '\n' +
      this._colorDiffRemoved('removed') +
      ' ' +
      this._colorDiffAdded('added') +
      '\n\n' +
      msg +
      '\n';

    this.console.log(msg);
    return msg;
  }
}

module.exports = TerminalAdapter;
