#! /usr/bin/env node
// -*- js2-strict-missing-semi-warning: nil; -*-

var apidocs            = require('node-api-docs')
var concat             = require('concat-stream')
var duplexer           = require('duplexer2')
var findRoot           = require('find-root')
var fs                 = require('fs')
var help               = require('help-version')(usage()).help
var marked             = require('marked')
var markedTerminal     = require('marked-terminal')
var minimist           = require('minimist')
var opener             = require('opener')
var rc                 = require('rc')
var resolve            = require('resolve')
var toUrl              = require('github-url').toUrl
var pager              = require('default-pager')
var pagerSupportsColor = require('pager-supports-color')
var path               = require('path')
var through            = require('through2')


function usage() {
  return [
    'Usage:  readme [<option>] [<name>]',
    '',
    'With no <name>, display current module\'s readme.',
    '',
    'Options:',
    '  --global, -g    Show readme for a globally installed module.',
    '  --core, -c      Show readme for a core module.',
    '  --web           Open project\'s homepage.',
    '  --github, --gh  Open project\'s GitHub page.',
    '  --[no-]color    Turn on/off colors.'
  ].join('\n')
}


var basedir = function (opts) {
  if (!opts.global) {
    return process.cwd()
  }
  var npmrc = rc('npm', null, [])
  var prefix = npmrc.prefix || path.resolve(process.execPath, '../..')
  return path.join(prefix, 'lib')
}


var packageFile = function (name, opts) {
  return resolve.sync(path.join(name, 'package.json'), { basedir: basedir(opts) })
}


var currentPackageFile = function (opts) {
  return path.join(findRoot(basedir(opts)), 'package.json')
}


var packageReadme = function (pkgDir) {
  var readmes = fs.readdirSync(pkgDir).filter(function (filename) {
    return /^readme/.test(filename.toLowerCase())
  })
  if (!readmes.length) {
    throw new Error('Readme not found in ' + pkgDir)
  }
  return fs.createReadStream(path.join(pkgDir, readmes[0]))
}


var packageUrl = function (pkg, webUrl) {
  var repoUrl = toUrl(pkg.repository)
  return webUrl
    ? pkg.homepage || repoUrl || 'https://npm.im/' + pkg.name
    : repoUrl
}


var colorize = function () {
  marked.setOptions({
    renderer: new markedTerminal()
  })

  var input = through(), output = through()

  input.pipe(concat({ encoding: 'string' }, function (md) {
    output.end(marked(md))
  }))

  return duplexer(input, output)
}


try {
  var opts = minimist(process.argv.slice(2), {
    boolean: ['global', 'core', 'web', 'github', 'color'],
    alias: {
      global: 'g',
      core: 'c',
      github: 'gh'
    },
    default: {
      color: pagerSupportsColor()
    }
  })

  if (opts._.length > 1) {
    help(1)
  }

  var name = String(opts._.shift() || '')
  var readme

  if (opts.core) {
    readme = apidocs(name)
  } else if (opts.github || opts.web) {
    var pkg = require(packageFile(name, opts))
    opener(packageUrl(pkg, opts.web))
  } else if (name) {
    var pkgFile
    try {
      pkgFile = packageFile(name, opts)
    } catch (e) {
      opts.global = true
      pkgFile = packageFile(name, opts)
    }
    readme = packageReadme(path.dirname(pkgFile))
  } else {
    try {
      readme = packageReadme(path.dirname(currentPackageFile(opts)))
    } catch (e) {
      readme = packageReadme(process.cwd())
    }
  }

  if (readme) {
    if (opts.color) {
      readme.pipe(colorize()).pipe(pager())
    }
    else {
      readme.pipe(pager())
    }
  }
} catch (e) {
  console.error(e.message)
  process.exit(1)
}
