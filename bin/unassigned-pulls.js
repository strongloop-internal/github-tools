#!/usr/bin/env node

/*
 * Example usage:
 *
 *  $ bin/unassigned-pulls.js config.json
 *
 * See `projects/loopback.json` for an example configuration.
 */

var fs = require('fs');
var async = require('async');
var github = require('../lib/create-client');

var configFile = process.argv[2];
if (!configFile) {
  console.log('Missing required argument <config.json>');
  printUsage();
}

var errors = [];

var projectConfig = JSON.parse(fs.readFileSync(configFile));
async.each(
  projectConfig.repos,
  queryRepository,
  function(err) {
    if (err) errors.push(err);
    if (errors.length) {
      console.error('\u001b[31m*** Failed ***');
      errors.forEach(function(e) { console.log(e); });
      console.log('\u001b[39m');
    } else {
      console.log('Done.');
    }
  }
);

function printUsage() {
  console.log();
  console.log('Usage:')
  console.log();
  console.log('    $ bin/unassigned-pulls.js <config.json>');
  console.log();
  process.exit(1);
}

function queryRepository(repo, done) {
  var segments = repo.split('/');
  var repoOwner = segments[0];
  var repoName = segments[1];

  if (!(repoOwner && repoName)) {
    var msg = 'Invalid repo `' + repo + '`:' +
      ' does not match `owner/name` format.';
    errors.push(new Error(msg));
    return done();
  }

  github.pullRequests.getAll(
    {
      per_page: 100,
      user: repoOwner,
      repo: repoName,
      state: 'open',
    }, function(err, pulls) {
      if (err) {
        err.action = 'pullRequests.getAll';
        err.repo = repoName;
        errors.push(err);
        return done();
      }

      async.each(
        pulls,
        function(pr, next) {
          checkPullRequest(repoOwner, repoName, pr, next);
        },
        done);
    });
}

function checkPullRequest(repoOwner, repoName, pr, done) {
  if (pr.assignee) return done();

  github.issues.getIssueLabels({
    user: repoOwner,
    repo: repoName,
    number: pr.number
  }, function(err, labels) {
    if (err) {
      err.action = 'issues.getIssueLabels';
      err.repo = repoName;
      err.pullId = pr.id;
      errors.push(err);
      return done();
    }

    var labelNames = labels.map(function(l) { return l.name; });
    console.log("%s %j", pr.html_url, labelNames);
    done();
  });
}
