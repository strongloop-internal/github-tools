#!/usr/bin/env node

'use strict';

var Sprint = require('../lib/sprint');
var _ = require('lodash');
var assert = require('assert');
var async = require('async');
var debug = require('debug')('github-tools:report');
var fmt = require('util').format;
var github = require('../lib/create-client');
var path = require('path');

var report = exports;

exports.onProject = reportOnProject;
exports.onRepos = reportOnRepos;
exports.cleanup = cleanup;

function reportOnProject(from, callback) {
  var repos = require(path.resolve(from)).repos;

  reportOnRepos(repos, callback);
}

function reportOnRepos(repos, callback) {
  async.waterfall([
    // Get issues
    function(callback) {
      async.concat(repos, getRepoIssues, function(err, issues) {
        if (err) callback(err);
        debug('*/*: issues %d', issues.length);
        callback(err, issues);
      });
    },
    // Get events
    function(issues, callback) {
      async.map(issues, function(i, callback) {
        github.issues.getEvents({
          user: i._user,
          repo: i._repo,
          number: i.number,
        }, function(err, events) {
          i._events = events;
          return callback(err, i);
        });
      }, callback);
    },
  ], function(err, issues) {
    if (err) return callback(err, issues);

    issues = _.map(issues, cleanup);
    issues = _.map(issues, analyzeSprint);

    if (debug.enabled)
      console.log('prepared issue:', issues[0]);

    callback(null, issues);
  });
}

function getRepoIssues(_repo, callback) {
  debug('get issues for %j', _repo);

  var split = _repo.split('/');

  var user = split[0];
  var repo = split[1];
  var num = split[2];

  assert(user, _repo);
  assert(repo, _repo);

  var page = 0;
  var issues = [];

  getPage();

  function getPage() {
    github.issues.repoIssues({
      user: user,
      repo: repo,
      state: 'all',
      // FIXME since: '2014-11-01',
      since: '2015-02-01',
      page: page,
      per_page : 100
    }, function(err, res) {
      if (err) {
        console.error('repo %s: %j', _repo, err);
        err.repo = _repo;
        return callback(err);
      }
      issues.push(res);

      if(res.length == 100){
        ++page;
        console.log('%s: fetched page %d...', _repo, page);
        return getPage();
      }

      issues = _.flatten(issues);

      console.log('%s: fetched %d issues', _repo, issues.length);

      if (num) {
         _.remove(issues, function(i) {
           return i.number != num;
        });

        assert(issues.length <= 1);

        if (debug.enabled) console.log(issues[0]);
      }

      // Annotate with user/repo: its not easily pulled from the issue
      _.each(issues, function(i) {
        i._user = user;
        i._repo = repo;
        i._id = repo + '#' + i.number;
      });

      return callback(null, issues);
    });
  }
}

function cleanup(issue) {
  _.remove(issue._events, function(e) {
    return e.event === 'renamed'
      || e.event === 'subscribed'
      || e.event === 'assigned'
      || e.event === 'unassigned'
      || e.event === 'milestoned'
      || e.event === 'mentioned';
  });

  debug('cleanup %s', issue._id);

  return JSON.parse(JSON.stringify(issue, replace));

  function replace(key, value) {
    if (/.*_url$/.test(key))
      return undefined;
    if ('url' == key && /issues.events/.test(value))
      return undefined;
    if (/.*id/.test(key))
      return undefined;
    if (/.*Z/.test(value))
      return 'sprint#' + Sprint.current(value);
    if (value && value.name && value.color)
      return value.name;
    if (key === 'actor')
      return undefined;
    return value;
  }
}

function analyzeSprint(issue) {
  var start = null;
  var done = null;
  _.each(issue._events, function(e) {
    switch (e.event) {
      case 'closed': finished(e.created_at); break;
      case 'labeled': {
        switch (e.label) {
          case '#wip': started(e.created_at); break;
          case '#review': started(e.created_at); break;
          case '#verify': started(e.created_at); break;
          case '#tbr': finished(e.created_at); break;
          case '#tob': start = null; break;
          case '#plan': start = null; break;
          default:
            // XXX the label might be applied before the sprint started, so
            // use the label value, not the create time.
            if (/#sprint\d+/.test(e.label)) started(e.label);
        }
      } break;
    }
  });

  function committed() {
    return done || tbr() || verify() || review() || wip() || inSprint();
  }

  function tbr() { return issue.labels.indexOf('#tbr') >= 0; }
  function verify() { return issue.labels.indexOf('#verify') >= 0; }
  function review() { return issue.labels.indexOf('#review') >= 0; }
  function wip() { return issue.labels.indexOf('#wip') >= 0; }

  function inSprint() {
    return _.any(issue.labels, function(l) {
      return /sprint/.test(l);
    });
  }

  finished(issue.closed_at);

  // Analysis fails for issues that were in backlog, but then rejected.  Detect
  // these, and just mark what we did. Better would be to detect the sprint
  // in which they were rejected... TBD
  if (start && !committed()) {
    issue._rejected = start;
    start = null;
  }

  debug('%s/%s#%d start %s done %s',
        issue._user,
        issue._repo,
        issue.number,
        start,
        done);

  if (!start)
    return issue;

  issue._start = num(start);
  issue._done = num(done);
  issue._sprint = num(done || Sprint.current());

  function started(sprint) {
    if (!start)
      start = sprint;
  }

  function finished(sprint) {
    if (!done)
      done = sprint;
  }

  // We have two kinds of sprint labels, match them both:
  // - #sprint64
  // - sprint#65
  function num(sprint) {
    if (sprint)
      return /\d+$/.exec(sprint).pop();
  }

  return issue;
}
