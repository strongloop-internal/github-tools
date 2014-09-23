/*

Example usage:

First edit `labels.txt`...

LBL_COLOR=ff0000 REPO=scrum-nodeops GH_USERNAME=ritch GH_PASSWORD=******** node create-labels.js

*/

var path = require('path');
var github = require('./create-client');
var async = require('async');
var USER = 'strongloop-internal';
var REPO = process.env.REPO;
var LBL_COLOR = process.env.LBL_COLOR;
var fs = require('fs');
var content = fs.readFileSync(path.join(__dirname, 'labels.txt'), 'utf8');
var labelsToCreate = content.split('\n');
if(!labelsToCreate[labelsToCreate.length - 1]) {
  labelsToCreate.pop();
}

github.issues.getLabels({
  user: USER,
  repo: REPO
}, function(err, labels) {
  var names = labels.map(function(label) {
    return label.name;
  });

  labelsToCreate = labelsToCreate.filter(function(name) {
    return names.indexOf(name) === -1;
  });

  console.log(labelsToCreate);

  async.each(labelsToCreate, function(labelName, cb) {
    github.issues.createLabel({
      user: USER,
      repo: REPO
      name: labelName,
      color: LBL_COLOR || '006b75'
    }, cb);
  }, function() {
    console.log(arguments);
  });
});


