var GitHubApi = require("github");
var GH_USERNAME = process.env.GH_USERNAME;
var GH_PASSWORD = process.env.GH_PASSWORD;

var github = new GitHubApi({
  // required
  version: "3.0.0",
  // optional
  protocol: "https",
  timeout: 5000
});

github.authenticate({
  type: "basic",
  username: GH_USERNAME,
  password: GH_PASSWORD
});

module.exports = github;
