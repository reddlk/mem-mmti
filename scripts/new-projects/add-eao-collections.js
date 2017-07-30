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

var collections = require('./new-eao-collections.json');

var projectList = [];

var getProjects = function(db) {
	return new Promise(function(resolve, reject) {
		var projects = db.collection('projects');

		projects.find({}, { name: 1, code: 1 }).toArray(function(err, object) {
			if (err) {
				console.log('x Failed to find projects');
				reject(err);
			} else {
				console.log(': Found projects');
				projectList = object;
				resolve(object);
			}
		});

	});
};

var findProject = function(code) {
	return _.find(projectList, { code: code });
};

var getAuthorization = function(collection) {
	var project = findProject(collection['Code']);

	var authorization =
	{
		_schemaName          : 'Authorization',
		authorizationID      : collection['ID'],
		followUpDocuments    : [],
		authorizationSummary : '',
		authorizationDate    : collection['Date'],
		documentStatus       : collection['Type'] === 'Certificate Amendment' ? 'Amended' : 'Issued',
		documentType         : 'Certificate',
		documentName         : collection['Collection Name'],
		documentURL          : collection['Documents'][0]['Doc URL'],
		actName              : 'Environmental Assessment Act',
		agencyName           : 'Environmental Assessment Office',
		agencyCode           : 'EAO',
		projectCode          : project.code,
		projectName          : project.name,
		projectId            : project._id,
		__v                  : 0
	};

	authorization.followUpDocuments = _.map(collection['Documents'], function(doc) {
		return {
			name : doc['Doc Name'],
			ref  : doc['Doc URL'],
		};
	});

	return authorization;
};

var getInspection = function(collection) {
	var project = findProject(collection['Code']);

	var inspection =
	{
		_schemaName       : 'Inspection',
		authorizationID   : '',
		followUpDocuments : [],
		documentName      : collection['Collection Name'],
		documentURL       : collection['Documents'][0]['Doc URL'],
		recentFollowUp    : '',
		inspectionSummary : '',
		inspectorInitials : '',
		inspectionDate    : collection['Date'],
		inspectionNum     : '',
		inspectionName    : 'EAO- (Environmental Assessment Office)',
		orgCode           : '',
		projectCode       : project.code,
		projectName       : project.name,
		projectId         : project._id,
		__v               : 0
	};

	inspection.followUpDocuments = _.map(collection['Documents'], function(doc) {
		return {
			name : doc['Doc Name'],
			ref  : doc['Doc URL'],
		};
	});

	return inspection;
};

var getOtherDocument = function(collection) {
	var project = findProject(collection['Code']);

	var otherDocument =
	{
		_schemaName      : 'OtherDocument',
		date             : collection['Date'],
		documents        : [],
		documentName     : collection['Collection Name'] || collection['Documents'][0]['Doc Name'],
		documentType     : collection['Type'],
		documentFileName : '',
		agencies         : [],
		heading          : '',
		filename         : '',
		link             : '',
		title            : '',
		source           : '',
		projectCode      : project.code,
		projectName      : project.name,
		projectId        : project._id,
		__v              : 0
	};

	otherDocument.documents = _.map(collection['Documents'], function(doc) {
		return {
			name : doc['Doc Name'],
			ref  : doc['Doc URL'],
			date : doc['Doc Date'] || Date.now(),
		};
	});

	return otherDocument;
};

var run = function () {
	var database = null;
	var authorizationList = [];
	var inspectionList = [];
	var otherDocumentsList = [];

	return new Promise(function (resolve, reject) {
		console.log('start');
		MongoClient.connect(url)
			.then(function(db) {
				console.log('db connected');
				database = db;
			})
			.then(function() {
				console.log('getting projects');
				return getProjects(database);
			})
			.then(function() {
				console.log('processing collections...');
				_.each(collections, function(collection) {
					switch(collection['Type']) {
						case 'Certificate':
						case 'Certificate Amendment':
							authorizationList.push(getAuthorization(collection));
							break;
						case 'Inspection Report':
							inspectionList.push(getInspection(collection));
							break;
						case 'Management Plan':
						case 'Annual Report':
							otherDocumentsList.push(getOtherDocument(collection));
							break;
						default:
							console.log('x unknown type: ' + collection['Type']);
					}
				});
			})
			.then(function() {
				console.log('adding ' + authorizationList.length + ' authorization(s)...');
				if (authorizationList.length > 0) {
					database.collection('authorizations').insertMany(authorizationList);
				}
			})
			.then(function() {
				console.log('adding ' + inspectionList.length + ' inspections(s)...');
				if (inspectionList.length > 0) {
					database.collection('inspections').insertMany(inspectionList);
				}
			})
			.then(function() {
				console.log('adding ' + otherDocumentsList.length + ' other document(s)...');
				if (otherDocumentsList.length > 0) {
					database.collection('otherdocuments').insertMany(otherDocumentsList);
				}
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
