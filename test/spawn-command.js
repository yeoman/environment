import { expect, esmocha, describe, beforeEach, it, afterEach } from 'esmocha';

const execa = await esmocha.mock('execa');
const { default: spawnCommand } = await import('../lib/spawn-command.js');

describe('environment (spawn-command)', () => {
  let cwd;

  beforeEach(async function () {
    cwd = Math.random().toString(36).slice(7);
    spawnCommand.cwd = cwd;
  });

  afterEach(() => {
    esmocha.restoreAllMocks();
  });

  describe('#spawnCommand()', () => {
    it('provide default options', function () {
      spawnCommand.spawnCommand('foo');
      expect(execa.execa).toHaveBeenCalledWith('foo', undefined, {
        cwd,
        stdio: 'inherit',
      });
    });

    it('pass arguments', function () {
      spawnCommand.spawnCommand('foo', 'bar');
      expect(execa.execa).toHaveBeenCalledWith('foo', 'bar', {
        cwd,
        stdio: 'inherit',
      });
    });

    it('pass options', function () {
      spawnCommand.spawnCommand('foo', undefined, { foo: 1 });
      expect(execa.execa).toHaveBeenCalledWith('foo', undefined, {
        cwd,
        foo: 1,
        stdio: 'inherit',
      });
    });

    it('allow overriding default options', function () {
      spawnCommand.spawnCommand('foo', undefined, { stdio: 'ignore' });
      expect(execa.execa).toHaveBeenCalledWith('foo', undefined, {
        cwd,
        stdio: 'ignore',
      });
    });
  });

  describe('#spawnCommandSync()', () => {
    it('provide default options', function () {
      spawnCommand.spawnCommandSync('foo');
      expect(execa.execaSync).toHaveBeenCalledWith('foo', undefined, {
        cwd,
        stdio: 'inherit',
      });
    });

    it('pass arguments', function () {
      spawnCommand.spawnCommandSync('foo', 'bar');
      expect(execa.execaSync).toHaveBeenCalledWith('foo', 'bar', {
        cwd,
        stdio: 'inherit',
      });
    });

    it('pass options', function () {
      spawnCommand.spawnCommandSync('foo', undefined, { foo: 1 });
      expect(execa.execaSync).toHaveBeenCalledWith('foo', undefined, {
        cwd,
        foo: 1,
        stdio: 'inherit',
      });
    });

    it('allow overriding default options', function () {
      spawnCommand.spawnCommandSync('foo', undefined, { stdio: 'pipe' });
      expect(execa.execaSync).toHaveBeenCalledWith('foo', undefined, {
        cwd,
        stdio: 'pipe',
      });
    });
  });
});
