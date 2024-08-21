const express = require('express') ;
const router = express.Router() ;
const log = require('log4js').getLogger('home') ;
const solr = require('../util/solr') ;
const axios = require('axios') ;
const utils = require('../util/utils');

let appConfig = null ;
        
function init(appConfigParm) {

  appConfig = appConfigParm ;
  router.get('/testSearch',		        async (req, res) => { testSearch(req, res) }) ;
  router.get('/testSimilarity',	      async (req, res) => { testSimilarity(req, res) }) ;
  return router ;  
}

const abSimilaritySets = [
  {id:0,  desc: "CLIP similarity", matchField: "imageVector"},
  {id:1,  desc: "Metadata similarity", matchField: "nomicMetadataEmbedding"},
  {id:2,  desc: "OpenAI description similarity", matchField:"nomicOpenAIDescriptionEmbedding"},
  {id:3,  desc: "Phi-3 description similarity", matchField: "nomicMsVisionDescriptionEmbedding"}
]


async function testSimilarity(req, res) {

  console.log("in testSimilarity rq=" +JSON.stringify(req.query));

  try {
    let a = -1 ;
    let b = -1 ;
  
    if (req.query) {
      if (req.query.a) a = req.query.a ;
      if (req.query.b) b = req.query.b ;
    }

    if (a < 0) a = Math.floor(Math.random() * abSimilaritySets.length) ;
    if (b < 0) {
      while (true) {
        b = Math.floor(Math.random() * abSimilaritySets.length) ;
        if (b != a) break ;
      }
    }

    if ((a >= abSimilaritySets.length) || (b >= abSimilaritySets.length)) throw ("a and b must be less than " + abSimilaritySets.length) ;
    

    let targetImage = await getTargetImageForSimilarity() ;
    let aRes = await getSimilaritySet(abSimilaritySets[a], targetImage) ;
    let bRes = await getSimilaritySet(abSimilaritySets[b], targetImage) ;

    console.log("ready abSimilaritySets: " + JSON.stringify(abSimilaritySets) + " a:" + a + " b: " + b +
        " targetImage id" + targetImage.id + " aRes count " + aRes.docs.length + " bRes count " + bRes.docs.length) ;

    res.render('testSimilarity', {req: req, appConfig: appConfig, abSets: abSimilaritySets, a: a, b: b,
        targetImage: targetImage, aRes: aRes, bRes: bRes}) ;
  }
  catch (err) {
    res.write("Error: " + err) ;
    res.end() ;
    console.log("testSimilarity err:" + err) ;
    console.log(err.stack) ;
  }
}

async function getTargetImageForSimilarity() {

  // find a random image..
  let loop = 0 ;
  while (true) {
      if (loop++ > 10) throw "cant find a random image record!?" ;

      let rand = Math.floor(Math.random() * 9999) ; // 0.9999
      if (rand < 10) rand = "000" + rand ;
      else if (rand < 100) rand = "00" + rand ;
      else if (rand < 1000) rand = "0" + rand ;
      else rand = "" + rand ; // a string..
 
      const searchParameters = 
        "&wt=json&rows=20&q.op=AND" +
        "&fl=id,title,imageVector,nomicMetadataEmbedding,nomicOpenAIDescriptionEmbedding,nomicMsVisionDescriptionEmbedding" +
        "&q=id:(*" + rand + "*)"

      console.log("getTargetImageForSimilarity query " + searchParameters) ;
  
      let results = await solr.search(searchParameters, appConfig.comparisonImageSearchPicturesCore) ;
      if (!results.docs || results.docs.length < 1) {
        console.log("getTargetImageForSimilarity found none for id " + rand) ;
        continue ;
      }
      let selected = results.docs[0] ;
      if (results.docs.length > 1) {
        let dr = Math.floor(Math.random() * results.docs.length) ;
        selected = results.docs[dr] ;
      }
      return selected ;
  }  
}

async function getSimilaritySet(abSimilaritySet, targetImage) {

  let embedding = targetImage[abSimilaritySet.matchField] ;
  
  const searchParameters = 
    "&wt=json&rows=20&q.op=AND" +
    "&fl=id,title,score" +
    "&q=({!knn f=" + abSimilaritySet.matchField + " topK=50}" + JSON.stringify(embedding) + ")"  ;

  return await solr.search(searchParameters, appConfig.comparisonImageSearchPicturesCore) ;
}


function setEmbeddingsAsFloats(rawEmbedding) { // fixes a problem where embedding has to much precision and blows up SOLR
 
  for (let k=0;k<rawEmbedding.length;k++)rawEmbedding[k] = Number(rawEmbedding[k]).toFixed(8) ;
  return rawEmbedding ;
}


const abSearchSets = [
  {id:0,  desc: "Image semantic similarity: compares the CLIP embedding of the image with the CLIP embedding of the query text", bq: clipBQ},
  {id:1,  desc: "NLA metadata keyword: compares the NLA metadata text with the query text (traditional Lucene TF/IDF approach)", bq: metaBQ},
  {id:2,  desc: "OpenAI description keyword: compares the OpenAI description text with the query text (traditional Lucene TF/IDF approach).", bq: openAIBQ},
  {id:3,  desc: "Phi-3 description keyword: compares the Phi-3 description text with the query text (traditional Lucene TF/IDF approach).", bq: phi3BQ},
  {id:4,  blends: [{source: 0, perc: 80}, {source: 1, perc:20}]},
  {id:5,  blends: [{source: 0, perc: 50}, {source: 1, perc:50}]},
  {id:6,  blends: [{source: 0, perc: 80}, {source: 2, perc:20}]},
  {id:7,  blends: [{source: 0, perc: 50}, {source: 2, perc:50}]},
  {id:8,  blends: [{source: 0, perc: 80}, {source: 3, perc:20}]},
  {id:9,  blends: [{source: 0, perc: 20}, {source: 3, perc:50}]},
  {id:10, blends: [{source: 0, perc: 50}, {source: 2, perc:30}, {source: 1, perc:20}]},
  {id:10, blends: [{source: 0, perc: 50}, {source: 3, perc:30}, {source: 1, perc:20}]}
] ;


async function testSearch(req, res) {

  console.log("in testSearch rq=" +JSON.stringify(req.query));

  try {
    let stxt = "" ;
    let a = 0 ;
    let b = 1 ;
  
    if (req.query) {
      if (req.query.stxt) stxt = req.query.stxt ;
      if (req.query.a) a = req.query.a ;
      if (req.query.b) b = req.query.b ;
    }
    if ((a >= abSearchSets.length) || (b >= abSearchSets.length)) throw ("a and b must be less than " + abSearchSets.length) ;
    stxt = cleanseLite(stxt).trim() ;

    let aRes = (stxt) ? await runSearchSet(abSearchSets[a], stxt) : null ;
    let bRes = (stxt) ? await runSearchSet(abSearchSets[b], stxt) : null ;

    res.render('testSearch', {req: req, appConfig: appConfig, stxt: stxt, abSets: abSearchSets, a: a, b: b,
        aRes: aRes, bRes: bRes}) ;
  }
  catch (err) {
    res.write("Error: " + err) ;
    res.end() ;
    console.log("testSearch err:" + err) ;
    console.log(err.stack) ;
  }
}

async function runSearchSet(set, stxt) {

    console.log("runSearchSet " + JSON.stringify(set)) ;
    let searchParameters = SEARCH_COMMON + "&q=" + await buildQuery(set, stxt) ;

    console.log("set: " + JSON.stringify(set) + "\nquery: len" + searchParameters.length + ": " + searchParameters.replaceAll(/\[[^\]]*\]/gi, "[..vectors..]")) ;

    return await solr.search(searchParameters, appConfig.comparisonImageSearchPicturesCore) ;
}

async function buildQuery(set, stxt) {

  if (set.blends) {
    let clauses = [] ;
    for (let blend of set.blends)  
      clauses.push("(" + await buildQuery(abSearchSets[blend.source], stxt) + ")^" + blend.perc) ;
    return clauses.join(" OR ") ;
  }
  return  await set.bq(stxt) ;
}

const SEARCH_COMMON = 
  "&wt=json&rows=10" + 
  "&q.op=AND" +
  "&fl=id,url,contentType,title,metadataText,bibId,formGenre,format,author,originalDescription,notes,incomingUrls," +
      "openAIDescription,msVisionDescription,score" ; 

async function clipBQ(stxt) {

  let embedding = await utils.getClipTextEmbedding(stxt) ;
  return "({!knn f=imageVector topK=50}" + JSON.stringify(embedding) + ")"  ;
}

async function metaBQ(stxt) {

  return "title:(\"" + stxt + "\")^0.8 OR titleStemmed:(" + stxt + ")^0.4 OR " +
         "metadataText:(\"" + stxt + "\")^0.3 OR metadataTextStemmed:(" + stxt + ")^0.1" ;
}

async function openAIBQ(stxt) {

  let embedding = await utils.getNomicEmbedding(stxt) ;
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
