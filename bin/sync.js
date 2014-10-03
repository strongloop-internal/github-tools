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

var syncConfig = JSON.parse(fs.readFileSync(configFile));
async.each(
  syncConfig.projects,
  function(project, next) {
    syncProjectLabels(project, syncConfig.labels, next);
  },
  function(err) {
    if (err) {
      console.error('\u001b[31m*** Failed ***\n', err, '\u001b[39m');
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

function syncProjectLabels(project, labelDefinitions, done) {
  var segments = project.split('/');
  var owner = segments[0];
  var repo = segments[1];

  if (!(owner && repo)) {
    var msg = 'Invalid project `' + project + '`:' +
      ' does not match `owner/repo` format.';
    return done(new Error(msg));
  }

  console.log('Syncing %s', project);
  github.issues.getLabels(
    {
      user: owner,
      repo: repo
    }, function(err, existingLabels) {
      if (err) {
        err.action = 'issues.getLabels';
        err.project = project;
        return done(err);
      }

      async.each(
        Object.keys(labelDefinitions),
        function(labelName, next) {
          var ghLabel = {
            user: owner,
            repo: repo,
            name: labelName,
            color: labelDefinitions[labelName]
          };

          var cb = function(action) {
            return function(err) {
              if (err) {
                err.action = action;
                err.project = project;
                err.labelName = labelName;
              }
              next(err);
            };
          };

          if (!ghLabel.color) {
            // remove the label
            if (containsName(existingLabels, labelName)) {
              console.log('delete %j', ghLabel);
              github.issues.deleteLabel(ghLabel, cb('delete'));
            } else {
              next();
            }
          } else {
            // create/update the label
            if (containsName(existingLabels, labelName)) {
              console.log('update %j', ghLabel);
              github.issues.updateLabel(ghLabel, cb('update'));
            } else {
              console.log('create %j', ghLabel);
              github.issues.createLabel(ghLabel, cb('create'));
            }
          }
        },
        done);
    });
}

function containsName(list, name) {
  return list.some(function(it) { return it.name === name; });
}
