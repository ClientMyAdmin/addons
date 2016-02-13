// Chrome can't modify response body (yet..) so we need to load a page and replace it with content_script
var modifyResponse = function(details) {
	console.log(details);
	var headers = details.responseHeaders.filter(header => {
		switch (header.name.toLowerCase()){
			case "location":
				return false;
			case "content-encoding":
				return !(details.statusCode < 400 && details.statusCode > 300)
			case "date":
			case "content-length":
			case "transfer-encoding":
			case "pragma":
			case "proxy-connection":
			case "status":
				return true;
		}

		return false
		// return /^(Content-Encoding|content-length)^/i.test(header.name)
	});
	console.log(details.responseHeaders, headers)

	// Try this when modifying
	// http://sl.se/clientmyadmin/
	// http://stackoverflow.com/clientmyadmin/
	// http://closure-compiler.appspot.com/clientmyadmin/
	// https://github.com/clientmyadmin/
	// https://r1---sn-5go7yn7e.googlevideo.com

	headers.push({"name": "Status", "value": "200 OK"});
	headers.push({"name": "Content-Type", "value": "text/plain; charset=utf-8"});

	// Replace all headers with this (makes it easy to not load any other resources)
	return {responseHeaders: headers};
};

var matcher = {urls: ["*://*/clientmyadmin/"]};
chrome.webRequest.onHeadersReceived.addListener(modifyResponse, matcher, ["responseHeaders", "blocking"]);

// Add trailing slash
chrome.webRequest.onHeadersReceived.addListener(function(d){return {redirectUrl: d.url+"/"}}, {urls: ["*://*/clientmyadmin"]}, ["responseHeaders", "blocking"]);

// Remove stuff like accept (makes it anoying to decode gzip)
// Remove stuff like location (dont want to redirect)
chrome.webRequest.onBeforeSendHeaders.addListener(details => {
	console.log(details.requestHeaders);
	{requestHeaders: []};
}, matcher, ["blocking", "requestHeaders"]);

function isAdminUrl(url, origin) {
    // Return whether the URL starts with the Gmail prefix.
    return url.indexOf(origin+"/clientmyadmin/") == 0;
}

function goToClientMyAdmin() {

	chrome.permissions.request({
		permissions: ['cookies'],
		origins: ['http://vecka.nu']
	}, function(granted) {
		console.log(granted);
		return granted;
	});

	chrome.tabs.query({active: true, currentWindow: true}, function(tab){

		var origin = (new URL(tab[0].url)).origin

		chrome.tabs.getAllInWindow(undefined, function(tabs) {
			for (var i = 0, tab; tab = tabs[i]; i++) {
				if (tab.url && isAdminUrl(tab.url, origin)) {
					chrome.tabs.update(tab.id, {selected: true});
					return;
				}
			}
			chrome.tabs.create({url: origin + "/clientmyadmin/"});
		});

	});
}

chrome.browserAction.onClicked.addListener(goToClientMyAdmin);

chrome.runtime.onConnect.addListener(function(port) {

	var origin = new URL(port.sender.url).origin;

	function shareCookieWithPage(){
		chrome.cookies.getAll({url: origin}, function(cookies){
			port.postMessage({cookies: cookies});
		});
	}

	port.onMessage.addListener(function(msg) {
		if (msg.action === "ClientMyAdmin-getCookies"){
			shareCookieWithPage();
		}

		if (msg.action === "ClientMyAdmin-setrawcookie"){

			var cookie = {
				url: origin,
				name: msg.name,
				value: msg.value,
				domain: msg.opts.domain,
				path: msg.opts.path,
				secure: msg.opts.secure,
				httpOnly: msg.opts.httpOnly,
				expirationDate: msg.opts.expirationDate
			};

			chrome.cookies.set(cookie, shareCookieWithPage);

		}
	});

});

