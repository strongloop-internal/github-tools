#!/usr/bin/env node

'use strict';

var Sprint = require('../lib/sprint');
var _ = require('lodash');
var assert = require('assert');
var async = require('async');
var debug = require('debug')('github-tools:issue-hist');
var github = require('../lib/create-client');


var from = process.argv[2];
var num = process.argv[3];

if (!from || !num) {
  console.log('usage: node %s ORG/REPO NUM', process.argv[1]);
  process.exit(1);
}

var repo = from.split('/')[1];
var user = from.split('/')[0];

console.log('Get %s/%s # %s', user, repo, num);

async.parallel({
  issue: getIssue,
  events: getEvents,
}, function(err, r) {
  assert.ifError(err);
  var issue = strip(r.issue);
  var events = strip(r.events);

  _.remove(events, function(e) {
    return e.event === 'renamed'
      || e.event === 'subscribed'
      || e.event === 'assigned'
      || e.event === 'unassigned'
      || e.event === 'unlabeled'
      || e.event === 'milestoned'
      || e.event === 'mentioned';
  });

  delete issue.user;
  delete issue.labels;
  delete issue.assignee;
  delete issue.locked;
  delete issue.comments;
  delete issue.body;
  delete issue.closed_by;

  console.log(issue);
  console.log(events);

  // First time we see something in any of these states, its started:
  // - #sprintXX: @chanda, I recommend we replace #sprintXX with #committed
  // - #wip
  // - #review
  // - #verify: unusual for something to go straight to verify/tbr, but still...
  // - #tbr
  //
  // First time we see something in any of these states, its done:
  // - closed
  // - #tbr
  //
  // Something that has done but no start is an issue that was closed before
  // we did it.
  //
  // If something is started, then goes back into backlog, clear its start
  // date?
  //
  // example: strongloop/strong-pm 98
  //
  // Things that are hard:
  //
  // - distinguishing between committed backlog, and things that just got
  //   done
  // - correlating between PRs and their related issues.
  //
  // If we start using effort estimates, we can distinguish these things,
  // because only comitted backlog will have estimates.
  var start = null;
  var done = null;
  _.each(events, function(e) {
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

  function started(sprint) {
    if (!start)
      start = sprint;
  }

  function finished(sprint) {
    if (!done)
      done = sprint;
  }

  console.log('http://github.com/%s/%s#%d %s..%s', user, repo, num, start, done);
});

function getIssue(callback) {
  github.issues.getRepoIssue({
    user: user,
    repo: repo,
    number: num
  }, callback);
}

function getEvents(callback) {
  github.issues.getEvents({
    user: user,
    repo: repo,
    number: num
  }, callback);
}

function strip(issue) {
  if (debug.enabled)
    console.log('Issue:', issue);

  delete issue.meta;
  return JSON.parse(JSON.stringify(issue, replace));

  function replace(key, value) {
    if (/.*url$/.test(key))
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
