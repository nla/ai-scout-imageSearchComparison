const express = require('express') ;
const router = express.Router() ;
const log = require('log4js').getLogger('home') ;
const util = require('../util/utils') ;
const https = require('https') ;

let appConfig = null ;
        
function init(appConfigParm) {

  appConfig = appConfigParm ;
  router.get('/*',		    async (req, res) => { proxy(req, res) }) ;
  return router ;  
}

async function proxy(req, res) {    // simple image proxy to avoid csp

  // we expect the url to be  proxy/nla.obj-919410547/image" 
 

  try {
    console.log('proxy: ' + req.url) ;
    let i = req.url.indexOf('/proxy') ;
    let nlaObj = (i >= 0) ? req.url.substring(i+6) : req.url ;
    console.log("nlaObj " + nlaObj)

    let x = req.headers ;
    delete x.host ;
    delete x.cookie ;

    const options = {
      hostname: 'nla.gov.au',
      port: 443,
      path: nlaObj,
      method: req.method,
      headers: {
        ...req.headers
      }
    } ;

    console.log("proxy set OPTIONS=" + JSON.stringify(options)) ;

    const proxy = https.request(options, function (r) {
      console.log("PROXY RET statusCode " + r.statusCode + " msg " + r.statusMessage + " headers " + JSON.stringify(r.headers)) ;
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res, {
        end: true
      });
    });

    req.pipe(proxy, {
      end: true
    });
  }
  catch (err) {
    console.log("proxy failed " + err) ;
    console.log(err.stack) ;
    res.write("failed") ;
    res.end() ;
  }
}

module.exports.init = init ;