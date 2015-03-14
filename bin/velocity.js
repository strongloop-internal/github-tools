#!/usr/bin/env node

'use strict';

var Sprint = require('../lib/sprint');
var _ = require('lodash');
var assert = require('assert');
var debug = require('debug')('github-tools:velocity');
var fs = require('fs');
var report = require('../lib/report');
var util = require('util');

var HELP = 'usage: velocity <user>/<repo>[/<issue>] | <project.json>';

var from = process.argv[2];

if (!from) {
  console.log(HELP);
  process.exit(1);
}

if (fs.existsSync(from))
  report.onProject(from, build);
else
  report.onRepos([from], build);

function build(err, issues) {
  assert.ifError(err);

  var totalCount = issues.length;

  if (issues.length === 1)
    console.log(util.inspect(issues[0], {depth: null}));

  var lines = _.map(issues, count);

  lines = _.flatten(lines);

  var graph = _.reduce(lines,  reduce, {});

  if (debug.enabled)
    console.log(util.inspect(graph, {depth: null, colors: false}));

  console.log('Report on %d total issues', totalCount);

  Object.keys(graph).sort().forEach(function(sprint) {
    console.log('Sprint: %d', sprint);
    Object.keys(graph[sprint]).sort().forEach(function(category) {
      var c = graph[sprint][category];
      console.log('    %s: %d', category, c.count);
      Object.keys(c).sort().forEach(function(repo) {
        if (repo === 'count') return;
        console.log('        %s: %j', repo, c[repo]);
      });
    });
  });

  console.log('');
  console.log('incomplete: committed in this sprint, but not done');
  console.log('complete: done in this sprint');
  console.log('rejected: committed in this sprint, but re-backlogged');
}

// Core reduction for analysis
function count(i) {
  var current = Sprint.current();
  var start = i._start;
  var done = i._done;
  var rejected = i._rejected;
  var lines = [];
  var type;
  var s;

  // Classify the issue type for reporting purposes:
  //
  // XXX more work could be done here:
  //
  // - internal vs external
  //
  // - collab vs non-collab
  //
  // - committed backlog (has an effort estimate) vs 'other'
  //
  // - PRs should have their 'description'/body searched for a 'connected to'
  // link. If they are connected to something else, particularly to a comitted
  // backlog item, we should either not report them, or report them in a
  // category different from 'other' PRs
  if (i.pull_request && i.pull_request.url) {
    type = 'PR';
  } else if(i.labels.indexOf('bug') >= 0) {
    type = 'bug';
  } else {
    type = 'issue';
  }


  // Issues have:
  // - start: the first sprint they were out of backlog
  // - done: the first sprint they were `#tbr` or Closed
  // - rejected: the first sprint a currently backlogged item was scheduled in
  //
  //
  // Valid combinations of (start,done):
  //
  // (null, null): not started
  // (#, null): in-progress
  // (#, #): finished

  if (rejected) {
    line(rejected, 'rejected');
    return lines;
  }

  // Not started - ignore.
  if (!start) {
    return lines;
  }

  // In-progress: incomplete in every sprint from their start sprint to the
  // current sprint
  if (!done) {
    for (s = start; s <= current; s++) {
      line(s, 'incomplete');
    }

    return lines;
  }

  // Finished: incomplete in every sprint up until the sprint in which it was
  // done
  for (s = start; s < done; s++) {
    line(s, 'incomplete');
  }

  line(done, 'complete');

  return lines;

  function line(sprint, category, count) {
    if (count == null)
      count = 1;

    lines.push([sprint, category, count]);
    lines.push([sprint, category + ', ' + type, count, i]);
  }
}

function reduce(data, line) {
  var sprint = line[0];
  var category = line[1];
  var count = line[2];
  var issue = line[3];

  if (!data[sprint])
    data[sprint] = {};

  var c = data[sprint][category];
  if (!c)
    c = data[sprint][category] = { count: count };
  else 
    c.count += count;

  if (issue) {
    var r = c[issue._repo] || (c[issue._repo] = []);
    r.push(issue.number);
    r.sort();
  }

  return data;
}
