import fs from 'node:fs';
import path from 'node:path';
import findUp from 'find-up';
import minimatch from 'minimatch';
import { transform, passthrough, filter } from 'p-transform';
// eslint-disable-next-line n/file-extension-in-import
import { clearFileState } from 'mem-fs-editor/state';

const { Minimatch } = minimatch;

export function parseYoAttributesFile(yoAttributeFileName) {
  let overridesContent;
  try {
    overridesContent = fs.readFileSync(yoAttributeFileName, 'utf8');
  } catch (error) {
    const wrappedError = new Error('Error loading yo attributes file {yoAttributeFileName}', { cause: error });
    wrappedError.yoAttributeFileName = yoAttributeFileName;
    throw wrappedError;
  }

  const absoluteDir = path.dirname(yoAttributeFileName);
  return Object.fromEntries(
    overridesContent
      .split(/\r?\n/)
      .map(override => override.trim())
      .map(override => override.split('#')[0].trim())
      .filter(Boolean)
      .map(override => override.split(/[\s+=]/))
      .map(([pattern, status = 'skip']) => {
        pattern = pattern.startsWith('!') ? `!${path.join(absoluteDir, pattern.slice(1))}` : path.join(absoluteDir, pattern);
        return [pattern, status];
      }),
  );
}

/**
 * Transform api should be avoided by generators without a executable.
 * May break between major yo versions.
 */
export function createConflicterCheckTransform(conflicter, conflicterStatus) {
  return passthrough(file => conflicter.checkForCollision(file, conflicterStatus), 'environment:conflicter-check');
}

/**
 * @private
 */
export function getConflicterStatusForFile(conflicter, filePath, yoAttributeFileName = '.yo-resolve') {
  const fileDir = path.dirname(filePath);
  conflicter.yoResolveByFile = conflicter.yoResolveByFile || {};
  const yoResolveFiles = [];
  let foundYoAttributesFile = findUp.sync([yoAttributeFileName], {
    cwd: fileDir,
  });
  while (foundYoAttributesFile) {
    yoResolveFiles.push(foundYoAttributesFile);
    foundYoAttributesFile = findUp.sync([yoAttributeFileName], {
      cwd: path.join(path.dirname(foundYoAttributesFile), '..'),
    });
  }

  let fileStatus;
  if (yoResolveFiles) {
    for (const yoResolveFile of yoResolveFiles) {
      if (conflicter.yoResolveByFile[yoResolveFile] === undefined) {
        conflicter.yoResolveByFile[yoResolveFile] = parseYoAttributesFile(yoResolveFile);
      }
    }

    yoResolveFiles
      .map(yoResolveFile => conflicter.yoResolveByFile[yoResolveFile])
      .map(attributes => attributes)
      .find(yoResolve =>
        Object.entries(yoResolve).some(([pattern, status]) => {
          if (minimatch(filePath, pattern)) {
            fileStatus = status;
            return true;
          }

          return false;
        }),
      );
  }

  return fileStatus;
}

/**
 * Transform api should be avoided by generators without a executable.
 * May break between major yo versions.
 *
 * Create a yo-resolve transform stream.
 * Suports pre-defined conflicter actions action based on file glob.
 * @param {Conflicter} conflicter - Conflicter instance
 * @param {string} yoResolveFileName - .yo-resolve filename
 * @return {Transform} A Transform https://nodejs.org/api/stream.html#stream_class_stream_transform
 */
export function createYoResolveTransform(conflicter, yoResolveFileName) {
  return passthrough(file => {
    file.conflicter = file.conflicter || getConflicterStatusForFile(conflicter, file.path, yoResolveFileName);
  }, 'environment:yo-resolve');
}

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
