var _ = require('lodash');
var firebase = require('firebase');

module.exports = function (config) {
  if (!Array.isArray(config.specs)) {
    console.log('specs must be an array');
  }
  if (typeof config.firebaseConfig !== 'object') {
    console.log('firebaseConfig must be an object with firebase configurations');
  }
  if (typeof config.path !== 'string') {
    console.log('path must be a string');
  }

  firebase.initializeApp(config.firebaseConfig);

  var ref = firebase.database().ref(config.path);

  config.specs.forEach(function (spec) {
    // firebase.initializeApp({
    //   databaseURL: "https://databaseName.firebaseio.com",
    //   serviceAccount: "path/to/serviceAccountCredentials.json",
    //   databaseAuthVariableOverride: {
    //     uid: "my-service-worker"
    //   }
    // });
    var PARTS_REGEX = new RegExp('[^{}]+', 'g');
    var parts = spec.path.match(PARTS_REGEX);
    var path = parts[0];
    var keyname = parts[1];
    var childRef = ref.child(path);
    childRef.once('value', function (snap) {
      var previousSnap = snap;

      childRef.on('value', function (snap) {
        //  Keys
        var keys = Object.keys(snap.val() || {});
        var previousKeys = Object.keys(previousSnap.val() || {});
        var snaps = [];

        //  Additions and removals
        _.each(_.difference(keys, previousKeys).concat(_.difference(previousKeys, keys)), function (key) {
          var getSnapMock = function() {
            return {
              ref: function() {
                return childRef.child(key);
              },
              val: function() {
                return;
              },
              getKey: function() {
                return key;
              },
              toString: function() {
                return childRef.child(key).toString();
              }
            };
          };
          var current = getSnapMock();
          var previous = getSnapMock();

          snap.forEach(function (childSnap) { // Find current snap
            if (key === childSnap.getKey()) {
              current = childSnap;
            };
          });

          previousSnap.forEach(function (childSnap) { // Find previous snap
            if (key === childSnap.getKey()) {
              previous = childSnap;
            };
          });

          current.current = function() {
            return current;
          };

          snaps.push({
            getKey: function() {
              return key;
            },
            val: function() {
              return current.val();
            },
            previous: function() {
              return previous;
            },
            changed: function() {
              return true;
            },
            current: function() {
              return current;
            }
          });
        });

        // Changes
        snap.forEach(function (childSnap) {
          previousSnap.forEach(function (previousChildSnap) {
            if (childSnap.getKey() === previousChildSnap.getKey()) {              
              var val = childSnap.val();
              var previous = previousChildSnap.val();

              if (!_.isEqual(val, previous)) {
                var delta = {};
                var currentVersion = val;
                var previousVersion = previous;
                var keys = _.uniq(Object.keys(currentVersion), Object.keys(previousVersion));
                var i = keys.length;

                while (i--) {
                  if (!_.isEqual(currentVersion[keys[i]], previousVersion[keys[i]])) {
                    delta[keys[i]] = currentVersion[keys[i]];
                  }
                }

                childSnap.current = function () {
                  return childSnap;
                };
                previousChildSnap.current = function () {
                  return childSnap;
                };

                childSnap._delta = delta;
                childSnap.previous = function() {
                  return previousChildSnap;
                };
                childSnap.changed = function(key) {
                  return ~Object.keys(delta).indexOf(key);
                };
                childSnap.current = function() {
                  return childSnap;
                };

                snaps.push(childSnap);
              }
            }
          });
        });

        snaps.forEach(function (snap) {
          var key = snap.getKey();
          var val = snap.val();
          var e = {
            service: 'firebase.database',
            type: undefined,
            instance: config.firebaseConfig.databaseURL,
            uid: val ? val.uid : undefined,
            deviceId: val ? val.deviceId : undefined,
            data: snap,
            params: {
              environment: 'development'
            }
          };
          Object.keys(snap).forEach(function(key) {
            console.log(key, snap[key]);
          });
          // console.log('path', snap.path, typeof snap.path)
          e.data._path = snap.ref.path.toString();
          e.data._data = val;
          e.data._newData = snap.previous().val() || {};
          if (keyname) {
            e.params[keyname] = key;
          }

          spec.func(e);
        });

        previousSnap = snap;
      });
    });
  });
};

// { service: 'firebase.database',
//   type: undefined,
//   instance: 'https://quiver-one.firebaseio.com',
//   uid: undefined,
//   deviceId: undefined,
//   data: 
//    { _path: '/imageViewer/development/users/WQ3mVT7f8pRbBmry6eZju1Z4lPi1',
//      _authToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE0NjU1NTM4NzYsImV4cCI6MTQ2NTU1NzQ3NiwiYWRtaW4iOnRydWUsInYiOjB9OQCHT59JZyTOFgFpkM_P7dGU0W7QvqsAnT9aBW-glIA',
//      _data: 
//       { email: 'chris@quiver.is',
//         login: 'Thu Jun 09 2016 14:53:45 GMT-0600 (MDT)',
//         updated: 'Thu Jun 09 2016 20:53:45 GMT+0000 (UTC)' },
//      _delta: { whatevs: 'yes' },
//      _newData: 
//       { email: 'chris@quiver.is',
//         login: 'Thu Jun 09 2016 14:53:45 GMT-0600 (MDT)',
//         updated: 'Thu Jun 09 2016 20:53:45 GMT+0000 (UTC)',
//         whatevs: 'yes' } },
//   params: 
//    { environment: 'development',
//      userId: 'WQ3mVT7f8pRbBmry6eZju1Z4lPi1' } }