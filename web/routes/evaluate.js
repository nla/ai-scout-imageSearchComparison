const express = require('express') ;
const router = express.Router() ;
const fs = require('fs') ;
const log = require('log4js').getLogger('home') ;
const solr = require('../util/solr') ;
const axios = require('axios') ;
const utils = require('../util/utils') ;

let appConfig = null ;
        
function init(appConfigParm) {

  appConfig = appConfigParm ;
  router.post('/',		                async (req, res) => { evaluate(req, res) }) ;
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

const similarityCallibrationImages = ["", // dummy seq=0 entry - we start at 1 (like questions..)
  "nla.obj-161285481", "nla.obj-159249858", "nla.obj-162422253",
  "nla.obj-3284516716", "nla.obj-148911391" , "nla.obj-136835710", "nla.obj-159893642",
  "nla.obj-147716313", "nla.obj-232652175", "nla.obj-139829745", "nla.obj-2881549102",
  "nla.obj-152044606", "nla.obj-3088810834", "nla.obj-136469065", "nla.obj-139328926",
  "nla.obj-159092668", "nla.obj-145170241", "nla.obj-152573561" , "nla.obj-151447880",
  "nla.obj-1209799016", "nla.obj-153533075", "nla.obj-503947443", "nla.obj-140357064",
  "nla.obj-160451786", "nla.obj-142838917", "nla.obj-150140881", "nla.obj-146286848",
  "nla.obj-159763640", "nla.obj-137409017", "nla.obj-847179341", "nla.obj-160981535",
  "nla.obj-160529463", "nla.obj-151500576", "nla.obj-137011934", "nla.obj-133000693"
] ;

async function evaluate(req, res) {

  try {
    let optionalUserIdentifier = req.cookies.optionalUserIdentifier ;
    let evaluationProgress = req.cookies.evaluationProgress ; // next search S-nn    or next similarity M-nn

    if (!evaluationProgress || !evaluationProgress.match(/^[SM]\-\d\d$/)) evaluationProgress = "S-01" ; // "S-01" ;

    let match = evaluationProgress.match(/^([SM])\-(\d\d)$/) ;
    let series = match[1] ;
    let seq = parseInt(match[2]) ;
    if (seq < 1) seq = 1 ; // sheesh..

    switch (series) {
      case 'S': await showSearchEval(req, res, seq, optionalUserIdentifier) ;
                break ;
      case 'M': await showSimEval(req, res, seq, optionalUserIdentifier) ;
               break ;
    }
  }
  catch (err) {
    res.send("Error: " + err) ;
    res.end() ;
    console.log("evaluate err:" + err) ;
    console.log(err.stack) ;
  }

}

function clean(x) {
  
  x = "" + x ;
  x = x.replace(/[^-a-zA-Z0-9 \_\@\.\,\?\!\[\]\%]/g, ' ').trim() ;
  if (x.length > 60) x = x.substring(0, 60).trim() ;
  return x ;
}

async function writeEval(req, evalType, anyUser, seq, questionOrImage, a, aDesc, b, bDesc, eval) {

  if (!anyUser) anyUser = "_anonymous_" ;
  let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || '_unknown_' ;
  let ts = utils.currentTimestampAsYYYYMMDDHHmmSS() ;
  let line = ts + "\t" + ip + "\t" + 
            clean(anyUser) + "\t" + clean(seq) + "\t" + clean(questionOrImage) + "\t" +
            clean(a) + "\t" + clean(aDesc) + "\t" + clean(b) + "\t" + clean(bDesc) + "\t" + clean(eval) + "\n" ;
  fs.appendFileSync("data/" + evalType + ".tsv", line) ;
}

async function showSearchEval(req, res, seq, optionalUserIdentifier) {

  console.log("\nin searchEval seq= " + seq + " req=" +JSON.stringify(req.body));

  let questions = await utils.getQuestions() ;
  console.log("questions:" + JSON.stringify(questions) );

  // if eval, save it and increment seq
  if (req.body.question) {
    let lastQuestion = findQuestionForSeq(questions, parseInt(req.body.seq)) ;
    lastQuestion = cleanseLite(lastQuestion).trim() ;

    if (lastQuestion != req.body.question) throw "cookie/question mismatch " + req.body.seq + ": " + lastQuestion + "/" + req.body.question ;
    // save
    await writeEval(req, "search", optionalUserIdentifier, req.body.seq, req.body.question, 
      req.body.a, abSearchSets[parseInt(req.body.a)].desc || abSearchSets[parseInt(req.body.a)].sdesc,
      req.body.b, abSearchSets[parseInt(req.body.b)].desc || abSearchSets[parseInt(req.body.b)].sdesc,
      req.body.eval) ; 
     
    seq = parseInt(req.body.seq) + 1 ;      
  }

  if (seq > questions.length) {  // all done!!
    res.cookie('evaluationProgress', "M-01", { maxAge: 3600 * 24 * 100, httpOnly: true }) ;
    res.render('endOfSearchEvals', {req: req, optionalUserIdentifier: optionalUserIdentifier}) ;
    return ;
  }

  let evaluationProgress = "S-" + ((seq < 10) ? "0" : "") + seq ;
  res.cookie('evaluationProgress', evaluationProgress, { maxAge: 3600 * 24 * 100, httpOnly: true }) ;

  // now run the search

  // choose a and b methods
  let a = -1 ;
  while (true) {
    a = Math.floor(Math.random() * abSearchSets.length) ;
    if (abSearchSets[a].notSelectable) continue ;   // some have been removed to reduce count and improve stats
    break ;

  }
  let b = -1 ;
  while (true) {
    b = Math.floor(Math.random() * abSearchSets.length) ;
    if (b == a) continue  ;
    if (abSearchSets[b].notSelectable) continue ; // some have been removed to reduce count and improve stats
    break ;
  }
  let question = findQuestionForSeq(questions, seq) ;
  question = cleanseLite(question).trim() ;

  console.log("question:" + question) ;

  let aRes = await runSearchSet(abSearchSets[a], question) ;
  let bRes = await runSearchSet(abSearchSets[b], question) ;
  console.log(" a="+a+" b="+b+" q=" + question + " seq=" + seq + " totalSeq=" + questions.length) ;
  res.render('evalSearch', {req: req, appConfig: appConfig, question: question, abSets: abSearchSets, a: a, b: b,
      aRes: aRes, bRes: bRes, seq: seq, totalSeq: questions.length}) ;
}

function findQuestionForSeq(questions, seq) {

  for (let q of questions) 
    if (q.num == seq) return q.q ;
  console.log("No question seq: " + seq) ;
  throw "No question seq: " + seq ;
}

async function showSimEval(req, res, seq, optionalUserIdentifier) {

  console.log("\nin showSimEval seq= " + seq + " req=" +JSON.stringify(req.body));

  // if eval, save it and increment seq
  if (req.body.image) {
    let lastImage = similarityCallibrationImages[parseInt(req.body.seq)] ;

    if (lastImage != req.body.image) throw "cookie/image mismatch " + req.body.seq + ": " + lastImage + "/" + req.body.image ;
    // save
    await writeEval(req, "similarity", optionalUserIdentifier, req.body.seq, req.body.image, req.body.a, 
      abSimilaritySets[parseInt(req.body.a)].desc, req.body.b, abSimilaritySets[parseInt(req.body.b)].desc, req.body.eval) ; 
     

    seq = parseInt(req.body.seq) + 1 ;      
  }

  if (seq >= similarityCallibrationImages.length) {  // all done!!
    res.cookie('evaluationProgress', "M-99", { maxAge: 3600 * 24 * 100, httpOnly: true }) ;
    res.render('endOfSimEvals', {req: req, optionalUserIdentifier: optionalUserIdentifier}) ;
    return ;
  }

  let evaluationProgress = "M-" + ((seq < 10) ? "0" : "") + seq ;
  res.cookie('evaluationProgress', evaluationProgress, { maxAge: 3600 * 24 * 100, httpOnly: true }) ;

    // now run the sim search

  // choose a and b methods
  let a = Math.floor(Math.random() * abSimilaritySets.length) ;
  let b = -1 ;
  while (true) {
    b = Math.floor(Math.random() * abSimilaritySets.length) ;
    if (b != a) break ;
  }
  let image = similarityCallibrationImages[seq] ;


  let targetImage = await getTargetImageForSimilarity(image) ;
  console.log(" got a=" + a + " b=" + b + " targetImage =" + targetImage) ;
  let aRes = await getSimilaritySet(abSimilaritySets[a], targetImage) ;
  let bRes = await getSimilaritySet(abSimilaritySets[b], targetImage) ;

  console.log("ready abSimilaritySets: " + JSON.stringify(abSimilaritySets) + " a:" + a + " b: " + b +
      " targetImage id" + targetImage.id + " aRes count " + aRes.docs.length + " bRes count " + bRes.docs.length) ;

  res.render('evalSimilarity', {req: req, appConfig: appConfig, image: image, abSets: abSearchSets, a: a, b: b,
        aRes: aRes, bRes: bRes, seq: seq, totalSeq: similarityCallibrationImages.length - 1}) ;
}

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
    res.send("Error: " + err) ;
    res.end() ;
    console.log("testSimilarity err:" + err) ;
    console.log(err.stack) ;
  }
}

async function getTargetImageForSimilarity(knownImage) {

  let loop = 0 ;
  while (true) {
      if (loop++ > 10) throw "cant find a random image record!?" ;

      let matchId = "" ;

      if (knownImage) matchId = knownImage + "/" ;
      else {      
          // find a random image..

        let rand = Math.floor(Math.random() * 9999) ; // 0.9999
        if (rand < 10) rand = "000" + rand ;
        else if (rand < 100) rand = "00" + rand ;
        else if (rand < 1000) rand = "0" + rand ;
        else rand = "" + rand ; // a string..
        matchId = rand ;
      }
 
      const searchParameters = 
        "&wt=json&rows=20&q.op=AND" +
        "&fl=id,title,imageVector,nomicMetadataEmbedding,nomicOpenAIDescriptionEmbedding,nomicMsVisionDescriptionEmbedding" +
        "&q=id:(*" + matchId + "*)"

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

  console.log("getSimilaritySet abSimilaritySet=" + JSON.stringify(abSimilaritySet) + " targetImage " + targetImage) ;
  let embedding = targetImage[abSimilaritySet.matchField] ;
  
  const searchParameters = 
    "&wt=json&rows=20&q.op=AND" +
    "&fl=id,title,score" +
    "&q=({!knn f=" + abSimilaritySet.matchField + " topK=50}" + JSON.stringify(embedding) + ")"  ;

  return await solr.search(searchParameters, appConfig.comparisonImageSearchPicturesCore) ;
}


function setEmbeddingsAsFloats(rawEmbedding) { // fixes a problem where embedding has to much precision and blows up SOLR
 
  //console.log("\n\nEMBED IN: " + JSON.stringify(rawEmbedding) + "\n\n") ;
  for (let k=0;k<rawEmbedding.length;k++)rawEmbedding[k] = parseFloat(Number(rawEmbedding[k]).toFixed(8)) ;

  //console.log("\n\nEMBED OUT: " + JSON.stringify(rawEmbedding) + "\n\n") ;

   return rawEmbedding ;  
}


const abSearchSets = [
  {id:0,  desc: "Image semantic similarity: compares the CLIP embedding of the image with the CLIP embedding of the query text", bq: clipBQ},
  {id:1,  desc: "NLA metadata keyword: compares the NLA metadata text with the query text (traditional Lucene TF/IDF approach)", bq: metaBQ},
  {id:2,  desc: "OpenAI description keyword: compares the OpenAI description text with the query text (traditional Lucene TF/IDF approach).", bq: openAIBQ},
  {id:3,  desc: "Phi-3 description keyword: compares the Phi-3 description text with the query text (traditional Lucene TF/IDF approach).", bq: phi3BQ},
  {id:4,  notSelectable: true, blends: [{source: 0, perc: 80}, {source: 1, perc:20}], sdesc: "80% CLIP 20% NLA metadata"},
  {id:5,  notSelectable: true, blends: [{source: 0, perc: 50}, {source: 1, perc:50}], sdesc: "50% CLIP 50% NLA metadata"},
  {id:4,  blends: [{source: 0, perc: 80}, {source: 2, perc:20}], sdesc: "80% CLIP 20% OpenAI description"},
  {id:7,  notSelectable: true, blends: [{source: 0, perc: 50}, {source: 2, perc:50}], sdesc: "50% CLIP 50% OpenAI description"},
  {id:8,  blends: [{source: 0, perc: 80}, {source: 3, perc:20}], sdesc: "80% CLIP 20% Phi-3 description"},
  {id:9,  notSelectable: true, blends: [{source: 0, perc: 50}, {source: 3, perc:50}], sdesc: "50% CLIP 50% Phi-3 description"},
  {id:10, blends: [{source: 0, perc: 50}, {source: 2, perc:30}, {source: 1, perc:20}], sdesc: "50% CLIP 30% OpenAI description 20% NLA metadata"},
  {id:11, blends: [{source: 0, perc: 50}, {source: 3, perc:30}, {source: 1, perc:20}], sdesc: "50% CLIP 30% Phi-3 description 20% NLA metadata"}
] ;
// we dont allow 4, 5, 7, 9 to be selected


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
    res.send("Error: " + err) ;
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

  let embedding = setEmbeddingsAsFloats(await utils.getClipTextEmbedding(stxt)) ;
  return "({!knn f=imageVector topK=50}" + JSON.stringify(embedding) + ")"  ;
}

async function metaBQ(stxt) {

  return "title:(\"" + stxt + "\")^0.8 OR titleStemmed:(" + stxt + ")^0.4 OR " +
         "metadataText:(\"" + stxt + "\")^0.3 OR metadataTextStemmed:(" + stxt + ")^0.1" ;
}

async function openAIBQ(stxt) {

  let embedding = setEmbeddingsAsFloats(await utils.getNomicEmbedding(stxt)) ;
  return "({!knn f=nomicOpenAIDescriptionEmbedding topK=50}" + JSON.stringify(embedding) + ")"  ;
}

async function phi3BQ(stxt) {

  let embedding = setEmbeddingsAsFloats(await utils.getNomicEmbedding(stxt)) ;
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
