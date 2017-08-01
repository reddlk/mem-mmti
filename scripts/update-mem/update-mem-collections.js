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
var sessionId               = '';
var singleCode              = ''

var args = process.argv.slice(2);
if (args.length < 4) {
	console.log('using default localhost connection:', defaultConnectionString);
	sessionId  = args[0];
	singleCode = args[1]; // single project rather than all
	url        = defaultConnectionString;
} else {
	username   = args[0];
	password   = args[1];
	host       = args[2];
	db         = args[3];
	sessionId  = args[4];
	singleCode = args[5]; // single project rather than all
	url        = 'mongodb://' + username + ':' + password + '@' + host + ':27017/' + db;
}

var getProjectCollectionsFromMEM = function(code) {
	return new Promise(function(resolve, reject) {
		console.log(': getting collections for "' + code + '" from MEM');
		var memCode = mapToMemProjectCode(code);
		request({
			url     : 'https://mines.empr.gov.bc.ca/api/collections/project/' + memCode,
			method  : 'GET',
			headers : {
				'User-Agent' : 'request',
				'Cookie'     : 'sessionId=' + sessionId
			}
		}, function(err, res, body) {
			if (err) {
				console.log('x error fetching collections for "' + code + '": ' + err);
				resolve();
			} else if (res.statusCode != 200) {
				console.log('x ' + res.statusCode + ' while fetching collections for "' + code + '"');
				resolve();
			} else if (!body) {
				console.log('x failed to fetch collections for "' + code + '"');
				resolve();
			} else {
				var collections = JSON.parse(body)
				console.log(': successfully fetched ' + collections.length + ' collection(s) for "' + code + '"');
				resolve(collections);
			}
		});
	});
}

var getProjectFromMEM = function(code) {
	return new Promise(function(resolve, reject) {
		console.log(': getting project "' + code + '" from MEM');
		var memCode = mapToMemProjectCode(code);
		request({
			url     : 'https://mines.empr.gov.bc.ca/api/project/bycode/' + memCode,
			method  : 'GET',
			headers : {
				'User-Agent' : 'request',
				'Cookie'     : 'sessionId=' + sessionId
			}
		}, function(err, res, body) {
			if (err) {
				console.log('x error fetching project for "' + code + '": ' + err);
				resolve();
			} else if (res.statusCode != 200) {
				console.log('x ' + res.statusCode + ' while fetching project for "' + code + '"');
				resolve();
			} else if (!body) {
				console.log('x failed to fetch project for "' + code + '"');
				resolve();
			} else {
				var project = JSON.parse(body)
				console.log(': successfully fetched MEM project for "' + code + '"');
				resolve(project);
			}
		});
	});
}

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

var mapToMemProjectCode = function(code) {
	switch (code) {
		case 'brule':
			return 'brule-dillon';
		case 'copper-mountain':
			return 'copper-mountain-similco';
		case 'highland-valley-copper':
			return 'highland-valley-copper-hvc';
		default:
			return code;
	};
};

var getCollectionParentType = function(collection) {
	if (collection.parentType) return collection.parentType;

	switch (collection.type) {
		case 'Permit':
		case 'Permit Amendment':
			return 'Authorizations';

		case 'Inspection Report':
			return 'Compliance and Enforcement';

		case 'Annual Report':
		case 'Management Plan':
		case 'Dam Safety Inspection':
			return 'Other';

		default:
			console.log('x unknown collection type: ' + collection.type);
			return 'Other';
	}
};

var getDocumentURL = function(collectionDocument) {
	return (collectionDocument && collectionDocument.document) ? 'https://mines.empr.gov.bc.ca/api/document/' + collectionDocument.document._id + '/fetch' : '';
};

var updateProject = function(db, project) {
	var authorizationList  = [];
	var inspectionList     = [];
	var otherDocumentsList = [];

	var projects = db.collection('projects');

	return getProjectFromMEM(project.code)
		.then(function(memProject) {
			project.memPermitID = memProject.memPermitID;
			// Get project collections from MEM
			return getProjectCollectionsFromMEM(project.code);
		})
		.then(function(collections) {
			var collectionPromises = [];
			_.each(collections, function(collection) {
				switch (getCollectionParentType(collection)) {
					case 'Authorizations':
						authorizationList.push(getAuthorization(project, collection));
						break;
					case 'Compliance and Enforcement':
						inspectionList.push(getInspection(project, collection));
						break;
					case 'Other':
						otherDocumentsList.push(getOtherDocument(project, collection));
						break;
				}
			});
		})
		.then(function() {
			// Clear out the old authorizations
			console.log(': removing MEM/ENV authorizations for "' + project.code + '"');
			return db.collection('authorizations').remove({ projectCode: project.code, $or:[{ agencyCode: 'MEM' }, { agencyCode: 'ENV' }] });
		})
		.then(function() {
			// Clear out the old inspections
			console.log(': removing MEM/ENV inspections for "' + project.code + '"');
			return db.collection('inspections').remove({ projectCode: project.code, $or:[{ inspectionName: /MEM/ }, { inspectionName: /EMPR/ }, { inspectionName: /ENV/ }] });
		})
		.then(function() {
			// Clear out the old other documents
			console.log(': removing other documents for "' + project.code + '"');
			return db.collection('otherdocuments').remove({ projectCode: project.code });
		})
		.then(function() {
			console.log(': adding ' + authorizationList.length + ' authorization(s) for "' + project.code + '"');
			if (authorizationList.length > 0) {
				return db.collection('authorizations').insertMany(authorizationList);
			}
		})
		.then(function() {
			console.log(': adding ' + inspectionList.length + ' inspections(s) for "' + project.code + '"');
			if (inspectionList.length > 0) {
				return db.collection('inspections').insertMany(inspectionList);
			}
		})
		.then(function() {
			console.log(': adding ' + otherDocumentsList.length + ' other document(s) for "' + project.code + '"');
			if (otherDocumentsList.length > 0) {
				return db.collection('otherdocuments').insertMany(otherDocumentsList);
			}
		});
}

var getAuthorization = function(project, collection) {
	var id   = '';
	var name = collection.displayName;

	if (collection.isForMEM) {
		id = project.memPermitID;
	} else if (collection.isForENV) {
		var matches = name.match('^(.+) - (.+)$');
		if (matches) {
			id   = matches[1];
			name = matches[2];
		}
	}

	var authorization =
	{
		_schemaName          : 'Authorization',
		authorizationID      : id,
		followUpDocuments    : [],
		authorizationSummary : '',
		authorizationDate    : collection.date,
		documentStatus       : collection.status || (collection.type === 'Permit Amendment' ? 'Amended' : 'Issued'),
		documentType         : 'Permit',
		documentName         : name,
		documentURL          : getDocumentURL(collection.mainDocument),
		actName              : collection.isForMEM ? 'Mines Act' : (collection.isForENV ? 'Environmental Management Act' : ''),
		agencyName           : collection.isForMEM ? 'Ministry of Energy and Mines' : (collection.isForENV ? 'Ministry of Environment' : ''),
		agencyCode           : collection.isForMEM ? 'MEM' : (collection.isForENV ? 'ENV' : ''),
		projectCode          : project.code,
		projectName          : project.name,
		projectId            : project._id,
		__v                  : 0
	};

	authorization.followUpDocuments.push({
		name : collection.mainDocument && collection.mainDocument.document ? collection.mainDocument.document.displayName : '',
		ref  : getDocumentURL(collection.mainDocument),
	});

 	_.each(collection.otherDocuments, function(otherDoc) {
		authorization.followUpDocuments.push({
			name : otherDoc && otherDoc.document ? otherDoc.document.displayName : '',
			ref  : getDocumentURL(otherDoc),
		});
	});

	return authorization;
};

var getInspection = function(project, collection) {
	var inspection =
	{
		_schemaName       : 'Inspection',
		authorizationID   : '',
		followUpDocuments : [],
		documentName      : collection.displayName,
		documentURL       : getDocumentURL(collection.mainDocument),
		recentFollowUp    : '',
		inspectionSummary : '',
		inspectorInitials : '',
		inspectionDate    : collection.date,
		inspectionNum     : collection.displayName,
		inspectionName    : (collection.isForMEM ? 'EMPR-' : (collection.isForENV ? 'ENV-' : '')) + collection.displayName + (collection.isForMEM ? ' (Ministry of Energy, Mines and Petroleum Resources)' : (collection.isForENV ? ' (Ministry of Environment)' : '')),
		orgCode           : '',
		projectCode       : project.code,
		projectName       : project.name,
		projectId         : project._id,
		__v               : 0
	};

	inspection.followUpDocuments.push({
		name : collection.mainDocument && collection.mainDocument.document ? collection.mainDocument.document.displayName : '',
		ref  : getDocumentURL(collection.mainDocument),
	});

 	_.each(collection.otherDocuments, function(otherDoc) {
		inspection.followUpDocuments.push({
			name : otherDoc && otherDoc.document ? otherDoc.document.displayName : '',
			ref  : getDocumentURL(otherDoc),
		});
	});

	return inspection;
};

var getOtherDocument = function(project, collection) {
	var otherDocument =
	{
		_schemaName      : 'OtherDocument',
		date             : collection.date,
		documents        : [],
		documentName     : collection.displayName,
		documentURL      : getDocumentURL(collection.mainDocument),
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

	otherDocument.documents.push({
		name : collection.mainDocument && collection.mainDocument.document ? collection.mainDocument.document.displayName : '',
		ref  : getDocumentURL(collection.mainDocument),
		date : collection.mainDocument && collection.mainDocument.document ? collection.mainDocument.document.date : ''
	});

 	_.each(collection.otherDocuments, function(otherDoc) {
		otherDocument.documents.push({
			name : otherDoc && otherDoc.document ? otherDoc.document.displayName : '',
			ref  : getDocumentURL(otherDoc),
			date : otherDoc && otherDoc.document ? otherDoc.document.date : '',
		});
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
				return getLocalProjects(database);
			})
			.then(function(projects) {
				console.log('processing projects...');
				var projectPromises = []
				_.each(projects, function(project) {
					projectPromises.push(updateProject(database, project));
				});
				return Promise.all(projectPromises);
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
