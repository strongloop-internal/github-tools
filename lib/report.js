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

// Gateway timeout if request doesn't complete in this time (ms). Setting it to
// a HUGE number seems to avoid timeouts. I failed to track down the specific
// request that was timing out, and I also fail to see why the error isn't
// passed back to me via callback... I suspect that to be a bug.
github.config.timeout = 1000000;
// github.debug = true;

var report = exports;

exports.onProject = reportOnProject;
exports.onRepos = reportOnRepos;
exports.cleanup = cleanup;
exports.quota = {};

function reportOnProject(from, callback) {
  var repos = require(path.resolve(from)).repos;

  reportOnRepos(repos, callback);
}

function reportOnRepos(repos, callback) {
  async.waterfall([
    // Get issues
    function(callback) {
      debug('get issues...');
      async.concatSeries(repos, getRepoIssues, function(err, issues) {
        if (err) {
          callback(err);
        }
        debug('*/*: issues %d', issues.length);
        callback(err, issues);
      });
    },
    // Get events
    function(issues, callback) {
      debug('get events...');
      async.mapLimit(issues, 10, function(i, callback) {
        github.issues.getEvents({
          user: i._user,
          repo: i._repo,
          number: i.number,
        }, function(err, events) {
          if (err) {
            console.error('%s/%s#%d: %j', i._user, i._repo, i.number);
            err.repo = i._id;
            return callback(err);
          }
          i._events = events;
          return callback(err, i);
        });
      }, callback);
    },
  ], function(err, issues) {
    if (err) return callback(err, issues);

    console.log('Pre-analysis...');

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

  var PAGE = 100;

  function getPage() {
    github.issues.repoIssues({
      user: user,
      repo: repo,
      state: 'all',
      since: '2014-09-01',
      // since: '2015-02-01',
      page: page,
      per_page : PAGE
    }, function(err, res) {
      if (err) {
        console.error('repo %s: %j', _repo, err);
        err.repo = _repo;
        return callback(err);
      }
      issues.push(res);

      if(res.length > 0) { //== PAGE){
        ++page;
        console.log('%s: fetched %d on page %d...', _repo, res.length, page);

        var now = new Date();
        var remaining = res.meta ? +res.meta['x-ratelimit-remaining'] : 1;
        var reset = res.meta ? new Date(1000 * res.meta['x-ratelimit-reset']) : now;
        var delay = 0;

        if (!(remaining >= 1) && reset > now) {
          delay += reset - now;

          console.log('Throttled! remaining %d reset %s delay %d sec',
                      remaining, reset, delay/1000);
        }

        return setTimeout(getPage, delay);
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
        i._id = _repo + '#' + i.number;
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
  var rejected = null;
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
  // these, and mark the sprint they were committed in. Better would be to
  // detect the sprint in which they were rejected... XXX
  if (start && !committed()) {
    rejected = start;
    start = null;
  }

  start = num(start);
  done = num(done);
  rejected = num(rejected);

  debug('%s/%s#%d start %s done %s rejected %s',
        issue._user,
        issue._repo,
        issue.number,
        start,
        done,
        rejected);

  issue._start = start;
  issue._done = done;
  issue._rejected = rejected;

  return issue;

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
}
