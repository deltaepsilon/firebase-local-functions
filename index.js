var _ = require('lodash');
var firebase = require('firebase');
var axios = require('axios');

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

  firebase.initializeApp(config.firebaseConfig, 'localFunctionsRunner');

  var ref = firebase.app('localFunctionsRunner').database().ref(config.path);

  config.specs.forEach(function (spec) {
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
    var previousSnap;
    var currentSnap;
    childRef.on('value', function (snap) {
      currentSnap = snap;
      if (!previousSnap) {
        previousSnap = _.clone(currentSnap);
      }
    });

    var getExisting = function (paths, specs) {
      var root = ref.toString();
      var paths = Array.isArray(paths) ? paths : [paths];
      var localSpecs = _.clone(specs);
      var spec = localSpecs.shift();
      var promises = [];

      paths.forEach(function (path) {
        var url = root + '/' + path + '.json?' + [
          'auth=' + config.firebaseConfig.secret,
          'shallow=true'
        ].join('&');

        promises.push(axios.get(url)
          .then(function (res) {
            var keys = Object.keys(res.data || {});
            // console.log(path);
            // console.log(spec);
            // console.log(keys);
            if (spec.isWildcard) {
              var newPaths = _.map(keys, function (key) {
                return path + '/' + key;
              });

              if (!localSpecs.length || !newPaths.length) {
                return Promise.resolve(newPaths);
              } else {
                return getExisting(newPaths, localSpecs);
              }
            }
            return keys;
          }));
      });

      return Promise.all(promises)
        .then(function (values) {
          var reducer = function (result, value, key) {
            return Array.isArray(value) ? _.reduce(value, reducer, result) : result.concat(value);
          };
          return _.reduce(values, reducer, []);
        })
        .catch(function (err) {
          console.log('getExisting error', err);
        });
    };

    var getChildRecords = function (path, value, params, specs, existing) {
      var params = params || {};
      var localSpecs = _.clone(specs);
      var spec = localSpecs.shift();
      var pathParts = path.split('/');
      var key = pathParts[pathParts.length - 1];
      var nextSpec = localSpecs[0];
      var returnNewRecords = function () {
        return ~existing.indexOf(path) ? [] : [{ // Skip existing records. Only add new records.
          key: key,
          value: value,
          params: params,
          path: path
        }];
      };
      // Pull off one part of the path
      // Pull off a matching spec
      // If the spec is not a wildcard, accumulate the value and recur
      // If the spec is a wildcard, recur once for every child
      if (!value) {
        return [];
      }
      if (!spec) { // If you're out of specs, return the child record
        return returnNewRecords();
      } else {
        if (spec.isWildcard) { // Set wildcard param if appropriate
          params[spec.name] = key;
        }

        if (nextSpec && !nextSpec.isWildcard) {
          // Static paths should just pass through and get called again
          return getChildRecords(path + '/' + nextSpec.name, value[nextSpec.name], params, localSpecs, existing);
        } else if (!localSpecs.length) {
          return returnNewRecords();
        } else {
          // Wildcard paths accumulate an array of all child paths
          return _.reduce(value, function (childRecords, wildValue, wildKey) {
            var wildSpecs = _.clone(localSpecs);
            var wildSpec = wildSpecs.shift();
            var wildParams = _.clone(params);
            var wildPath = [path, wildKey].join('/');

            wildParams[wildSpec.name] = wildKey;
            return childRecords.concat(getChildRecords(wildPath, wildValue, wildParams, wildSpecs, existing));
          }, []);
        }
      }
    };

    getExisting(staticParts.join('/'), pathSpecs)
      .then(function (existingPaths) {
        var getPrevious = function (path) {
          var parts = path.split('/');
          var i = parts.length;
          var keys = [];

          while (i--) {
            // if (!previousSnap) {
            //   debugger;
            // }
            if (parts[i] !== previousSnap.key) {
              keys.unshift(parts[i]);
            } else {
              break;
            }
          }

          var getChildSnap = function (keys, snaps) {
            var key = keys.shift();
            var result;
            snaps.forEach(function (childSnap) {
              if (childSnap.key === key) {
                if (keys.length) {
                  result = getChildSnap(keys, childSnap);
                } else {
                  result = childSnap;
                }
              }
            });
            return result;
          }
          return getChildSnap(keys, previousSnap);
        };
        var processRecord = function (record) {
          ref.child(record.path).once('value', function (snap) {
            var val = snap.val();
            var previous = getPrevious(record.path) || {
              val: function () {
                return undefined;
              },
              key: snap.key,
              ref: snap.ref
            };
            var prevVal = previous.val();

            var event = {
              service: 'firebase.database',
              type: 'write',
              instance: config.firebaseConfig.databaseUrl,
              deviceId: undefined,
              data: snap,
              params: _.merge(record.params, config.params),
              path: record.path,
              _data: prevVal,
              _newData: val,
              _delta: val
            };
            event.data.adminRef = snap.ref;
            event.data.current = function () {
              return snap.ref;
            };
            previous.current = event.data.current;
            event.data.previous = function () {
              return previous;
            };

            if (prevVal && typeof prevVal === 'object') {
              _.each(event._delta, function (value, key) {
                if (value === prevVal[key]) {
                  delete event._delta[key];
                }
              });
            }


            childRef.once('value')
              .then(function (snap) {
                spec.func.call(this, event); // Call functions  
              }.bind(this));

            if (record.value && !~existingPaths.indexOf(record.path)) {
              existingPaths.push(record.path);
            }
            previousSnap = _.clone(currentSnap);
          });
        };
        var changedHandler = function (snap) {
          var childRecords = getChildRecords(staticParts.concat([snap.key]).join('/'), snap.val(), {}, pathSpecs, existingPaths);

          if (!childRecords.length) {
            return getExisting(staticParts.join('/'), pathSpecs)
              .then(function (existing) {
                _.difference(existingPaths, existing).forEach(function (path) {
                  var pathParts = path.split('/');
                  var key = pathParts[pathParts.length - 1];
                  var getParams = function (aPathParts, aPathSpecs, params, aStaticParts) {
                    var i = aStaticParts ? aStaticParts.length : 0;
                    while (i--) {
                      aPathParts.splice(aPathParts.indexOf(aStaticParts[i]), 1);
                    };

                    var localPath = _.clone(aPathParts);
                    var localSpecs = _.clone(aPathSpecs);
                    var part = localPath.shift();
                    var spec = localSpecs.shift();
                    var params = params || {};

                    if (part) {
                      if (spec.isWildcard) {
                        params[spec.name] = part;
                      }
                      return getParams(localPath, localSpecs, params);
                    } else {
                      return params;
                    }
                  };

                  existingPaths.splice(existingPaths.indexOf(path), 1);
                  processRecord({
                    path: path,
                    key: key,
                    params: getParams(pathParts, pathSpecs, {}, staticParts)
                  });
                });
              });
          } else {
            return childRecords.forEach(processRecord);
          }

        };
        childRef.on('child_added', changedHandler);
        childRef.on('child_changed', changedHandler);
        childRef.on('child_removed', function (snap) {
          snap.ref.once('value')
            .then(function (snap) {
              changedHandler(snap);
            });
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
//      _authToken: 'asdfadfddsf',
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