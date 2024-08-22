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

  try {
    let optionalUserIdentifier = req.body.optionalUserIdentifier ;
    if (optionalUserIdentifier)  
      res.cookie('optionalUserIdentifier', optionalUserIdentifier, { maxAge: 3600 * 24 * 100, httpOnly: true }) ;
    else {  // clear cookies
      console.log("clearing cookies") ;
      res.clearCookie('optionalUserIdentifier') ;
      res.clearCookie('evaluationProgress') ;    
    }
    res.render('home', {req: req, optionalUserIdentifier: optionalUserIdentifier}) ;
  }
  catch (err) {
    res.send("Error: " + err) ;
    res.end() ;
    console.log("setName err:" + err) ;
    console.log(err.stack) ;
  }
}

async function index(req, res) {

  try {
    let optionalUserIdentifier = req.cookies.optionalUserIdentifier ;
    let evaluationProgress = req.cookies.evaluationProgress ; // next search S-nn    or next similarity M-nn

    res.render('home', {req: req, optionalUserIdentifier: optionalUserIdentifier, evaluationProgress: evaluationProgress}) ;
  }
  catch (err) {
    res.send("Error: " + err) ;
    res.end() ;
    console.log("index err:" + err) ;
    console.log(err.stack) ;
  }
}

module.exports.init = init ;