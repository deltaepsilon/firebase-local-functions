### Installation
- ```npm install --save-dev https://github.com/deltaepsilon/firebase-local-functions.git```
- Once it's public I hope to publish such that you can run ```npm install --save-dev firebase-local-functions```

### Specs
In order to run functions in both the Google Cloud Functions environment and the local environment, we need to decouple the functions and their specifications from the Firebase Functions call. We accomplish this by creating a ```specs.js``` file where we'll export all of our specs. Here's an example:

```
module.exports = [
  {
    name: 'userLogin',
    path: '/queues/login/{uid}/{loginId}',
    func: require('./log-event')
  },
  {
    name: 'userChange',
    path: '/queues/change/{uid}/static/path/parts/{changeId}/',
    func: require('./log-event')
  }
];
```

Notice how each function has a name, a path to listen to and the function itself. In this case we're logging events for test purposes, so the function is in ```./log-event.js``` and looks something like this:

```
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
```

### Running locally
Create a local runner file. I like to call mine ```runner.js```. Make it look something like this:

```
var localFunctions = require('firebase-local-functions')({
      specs: require('./specs.js'),
      firebaseConfig: {
        "databaseURL": "https://my-firebase.firebaseio.com",
        "serviceAccount": "./service-account.json",
        "secret": "ASDASDFADSFADSFADSFADSF"
      },
      path: 'somePath/development',
      params: {
	environment: 'development'
      }
    });
```

The ```secret``` attribute is your database secret, a.k.a. your legacy Firebase token, which ```firebase-local-functions``` uses to navigate the REST api regardless of your security rules.

The ```path``` attribute lets you listen to a node other than the root of your project.

The ```params``` attribute lets you set default params for every event. This is useful in the above example because your functions expect the {environment} parameter, but you can't pass wildcard paths into the ```path``` attribute... so use a static ```path``` and complement it with a static ```params``` object that will be merged onto the regular ```event.params``` object.

***Local Limitations***
Firebase Functions are called with event objects that have a simulated user-authenticated ref at ```event.data.ref```. This simulation is not possible locally. This "user" ref is equivalent to ```event.data.adminRef```.

### Running on Firebase infrastructure
You'll need to import all of your function into ```<project folder>/functions/index.js``` in order to run them. ```index.js``` can look something like this:

```
var functions = require('firebase-functions');
var specs = require('./specs');

specs.forEach(function (spec) {
  exports[spec.name] = functions.database().path('/somePath/{environment}' + spec.path).on('write', function (e) {
    if (e.params.environment !== 'development') {
      return spec.func.call(this, e);
    }
    return false;
  });
});
```

This example expects the data to be structured like so...

```
{
  somePath: {
    development: {
      ...
    },
    test: {
      ...
    },
    production: {
      ...
    }
  }
}
```

Nesting your data under environments like this is an easy way to develop, test and serve to production from the same infrastructure.

### getExisting filter function
I'm playing around with a new way of filtering out existing records when launching the runner. This is an attempt to match the behavior of the functions library... but doing this requires some light hackery. Originally I was querying all existing records and testing results of the ```child_added``` event against those records to exclude them. It was/is a messy way to handle it, although I thought it was mostly stable. This filtering takes place in a method named ```getExisting```.

I've added an alternative method of filtering out existing records. It involves using a query like ```ref.orderByKey().limitToLast(1).on('child_added', cb)```. This is a much more efficient way to clear out existing records, because I only have to keep track of the last record's key. The ```child_added``` event will fire for any new records added ***below*** the last record in the alphabetic sort, but it won't fire for anything added above the last record.

I'm making the ```getExisting``` filter optional. It's on be default, but you can disable it by adding ```skipGetExisting: true``` to your config like this:

```
{
  specs: require('./test/test-specs'),
  firebaseConfig: firebaseConfig,
  path: path,
  skipGetExisting: true
}
``` 

Adding the ```limitToLast(1)``` filter should result in slightly better performance for large lists, but not nearly as much of a perf gain as removing ```getExisting```.

However! Removing the ```getExisting``` filter assumes that you're not adding records ***above*** the last key in the sort. Doing this could result in ignored ```child_added``` events, because the ```limitToLast(1)``` call excludes everything above the last record. Also, if you remove that existing record and there are no records below it in the sort, the next record up will become the new last record, so it will get passed to the ```child_added``` callback.

Also, testing this package is tricky. It's hard to address all potential use cases. So let me know if you find a bug and I'll add a test case for your issue and get it fixed.

### Tests
Clone the repo and run ```npm install``` to get your dependencies. Then run ```node test.js``` to run the tests!
