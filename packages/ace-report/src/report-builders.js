/* eslint no-param-reassign: ["error", { "props": false }] */
/* eslint no-use-before-define: ["error", { "classes": false }] */

'use strict';

const pkg = require('../package');

const { config, paths } = require('@daisy/ace-config');
const defaults = require('./defaults');
const reportConfig  = config.get('report', defaults.report);
const path = require('path');

// static
const ACE_DESCRIPTION = {
  '@type': 'earl:software',
  'doap:name': 'DAISY Ace',
  'doap:description': 'DAISY Accessibility Checker for EPUB',
  'doap:homepage': 'http://daisy.github.io/ace',
  'doap:created': '2017-07-01',
  'doap:release': { 'doap:revision': pkg.version },
};
const RULESET_TAGS = ['wcag2a', 'wcag2aa', 'EPUB', 'best-practice'];

function calculateResult(assertions) {
  let outcome = 'pass';
  assertions.forEach((assertion) => {
    if ('earl:result' in assertion &&
        assertion['earl:result']['earl:outcome'] === 'fail') {
      outcome = 'fail';
    }
  });
  return new ResultBuilder(outcome).build();
}

// add an assertion and recalc the top-level result
function withAssertions(obj, assertions) {
  if (!('assertions' in obj)) obj.assertions = [];
  obj.assertions = obj.assertions.concat(assertions);
  obj['earl:result'] = calculateResult(obj.assertions);
  return obj;
}

function withTestSubject(obj, url, title = '', identifier = '', metadata = null, links = null) {
  const testSubject = { url };
  if (title.length > 0) testSubject['dct:title'] = title;
  if (identifier.length > 0) testSubject['dct:identifier'] = identifier;
  if (metadata !== undefined && metadata != null) testSubject.metadata = metadata;
  if (links !== undefined && links != null) testSubject.links = links;
  obj['earl:testSubject'] = testSubject;
  return obj;
}


class AssertionBuilder {
  constructor() {
    this._json = { '@type': 'earl:assertion' };
    var result = new ResultBuilder('pass').build();
    this.withResult(result); // default result until we know more
  }
  build() {
    return this._json;
  }
  withAssertedBy(assertor) {
    this._json['earl:assertedBy'] = assertor;
    return this;
  }
  withAssertions(assertions) {
    withAssertions(this._json, assertions);
    return this;
  }
  withMode(mode) {
    this._json['earl:mode'] = mode;
    return this;
  }
  withResult(result) {
    this._json['earl:result'] = result;
    return this;
  }
  withSubAssertions() {
    this._json.assertions = this._json.assertions || [];
    return this;
  }
  withTest(test) {
    this._json['earl:test'] = test;
    return this;
  }
  withTestSubject(url, title) {
    withTestSubject(this._json, url, title);
    return this;
  }
}


class ReportBuilder {
  constructor(
    title = 'Ace Report',
    description = 'Report on automated accessibility checks for EPUB',
    ) {
    this._json = {
      '@type': 'earl:report',
      '@context': 'http://daisy.github.io/ace/ace-report-1.0.jsonld',
      'dct:title': (title == null) ? '' : title.toString(),
      'dct:description': (title == null) ? '' : description.toString(),
      'dct:date': new Date().toLocaleString(),
      'earl:assertedBy': ACE_DESCRIPTION,
      outlines: {},
      data: {},
      properties: {},
      violationSummary: {
        'wcag2a': {'critical': 0, 'serious': 0, 'moderate': 0, 'minor': 0, 'total': 0},
        'wcag2aa': {'critical': 0, 'serious': 0, 'moderate': 0, 'minor': 0, 'total': 0},
        'EPUB': {'critical': 0, 'serious': 0, 'moderate': 0, 'minor': 0, 'total': 0},
        'best-practice': {'critical': 0, 'serious': 0, 'moderate': 0, 'minor': 0, 'total': 0},
        'other': {'critical': 0, 'serious': 0, 'moderate': 0, 'minor': 0, 'total': 0},
        'total': {'critical': 0, 'serious': 0, 'moderate': 0, 'minor': 0, 'total': 0}
      }
    };
  }
  build() {
    return this._json;
  }
  // run the function on the given item under _json.data
  cleanData(key, fn) {
    if (this._json.data.hasOwnProperty(key)) {
        this._json.data[key] = fn(this._json.data[key]);
    }
  }
  setOutdir(outdir) {
    this.outdir = outdir;
    return this;
  }
  withA11yMeta(metadata) {
    if (!metadata) return this;
    this._json['a11y-metadata'] = metadata;
    return this;
  }
  withAssertions(assertions) {
    if (!assertions) return this;
    withAssertions(this._json, assertions);
    this.addToViolationSummary(assertions);
    return this;
  }
  withData(data) {
    if (!data) return this;
    Object.getOwnPropertyNames(data).forEach((key) => {
      if (Array.isArray(this._json.data[key])) {
        this._json.data[key] = this._json.data[key].concat(data[key]);
      } else {
        this._json.data[key] = data[key];
      }
    });
    return this;
  }
  withEPUBOutline(outline) {
    if (!outline) return this;
    this._json.outlines.toc = outline;
    return this;
  }
  withHeadingsOutline(outline) {
    if (!outline) return this;
    this._json.outlines.headings = outline;
    return this;
  }
  withHTMLOutline(outline) {
    if (!outline) return this;
    this._json.outlines.html = outline;
    return this;
  }
  withProperties(properties) {
    if (!properties) return this;
    Object.getOwnPropertyNames(properties).forEach((key) => {
      this._json.properties[key] = (key in this._json.properties)
        ? this._json.properties[key] || Boolean(properties[key])
        : Boolean(properties[key]);
    });
    return this;
  }
  withTestSubject(url, title, identifier, metadata, links) {
    var url_ = url;
    if (this.outdir !== undefined && this.outdir != "" && reportConfig["use-relative-paths"]) {
      url_ = path.relative(this.outdir, url);
    }
    withTestSubject(this._json, url_, title, identifier, metadata, links);
    return this;
  }
  addToViolationSummary(assertions) {
    var asserts = assertions;
    // an assertion can be an array of tests or a container of arrays of tests
    if (!Array.isArray(assertions)) {
      if (assertions.hasOwnProperty('assertions')) {
        asserts = assertions['assertions'];
      }
      else {
        return;
      }
    }
    if (asserts.length == 0) return;

    var violationSummary = this._json['violationSummary'];
    asserts.forEach(function(assertion) {
      var found = false;
      assertion['earl:test'].rulesetTags.forEach(function(tag) {
        let impact = assertion['earl:test']['earl:impact'];
        if (RULESET_TAGS.indexOf(tag) > -1) {
          violationSummary[tag][impact] += 1;
          violationSummary[tag]['total'] += 1;
          found = true;
        }
      });
      if (!found) {
        violationSummary['other'][impact] += 1;
        violationSummary['other']['total'] += 1;
      }
    });

    Object.keys(violationSummary['total']).forEach(function(key) {
    violationSummary['total'][key] = violationSummary['wcag2a'][key]
      + violationSummary['wcag2aa'][key]
      + violationSummary['EPUB'][key]
      + violationSummary['best-practice'][key]
      + violationSummary['other'][key];
    });
  }
}

class ResultBuilder {
  constructor(outcome) {
    this._json = { 'earl:outcome': outcome };
  }
  build() {
    return this._json;
  }
  withDescription(description) {
    this._json['dct:description'] = description;
    return this;
  }
  withHTML(html) {
    this._json['html'] = html;
    return this;
  }
  withPointer(css, cfi) {
    this._json['earl:pointer'] = { cfi, css };
    return this;
  }
}

class TestBuilder {
  constructor() {
    this._json = {};
  }
  build() {
    return this._json;
  }
  withImpact(impact) {
    this._json['earl:impact'] = impact;
    return this;
  }
  withTitle(title) {
    this._json['dct:title'] = title;
    return this;
  }
  withDescription(description) {
    this._json['dct:description'] = description;
    return this;
  }
  withHelp(url, title, description) {
    this._json.help = {
      "url": url,
      "dct:title": title,
      "dct:description": description
    };
    return this;
  }
  withRulesetTags(tags) {
    this._json.rulesetTags = tags;
    return this;
  }
}

module.exports.AssertionBuilder = AssertionBuilder;
module.exports.ReportBuilder = ReportBuilder;
module.exports.TestBuilder = TestBuilder;
module.exports.ResultBuilder = ResultBuilder;
