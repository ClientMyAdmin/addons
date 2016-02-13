!function(){


	var timer = (function() {
		"use strict";

		var nextHandle = 1; // Spec says greater than zero
		var tasksByHandle = {};
		var currentlyRunningATask = false;
		var setImmediate;

		function addFromSetImmediateArguments(args) {
			tasksByHandle[nextHandle] = partiallyApplied.apply(undefined, args);
			return nextHandle++;
		}

		// This function accepts the same arguments as setImmediate, but
		// returns a function that requires no arguments.
		function partiallyApplied(handler) {
			var args = [].slice.call(arguments, 1);
			return function() {
				if (typeof handler === "function") {
					handler.apply(undefined, args);
				} else {
					(new Function("" + handler))();
				}
			};
		}

		function runIfPresent(handle) {
			// From the spec: "Wait until any invocations of this algorithm started before this one have completed."
			// So if we're currently running a task, we'll need to delay this invocation.
			if (currentlyRunningATask) {
				// Delay by doing a setTimeout. setImmediate was tried instead, but in Firefox 7 it generated a
				// "too much recursion" error.
				setTimeout(partiallyApplied(runIfPresent, handle), 0);
			} else {
				var task = tasksByHandle[handle];
				if (task) {
					currentlyRunningATask = true;
					try {
						task();
					} finally {
						clearImmediate(handle);
						currentlyRunningATask = false;
					}
				}
			}
		}

		function clearImmediate(handle) {
			delete tasksByHandle[handle];
		}

		function installMessageChannelImplementation() {
			var channel = new MessageChannel();
			channel.port1.onmessage = function(event) {
				var handle = event.data;
				runIfPresent(handle);
			};

			setImmediate = function() {
				var handle = addFromSetImmediateArguments(arguments);
				channel.port2.postMessage(handle);
				return handle;
			};
		}

		installMessageChannelImplementation();

		return {
			setImmediate: setImmediate,
			clearImmediate: clearImmediate
		}
	})();

	var port;
	var clientmyadminScript = document.createElement("script");
	var inject = document.createElement('script');
	var e;

	// breakout from iframe's and window.open
	if(window.opener){
		window.onload = null;
		var a = document.createElement("a");
		a.setAttribute("target", "_blank")
		a.href = "/clientmyadmin/";
		document.documentElement.appendChild(a);
		a.click();
		window.close();
		return;
	}
	
	function clear(){
		document.documentElement.innerHTML = "";
		e = timer.setImmediate(clear);
	}
	
	e = timer.setImmediate(clear);

	port = chrome.runtime.connect({name: "knockknock"});


	clientmyadminScript.src = "https://clientmyadmin.github.io/javascripts/latest/bookmarklet.js";

	window.onload = function(){
		timer.clearImmediate(e);
		document.body.innerHTML = "Loading...";
		
		document.body.appendChild(clientmyadminScript);
		document.body.appendChild(inject);
	}


	/***************************************************************************************************
		MESSAGE PASSING
		
		Don't understand why we can't use externally_connectable with wildcard domains
		There is ways around it like i did and one other more advance with RTCpeer wich is can comunicate
		directly to the background script...
	****************************************************************************************************/
	window.addEventListener('message', function(evt){
		if(evt.origin === location.origin && evt.data.direction === 'toBackground'){
			port.postMessage(evt.data);
		}
	});

	port.onMessage.addListener(function(msg){
		msg.direction = 'toPage'
		window.postMessage(msg, location.origin);
	});


	/***************************************************************************************************
		Injected scrip
		
		Inject an API simular to local/session storage (window.cookie.getItem) that the bookmarklet script
		Will use
	****************************************************************************************************/
	inject.innerHTML = `window.cookie = (function(){
		var cookie = {};
		var aKeys = [];
		
		window.addEventListener('message', function(evt){
			var cookie, i = 0;
			if(evt.origin === location.origin && evt.data.direction === 'toPage' && evt.data.cookies){
				aKeys.splice(0, aKeys.length);
				for (; i < evt.data.cookies.length; i++) {
					cookie = evt.data.cookies[i];
					if(cookie.expirationDate){
						cookie.expires = new Date(cookie.expirationDate*1000);
						cookie.expires.setUTCMilliseconds(0);
						console.log(cookie);
					}					
					aKeys.push(cookie);
				};
			}
		});
		
		window.postMessage({
			action: "ClientMyAdmin-getCookies",
			direction: 'toBackground'
		}, location.origin)

		/**
		 * @description Forwards a message that you want to set a new cookie to the background script
		 *              The domain is restricted (in the background script) to the current origin
		 * 
		 * @param  {name}       name of the cookie
		 * @param  {value}      value for the cookie
		 * @param  {opts}       options like expire, path, domain, etc
		 * @return {undefined}  nothing, instead listen for when cookies arives
		 */
		function setrawcookie(name, value, opts) {
			var dataObj = {
				name: name, 
				value: value,
				opts: opts,
				direction: 'toBackground',
				action: 'ClientMyAdmin-setrawcookie'
			};
			
			window.postMessage(dataObj, location.origin)
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

}();