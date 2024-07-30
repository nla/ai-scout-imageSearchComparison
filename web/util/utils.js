const fs = require('fs') ;
const path = require('path') ;
const moment = require('moment') ;
const log = require('log4js').getLogger('util') ;
const axios = require('axios') ;
const url = require("url") ;

let appConfig = null ;
let QUESTIONS = null ;

let clipEmbeddingCache = [] ;
let nomicEmbeddingCache = [] ;
		
module.exports = {

	init: function(appConfigParm) {

		appConfig = appConfigParm ;
	},

	getJSONResponseAsync: async function (url, useProxy) {	// useProxy defaults to true!

		if (typeof useProxy === 'undefined') useProxy = false ;
		log.debug("getJSONResponseAsync url:" + url + "  useProxy:" + useProxy) ;
		let resp = await axios({
			method: 'get',
			url: url,
			proxy: useProxy		// generally, we dont want axios to use a proxy...
		}) ;

		log.debug("getJSONResponseAsync url:" + url + "  status:" + resp.status) ;

		return resp.data ;
	},


	//  ----- date/time -----

	formatRawTimestamp: function(timestamp) {

		if (!timestamp) return "-NONE-" ;
		const d = new Date() ;
		d.setTime(timestamp) 
		return "" + d ;
	},

	formatAsSqlTimestamp: function(timestamp) {

		if (!timestamp) return null ;
		return moment(timestamp).format('YYYY-MM-DD HH:mm:ss') ;
	},

	currentTimestampAsYYYYMMDDHHmmSS: function() {

		return moment().format('YYYYMMDD-HHmmss') ;
	},

	currentTimestampAsYYYYMMDDHHmmSSSSS: function() {	// millisec accuracy

		return moment().format('YYYYMMDD-HHmmssSSS') ;
	},

	//	----- misc -----


	getIP: function(req) {
		if (!req) return null ;
		// normally, return penultimate as we are behind 2 proxies?
		const proxiedFor = req.headers['x-forwarded-for'] ;
		if (proxiedFor) {
			const proxiedForArray = proxiedFor.split(',') ;
			if (proxiedForArray.length > 1) return proxiedForArray[proxiedForArray.length - 2] ;
			if (proxiedForArray.length > 0) return proxiedForArray[0] ;
		}
		return req.connection.remoteAddress ||  req.socket.remoteAddress || req.connection.socket.remoteAddress ;
	},
	
	sleep: async function(ms) {

		return new Promise(resolve => setTimeout(resolve, ms)) ;
	},

	jsonEscape: function(str) {
		return str
				.replace(/[\\]/g, '\\\\')
				.replace(/[\"]/g, '\\\"')
				.replace(/[\/]/g, '\\/')
				.replace(/[\b]/g, '\\b')
				.replace(/[\f]/g, '\\f')
				.replace(/[\n]/g, '\\n')
				.replace(/[\r]/g, '\\r')
				.replace(/[\t]/g, '\\t') ;
	},


	innerProduct: function (v1, v2) {

		let r = 0 ;
		for (let i=0;i<v1.length;i++) r +=  v1[i] * v2[i] ;
		
		return r ;
	},


		//	----- embeddings -----

	getClipTextEmbedding: async function(str) {

		let cachedResult = clipEmbeddingCache[str] ;
		if (cachedResult) return cachedResult ;

		let origStr = str ;

		let len = str.length ;
		if (len > 320) {
			str = str.substring(0, 320).trim() ;
			len = str.length ;
		}
		while (true) {	// clip will err if str has too many tokens..

			try {
				const queryParams = {
					text: str
				} ;
				const params = new url.URLSearchParams(queryParams);

				console.log("get embedding url " + appConfig.clipTextEmbeddingURL + "?" + params) ;
				let eRes = await axios.get(appConfig.clipTextEmbeddingURL + "?" + params) ; 
			
				if (!eRes.status == 200) throw "Cant get clip embedding, embedding server returned http resp " + eRes.status ;
				if (!eRes.data) throw "Cant get clip embedding, embedding server returned no data" ;
				console.log("returned data: " + JSON.stringify(eRes.data).substring(0, 50) + "...") ;
				if (clipEmbeddingCache.length > 200) clipEmbeddingCache = [] ;
				clipEmbeddingCache[origStr] = eRes.data ;

				return eRes.data ; // [x, y, ...]
			}
			catch (e) {
				console.log("err getting clip embed, str length: " + len) ;
				if (len < 120) throw e ;
				str = str.substring(0, len - 20).trim() ;
				len = str.length ;
			}
		}
	},

	getNomicEmbedding: async function(str) {

		let cachedResult = nomicEmbeddingCache[str] ;
		if (cachedResult) return cachedResult ;
		
		let eRes = await axios.post(appConfig.nomicEmbeddingURL, 
			{ model:"Alibaba-NLP/gte-base-en-v1.5",
				input: [ str] // gte doesnt but bge requires this magic prefix ("Represent this sentence for searching relevant passages: ") to make embeddings best suited for retrieval similarity !?
			},
			{ headers: {'Content-Type': 'application/json'}
			}  
		) ;
	
		if (!eRes.status == 200) throw "Cant get nomic embedding, embedding server returned http resp " + eRes.status ;
		if (!eRes.data || !eRes.data.data) throw "Cant get nomic embedding, embedding server returned no data" ;

		if (nomicEmbeddingCache.length > 200) nomicEmbeddingCache = [] ;
		let embedding = eRes.data.data[0].embedding ;
		nomicEmbeddingCache[str] =  embedding ;
		//console.log("retining nomic embedding:" + JSON.stringify(embedding)) ;
		return embedding ;
	},

	loadQuestions: async function() {

		console.log("about to load questions from " + appConfig.questionFilename) ;
		let lines = (await fs.promises.readFile(appConfig.questionFilename, {encoding: 'utf8'}))
									.split(/\r?\n/) ;
 									
		let reloadedQuestions = [] ;
		for (let line of lines) {
			if ((line.length == 0) || line.startsWith('#') || line.startsWith('//')) continue ;
			line = line.trim() ;
			let i = line.indexOf(' ') ;	
			if (i < 0) continue ;
			reloadedQuestions.push({num: parseInt(line.substring(0, i)),
														  q: line.substring(i).trim()}) ;
		}
		if (reloadedQuestions.length == 0) throw "No questions in file " + appConfig.questionFilename ;
		QUESTIONS = reloadedQuestions ;		
		console.log("loaded questions from " +  appConfig.questionFilename + ":\n" +
				JSON.stringify(QUESTIONS)) ;
	},

	getQuestions: async function() {

		if (!QUESTIONS) QUESTIONS = await this.loadQuestions() ;
		return QUESTIONS ;
	}


} ;