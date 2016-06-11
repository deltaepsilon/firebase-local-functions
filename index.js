var _ = require('lodash');
var firebase = require('firebase');

var getChildSnapByKey = function (snap, key) {
  var result;
  snap.forEach(function (childSnap) {
    if (key === childSnap.getKey()) {
      result = childSnap;
    }
  });
  return result;
};

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
    var pathSpecs = [];
    var parts = spec.path.split('/').reverse();
    var i = parts.length;
    while (i--) {
      if (!parts[i].length) {
        parts.splice(i, 1);
      } else if (parts[i].substring(0, 1) === '{') {
        pathSpecs.push({
          isWildcard: true,
          name: parts[i].match(/[^{}]+/)[0]
        });
      } else {
        pathSpecs.push({
          name: parts[i]
        });
      }
    }

    if (pathSpecs[0].isWildcard) {
      console.log("The first part of a spec's path cannot be a wildcard!");
    }

    var staticParts = [];
    var specLength = pathSpecs.length;
    for (var j = 0; j < specLength; j++) {
      if (!pathSpecs[j].isWildcard) {
        staticParts.push(pathSpecs[j].name);
      } else {
        break;
      }
    }
    pathSpecs.splice(0, staticParts.length);

    var getChildSnaps = function (snaps, paths) {
      var localPaths = _.clone(paths);
      var path = localPaths.shift();
      var snaps = Array.isArray(snaps) ? snaps : [snaps];
      var childSnaps = [];

      snaps.forEach(function (snap) {
        var parentPaths = snap.paths || [];

        if (path.isWildcard) {
          snap.forEach(function (childSnap) {
            var snapPath = _.clone(path);
            snapPath.key = childSnap.getKey();
            childSnap.paths = parentPaths.concat([snapPath]);
            childSnaps.push(childSnap);
          });
        } else {
          var childSnap = getChildSnapByKey(snap, path.name);
          var snapPath = _.clone(path);
          snapPath.key = childSnap.getKey();
          childSnap.paths = parentPaths.concat([snapPath]);
          childSnaps.push(childSnap);
        }
      });

      if (!localPaths.length) {
        // childSnaps.forEach(function(snap) {
        //   console.log('snap', typeof snap);
        // });
        return childSnaps;
      } else {
        return getChildSnaps(childSnaps, localPaths);
      }
    };

    var childRef = ref.child(staticParts.join('/'));
    childRef.once('value', function (snap) {
      var previousSnaps = getChildSnaps(snap, pathSpecs);

      childRef.on('value', function (snap) {
        // Step through the tree for non-wildcard path elements
        // Must loop through all children for every wildcard.

        var childSnaps = getChildSnaps(snap, pathSpecs);

        // childSnaps.forEach(function (snap, i) {
        //   console.log('snap', i, snap.getKey(), snap.paths, snap.val(), "\n\n");
        // });

        //  Keys
        var currentKeys = _.map(childSnaps, function(snap) {
          return snap.getKey();
        });
        var previousKeys = _.map(previousSnaps, function(snap) {
          return snap.getKey();
        }); 
        var snaps = [];

        //  Additions and removals
        // console.log('additions', _.difference(currentKeys, previousKeys));
        // console.log('removals', _.difference(previousKeys, currentKeys));
        _.each(_.difference(currentKeys, previousKeys).concat(_.difference(previousKeys, currentKeys)), function (key) {
          var ref = childRef.child(key);
          var getSnapMock = function () {
            return {
              ref: function () {
                return ref;
              },
              val: function () {
                return;
              },
              getKey: function () {
                return key;
              }
            };
          };
          var current = getSnapMock();
          var previous = getSnapMock();

          childSnaps.forEach(function (childSnap) { // Find current snap
            if (key === childSnap.getKey()) {
              current = childSnap;
            };
          });

          previousSnaps.forEach(function (childSnap) { // Find previous snap
            if (key === childSnap.getKey()) {
              previous = childSnap;
            };
          });

          current.current = function () {
            return current;
          };

          snaps.push({
            getKey: function () {
              return key;
            },
            val: function () {
              return current.val();
            },
            previous: function () {
              return previous;
            },
            changed: function () {
              return true;
            },
            current: function () {
              return current;
            },
            ref: current.ref,
            _path: current.ref.path ? current.ref.path.toString() : previous.ref.path.toString(),
            paths: current.paths || previous.paths
          });
        });

        // Changes
        childSnaps.forEach(function (childSnap) {
          previousSnaps.forEach(function (previousChildSnap) {
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
                childSnap.previous = function () {
                  return previousChildSnap;
                };
                childSnap.changed = function (key) {
                  return ~Object.keys(delta).indexOf(key);
                };
                childSnap.current = function () {
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
          
          e.data._path = snap._path || snap.ref.path.toString();
          e.data._data = val;
          e.data._newData = snap.previous().val() || {};
          snap.paths.forEach(function(path) {
            e.params[path.name] = path.key;
          });

          // Set up e.data.ref() and e.data.adminRef()
          var uid = e.params.uid || e.data.val().uid;
          e.data.adminRef = snap.ref;
          try {
            spec.func.call(this, e);
          } catch (err) {
            console.error(spec.name, 'error:', err);
          }
          
        });

        previousSnaps = childSnaps; // Update previousSnaps to most recent childSnaps
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