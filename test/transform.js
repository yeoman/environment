'use strict';
/* eslint-disable max-nested-callbacks, eslint-comments/disable-enable-pair */

const assert = require('assert');
const path = require('path');
const {pipeline} = require('stream');
const {
  createFileTransform,
  fileIsModified,
  getConflicterStatusForFile,
  createEachFileTransform,
  createYoRcTransform,
  createConflicterStatusTransform
} = require('../lib/util/transform');
const sinon = require('sinon');

const passthroughFunction = function (file, _, cb) {
  this.push(file);
  cb();
};

describe('Transform stream', () => {
  let unmodifiedFile;
  let newFile;
  let modifiedFile;
  let newDeletedFile;
  let yoRcFile;
  let yoRcGlobalFile;
  let yoResolveFile;
  let conflicterSkippedFile;

  let stream;
  let files;
  const unmodifiedFilesCount = 2;

  let sinonTransformPre;
  let sinonTransformPost;

  beforeEach(() => {
    unmodifiedFile = {path: 'unmodifiedFile'};
    newFile = {state: 'modified', isNew: true, path: 'newFile'};
    modifiedFile = {state: 'modified', path: 'modifiedFile'};
    newDeletedFile = {state: 'deleted', isNew: true, path: 'newDeletedFile'};
    yoRcFile = {state: 'modified', path: '.yo-rc.json'};
    yoRcGlobalFile = {state: 'modified', path: '.yo-rc-global.json'};
    yoResolveFile = {state: 'modified', path: '.yo-resolve'};
    conflicterSkippedFile = {state: 'modified', path: 'conflicterSkippedFile', conflicter: 'skip'};

    files = [
      unmodifiedFile,
      newFile,
      modifiedFile,
      newDeletedFile,
      yoRcFile,
      yoRcGlobalFile,
      yoResolveFile,
      conflicterSkippedFile
    ];

    sinonTransformPre = sinon.stub().callsFake(passthroughFunction);
    sinonTransformPost = sinon.stub().callsFake(passthroughFunction);

    stream = createFileTransform();
    files.forEach(file => stream.write(file));
    stream.end();
  });

  describe('fileIsModified()', () => {
    it('should return false for unmodified file', () => {
      assert.equal(fileIsModified(unmodifiedFile), false);
    });

    it('should return true for modified file', () => {
      assert.equal(fileIsModified(modifiedFile), true);
    });

    it('should return true for new file', () => {
      assert.equal(fileIsModified(newFile), true);
    });

    it('should return false for new file that have been deleted', () => {
      assert.equal(fileIsModified(newFile), true);
    });
  });

  describe('createEachFileTransform()', () => {
    let sinonTransform;

    describe('sync functions', () => {
      beforeEach(done => {
        sinonTransform = sinon.stub();

        const transform = createEachFileTransform(sinonTransform);
        pipeline(stream, createFileTransform(sinonTransformPre), transform, createFileTransform(sinonTransformPost), error => {
          done(error);
        });
      });

      it('should call the function for every modified file and forward them through', () => {
        assert.equal(sinonTransformPre.callCount, files.length);
        assert.equal(sinonTransform.callCount, files.length - unmodifiedFilesCount);
        assert.equal(sinonTransformPost.callCount, files.length);
      });
    });

    describe('executeUnmodified option', () => {
      beforeEach(done => {
        sinonTransform = sinon.stub();

        const transform = createEachFileTransform(sinonTransform, {executeUnmodified: true});
        pipeline(stream, createFileTransform(sinonTransformPre), transform, createFileTransform(sinonTransformPost), error => {
          done(error);
        });
      });

      it('should call the function for every file and forward every file', () => {
        assert.equal(sinonTransformPre.callCount, files.length);
        assert.equal(sinonTransform.callCount, files.length);
        assert.equal(sinonTransformPost.callCount, files.length);
      });
    });

    describe('false forwardUmodified option', () => {
      beforeEach(done => {
        sinonTransform = sinon.stub();

        const transform = createEachFileTransform(sinonTransform, {forwardUmodified: false});
        pipeline(stream, createFileTransform(sinonTransformPre), transform, createFileTransform(sinonTransformPost), error => {
          done(error);
        });
      });

      it('should call the function for every modified file and forward modified files', () => {
        assert.equal(sinonTransformPre.callCount, files.length);
        assert.equal(sinonTransform.callCount, files.length - unmodifiedFilesCount);
        assert.equal(sinonTransformPost.callCount, files.length - unmodifiedFilesCount);
      });
    });

    describe('executeUnmodified and false forwardUmodified options', () => {
      beforeEach(done => {
        sinonTransform = sinon.stub();

        const transform = createEachFileTransform(sinonTransform, {passUmodified: true, executeUnmodified: true});
        pipeline(stream, createFileTransform(sinonTransformPre), transform, createFileTransform(sinonTransformPost), error => {
          done(error);
        });
      });

      it('should call the function for every modified file and forward every file', () => {
        assert.equal(sinonTransformPre.callCount, files.length);
        assert.equal(sinonTransform.callCount, files.length);
        assert.equal(sinonTransformPost.callCount, files.length);
      });
    });

    describe('false autoForward option', () => {
      beforeEach(done => {
        sinonTransform = sinon.stub();

        const transform = createEachFileTransform(sinonTransform, {autoForward: false});
        pipeline(stream, createFileTransform(sinonTransformPre), transform, createFileTransform(sinonTransformPost), error => {
          done(error);
        });
      });

      it('should call the function for every modified file and forward every file', () => {
        assert.equal(sinonTransformPre.callCount, files.length);
        assert.equal(sinonTransform.callCount, files.length - unmodifiedFilesCount);
        assert.equal(sinonTransformPost.callCount, 0);
      });
    });

    describe('false autoForward and executeUnmodified option', () => {
      beforeEach(done => {
        sinonTransform = sinon.stub();

        const transform = createEachFileTransform(sinonTransform, {autoForward: false, executeUnmodified: true});
        pipeline(stream, createFileTransform(sinonTransformPre), transform, createFileTransform(sinonTransformPost), error => {
          done(error);
        });
      });

      it('should call the function for every modified file and forward every file', () => {
        assert.equal(sinonTransformPre.callCount, files.length);
        assert.equal(sinonTransform.callCount, files.length);
        assert.equal(sinonTransformPost.callCount, 0);
      });
    });
  });

  describe('createYoRcTransform()', () => {
    beforeEach(done => {
      [yoRcFile, yoRcGlobalFile, yoResolveFile].forEach(file => {
        assert.equal(file.conflicter, undefined);
      });
      pipeline(stream, createFileTransform(sinonTransformPre), createYoRcTransform(), createFileTransform(sinonTransformPost), error => {
        done(error);
      });
    });

    it('should call the function for every modified file and forward them through', () => {
      assert.equal(sinonTransformPre.callCount, files.length);
      assert.equal(sinonTransformPost.callCount, files.length);
      files.forEach(file => {
        if ([yoRcFile, yoRcGlobalFile, yoResolveFile].includes(file)) {
          assert.equal(file.conflicter, 'force');
        }
      });
    });
  });

  describe('createConflicterStatusTransform()', () => {
    let adapter;
    beforeEach(done => {
      adapter = {skip: sinon.fake()};
      pipeline(stream, createFileTransform(sinonTransformPre), createConflicterStatusTransform(adapter), createFileTransform(sinonTransformPost), error => {
        done(error);
      });
    });

    it('should forward modified and not skipped files', () => {
      assert.equal(sinonTransformPre.callCount, files.length);
      assert.equal(sinonTransformPost.callCount, files.length - 1);
      files.forEach(file => {
        assert.equal(file.conflicter, undefined);
        assert.equal(file.binary, undefined);
        assert.equal(file.conflicterChanges, undefined);
        assert.equal(file.conflicterLog, undefined);
      });
    });
  });

  describe('getConflicterStatusForFile()', () => {
    const yoResolveRoot = path.join(__dirname, 'fixtures', 'yo-resolve');
    const yoResolveSub = path.join(yoResolveRoot, 'sub');
    const rootToSkipFile = path.join(yoResolveRoot, 'root-to-skip');
    const subToSkipFile = path.join(yoResolveSub, 'sub-to-skip');
    const sub2ToForceFile = path.join(yoResolveSub, 'sub2-to-force');
    const noResolveFile = path.join(yoResolveSub, 'no-resolve');
    const matchToSkipFile = path.join(yoResolveSub, 'match-to-skip');

    it('should return correct status for root-to-skip', () => {
      assert.strictEqual(getConflicterStatusForFile({}, rootToSkipFile), 'skip');
    });

    it('should return correct status for sub-to-skip', () => {
      assert.strictEqual(getConflicterStatusForFile({}, subToSkipFile), 'skip');
    });

    it('should return correct status for sub2-to-force', () => {
      assert.strictEqual(getConflicterStatusForFile({}, sub2ToForceFile), 'force');
    });

    it('should return correct status for no-resolve', () => {
      assert.strictEqual(getConflicterStatusForFile({}, noResolveFile), undefined);
    });

    it('should return correct status for match-to-skip', () => {
      assert.strictEqual(getConflicterStatusForFile({}, matchToSkipFile), 'skip');
    });
  });
});
