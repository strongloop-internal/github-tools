var _ = require('lodash');
var debug = require('debug')('process');
var async = require('async');
var table = require('./tableGenerator.js');
var fs = require('fs');
var git = require('./githubReports.js');

exports.processMilestones = processMilestones;
exports.processAssignees = processAssignees;
exports.totalIssuesResolved = totalIssuesResolved;

var totalResolved = 0;
var uncategorizedIssues = [];
var milestones = {
  "Issues without milestones" : {
    "openIssues" : 0,
    "InProgress" : 0,
    "Resolved" : 0
  },
  "Bugs" : {
    "openIssues" : 0,
    "InProgress" : 0,
    "Resolved" : 0
  },
  "Community contribution" : {
  "openIssues" : 0,
  "InProgress" : 0,
    "Resolved" : 0
  }
};

var assignees = {};

function processMilestones(config, done) {
  var sprint = config.sprint;
  git.allRepoIssues = _.flatten(git.allRepoIssues);
  if (process.env.DEBUG) {
    fs.writeFileSync('allRepoIssues.json', JSON.stringify(git.allRepoIssues, null, 4));
    debug('allRepoIssues written to `allRepoIssues.json`');
  }

  async.each(git.allRepoIssues, function(issue, done) {
  var isDone = true;
  if (issue.milestone){
      var isNewMilestone = false;
      // Add new milestone
      if (!milestones[issue.milestone.title]) {
        milestones[issue.milestone.title] = {
          "openIssues" : 0,
          "InProgress" : 0,
          "Resolved" : 0
        };
      isNewMilestone = true;
      }

      if(milestones[issue.milestone.title]){

        if (issue.state == "open" && sprint.includes(issue.updated_at)) {

          if(_.where(issue.labels, {'name' : config.label}).length > 0){

            ++milestones[issue.milestone.title].openIssues;

            if(checkCommunityContribLabel(issue.labels, '#community contribution'))
              ++milestones['Community contribution'].openIssues;

            if(_.where(issue.labels, {'name' : 'bug'}).length > 0)
              ++milestones['Bugs'].openIssues;
          }
          else if (_.where(issue.labels, {'name' : '#wip'}).length > 0) {

            ++milestones[issue.milestone.title].InProgress;

            if(checkCommunityContribLabel(issue.labels, '#community contribution'))
              ++milestones['Community contribution'].InProgress;

            if (_.where(issue.labels, {'name' : 'bug'}).length > 0)
              ++milestones['Bugs'].InProgress;
          }
          else if((_.where(issue.labels, {'name' : '#verify'}).length > 0 || _.where(issue.labels, {'name' : '#tbr'}).length > 0)){

            ++milestones[issue.milestone.title].Resolved;

            if(checkCommunityContribLabel(issue.labels, '#community contribution'))
              ++milestones['Community contribution'].Resolved;

            if (_.where(issue.labels, {'name' : 'bug'}).length > 0)
              ++milestones['Bugs'].Resolved;
          }
          else{
            if(issue.pull_request){
              if(checkCommunityContribLabel(issue.labels, '#community contribution'))
                    ++milestones['Community contribution'].openIssues;
              else{
                isDone = false;
                var repoInfo = issue.url.split('/');
                git.fetchCollabs({username: repoInfo[4], repository: repoInfo[5], user: issue.user.login }, function(collabExists){
                  if(!collabExists)
                    ++milestones['Community contribution'].openIssues;

                    done();
                  });
                }
            }

          if(checkCommunityContribLabel(issue.labels, '#community contribution'))
                  ++milestones['Community contribution'].openIssues;

          if (_.where(issue.labels, {'name' : 'bug'}).length > 0)
            ++milestones['Bugs'].openIssues;

          milestoneCleanup(issue.milestone.title, issue.number);
        }
      } else if (issue.state == 'closed' && sprint.includes(issue.closed_at)) {

            if(issue.pull_request){
                if(checkCommunityContribLabel(issue.labels, '#community contribution'))
                      ++milestones['Community contribution'].Resolved;
                else{
                  isDone = false;
                  var repoInfo = issue.url.split('/');
                 git.fetchCollabs({username: repoInfo[4], repository: repoInfo[5], user: issue.user.login }, function(collabExists){
                  if(!collabExists)
                  ++milestones['Community contribution'].Resolved;

                  done();
                });
                }
              }

          ++milestones[issue.milestone.title].Resolved;

          if (_.where(issue.labels, {'name' : 'bug'}).length > 0)
            ++milestones['Bugs'].Resolved;
        }
        else if(isNewMilestone){
          milestoneCleanup(issue.milestone.title, issue.number);
        }
        else{
          uncategorizedIssues.push(issue.number);
        }
      }
      else{
        milestoneCleanup(issue.milestone.title, issue.number);
      }
    } else {
        /*
         * if no milestone is associated with the issue
         */
      if ( issue.state == 'open' && sprint.includes(issue.updated_at)) {
        if(_.where(issue.labels, {'name' : config.label}).length > 0){

          if(issue.pull_request){
                  if(checkCommunityContribLabel(issue.labels, '#community contribution'))
                        ++milestones['Community contribution'].openIssues;
                  else{
                    isDone = false;
                    var repoInfo = issue.url.split('/');
                   git.fetchCollabs({username: repoInfo[4], repository: repoInfo[5], user: issue.user.login }, function(collabExists){
                    if(!collabExists)
                    ++milestones['Community contribution'].openIssues;

                    done();
                  });
                  }
                }

        ++milestones['Issues without milestones'].openIssues;

            if (_.where(issue.labels, {'name' : 'bug'}).length > 0)
              ++milestones['Bugs'].openIssues;
          }
        else if (_.where(issue.labels, {'name' : '#wip'}).length > 0) {

        ++milestones['Issues without milestones'].InProgress;

            if (_.where(issue.labels, {'name' : 'bug'}).length > 0)
              ++milestones['Bugs'].InProgress;

            if(checkCommunityContribLabel(issue.labels, '#community contribution'))
              ++milestones['Community contribution'].InProgress;
          }
        else if(_.where(issue.labels, {'name' : '#verify'}).length > 0 || _.where(issue.labels, {'name' : '#tbr'}).length > 0){

          ++milestones['Issues without milestones'].Resolved;

          if (_.where(issue.labels, {'name' : 'bug'}).length > 0)
        ++milestones['Bugs'].Resolved;

      if(checkCommunityContribLabel(issue.labels, '#community contribution'))
          ++milestones['Community contribution'].Resolved;
        }
        else{
            if(issue.pull_request){
              if(checkCommunityContribLabel(issue.labels, '#community contribution'))
                    ++milestones['Community contribution'].openIssues;
              else{
                isDone = false;
                var repoInfo = issue.url.split('/');
               git.fetchCollabs({username: repoInfo[4], repository: repoInfo[5], user: issue.user.login }, function(collabExists){
                if(!collabExists)
                ++milestones['Community contribution'].openIssues;

                done();
              });
              }
            }

            if (_.where(issue.labels, {'name' : 'bug'}).length > 0)
              ++milestones['Bugs'].openIssues;
        }
      }
      else if (issue.state == 'closed' && sprint.includes(issue.closed_at)) {
          if(issue.pull_request ){
          if(checkCommunityContribLabel(issue.labels, '#community contribution'))
              ++milestones['Community contribution'].Resolved;
          else{
            isDone = false;
              var repoInfo = issue.url.split('/');
              git.fetchCollabs({username: repoInfo[4], repository: repoInfo[5], user: issue.user.login }, function(collabExists){
                if(!collabExists)
                ++milestones['Community contribution'].Resolved;

                 done();
              });
          }
          }

        ++milestones['Issues without milestones'].Resolved;

        if(_.where(issue.labels, {'name' : 'bug'}).length > 0)
        ++milestones['Bugs'].Resolved;
        }
        else{
        uncategorizedIssues.push(issue.number);
        }
    }

  if(isDone)
      done();

  }, function(err) {
    if (err)
      console.log(err);

    debug('\n' + uncategorizedIssues.length + ' Uncategorized Issues');

    var tableData = _.map(milestones, function(obj, key) {
      var tableRecord = [];
      tableRecord[0] = key;
      tableRecord[1] = obj.openIssues;
      tableRecord[2] = obj.InProgress;
      tableRecord[3] = obj.Resolved;

      if(key != 'Bugs' && key != 'Community contribution')
      totalResolved += obj.Resolved;

      return tableRecord;
    });

    table.populateIssueByMilstone(tableData.sort(), done);
  });
};

function processAssignees(config, callback) {
  var sprint = config.sprint;
  async.each(_.flatten(git.allRepoIssues), function(issue, done) {
    var isNewAssignee = false;
  // Add new assignee
    if (issue.assignee) {
      if (!assignees[issue.assignee.login]) {
        assignees[issue.assignee.login] = {
          "openIssues" : 0,
          "InProgress" : 0,
          "Resolved" : 0
        };
        isNewAssignee = true;
      }

      // sprint label check
      if (issue.state == 'open' && _.where(issue.labels, {'name' : config.label}).length > 0) {
        ++assignees[issue.assignee.login].openIssues;
      } else if (_.where(issue.labels, {'name' : '#wip'}).length > 0 && sprint.includes(issue.closed_at)) {
        ++assignees[issue.assignee.login].InProgress;
      } else if ((issue.state == 'closed' && sprint.includes(issue.closed_at)) || ((_.where(issue.labels, {'name' : '#verify'}).length > 0
        || _.where(issue.labels, {'name' : '#tbr'}).length > 0) && sprint.includes(issue.closed_at))) {

        ++assignees[issue.assignee.login].Resolved;
      }
      else if(isNewAssignee){
      // remove the added assignee, if an issue for assignee doesn't staisfy above conditions
      delete assignees[issue.assignee.login];
      }
    }
    done();
  }, function(err) {
    var tableData = _.map(assignees, function(obj, key) {
      var tableRecord = [];
      tableRecord[0] = key;
      tableRecord[1] = obj.openIssues;
      tableRecord[2] = obj.InProgress;
      tableRecord[3] = obj.Resolved;

      return tableRecord;
    });

    table.populateIssueByAssignee(tableData.sort(), callback);
  });
};

// remove the added milestone, if an open issue has labels associated other than above labels like #review etc.
function milestoneCleanup(milestoneName, milestoneNumber){
  delete milestones[milestoneName];
  uncategorizedIssues.push(milestoneNumber);
}

function checkCommunityContribLabel(labels, labelName){
  return (_.where(labels, {'name' : '#community contribution'}).length > 0);
}

function totalIssuesResolved(){
  return totalResolved;
};
