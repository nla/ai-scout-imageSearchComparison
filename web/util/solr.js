const solr = require('solr-client') ;
const axios = require('axios') ;
const log = require('log4js').getLogger('solr') ;
const util = require('../util/utils') ;

let solrClientConfig = null ;
let solrBaseUrl = null ;

function solrDelete(solrClient, field, query) {
	
	console.log("solrDelete solrClient:" + JSON.stringify(solrClient) + ", field: " + field + " query " + query) ;
	return new Promise(function (resolve, reject) {
		solrClient.delete(field, query, function(err, result) {
			if (err) {
				log.error("solrDelete field: " + field + " query: " + query + " error: " + JSON.stringify(err)) ;
				reject(err) ;
			}
			else {
				log.debug("solrDelete field: " + field + " query: " + query + " result: " + JSON.stringify(result)) ;
				resolve(result) ;
			}
		}) ;
	}) ;
}

function solrDeleteByQuery(solrClient, query) {
	
	return new Promise(function (resolve, reject) {
		solrClient.deleteByQuery(query, function(err, result) {
			if (err) {
				log.error("solrDelete query: " + query + " error: " + JSON.stringify(err)) ;
				console.log("solrDelete query: " + query + " error: " + JSON.stringify(err)) ;
				reject(err) ;
			}
			else {
				log.debug("solrDelete  query: " + query + " result: " + JSON.stringify(result)) ;
				console.log("solrDelete  query: " + query + " result: " + JSON.stringify(result)) ;
				resolve(result) ;
			}
		}) ;
	}) ;
}

function solrAdd(solrClient, docs) {
	   
	//log.debug("ADDING DOC 0=" + JSON.stringify(docs[0])) ;
	return new Promise(function (resolve, reject) {
		solrClient.add(docs, function (err, result) {
			if (err) {
				//log.error("solrAdd docs: " + JSON.stringify(docs) + " error: " + JSON.stringify(err)) ;
				reject(err) ;
			}
			else {
				//log.debug("solrAdd field: " + JSON.stringify(docs) + " result: " + JSON.stringify(result)) ;
				resolve(result) ;
			}
		}) ;
	}) ;
}

function solrCommit(solrClient) {
	   
	return new Promise(function (resolve, reject) {
		solrClient.commit(function (err, result) {
			if (err) {
				log.error("solrCommit error: " + JSON.stringify(err)) ;
				reject(err) ;
			}
			else {
				log.debug("solrCommit result: " + JSON.stringify(result)) ;
				resolve(result) ;
			}
		}) ;
	}) ;
}

function solrRollback(solrClient) {
	   
	return new Promise(function (resolve, reject) {
		solrClient.rollback(function (err, result) {
			if (err) {
				log.error("solrRollback error: " + JSON.stringify(err)) ;
				reject(err) ;
			}
			else {
				log.debug("solrRollback result: " + JSON.stringify(result)) ;
				resolve(result) ;
			}
		}) ;
	}) ;
}

function solrSearch(solrClient, query) {
	   
	return new Promise(function (resolve, reject) {
		log.debug(" solr query: " + JSON.stringify(query)) ;
		solrClient.search(query, function (err, result) {
			if (err) {
				log.error("solrSearch error: " + JSON.stringify(err)) ;
				reject(err) ;
			}
			else {
				//log.debug("solrSearch result: " + JSON.stringify(result)) ;
				resolve(result) ;
			}
		}) ;
	}) ;
}

module.exports = {

	init: function(appConfigParm) {

        solrClientConfig = {
            host: process.env.SOLR_HOST || '127.0.0.1',
            port: process.env.SOLR_PORT || 8983,
            path: process.env.SOLR_PATH || '/solr'  
        } ;
        
        solrBaseUrl = "http://" + solrClientConfig.host + ":" + solrClientConfig.port +
                solrClientConfig.path + "/" ;								
                
        log.info("SOLR configurationsolrBaseUrl:" +solrBaseUrl) ;        
	},

	getSolrBaseUrl: function() {
		
		return solrBaseUrl ;
	},	
	
	deleteId: async function(id, core) {		
		
		//if (!id.match(/^[0-9]{1,4}$/)) throw new Error("id invalid for delete:" + id) ;		
		console.log("Deleting solr core " + core + "  id: " + id) ;
		
		try {
			const solrClient = solr.createClient(solrClientConfig.host, solrClientConfig.port, core, solrClientConfig.path) ;
			await solrDeleteByQuery(solrClient, "id:\"" + util.jsonEscape(id) + "\"") ;
			return await solrCommit(solrClient) ;
		}
		catch(err) {
			console.log("Error deleting solr filidename: " + id + " core: " + core + " err: " + err) ;
			throw err ;
		}
	},

	deleteFilename: async function(filename, core) {		
		
		//if (!id.match(/^[0-9]{1,4}$/)) throw new Error("id invalid for delete:" + id) ;		
		console.log("Deleting solr core " + core + "  filename: " + filename) ;
		
		try {
			const solrClient = solr.createClient(solrClientConfig.host, solrClientConfig.port, core, solrClientConfig.path) ;
			await solrDeleteByQuery(solrClient, "filename:\"" + util.jsonEscape(filename) + "\"") ;
			return await solrCommit(solrClient) ;
		}
		catch(err) {
			console.log("Error deleting solr filename: " + filename + " core: " + core + " err: " + err) ;
			throw err ;
		}
	},

	deleteByQuery: async function(query, core) {		
				
		console.log("Deleting solr core " + core + "  query: " + query) ;
		
		try {
			const solrClient = solr.createClient(solrClientConfig.host, solrClientConfig.port, core, solrClientConfig.path) ;
			await solrDeleteByQuery(solrClient, query) ;
			return await solrCommit(solrClient) ;
		}
		catch(err) {
			console.log("Error deleting solr query: " + query + " core: " + core + " err: " + err) ;
			throw err ;
		}
	},
	
	addOrReplaceDocuments: async function(docs, core) {
		
		log.info("Adding " + docs.length + " solr documents") ;
		try {
			const solrClient = solr.createClient(solrClientConfig.host, solrClientConfig.port, core, solrClientConfig.path) ;
			await solrAdd(solrClient, docs) ;
			return await solrCommit(solrClient) ;	
		}
		catch(err) {
			log.error("Error addOrReplaceDocuments: " + err) ;
			throw err ;
		}		
	},
	
	getSolrClient: function(core) {
		
		return solr.createClient(solrClientConfig.host, solrClientConfig.port, core, solrClientConfig.path) ;
	},
	

	search : async function(parameters, core) {
		
		let solrRes = null ;
	
		try {
			solrRes = await axios.post(
				this.getSolrBaseUrl() + core + "/select",
				parameters) ;
		}
		catch (e) {
			console.log("Error solr query " + e) ;
			if( e.response) console.log(e.response.data) ; 
			throw e ;
		}
			
		console.log("search status: " + solrRes.status) ;
				
		if ((solrRes.status == 200) && solrRes.data) return solrRes.data.response ;
		console.log("no data") ;
		throw new Error("status:" + solrRes.status + ", no data") ;
	},

	OLDsearch: async function(solrClient, query) {

		log.info("Querying " + JSON.stringify(query)) ;
		try {
			return await solrSearch(solrClient, query) ;
		}
		catch(err) {
			log.error("Error solr search: " + err) ;
			throw err ;
		}		
	}
} ;