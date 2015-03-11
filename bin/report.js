#!/usr/bin/env node

var Sprint = require('../lib/sprint');
var async = require('async');
var debug = require('debug')('report');
var git = require('../lib/githubReports.js');
var processData = require('../lib/processData.js');
var path = require('path');
var util = require('util');
var _ = require('lodash');

debug('current sprint: %s', Sprint.current());

var orgFile = process.argv[2];
var sprintNumber = Number(process.argv[3]) || Sprint.current();
var sprint = Sprint(sprintNumber);

debug('org: %s', orgFile);
debug('sprint: %s', sprint);

if (!orgFile || !sprint) {
  console.error('usage: report <orgfile> [sprint#]');
  console.error('');
  console.error('- orgfile: such as projects/nodeops.json');
  console.error('- sprint: a number, like `61` (defaults to current sprint)');
  process.exit(1);
}

console.log('start date: ' + sprint.start.format() + ', \nend date: ' + sprint.stop.format());
try {
  var orgMeta = require(path.resolve(orgFile));
} catch(er) {
  console.error('Failed to read orgfile `%s`:', orgFile, er);
  process.exit(1);
}

debug('org meta json:', orgMeta);

if (!(sprintNumber > 0)) {
  console.error('Sprint number `%s` is not a number', sprintNumber);
  process.exit(1);
}

var sprintLabel = util.format('#sprint%d', sprintNumber);

debug('sprint label: %s', sprintLabel);

var orgRepos = orgMeta.repos.map(function(repo) {
  return repo.split('/');
});

debug('org repos: %j', orgRepos);

// XXX async no longer necessary, but leave for now
var operations = [];
var repoMeta = {
  'username': '',
  'repository': '',
  'page': 1
};

var gitFetch = function(done){
  var repoIndex = 0;
  var repoCount = orgMeta.repos.length;
  console.log('\nTotal ' + repoCount + ' repositories');

  async.whilst(
    function () {
      return !git.rateLimit.isThrottled() && repoIndex < repoCount;
    },
    function (callback) {
    console.log('\nFetching issues for ' + orgRepos[repoIndex][1]);
      git.fetchGitIssues({
    'username': orgRepos[repoIndex][0],
    'repository': orgRepos[repoIndex][1],
    'page': 1,
    'startDate': sprint.start.format() },
    callback);

    repoIndex++;
    },
    function (err) {
      if(err){
      if(!repoIndex >= repoCount)
          console.log('Github ');
      console.error('err \n', err);
      }
      else{
      console.log('Total issuse received ', _.flatten(git.allRepoIssues).length);
        done();
      }
    }
  );
};

var dataProcessing = function(callback){
  console.log('\n Processing Data');
  async.parallel([function(done){
    processData.processMilestones({label: sprintLabel, sprint: sprint}, done);
  }, function(done){
    processData.processAssignees({label: sprintLabel, sprint: sprint}, done);
  }],function (err, results) {
    console.log('\nTotal ' + processData.totalIssuesResolved() + ' issues resovled for sprint ' + sprintNumber);
    callback();
  });
};

operations.push(gitFetch);
operations.push(dataProcessing);

async.series(operations, function (err, results) {
  if (err) {
    console.error('Not all operations completed', err);
  } else {
    console.log('All operations completed.');
  }
});
