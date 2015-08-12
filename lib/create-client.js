var GitHubApi = require("github-cache");
var fs = require('fs');

var auth;

try {
  auth = JSON.parse(fs.readFileSync('.auth.json'));
} catch (err) {
  console.warn('Cannot load credentials.', err);
  auth = {};
}

auth.username = process.env.GH_USERNAME || auth.username;
auth.password = process.env.GH_PASSWORD || auth.password;

console.assert(auth.username || auth.token);
console.assert(auth.password || auth.token);

var github = new GitHubApi({
  // required
  version: "3.0.0",
  // optional
  protocol: "https",
//timeout: 5000,

  cachedb: '_cache.db',
  validateCache: false,
});

if ('token' in auth) {
  github.authenticate({
    type: 'oauth',
    token: auth.token,
  });
} else {
  github.authenticate({
    type: "basic",
    username: auth.username,
    password: auth.password
  });
}

module.exports = github;
