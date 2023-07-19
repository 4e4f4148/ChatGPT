var edge = require('selenium-webdriver/edge');

var service = new edge.ServiceBuilder()
    .setPort(55555)
    .build();

var options = new edge.Options();
// configure browser options ...

var driver = edge.Driver.createSession(options, service);

