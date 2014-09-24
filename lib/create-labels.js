/*

Example usage:

First edit `labels.txt`...

OWNER=strongloop-internal \
LBL_COLOR=ff0000 \
REPO=scrum-nodeops \
GH_USERNAME=ritch \
GH_PASSWORD=******** \
node create-labels.js

*/

var path = require('path');
var github = require('./create-client');
var async = require('async');
var OWNER = process.env.OWNER;
var REPOS = [ process.env.REPO ];
var LBL_COLOR = process.env.LBL_COLOR;
var fs = require('fs');
var content = fs.readFileSync(path.join(__dirname, 'labels.txt'), 'utf8');
var labelsToCreate = content.split('\n');
if(!labelsToCreate[labelsToCreate.length - 1]) {
  labelsToCreate.pop();
}

if (!OWNER)
  OWNER = process.argv[2];

if (!REPOS[0])
  REPOS = process.argv.slice(3);

if (!OWNER || !REPOS.length) {
  console.log(
    'usage: GH_USERNAME=who GH_PASSWORD=pass create-labels ORG REPO...');
  process.exit(1);
}

console.log('organization:', OWNER);
console.log('repos:', REPOS);

async.each(REPOS, function(REPO, cb) {
  console.log('doing %s/%s...', OWNER, REPO);
  github.issues.getLabels({
    user: OWNER,
    repo: REPO
  }, function(err, labels) {
    if (err) {
      console.log('%s/%s fail:', OWNER, REPO, err);
      throw err;
    }
    var names = labels.map(function(label) {
      return label.name;
    });

    console.log('create:', labelsToCreate);
    console.log('existing:', names);

    async.each(labelsToCreate, function(labelName, cb) {
      var label = {
        user: OWNER,
        repo: REPO,
        name: labelName,
        color: LBL_COLOR || '006b75'
      };
      if (names.indexOf(labelName) === -1)
        github.issues.createLabel(label, cb);
      else
        github.issues.updateLabel(label, cb);
    }, cb);
  });
}, function() {
  console.log(arguments);
});
