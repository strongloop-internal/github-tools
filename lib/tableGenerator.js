var Table = require('cli-table');
var _ = require('lodash');
var async = require('async');

// instantiate milestone table
var milestoneTable = new Table({
  head: ['Milestone', 'Open', 'In Progress', 'Resolved'],
  colWidths: [40, 10, 15, 15]
});

//instantiate assignee table
var assigneeTable = new Table({
  head: ['Assignee', 'Open', 'In Progress', 'Resolved'],
  colWidths: [40, 10, 15, 15]
});

exports.populateIssueByMilstone = function(milestones, done){

  _.forEach(milestones, function(milestone, key){
    milestoneTable.push(milestone);
  });

  if(milestones.length)
    console.log('\n' + milestoneTable.toString());

  done();
};

exports.populateIssueByAssignee = function(assignees, done){
  _.forEach(assignees, function(assignee, key){
    assigneeTable.push(assignee);
  });

  if(assignees.length)
    console.log('\n' + assigneeTable.toString());
  else
    console.log('\n Assignee table not generated sonce no issues assigneed for the sprint');

  done();
};
