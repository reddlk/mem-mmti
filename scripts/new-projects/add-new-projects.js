'use strict';

var MongoClient = require('mongodb').MongoClient;
var Promise     = require('Promise');
var _           = require('lodash');
var path        = require('path');

var defaultConnectionString = 'mongodb://localhost:27017/mmti-dev';
var username                = '';
var password                = '';
var host                    = '';
var db                      = '';
var url                     = '';

var args = process.argv.slice(2);
if (args.length !== 4) {
	console.log('Using default localhost connection:', defaultConnectionString);
	url = defaultConnectionString;
} else {
	username = args[0];
	password = args[1];
	host     = args[2];
	db       = args[3];
	url      = 'mongodb://' + username + ':' + password + '@' + host + ':27017/' + db;
}

var projects = require('./projects.json');

var run = function () {
	return new Promise(function (resolve, reject) {
		console.log('start');
		MongoClient.connect(url)
			.then(function(db) {
				console.log('db connected');
				return db.collection('projects');
			})
			.then(function(collection) {
				console.log('adding projects...');
				collection.insertMany(projects);
			})
			.then(function (data) {
				console.log('end');
				resolve(':)');
			}, function (err) {
				console.log('ERROR: end err = ', JSON.stringify(err));
				reject(err);
			});
	});
};

run().then(function(success) {
	console.log('success ', success);
	process.exit();
}).catch(function (error) {
	console.error('error ', error);
	process.exit();
});
