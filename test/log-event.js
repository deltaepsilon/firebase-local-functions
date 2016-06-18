module.exports = function (e) {
  var uid = e.params.uid;
  var val = e.data.val();
  if (val) {
    e.data.ref.root.child('localFunctions/test/logs').push({
      addHandled: {
        uid: uid,
        key: e.data.key,
        parent: e.data.ref.toString()  
      }
    })
    .then(function() {
      return e.data.ref.remove();
    });
  } else {
    return e.data.ref.root.child('localFunctions/test/logs').push({
      removeHandled: {
        uid: uid,
        key: e.data.key,
        parent: e.data.ref.toString()
      }
    });
  }
};