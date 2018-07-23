'use strict';

const events = require('events');
const _ = require('lodash');
const inquirer = require('inquirer');
const logger = require('../util/log');

const logMethods = [
  'write',
  'writeln',
  'ok',
  'error',
  'skip',
  'force',
  'create',
  'invoke',
  'conflict',
  'identical',
  'info',
  'table'
];

function DummyPrompt(answers, q) {
  this.answers = answers;
  this.question = q;
}

DummyPrompt.prototype.run = function () {
  let answer = this.answers[this.question.name];
  let isSet = false;
  switch (this.question.type) {
    case 'list':
      isSet = answer !== undefined;
      break;
    case 'confirm':
      isSet = answer || answer === false;
      break;
    default:
      isSet = Boolean(answer);
  }
  if (!isSet) {
    answer = this.question.default;
    if (answer === undefined && this.question.type === 'confirm') {
      answer = true;
    }
  }
  return Promise.resolve(answer);
};

class AbstractAutomationAdapter {
  constructor(diffHandler, answers, logFactory) {
    answers = answers || {};
    this.promptModule = inquirer.createPromptModule();

    Object.keys(this.promptModule.prompts).forEach(function (promptName) {
      this.promptModule.registerPrompt(promptName, DummyPrompt.bind(DummyPrompt, answers));
    }, this);
    this.diff = diffHandler;
    if (logFactory) {
      this.log = function () {
      };
      const log = this.log;
      _.extend(log, events.EventEmitter.prototype);
      logMethods.forEach(methodName => {
        log[methodName] = logFactory(log);
      });
    } else {
      this.log = logger();
    }
  }

  prompt(questions, cb) {
    const promise = this.promptModule(questions);
    promise.then(cb || _.noop);
    return promise;
  }

}

module.exports = AbstractAutomationAdapter;
