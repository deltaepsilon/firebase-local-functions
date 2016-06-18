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