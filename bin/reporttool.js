var Sprint = require('../lib/sprint');
var async = require('async');
var debug = require('debug')('report');
var git = require('../lib/githubReports.js');
var processData = require('../lib/processData.js');
var path = require('path');
var util = require('util');
var _ = require('lodash');

if (process.argv.length != 4) {
  console.error('usage: githubtoken=<key> sl-github-report <orgfile> <sprint#>');
  console.error('');
  console.error('- key is your github API token, see the README');
  console.error('- orgfile could be server/loopback.json, or your own config');
  console.error('- sprint should be a number, like `61`');
  process.exit(1);
}

var orgFile = process.argv[2];
var sprintNumber = Number(process.argv[3]);
var sprint = Sprint(sprintNumber);

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
