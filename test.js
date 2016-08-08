var test = require('tape');
var firebase = require('firebase');
var path = 'localFunctions/test';
var firebaseConfig = require('./env.json').firebaseConfig;

firebase.initializeApp(firebaseConfig);

var ref = firebase.database().ref(path);
ref.remove()
  .then(function () {
    // Bootstrap local-functions runner
    var runner = require('./index.js')({
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
      runner.once('ready', function () {
        ref.once('value')
          .then(function (snap) {
            t.equal(snap.val(), null);
          });
      });
    });

    test('add short path', function (t) {
      t.plan(7);
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
              t.equal(log.addHandled.event._newData.now, now);
              t.equal(log.addHandled.event._delta.now, now);
            } else {
              t.equal(log.removeHandled.uid, uid);
              t.equal(log.removeHandled.key, key);
              t.equal(log.removeHandled.event._data.now, now);
              // t.end();
              logsRef.off('child_added', handler);
            }
          })
          .catch(function (err) {
            console.log('remove error', err);
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
              t.equal(log.addHandled.event._newData.now, now);
              t.equal(log.addHandled.event._delta.now, now);
            } else {
              t.equal(log.removeHandled.uid, uid);
              t.equal(log.removeHandled.key, key);
              t.equal(log.removeHandled.event._data.now, now);
              t.end();
              logsRef.off('child_added', handler);
            }
          })
          .catch(function (err) {
            console.log('remove error', err);
          });
      };
      logsRef.on('child_added', handler);
    });

    test('track change', function (t) {
      var uid = "456";
      var itemRef = ref.child('queues/login/' + uid);
      var key = itemRef.push().key;
      var loginRef = itemRef.child(key);
      loginRef.set({
        now: now
      });
      var handler = function (snap) {
        var log = snap.val();
        if (log.addHandled && log.addHandled.event._newData && !log.addHandled.event._newData.then) {
          snap.ref.remove()
            .then(function () {
              t.equal(log.addHandled.uid, uid);
              t.equal(log.addHandled.key, key);
              t.equal(log.addHandled.event._newData.now, now);
              t.equal(log.addHandled.event._delta.now, now);
              loginRef.update({
                then: now
              });
            });
        } else {
          snap.ref.remove()
            .then(function() {
              return log.addHandled ?  loginRef.remove() : true; 
            })
            .then(function () {
              if (log.addHandled) {
                t.equal(log.addHandled.uid, uid);
                t.equal(log.addHandled.key, key);
                t.equal(log.addHandled.event._newData.then, now);
                t.equal(log.addHandled.event._delta.then, now);
              } else {
                t.equal(log.removeHandled.uid, uid);
                t.equal(log.removeHandled.key, key);
                t.equal(log.removeHandled.event._data.now, now);
                t.end();
                logsRef.off('child_added', handler);
              }
            })
            .catch(function (err) {
              console.log('remove error', err);
            });
        }
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

  });


