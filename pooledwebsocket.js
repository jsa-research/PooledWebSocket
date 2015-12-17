(function(global,undefined){
	var pool = {
			handler: null,
			queue: [],
			events: {},
			postMessage: function(msg,origin){
				var args = [
					JSON.stringify(msg),
					origin
				];
				console.info('postMessage: '+JSON.stringify(args));
				pool.queue.push(args);
				if(pool.handler){
					pool.queue.forEach(function(args){
						pool.handler.apply(pool,args);
					});
					pool.queue = [];
				}
			},
			open: function(url,protocols){
				pool.postMessage({
					action: 'open',
					url: url,
					protocols: protocols
				});
			},
			on: function(url,event,fn){
				pool.events[event] || (pool.events[event] = []);
				pool.events[event].push(fn);
			}
		},
		revert = function(e){
			pool.handler = function(msg){
				return window.postMessage.call(window,msg,location.origin);
			};
			window.addEventListener('message',function(e){
				pool.onmessage(e);
			});
			e && console.error(e);
			console.info('Reverting to non-pooled');
		};
	if('SharedWorker' in window){
		console.info('Using shared worker for pool');
		var worker = new SharedWorker('websocketworker.js');
		pool.handler = function(){
			return worker.port.postMessage.apply(worker.port,arguments);
		};
		worker.port.onmessage = function(e){
			pool.onmessage(e);
		};
		worker.onerror = function(e){
			console.error(e);
		};
		worker.port.start();
	}else if('serviceWorker' in navigator){
		console.info('Using service worker for pool');
		navigator.serviceWorker
			.register('websocketworker.js')
			.then(function(reg){
				var sw = navigator.serviceWorker;
				pool.handler = function(){
					return sw.controller.postMessage.apply(sw.controller,arguments);
				};
				sw.onmessage = function(e){
					pool.onmessage(e);
				};
				sw.onerror = function(e){
					console.error(e);
				};
			})
			.catch(revert)
	}else if('Worker' in window){
		console.info('Using shared worker for pool');
		var worker = new Worker('websocketworker.js');
		pool.handler = function(){
			return worker.postMessage.apply(worker,arguments);
		};
		worker.onmessage = function(e){
			pool.onmessage(e);
		};
		worker.onerror = function(e){
			console.error(e);
		};
	}else{
		revert();
	}
	pool.onmessage = function(e){
		if(e.data){
			var data = JSON.parse(e.data);
			switch(data.action){
				case 'event':
					console.info('Event: '+data.event+' '+JSON.stringify(data.arguments));
					pool.events[data.event] && pool.events[data.event].forEach(function(fn){
						fn.apply({},data.arguments);
					});
				break;
				case 'property':
					pool.onmessage({
						action: 'event',
						name: 'property',
						arguments: [data.name,data.value]
					});
				break;
			}
		}
	};
	global.PooledWebSocket = function(url,protocols){
		var self = {},
			properties = {},
			onevents = {},
			events = {
				open: [],
				message: [],
				error: [],
				close: []
			},
			queue = {
				open: [],
				message: [],
				error: [],
				close: []
			};
		Object.defineProperties(self,{
			readyState: {
				get: function(){
					return properties['readyState'];
				}
			},
			extensions: {
				get: function(){
					return properties['extensions'];
				}
			},
			protocol: {
				get: function(){
					return properties['protocol'];
				}
			},
			url: {
				get: function(){
					return properties['url'];
				}
			},
			onopen: {
				get: function(){
					return onevents.onopen;
				},
				set: function(fn){
					onevents.onopen = fn;
					self.runQueue('open');
				}
			},
			onmessage: {
				get: function(){
					return onevents.onmessage;
				},
				set: function(fn){
					onevents.onmessage = fn;
					self.runQueue('message');
				}
			},
			onerror: {
				get: function(){
					return onevents.onerror;
				},
				set: function(fn){
					onevents.onerror = fn;
					self.runQueue('error');
				}
			},
			onclose: {
				get: function(){
					return onevents.onclose;
				},
				set: function(fn){
					onevents.onclose = fn;
					self.runQueue('close');
				}
			},
			events: {
				get: function(){
					return events;
				}
			},
			pool: {
				get: function(){
					return pool;
				}
			}
		});
		self.runQueue = function(name){
			if(queue[name]){
				queue[name].forEach(function(args){
					events[name].forEach(function(fn){
						fn.apply(self,args);
					});
					onevents['on'+name] && onevents['on'+name].apply(self,args);
				});
				if(events[name].length > 0 || onevents['on'+name]){
					queue[name] = [];
				}
			}
			return self;
		};
		self.fire = function(name,args){
			queue[name].push(args);
			self.runQueue(name);
		};
		self.on = function(event,fn){
			events[event] || (events[event] = []);
			events[event].push(fn);
			self.runQueue(event);
			return self;
		};
		self.addEventListener = self.on;
		self.send = function(data){
			pool.postMessage({
				action: 'send',
				url: url,
				data: data
			});
		};
		pool.open(url,protocols);
		pool.on(url,'open',function(){
			self.fire('open',arguments);
		});
		pool.on(url,'message',function(){
			self.fire('message',arguments);
		});
		pool.on(url,'property',function(name,value){
			properties[name] = value;
		});
		pool.on(url,'error',function(){
			self.fire('error',arguments);
		});
		pool.on(url,'close',function(){
			self.fire('close',arguments);
		});
		return self;
	};
})(window);