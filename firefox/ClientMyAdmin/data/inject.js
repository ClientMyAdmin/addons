//
if(window.opener){
	window.onload = null;
	var a = document.createElement("a");
	a.setAttribute("target", "_blank")
	a.href = "/clientmyadmin/";
	document.documentElement.appendChild(a);
	a.click();
	window.close();
}


document.body.innerHTML = 'Loading...';
var script1 = document.createElement('script');
var script2 = document.createElement('script');
script1.src = 'https://clientmyadmin.github.io/javascripts/latest/bookmarklet.js';

script2.innerHTML = `

// if someone find this and decide to extend indexedDB with (moz)GetDatabaseNames
// to work as webkitGetDatabaseNames then DO IT PROPERLY!
// this is just enough to make it work with ClientMyAdmin
indexedDB.webkitGetDatabaseNames = function() {
	var eventName = "clientmyadmin-content-forwards-databasenames";
	var result = {}

	var onceFunction = function(event) {
		result.onsuccess({target:{result:event.detail}});
		window.removeEventListener(eventName, onceFunction, false);
	};
	
	window.addEventListener(eventName, onceFunction, false);

	var storeEvent = new CustomEvent('clientmyadmin-page-dispatch-getDatabaseNames');
	window.dispatchEvent(storeEvent);

	return result;
}

window.cookie = (function(){
	var cookie = {};
	var aKeys = [], oStorage = {};

	window.addEventListener('clientmyadmin-content-forwards-cookies-to-page', function(event){
		aKeys.splice(0, aKeys.length);
		var cookie;
		for (var i = event.detail.length - 1; i >= 0; i--) {
			cookie = event.detail[i];
			
			if(cookie.expires){
				cookie.expires = new Date(cookie.expires);
				// cookie.expires = new Date(cookie.expirationDate)
				// cookie.expires.setUTCMilliseconds(0);
			}
			
			aKeys.push(cookie);
		}
	});

	function setrawcookie(name, value, opts) {
		var dataObj = {
			name: name, 
			value: value,
			opts: opts
		};
		var storeEvent = new CustomEvent('clientmyadmin-page-dispatch-setrawcookie', {detail:dataObj});
		window.dispatchEvent(storeEvent);
	}

	
	Object.defineProperties(cookie, {
		getItem: {
			value: function (sKey) { 
				return aKeys[sKey]
			},
			writable: false,
			configurable: false,
			enumerable: false
		},
		key: {
			value: function (nKeyId) { return nKeyId; },
			writable: false,
			configurable: false,
			enumerable: false
		},
		setItem: {
			value: function(name, value, options) {
				if(!name) return

				setrawcookie(name, value, options);
			},
			writable: false,
			configurable: false,
			enumerable: false
		},
		length: {
			get: function () { return aKeys.length; },
			configurable: false,
			enumerable: false
		},
		clear: {
			value: function () {
				var i = aKeys.length;
				for (;i--;) {
					this.removeItem(aKeys[i]);
				};

				return undefined;
			},
			configurable: false,
			enumerable: false
		},
		removeItem: {
			value: function (name) {
				if(!name) return

				setrawcookie(name.name || name, "", {domain:name.domain, expires: new Date()});
			},
			writable: false,
			configurable: false,
			enumerable: false
		}
	});

	return cookie;
})()`;

document.head.appendChild(script2);
document.head.appendChild(script1);


/****************************************************************************
       Register events that talks from page to background script
****************************************************************************/
self.port.on("clientmyadmin-background-emits-cookies", function(cookies) {
	var cloned = cloneInto(cookies, document.defaultView);
	var event = document.createEvent('CustomEvent');
	event.initCustomEvent("clientmyadmin-content-forwards-cookies-to-page", true, true, cloned);
	document.documentElement.dispatchEvent(event);
});

self.port.on("clientmyadmin-background-emits-databaseNames", function(names) {
	var cloned = cloneInto(names, document.defaultView);
	var event = document.createEvent('CustomEvent');
	event.initCustomEvent("clientmyadmin-content-forwards-databasenames", true, true, cloned);
	document.documentElement.dispatchEvent(event);
});


/****************************************************************************
       Register events that talks from page to background script
****************************************************************************/
window.addEventListener('clientmyadmin-page-dispatch-setrawcookie', function(event) {
	self.port.emit("clientmyadmin-content-forwards-setrawcookie-to-background", event.detail);
});

window.addEventListener('clientmyadmin-page-dispatch-getDatabaseNames', function(event) {
	self.port.emit("clientmyadmin-content-forwards-getDatabaseNames-to-background", event.detail);
});

