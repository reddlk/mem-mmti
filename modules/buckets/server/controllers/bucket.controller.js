'use strict';
// =========================================================================
//
// Controller for buckets
//
// =========================================================================
var path     = require('path');
var mongoose = require ('mongoose');
var CRUD     = require (path.resolve('./modules/core/server/controllers/core.crud.controller'));
var Model    = mongoose.model ('Bucket');

var crud = new CRUD (Model);
// -------------------------------------------------------------------------
//
// Basic CRUD
//
// -------------------------------------------------------------------------
exports.new    = crud.new    ();
exports.create = crud.create (function (m) {m.bucket = m._id;});
exports.read   = crud.read   ();
exports.update = crud.update ();
exports.delete = crud.delete ();
exports.list   = crud.list   ();
exports.base   = crud.list	 ({'project' : {'$exists' : true, '$eq' : null}});
exports.getObject   = crud.getObject   ();
