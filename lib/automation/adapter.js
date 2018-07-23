'use strict';

const AbstractAutomationAdapter = require('./abstract-automation-adapter');

const diffHandler = function () {
  return 'Diff issues, please run manually to resolve';
};

const logFactory = {
  createLog() {
    return function () {
    };
  },
  createLogMethod(log) {
    return function () {
      return log;
    };
  }
};

class AutomationAdapter extends AbstractAutomationAdapter {

  constructor(answers, silent) {
    super(diffHandler, answers, silent ? logFactory : undefined);
  }

}

module.exports = AutomationAdapter;
