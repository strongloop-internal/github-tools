#!/usr/bin/env node

/*
 * Example usage:
 *
 *  $ sync config.json
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

var syncConfig = JSON.parse(fs.readFileSync(configFile));
async.each(
  syncConfig.repos,
  syncRepository,
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
  console.log('    $ sync <config.json>');
  console.log();
  process.exit(1);
}

function syncRepository(repo, done) {
  var segments = repo.split('/');
  var repoOwner = segments[0];
  var repoName = segments[1];

  if (!(repoOwner && repoName)) {
    var msg = 'Invalid repo `' + repo + '`:' +
      ' does not match `owner/name` format.';
    errors.push(new Error(msg));
    return done();
  }

  console.log('Syncing %s', repo);
  async.series([
    function(next) {
      syncRepositoryLabels(
        repoOwner, repoName,
        syncConfig.labels,
        next);
    },
    function(next) {
      syncRepositoryMilestones(
        repoOwner, repoName,
        syncConfig.milestones,
        next);
    }
  ], function(err) {
    if (err) {
      err.repo = repo;
      errors.push(err);
    }
    done();
  });
}

function syncRepositoryLabels(repoOwner, repoName, labelDefinitions, done) {
  github.issues.getLabels(
    {
      per_page: 100,
      user: repoOwner,
      repo: repoName
    }, function(err, existingLabels) {
      if (err) {
        err.action = 'issues.getLabels';
        err.repo = repoName;
        errors.push(err);
        return done();
      }

      async.each(
        Object.keys(labelDefinitions),
        function(labelName, next) {
          var ghLabel = {
            user: repoOwner,
            repo: repoName,
            name: labelName,
            color: labelDefinitions[labelName]
          };

          var cb = function(action) {
            return function(err) {
              if (err) {
                err.repo = repoName;
                err.action = action;
                err.labelName = labelName;
                errors.push(err);
              }
              next();
            };
          };

          if (!ghLabel.color) {
            // remove the label
            if (containsName(existingLabels, labelName)) {
              console.log('delete label %j', ghLabel);
              github.issues.deleteLabel(ghLabel, cb('delete'));
            } else {
              next();
            }
          } else {
            // create/update the label
            if (containsName(existingLabels, labelName)) {
              console.log('update label %j', ghLabel);
              github.issues.updateLabel(ghLabel, cb('update'));
            } else {
              console.log('create label %j', ghLabel);
              github.issues.createLabel(ghLabel, cb('create'));
            }
          }
        },
        done);
    });
}

function syncRepositoryMilestones(repoOwner, repoName, milestoneDefs, done) {
  github.issues.getAllMilestones({
    per_page: 100,
    user: repoOwner,
    repo: repoName
  }, function(err, githubMilestones) {
    if (err) {
      err.action = 'issues.getAllMilestones';
      err.repo = repoName;
      errors.push(err);
      return done();
    }

    async.each(
      Object.keys(milestoneDefs),
      function(milestoneTitle, next) {
        var definition = milestoneDefs[milestoneTitle];

        var cb = function(action) {
          return function(err) {
            if (err) {
              err.repo = repoName;
              err.action = action;
              err.milestoneTitle = milestoneTitle;
              errors.push(err);
            }
            next();
          };
        };

        var milestone = githubMilestones.filter(function(it) {
          return it.title === milestoneTitle;
        })[0];

        if (milestone) {
          milestone.user = repoOwner;
          milestone.repo = repoName;

          // remove properties not used by github-api
          delete milestone.labels_url;
          delete milestone.id;
          delete milestone.url;
          delete milestone.creator;
          delete milestone.open_issues;
          delete milestone.closed_issues;
          delete milestone.created_at;
          delete milestone.updated_at;
        }

        if (definition === false) {
          if (milestone) {
            if (milestone.state === 'open') {
              console.log('close milestone %j', milestone);
              milestone.state = 'closed';
              github.issues.updateMilestone(milestone, cb('close'));
            } else {
              console.log('skip already closed milestone %j', milestone);
              next();
            }
          } else {
            console.log('do not create a closed milestone %j', milestone);
            next();
          }
        } else if(definition === null) {
          github.issues.deleteMilestone(milestone, cb('delete'));
        } else {
          var dueTs = definition + 'T07:00:00Z'; // Midnight pacific time
          if (milestone) {
            if (milestone.due_on && milestone.due_on.substr(0, definition.length) == definition) {
              console.log('skip up-to-date milestone', milestone);
              next();
            } else {
              milestone.due_on = dueTs;
              console.log('update milestone', milestone);
              github.issues.updateMilestone(milestone, cb('update'));
            }
          } else {
            milestone = {
              user: repoOwner,
              repo: repoName,
              title: milestoneTitle,
              due_on: dueTs
            };
            console.log('create milestone', milestone);
            github.issues.createMilestone(milestone, cb('create'));
          }
        }
      },
      done);
  });
}

function containsName(list, name) {
  return list.some(function(it) { return it.name === name; });
}
