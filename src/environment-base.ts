import EventEmitter from 'node:events';

export default class EnvironmentBase extends EventEmitter {
  private readonly aliases: Array<{ match: RegExp; value: string }> = [];

  constructor() {
    super();

    this.alias(/^([^:]+)$/, '$1:app');
  }

  /**
   * Get or create an alias.
   *
   * Alias allows the `get()` and `lookup()` methods to search in alternate
   * filepath for a given namespaces. It's used for example to map `generator-*`
   * npm package to their namespace equivalent (without the generator- prefix),
   * or to default a single namespace like `angular` to `angular:app` or
   * `angular:all`.
   *
   * Given a single argument, this method acts as a getter. When both name and
   * value are provided, acts as a setter and registers that new alias.
   *
   * If multiple alias are defined, then the replacement is recursive, replacing
   * each alias in reverse order.
   *
   * An alias can be a single String or a Regular Expression. The finding is done
   * based on .match().
   *
   * @param {String|RegExp} match
   * @param {String} value
   *
   * @example
   *
   *     env.alias(/^([a-zA-Z0-9:\*]+)$/, 'generator-$1');
   *     env.alias(/^([^:]+)$/, '$1:app');
   *     env.alias(/^([^:]+)$/, '$1:all');
   *     env.alias('foo');
   *     // => generator-foo:all
   */
  alias(match: string | RegExp, value: string): this;
  alias(value: string): string;
  alias(match: string | RegExp, value?: string): string | this {
    if (match && value) {
      this.aliases.push({
        match: match instanceof RegExp ? match : new RegExp(`^${match}$`),
        value,
      });
      return this;
    }

    if (typeof match !== 'string') {
      throw new TypeError('string is required');
    }

    const aliases = [...this.aliases].reverse();

    return aliases.reduce<string>((resolved, alias) => {
      if (!alias.match.test(resolved)) {
        return resolved;
      }

      return resolved.replace(alias.match, alias.value);
    }, match);
  }
}
