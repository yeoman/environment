'use strict';
const assert = require('assert');
const path = require('path');
const Store = require('../lib/store');

describe('Store', () => {
  beforeEach(function () {
    this.store = new Store();
  });

  describe('#add() / #get()', () => {
    beforeEach(function () {
      this.modulePath = path.join(__dirname, 'fixtures/generator-mocha');
      this.module = require(this.modulePath);
    });

    describe('storing as module', () => {
      beforeEach(function () {
        this.store.add('foo:module', this.module);
        this.outcome = this.store.get('foo:module');
      });

      it('store and return the module', function () {
        assert.equal(this.outcome, this.module);
      });

      it('assign meta data to the module', function () {
        assert.equal(this.outcome.namespace, 'foo:module');
      });

      it('assign dummy resolved value (can\'t determine the path of an instantiated)', function () {
        assert.ok(this.outcome.resolved.length > 0);
      });
    });

    describe('storing as module path', () => {
      beforeEach(function () {
        this.store.add('foo:path', this.modulePath);
        this.outcome = this.store.get('foo:path');
      });

      it('store and returns the required module', function () {
        assert.notEqual(this.outcome, this.modulePath);
        assert.equal(this.outcome.usage, 'Usage can be used to customize the help output');
      });

      it('assign meta data to the module', function () {
        assert.equal(this.outcome.resolved, this.modulePath);
        assert.equal(this.outcome.namespace, 'foo:path');
      });
    });
  });

  describe('#namespaces()', () => {
    beforeEach(function () {
      this.store.add('foo', {});
      this.store.add('lab', {});
    });

    it('return stored module namespaces', function () {
      assert.deepEqual(this.store.namespaces(), ['foo', 'lab']);
    });
  });
});
