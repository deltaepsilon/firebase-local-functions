var test = require('tape');
var firebase = require('firebase');
var path = 'localFunctions/test';
var firebaseConfig = require('./env.json').firebaseConfig;

firebase.initializeApp(firebaseConfig);

var ref = firebase.database().ref(path);
ref.remove()
  .then(function () {
    // Bootstrap local-functions runner
    require('./index.js')({
      specs: require('./test/test-specs'),
      firebaseConfig: firebaseConfig,
      path: path
    });

    // run tests!!!

    // Don't need to call firebase.initializeApp, because the DEFAULT app has already been created by the local-functions runner
    var now = (new Date()).toString();
    var logsRef = ref.child('logs');

    test('must start empty, plus timeout', function (t) {
      t.plan(1);
      setTimeout(function () {
        ref.once('value')
          .then(function (snap) {
            t.equal(snap.val(), null);
          });
      }, 1000);
    });

    test('add short path', function (t) {
      var uid = "123";
      var itemRef = ref.child('queues/login/' + uid);
      var key = itemRef.push().key;
      itemRef.child(key).set({
        now: now
      });
      var handler = function (snap) {
        var log = snap.val();
        snap.ref.remove()
          .then(function () {
            if (log.addHandled) {
              t.equal(log.addHandled.uid, uid);
              t.equal(log.addHandled.key, key);
            } else {
              t.equal(log.removeHandled.uid, uid);
              t.equal(log.removeHandled.key, key);
              t.end();
              logsRef.off('child_added', handler);
            }
          });
      };
      logsRef.on('child_added', handler);
    });

    test('add long path', function (t) {
      var uid = "123";
      var itemRef = ref.child('/queues/change/' + uid + '/static/path/parts');
      var key = itemRef.push().key;
      itemRef.child(key).set({
        now: now
      });
      var handler = function (snap) {
        var log = snap.val();
        snap.ref.remove()
          .then(function () {
            if (log.addHandled) {
              t.equal(log.addHandled.uid, uid);
              t.equal(log.addHandled.key, key);
            } else {
              t.equal(log.removeHandled.uid, uid);
              t.equal(log.removeHandled.key, key);
              t.end();
              logsRef.off('child_added', handler);
            }
          });
      };
      logsRef.on('child_added', handler);
    });

    test('must end empty', function (t) {
      t.plan(1);
      ref.once('value')
        .then(function (snap) {
          t.equal(snap.val(), null);
        });
    });


    // setTimeout(function () {
    //   var pushPromises = [];
    //   var pushKeys = {};
    //   ['123', '456', '789'].forEach(function (uid) {
    //     var userLoginQueuesRef = ref.child('queues/login/' + uid);
    //     var changeQueueRef = ref.child('queues/change/' + uid + '/static/path/parts');
    //     var key = userLoginQueuesRef.push().key;

    //     pushKeys[key] = uid;

    //     pushPromises.push(userLoginQueuesRef.child(key).set({
    //       login: now
    //     }));

    //     pushPromises.push(changeQueueRef.child(key).set({
    //       updated: now
    //     }));
    //   });

    //   Promise.all(pushPromises)
    //     .then(function() {
    //       ref.child('log').on('child_added', function(snap) {
    //         console.log('snap.val', snap.val());
    //       });
    //     });
    // }, 1000);

  });


