var Client = require('github');
var github = new Client({
  version : '3.0.0'
});
var _ = require('lodash');
var debug = require('debug')('github');
var async = require('async');
var table = require('./tableGenerator.js');
var fs = require('fs');

var allRepoIssues = [];
exports.rateLimit = {
      remaining: 50,
      reset: new Date(Date.now()+60*60*1000),
      update: updateRateLimit,
      isThrottled: isThrottled
    };

function updateRateLimit(err, res) {
  if (err && !res) {
//    exports.rateLimit.remaining = 0;
  } else if (res.meta) {
    exports.rateLimit.remaining = 0|res.meta['x-ratelimit-remaining'];
    exports.rateLimit.reset = new Date(1000 * res.meta['x-ratelimit-reset']);
  }
}

function isThrottled() {
  return (exports.rateLimit.remaining < 1 &&
          exports.rateLimit.reset > new Date());
}

exports.allRepoIssues = allRepoIssues;
exports.fetchCollabs = fetchCollabs;
exports.fetchGitIssues = fetchGitIssues;

if (process.env.githubtoken) {
  github.authenticate({
    type : 'oauth',
    token : process.env.githubtoken
  });
} else {
  console.log('using github API without authentication');
}

function fetchGitIssues(repoMeta, done) {
  github.issues.repoIssues({
    user : repoMeta.username,
    repo : repoMeta.repository,
    state : 'all',
    since : repoMeta.startDate,
    page : repoMeta.page,
    per_page : 100
  }, function(err, res) {
    exports.rateLimit.update(err, res);
    if (err) {
      console.log('Error fetching issues for ' + repoMeta.repository + ' : ' + JSON.parse(err.message).message);
      done(null);
    } else {
      console.log('page ' + repoMeta.page + ' - ' + res.length + ' issues received');

      allRepoIssues.push(res);

      if(res.length == 100){
        ++repoMeta.page;
        exports.fetchGitIssues(repoMeta, done);
      } else {
	      debug('All issues: ', _.flatten(allRepoIssues).length);
	      done(null);
      }
    }
  });
};

function fetchCollabs(repoMeta, callback) {
  github.repos.getCollaborator({
    user : repoMeta.username,
      repo : repoMeta.repository,
      collabuser : repoMeta.user
      }, function(err, resp){
        if(err){
          console.log('err: ' + err);
          if(err.Status == "404 Not Found")
            callback(false);
          else
          callback(true);
        }
        else
          callback(true);
  });
};
