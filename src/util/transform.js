import minimatch from 'minimatch';
import { transform, passthrough, filter } from 'p-transform';
// eslint-disable-next-line n/file-extension-in-import
import { clearFileState } from 'mem-fs-editor/state';

const { Minimatch } = minimatch;

/**
 * Transform api should be avoided by generators without a executable.
 * May break between major yo versions.
 *
 * Create a force yeoman configs transform stream.
 * @return {Transform} A Transform https://nodejs.org/api/stream.html#stream_class_stream_transform
 */
export function createYoRcTransform() {
  // Config files should not be processed by the conflicter. Force override.
  return patternSpy(
    file => {
      file.conflicter = 'force';
    },
    '**/{.yo-rc.json,.yo-resolve,.yo-rc-global.json}',
    'environment:yo-rc',
  );
}

/**
 * Transform api should be avoided by generators without a executable.
 * May break between major yo versions.
 *
 * Create a transform to apply conflicter status.
 * @param {Log} logger - Log reference. See log.js
 * @return {Transform} A Transform https://nodejs.org/api/stream.html#stream_class_stream_transform
 */
export function createConflicterStatusTransform() {
  return transform(file => {
    const action = file.conflicter;

    delete file.conflicter;
    delete file.binary;
    delete file.conflicterChanges;
    delete file.conflicterLog;

    if (!action && file.state) {
      return file;
    }

    if (action === 'skip') {
      clearFileState(file);
      return undefined;
    }

    return file;
  }, 'environment:conflicter-status');
}

/**
 * Conditional filter on pattern.
 *
 * @param {String} pattern - Minimatch pattern.
 * @param {Object} options - Minimatch options.
 */
export function patternFilter(pattern, options) {
  const minimatch = new Minimatch(pattern, options);
  return filter(file => minimatch.match(file.path));
}

/**
 * Conditional spy on pattern.
 *
 * @param {Function} spy.
 * @param {String} pattern - Minimatch pattern.
 * @param {Object} options - Minimatch options.
 */
export function patternSpy(spy, pattern, options) {
  const minimatch = new Minimatch(pattern, options);
  // eslint-disable-next-line unicorn/prefer-regexp-test
  return passthrough(file => (minimatch.match(file.path) ? spy(file) : undefined));
}
