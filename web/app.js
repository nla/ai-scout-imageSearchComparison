const path = require('path') ;

const https = require("https") ;
const fs = require("fs") ;

const express = require('express') ;
const helmet = require('helmet') ;
const bodyParser = require('body-parser') ;
const cookieParser = require('cookie-parser') ;
const httpErrors = require('http-errors') ;
const morgan = require('morgan') ;
const log4js = require('log4js') ;
const rfs = require('rotating-file-stream') ;

require('dotenv').config() ;                            // reads .env, sets up process.ENV props

const app = express() ;
app.use(helmet()) ;
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json({limit: '1mb'})) ;
app.use(cookieParser()) ;


//  -----  logging  -----

const morganLogStream = rfs.createStream("access.log", {		// morgan output file
	interval: "1d", 						// new log each day
	compress: true,             // was "gzip",  but it did nothing...
	path: path.join(__dirname, "logs")
}) ;

app.use(morgan("combined", { stream: morganLogStream })) ;

log4js.configure({
	appenders: {
		everything: {
			type: 'dateFile',
			filename: path.join(__dirname, "logs", "output.log"),
			compress: true
		}
	},
	categories: {
		default: {
			appenders: ['everything'],
			level: 'warn'
		}
	}
}) ;

const log = log4js.getLogger() ;

//  ----- config object passed to routers  -----

const appConfig = {
	port: process.env.PORT,
	urlPrefix: process.env.URL_PREFIX,
	clipTextEmbeddingURL: process.env.CLIP_TEXT_EMBEDDING_URL,
	nomicEmbeddingURL: process.env.NOMIC_EMBEDDING_URL,
	picturesCore: process.env.SOLR_ENTIRE_PICTURES_CORE,
	comparisonImageSearchPicturesCore: process.env.SOLR_COMPARISON_PICTURES_CORE,
	searchEvaluationLogDir: process.env.SEARCH_EVALUATION_LOG_DIR,
	picturesServer: process.env.PICTURES_SERVER,
	questionFilename: process.env.QUESTION_FILENAME
} ;

//  -----  util setup  -----

const util = require('./util/utils') ;
util.init(appConfig) ;

appConfig.util = util ;

//  -----  solr setup  -----

const solr = require('./util/solr') ;
solr.init(appConfig) ;
appConfig.solr = solr ;

//  -----  static requests handled by express from /static  -----

app.use(appConfig.urlPrefix + '/static', express.static(path.join(__dirname, 'static'))) ;

//  -----  ejs config  -----
  
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

//  ----- general routes

app.use(appConfig.urlPrefix + '/',        require('./routes/home')		  .init(appConfig)) ;

app.use(appConfig.urlPrefix + '/search',  require('./routes/search')	  .init(appConfig)) ;
/*
app.use(appConfig.urlPrefix + '/proxy',		require('./routes/proxyImage').init(appConfig)) ;
*/
app.use(appConfig.urlPrefix + '/admin',		require('./routes/admin')			.init(appConfig)) ; // one day, authenticate

//  -----  errors  -----

app.use(function(req, res, next) {                     // forward 404 to error handler
  next(httpErrors(404)) ;
});

app.use(function(err, req, res, next) {                 // error handler
  // set locals, only providing error in development
  res.locals.message = err.message ;
  res.locals.errStatus = err.status ;
  res.locals.error = req.app.get('env') === 'dev' ? err : {};

  log.info("Error " + err.status + " / " + err.message + " req: " +req.url + " params: " + JSON.stringify(req.params)) ;
  res.status(err.status || 500) ;
  res.render('error', {req: req}) ;
});


log.info("url prefix:    " + appConfig.urlPrefix) ;
log.info("About to start server on port " + appConfig.port) ;

//  -----  start server  -----

https
  .createServer(
		{
			key: fs.readFileSync("key.pem"),
			cert: fs.readFileSync("cert.pem"),
		},
		app)
  .listen(appConfig.port, () =>
		{
    	console.log(`server is running at port ${appConfig.port} with key/cert`) ;
  	}
	) ;
