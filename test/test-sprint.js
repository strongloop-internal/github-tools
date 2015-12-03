var Sprint = require('../lib/sprint');
var tap = require('tap');


tap.test('can be required', function(t) {
  t.assert(new Sprint() instanceof Sprint, 'new');
  t.assert(Sprint() instanceof Sprint, 'no new');
  t.end();
});

tap.test('sprint 62', function(t) {
  var sprint = Sprint(62);
  t.equal(sprint.num, 62);
  t.equal(sprint.start.format(), '2015-01-12T12:00:00-08:00');
  t.equal(sprint.stop.format(), '2015-01-26T12:00:00-08:00');
  t.assert(!sprint.includes('2015-01-12T11:59:59-08:00'));
  t.assert(sprint.includes('2015-01-13T10:30:00-08:00'));
  t.assert(sprint.includes('2015-01-20T10:30:00-08:00'));
  t.assert(sprint.includes('2015-01-26T11:59:59-08:00'));
  t.assert(!sprint.includes('2015-01-27T10:30:00-08:00'));

  t.assert(!sprint.includes('2015-01-12T18:29:59Z'));
  t.assert(sprint.includes('2015-01-13T18:30:00Z'));
  t.assert(sprint.includes('2015-01-20T18:30:00Z'));
  t.assert(sprint.includes('2015-01-26T19:59:59Z'));
  t.assert(!sprint.includes('2015-01-26T20:00:00Z'));
  t.end();
});

tap.test('sprint 63', function(t) {
  var sprint = Sprint(63);
  t.equal(sprint.num, 63);
  t.equal(sprint.start.format(), '2015-01-26T12:00:00-08:00');
  t.equal(sprint.stop.format(), '2015-02-09T12:00:00-08:00');

  t.assert(!sprint.includes('2015-01-26T19:59:59Z'));
  t.assert(sprint.includes('2015-01-27T18:30:00Z'));
  t.end();
});

tap.test('current', function(t) {
  t.equal(62, Sprint.current('2015-01-25T10:30:00-08:00'));
  t.equal(63, Sprint.current('2015-01-27T10:30:00-08:00'));
  t.assert(Sprint().num >= 62);
  t.end();
});
