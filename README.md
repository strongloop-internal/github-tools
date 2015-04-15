# github-tools

## Installation

```
$ git clone https://github.com/strongloop/github-tools.git
$ cd github-tools
```

Create `.auth.json` in the directory you will run `bin/sync` from:

```
{
  "username": "github-username",
  "password": "github-password"
}
```

## bin/sync.js

Synchronize labels and milestones across multiple products.

## Usage

```
$ bin/sync.js config.json
```

## Configuration

The configuration file has three sections: `labels`, `milestones` and
`projects`.

See [projects](projects) directory for existing configuration files.

### `labels`

An object describing labels shared by all github repositories. Label name is
the key, label color is the value. Use `null` value to delete a label from all
repositories.

```
"labels": {
  "#wip": "ededed",
  "remove-me": null
}
```

### `milestones`

An object describing milestones shared by all github repositories. Milestone
title is used as the key.

Supported values:

 - a string - the due date in the format `yyyy-mm-dd`
 - `false` - the milestone is closed.

```
"milestones": {
  "#Rel studio 0.3.0 - Beta R3": "2014-10-07",
  "#Rel studio 0.2.0 - Beta R2": false
}
```

### `repos`

An array of all repositories to synchronize.

```
"repos": [
  "strongloop/loopback",
  "strongloop/loopback-datasource-juggler"
]
```

