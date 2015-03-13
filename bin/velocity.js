#!/usr/bin/env node

'use strict';

var Sprint = require('../lib/sprint');
var _ = require('lodash');
var assert = require('assert');
var async = require('async');
var debug = require('debug')('github-tools:velocity');
var fmt = require('util').format;
var fs = require('fs');
var github = require('../lib/create-client');
var path = require('path');

var HELP = 'usage: velocity <user>/<repo>[/<issue>] | <project.json>';

var from = process.argv[2];

if (!from) {
  console.log(HELP);
  process.exit(1);
}

if (fs.existsSync(from))
  reportOnProject(from);
else
  reportOnRepos([from]);

function reportOnProject(from) {
  var repos = require(path.resolve(from)).repos;

  reportOnRepos(repos);
}

function reportOnRepos(repos) {
  async.waterfall([
    // Get issues
    function(callback) {
      async.concat(repos, getRepoIssues, function(err, issues) {
        if (err) callback(err);
        debug('total raw issue count: %d', issues.length);
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
    assert.ifError(err);
    report(issues);
  });

}

function report(issues) {
  var totalCount = issues.length;

  console.log('Report on %d issues', totalCount);

  // Fill in sprint numbers, and remove unused properties
  issues = _.map(issues, cleanup);

  if (debug.enabled)
    console.log('clean issue:', issues[0]);

  // Do sprint analysis
  issues = _.map(issues, setSprint);

  // Ignore issues that have not started
  var inactive = _.remove(issues, function(i) { return i._start == null; });
  var inactiveCount = inactive.length;

  var lines = _.map(issues, reduce);

  lines = _.flatten(lines);

  //console.log(lines);

  var data = _.reduce(lines, function(data, line) {
    var sprint = line[0];
    var category = line[1];
    var count = line[2];

    if (!data[sprint])
      data[sprint] = {};

    if (!data[sprint][category])
      data[sprint][category] = count;
    else
      data[sprint][category] += count;

    return data;
  }, {});

  console.log(data);
}

// Core reduction for analysis
function reduce(i) {
  var current = Sprint.current();
  var sprint = i._sprint;
  var start = i._start;
  var done = i._done;
  var lines = [];
  var type;
  var s;

  if (!start) {
    // Don't report on
    return lines;
  }

  if (i.pull_request && i.pull_request.url) {
    type = 'PR';
  } else if(i.labels.indexOf('bug') >= 0) {
    type = 'bug';
  } else {
    type = 'issue';
  }

  if (!done) {
    // Incomplete in every sprint from when it started to now
    for (s = start; s <= current; s++) {
      line(s, 'incomplete'); // XXX should call it PR/issue/bug
    }

    return lines;
  }

  // We are left with only issues that started, and are done

  // Incomplete in every sprint until it was done
  for (s = start; s < done; s++) {
    line(s, 'incomplete'); // XXX should call it PR/issue/bug
  }

  line(done, 'complete');

  return lines;

  function line(sprint, category, count) {
    if (count == null)
      count = 1;

    lines.push([sprint, category, count]);
    lines.push([sprint, category + ': ' + type, count]);
  }
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
      since: '2015-01-01', // FIXME '2014-11-01',
      page: page,
      per_page : 100
    }, function(err, res) {
      if (err) {
        console.error('%j: %j', repo, err);
        err.repo = _repo;
        return callback(err);
      }
      issues.push(res);

      if(res.length == 100){
        ++page;
        return getPage();
      }

      issues = _.flatten(issues);

      debug('%s: issues %d', _repo, issues.length);

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
      || e.event === 'unlabeled'
      || e.event === 'milestoned'
      || e.event === 'mentioned';
  });

  return JSON.parse(JSON.stringify(issue, replace));

  function replace(key, value) {
    if (/.*_url$/.test(key))
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

function setSprint(issue) {
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

  function started(sprint) {
    if (!start)
      start = sprint;
  }

  function finished(sprint) {
    if (!done)
      done = sprint;
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

  // We have two kinds of sprint labels, match them both:
  // - #sprint64
  // - sprint#65
  function num(sprint) {
    if (sprint)
      return /\d+$/.exec(sprint).pop();
  }

  return issue;
}
