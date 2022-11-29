import sinon from 'sinon';
import esmock from 'esmock';

describe('environment (spawn-command)', () => {
  let cwd;

  beforeEach(async function () {
    this.spawnLib = sinon.stub();
    this.spawnLib.sync = sinon.stub();
    this.spawn = {};
    Object.assign(
      this.spawn,
      await esmock('../lib/spawn-command.js', {
        execa: this.spawnLib,
      }),
    );
    cwd = Math.random().toString(36).slice(7);
    this.spawn.cwd = cwd;
  });

  describe('#spawnCommand()', () => {
    it('provide default options', function () {
      this.spawn.spawnCommand('foo');
      sinon.assert.calledWith(this.spawnLib, 'foo', undefined, {
        cwd,
        stdio: 'inherit',
      });
    });

    it('pass arguments', function () {
      this.spawn.spawnCommand('foo', 'bar');
      sinon.assert.calledWith(this.spawnLib, 'foo', 'bar', {
        cwd,
        stdio: 'inherit',
      });
    });

    it('pass options', function () {
      this.spawn.spawnCommand('foo', undefined, { foo: 1 });
      sinon.assert.calledWith(this.spawnLib, 'foo', undefined, {
        cwd,
        foo: 1,
        stdio: 'inherit',
      });
    });

    it('allow overriding default options', function () {
      this.spawn.spawnCommand('foo', undefined, { stdio: 'ignore' });
      sinon.assert.calledWith(this.spawnLib, 'foo', undefined, {
        cwd,
        stdio: 'ignore',
      });
    });
  });

  describe('#spawnCommandSync()', () => {
    it('provide default options', function () {
      this.spawn.spawnCommandSync('foo');
      sinon.assert.calledWith(this.spawnLib.sync, 'foo', undefined, {
        cwd,
        stdio: 'inherit',
      });
    });

    it('pass arguments', function () {
      this.spawn.spawnCommandSync('foo', 'bar');
      sinon.assert.calledWith(this.spawnLib.sync, 'foo', 'bar', {
        cwd,
        stdio: 'inherit',
      });
    });

    it('pass options', function () {
      this.spawn.spawnCommandSync('foo', undefined, { foo: 1 });
      sinon.assert.calledWith(this.spawnLib.sync, 'foo', undefined, {
        cwd,
        foo: 1,
        stdio: 'inherit',
      });
    });

    it('allow overriding default options', function () {
      this.spawn.spawnCommandSync('foo', undefined, { stdio: 'wut' });
      sinon.assert.calledWith(this.spawnLib.sync, 'foo', undefined, {
        cwd,
        stdio: 'wut',
      });
    });
  });
});
