'use strict';
var path = require('path');
var gulp = require('gulp');
var mocha = require('gulp-mocha');
var jshint = require('gulp-jshint');
var jscs = require('gulp-jscs');
var istanbul = require('gulp-istanbul');
var coveralls = require('gulp-coveralls');
var gutil = require('gulp-util');

gulp.task('static', function () {
  return gulp.src([
    'test/*.js',
    'lib/**/*.js',
    'benchmark/**/*.js',
    'gulpfile.js'
  ])
  .pipe(jshint())
  .pipe(jshint.reporter('jshint-stylish'))
  .pipe(jshint.reporter('fail'))
  .pipe(jscs())
  .pipe(jscs.reporter())
  .pipe(jscs.reporter('fail'))
  .on('error', gutil.log);
});

gulp.task('test', function (cb) {
  gulp.src(['lib/**/*.js'])
  .pipe(istanbul({ includeUntested: true }))
  .on('finish', function () {
    gulp.src(['test/*.js'], { read: false })
      .pipe(mocha({ reporter: 'spec' }))
      .on('error', gutil.log)
      .pipe(istanbul.writeReports())
      .on('end', cb);
  });
});

gulp.task('coveralls', ['test'], function () {
  if (!process.env.CI) return;
  return gulp.src(path.join(__dirname, 'coverage/lcov.info'))
    .pipe(coveralls());
});

gulp.task('default', ['static', 'test', 'coveralls']);
