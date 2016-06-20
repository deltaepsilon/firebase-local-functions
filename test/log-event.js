var _ = require('lodash');
var scrubEvent = function (e) {
  var clean = function (obj) {
      var result = {};
      // var obj = _.clone(obj);
      var keys = Object.keys(obj);
      var i = keys.length;

      while (i--) {
        if (keys[i].length < 3) {
          // delete obj[keys[i]];
        } else if (!obj[keys[i]] || typeof obj[keys[i]] === 'function' || (Array.isArray(obj[keys[i]]) && !obj[keys[i]].length)) {
          // delete obj[keys[i]];
        } else if (typeof obj[keys[i]] === 'object') {
          result[keys[i]] = clean(obj[keys[i]]);
        } else {
          result[keys[i]] = obj[keys[i]];
        }
      }
      return result;
    };

  return clean(e);
};

module.exports = function (e) {
  var uid = e.params.uid;
  var val = e.data.val();
  var event = scrubEvent(e);

  if (val) {
    e.data.ref.root.child('localFunctions/test/logs').push({
      addHandled: {
        uid: uid,
        key: e.data.key,
        parent: e.data.ref.toString(),
        event: event
      }
    })
      .then(function () {
        return e.data.ref.remove();
      });
  } else {
    return e.data.ref.root.child('localFunctions/test/logs').push({
      removeHandled: {
        uid: uid,
        key: e.data.key,
        parent: e.data.ref.toString(),
        event: event
      }
    });
  }
};