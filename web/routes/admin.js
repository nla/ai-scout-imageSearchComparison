const express = require('express') ;
const router = express.Router() ;
const log = require('log4js').getLogger('home') ;
const utils = require('../util/utils') ;
const solr = require('../util/solr') ;
const axios = require('axios') ;
const fs = require('fs') ;
const url = require("url") ;


let appConfig = null ;
        
function init(appConfigParm) {

  appConfig = appConfigParm ;
  router.get('/recreateSOLRindex',		async (req, res) => { recreateSOLRindex(req, res) }) ;
  router.get('/reloadQuestions',		  async (req, res) => { reloadQuestions(req, res) }) ;
//router.get('/showEvaluations',      async (req, res) => { showEvaluations(req, res) }) ;
  return router ;  
}


function removeDuplicateTrailingText(res, txt) {
  // some ms vision descriptions contain repeated junk at the end
  // Find the last full sentence - does it repeat?  If so, remove, repeat until none.  Remove stuff after final sentence.
  // Yes, will stuff up with decimals, names with .  (Mr. B.A. Santamaria)  sentences repeating ending in ? ! ...
  let trimmed = false ;
  let before = null ;
  while (true) {

    let i = txt.lastIndexOf(".")
    if (i < 0) break ;
    let j = txt.lastIndexOf(".", i - 40) ;
    if (j < 0) break ;
    let possibleRepeater = txt.substring(j+1, i+1).trim() ;
    let k = txt.indexOf(possibleRepeater) ;
    if (k < j) {
      if (!trimmed) {
        trimmed = true ;
        before = txt ; // copy for debug
      }
      txt = txt.substring(0, k + possibleRepeater.length) // end of first occurrence
            + txt.substring(k + possibleRepeater.length).replaceAll(possibleRepeater, " ").replace(/\s\s/g, " ") ; // remove repeater from rest
    }
    else break ;
  }
  if (trimmed) {
    let i = txt.lastIndexOf(".") 
    if ((i > 0) && (i < (txt.length - 1))) txt = txt.substring(0, i+1).trim() ;  // remove dud straggling text
    res.write("Trimmed:\n") ;
    res.write(" " + before + "\n") ;
    res.write("To:\n") ;
    res.write(" " + txt + "\n") ;    
  }
  return txt ;
}

function setEmbeddingsAsFloats(rawEmbedding) { // fixes a problem where embedding has to much precision and blows up SOLR
 
  for (let k=0;k<rawEmbedding.length;k++)rawEmbedding[k] = Number(rawEmbedding[k]).toFixed(8) ;
  return rawEmbedding ;
}


async function recreateSOLRindex(req, res) {

  res.write("recreateSOLRindex starting\n") ;

  try {
    // first, delete everything in the evaluation image database - note: we use that special field 
    // that only exists in the evaluation index so we dont accidently erase everything in some other SOLR
    // index due to a misconfiguration

    res.write("deleting docs in " + appConfig.comparisonImageSearchPicturesCore + "...\n") ;
    //await solr.deleteByQuery("evaluationField:Y", appConfig.comparisonImageSearchPicturesCore) ;
    res.write("deleted docs in " + appConfig.comparisonImageSearchPicturesCore + "\n") ;
  }
  catch (e) {
    res.write("Error deleting docs in " + appConfig.comparisonImageSearchPicturesCore + ": " + e) ;
    res.end() ;
    return ;
  }

  try {
    let newDocs = [] ; // 5000 in one transaction, no problem..
    let searchParameters =
    "&wt=json&rows=999999" +  // only expecting 500   Skip the noise images
    "&q=openAIDescription:* AND -openAIDescription:(\"No preview available\") AND -openAIDescription:(\"I can't provide assistance with that request\")" +
    "&q.op=AND" +
    "&fl=id,url,contentType,title,metadataText,bibId,formGenre,format,author,originalDescription,notes,incomingUrls," +
        "openAIDescription,msVisionDescription,imageVector,suppressed" ; // we dont get the text vectors (done with clip) because we are redoing them with nomic

    res.write("Finding docs from " + appConfig.picturesCore + " to add to " + appConfig.comparisonImageSearchPicturesCore + "...\n") ;

	  let searchResp = await solr.search(searchParameters, appConfig.picturesCore) ;
    res.write("Found " + searchResp.numFound + " docs\n") ;

    for (let doc of searchResp.docs) {
      // get embeddings of the metadata and generated descriptions

      res.write("DOC " + doc.id + "\n") ;
      doc.nomicMetadataEmbedding = setEmbeddingsAsFloats(await utils.getNomicEmbedding(doc.metadataText.join(" ").trim())) ;
      
      doc.nomicOpenAIDescriptionEmbedding = setEmbeddingsAsFloats(await utils.getNomicEmbedding(doc.openAIDescription.trim())) ;

      if (doc.msVisionDescription.startsWith("V12: ")) doc.msVisionDescription = doc.msVisionDescription.substring(5).trim() ;
      doc.msVisionDescription = removeDuplicateTrailingText(res, doc.msVisionDescription) ;
      doc.nomicMsVisionDescriptionEmbedding = setEmbeddingsAsFloats(await utils.getNomicEmbedding(doc.msVisionDescription.trim())) ;

      doc.imageVector = setEmbeddingsAsFloats(doc.imageVector) ; // this is the original clip image embedding, unchanged
      doc.evaluationField = "Y" ; // dummy - see use above..

      newDocs.push(doc) ;   
      //if (newDocs.length >= 100) break ; // DEBUG   
    }

    res.write("\n" + newDocs.length + " docs to be added..") ;
    await solr.addOrReplaceDocuments(newDocs, appConfig.comparisonImageSearchPicturesCore) ;
    res.write("Docs added\n") ;
  }
  catch (e) {
    res.write("Error adding docs to " + appConfig.comparisonImageSearchPicturesCore + ": " + e) ;
    res.end() ;
    return ;
  }
  res.end() ;
}

async function reloadQuestions(req, res) {

  try {
    await utils.loadQuestions() ;
    res.write("Done") ;
  }
  catch (e) {
    res.write("Failed to reload questions: " + e) ;
    console.log("reload questions failed err: " + e) ;
    console.log(e.stack) ;
  }
  res.end() ;
}
module.exports.init = init ;