var moment = require('moment-timezone');

module.exports = Sprint;

// This could be more complex if loopback and nodeops have different sprint
// start times, because then it would have to be configurable. Which would be
// easy, the 3 values below (DATE...SPRINT) would have to be in the project json
// config file. Or we could just cut it off at 9am the morning of the sprint
// planning... so last-minute work doesn't count to the sprint.
var DATE = '2015-01-13 00:00';
var TZ = 'America/Vancouver';
var SPRINT = 62;
var BASE = moment.tz(DATE, TZ);


function Sprint(num) {
  if (!(this instanceof Sprint)) {
    return new Sprint(num);
  }

  if (!num) {
    num = Sprint.current();
  }

  var sprintDiff = (num - SPRINT);

  if(sprintDiff < 0){
    this.start = BASE.clone().subtract(Math.abs(2 * sprintDiff), 'week');
    this.stop = this.start.clone().add(2, 'week');
  }
  else{
    this.start = BASE.clone().add(2 * (num - SPRINT), 'week');
    this.stop = this.start.clone().add(2, 'week');
  }

  this.num = num;
}

function ge(l, r) {
  return l.isAfter(r) || l.isSame(r);
}

function lt(l, r) {
  return l.isBefore(r);
}

Sprint.prototype.includes = function includes(utc) {
  var m = moment(utc);
  return ge(m, this.start) && lt(m, this.stop);
};

Sprint.current = function(date) {
  var now = moment(date);
  var diff = now.diff(BASE, 'weeks', true) / 2;
  return SPRINT + (diff | 0);
};
