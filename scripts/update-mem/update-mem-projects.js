'use strict';

var MongoClient = require('mongodb').MongoClient;
var Promise     = require('promise');
var request     = require('request');
var _           = require('lodash');

var defaultConnectionString = 'mongodb://localhost:27017/mmti-dev';
var username                = '';
var password                = '';
var host                    = '';
var db                      = '';
var url                     = '';
var filename                = '';

var args = process.argv.slice(2);
if (args.length < 4) {
	console.log('using default localhost connection:', defaultConnectionString);
	filename  = args[0];
	url       = defaultConnectionString;
} else {
	username   = args[0];
	password   = args[1];
	host       = args[2];
	db         = args[3];
	filename   = args[4];
	url        = 'mongodb://' + username + ':' + password + '@' + host + ':27017/' + db;
}

var updates = require(filename || './projects-updates-2.json');

var getLocalProjects = function(db) {
	return new Promise(function(resolve, reject) {
		var query = singleCode ? { code: singleCode } : {};
		db.collection('projects').find(query, { name: 1, code: 1 }).sort({ code: 1 }).toArray(function(err, object) {
			if (err) {
				console.log('x failed to find projects');
				reject(err);
			} else {
				console.log(': found projects');
				resolve(object);
			}
		});
	});
};

var run = function () {
	return new Promise(function (resolve, reject) {
		console.log('start');
		MongoClient.connect(url)
			.then(function(db) {
				console.log('db connected');
				return db;
			})
			.then(function(db) {
				console.log('processing projects...');
				var projects = db.collection('projects');

				var updatePromises = []
				_.each(updates, function(update) {
					var code = update.code;
					if (code) {
						console.log(': updating ' + code);
						updatePromises.push(projects.update({ code: code }, { $set: _.omit(update, ['code']) }));
					} else {
						console.log("Unexpected. Could not find project code in update", update);
					}
				});
				return Promise.all(updatePromises);
			})
			.then(function(data) {
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
