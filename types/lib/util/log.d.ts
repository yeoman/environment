/* eslint-disable @typescript-eslint/naming-convention */
import { type DefaultLoggerCategories, type Logger } from '@yeoman/api';
import { type Color, type Modifiers } from 'chalk';
import { type WriteStream } from 'node:tty';

/**
 * Provides a set of colors.
 */
type ColorMap<TKeys extends string | number | symbol> = {
  /**
   * Gets the color for the specified method-name.
   */
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  [P in TKeys]: typeof Color | typeof Modifiers;
};

/**
 * Provides default color-categories.
 */
type DefaultCategories = 'skip' | 'force' | 'create' | 'invoke' | 'conflict' | 'identical' | 'info';

/**
 * Provides options for creating a logger.
 */
type LoggerOptions<TCategories extends string | number | symbol = DefaultCategories> = {
  /**
   * A set of categories and assigned `chalk`-formats.
   */
  colors?: ColorMap<TCategories> | undefined;

  /**
   * The console to write log-messages to.
   */
  console?: Console | undefined;

  /**
   * The stream to write other messages to.
   */
  stderr?: WriteStream | undefined;

  /**
   * The stream to write other messages to.
   */
  stdout?: WriteStream | undefined;
};

/**
 * Creates a new `Logger` instance with the specified `options`.
 *
 * @param options
 * The options for creating the new logger.
 */
declare function createLogger<TCategories extends string | number | symbol = DefaultLoggerCategories>(
  options: LoggerOptions<TCategories>,
): Logger<TCategories>;

export default createLogger;
