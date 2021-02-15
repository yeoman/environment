'use strict';

const {WError} = require('error');
const fs = require('fs');
const path = require('path');
const findUp = require('find-up');
const minimatch = require('minimatch');
const through = require('through2');

class YoResolveError extends WError {}

/**
 * Detect if the file is modified
 * See https://github.com/SBoudrias/mem-fs-editor/blob/3ff18e26c52dc30d8f371bcc72c1884f2ea706d6/lib/actions/commit.js#L38
 *
 * @param {Object} field - vinyl file
 */
function fileIsModified(file) {
  // New files (don't exists in the disc) that have been deleted won't be committed and is considered unmodified file.
  return (file.state === 'modified' || (file.state === 'deleted' && !file.isNew));
}

/**
 * Create a for each file stream transform.
 * @param {Function} forEach - Function to execute for each file
 * @param {Object} options - Options
 * @param {boolean} [options.autoForward = true] - Set false to don't add a file to the stream, the function must do it.
 * @param {boolean} [options.executeUnmodified = false] - Set true to execute the forEach function with a not modified file.
 * @param {boolean} [options.forwardUmodified = true] - Set false to don't add a not modified file to the stream.
 * @return {Transform} A Transform https://nodejs.org/api/stream.html#stream_class_stream_transform
 */
function createEachFileTransform(forEach, options = {}) {
  if (typeof forEach !== 'function') {
    options = forEach;
    forEach = () => {};
  }
  const {forwardUmodified = true, executeUnmodified = false, autoForward = true, autoContinue = true} = options;
  return through.obj(function (file, enc, cb) {
    const forward = () => {
      if (autoForward && (forwardUmodified || fileIsModified(file))) {
        this.push(file);
      }
      if (autoContinue) {
        cb();
      }
    };
    if (!executeUnmodified && !fileIsModified(file)) {
      forward();
      return;
    }
    const mayBePromise = forEach.call(this, file, enc, autoContinue ? undefined : cb);
    if (mayBePromise && mayBePromise.then) {
      mayBePromise.then(() => forward()).catch(error => cb(error));
    } else {
      forward();
    }
  });
}

function parseYoAttributesFile(yoAttributeFileName) {
  let overridesContent;
  try {
    overridesContent = fs.readFileSync(yoAttributeFileName, 'utf-8');
  } catch (error) {
    throw YoResolveError.wrap('Error loading yo attributes file {yoAttributeFileName}', error, {yoAttributeFileName});
  }
  const absoluteDir = path.dirname(yoAttributeFileName);
  return Object.fromEntries(
    overridesContent
      .split(/\r?\n/)
      .map(override => override.trim())
      .map(override => override.split('#')[0].trim())
      .filter(override => override)
      .map(override => override.split(/[\s+=]/))
      .map(([pattern, status = 'skip']) => [path.join(absoluteDir, pattern), status])
  );
}

function getConflicterStatusForFile(conflicter, filePath, yoAttributeFileName = '.yo-resolve') {
  const fileDir = path.dirname(filePath);
  conflicter.yoResolveByFile = conflicter.yoResolveByFile || {};
  const yoResolveFiles = [];
  let foundYoAttributesFile = findUp.sync([yoAttributeFileName], {cwd: fileDir});
  while (foundYoAttributesFile) {
    yoResolveFiles.push(foundYoAttributesFile);
    foundYoAttributesFile = findUp.sync([yoAttributeFileName], {cwd: path.join(path.dirname(foundYoAttributesFile), '..')});
  }

  let fileStatus;
  if (yoResolveFiles) {
    yoResolveFiles.forEach(yoResolveFile => {
      if (conflicter.yoResolveByFile[yoResolveFile] === undefined) {
        conflicter.yoResolveByFile[yoResolveFile] = parseYoAttributesFile(yoResolveFile);
      }
    });
    yoResolveFiles
      .map(yoResolveFile => conflicter.yoResolveByFile[yoResolveFile])
      .map(attributes => attributes)
      .find(yoResolve => {
        return Object.entries(yoResolve).some(([pattern, status]) => {
          if (minimatch(filePath, pattern)) {
            fileStatus = status;
            return true;
          }
          return false;
        });
      });
  }
  return fileStatus;
}

/**
 * Create a yo-resolve transform stream.
 * Suports pre-defined conflicter actions action based on file glob.
 * @param {Conflicter} conflicter - Conflicter instance
 * @param {string} yoResolveFileName - .yo-resolve filename
 * @return {Transform} A Transform https://nodejs.org/api/stream.html#stream_class_stream_transform
 */
function createYoResolveTransform(conflicter, yoResolveFileName) {
  return createEachFileTransform(file => {
    file.conflicter = file.conflicter || getConflicterStatusForFile(conflicter, file.path, yoResolveFileName);
  });
}

/**
 * Create a force yeoman configs transform stream.
 * @return {Transform} A Transform https://nodejs.org/api/stream.html#stream_class_stream_transform
 */
function createYoRcTransform() {
  return createEachFileTransform(file => {
    const filename = path.basename(file.path);
    // Config file should not be processed by the conflicter. Force override.
    if (filename === '.yo-rc.json' || filename === '.yo-rc-global.json') {
      file.conflicter = 'force';
    }
  });
}

/**
 * Create a transform to apply conflicter status.
 * @param {Log} logger - Log reference. See log.js
 * @return {Transform} A Transform https://nodejs.org/api/stream.html#stream_class_stream_transform
 */
function createConflicterStatusTransform() {
  return createEachFileTransform(function (file) {
    const action = file.conflicter;

    delete file.conflicter;
    delete file.binary;
    delete file.conflicterChanges;
    delete file.conflicterLog;

    if (!action) {
      this.push(file);
      return;
    }

    if (action === 'skip') {
      delete file.state;
      delete file.isNew;
    } else {
      this.push(file);
    }
  }, {autoForward: false});
}

module.exports = {
  fileIsModified,
  getConflicterStatusForFile,
  createEachFileTransform,
  createYoResolveTransform,
  createYoRcTransform,
  createConflicterStatusTransform
};
