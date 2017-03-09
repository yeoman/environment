'use strict';
const _ = require('lodash');
const inquirer = require('inquirer');
const diff = require('diff');
const chalk = require('chalk');
const logger = require('./util/log');

/**
 * `TerminalAdapter` is the default implementation of `Adapter`, an abstraction
 * layer that defines the I/O interactions.
 *
 * It provides a CLI interaction
 *
 * @constructor
 */
const TerminalAdapter = module.exports = function TerminalAdapter() {
  this.promptModule = inquirer.createPromptModule();
};

TerminalAdapter.prototype._colorDiffAdded = chalk.black.bgGreen;
TerminalAdapter.prototype._colorDiffRemoved = chalk.bgRed;
TerminalAdapter.prototype._colorLines = function colorLines(name, str) {
  return str.split('\n').map(line => this[`_colorDiff${name}`](line)).join('\n');
};

/**
 * Prompt a user for one or more questions and pass
 * the answer(s) to the provided callback.
 *
 * It shares its interface with `Base.prompt`
 *
 * (Defined inside the constructor to keep interfaces separated between
 * instances)
 *
 * @param {Array} questions
 * @param {Function} callback
 */
TerminalAdapter.prototype.prompt = function () {};

/**
 * Shows a color-based diff of two strings
 *
 * @param {string} actual
 * @param {string} expected
 */
TerminalAdapter.prototype.diff = function _diff(actual, expected) {
  let msg = diff.diffLines(actual, expected).map(str => {
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

  console.log(msg);
  return msg;
};

/**
 * Logging utility
 * @type {env/log}
 */
TerminalAdapter.prototype.log = logger();

TerminalAdapter.prototype.prompt = function (questions, cb) {
  const promise = this.promptModule(questions);
  promise.then(cb || _.noop);
  return promise;
};
