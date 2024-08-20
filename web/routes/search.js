const express = require('express') ;
const router = express.Router() ;
const log = require('log4js').getLogger('home') ;
const solr = require('../util/solr') ;
const axios = require('axios') ;
const utils = require('../util/utils');

let appConfig = null ;
        
function init(appConfigParm) {

  appConfig = appConfigParm ;
  router.get('/test',		              async (req, res) => { test(req, res) }) ;
  return router ;  
}

const abSets = [
  {id:0, desc: "Image semantic similarity: compares the CLIP embedding of the image with the CLIP embedding of the query text", bq: clipBQ},
  {id:1, desc: "NLA metadata keyword: compares the NLA metadata text with the query text (traditional Lucene TF/IDF approach)", bq: metaBQ},
  {id:2, desc: "OpenAI description keyword: compares the OpenAI description text with the query text (traditional Lucene TF/IDF approach).", bq: openAIBQ},
  {id:3, desc: "Phi-3 description keyword: compares the Phi-3 description text with the query text (traditional Lucene TF/IDF approach).", bq: phi3BQ},
  {id:4, blend1Id: 0, blend1Perc: 80, blend2Id: 1, blend2Perc:20},
  {id:5, blend1Id: 0, blend1Perc: 50, blend2Id: 1, blend2Perc:50},
  {id:6, blend1Id: 0, blend1Perc: 80, blend2Id: 2, blend2Perc:20},
  {id:7, blend1Id: 0, blend1Perc: 50, blend2Id: 2, blend2Perc:50},
  {id:8, blend1Id: 0, blend1Perc: 80, blend2Id: 3, blend2Perc:20},
  {id:9, blend1Id: 0, blend1Perc: 50, blend2Id: 3, blend2Perc:50}
] ;


async function test(req, res) {

  console.log("in test rq=" +JSON.stringify(req.query));

  try {
    let stxt = "" ;
    let a = 0 ;
    let b = 1 ;
  
    if (req.query) {
      if (req.query.stxt) stxt = req.query.stxt ;
      if (req.query.a) a = req.query.a ;
      if (req.query.b) b = req.query.b ;

    }
    if ((a >= abSets.length) || (b >= abSets.length)) throw ("a and b must be less than " + abSets.length) ;
    stxt = cleanseLite(stxt).trim() ;

    let aRes = (stxt) ? await runSet(abSets[a], stxt) : null ;
    let bRes = (stxt) ? await runSet(abSets[b], stxt) : null ;

    res.render('test', {req: req, appConfig: appConfig, stxt: stxt, abSets: abSets, a: a, b: b,
        aRes: aRes, bRes: bRes}) ;
  }
  catch (err) {
    res.write("Error: " + err) ;
    res.end() ;
    console.log("test err:" + err) ;
    console.log(err.stack) ;
  }
}

async function runSet(set, stxt) {

    console.log("runSet " + JSON.stringify(set)) ;
    let searchParameters = SEARCH_COMMON + "&q=" + await buildQuery(set, stxt) ;

    console.log("set: " + JSON.stringify(set) + "\nquery: len" + searchParameters.length + ": " + searchParameters.replaceAll(/\[[^\]]*\]/gi, "[..vectors..]")) ;

    return await solr.search(searchParameters, appConfig.comparisonImageSearchPicturesCore) ;
}

async function buildQuery(set, stxt) {

  if (set.hasOwnProperty("blend1Id")) {
    let q1 = await buildQuery(abSets[set.blend1Id], stxt) ;
    let q2 = await buildQuery(abSets[set.blend2Id], stxt) ;

    return "(" + q1 + ")^" + (set.blend1Perc / 100) + 
      "  OR (" + q2 + ")^" + (set.blend2Perc / 100) ;
  }
  return  await set.bq(stxt) ;
}

const SEARCH_COMMON = 
  "&wt=json&rows=20" + 
  "&q.op=AND" +
  "&fl=id,url,contentType,title,metadataText,bibId,formGenre,format,author,originalDescription,notes,incomingUrls," +
      "openAIDescription,msVisionDescription" ; 

async function clipBQ(stxt) {

  console.log("getting CLIP embedding for " + stxt) ;
  let embedding = await utils.getClipTextEmbedding(stxt) ;
  console.log(" got clip emedding len " + JSON.stringify(embedding).length) ;

  return "({!knn f=imageVector topK=50}" + JSON.stringify(embedding) + ")"  ;
}

async function metaBQ(stxt) {

  return "metadataText:(\"" + stxt + "\")^1 OR metadataTextStemmed:(" + stxt + ")^0.5" ;
}

async function openAIBQ(stxt) {

  console.log("getting nomic embedding for " + stxt) ;
  let embedding = await utils.getNomicEmbedding(stxt) ;
  console.log("GOT nomic embedding len: ") + JSON.stringify(embedding).length ;
  return "({!knn f=nomicOpenAIDescriptionEmbedding topK=50}" + JSON.stringify(embedding) + ")"  ;
}

async function phi3BQ(stxt) {

  let embedding = await utils.getNomicEmbedding(stxt) ;
  return "({!knn f=nomicMsVisionDescriptionEmbedding topK=50}" + JSON.stringify(embedding) + ")"  ;
}


function cleanseLite(parm) {

	if (typeof(parm) === 'string') return parm.replace(/[^-A-Za-z0-9 '():]/g, " ") ;
	return "" ;
}

function cleanseVeryLite(parm) {

	if (typeof(parm) === 'string') return parm.replace(/[^-A-Za-z0-9 .,\!\?'():;\n]/g, " ") ;
	return "" ;
}

function innerProduct(v1, v2) {

  let r = 0 ;
  for (let i=0;i<v1.length;i++) r +=  v1[i] * v2[i] ;
  
  return r ;
}

module.exports.init = init ;
