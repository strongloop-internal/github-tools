# git-tools

### Installation

```
$ git clone https://github.com/ritch/github-tools.git
$ cd github-tools
```

## sync

Synchronize labels and milestones across multiple products.

## Usage

```
$ bin/sync.js config.json
```

## Configuration

The configuration file has three sections: `labels`, `milestones` and
`projects`.

See [projects](projects) directory for existing configuration files.

### labels

An object describing labels shared by all github repositories. Label name is
the key, label color is the value. Use `null` value to delete a label from all
repositories.

```
"labels": {
  "#wip": "ededed",
  "remove-me": null
}
```

### repos

An array of all repositories to synchronize.

```
"repos": [
  "strongloop/loopback",
  "strongloop/loopback-datasource-juggler"
]
```

