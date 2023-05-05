/* eslint-disable @typescript-eslint/naming-convention */
import { type Change } from 'diff';
import { type QuestionCollection, type PromptModule } from 'inquirer';
import { type Logger, type InputOutputAdapter, type Answers } from '@yeoman/api';

export { type Answers } from '@yeoman/api';

/**
 * Provides options for creating an adapter.
 */
export type AdapterOptions = {
  /**
   * A console-object for logging messages.
   */
  console?: Console | undefined;
};

/**
 * Represents a set of questions.
 */
export type Questions<T extends Answers> = QuestionCollection<T>;

/**
 * `TerminalAdapter` is the default implementation of `Adapter`, an abstraction
 * layer that defines the I/O interactions.
 *
 * It provides a CLI interaction
 */
export default class TerminalAdapter implements InputOutputAdapter {
  /**
   * An inquirer prompt module.
   */
  promptModule: PromptModule;

  /**
   * A console-object for logging messages.
   */
  console: Console;

  /**
   * A component for logging messages.
   */
  log: Logger;

  /**
   * Initializes a new instance of the `TerminalAdapter` class.
   *
   * @param options The options for creating the adapter.
   */
  constructor(options: AdapterOptions);

  /**
   * Prompts the user for one or more questions.
   *
   * @param questions The questions to prompt.
   * @param initialAnswers Initial answers
   */
  prompt<TAnswers extends Answers>(questions: Questions<TAnswers>, initialAnswers?: TAnswers): Promise<TAnswers>;

  /**
   * Shows a color-based diff of two strings.
   *
   * @param actual The actual text.
   * @param expected The expected text.
   * @param changes The changes returned by `diff`.
   * @returns The formatted message.
   */
  diff(actual: string, expected: string, changes: Change[]): string;
}
