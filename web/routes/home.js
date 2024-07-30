const express = require('express') ;
const router = express.Router() ;
const log = require('log4js').getLogger('home') ;
const util = require('../util/utils') ;
const solr = require('../util/solr') ;
const axios = require('axios') ;


let appConfig = null ;
        
function init(appConfigParm) {

  appConfig = appConfigParm ;
  router.get('/',		    async (req, res) =>   { index(req, res) }) ;
  router.post('/',		  async (req, res) =>   { setName(req, res) }) ;
  return router ;  
}

async function setName(req, res) {

  let optionalUserIdentifier = req.body.optionalUserIdentifier ;
  if (optionalUserIdentifier)  
    res.cookie('optionalUserIdentifier', optionalUserIdentifier, { maxAge: 3600 * 24 * 100, httpOnly: true }) ;

  res.render('home', {req: req, optionalUserIdentifier: optionalUserIdentifier}) ;
}

async function index(req, res) {

  let optionalUserIdentifier = req.cookies.optionalUserIdentifier ;

  res.render('home', {req: req, optionalUserIdentifier: optionalUserIdentifier}) ;
}

module.exports.init = init ;