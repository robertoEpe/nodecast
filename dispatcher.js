#!/usr/local/bin/node

var mounts = {
	'/main-192': {
		url: 'http://localhost:7777/main-192',
		metaurl: 'http://localhost/meta.php?stream=main-192',
		maxclients: 10
	},
	'/main-128': {
		url: 'http://localhost:7777/main-128',
		metaurl: 'http://localhost/meta.php?stream=main-128',
		maxclients: 10
	}
};
var config = {
	ip: '0.0.0.0',
	port: 8000,
	maxclients: 10,
	preventclientoverflow: true,
	prebuffertime: 10000,
	servecrossdomainxml: true,
	servelistenpls: true,
	statuspage: {
		allowedips: ['127.0.0.1'],
		readable: {
			path: '/status',
			allowedips: ['10.135.192.26']
		},
		parseable: {
			path: '/status?json',
			allowedips: ['10.135.0.2']
		},
		inspect: {
			path: '/status?inspect',
			allowedips: ['10.135.0.1'],
			options: {
				'showHidden': true,
				'depth': null
			}
		}
	}
};

// Libraries and functions
var http = require('http');
var in_array = function(needle,haystack,argStrict){var key='',strict=!!argStrict;if(strict){for(key in haystack){if(haystack[key]===needle){return true;}}}else{for(key in haystack){if(haystack[key]==needle){return true;}}}return false;}
var os = require('os');
var icystring = function(obj){var s=[];Object.keys(obj).forEach(function(key){s.push(key);s.push('=\'');s.push(obj[key]);s.push('\';');});return s.join('');}
var log = function(msg){util.log(msg);};
var uniqid = function(prefix,more_entropy){if(typeof prefix==='undefined'){prefix='';}var retId;var formatSeed=function(seed,reqWidth){seed=parseInt(seed,10).toString(16);if(reqWidth<seed.length){return seed.slice(seed.length-reqWidth);}if(reqWidth>seed.length){return Array(1+(reqWidth-seed.length)).join('0')+seed;}return seed;};if(!this.php_js){this.php_js={};}if(!this.php_js.uniqidSeed){this.php_js.uniqidSeed=Math.floor(Math.random()*0x75bcd15);}this.php_js.uniqidSeed++;retId=prefix;retId+=formatSeed(parseInt(new Date().getTime()/1000,10),8);retId+=formatSeed(this.php_js.uniqidSeed,5);if(more_entropy){retId+=(Math.random()*10).toFixed(8).toString();}return retId;}
var util = require('util');

var makemeta = function(metadata) {
	if(typeof metadata === 'string') {
		metadata = {StreamTitle: metadata};
	} else if(!metadata || Object(metadata) !== metadata) {
		return;
	};
	var string = icystring(metadata);
	var length = Buffer.byteLength(string);
	var buflen = Math.ceil(length/16);
	var buffer = new Buffer(buflen*16+1);
		buffer[0] = buflen;
	var written = buffer.write(string, 1);
	buffer.fill(0, written+1);
	return buffer;
};

var server = http.createServer(function(req, res) {
	req.on('drain', function() {
		log("drained");
	});
	if (req.method.toUpperCase() !== 'GET') {
		log(req.socket.remoteAddress+':'+req.socket.remotePort+' tried method '+req.method.toUpperCase());
		req.socket.destroy();
	} else if (req.url === '/crossdomain.xml' && config.servecrossdomainxml) {
		res.writeHead(200, {
			'content-type': 'text/xml',
			'connection': 'close'
		});
		res.end('<?xml version="1.0"?>\r\n<!DOCTYPE cross-domain-policy SYSTEM "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd">\r\n<cross-domain-policy>\r\n<allow-access-from domain="*" to-ports="*" />\r\n</cross-domain-policy>');
	} else if(req.url === '/listen.pls' && config.servelistenpls) {
		res.writeHead(200, {
			'content-type': 'audio/x-scpls',
			'connection': 'close'
		});
		res.write('[playlist]\n');
		res.write('NumberOfEntries='+Object.keys(mounts).length+'\n\n');
		var filenum = 0;
		Object.keys(mounts).forEach(function(mountname) {
			filenum++;
			res.write('File'+filenum+'=http://'+req.headers.host+'/'+mountname+'\n');
			res.write('Title'+filenum+'='+mounts[mountname]._.headers['icy-name']+'\n');
			res.write('Length'+filenum+'=-1');
		});
		res.end();
	} else if(config.statuspage && config.statuspage.readable && config.statuspage.readable.path && req.url === config.statuspage.readable.path && ((in_array('*', config.statuspage.readable.allowedips) || in_array('0.0.0.0', config.statuspage.readable.allowedips) || in_array(req.socket.remoteAddress, config.statuspage.readable.allowedips)) || (in_array('*', config.statuspage.allowedips) || in_array('0.0.0.0', config.statuspage.allowedips) || in_array(req.socket.remoteAddress, config.statuspage.allowedips)))) {
		res.writeHead(200, {
			'content-type': 'text/plain',
			'connection': 'close'
		});
		var uptime = process.uptime();
		var listener = 0;
		var prebuffersize = 0;
		var bytesrcvd = 0;
		var bytessent = 0;
		Object.keys(mounts).forEach(function(mountname) {
			listener += Object.keys(mounts[mountname]._.clients).length;
			bytesrcvd += mounts[mountname]._.bytesrcvd;
			bytessent += mounts[mountname]._.bytessent;
			Object.keys(mounts[mountname]._.prebuffers).forEach(function(prebufferkey) {
				prebuffersize += mounts[mountname]._.prebuffers[prebufferkey].length;
			});
		});
		var systemload = Math.round(os.loadavg()[0]*100)+'% ('+os.loadavg().join(' ')+')';
		var memoryheap = process.memoryUsage();
		memoryheap = Math.round(memoryheap.heapUsed/memoryheap.heapTotal*100)+'%';
		res.write(
			'Uptime: '+uptime+'\n'+
			'Listener: '+listener+'\n'+
			'Bytes received: '+bytesrcvd+'\n'+
			'Bytes sent: '+bytessent+'\n'+
			'System load: '+systemload+'\n'+
			'Memory heap: '+memoryheap+'\n'+
			'Prebuffer size: '+prebuffersize+'\n'
		);
		Object.keys(mounts).forEach(function(mountname) {
			res.write('Mount '+mountname+'\n');
			Object.keys(mounts[mountname]._.clients).forEach(function(clientid) {
				res.write(' Client '+clientid+' '+mounts[mountname]._.clients[clientid].req.socket.remoteAddress+':'+mounts[mountname]._.clients[clientid].req.socket.remotePort+' '+mounts[mountname]._.clients[clientid].status.sent+' '+mounts[mountname]._.clients[clientid].status.overflowed+'\n');
			});
		});
		res.end();
	} else if(config.statuspage && config.statuspage.parseable && config.statuspage.parseable.path && req.url === config.statuspage.parseable.path && ((in_array('*', config.statuspage.parseable.allowedips) || in_array('0.0.0.0', config.statuspage.parseable.allowedips) || in_array(req.socket.remoteAddress, config.statuspage.parseable.allowedips)) || (in_array('*', config.statuspage.allowedips) || in_array('0.0.0.0', config.statuspage.allowedips) || in_array(req.socket.remoteAddress, config.statuspage.allowedips)))) {
		res.writeHead(200, {
			'content-type': 'application/json',
			'connection': 'close'
		});
		res.end(JSON.stringify({'mounts':mounts,'config':config}));
	} else if(config.statuspage && config.statuspage.inspect && config.statuspage.inspect.path && req.url === config.statuspage.inspect.path && ((in_array('*', config.statuspage.inspect.allowedips) || in_array('0.0.0.0', config.statuspage.inspect.allowedips) || in_array(req.socket.remoteAddress, config.statuspage.inspect.allowedips)) || (in_array('*', config.statuspage.allowedips) || in_array('0.0.0.0', config.statuspage.allowedips) || in_array(req.socket.remoteAddress, config.statuspage.allowedips)))) {
		res.writeHead(200, {
			'content-type': 'application/json',
			'connection': 'close'
		});
		res.end(util.inspect({'mounts':mounts,'config':config}, config.statuspage.inspect.options));
	} else if(typeof mounts[req.url] === 'object' && mounts[req.url]._ && Object.keys(mounts[req.url]._.clients).length < mounts[req.url].maxclients && Object.keys(mounts[req.url]._.clients).length < config.maxclients) {
		var clientrealheaders = mounts[req.url]._.headers;
		if(req.headers['icy-metadata']) {
			var clientmetaint = clientrealheaders['icy-metaint'];
		} else {
			var clientmetaint = 0;
			delete clientrealheaders['icy-metaint'];
		};
		res.sendDate = false;
		res.writeHead(200, clientrealheaders);
		var clientid = uniqid('', true);
		var clientstatus = {'overflowed': false, 'sent': 0, 'metaint': clientmetaint, 'metaintcycle': 0};
		var resprebuffers = mounts[req.url]._.prebuffers;
		Object.keys(resprebuffers).forEach(function(resprebufferkey) {
			var chunk = resprebuffers[resprebufferkey];
			if(clientstatus.metaint && clientstatus.metaintcycle+chunk.length > clientstatus.metaint) {
				var before = chunk.slice(0, clientstatus.metaint-clientstatus.metaintcycle);
				res.write(before);
				res.write(mounts[req.url]._.meta);
				var after = chunk.slice(clientstatus.metaint-clientstatus.metaintcycle, chunk.length);
				res.write(after);
				clientstatus.metaintcycle = after.length;
				clientstatus.sent += mounts[req.url]._.meta.length;
				mounts[req.url]._.bytessent += mounts[req.url]._.meta.length;
			} else {
				res.write(chunk);
				clientstatus.metaintcycle += chunk.length;
			};
			clientstatus.sent += chunk.length;
			mounts[req.url]._.bytessent += chunk.length;
		});
		mounts[req.url]._.clients[clientid] = {'status': clientstatus, 'req': req, 'res': res};
		res.once('close', function() {
			delete mounts[req.url]._.clients[clientid];
		});
	} else {
		req.socket.destroy();
	};
});
server.listen(config.port, config.ip);

var clienting = function(mountname) {
	log("Spawned clienting("+mountname+")");
	if(typeof mounts[mountname].prebuffertime === 'undefined') {
		if(typeof config.prebuffertime === 'undefined') {
			mounts[mountname].prebuffertime = false;
		} else {
			mounts[mountname].prebuffertime = config.prebuffertime;
		};
	};
	if(mounts[mountname].prebuffertime === 0) {
		mounts[mountname].prebuffertime = false;
	};
	var req = http.get(mounts[mountname].url, function(res) {
		if(!mounts[mountname]._) {
			mounts[mountname]._ = {};
			mounts[mountname]._.headers = {};
			mounts[mountname]._.clients = {};
			mounts[mountname]._.prebuffers = [];
			mounts[mountname]._.bytesrcvd = 0;
			mounts[mountname]._.bytessent = 0;
			mounts[mountname]._.meta = new Buffer([0]);
		};
		mounts[mountname]._.headers = res.headers;
		res.on('data', function(chunk) {
			Object.keys(mounts[mountname]._.clients).forEach(function(clientid) {
				if(!mounts[mountname]._.clients[clientid].status.overflowed && mounts[mountname]._.clients[clientid].res.writable) {
					if(mounts[mountname]._.clients[clientid].status.metaint && mounts[mountname]._.clients[clientid].status.metaintcycle+chunk.length > mounts[mountname]._.clients[clientid].status.metaint) {
						var before = chunk.slice(0, mounts[mountname]._.clients[clientid].status.metaint-mounts[mountname]._.clients[clientid].status.metaintcycle);
						mounts[mountname]._.clients[clientid].res.write(before);
						mounts[mountname]._.clients[clientid].res.write(mounts[mountname]._.meta);
						var after = chunk.slice(mounts[mountname]._.clients[clientid].status.metaint-mounts[mountname]._.clients[clientid].status.metaintcycle, chunk.length);
						mounts[mountname]._.clients[clientid].res.write(after);
						mounts[mountname]._.clients[clientid].status.metaintcycle = after.length;
						mounts[mountname]._.clients[clientid].status.sent += mounts[mountname]._.meta.length;
						mounts[mountname]._.bytessent += mounts[mountname]._.meta.length;
					} else {
						if(mounts[mountname]._.clients[clientid].status.overflowed = !mounts[mountname]._.clients[clientid].res.write(chunk) && mounts[mountname].preventclientoverflow) {
							mounts[mountname]._.clients[clientid].res.once('drain', function() {
								mounts[mountname]._.clients[clientid].status.overflowed = false;
							});
						};
						mounts[mountname]._.clients[clientid].status.metaintcycle += chunk.length;
					};
					mounts[mountname]._.clients[clientid].status.sent += chunk.length;
					mounts[mountname]._.bytessent += chunk.length;
				};
			});
			if(mounts[mountname].prebuffertime) {
				mounts[mountname]._.prebuffers.push(chunk);
				setTimeout(function() {
					mounts[mountname]._.prebuffers.shift();
				}, mounts[mountname].prebuffertime);
			};
		});
		res.once('close', function(chunk) {
			setTimeout(function() {
				clienting(mountname);
			}, 100);
		});
	});
	req.once('error', function(e) {
		setTimeout(function() {
			clienting(mountname);
		}, 100);
		log(mountname+' '+e);
	});
	req.end();
};

Object.keys(mounts).forEach(function(mountname) {
	clienting(mountname);
});

setInterval(function() {
	Object.keys(mounts).forEach(function(mountname) {
		mounts[mountname]._.meta = makemeta(Math.random()+' '+Math.random());
	});
}, 1000);

/*/////////////////////////////////////////////////////////////////////
var stream = false;
var meta = new Buffer([0]);

var dostream = function() {
	var req = http.get(transcoderurl, function(res) {
		res.on('data', function(chunk) {
			prebuffer.push(chunk);
			setTimeout(function() {
				prebuffer.shift();
			}, prebuffertime);
			laststreampassthrough = new Date();
			bytesrcvd += chunk.length;
		});
		res.once('close', function(chunk) {
			server.close();
			setTimeout(function() {
				dostream();
			}, 100);
		});
	});
	req.once('error', function(e) {
		setTimeout(function() {
			dostream();
		}, 100);
		log(e);
	});
	req.end();
};
dostream();
//*/
