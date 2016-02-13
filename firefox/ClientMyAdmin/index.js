var { Cc, Ci, Cr } = require("chrome");
var data = require("sdk/self").data;
var page = require('sdk/page-mod');
var URL = require("sdk/url").URL;
var buttons = require('sdk/ui/button/action');
var tabs = require("sdk/tabs");
var getDBNamesForHost = require("./getDBNamesForHost");
var cookieManager2 = Cc["@mozilla.org/cookiemanager;1"].getService(Ci.nsICookieManager2);
// http://stackoverflow.com/q/33114240/1008999 - thanks Federico Piazza for the regex
const CLIENTMYADMIN_MATCH_REGEX = /^https?:\/\/[^\/]+\/clientmyadmin(?:\/?|\/?#.*)$/

// Helper function for XPCOM instanciation (from Firebug)
function CCIN(cName, ifaceName) {
    return Cc[cName].createInstance(Ci[ifaceName]);
}
// Copy response listener implementation.
function TracingListener() {
	this.originalListener = null;
}

var clientmyadmin = "Loading..."
var count = clientmyadmin.length;

TracingListener.prototype = {

	onDataAvailable: function(request, context, inputStream, offset) {
		var binaryInputStream = CCIN("@mozilla.org/binaryinputstream;1", "nsIBinaryInputStream");
		var storageStream = CCIN("@mozilla.org/storagestream;1", "nsIStorageStream");
		var binaryOutputStream = CCIN("@mozilla.org/binaryoutputstream;1", "nsIBinaryOutputStream");

		storageStream.init(8192, count, null);
		binaryOutputStream.setOutputStream(storageStream.getOutputStream(0));

		binaryOutputStream.writeBytes(clientmyadmin, count);

		this.originalListener.onDataAvailable(request, context,
			storageStream.newInputStream(0), offset, count);
	},

	onStartRequest: function(request, context) {
		this.originalListener.onStartRequest(request, context);
	},

	onStopRequest: function(request, context, statusCode) {
		this.originalListener.onStopRequest(request, context, 0);
	},

	QueryInterface: function (aIID) {
		if (aIID.equals(Ci.nsIStreamListener) || aIID.equals(Ci.nsISupports)) {
			return this;
		}
		throw Cr.NS_NOINTERFACE;
	}
}

var httpResponseObserver = {
	observe: function(aSubject, aTopic, aData) {


		if (aTopic == "http-on-modify-request" || aTopic == 'http-on-examine-response') {
			var httpChannel = aSubject.QueryInterface(Ci.nsIHttpChannel);
			var url = httpChannel.originalURI.specIgnoringRef;

			if (CLIENTMYADMIN_MATCH_REGEX.test(url) && aSubject.requestMethod == "GET"){
				if(aTopic == 'http-on-examine-response'){
					// Warning: Calling setResponseHeader() while visiting response headers has undefined behavior. Don't do it!
					var headers = [];
					
					aSubject.visitResponseHeaders(function(header, value) {
						headers.push(header);
					});
					
					headers.forEach(function(header) {
						httpChannel.setResponseHeader(header, "", false);
					});

					// httpChannel.setResponseHeader("Content-Type", "text/html; charset=UTF-8", false);
					
				}

				var newListener = new TracingListener();
				aSubject.QueryInterface(Ci.nsITraceableChannel);
				newListener.originalListener = aSubject.setNewListener(newListener);

			}
		}
	},

	get observerService() {
		return Cc["@mozilla.org/observer-service;1"]
			.getService(Ci.nsIObserverService);
	},

	register: function() {
		this.observerService.addObserver(this, "http-on-examine-response", false);
		this.observerService.addObserver(this, "http-on-modify-request", false);
	},

	unregister: function() {
		this.observerService.removeObserver(this, "http-on-examine-response");
		this.observerService.removeObserver(this, "http-on-modify-request");
	}
};

httpResponseObserver.register();
// httpResponseObserver.unregister(); // call this when you dont want to listen anymore



page.PageMod({
     include: CLIENTMYADMIN_MATCH_REGEX,
     // include: '*',
     contentScriptOptions: {},
	 contentScriptWhen: 'ready',
     contentScriptFile: [data.url('inject.js')],
     attachTo: 'top',
     onAttach: function(worker) {
		const url = new URL(worker.url);
		const origin = url.origin;
		const host = url.host;

		function getCookies(){

     		var cookieEnumerator = cookieManager2.getCookiesFromHost(origin);
			var cookie;
	     	var cookies = [];
	     	
	     	while (cookieEnumerator.hasMoreElements()) {
	     		cookie = cookieEnumerator.getNext().QueryInterface(Ci.nsICookie2);
	     		
				cookies.push({
					name: cookie.name,
					value: cookie.value,
					expires: !cookie.isSession && new Date(cookie.expires * 1000) || undefined,
					expirationDate: !cookie.isSession && cookie.expires || undefined,
					session: cookie.isSession,
					path: cookie.path,
					secure: cookie.isSecure,
					domain: cookie.host,
					httpOnly: cookie.isHttpOnly
				});
			}
			
			worker.port.emit("clientmyadmin-background-emits-cookies", cookies);
		}
		getCookies();

		worker.port.on("clientmyadmin-content-forwards-setrawcookie-to-background", function(cookie) {
			var opts = cookie.opts || {};
			var expiry = (Date.now() + 1000) * 1000;
			
			if(opts.expirationDate){
				expiry = new Date(cookie.opts.expirationDate) / 1000
			}

			cookieManager2.add(opts.domain || host, opts.path || "/", cookie.name, cookie.value, !!opts.secure, !!opts.httpOnly, !opts.expirationDate, expiry);
			
			getCookies();
		});

		worker.port.on("clientmyadmin-content-forwards-getDatabaseNames-to-background", function(){
			getDBNamesForHost(origin).then(function(names) {
				worker.port.emit("clientmyadmin-background-emits-databaseNames", names);
			})		
		});

     },
});




var button = buttons.ActionButton({
	id: "clientmyadmin-link",
	label: "ClientMyAdmin",
	icon: {
		"16": "./icon-16.png",
		"24": "./icon-24.png",
		"32": "./icon-32.png",
		"36": "./icon-36.png",
		"48": "./icon-48.png",
		"64": "./icon-64.png",
		"128": "./icon-128.png"
	},
	onClick: handleClick
});

function isAdminUrl(url, origin) {
    // Return whether the URL starts with the clientmyadmin prefix.
    return url.indexOf(origin+"/clientmyadmin/") == 0;
}

function handleClick(state){
	
	var origin = (new URL(tabs.activeTab.url)).origin

	for (let tab of tabs){
		if (tab.url && isAdminUrl(tab.url, origin)) {
			tab.activate();
			return;
		}
	}
	
	tabs.open(origin+'/clientmyadmin/');

}