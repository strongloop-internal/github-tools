#!/usr/bin/env node

// cacheing
//   https://github.com/philschatz/octokat.js/issues/38
//   https://github.com/philschatz/octokat.js/issues/38#issuecomment-116799519

'use strict';

var Octokat = require('octokat');
var Parser = require('posix-getopt').BasicParser;
var Sprint = require('../lib/sprint');
var _ = require('lodash');
var assert = require('assert');
var async = require('async');
var debug = require('debug')('scrum');
var fs = require('fs');
var fmt = require('util').format;
var path = require('path');
var request = require('request');
var url = require('url');

var $0 = path.basename(process.argv[1]);

function usage(prn) {
  var USAGE = fs.readFileSync(require.resolve('./scrum.txt'), 'utf-8')
    .replace(/%MAIN%/g, $0)
    .trim();

  prn(USAGE);
}

var commands = {
  report: doReport,
  'get-projects': doGetProjects,
  'get-cards': doGetCards,
  help: doHelp,
};

var command = process.argv[2] || 'help';

(commands[command] || doUnknown)(3); // 3 is index of next unused option

function doHelp() {
  usage(console.log);
  process.exit(0);
}

function doUnknown() {
  console.error('No such command');
  usage(console.error);
  process.exit(1);
}

function doGetProjects() {
  getProjects();
}

function doGetCards(optind) {
  var scrum = process.argv[optind++];

  if (!scrum) {
    console.error('get-cards requires scrum');
    usage(console.error);
    process.exit(1);
  }

  getCards(scrum);
}

function doReport(optind) {
  var options = {
    fromSprint: Sprint.current(),
  };

  options.scrum = process.argv[optind++];

  if (!options.scrum) {
    console.error('%s report: requires scrum to be specified', $0);
    usage(console.error);
    process.exit(1);
  }

  var parser = new Parser([
    ':',
    'i(issues)',
    'c(closed)',
    'f:(from)',
    'm:(milestone)',
  ].join(''), process.argv, optind);

  var option;

  while ((option = parser.getopt()) !== undefined) {
    switch (option.option) {
      case 'i': options.withIssues = true; break;
      case 'c': options.onlyClosed = true; break;
      case 'f': options.fromSprint = option.optarg | 0; break;
      case 'm': options.milestone = option.optarg; break;
      default:
        console.error('Invalid report option at', option.getopt);
        usage(console.error);
        process.exit(1);
    }
  }

  optind = parser.optind();

  var auth = {};
  try {
    auth = require(path.resolve('.auth.json'));
  } catch(er) {
  }
  var user = process.env.GITHUB_USERNAME || auth.username;
  var pass = process.env.GITHUB_PASSWORD || auth.password;

  debug('login with %j and %j', user, pass);

  if (!user || !pass) {
    console.error('username or password not configured');
    usage(console.error);
    process.exit(1);
  }

  options.octo = new Octokat({
    username: user,
    password: pass,
  });

  reportCommand(options);
}


function getProjects() {
  var url = 'https://api.waffle.io/user/projects';
  console.log('Query sources from:', url);
  getWaffle(url, function(err, projects) {
    assert.ifError(err);

    if (debug.enabled) {
      fs.writeFileSync('sources.json', JSON.stringify(projects, null, 2) + '\n');
    }

    async.each(projects, function(project, done) {
      var match = /^strongloop-internal\/scrum-(.*)$/.exec(project.name);
      if (!match) return done();
      var name = match[1];
      console.log('Saving project:', name);
      var sources = _.pluck(project.sources, 'repoPath').sort();
      var json = JSON.stringify(sources, null, 2) + '\n';
      var file = path.resolve(__dirname, '..', 'sources', name + '.json');
      fs.writeFile(file, json, done);
    }, assert.ifError);
  });
}

function getCards(scrum) {
  var url = fmt('https://api.waffle.io/strongloop-internal/scrum-%s/cards', scrum); 
  console.log('Query sources from:', url);
  getWaffle(url, function(err, cards) {
    assert.ifError(err);

    var sizes = sorted(cards.reduce(function(sizes, card) {
      sizes[card.githubMetadata.url] = card.size;
      return sizes;
    }, {}));
    console.log('Saving cards for:', scrum);
    var json = JSON.stringify(sizes, null, 2) + '\n';
    var file = path.resolve(__dirname, '..', 'cards', scrum + '.json');
    fs.writeFile(file, json, assert.ifError);
  });
}

// V8 serializes objects in order of key insertion, abuse this fact to get
// stable object serialization.
function sorted(obj) {
  var sortedObj = {};
  Object.keys(obj).sort().forEach(function(key) {
    sortedObj[key] = obj[key];
  });
  return sortedObj;
}

function getWaffle(url, callback) {
  var auth = {};
  try {
    auth = require(path.resolve('.auth.json'));
  } catch(er) {
  }
  var bearer = process.env.GITHUB_BEARER || auth.bearer;

  if (!bearer) {
    console.error('bearer not configured');
    usage(console.error);
    process.exit(1);
  }

  var options = {
    url: url,
    headers: {
      'authorization': 'Bearer ' + bearer,
    },
  };
  request(options, function(err, rsp, body) {
    assert.ifError(err);
    if (rsp.statusCode !== 200) {
      console.log(body);
      process.exit(1);
    }

    var body = JSON.parse(body);
    return callback(null, body);
  });
}


// report: report complete sprints since fromSprint, currently in progress, and
// backlog (but the backlog is reported only if there is a milestone specified,
// otherwise its too large).
function reportCommand(options) {
  debug('report on %j', options);

  var name = options.scrum;
  var project = path.resolve(__dirname, '..', 'sources', name + '.json');

  try {
    options.sources = require(project);
  } catch (err) {
    console.error('scrum %s not found:', name, err.message);
    process.exit(1);
  }

  var reports = [
    reportClosed.bind(null, options),
  ];

  if (!options.onlyClosed) {
    reports.push(reportCurrent.bind(null, options));
    reports.push(reportBacklog.bind(null, options));
  }

  async.series(reports, function(err) {
    assert.ifError(err);
  });
}

function reportClosed(options, callback) {
  var since = Sprint(options.from).start;

  issuesByScrum(options, {state: 'closed', since: since}, function(err, issues) {
    assert.ifError(err);

    var closed = issues.reduce(function(closed, issue) {
      var closedIn = Sprint.current(issue.closedAt);
      if (closedIn < options.fromSprint)
        return closed;

      debug('sprint %d issue %d size %s title: %s',
        closedIn, issue.number, sizeOf(options, issue), issue.title);

      issue._closedIn = closedIn;

      closed.push(issue);

      return closed;
    }, []);

    if (options.milestone) {
      closed = closed.filter(function(issue) {
        return issue.milestone && issue.milestone.title === options.milestone;
      });
    }

    printClosed(closed, options);

    return callback();
  });
}

function reportCurrent(options, callback) {
  var inSprintLabels = InSprintLabels();
  var milestone = options.milestone;

  debug('inSprintLabels: %j', inSprintLabels);

  async.map(inSprintLabels, function(label, callback) {
    issuesByScrum(options, {labels: label}, callback);
  }, function(err, byLabel) {
    assert.ifError(err);
    assert(byLabel);
    assert.equal(byLabel.length, inSprintLabels.length);
    console.log('Incomplete:');
    console.log('');
    inSprintLabels.forEach(function(label, index) {
      var issues = byLabel[index];
      if (milestone) {
        issues = issues.filter(function(issue) {
          return issue.milestone && issue.milestone.title === milestone;
        });
      }

      reportCurrentByLabel(label, issues, options);
    });
    return callback();
  });
}

function reportBacklog(options, callback) {
  var milestone = options.milestone;
  if (!milestone) {
    return callback();
  }

  console.log('Backlog:');
  console.log('');

  // We can't query by milestone string, only milestone number, which will be
  // different for every repo that milestone exists in. We can look them up
  // per-repo, but for now, just find open issues that are in ANY milestone,
  // then post-filter for the milestone name we want.
  var filter = {milestone: '*', status: 'open'};
  issuesByScrum(options, filter, function(err, issues) {
    assert.ifError(err);
    var inSprintLabels = [
      '#sprint' + Sprint.current(),
      '#wip',
      '#review',
      '#verify',
    ];

    issues = issues.filter(function(issue) {
      var labels = issue.labels.map(function(label) {
        return label.name;
      });
      return _.intersection(labels, inSprintLabels).length == 0;
    }).filter(function(issue) {
      return issue.milestone.title === milestone;
    });
    reportIssues(issues, options);
  });
}

function reportCurrentByLabel(label, issues, options) {
  assert(label);
  assert(issues);
  console.log('Incomplete in %s:', label);
  reportIssues(issues, options);
}

function printClosed(closed, options) {
  var sprints = closed.reduce(function(sprints, issue) {
    var sprint = sprints[issue._closedIn];
    if (!sprint) {
       sprint = sprints[issue._closedIn] = [];
       sprint.number = issue._closedIn;
    }
    sprint.push(issue);
    return sprints;
  }, {});
  
  Object.keys(sprints).sort().forEach(function(number) {
   reportClosedSprint(sprints[number], options);
  });
}

function reportClosedSprint(sprint, options) {
  console.log('Sprint %d', sprint.number);

  reportIssues(sprint, options);
}

function reportIssues(sprint, options) {
  assert(sprint);

  console.log('size\ttitle');

  decorateTitlesWithMilestone(sprint);
  sprint = _.sortBy(sprint, 'decoratedTitle');
  decorateTitlesWithLabels(sprint);

  var count = sprint.length;
  var velocity = 0;
  sprint.forEach(function(issue) {
    if (issue.pullRequest)
      return;
    var size = sizeOf(options, issue);
    var title = issue.decoratedTitle;
    if (options.withIssue)
      title += fmt(' (%s/%s)', shortRepoName(issue), issue.number);
    console.log('%s\t%s', size ? size : '-', title);
    if (+size)
      velocity += size;
  });
  
  console.log('  total size:\t%d', velocity);
  console.log('  total issues:\t%d', count);
  console.log('');
}

function shortRepoName(issue) {
  // "https://api.github.com/repos/octocat/Hello-World/issues/1347", after
  // split, path is ['', 'repos', 'octocat', 'Hello-World']
  var repo = url.parse(issue.url).path.split('/')[3];
  if (/^scrum-/.test(repo))
    return repo.replace('scrum-', '');
  if (/^strong-/.test(repo))
    return repo.replace('strong-', '');
  return repo;
}

function decorateTitlesWithMilestone(sprint) {
  sprint.forEach(function(issue) {
    issue.decoratedTitle = issue.decoratedTitle || issue.title;
    if (issue.milestone) {
      issue.decoratedTitle = fmt('%s: %s',
        stripHash(issue.milestone.title),
        issue.decoratedTitle);
    }
  });
}

function decorateTitlesWithLabels(sprint) {
  sprint.forEach(function(issue) {
    issue.decoratedTitle = issue.decoratedTitle || issue.title;
    var title = issue.title;
    var decorations = [];
    var labels = _(issue.labels)
      .pluck('name')
      .reject(ifSprintLabel)
      .map(cleanup)
      .value();

    if (labels.length) {
      issue.decoratedTitle = '(' + labels.join(', ') + ') ' + issue.decoratedTitle;
    }
  });

  function ifSprintLabel(label) {
    var sprintLabels = ['#wip', '#review', '#verify', '#tbr', '#tob'];
    var reject = /^#fib-/.test(label)
      || /^sprint/.test(label)
      || /^#sprint/.test(label)
      || _.includes(sprintLabels, label);
    //debug('%j in %j -> %j', label, sprintLabels, _.find(sprintLabels, label));
    return reject;
  }

  function cleanup(label) {
    return /waiting/.test(label) ? 'blocked' : stripHash(label);
  }
}

function stripHash(s) {
  return s.replace(/^#/, '');
}

// XXX(sam) Currently assumes all comitted backlog is in the scrum-XXX repo.
//
// It can be extended to load multiple repos, it would have to get them from:
// 1. configuration, as is currently done
// 2. by asking waffle... which knows what repos have been added to a scrum board,
//    as well as their short names
function issuesByScrum(options, filter, callback) {
  var scrum = options.scrum;
  debug('issuesByScrum: %s filter %j', scrum, filter);
  debug('%j', options.sources);

  assert(options.sources.length);

  async.concat(options.sources, getAll, function(err, issues) {
    debug('scrum %s: total issues', scrum, err ? err.message : issues.length);
    return callback(err, issues);
  });

  function getAll(source, callback) {
    var split = source.split('/');
    var org = split[0];
    var repo = split[1];

    var all = [];
    options.octo.repos(org, repo)
      .issues
      .fetch(filter || {}, next);

    function next(err, issues) {
      if (err) {
        debug('issuesByScrum: %s filter %j failed:', source, filter, err);
        if (err.status) {
          err = new Error(fmt('issues for %s were %s/%s',
                source, err.status, err.json && err.json.message || 'unknown'));
        } else {
          err = new Error(fmt('issues for %s were %j', err.message));
        }
        return callback(err);
      }
      all = all.concat(issues);
      if (!issues.nextPage)
        return callback(null, all);
      issues.nextPage(next);
    }
  }
}

// Set issue labels (if necessary)

function labelIssue(options, issue, labels, callback) {
  var old = issue.labels.map(function(label) {
    return label.name;
  });
  var meta = issueMeta(issue);

  labels = _.uniq(labels);

  old.sort();
  labels.sort();

  debug('label %s/%s#%d: %j',
    meta.org, meta.repo, issue.number, old);

  if (_.isEqual(old, labels)) {
    return process.nextTick(callback);
  }

  debug('  -> %j', labels);

  options.octo.repos(meta.org, meta.repo) .issues(meta.number)
    .update({labels: labels}, callback);
}

function issueMeta(issue) {
  var path = url.parse(issue.url).path;
  var levels = path.split('/');
  return {
    org: levels[2],
    repo: levels[3],
    number: issue.number,
  };
}

// Lookup of size of issue, using the cached "cards" from waffle.

var $sizes;
var $scrum;

function waffleSizeOf(options, issue) {
  var scrum = options.scrum;
  assert(scrum);
  assert(issue);
  assert(issue.url);
  if (!$sizes || $scrum !== scrum) {
    $sizes = require('../cards/' + scrum + '.json');
  }

  return $sizes[issue.url];
}

// Lookup of size of issue, using the github #fib- labels.

function sizeOf(options, issue) {
  if (issue._size)
    return issue._size;
  issue._size = issue.labels.map(function(label) {
    return label.name;
  }).reduce(function(size, label) {
    var match = /#fib-(.*)/.exec(label);
    if (!match) {
      return size;
    }
    return +match[1];
  }, '-');

  // XXX accessing scrum as a global... is that bad?
  var _size = waffleSizeOf(options, issue);

  // Waffle may have forgotten the issue, but if it remembers, and
  // waffle and github don't agree, take waffle as authoritative
  if (_size && _size !== issue._size) {
    setLabelsForIssue(options, issue, assert.ifError);
    issue._size = _size;
  }

  return issue._size;
}

function setLabelsForIssue(options, issue, callback) {
  // Get current label names, minus any #fib- labels
  var labels = issue.labels.map(function(label) {
    return label.name;
  }).filter(function(label) {
    return !/#fib-/.test(label);
  });

  var size = waffleSizeOf(options, issue);
  if (size)
    labels.push('#fib-' + size);
  labelIssue(options, issue, labels, callback);
}

// Labels for issues that are in the current sprint.  Note, label order is
// reporting order.
function InSprintLabels() {
  var inSprintLabels = [
    '#verify',
    '#review',
    '#wip',
    '#sprint' + Sprint.current(),
  ];
  return inSprintLabels;
}
