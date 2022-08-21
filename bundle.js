(function () {
  'use strict';

  /**
   * @this {Promise}
   */
  function finallyConstructor(callback) {
    var constructor = this.constructor;
    return this.then(
      function(value) {
        // @ts-ignore
        return constructor.resolve(callback()).then(function() {
          return value;
        });
      },
      function(reason) {
        // @ts-ignore
        return constructor.resolve(callback()).then(function() {
          // @ts-ignore
          return constructor.reject(reason);
        });
      }
    );
  }

  function allSettled(arr) {
    var P = this;
    return new P(function(resolve, reject) {
      if (!(arr && typeof arr.length !== 'undefined')) {
        return reject(
          new TypeError(
            typeof arr +
              ' ' +
              arr +
              ' is not iterable(cannot read property Symbol(Symbol.iterator))'
          )
        );
      }
      var args = Array.prototype.slice.call(arr);
      if (args.length === 0) return resolve([]);
      var remaining = args.length;

      function res(i, val) {
        if (val && (typeof val === 'object' || typeof val === 'function')) {
          var then = val.then;
          if (typeof then === 'function') {
            then.call(
              val,
              function(val) {
                res(i, val);
              },
              function(e) {
                args[i] = { status: 'rejected', reason: e };
                if (--remaining === 0) {
                  resolve(args);
                }
              }
            );
            return;
          }
        }
        args[i] = { status: 'fulfilled', value: val };
        if (--remaining === 0) {
          resolve(args);
        }
      }

      for (var i = 0; i < args.length; i++) {
        res(i, args[i]);
      }
    });
  }

  // Store setTimeout reference so promise-polyfill will be unaffected by
  // other code modifying setTimeout (like sinon.useFakeTimers())
  var setTimeoutFunc = setTimeout;

  function isArray(x) {
    return Boolean(x && typeof x.length !== 'undefined');
  }

  function noop() {}

  // Polyfill for Function.prototype.bind
  function bind(fn, thisArg) {
    return function() {
      fn.apply(thisArg, arguments);
    };
  }

  /**
   * @constructor
   * @param {Function} fn
   */
  function Promise$1(fn) {
    if (!(this instanceof Promise$1))
      throw new TypeError('Promises must be constructed via new');
    if (typeof fn !== 'function') throw new TypeError('not a function');
    /** @type {!number} */
    this._state = 0;
    /** @type {!boolean} */
    this._handled = false;
    /** @type {Promise|undefined} */
    this._value = undefined;
    /** @type {!Array<!Function>} */
    this._deferreds = [];

    doResolve(fn, this);
  }

  function handle(self, deferred) {
    while (self._state === 3) {
      self = self._value;
    }
    if (self._state === 0) {
      self._deferreds.push(deferred);
      return;
    }
    self._handled = true;
    Promise$1._immediateFn(function() {
      var cb = self._state === 1 ? deferred.onFulfilled : deferred.onRejected;
      if (cb === null) {
        (self._state === 1 ? resolve$1 : reject)(deferred.promise, self._value);
        return;
      }
      var ret;
      try {
        ret = cb(self._value);
      } catch (e) {
        reject(deferred.promise, e);
        return;
      }
      resolve$1(deferred.promise, ret);
    });
  }

  function resolve$1(self, newValue) {
    try {
      // Promise Resolution Procedure: https://github.com/promises-aplus/promises-spec#the-promise-resolution-procedure
      if (newValue === self)
        throw new TypeError('A promise cannot be resolved with itself.');
      if (
        newValue &&
        (typeof newValue === 'object' || typeof newValue === 'function')
      ) {
        var then = newValue.then;
        if (newValue instanceof Promise$1) {
          self._state = 3;
          self._value = newValue;
          finale(self);
          return;
        } else if (typeof then === 'function') {
          doResolve(bind(then, newValue), self);
          return;
        }
      }
      self._state = 1;
      self._value = newValue;
      finale(self);
    } catch (e) {
      reject(self, e);
    }
  }

  function reject(self, newValue) {
    self._state = 2;
    self._value = newValue;
    finale(self);
  }

  function finale(self) {
    if (self._state === 2 && self._deferreds.length === 0) {
      Promise$1._immediateFn(function() {
        if (!self._handled) {
          Promise$1._unhandledRejectionFn(self._value);
        }
      });
    }

    for (var i = 0, len = self._deferreds.length; i < len; i++) {
      handle(self, self._deferreds[i]);
    }
    self._deferreds = null;
  }

  /**
   * @constructor
   */
  function Handler(onFulfilled, onRejected, promise) {
    this.onFulfilled = typeof onFulfilled === 'function' ? onFulfilled : null;
    this.onRejected = typeof onRejected === 'function' ? onRejected : null;
    this.promise = promise;
  }

  /**
   * Take a potentially misbehaving resolver function and make sure
   * onFulfilled and onRejected are only called once.
   *
   * Makes no guarantees about asynchrony.
   */
  function doResolve(fn, self) {
    var done = false;
    try {
      fn(
        function(value) {
          if (done) return;
          done = true;
          resolve$1(self, value);
        },
        function(reason) {
          if (done) return;
          done = true;
          reject(self, reason);
        }
      );
    } catch (ex) {
      if (done) return;
      done = true;
      reject(self, ex);
    }
  }

  Promise$1.prototype['catch'] = function(onRejected) {
    return this.then(null, onRejected);
  };

  Promise$1.prototype.then = function(onFulfilled, onRejected) {
    // @ts-ignore
    var prom = new this.constructor(noop);

    handle(this, new Handler(onFulfilled, onRejected, prom));
    return prom;
  };

  Promise$1.prototype['finally'] = finallyConstructor;

  Promise$1.all = function(arr) {
    return new Promise$1(function(resolve, reject) {
      if (!isArray(arr)) {
        return reject(new TypeError('Promise.all accepts an array'));
      }

      var args = Array.prototype.slice.call(arr);
      if (args.length === 0) return resolve([]);
      var remaining = args.length;

      function res(i, val) {
        try {
          if (val && (typeof val === 'object' || typeof val === 'function')) {
            var then = val.then;
            if (typeof then === 'function') {
              then.call(
                val,
                function(val) {
                  res(i, val);
                },
                reject
              );
              return;
            }
          }
          args[i] = val;
          if (--remaining === 0) {
            resolve(args);
          }
        } catch (ex) {
          reject(ex);
        }
      }

      for (var i = 0; i < args.length; i++) {
        res(i, args[i]);
      }
    });
  };

  Promise$1.allSettled = allSettled;

  Promise$1.resolve = function(value) {
    if (value && typeof value === 'object' && value.constructor === Promise$1) {
      return value;
    }

    return new Promise$1(function(resolve) {
      resolve(value);
    });
  };

  Promise$1.reject = function(value) {
    return new Promise$1(function(resolve, reject) {
      reject(value);
    });
  };

  Promise$1.race = function(arr) {
    return new Promise$1(function(resolve, reject) {
      if (!isArray(arr)) {
        return reject(new TypeError('Promise.race accepts an array'));
      }

      for (var i = 0, len = arr.length; i < len; i++) {
        Promise$1.resolve(arr[i]).then(resolve, reject);
      }
    });
  };

  // Use polyfill for setImmediate for performance gains
  Promise$1._immediateFn =
    // @ts-ignore
    (typeof setImmediate === 'function' &&
      function(fn) {
        // @ts-ignore
        setImmediate(fn);
      }) ||
    function(fn) {
      setTimeoutFunc(fn, 0);
    };

  Promise$1._unhandledRejectionFn = function _unhandledRejectionFn(err) {
    if (typeof console !== 'undefined' && console) {
      console.warn('Possible Unhandled Promise Rejection:', err); // eslint-disable-line no-console
    }
  };

  var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

  /*
  object-assign
  (c) Sindre Sorhus
  @license MIT
  */
  /* eslint-disable no-unused-vars */
  var getOwnPropertySymbols = Object.getOwnPropertySymbols;
  var hasOwnProperty$1 = Object.prototype.hasOwnProperty;
  var propIsEnumerable = Object.prototype.propertyIsEnumerable;

  function toObject(val) {
  	if (val === null || val === undefined) {
  		throw new TypeError('Object.assign cannot be called with null or undefined');
  	}

  	return Object(val);
  }

  function shouldUseNative() {
  	try {
  		if (!Object.assign) {
  			return false;
  		}

  		// Detect buggy property enumeration order in older V8 versions.

  		// https://bugs.chromium.org/p/v8/issues/detail?id=4118
  		var test1 = new String('abc');  // eslint-disable-line no-new-wrappers
  		test1[5] = 'de';
  		if (Object.getOwnPropertyNames(test1)[0] === '5') {
  			return false;
  		}

  		// https://bugs.chromium.org/p/v8/issues/detail?id=3056
  		var test2 = {};
  		for (var i = 0; i < 10; i++) {
  			test2['_' + String.fromCharCode(i)] = i;
  		}
  		var order2 = Object.getOwnPropertyNames(test2).map(function (n) {
  			return test2[n];
  		});
  		if (order2.join('') !== '0123456789') {
  			return false;
  		}

  		// https://bugs.chromium.org/p/v8/issues/detail?id=3056
  		var test3 = {};
  		'abcdefghijklmnopqrst'.split('').forEach(function (letter) {
  			test3[letter] = letter;
  		});
  		if (Object.keys(Object.assign({}, test3)).join('') !==
  				'abcdefghijklmnopqrst') {
  			return false;
  		}

  		return true;
  	} catch (err) {
  		// We don't expect any of the above to throw, but better to be safe.
  		return false;
  	}
  }

  var objectAssign = shouldUseNative() ? Object.assign : function (target, source) {
  	var from;
  	var to = toObject(target);
  	var symbols;

  	for (var s = 1; s < arguments.length; s++) {
  		from = Object(arguments[s]);

  		for (var key in from) {
  			if (hasOwnProperty$1.call(from, key)) {
  				to[key] = from[key];
  			}
  		}

  		if (getOwnPropertySymbols) {
  			symbols = getOwnPropertySymbols(from);
  			for (var i = 0; i < symbols.length; i++) {
  				if (propIsEnumerable.call(from, symbols[i])) {
  					to[symbols[i]] = from[symbols[i]];
  				}
  			}
  		}
  	}

  	return to;
  };

  /*!
   * @pixi/polyfill - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/polyfill is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  "undefined"==typeof globalThis&&("undefined"!=typeof self?self.globalThis=self:"undefined"!=typeof global&&(global.globalThis=global)),globalThis.Promise||(globalThis.Promise=Promise$1),Object.assign||(Object.assign=objectAssign);if(Date.now&&Date.prototype.getTime||(Date.now=function(){return (new Date).getTime()}),!globalThis.performance||!globalThis.performance.now){var e$5=Date.now();globalThis.performance||(globalThis.performance={}),globalThis.performance.now=function(){return Date.now()-e$5};}for(var o$c=Date.now(),i$8=["ms","moz","webkit","o"],n$c=0;n$c<i$8.length&&!globalThis.requestAnimationFrame;++n$c){var l$b=i$8[n$c];globalThis.requestAnimationFrame=globalThis[l$b+"RequestAnimationFrame"],globalThis.cancelAnimationFrame=globalThis[l$b+"CancelAnimationFrame"]||globalThis[l$b+"CancelRequestAnimationFrame"];}globalThis.requestAnimationFrame||(globalThis.requestAnimationFrame=function(a){if("function"!=typeof a)throw new TypeError(a+"is not a function");var r=Date.now(),e=16+o$c-r;return e<0&&(e=0),o$c=r,globalThis.self.setTimeout((function(){o$c=Date.now(),a(performance.now());}),e)}),globalThis.cancelAnimationFrame||(globalThis.cancelAnimationFrame=function(a){return clearTimeout(a)}),Math.sign||(Math.sign=function(a){return 0===(a=Number(a))||isNaN(a)?a:a>0?1:-1}),Number.isInteger||(Number.isInteger=function(a){return "number"==typeof a&&isFinite(a)&&Math.floor(a)===a}),globalThis.ArrayBuffer||(globalThis.ArrayBuffer=Array),globalThis.Float32Array||(globalThis.Float32Array=Array),globalThis.Uint32Array||(globalThis.Uint32Array=Array),globalThis.Uint16Array||(globalThis.Uint16Array=Array),globalThis.Uint8Array||(globalThis.Uint8Array=Array),globalThis.Int32Array||(globalThis.Int32Array=Array);

  /*!
   * @pixi/settings - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/settings is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  var E$7,_$b,T$9,N$8,R$6,A$7,I$8,e$4,n$b,O$8,L$6,i$7,t$4,U$6,o$b,S$6,P$8,a$8,r$6,M$4;!function(E){E[E.WEBGL_LEGACY=0]="WEBGL_LEGACY",E[E.WEBGL=1]="WEBGL",E[E.WEBGL2=2]="WEBGL2";}(E$7||(E$7={})),function(E){E[E.UNKNOWN=0]="UNKNOWN",E[E.WEBGL=1]="WEBGL",E[E.CANVAS=2]="CANVAS";}(_$b||(_$b={})),function(E){E[E.COLOR=16384]="COLOR",E[E.DEPTH=256]="DEPTH",E[E.STENCIL=1024]="STENCIL";}(T$9||(T$9={})),function(E){E[E.NORMAL=0]="NORMAL",E[E.ADD=1]="ADD",E[E.MULTIPLY=2]="MULTIPLY",E[E.SCREEN=3]="SCREEN",E[E.OVERLAY=4]="OVERLAY",E[E.DARKEN=5]="DARKEN",E[E.LIGHTEN=6]="LIGHTEN",E[E.COLOR_DODGE=7]="COLOR_DODGE",E[E.COLOR_BURN=8]="COLOR_BURN",E[E.HARD_LIGHT=9]="HARD_LIGHT",E[E.SOFT_LIGHT=10]="SOFT_LIGHT",E[E.DIFFERENCE=11]="DIFFERENCE",E[E.EXCLUSION=12]="EXCLUSION",E[E.HUE=13]="HUE",E[E.SATURATION=14]="SATURATION",E[E.COLOR=15]="COLOR",E[E.LUMINOSITY=16]="LUMINOSITY",E[E.NORMAL_NPM=17]="NORMAL_NPM",E[E.ADD_NPM=18]="ADD_NPM",E[E.SCREEN_NPM=19]="SCREEN_NPM",E[E.NONE=20]="NONE",E[E.SRC_OVER=0]="SRC_OVER",E[E.SRC_IN=21]="SRC_IN",E[E.SRC_OUT=22]="SRC_OUT",E[E.SRC_ATOP=23]="SRC_ATOP",E[E.DST_OVER=24]="DST_OVER",E[E.DST_IN=25]="DST_IN",E[E.DST_OUT=26]="DST_OUT",E[E.DST_ATOP=27]="DST_ATOP",E[E.ERASE=26]="ERASE",E[E.SUBTRACT=28]="SUBTRACT",E[E.XOR=29]="XOR";}(N$8||(N$8={})),function(E){E[E.POINTS=0]="POINTS",E[E.LINES=1]="LINES",E[E.LINE_LOOP=2]="LINE_LOOP",E[E.LINE_STRIP=3]="LINE_STRIP",E[E.TRIANGLES=4]="TRIANGLES",E[E.TRIANGLE_STRIP=5]="TRIANGLE_STRIP",E[E.TRIANGLE_FAN=6]="TRIANGLE_FAN";}(R$6||(R$6={})),function(E){E[E.RGBA=6408]="RGBA",E[E.RGB=6407]="RGB",E[E.RG=33319]="RG",E[E.RED=6403]="RED",E[E.RGBA_INTEGER=36249]="RGBA_INTEGER",E[E.RGB_INTEGER=36248]="RGB_INTEGER",E[E.RG_INTEGER=33320]="RG_INTEGER",E[E.RED_INTEGER=36244]="RED_INTEGER",E[E.ALPHA=6406]="ALPHA",E[E.LUMINANCE=6409]="LUMINANCE",E[E.LUMINANCE_ALPHA=6410]="LUMINANCE_ALPHA",E[E.DEPTH_COMPONENT=6402]="DEPTH_COMPONENT",E[E.DEPTH_STENCIL=34041]="DEPTH_STENCIL";}(A$7||(A$7={})),function(E){E[E.TEXTURE_2D=3553]="TEXTURE_2D",E[E.TEXTURE_CUBE_MAP=34067]="TEXTURE_CUBE_MAP",E[E.TEXTURE_2D_ARRAY=35866]="TEXTURE_2D_ARRAY",E[E.TEXTURE_CUBE_MAP_POSITIVE_X=34069]="TEXTURE_CUBE_MAP_POSITIVE_X",E[E.TEXTURE_CUBE_MAP_NEGATIVE_X=34070]="TEXTURE_CUBE_MAP_NEGATIVE_X",E[E.TEXTURE_CUBE_MAP_POSITIVE_Y=34071]="TEXTURE_CUBE_MAP_POSITIVE_Y",E[E.TEXTURE_CUBE_MAP_NEGATIVE_Y=34072]="TEXTURE_CUBE_MAP_NEGATIVE_Y",E[E.TEXTURE_CUBE_MAP_POSITIVE_Z=34073]="TEXTURE_CUBE_MAP_POSITIVE_Z",E[E.TEXTURE_CUBE_MAP_NEGATIVE_Z=34074]="TEXTURE_CUBE_MAP_NEGATIVE_Z";}(I$8||(I$8={})),function(E){E[E.UNSIGNED_BYTE=5121]="UNSIGNED_BYTE",E[E.UNSIGNED_SHORT=5123]="UNSIGNED_SHORT",E[E.UNSIGNED_SHORT_5_6_5=33635]="UNSIGNED_SHORT_5_6_5",E[E.UNSIGNED_SHORT_4_4_4_4=32819]="UNSIGNED_SHORT_4_4_4_4",E[E.UNSIGNED_SHORT_5_5_5_1=32820]="UNSIGNED_SHORT_5_5_5_1",E[E.UNSIGNED_INT=5125]="UNSIGNED_INT",E[E.UNSIGNED_INT_10F_11F_11F_REV=35899]="UNSIGNED_INT_10F_11F_11F_REV",E[E.UNSIGNED_INT_2_10_10_10_REV=33640]="UNSIGNED_INT_2_10_10_10_REV",E[E.UNSIGNED_INT_24_8=34042]="UNSIGNED_INT_24_8",E[E.UNSIGNED_INT_5_9_9_9_REV=35902]="UNSIGNED_INT_5_9_9_9_REV",E[E.BYTE=5120]="BYTE",E[E.SHORT=5122]="SHORT",E[E.INT=5124]="INT",E[E.FLOAT=5126]="FLOAT",E[E.FLOAT_32_UNSIGNED_INT_24_8_REV=36269]="FLOAT_32_UNSIGNED_INT_24_8_REV",E[E.HALF_FLOAT=36193]="HALF_FLOAT";}(e$4||(e$4={})),function(E){E[E.FLOAT=0]="FLOAT",E[E.INT=1]="INT",E[E.UINT=2]="UINT";}(n$b||(n$b={})),function(E){E[E.NEAREST=0]="NEAREST",E[E.LINEAR=1]="LINEAR";}(O$8||(O$8={})),function(E){E[E.CLAMP=33071]="CLAMP",E[E.REPEAT=10497]="REPEAT",E[E.MIRRORED_REPEAT=33648]="MIRRORED_REPEAT";}(L$6||(L$6={})),function(E){E[E.OFF=0]="OFF",E[E.POW2=1]="POW2",E[E.ON=2]="ON",E[E.ON_MANUAL=3]="ON_MANUAL";}(i$7||(i$7={})),function(E){E[E.NPM=0]="NPM",E[E.UNPACK=1]="UNPACK",E[E.PMA=2]="PMA",E[E.NO_PREMULTIPLIED_ALPHA=0]="NO_PREMULTIPLIED_ALPHA",E[E.PREMULTIPLY_ON_UPLOAD=1]="PREMULTIPLY_ON_UPLOAD",E[E.PREMULTIPLY_ALPHA=2]="PREMULTIPLY_ALPHA",E[E.PREMULTIPLIED_ALPHA=2]="PREMULTIPLIED_ALPHA";}(t$4||(t$4={})),function(E){E[E.NO=0]="NO",E[E.YES=1]="YES",E[E.AUTO=2]="AUTO",E[E.BLEND=0]="BLEND",E[E.CLEAR=1]="CLEAR",E[E.BLIT=2]="BLIT";}(U$6||(U$6={})),function(E){E[E.AUTO=0]="AUTO",E[E.MANUAL=1]="MANUAL";}(o$b||(o$b={})),function(E){E.LOW="lowp",E.MEDIUM="mediump",E.HIGH="highp";}(S$6||(S$6={})),function(E){E[E.NONE=0]="NONE",E[E.SCISSOR=1]="SCISSOR",E[E.STENCIL=2]="STENCIL",E[E.SPRITE=3]="SPRITE",E[E.COLOR=4]="COLOR";}(P$8||(P$8={})),function(E){E[E.RED=1]="RED",E[E.GREEN=2]="GREEN",E[E.BLUE=4]="BLUE",E[E.ALPHA=8]="ALPHA";}(a$8||(a$8={})),function(E){E[E.NONE=0]="NONE",E[E.LOW=2]="LOW",E[E.MEDIUM=4]="MEDIUM",E[E.HIGH=8]="HIGH";}(r$6||(r$6={})),function(E){E[E.ELEMENT_ARRAY_BUFFER=34963]="ELEMENT_ARRAY_BUFFER",E[E.ARRAY_BUFFER=34962]="ARRAY_BUFFER",E[E.UNIFORM_BUFFER=35345]="UNIFORM_BUFFER";}(M$4||(M$4={}));var D$5={createCanvas:function(E,_){var T=document.createElement("canvas");return T.width=E,T.height=_,T},getWebGLRenderingContext:function(){return WebGLRenderingContext},getNavigator:function(){return navigator},getBaseUrl:function(){var E;return null!==(E=document.baseURI)&&void 0!==E?E:window.location.href},fetch:function(E,_){return fetch(E,_)}},C$8=/iPhone/i,G$2=/iPod/i,u$b=/iPad/i,c$c=/\biOS-universal(?:.+)Mac\b/i,B$4=/\bAndroid(?:.+)Mobile\b/i,d$b=/Android/i,f$9=/(?:SD4930UR|\bSilk(?:.+)Mobile\b)/i,l$a=/Silk/i,H$4=/Windows Phone/i,p$9=/\bWindows(?:.+)ARM\b/i,F$5=/BlackBerry/i,v$9=/BB10/i,s$8=/Opera Mini/i,h$8=/\b(CriOS|Chrome)(?:.+)Mobile/i,b$7=/Mobile(?:.+)Firefox\b/i,g$a=function(E){return void 0!==E&&"MacIntel"===E.platform&&"number"==typeof E.maxTouchPoints&&E.maxTouchPoints>1&&"undefined"==typeof MSStream};var X$2=function(E){var _={userAgent:"",platform:"",maxTouchPoints:0};E||"undefined"==typeof navigator?"string"==typeof E?_.userAgent=E:E&&E.userAgent&&(_={userAgent:E.userAgent,platform:E.platform,maxTouchPoints:E.maxTouchPoints||0}):_={userAgent:navigator.userAgent,platform:navigator.platform,maxTouchPoints:navigator.maxTouchPoints||0};var T=_.userAgent,N=T.split("[FBAN");void 0!==N[1]&&(T=N[0]),void 0!==(N=T.split("Twitter"))[1]&&(T=N[0]);var R=function(E){return function(_){return _.test(E)}}(T),A={apple:{phone:R(C$8)&&!R(H$4),ipod:R(G$2),tablet:!R(C$8)&&(R(u$b)||g$a(_))&&!R(H$4),universal:R(c$c),device:(R(C$8)||R(G$2)||R(u$b)||R(c$c)||g$a(_))&&!R(H$4)},amazon:{phone:R(f$9),tablet:!R(f$9)&&R(l$a),device:R(f$9)||R(l$a)},android:{phone:!R(H$4)&&R(f$9)||!R(H$4)&&R(B$4),tablet:!R(H$4)&&!R(f$9)&&!R(B$4)&&(R(l$a)||R(d$b)),device:!R(H$4)&&(R(f$9)||R(l$a)||R(B$4)||R(d$b))||R(/\bokhttp\b/i)},windows:{phone:R(H$4),tablet:R(p$9),device:R(H$4)||R(p$9)},other:{blackberry:R(F$5),blackberry10:R(v$9),opera:R(s$8),firefox:R(b$7),chrome:R(h$8),device:R(F$5)||R(v$9)||R(s$8)||R(b$7)||R(h$8)},any:!1,phone:!1,tablet:!1};return A.any=A.apple.device||A.android.device||A.windows.device||A.other.device,A.phone=A.apple.phone||A.android.phone||A.windows.phone,A.tablet=A.apple.tablet||A.android.tablet||A.windows.tablet,A}(globalThis.navigator);var V$2={ADAPTER:D$5,MIPMAP_TEXTURES:i$7.POW2,ANISOTROPIC_LEVEL:0,RESOLUTION:1,FILTER_RESOLUTION:1,FILTER_MULTISAMPLE:r$6.NONE,SPRITE_MAX_TEXTURES:function(E){var _=!0;if(X$2.tablet||X$2.phone){var T;if(X$2.apple.device)if(T=navigator.userAgent.match(/OS (\d+)_(\d+)?/))parseInt(T[1],10)<11&&(_=!1);if(X$2.android.device)if(T=navigator.userAgent.match(/Android\s([0-9.]*)/))parseInt(T[1],10)<7&&(_=!1);}return _?E:4}(32),SPRITE_BATCH_SIZE:4096,RENDER_OPTIONS:{view:null,antialias:!1,autoDensity:!1,backgroundColor:0,backgroundAlpha:1,useContextAlpha:!0,clearBeforeRender:!0,preserveDrawingBuffer:!1,width:800,height:600,legacy:!1},GC_MODE:o$b.AUTO,GC_MAX_IDLE:3600,GC_MAX_CHECK_COUNT:600,WRAP_MODE:L$6.CLAMP,SCALE_MODE:O$8.LINEAR,PRECISION_VERTEX:S$6.HIGH,PRECISION_FRAGMENT:X$2.apple.device?S$6.HIGH:S$6.MEDIUM,CAN_UPLOAD_SAME_BUFFER:!X$2.apple.device,CREATE_IMAGE_BITMAP:!1,ROUND_PIXELS:!1};

  var eventemitter3 = {exports: {}};

  (function (module) {

  var has = Object.prototype.hasOwnProperty
    , prefix = '~';

  /**
   * Constructor to create a storage for our `EE` objects.
   * An `Events` instance is a plain object whose properties are event names.
   *
   * @constructor
   * @private
   */
  function Events() {}

  //
  // We try to not inherit from `Object.prototype`. In some engines creating an
  // instance in this way is faster than calling `Object.create(null)` directly.
  // If `Object.create(null)` is not supported we prefix the event names with a
  // character to make sure that the built-in object properties are not
  // overridden or used as an attack vector.
  //
  if (Object.create) {
    Events.prototype = Object.create(null);

    //
    // This hack is needed because the `__proto__` property is still inherited in
    // some old browsers like Android 4, iPhone 5.1, Opera 11 and Safari 5.
    //
    if (!new Events().__proto__) prefix = false;
  }

  /**
   * Representation of a single event listener.
   *
   * @param {Function} fn The listener function.
   * @param {*} context The context to invoke the listener with.
   * @param {Boolean} [once=false] Specify if the listener is a one-time listener.
   * @constructor
   * @private
   */
  function EE(fn, context, once) {
    this.fn = fn;
    this.context = context;
    this.once = once || false;
  }

  /**
   * Add a listener for a given event.
   *
   * @param {EventEmitter} emitter Reference to the `EventEmitter` instance.
   * @param {(String|Symbol)} event The event name.
   * @param {Function} fn The listener function.
   * @param {*} context The context to invoke the listener with.
   * @param {Boolean} once Specify if the listener is a one-time listener.
   * @returns {EventEmitter}
   * @private
   */
  function addListener(emitter, event, fn, context, once) {
    if (typeof fn !== 'function') {
      throw new TypeError('The listener must be a function');
    }

    var listener = new EE(fn, context || emitter, once)
      , evt = prefix ? prefix + event : event;

    if (!emitter._events[evt]) emitter._events[evt] = listener, emitter._eventsCount++;
    else if (!emitter._events[evt].fn) emitter._events[evt].push(listener);
    else emitter._events[evt] = [emitter._events[evt], listener];

    return emitter;
  }

  /**
   * Clear event by name.
   *
   * @param {EventEmitter} emitter Reference to the `EventEmitter` instance.
   * @param {(String|Symbol)} evt The Event name.
   * @private
   */
  function clearEvent(emitter, evt) {
    if (--emitter._eventsCount === 0) emitter._events = new Events();
    else delete emitter._events[evt];
  }

  /**
   * Minimal `EventEmitter` interface that is molded against the Node.js
   * `EventEmitter` interface.
   *
   * @constructor
   * @public
   */
  function EventEmitter() {
    this._events = new Events();
    this._eventsCount = 0;
  }

  /**
   * Return an array listing the events for which the emitter has registered
   * listeners.
   *
   * @returns {Array}
   * @public
   */
  EventEmitter.prototype.eventNames = function eventNames() {
    var names = []
      , events
      , name;

    if (this._eventsCount === 0) return names;

    for (name in (events = this._events)) {
      if (has.call(events, name)) names.push(prefix ? name.slice(1) : name);
    }

    if (Object.getOwnPropertySymbols) {
      return names.concat(Object.getOwnPropertySymbols(events));
    }

    return names;
  };

  /**
   * Return the listeners registered for a given event.
   *
   * @param {(String|Symbol)} event The event name.
   * @returns {Array} The registered listeners.
   * @public
   */
  EventEmitter.prototype.listeners = function listeners(event) {
    var evt = prefix ? prefix + event : event
      , handlers = this._events[evt];

    if (!handlers) return [];
    if (handlers.fn) return [handlers.fn];

    for (var i = 0, l = handlers.length, ee = new Array(l); i < l; i++) {
      ee[i] = handlers[i].fn;
    }

    return ee;
  };

  /**
   * Return the number of listeners listening to a given event.
   *
   * @param {(String|Symbol)} event The event name.
   * @returns {Number} The number of listeners.
   * @public
   */
  EventEmitter.prototype.listenerCount = function listenerCount(event) {
    var evt = prefix ? prefix + event : event
      , listeners = this._events[evt];

    if (!listeners) return 0;
    if (listeners.fn) return 1;
    return listeners.length;
  };

  /**
   * Calls each of the listeners registered for a given event.
   *
   * @param {(String|Symbol)} event The event name.
   * @returns {Boolean} `true` if the event had listeners, else `false`.
   * @public
   */
  EventEmitter.prototype.emit = function emit(event, a1, a2, a3, a4, a5) {
    var evt = prefix ? prefix + event : event;

    if (!this._events[evt]) return false;

    var listeners = this._events[evt]
      , len = arguments.length
      , args
      , i;

    if (listeners.fn) {
      if (listeners.once) this.removeListener(event, listeners.fn, undefined, true);

      switch (len) {
        case 1: return listeners.fn.call(listeners.context), true;
        case 2: return listeners.fn.call(listeners.context, a1), true;
        case 3: return listeners.fn.call(listeners.context, a1, a2), true;
        case 4: return listeners.fn.call(listeners.context, a1, a2, a3), true;
        case 5: return listeners.fn.call(listeners.context, a1, a2, a3, a4), true;
        case 6: return listeners.fn.call(listeners.context, a1, a2, a3, a4, a5), true;
      }

      for (i = 1, args = new Array(len -1); i < len; i++) {
        args[i - 1] = arguments[i];
      }

      listeners.fn.apply(listeners.context, args);
    } else {
      var length = listeners.length
        , j;

      for (i = 0; i < length; i++) {
        if (listeners[i].once) this.removeListener(event, listeners[i].fn, undefined, true);

        switch (len) {
          case 1: listeners[i].fn.call(listeners[i].context); break;
          case 2: listeners[i].fn.call(listeners[i].context, a1); break;
          case 3: listeners[i].fn.call(listeners[i].context, a1, a2); break;
          case 4: listeners[i].fn.call(listeners[i].context, a1, a2, a3); break;
          default:
            if (!args) for (j = 1, args = new Array(len -1); j < len; j++) {
              args[j - 1] = arguments[j];
            }

            listeners[i].fn.apply(listeners[i].context, args);
        }
      }
    }

    return true;
  };

  /**
   * Add a listener for a given event.
   *
   * @param {(String|Symbol)} event The event name.
   * @param {Function} fn The listener function.
   * @param {*} [context=this] The context to invoke the listener with.
   * @returns {EventEmitter} `this`.
   * @public
   */
  EventEmitter.prototype.on = function on(event, fn, context) {
    return addListener(this, event, fn, context, false);
  };

  /**
   * Add a one-time listener for a given event.
   *
   * @param {(String|Symbol)} event The event name.
   * @param {Function} fn The listener function.
   * @param {*} [context=this] The context to invoke the listener with.
   * @returns {EventEmitter} `this`.
   * @public
   */
  EventEmitter.prototype.once = function once(event, fn, context) {
    return addListener(this, event, fn, context, true);
  };

  /**
   * Remove the listeners of a given event.
   *
   * @param {(String|Symbol)} event The event name.
   * @param {Function} fn Only remove the listeners that match this function.
   * @param {*} context Only remove the listeners that have this context.
   * @param {Boolean} once Only remove one-time listeners.
   * @returns {EventEmitter} `this`.
   * @public
   */
  EventEmitter.prototype.removeListener = function removeListener(event, fn, context, once) {
    var evt = prefix ? prefix + event : event;

    if (!this._events[evt]) return this;
    if (!fn) {
      clearEvent(this, evt);
      return this;
    }

    var listeners = this._events[evt];

    if (listeners.fn) {
      if (
        listeners.fn === fn &&
        (!once || listeners.once) &&
        (!context || listeners.context === context)
      ) {
        clearEvent(this, evt);
      }
    } else {
      for (var i = 0, events = [], length = listeners.length; i < length; i++) {
        if (
          listeners[i].fn !== fn ||
          (once && !listeners[i].once) ||
          (context && listeners[i].context !== context)
        ) {
          events.push(listeners[i]);
        }
      }

      //
      // Reset the array, or remove it completely if we have no more listeners.
      //
      if (events.length) this._events[evt] = events.length === 1 ? events[0] : events;
      else clearEvent(this, evt);
    }

    return this;
  };

  /**
   * Remove all listeners, or those of the specified event.
   *
   * @param {(String|Symbol)} [event] The event name.
   * @returns {EventEmitter} `this`.
   * @public
   */
  EventEmitter.prototype.removeAllListeners = function removeAllListeners(event) {
    var evt;

    if (event) {
      evt = prefix ? prefix + event : event;
      if (this._events[evt]) clearEvent(this, evt);
    } else {
      this._events = new Events();
      this._eventsCount = 0;
    }

    return this;
  };

  //
  // Alias methods names because people roll like that.
  //
  EventEmitter.prototype.off = EventEmitter.prototype.removeListener;
  EventEmitter.prototype.addListener = EventEmitter.prototype.on;

  //
  // Expose the prefix.
  //
  EventEmitter.prefixed = prefix;

  //
  // Allow `EventEmitter` to be imported as module namespace.
  //
  EventEmitter.EventEmitter = EventEmitter;

  //
  // Expose the module.
  //
  {
    module.exports = EventEmitter;
  }
  }(eventemitter3));

  var r$5 = eventemitter3.exports;

  var earcut$1 = {exports: {}};

  earcut$1.exports = earcut;
  earcut$1.exports.default = earcut;

  function earcut(data, holeIndices, dim) {

      dim = dim || 2;

      var hasHoles = holeIndices && holeIndices.length,
          outerLen = hasHoles ? holeIndices[0] * dim : data.length,
          outerNode = linkedList(data, 0, outerLen, dim, true),
          triangles = [];

      if (!outerNode || outerNode.next === outerNode.prev) return triangles;

      var minX, minY, maxX, maxY, x, y, invSize;

      if (hasHoles) outerNode = eliminateHoles(data, holeIndices, outerNode, dim);

      // if the shape is not too simple, we'll use z-order curve hash later; calculate polygon bbox
      if (data.length > 80 * dim) {
          minX = maxX = data[0];
          minY = maxY = data[1];

          for (var i = dim; i < outerLen; i += dim) {
              x = data[i];
              y = data[i + 1];
              if (x < minX) minX = x;
              if (y < minY) minY = y;
              if (x > maxX) maxX = x;
              if (y > maxY) maxY = y;
          }

          // minX, minY and invSize are later used to transform coords into integers for z-order calculation
          invSize = Math.max(maxX - minX, maxY - minY);
          invSize = invSize !== 0 ? 32767 / invSize : 0;
      }

      earcutLinked(outerNode, triangles, dim, minX, minY, invSize, 0);

      return triangles;
  }

  // create a circular doubly linked list from polygon points in the specified winding order
  function linkedList(data, start, end, dim, clockwise) {
      var i, last;

      if (clockwise === (signedArea(data, start, end, dim) > 0)) {
          for (i = start; i < end; i += dim) last = insertNode(i, data[i], data[i + 1], last);
      } else {
          for (i = end - dim; i >= start; i -= dim) last = insertNode(i, data[i], data[i + 1], last);
      }

      if (last && equals(last, last.next)) {
          removeNode(last);
          last = last.next;
      }

      return last;
  }

  // eliminate colinear or duplicate points
  function filterPoints(start, end) {
      if (!start) return start;
      if (!end) end = start;

      var p = start,
          again;
      do {
          again = false;

          if (!p.steiner && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) {
              removeNode(p);
              p = end = p.prev;
              if (p === p.next) break;
              again = true;

          } else {
              p = p.next;
          }
      } while (again || p !== end);

      return end;
  }

  // main ear slicing loop which triangulates a polygon (given as a linked list)
  function earcutLinked(ear, triangles, dim, minX, minY, invSize, pass) {
      if (!ear) return;

      // interlink polygon nodes in z-order
      if (!pass && invSize) indexCurve(ear, minX, minY, invSize);

      var stop = ear,
          prev, next;

      // iterate through ears, slicing them one by one
      while (ear.prev !== ear.next) {
          prev = ear.prev;
          next = ear.next;

          if (invSize ? isEarHashed(ear, minX, minY, invSize) : isEar(ear)) {
              // cut off the triangle
              triangles.push(prev.i / dim | 0);
              triangles.push(ear.i / dim | 0);
              triangles.push(next.i / dim | 0);

              removeNode(ear);

              // skipping the next vertex leads to less sliver triangles
              ear = next.next;
              stop = next.next;

              continue;
          }

          ear = next;

          // if we looped through the whole remaining polygon and can't find any more ears
          if (ear === stop) {
              // try filtering points and slicing again
              if (!pass) {
                  earcutLinked(filterPoints(ear), triangles, dim, minX, minY, invSize, 1);

              // if this didn't work, try curing all small self-intersections locally
              } else if (pass === 1) {
                  ear = cureLocalIntersections(filterPoints(ear), triangles, dim);
                  earcutLinked(ear, triangles, dim, minX, minY, invSize, 2);

              // as a last resort, try splitting the remaining polygon into two
              } else if (pass === 2) {
                  splitEarcut(ear, triangles, dim, minX, minY, invSize);
              }

              break;
          }
      }
  }

  // check whether a polygon node forms a valid ear with adjacent nodes
  function isEar(ear) {
      var a = ear.prev,
          b = ear,
          c = ear.next;

      if (area(a, b, c) >= 0) return false; // reflex, can't be an ear

      // now make sure we don't have other points inside the potential ear
      var ax = a.x, bx = b.x, cx = c.x, ay = a.y, by = b.y, cy = c.y;

      // triangle bbox; min & max are calculated like this for speed
      var x0 = ax < bx ? (ax < cx ? ax : cx) : (bx < cx ? bx : cx),
          y0 = ay < by ? (ay < cy ? ay : cy) : (by < cy ? by : cy),
          x1 = ax > bx ? (ax > cx ? ax : cx) : (bx > cx ? bx : cx),
          y1 = ay > by ? (ay > cy ? ay : cy) : (by > cy ? by : cy);

      var p = c.next;
      while (p !== a) {
          if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 &&
              pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) &&
              area(p.prev, p, p.next) >= 0) return false;
          p = p.next;
      }

      return true;
  }

  function isEarHashed(ear, minX, minY, invSize) {
      var a = ear.prev,
          b = ear,
          c = ear.next;

      if (area(a, b, c) >= 0) return false; // reflex, can't be an ear

      var ax = a.x, bx = b.x, cx = c.x, ay = a.y, by = b.y, cy = c.y;

      // triangle bbox; min & max are calculated like this for speed
      var x0 = ax < bx ? (ax < cx ? ax : cx) : (bx < cx ? bx : cx),
          y0 = ay < by ? (ay < cy ? ay : cy) : (by < cy ? by : cy),
          x1 = ax > bx ? (ax > cx ? ax : cx) : (bx > cx ? bx : cx),
          y1 = ay > by ? (ay > cy ? ay : cy) : (by > cy ? by : cy);

      // z-order range for the current triangle bbox;
      var minZ = zOrder(x0, y0, minX, minY, invSize),
          maxZ = zOrder(x1, y1, minX, minY, invSize);

      var p = ear.prevZ,
          n = ear.nextZ;

      // look for points inside the triangle in both directions
      while (p && p.z >= minZ && n && n.z <= maxZ) {
          if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && p !== a && p !== c &&
              pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false;
          p = p.prevZ;

          if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1 && n !== a && n !== c &&
              pointInTriangle(ax, ay, bx, by, cx, cy, n.x, n.y) && area(n.prev, n, n.next) >= 0) return false;
          n = n.nextZ;
      }

      // look for remaining points in decreasing z-order
      while (p && p.z >= minZ) {
          if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && p !== a && p !== c &&
              pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false;
          p = p.prevZ;
      }

      // look for remaining points in increasing z-order
      while (n && n.z <= maxZ) {
          if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1 && n !== a && n !== c &&
              pointInTriangle(ax, ay, bx, by, cx, cy, n.x, n.y) && area(n.prev, n, n.next) >= 0) return false;
          n = n.nextZ;
      }

      return true;
  }

  // go through all polygon nodes and cure small local self-intersections
  function cureLocalIntersections(start, triangles, dim) {
      var p = start;
      do {
          var a = p.prev,
              b = p.next.next;

          if (!equals(a, b) && intersects(a, p, p.next, b) && locallyInside(a, b) && locallyInside(b, a)) {

              triangles.push(a.i / dim | 0);
              triangles.push(p.i / dim | 0);
              triangles.push(b.i / dim | 0);

              // remove two nodes involved
              removeNode(p);
              removeNode(p.next);

              p = start = b;
          }
          p = p.next;
      } while (p !== start);

      return filterPoints(p);
  }

  // try splitting polygon into two and triangulate them independently
  function splitEarcut(start, triangles, dim, minX, minY, invSize) {
      // look for a valid diagonal that divides the polygon into two
      var a = start;
      do {
          var b = a.next.next;
          while (b !== a.prev) {
              if (a.i !== b.i && isValidDiagonal(a, b)) {
                  // split the polygon in two by the diagonal
                  var c = splitPolygon(a, b);

                  // filter colinear points around the cuts
                  a = filterPoints(a, a.next);
                  c = filterPoints(c, c.next);

                  // run earcut on each half
                  earcutLinked(a, triangles, dim, minX, minY, invSize, 0);
                  earcutLinked(c, triangles, dim, minX, minY, invSize, 0);
                  return;
              }
              b = b.next;
          }
          a = a.next;
      } while (a !== start);
  }

  // link every hole into the outer loop, producing a single-ring polygon without holes
  function eliminateHoles(data, holeIndices, outerNode, dim) {
      var queue = [],
          i, len, start, end, list;

      for (i = 0, len = holeIndices.length; i < len; i++) {
          start = holeIndices[i] * dim;
          end = i < len - 1 ? holeIndices[i + 1] * dim : data.length;
          list = linkedList(data, start, end, dim, false);
          if (list === list.next) list.steiner = true;
          queue.push(getLeftmost(list));
      }

      queue.sort(compareX);

      // process holes from left to right
      for (i = 0; i < queue.length; i++) {
          outerNode = eliminateHole(queue[i], outerNode);
      }

      return outerNode;
  }

  function compareX(a, b) {
      return a.x - b.x;
  }

  // find a bridge between vertices that connects hole with an outer ring and and link it
  function eliminateHole(hole, outerNode) {
      var bridge = findHoleBridge(hole, outerNode);
      if (!bridge) {
          return outerNode;
      }

      var bridgeReverse = splitPolygon(bridge, hole);

      // filter collinear points around the cuts
      filterPoints(bridgeReverse, bridgeReverse.next);
      return filterPoints(bridge, bridge.next);
  }

  // David Eberly's algorithm for finding a bridge between hole and outer polygon
  function findHoleBridge(hole, outerNode) {
      var p = outerNode,
          hx = hole.x,
          hy = hole.y,
          qx = -Infinity,
          m;

      // find a segment intersected by a ray from the hole's leftmost point to the left;
      // segment's endpoint with lesser x will be potential connection point
      do {
          if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
              var x = p.x + (hy - p.y) * (p.next.x - p.x) / (p.next.y - p.y);
              if (x <= hx && x > qx) {
                  qx = x;
                  m = p.x < p.next.x ? p : p.next;
                  if (x === hx) return m; // hole touches outer segment; pick leftmost endpoint
              }
          }
          p = p.next;
      } while (p !== outerNode);

      if (!m) return null;

      // look for points inside the triangle of hole point, segment intersection and endpoint;
      // if there are no points found, we have a valid connection;
      // otherwise choose the point of the minimum angle with the ray as connection point

      var stop = m,
          mx = m.x,
          my = m.y,
          tanMin = Infinity,
          tan;

      p = m;

      do {
          if (hx >= p.x && p.x >= mx && hx !== p.x &&
                  pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {

              tan = Math.abs(hy - p.y) / (hx - p.x); // tangential

              if (locallyInside(p, hole) &&
                  (tan < tanMin || (tan === tanMin && (p.x > m.x || (p.x === m.x && sectorContainsSector(m, p)))))) {
                  m = p;
                  tanMin = tan;
              }
          }

          p = p.next;
      } while (p !== stop);

      return m;
  }

  // whether sector in vertex m contains sector in vertex p in the same coordinates
  function sectorContainsSector(m, p) {
      return area(m.prev, m, p.prev) < 0 && area(p.next, m, m.next) < 0;
  }

  // interlink polygon nodes in z-order
  function indexCurve(start, minX, minY, invSize) {
      var p = start;
      do {
          if (p.z === 0) p.z = zOrder(p.x, p.y, minX, minY, invSize);
          p.prevZ = p.prev;
          p.nextZ = p.next;
          p = p.next;
      } while (p !== start);

      p.prevZ.nextZ = null;
      p.prevZ = null;

      sortLinked(p);
  }

  // Simon Tatham's linked list merge sort algorithm
  // http://www.chiark.greenend.org.uk/~sgtatham/algorithms/listsort.html
  function sortLinked(list) {
      var i, p, q, e, tail, numMerges, pSize, qSize,
          inSize = 1;

      do {
          p = list;
          list = null;
          tail = null;
          numMerges = 0;

          while (p) {
              numMerges++;
              q = p;
              pSize = 0;
              for (i = 0; i < inSize; i++) {
                  pSize++;
                  q = q.nextZ;
                  if (!q) break;
              }
              qSize = inSize;

              while (pSize > 0 || (qSize > 0 && q)) {

                  if (pSize !== 0 && (qSize === 0 || !q || p.z <= q.z)) {
                      e = p;
                      p = p.nextZ;
                      pSize--;
                  } else {
                      e = q;
                      q = q.nextZ;
                      qSize--;
                  }

                  if (tail) tail.nextZ = e;
                  else list = e;

                  e.prevZ = tail;
                  tail = e;
              }

              p = q;
          }

          tail.nextZ = null;
          inSize *= 2;

      } while (numMerges > 1);

      return list;
  }

  // z-order of a point given coords and inverse of the longer side of data bbox
  function zOrder(x, y, minX, minY, invSize) {
      // coords are transformed into non-negative 15-bit integer range
      x = (x - minX) * invSize | 0;
      y = (y - minY) * invSize | 0;

      x = (x | (x << 8)) & 0x00FF00FF;
      x = (x | (x << 4)) & 0x0F0F0F0F;
      x = (x | (x << 2)) & 0x33333333;
      x = (x | (x << 1)) & 0x55555555;

      y = (y | (y << 8)) & 0x00FF00FF;
      y = (y | (y << 4)) & 0x0F0F0F0F;
      y = (y | (y << 2)) & 0x33333333;
      y = (y | (y << 1)) & 0x55555555;

      return x | (y << 1);
  }

  // find the leftmost node of a polygon ring
  function getLeftmost(start) {
      var p = start,
          leftmost = start;
      do {
          if (p.x < leftmost.x || (p.x === leftmost.x && p.y < leftmost.y)) leftmost = p;
          p = p.next;
      } while (p !== start);

      return leftmost;
  }

  // check if a point lies within a convex triangle
  function pointInTriangle(ax, ay, bx, by, cx, cy, px, py) {
      return (cx - px) * (ay - py) >= (ax - px) * (cy - py) &&
             (ax - px) * (by - py) >= (bx - px) * (ay - py) &&
             (bx - px) * (cy - py) >= (cx - px) * (by - py);
  }

  // check if a diagonal between two polygon nodes is valid (lies in polygon interior)
  function isValidDiagonal(a, b) {
      return a.next.i !== b.i && a.prev.i !== b.i && !intersectsPolygon(a, b) && // dones't intersect other edges
             (locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b) && // locally visible
              (area(a.prev, a, b.prev) || area(a, b.prev, b)) || // does not create opposite-facing sectors
              equals(a, b) && area(a.prev, a, a.next) > 0 && area(b.prev, b, b.next) > 0); // special zero-length case
  }

  // signed area of a triangle
  function area(p, q, r) {
      return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  }

  // check if two points are equal
  function equals(p1, p2) {
      return p1.x === p2.x && p1.y === p2.y;
  }

  // check if two segments intersect
  function intersects(p1, q1, p2, q2) {
      var o1 = sign(area(p1, q1, p2));
      var o2 = sign(area(p1, q1, q2));
      var o3 = sign(area(p2, q2, p1));
      var o4 = sign(area(p2, q2, q1));

      if (o1 !== o2 && o3 !== o4) return true; // general case

      if (o1 === 0 && onSegment(p1, p2, q1)) return true; // p1, q1 and p2 are collinear and p2 lies on p1q1
      if (o2 === 0 && onSegment(p1, q2, q1)) return true; // p1, q1 and q2 are collinear and q2 lies on p1q1
      if (o3 === 0 && onSegment(p2, p1, q2)) return true; // p2, q2 and p1 are collinear and p1 lies on p2q2
      if (o4 === 0 && onSegment(p2, q1, q2)) return true; // p2, q2 and q1 are collinear and q1 lies on p2q2

      return false;
  }

  // for collinear points p, q, r, check if point q lies on segment pr
  function onSegment(p, q, r) {
      return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
  }

  function sign(num) {
      return num > 0 ? 1 : num < 0 ? -1 : 0;
  }

  // check if a polygon diagonal intersects any polygon segments
  function intersectsPolygon(a, b) {
      var p = a;
      do {
          if (p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i &&
                  intersects(p, p.next, a, b)) return true;
          p = p.next;
      } while (p !== a);

      return false;
  }

  // check if a polygon diagonal is locally inside the polygon
  function locallyInside(a, b) {
      return area(a.prev, a, a.next) < 0 ?
          area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0 :
          area(a, b, a.prev) < 0 || area(a, a.next, b) < 0;
  }

  // check if the middle point of a polygon diagonal is inside the polygon
  function middleInside(a, b) {
      var p = a,
          inside = false,
          px = (a.x + b.x) / 2,
          py = (a.y + b.y) / 2;
      do {
          if (((p.y > py) !== (p.next.y > py)) && p.next.y !== p.y &&
                  (px < (p.next.x - p.x) * (py - p.y) / (p.next.y - p.y) + p.x))
              inside = !inside;
          p = p.next;
      } while (p !== a);

      return inside;
  }

  // link two polygon vertices with a bridge; if the vertices belong to the same ring, it splits polygon into two;
  // if one belongs to the outer ring and another to a hole, it merges it into a single ring
  function splitPolygon(a, b) {
      var a2 = new Node(a.i, a.x, a.y),
          b2 = new Node(b.i, b.x, b.y),
          an = a.next,
          bp = b.prev;

      a.next = b;
      b.prev = a;

      a2.next = an;
      an.prev = a2;

      b2.next = a2;
      a2.prev = b2;

      bp.next = b2;
      b2.prev = bp;

      return b2;
  }

  // create a node and optionally link it with previous one (in a circular doubly linked list)
  function insertNode(i, x, y, last) {
      var p = new Node(i, x, y);

      if (!last) {
          p.prev = p;
          p.next = p;

      } else {
          p.next = last.next;
          p.prev = last;
          last.next.prev = p;
          last.next = p;
      }
      return p;
  }

  function removeNode(p) {
      p.next.prev = p.prev;
      p.prev.next = p.next;

      if (p.prevZ) p.prevZ.nextZ = p.nextZ;
      if (p.nextZ) p.nextZ.prevZ = p.prevZ;
  }

  function Node(i, x, y) {
      // vertex index in coordinates array
      this.i = i;

      // vertex coordinates
      this.x = x;
      this.y = y;

      // previous and next vertex nodes in a polygon ring
      this.prev = null;
      this.next = null;

      // z-order curve value
      this.z = 0;

      // previous and next nodes in z-order
      this.prevZ = null;
      this.nextZ = null;

      // indicates whether this is a steiner point
      this.steiner = false;
  }

  // return a percentage difference between the polygon area and its triangulation area;
  // used to verify correctness of triangulation
  earcut.deviation = function (data, holeIndices, dim, triangles) {
      var hasHoles = holeIndices && holeIndices.length;
      var outerLen = hasHoles ? holeIndices[0] * dim : data.length;

      var polygonArea = Math.abs(signedArea(data, 0, outerLen, dim));
      if (hasHoles) {
          for (var i = 0, len = holeIndices.length; i < len; i++) {
              var start = holeIndices[i] * dim;
              var end = i < len - 1 ? holeIndices[i + 1] * dim : data.length;
              polygonArea -= Math.abs(signedArea(data, start, end, dim));
          }
      }

      var trianglesArea = 0;
      for (i = 0; i < triangles.length; i += 3) {
          var a = triangles[i] * dim;
          var b = triangles[i + 1] * dim;
          var c = triangles[i + 2] * dim;
          trianglesArea += Math.abs(
              (data[a] - data[c]) * (data[b + 1] - data[a + 1]) -
              (data[a] - data[b]) * (data[c + 1] - data[a + 1]));
      }

      return polygonArea === 0 && trianglesArea === 0 ? 0 :
          Math.abs((trianglesArea - polygonArea) / polygonArea);
  };

  function signedArea(data, start, end, dim) {
      var sum = 0;
      for (var i = start, j = end - dim; i < end; i += dim) {
          sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]);
          j = i;
      }
      return sum;
  }

  // turn a polygon in a multi-dimensional array form (e.g. as in GeoJSON) into a form Earcut accepts
  earcut.flatten = function (data) {
      var dim = data[0][0].length,
          result = {vertices: [], holes: [], dimensions: dim},
          holeIndex = 0;

      for (var i = 0; i < data.length; i++) {
          for (var j = 0; j < data[i].length; j++) {
              for (var d = 0; d < dim; d++) result.vertices.push(data[i][j][d]);
          }
          if (i > 0) {
              holeIndex += data[i - 1].length;
              result.holes.push(holeIndex);
          }
      }
      return result;
  };

  var g$9 = earcut$1.exports;

  var punycode$1 = {exports: {}};

  /*! https://mths.be/punycode v1.3.2 by @mathias */

  (function (module, exports) {
  (function(root) {

  	/** Detect free variables */
  	var freeExports = exports &&
  		!exports.nodeType && exports;
  	var freeModule = module &&
  		!module.nodeType && module;
  	var freeGlobal = typeof commonjsGlobal == 'object' && commonjsGlobal;
  	if (
  		freeGlobal.global === freeGlobal ||
  		freeGlobal.window === freeGlobal ||
  		freeGlobal.self === freeGlobal
  	) {
  		root = freeGlobal;
  	}

  	/**
  	 * The `punycode` object.
  	 * @name punycode
  	 * @type Object
  	 */
  	var punycode,

  	/** Highest positive signed 32-bit float value */
  	maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1

  	/** Bootstring parameters */
  	base = 36,
  	tMin = 1,
  	tMax = 26,
  	skew = 38,
  	damp = 700,
  	initialBias = 72,
  	initialN = 128, // 0x80
  	delimiter = '-', // '\x2D'

  	/** Regular expressions */
  	regexPunycode = /^xn--/,
  	regexNonASCII = /[^\x20-\x7E]/, // unprintable ASCII chars + non-ASCII chars
  	regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g, // RFC 3490 separators

  	/** Error messages */
  	errors = {
  		'overflow': 'Overflow: input needs wider integers to process',
  		'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
  		'invalid-input': 'Invalid input'
  	},

  	/** Convenience shortcuts */
  	baseMinusTMin = base - tMin,
  	floor = Math.floor,
  	stringFromCharCode = String.fromCharCode,

  	/** Temporary variable */
  	key;

  	/*--------------------------------------------------------------------------*/

  	/**
  	 * A generic error utility function.
  	 * @private
  	 * @param {String} type The error type.
  	 * @returns {Error} Throws a `RangeError` with the applicable error message.
  	 */
  	function error(type) {
  		throw RangeError(errors[type]);
  	}

  	/**
  	 * A generic `Array#map` utility function.
  	 * @private
  	 * @param {Array} array The array to iterate over.
  	 * @param {Function} callback The function that gets called for every array
  	 * item.
  	 * @returns {Array} A new array of values returned by the callback function.
  	 */
  	function map(array, fn) {
  		var length = array.length;
  		var result = [];
  		while (length--) {
  			result[length] = fn(array[length]);
  		}
  		return result;
  	}

  	/**
  	 * A simple `Array#map`-like wrapper to work with domain name strings or email
  	 * addresses.
  	 * @private
  	 * @param {String} domain The domain name or email address.
  	 * @param {Function} callback The function that gets called for every
  	 * character.
  	 * @returns {Array} A new string of characters returned by the callback
  	 * function.
  	 */
  	function mapDomain(string, fn) {
  		var parts = string.split('@');
  		var result = '';
  		if (parts.length > 1) {
  			// In email addresses, only the domain name should be punycoded. Leave
  			// the local part (i.e. everything up to `@`) intact.
  			result = parts[0] + '@';
  			string = parts[1];
  		}
  		// Avoid `split(regex)` for IE8 compatibility. See #17.
  		string = string.replace(regexSeparators, '\x2E');
  		var labels = string.split('.');
  		var encoded = map(labels, fn).join('.');
  		return result + encoded;
  	}

  	/**
  	 * Creates an array containing the numeric code points of each Unicode
  	 * character in the string. While JavaScript uses UCS-2 internally,
  	 * this function will convert a pair of surrogate halves (each of which
  	 * UCS-2 exposes as separate characters) into a single code point,
  	 * matching UTF-16.
  	 * @see `punycode.ucs2.encode`
  	 * @see <https://mathiasbynens.be/notes/javascript-encoding>
  	 * @memberOf punycode.ucs2
  	 * @name decode
  	 * @param {String} string The Unicode input string (UCS-2).
  	 * @returns {Array} The new array of code points.
  	 */
  	function ucs2decode(string) {
  		var output = [],
  		    counter = 0,
  		    length = string.length,
  		    value,
  		    extra;
  		while (counter < length) {
  			value = string.charCodeAt(counter++);
  			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
  				// high surrogate, and there is a next character
  				extra = string.charCodeAt(counter++);
  				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
  					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
  				} else {
  					// unmatched surrogate; only append this code unit, in case the next
  					// code unit is the high surrogate of a surrogate pair
  					output.push(value);
  					counter--;
  				}
  			} else {
  				output.push(value);
  			}
  		}
  		return output;
  	}

  	/**
  	 * Creates a string based on an array of numeric code points.
  	 * @see `punycode.ucs2.decode`
  	 * @memberOf punycode.ucs2
  	 * @name encode
  	 * @param {Array} codePoints The array of numeric code points.
  	 * @returns {String} The new Unicode string (UCS-2).
  	 */
  	function ucs2encode(array) {
  		return map(array, function(value) {
  			var output = '';
  			if (value > 0xFFFF) {
  				value -= 0x10000;
  				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
  				value = 0xDC00 | value & 0x3FF;
  			}
  			output += stringFromCharCode(value);
  			return output;
  		}).join('');
  	}

  	/**
  	 * Converts a basic code point into a digit/integer.
  	 * @see `digitToBasic()`
  	 * @private
  	 * @param {Number} codePoint The basic numeric code point value.
  	 * @returns {Number} The numeric value of a basic code point (for use in
  	 * representing integers) in the range `0` to `base - 1`, or `base` if
  	 * the code point does not represent a value.
  	 */
  	function basicToDigit(codePoint) {
  		if (codePoint - 48 < 10) {
  			return codePoint - 22;
  		}
  		if (codePoint - 65 < 26) {
  			return codePoint - 65;
  		}
  		if (codePoint - 97 < 26) {
  			return codePoint - 97;
  		}
  		return base;
  	}

  	/**
  	 * Converts a digit/integer into a basic code point.
  	 * @see `basicToDigit()`
  	 * @private
  	 * @param {Number} digit The numeric value of a basic code point.
  	 * @returns {Number} The basic code point whose value (when used for
  	 * representing integers) is `digit`, which needs to be in the range
  	 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
  	 * used; else, the lowercase form is used. The behavior is undefined
  	 * if `flag` is non-zero and `digit` has no uppercase form.
  	 */
  	function digitToBasic(digit, flag) {
  		//  0..25 map to ASCII a..z or A..Z
  		// 26..35 map to ASCII 0..9
  		return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
  	}

  	/**
  	 * Bias adaptation function as per section 3.4 of RFC 3492.
  	 * http://tools.ietf.org/html/rfc3492#section-3.4
  	 * @private
  	 */
  	function adapt(delta, numPoints, firstTime) {
  		var k = 0;
  		delta = firstTime ? floor(delta / damp) : delta >> 1;
  		delta += floor(delta / numPoints);
  		for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
  			delta = floor(delta / baseMinusTMin);
  		}
  		return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
  	}

  	/**
  	 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
  	 * symbols.
  	 * @memberOf punycode
  	 * @param {String} input The Punycode string of ASCII-only symbols.
  	 * @returns {String} The resulting string of Unicode symbols.
  	 */
  	function decode(input) {
  		// Don't use UCS-2
  		var output = [],
  		    inputLength = input.length,
  		    out,
  		    i = 0,
  		    n = initialN,
  		    bias = initialBias,
  		    basic,
  		    j,
  		    index,
  		    oldi,
  		    w,
  		    k,
  		    digit,
  		    t,
  		    /** Cached calculation results */
  		    baseMinusT;

  		// Handle the basic code points: let `basic` be the number of input code
  		// points before the last delimiter, or `0` if there is none, then copy
  		// the first basic code points to the output.

  		basic = input.lastIndexOf(delimiter);
  		if (basic < 0) {
  			basic = 0;
  		}

  		for (j = 0; j < basic; ++j) {
  			// if it's not a basic code point
  			if (input.charCodeAt(j) >= 0x80) {
  				error('not-basic');
  			}
  			output.push(input.charCodeAt(j));
  		}

  		// Main decoding loop: start just after the last delimiter if any basic code
  		// points were copied; start at the beginning otherwise.

  		for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

  			// `index` is the index of the next character to be consumed.
  			// Decode a generalized variable-length integer into `delta`,
  			// which gets added to `i`. The overflow checking is easier
  			// if we increase `i` as we go, then subtract off its starting
  			// value at the end to obtain `delta`.
  			for (oldi = i, w = 1, k = base; /* no condition */; k += base) {

  				if (index >= inputLength) {
  					error('invalid-input');
  				}

  				digit = basicToDigit(input.charCodeAt(index++));

  				if (digit >= base || digit > floor((maxInt - i) / w)) {
  					error('overflow');
  				}

  				i += digit * w;
  				t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

  				if (digit < t) {
  					break;
  				}

  				baseMinusT = base - t;
  				if (w > floor(maxInt / baseMinusT)) {
  					error('overflow');
  				}

  				w *= baseMinusT;

  			}

  			out = output.length + 1;
  			bias = adapt(i - oldi, out, oldi == 0);

  			// `i` was supposed to wrap around from `out` to `0`,
  			// incrementing `n` each time, so we'll fix that now:
  			if (floor(i / out) > maxInt - n) {
  				error('overflow');
  			}

  			n += floor(i / out);
  			i %= out;

  			// Insert `n` at position `i` of the output
  			output.splice(i++, 0, n);

  		}

  		return ucs2encode(output);
  	}

  	/**
  	 * Converts a string of Unicode symbols (e.g. a domain name label) to a
  	 * Punycode string of ASCII-only symbols.
  	 * @memberOf punycode
  	 * @param {String} input The string of Unicode symbols.
  	 * @returns {String} The resulting Punycode string of ASCII-only symbols.
  	 */
  	function encode(input) {
  		var n,
  		    delta,
  		    handledCPCount,
  		    basicLength,
  		    bias,
  		    j,
  		    m,
  		    q,
  		    k,
  		    t,
  		    currentValue,
  		    output = [],
  		    /** `inputLength` will hold the number of code points in `input`. */
  		    inputLength,
  		    /** Cached calculation results */
  		    handledCPCountPlusOne,
  		    baseMinusT,
  		    qMinusT;

  		// Convert the input in UCS-2 to Unicode
  		input = ucs2decode(input);

  		// Cache the length
  		inputLength = input.length;

  		// Initialize the state
  		n = initialN;
  		delta = 0;
  		bias = initialBias;

  		// Handle the basic code points
  		for (j = 0; j < inputLength; ++j) {
  			currentValue = input[j];
  			if (currentValue < 0x80) {
  				output.push(stringFromCharCode(currentValue));
  			}
  		}

  		handledCPCount = basicLength = output.length;

  		// `handledCPCount` is the number of code points that have been handled;
  		// `basicLength` is the number of basic code points.

  		// Finish the basic string - if it is not empty - with a delimiter
  		if (basicLength) {
  			output.push(delimiter);
  		}

  		// Main encoding loop:
  		while (handledCPCount < inputLength) {

  			// All non-basic code points < n have been handled already. Find the next
  			// larger one:
  			for (m = maxInt, j = 0; j < inputLength; ++j) {
  				currentValue = input[j];
  				if (currentValue >= n && currentValue < m) {
  					m = currentValue;
  				}
  			}

  			// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
  			// but guard against overflow
  			handledCPCountPlusOne = handledCPCount + 1;
  			if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
  				error('overflow');
  			}

  			delta += (m - n) * handledCPCountPlusOne;
  			n = m;

  			for (j = 0; j < inputLength; ++j) {
  				currentValue = input[j];

  				if (currentValue < n && ++delta > maxInt) {
  					error('overflow');
  				}

  				if (currentValue == n) {
  					// Represent delta as a generalized variable-length integer
  					for (q = delta, k = base; /* no condition */; k += base) {
  						t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
  						if (q < t) {
  							break;
  						}
  						qMinusT = q - t;
  						baseMinusT = base - t;
  						output.push(
  							stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
  						);
  						q = floor(qMinusT / baseMinusT);
  					}

  					output.push(stringFromCharCode(digitToBasic(q, 0)));
  					bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
  					delta = 0;
  					++handledCPCount;
  				}
  			}

  			++delta;
  			++n;

  		}
  		return output.join('');
  	}

  	/**
  	 * Converts a Punycode string representing a domain name or an email address
  	 * to Unicode. Only the Punycoded parts of the input will be converted, i.e.
  	 * it doesn't matter if you call it on a string that has already been
  	 * converted to Unicode.
  	 * @memberOf punycode
  	 * @param {String} input The Punycoded domain name or email address to
  	 * convert to Unicode.
  	 * @returns {String} The Unicode representation of the given Punycode
  	 * string.
  	 */
  	function toUnicode(input) {
  		return mapDomain(input, function(string) {
  			return regexPunycode.test(string)
  				? decode(string.slice(4).toLowerCase())
  				: string;
  		});
  	}

  	/**
  	 * Converts a Unicode string representing a domain name or an email address to
  	 * Punycode. Only the non-ASCII parts of the domain name will be converted,
  	 * i.e. it doesn't matter if you call it with a domain that's already in
  	 * ASCII.
  	 * @memberOf punycode
  	 * @param {String} input The domain name or email address to convert, as a
  	 * Unicode string.
  	 * @returns {String} The Punycode representation of the given domain name or
  	 * email address.
  	 */
  	function toASCII(input) {
  		return mapDomain(input, function(string) {
  			return regexNonASCII.test(string)
  				? 'xn--' + encode(string)
  				: string;
  		});
  	}

  	/*--------------------------------------------------------------------------*/

  	/** Define the public API */
  	punycode = {
  		/**
  		 * A string representing the current Punycode.js version number.
  		 * @memberOf punycode
  		 * @type String
  		 */
  		'version': '1.3.2',
  		/**
  		 * An object of methods to convert from JavaScript's internal character
  		 * representation (UCS-2) to Unicode code points, and back.
  		 * @see <https://mathiasbynens.be/notes/javascript-encoding>
  		 * @memberOf punycode
  		 * @type Object
  		 */
  		'ucs2': {
  			'decode': ucs2decode,
  			'encode': ucs2encode
  		},
  		'decode': decode,
  		'encode': encode,
  		'toASCII': toASCII,
  		'toUnicode': toUnicode
  	};

  	/** Expose `punycode` */
  	// Some AMD build optimizers, like r.js, check for specific condition patterns
  	// like the following:
  	if (freeExports && freeModule) {
  		if (module.exports == freeExports) { // in Node.js or RingoJS v0.8.0+
  			freeModule.exports = punycode;
  		} else { // in Narwhal or RingoJS v0.7.0-
  			for (key in punycode) {
  				punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
  			}
  		}
  	} else { // in Rhino or a web browser
  		root.punycode = punycode;
  	}

  }(commonjsGlobal));
  }(punycode$1, punycode$1.exports));

  var util$1 = {
    isString: function(arg) {
      return typeof(arg) === 'string';
    },
    isObject: function(arg) {
      return typeof(arg) === 'object' && arg !== null;
    },
    isNull: function(arg) {
      return arg === null;
    },
    isNullOrUndefined: function(arg) {
      return arg == null;
    }
  };

  var querystring$1 = {};

  // If obj.hasOwnProperty has been overridden, then calling
  // obj.hasOwnProperty(prop) will break.
  // See: https://github.com/joyent/node/issues/1707
  function hasOwnProperty(obj, prop) {
    return Object.prototype.hasOwnProperty.call(obj, prop);
  }

  var decode = function(qs, sep, eq, options) {
    sep = sep || '&';
    eq = eq || '=';
    var obj = {};

    if (typeof qs !== 'string' || qs.length === 0) {
      return obj;
    }

    var regexp = /\+/g;
    qs = qs.split(sep);

    var maxKeys = 1000;
    if (options && typeof options.maxKeys === 'number') {
      maxKeys = options.maxKeys;
    }

    var len = qs.length;
    // maxKeys <= 0 means that we should not limit keys count
    if (maxKeys > 0 && len > maxKeys) {
      len = maxKeys;
    }

    for (var i = 0; i < len; ++i) {
      var x = qs[i].replace(regexp, '%20'),
          idx = x.indexOf(eq),
          kstr, vstr, k, v;

      if (idx >= 0) {
        kstr = x.substr(0, idx);
        vstr = x.substr(idx + 1);
      } else {
        kstr = x;
        vstr = '';
      }

      k = decodeURIComponent(kstr);
      v = decodeURIComponent(vstr);

      if (!hasOwnProperty(obj, k)) {
        obj[k] = v;
      } else if (Array.isArray(obj[k])) {
        obj[k].push(v);
      } else {
        obj[k] = [obj[k], v];
      }
    }

    return obj;
  };

  var stringifyPrimitive = function(v) {
    switch (typeof v) {
      case 'string':
        return v;

      case 'boolean':
        return v ? 'true' : 'false';

      case 'number':
        return isFinite(v) ? v : '';

      default:
        return '';
    }
  };

  var encode = function(obj, sep, eq, name) {
    sep = sep || '&';
    eq = eq || '=';
    if (obj === null) {
      obj = undefined;
    }

    if (typeof obj === 'object') {
      return Object.keys(obj).map(function(k) {
        var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
        if (Array.isArray(obj[k])) {
          return obj[k].map(function(v) {
            return ks + encodeURIComponent(stringifyPrimitive(v));
          }).join(sep);
        } else {
          return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
        }
      }).join(sep);

    }

    if (!name) return '';
    return encodeURIComponent(stringifyPrimitive(name)) + eq +
           encodeURIComponent(stringifyPrimitive(obj));
  };

  querystring$1.decode = querystring$1.parse = decode;
  querystring$1.encode = querystring$1.stringify = encode;

  var punycode = punycode$1.exports;
  var util = util$1;

  var parse = urlParse;
  var resolve = urlResolve;
  var format = urlFormat;

  function Url() {
    this.protocol = null;
    this.slashes = null;
    this.auth = null;
    this.host = null;
    this.port = null;
    this.hostname = null;
    this.hash = null;
    this.search = null;
    this.query = null;
    this.pathname = null;
    this.path = null;
    this.href = null;
  }

  // Reference: RFC 3986, RFC 1808, RFC 2396

  // define these here so at least they only have to be
  // compiled once on the first module load.
  var protocolPattern = /^([a-z0-9.+-]+:)/i,
      portPattern = /:[0-9]*$/,

      // Special case for a simple path URL
      simplePathPattern = /^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/,

      // RFC 2396: characters reserved for delimiting URLs.
      // We actually just auto-escape these.
      delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t'],

      // RFC 2396: characters not allowed for various reasons.
      unwise = ['{', '}', '|', '\\', '^', '`'].concat(delims),

      // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
      autoEscape = ['\''].concat(unwise),
      // Characters that are never ever allowed in a hostname.
      // Note that any invalid chars are also handled, but these
      // are the ones that are *expected* to be seen, so we fast-path
      // them.
      nonHostChars = ['%', '/', '?', ';', '#'].concat(autoEscape),
      hostEndingChars = ['/', '?', '#'],
      hostnameMaxLen = 255,
      hostnamePartPattern = /^[+a-z0-9A-Z_-]{0,63}$/,
      hostnamePartStart = /^([+a-z0-9A-Z_-]{0,63})(.*)$/,
      // protocols that can allow "unsafe" and "unwise" chars.
      unsafeProtocol = {
        'javascript': true,
        'javascript:': true
      },
      // protocols that never have a hostname.
      hostlessProtocol = {
        'javascript': true,
        'javascript:': true
      },
      // protocols that always contain a // bit.
      slashedProtocol = {
        'http': true,
        'https': true,
        'ftp': true,
        'gopher': true,
        'file': true,
        'http:': true,
        'https:': true,
        'ftp:': true,
        'gopher:': true,
        'file:': true
      },
      querystring = querystring$1;

  function urlParse(url, parseQueryString, slashesDenoteHost) {
    if (url && util.isObject(url) && url instanceof Url) return url;

    var u = new Url;
    u.parse(url, parseQueryString, slashesDenoteHost);
    return u;
  }

  Url.prototype.parse = function(url, parseQueryString, slashesDenoteHost) {
    if (!util.isString(url)) {
      throw new TypeError("Parameter 'url' must be a string, not " + typeof url);
    }

    // Copy chrome, IE, opera backslash-handling behavior.
    // Back slashes before the query string get converted to forward slashes
    // See: https://code.google.com/p/chromium/issues/detail?id=25916
    var queryIndex = url.indexOf('?'),
        splitter =
            (queryIndex !== -1 && queryIndex < url.indexOf('#')) ? '?' : '#',
        uSplit = url.split(splitter),
        slashRegex = /\\/g;
    uSplit[0] = uSplit[0].replace(slashRegex, '/');
    url = uSplit.join(splitter);

    var rest = url;

    // trim before proceeding.
    // This is to support parse stuff like "  http://foo.com  \n"
    rest = rest.trim();

    if (!slashesDenoteHost && url.split('#').length === 1) {
      // Try fast path regexp
      var simplePath = simplePathPattern.exec(rest);
      if (simplePath) {
        this.path = rest;
        this.href = rest;
        this.pathname = simplePath[1];
        if (simplePath[2]) {
          this.search = simplePath[2];
          if (parseQueryString) {
            this.query = querystring.parse(this.search.substr(1));
          } else {
            this.query = this.search.substr(1);
          }
        } else if (parseQueryString) {
          this.search = '';
          this.query = {};
        }
        return this;
      }
    }

    var proto = protocolPattern.exec(rest);
    if (proto) {
      proto = proto[0];
      var lowerProto = proto.toLowerCase();
      this.protocol = lowerProto;
      rest = rest.substr(proto.length);
    }

    // figure out if it's got a host
    // user@server is *always* interpreted as a hostname, and url
    // resolution will treat //foo/bar as host=foo,path=bar because that's
    // how the browser resolves relative URLs.
    if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
      var slashes = rest.substr(0, 2) === '//';
      if (slashes && !(proto && hostlessProtocol[proto])) {
        rest = rest.substr(2);
        this.slashes = true;
      }
    }

    if (!hostlessProtocol[proto] &&
        (slashes || (proto && !slashedProtocol[proto]))) {

      // there's a hostname.
      // the first instance of /, ?, ;, or # ends the host.
      //
      // If there is an @ in the hostname, then non-host chars *are* allowed
      // to the left of the last @ sign, unless some host-ending character
      // comes *before* the @-sign.
      // URLs are obnoxious.
      //
      // ex:
      // http://a@b@c/ => user:a@b host:c
      // http://a@b?@c => user:a host:c path:/?@c

      // v0.12 TODO(isaacs): This is not quite how Chrome does things.
      // Review our test case against browsers more comprehensively.

      // find the first instance of any hostEndingChars
      var hostEnd = -1;
      for (var i = 0; i < hostEndingChars.length; i++) {
        var hec = rest.indexOf(hostEndingChars[i]);
        if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
          hostEnd = hec;
      }

      // at this point, either we have an explicit point where the
      // auth portion cannot go past, or the last @ char is the decider.
      var auth, atSign;
      if (hostEnd === -1) {
        // atSign can be anywhere.
        atSign = rest.lastIndexOf('@');
      } else {
        // atSign must be in auth portion.
        // http://a@b/c@d => host:b auth:a path:/c@d
        atSign = rest.lastIndexOf('@', hostEnd);
      }

      // Now we have a portion which is definitely the auth.
      // Pull that off.
      if (atSign !== -1) {
        auth = rest.slice(0, atSign);
        rest = rest.slice(atSign + 1);
        this.auth = decodeURIComponent(auth);
      }

      // the host is the remaining to the left of the first non-host char
      hostEnd = -1;
      for (var i = 0; i < nonHostChars.length; i++) {
        var hec = rest.indexOf(nonHostChars[i]);
        if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
          hostEnd = hec;
      }
      // if we still have not hit it, then the entire thing is a host.
      if (hostEnd === -1)
        hostEnd = rest.length;

      this.host = rest.slice(0, hostEnd);
      rest = rest.slice(hostEnd);

      // pull out port.
      this.parseHost();

      // we've indicated that there is a hostname,
      // so even if it's empty, it has to be present.
      this.hostname = this.hostname || '';

      // if hostname begins with [ and ends with ]
      // assume that it's an IPv6 address.
      var ipv6Hostname = this.hostname[0] === '[' &&
          this.hostname[this.hostname.length - 1] === ']';

      // validate a little.
      if (!ipv6Hostname) {
        var hostparts = this.hostname.split(/\./);
        for (var i = 0, l = hostparts.length; i < l; i++) {
          var part = hostparts[i];
          if (!part) continue;
          if (!part.match(hostnamePartPattern)) {
            var newpart = '';
            for (var j = 0, k = part.length; j < k; j++) {
              if (part.charCodeAt(j) > 127) {
                // we replace non-ASCII char with a temporary placeholder
                // we need this to make sure size of hostname is not
                // broken by replacing non-ASCII by nothing
                newpart += 'x';
              } else {
                newpart += part[j];
              }
            }
            // we test again with ASCII char only
            if (!newpart.match(hostnamePartPattern)) {
              var validParts = hostparts.slice(0, i);
              var notHost = hostparts.slice(i + 1);
              var bit = part.match(hostnamePartStart);
              if (bit) {
                validParts.push(bit[1]);
                notHost.unshift(bit[2]);
              }
              if (notHost.length) {
                rest = '/' + notHost.join('.') + rest;
              }
              this.hostname = validParts.join('.');
              break;
            }
          }
        }
      }

      if (this.hostname.length > hostnameMaxLen) {
        this.hostname = '';
      } else {
        // hostnames are always lower case.
        this.hostname = this.hostname.toLowerCase();
      }

      if (!ipv6Hostname) {
        // IDNA Support: Returns a punycoded representation of "domain".
        // It only converts parts of the domain name that
        // have non-ASCII characters, i.e. it doesn't matter if
        // you call it with a domain that already is ASCII-only.
        this.hostname = punycode.toASCII(this.hostname);
      }

      var p = this.port ? ':' + this.port : '';
      var h = this.hostname || '';
      this.host = h + p;
      this.href += this.host;

      // strip [ and ] from the hostname
      // the host field still retains them, though
      if (ipv6Hostname) {
        this.hostname = this.hostname.substr(1, this.hostname.length - 2);
        if (rest[0] !== '/') {
          rest = '/' + rest;
        }
      }
    }

    // now rest is set to the post-host stuff.
    // chop off any delim chars.
    if (!unsafeProtocol[lowerProto]) {

      // First, make 100% sure that any "autoEscape" chars get
      // escaped, even if encodeURIComponent doesn't think they
      // need to be.
      for (var i = 0, l = autoEscape.length; i < l; i++) {
        var ae = autoEscape[i];
        if (rest.indexOf(ae) === -1)
          continue;
        var esc = encodeURIComponent(ae);
        if (esc === ae) {
          esc = escape(ae);
        }
        rest = rest.split(ae).join(esc);
      }
    }


    // chop off from the tail first.
    var hash = rest.indexOf('#');
    if (hash !== -1) {
      // got a fragment string.
      this.hash = rest.substr(hash);
      rest = rest.slice(0, hash);
    }
    var qm = rest.indexOf('?');
    if (qm !== -1) {
      this.search = rest.substr(qm);
      this.query = rest.substr(qm + 1);
      if (parseQueryString) {
        this.query = querystring.parse(this.query);
      }
      rest = rest.slice(0, qm);
    } else if (parseQueryString) {
      // no query string, but parseQueryString still requested
      this.search = '';
      this.query = {};
    }
    if (rest) this.pathname = rest;
    if (slashedProtocol[lowerProto] &&
        this.hostname && !this.pathname) {
      this.pathname = '/';
    }

    //to support http.request
    if (this.pathname || this.search) {
      var p = this.pathname || '';
      var s = this.search || '';
      this.path = p + s;
    }

    // finally, reconstruct the href based on what has been validated.
    this.href = this.format();
    return this;
  };

  // format a parsed object into a url string
  function urlFormat(obj) {
    // ensure it's an object, and not a string url.
    // If it's an obj, this is a no-op.
    // this way, you can call url_format() on strings
    // to clean up potentially wonky urls.
    if (util.isString(obj)) obj = urlParse(obj);
    if (!(obj instanceof Url)) return Url.prototype.format.call(obj);
    return obj.format();
  }

  Url.prototype.format = function() {
    var auth = this.auth || '';
    if (auth) {
      auth = encodeURIComponent(auth);
      auth = auth.replace(/%3A/i, ':');
      auth += '@';
    }

    var protocol = this.protocol || '',
        pathname = this.pathname || '',
        hash = this.hash || '',
        host = false,
        query = '';

    if (this.host) {
      host = auth + this.host;
    } else if (this.hostname) {
      host = auth + (this.hostname.indexOf(':') === -1 ?
          this.hostname :
          '[' + this.hostname + ']');
      if (this.port) {
        host += ':' + this.port;
      }
    }

    if (this.query &&
        util.isObject(this.query) &&
        Object.keys(this.query).length) {
      query = querystring.stringify(this.query);
    }

    var search = this.search || (query && ('?' + query)) || '';

    if (protocol && protocol.substr(-1) !== ':') protocol += ':';

    // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
    // unless they had them to begin with.
    if (this.slashes ||
        (!protocol || slashedProtocol[protocol]) && host !== false) {
      host = '//' + (host || '');
      if (pathname && pathname.charAt(0) !== '/') pathname = '/' + pathname;
    } else if (!host) {
      host = '';
    }

    if (hash && hash.charAt(0) !== '#') hash = '#' + hash;
    if (search && search.charAt(0) !== '?') search = '?' + search;

    pathname = pathname.replace(/[?#]/g, function(match) {
      return encodeURIComponent(match);
    });
    search = search.replace('#', '%23');

    return protocol + host + pathname + search + hash;
  };

  function urlResolve(source, relative) {
    return urlParse(source, false, true).resolve(relative);
  }

  Url.prototype.resolve = function(relative) {
    return this.resolveObject(urlParse(relative, false, true)).format();
  };

  Url.prototype.resolveObject = function(relative) {
    if (util.isString(relative)) {
      var rel = new Url();
      rel.parse(relative, false, true);
      relative = rel;
    }

    var result = new Url();
    var tkeys = Object.keys(this);
    for (var tk = 0; tk < tkeys.length; tk++) {
      var tkey = tkeys[tk];
      result[tkey] = this[tkey];
    }

    // hash is always overridden, no matter what.
    // even href="" will remove it.
    result.hash = relative.hash;

    // if the relative url is empty, then there's nothing left to do here.
    if (relative.href === '') {
      result.href = result.format();
      return result;
    }

    // hrefs like //foo/bar always cut to the protocol.
    if (relative.slashes && !relative.protocol) {
      // take everything except the protocol from relative
      var rkeys = Object.keys(relative);
      for (var rk = 0; rk < rkeys.length; rk++) {
        var rkey = rkeys[rk];
        if (rkey !== 'protocol')
          result[rkey] = relative[rkey];
      }

      //urlParse appends trailing / to urls like http://www.example.com
      if (slashedProtocol[result.protocol] &&
          result.hostname && !result.pathname) {
        result.path = result.pathname = '/';
      }

      result.href = result.format();
      return result;
    }

    if (relative.protocol && relative.protocol !== result.protocol) {
      // if it's a known url protocol, then changing
      // the protocol does weird things
      // first, if it's not file:, then we MUST have a host,
      // and if there was a path
      // to begin with, then we MUST have a path.
      // if it is file:, then the host is dropped,
      // because that's known to be hostless.
      // anything else is assumed to be absolute.
      if (!slashedProtocol[relative.protocol]) {
        var keys = Object.keys(relative);
        for (var v = 0; v < keys.length; v++) {
          var k = keys[v];
          result[k] = relative[k];
        }
        result.href = result.format();
        return result;
      }

      result.protocol = relative.protocol;
      if (!relative.host && !hostlessProtocol[relative.protocol]) {
        var relPath = (relative.pathname || '').split('/');
        while (relPath.length && !(relative.host = relPath.shift()));
        if (!relative.host) relative.host = '';
        if (!relative.hostname) relative.hostname = '';
        if (relPath[0] !== '') relPath.unshift('');
        if (relPath.length < 2) relPath.unshift('');
        result.pathname = relPath.join('/');
      } else {
        result.pathname = relative.pathname;
      }
      result.search = relative.search;
      result.query = relative.query;
      result.host = relative.host || '';
      result.auth = relative.auth;
      result.hostname = relative.hostname || relative.host;
      result.port = relative.port;
      // to support http.request
      if (result.pathname || result.search) {
        var p = result.pathname || '';
        var s = result.search || '';
        result.path = p + s;
      }
      result.slashes = result.slashes || relative.slashes;
      result.href = result.format();
      return result;
    }

    var isSourceAbs = (result.pathname && result.pathname.charAt(0) === '/'),
        isRelAbs = (
            relative.host ||
            relative.pathname && relative.pathname.charAt(0) === '/'
        ),
        mustEndAbs = (isRelAbs || isSourceAbs ||
                      (result.host && relative.pathname)),
        removeAllDots = mustEndAbs,
        srcPath = result.pathname && result.pathname.split('/') || [],
        relPath = relative.pathname && relative.pathname.split('/') || [],
        psychotic = result.protocol && !slashedProtocol[result.protocol];

    // if the url is a non-slashed url, then relative
    // links like ../.. should be able
    // to crawl up to the hostname, as well.  This is strange.
    // result.protocol has already been set by now.
    // Later on, put the first path part into the host field.
    if (psychotic) {
      result.hostname = '';
      result.port = null;
      if (result.host) {
        if (srcPath[0] === '') srcPath[0] = result.host;
        else srcPath.unshift(result.host);
      }
      result.host = '';
      if (relative.protocol) {
        relative.hostname = null;
        relative.port = null;
        if (relative.host) {
          if (relPath[0] === '') relPath[0] = relative.host;
          else relPath.unshift(relative.host);
        }
        relative.host = null;
      }
      mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
    }

    if (isRelAbs) {
      // it's absolute.
      result.host = (relative.host || relative.host === '') ?
                    relative.host : result.host;
      result.hostname = (relative.hostname || relative.hostname === '') ?
                        relative.hostname : result.hostname;
      result.search = relative.search;
      result.query = relative.query;
      srcPath = relPath;
      // fall through to the dot-handling below.
    } else if (relPath.length) {
      // it's relative
      // throw away the existing file, and take the new path instead.
      if (!srcPath) srcPath = [];
      srcPath.pop();
      srcPath = srcPath.concat(relPath);
      result.search = relative.search;
      result.query = relative.query;
    } else if (!util.isNullOrUndefined(relative.search)) {
      // just pull out the search.
      // like href='?foo'.
      // Put this after the other two cases because it simplifies the booleans
      if (psychotic) {
        result.hostname = result.host = srcPath.shift();
        //occationaly the auth can get stuck only in host
        //this especially happens in cases like
        //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
        var authInHost = result.host && result.host.indexOf('@') > 0 ?
                         result.host.split('@') : false;
        if (authInHost) {
          result.auth = authInHost.shift();
          result.host = result.hostname = authInHost.shift();
        }
      }
      result.search = relative.search;
      result.query = relative.query;
      //to support http.request
      if (!util.isNull(result.pathname) || !util.isNull(result.search)) {
        result.path = (result.pathname ? result.pathname : '') +
                      (result.search ? result.search : '');
      }
      result.href = result.format();
      return result;
    }

    if (!srcPath.length) {
      // no path at all.  easy.
      // we've already handled the other stuff above.
      result.pathname = null;
      //to support http.request
      if (result.search) {
        result.path = '/' + result.search;
      } else {
        result.path = null;
      }
      result.href = result.format();
      return result;
    }

    // if a url ENDs in . or .., then it must get a trailing slash.
    // however, if it ends in anything else non-slashy,
    // then it must NOT get a trailing slash.
    var last = srcPath.slice(-1)[0];
    var hasTrailingSlash = (
        (result.host || relative.host || srcPath.length > 1) &&
        (last === '.' || last === '..') || last === '');

    // strip single dots, resolve double dots to parent dir
    // if the path tries to go above the root, `up` ends up > 0
    var up = 0;
    for (var i = srcPath.length; i >= 0; i--) {
      last = srcPath[i];
      if (last === '.') {
        srcPath.splice(i, 1);
      } else if (last === '..') {
        srcPath.splice(i, 1);
        up++;
      } else if (up) {
        srcPath.splice(i, 1);
        up--;
      }
    }

    // if the path is allowed to go above the root, restore leading ..s
    if (!mustEndAbs && !removeAllDots) {
      for (; up--; up) {
        srcPath.unshift('..');
      }
    }

    if (mustEndAbs && srcPath[0] !== '' &&
        (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
      srcPath.unshift('');
    }

    if (hasTrailingSlash && (srcPath.join('/').substr(-1) !== '/')) {
      srcPath.push('');
    }

    var isAbsolute = srcPath[0] === '' ||
        (srcPath[0] && srcPath[0].charAt(0) === '/');

    // put the host back
    if (psychotic) {
      result.hostname = result.host = isAbsolute ? '' :
                                      srcPath.length ? srcPath.shift() : '';
      //occationaly the auth can get stuck only in host
      //this especially happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      var authInHost = result.host && result.host.indexOf('@') > 0 ?
                       result.host.split('@') : false;
      if (authInHost) {
        result.auth = authInHost.shift();
        result.host = result.hostname = authInHost.shift();
      }
    }

    mustEndAbs = mustEndAbs || (result.host && srcPath.length);

    if (mustEndAbs && !isAbsolute) {
      srcPath.unshift('');
    }

    if (!srcPath.length) {
      result.pathname = null;
      result.path = null;
    } else {
      result.pathname = srcPath.join('/');
    }

    //to support request.http
    if (!util.isNull(result.pathname) || !util.isNull(result.search)) {
      result.path = (result.pathname ? result.pathname : '') +
                    (result.search ? result.search : '');
    }
    result.auth = relative.auth || result.auth;
    result.slashes = result.slashes || relative.slashes;
    result.href = result.format();
    return result;
  };

  Url.prototype.parseHost = function() {
    var host = this.host;
    var port = portPattern.exec(host);
    if (port) {
      port = port[0];
      if (port !== ':') {
        this.port = port.substr(1);
      }
      host = host.substr(0, host.length - port.length);
    }
    if (host) this.hostname = host;
  };

  /*!
   * @pixi/constants - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/constants is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  var E$6,_$a,N$7,T$8,R$5,I$7,A$6,L$5,O$7,U$5,S$5,P$7,D$4,G$1,C$7,M$3,B$3,H$3,F$4,n$a;!function(E){E[E.WEBGL_LEGACY=0]="WEBGL_LEGACY",E[E.WEBGL=1]="WEBGL",E[E.WEBGL2=2]="WEBGL2";}(E$6||(E$6={})),function(E){E[E.UNKNOWN=0]="UNKNOWN",E[E.WEBGL=1]="WEBGL",E[E.CANVAS=2]="CANVAS";}(_$a||(_$a={})),function(E){E[E.COLOR=16384]="COLOR",E[E.DEPTH=256]="DEPTH",E[E.STENCIL=1024]="STENCIL";}(N$7||(N$7={})),function(E){E[E.NORMAL=0]="NORMAL",E[E.ADD=1]="ADD",E[E.MULTIPLY=2]="MULTIPLY",E[E.SCREEN=3]="SCREEN",E[E.OVERLAY=4]="OVERLAY",E[E.DARKEN=5]="DARKEN",E[E.LIGHTEN=6]="LIGHTEN",E[E.COLOR_DODGE=7]="COLOR_DODGE",E[E.COLOR_BURN=8]="COLOR_BURN",E[E.HARD_LIGHT=9]="HARD_LIGHT",E[E.SOFT_LIGHT=10]="SOFT_LIGHT",E[E.DIFFERENCE=11]="DIFFERENCE",E[E.EXCLUSION=12]="EXCLUSION",E[E.HUE=13]="HUE",E[E.SATURATION=14]="SATURATION",E[E.COLOR=15]="COLOR",E[E.LUMINOSITY=16]="LUMINOSITY",E[E.NORMAL_NPM=17]="NORMAL_NPM",E[E.ADD_NPM=18]="ADD_NPM",E[E.SCREEN_NPM=19]="SCREEN_NPM",E[E.NONE=20]="NONE",E[E.SRC_OVER=0]="SRC_OVER",E[E.SRC_IN=21]="SRC_IN",E[E.SRC_OUT=22]="SRC_OUT",E[E.SRC_ATOP=23]="SRC_ATOP",E[E.DST_OVER=24]="DST_OVER",E[E.DST_IN=25]="DST_IN",E[E.DST_OUT=26]="DST_OUT",E[E.DST_ATOP=27]="DST_ATOP",E[E.ERASE=26]="ERASE",E[E.SUBTRACT=28]="SUBTRACT",E[E.XOR=29]="XOR";}(T$8||(T$8={})),function(E){E[E.POINTS=0]="POINTS",E[E.LINES=1]="LINES",E[E.LINE_LOOP=2]="LINE_LOOP",E[E.LINE_STRIP=3]="LINE_STRIP",E[E.TRIANGLES=4]="TRIANGLES",E[E.TRIANGLE_STRIP=5]="TRIANGLE_STRIP",E[E.TRIANGLE_FAN=6]="TRIANGLE_FAN";}(R$5||(R$5={})),function(E){E[E.RGBA=6408]="RGBA",E[E.RGB=6407]="RGB",E[E.RG=33319]="RG",E[E.RED=6403]="RED",E[E.RGBA_INTEGER=36249]="RGBA_INTEGER",E[E.RGB_INTEGER=36248]="RGB_INTEGER",E[E.RG_INTEGER=33320]="RG_INTEGER",E[E.RED_INTEGER=36244]="RED_INTEGER",E[E.ALPHA=6406]="ALPHA",E[E.LUMINANCE=6409]="LUMINANCE",E[E.LUMINANCE_ALPHA=6410]="LUMINANCE_ALPHA",E[E.DEPTH_COMPONENT=6402]="DEPTH_COMPONENT",E[E.DEPTH_STENCIL=34041]="DEPTH_STENCIL";}(I$7||(I$7={})),function(E){E[E.TEXTURE_2D=3553]="TEXTURE_2D",E[E.TEXTURE_CUBE_MAP=34067]="TEXTURE_CUBE_MAP",E[E.TEXTURE_2D_ARRAY=35866]="TEXTURE_2D_ARRAY",E[E.TEXTURE_CUBE_MAP_POSITIVE_X=34069]="TEXTURE_CUBE_MAP_POSITIVE_X",E[E.TEXTURE_CUBE_MAP_NEGATIVE_X=34070]="TEXTURE_CUBE_MAP_NEGATIVE_X",E[E.TEXTURE_CUBE_MAP_POSITIVE_Y=34071]="TEXTURE_CUBE_MAP_POSITIVE_Y",E[E.TEXTURE_CUBE_MAP_NEGATIVE_Y=34072]="TEXTURE_CUBE_MAP_NEGATIVE_Y",E[E.TEXTURE_CUBE_MAP_POSITIVE_Z=34073]="TEXTURE_CUBE_MAP_POSITIVE_Z",E[E.TEXTURE_CUBE_MAP_NEGATIVE_Z=34074]="TEXTURE_CUBE_MAP_NEGATIVE_Z";}(A$6||(A$6={})),function(E){E[E.UNSIGNED_BYTE=5121]="UNSIGNED_BYTE",E[E.UNSIGNED_SHORT=5123]="UNSIGNED_SHORT",E[E.UNSIGNED_SHORT_5_6_5=33635]="UNSIGNED_SHORT_5_6_5",E[E.UNSIGNED_SHORT_4_4_4_4=32819]="UNSIGNED_SHORT_4_4_4_4",E[E.UNSIGNED_SHORT_5_5_5_1=32820]="UNSIGNED_SHORT_5_5_5_1",E[E.UNSIGNED_INT=5125]="UNSIGNED_INT",E[E.UNSIGNED_INT_10F_11F_11F_REV=35899]="UNSIGNED_INT_10F_11F_11F_REV",E[E.UNSIGNED_INT_2_10_10_10_REV=33640]="UNSIGNED_INT_2_10_10_10_REV",E[E.UNSIGNED_INT_24_8=34042]="UNSIGNED_INT_24_8",E[E.UNSIGNED_INT_5_9_9_9_REV=35902]="UNSIGNED_INT_5_9_9_9_REV",E[E.BYTE=5120]="BYTE",E[E.SHORT=5122]="SHORT",E[E.INT=5124]="INT",E[E.FLOAT=5126]="FLOAT",E[E.FLOAT_32_UNSIGNED_INT_24_8_REV=36269]="FLOAT_32_UNSIGNED_INT_24_8_REV",E[E.HALF_FLOAT=36193]="HALF_FLOAT";}(L$5||(L$5={})),function(E){E[E.FLOAT=0]="FLOAT",E[E.INT=1]="INT",E[E.UINT=2]="UINT";}(O$7||(O$7={})),function(E){E[E.NEAREST=0]="NEAREST",E[E.LINEAR=1]="LINEAR";}(U$5||(U$5={})),function(E){E[E.CLAMP=33071]="CLAMP",E[E.REPEAT=10497]="REPEAT",E[E.MIRRORED_REPEAT=33648]="MIRRORED_REPEAT";}(S$5||(S$5={})),function(E){E[E.OFF=0]="OFF",E[E.POW2=1]="POW2",E[E.ON=2]="ON",E[E.ON_MANUAL=3]="ON_MANUAL";}(P$7||(P$7={})),function(E){E[E.NPM=0]="NPM",E[E.UNPACK=1]="UNPACK",E[E.PMA=2]="PMA",E[E.NO_PREMULTIPLIED_ALPHA=0]="NO_PREMULTIPLIED_ALPHA",E[E.PREMULTIPLY_ON_UPLOAD=1]="PREMULTIPLY_ON_UPLOAD",E[E.PREMULTIPLY_ALPHA=2]="PREMULTIPLY_ALPHA",E[E.PREMULTIPLIED_ALPHA=2]="PREMULTIPLIED_ALPHA";}(D$4||(D$4={})),function(E){E[E.NO=0]="NO",E[E.YES=1]="YES",E[E.AUTO=2]="AUTO",E[E.BLEND=0]="BLEND",E[E.CLEAR=1]="CLEAR",E[E.BLIT=2]="BLIT";}(G$1||(G$1={})),function(E){E[E.AUTO=0]="AUTO",E[E.MANUAL=1]="MANUAL";}(C$7||(C$7={})),function(E){E.LOW="lowp",E.MEDIUM="mediump",E.HIGH="highp";}(M$3||(M$3={})),function(E){E[E.NONE=0]="NONE",E[E.SCISSOR=1]="SCISSOR",E[E.STENCIL=2]="STENCIL",E[E.SPRITE=3]="SPRITE",E[E.COLOR=4]="COLOR";}(B$3||(B$3={})),function(E){E[E.RED=1]="RED",E[E.GREEN=2]="GREEN",E[E.BLUE=4]="BLUE",E[E.ALPHA=8]="ALPHA";}(H$3||(H$3={})),function(E){E[E.NONE=0]="NONE",E[E.LOW=2]="LOW",E[E.MEDIUM=4]="MEDIUM",E[E.HIGH=8]="HIGH";}(F$4||(F$4={})),function(E){E[E.ELEMENT_ARRAY_BUFFER=34963]="ELEMENT_ARRAY_BUFFER",E[E.ARRAY_BUFFER=34962]="ARRAY_BUFFER",E[E.UNIFORM_BUFFER=35345]="UNIFORM_BUFFER";}(n$a||(n$a={}));

  /*!
   * @pixi/utils - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/utils is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  var o$a={parse:parse,format:format,resolve:resolve};V$2.RETINA_PREFIX=/@([0-9\.]+)x/,V$2.FAIL_IF_MAJOR_PERFORMANCE_CAVEAT=!1;var f$8,i$6=!1;function c$b(r){var t;if(!i$6){if(V$2.ADAPTER.getNavigator().userAgent.toLowerCase().indexOf("chrome")>-1){var n=["\n %c %c %c PixiJS 6.5.1 - ✰ "+r+" ✰  %c  %c  http://www.pixijs.com/  %c %c ♥%c♥%c♥ \n\n","background: #ff66a5; padding:5px 0;","background: #ff66a5; padding:5px 0;","color: #ff66a5; background: #030307; padding:5px 0;","background: #ff66a5; padding:5px 0;","background: #ffc3dc; padding:5px 0;","background: #ff66a5; padding:5px 0;","color: #ff2424; background: #fff; padding:5px 0;","color: #ff2424; background: #fff; padding:5px 0;","color: #ff2424; background: #fff; padding:5px 0;"];(t=globalThis.console).log.apply(t,n);}else globalThis.console&&globalThis.console.log("PixiJS 6.5.1 - "+r+" - http://www.pixijs.com/");i$6=!0;}}function d$a(){return void 0===f$8&&(f$8=function(){var r={stencil:!0,failIfMajorPerformanceCaveat:V$2.FAIL_IF_MAJOR_PERFORMANCE_CAVEAT};try{if(!V$2.ADAPTER.getWebGLRenderingContext())return !1;var t=V$2.ADAPTER.createCanvas(),n=t.getContext("webgl",r)||t.getContext("experimental-webgl",r),a=!(!n||!n.getContextAttributes().stencil);if(n){var o=n.getExtension("WEBGL_lose_context");o&&o.loseContext();}return n=null,a}catch(e){return !1}}()),f$8}var u$a={aliceblue:"#f0f8ff",antiquewhite:"#faebd7",aqua:"#00ffff",aquamarine:"#7fffd4",azure:"#f0ffff",beige:"#f5f5dc",bisque:"#ffe4c4",black:"#000000",blanchedalmond:"#ffebcd",blue:"#0000ff",blueviolet:"#8a2be2",brown:"#a52a2a",burlywood:"#deb887",cadetblue:"#5f9ea0",chartreuse:"#7fff00",chocolate:"#d2691e",coral:"#ff7f50",cornflowerblue:"#6495ed",cornsilk:"#fff8dc",crimson:"#dc143c",cyan:"#00ffff",darkblue:"#00008b",darkcyan:"#008b8b",darkgoldenrod:"#b8860b",darkgray:"#a9a9a9",darkgreen:"#006400",darkgrey:"#a9a9a9",darkkhaki:"#bdb76b",darkmagenta:"#8b008b",darkolivegreen:"#556b2f",darkorange:"#ff8c00",darkorchid:"#9932cc",darkred:"#8b0000",darksalmon:"#e9967a",darkseagreen:"#8fbc8f",darkslateblue:"#483d8b",darkslategray:"#2f4f4f",darkslategrey:"#2f4f4f",darkturquoise:"#00ced1",darkviolet:"#9400d3",deeppink:"#ff1493",deepskyblue:"#00bfff",dimgray:"#696969",dimgrey:"#696969",dodgerblue:"#1e90ff",firebrick:"#b22222",floralwhite:"#fffaf0",forestgreen:"#228b22",fuchsia:"#ff00ff",gainsboro:"#dcdcdc",ghostwhite:"#f8f8ff",goldenrod:"#daa520",gold:"#ffd700",gray:"#808080",green:"#008000",greenyellow:"#adff2f",grey:"#808080",honeydew:"#f0fff0",hotpink:"#ff69b4",indianred:"#cd5c5c",indigo:"#4b0082",ivory:"#fffff0",khaki:"#f0e68c",lavenderblush:"#fff0f5",lavender:"#e6e6fa",lawngreen:"#7cfc00",lemonchiffon:"#fffacd",lightblue:"#add8e6",lightcoral:"#f08080",lightcyan:"#e0ffff",lightgoldenrodyellow:"#fafad2",lightgray:"#d3d3d3",lightgreen:"#90ee90",lightgrey:"#d3d3d3",lightpink:"#ffb6c1",lightsalmon:"#ffa07a",lightseagreen:"#20b2aa",lightskyblue:"#87cefa",lightslategray:"#778899",lightslategrey:"#778899",lightsteelblue:"#b0c4de",lightyellow:"#ffffe0",lime:"#00ff00",limegreen:"#32cd32",linen:"#faf0e6",magenta:"#ff00ff",maroon:"#800000",mediumaquamarine:"#66cdaa",mediumblue:"#0000cd",mediumorchid:"#ba55d3",mediumpurple:"#9370db",mediumseagreen:"#3cb371",mediumslateblue:"#7b68ee",mediumspringgreen:"#00fa9a",mediumturquoise:"#48d1cc",mediumvioletred:"#c71585",midnightblue:"#191970",mintcream:"#f5fffa",mistyrose:"#ffe4e1",moccasin:"#ffe4b5",navajowhite:"#ffdead",navy:"#000080",oldlace:"#fdf5e6",olive:"#808000",olivedrab:"#6b8e23",orange:"#ffa500",orangered:"#ff4500",orchid:"#da70d6",palegoldenrod:"#eee8aa",palegreen:"#98fb98",paleturquoise:"#afeeee",palevioletred:"#db7093",papayawhip:"#ffefd5",peachpuff:"#ffdab9",peru:"#cd853f",pink:"#ffc0cb",plum:"#dda0dd",powderblue:"#b0e0e6",purple:"#800080",rebeccapurple:"#663399",red:"#ff0000",rosybrown:"#bc8f8f",royalblue:"#4169e1",saddlebrown:"#8b4513",salmon:"#fa8072",sandybrown:"#f4a460",seagreen:"#2e8b57",seashell:"#fff5ee",sienna:"#a0522d",silver:"#c0c0c0",skyblue:"#87ceeb",slateblue:"#6a5acd",slategray:"#708090",slategrey:"#708090",snow:"#fffafa",springgreen:"#00ff7f",steelblue:"#4682b4",tan:"#d2b48c",teal:"#008080",thistle:"#d8bfd8",tomato:"#ff6347",turquoise:"#40e0d0",violet:"#ee82ee",wheat:"#f5deb3",white:"#ffffff",whitesmoke:"#f5f5f5",yellow:"#ffff00",yellowgreen:"#9acd32"};function s$7(e,r){return void 0===r&&(r=[]),r[0]=(e>>16&255)/255,r[1]=(e>>8&255)/255,r[2]=(255&e)/255,r}function g$8(e){var r=e.toString(16);return "#"+(r="000000".substring(0,6-r.length)+r)}function h$7(e){return "string"==typeof e&&"#"===(e=u$a[e.toLowerCase()]||e)[0]&&(e=e.slice(1)),parseInt(e,16)}var p$8=function(){for(var e=[],r=[],t=0;t<32;t++)e[t]=t,r[t]=t;e[T$8.NORMAL_NPM]=T$8.NORMAL,e[T$8.ADD_NPM]=T$8.ADD,e[T$8.SCREEN_NPM]=T$8.SCREEN,r[T$8.NORMAL]=T$8.NORMAL_NPM,r[T$8.ADD]=T$8.ADD_NPM,r[T$8.SCREEN]=T$8.SCREEN_NPM;var n=[];return n.push(r),n.push(e),n}();function v$8(e,r){return p$8[r?1:0][e]}function m$6(e,r,t,n){return t=t||new Float32Array(4),n||void 0===n?(t[0]=e[0]*r,t[1]=e[1]*r,t[2]=e[2]*r):(t[0]=e[0],t[1]=e[1],t[2]=e[2]),t[3]=r,t}function y$9(e,r){if(1===r)return (255*r<<24)+e;if(0===r)return 0;var t=e>>16&255,n=e>>8&255,a=255&e;return (255*r<<24)+((t=t*r+.5|0)<<16)+((n=n*r+.5|0)<<8)+(a=a*r+.5|0)}function w$3(e,r,t,n){return (t=t||new Float32Array(4))[0]=(e>>16&255)/255,t[1]=(e>>8&255)/255,t[2]=(255&e)/255,(n||void 0===n)&&(t[0]*=r,t[1]*=r,t[2]*=r),t[3]=r,t}function A$5(e,r){void 0===r&&(r=null);var t=6*e;if((r=r||new Uint16Array(t)).length!==t)throw new Error("Out buffer length is incorrect, got "+r.length+" and expected "+t);for(var n=0,a=0;n<t;n+=6,a+=4)r[n+0]=a+0,r[n+1]=a+1,r[n+2]=a+2,r[n+3]=a+0,r[n+4]=a+2,r[n+5]=a+3;return r}function k$4(e){if(4===e.BYTES_PER_ELEMENT)return e instanceof Float32Array?"Float32Array":e instanceof Uint32Array?"Uint32Array":"Int32Array";if(2===e.BYTES_PER_ELEMENT){if(e instanceof Uint16Array)return "Uint16Array"}else if(1===e.BYTES_PER_ELEMENT&&e instanceof Uint8Array)return "Uint8Array";return null}function R$4(e){return e+=0===e?1:0,--e,e|=e>>>1,e|=e>>>2,e|=e>>>4,e|=e>>>8,(e|=e>>>16)+1}function C$6(e){return !(e&e-1||!e)}function P$6(e){var r=(e>65535?1:0)<<4,t=((e>>>=r)>255?1:0)<<3;return r|=t,r|=t=((e>>>=t)>15?1:0)<<2,(r|=t=((e>>>=t)>3?1:0)<<1)|(e>>>=t)>>1}function _$9(e,r,t){var n,a=e.length;if(!(r>=a||0===t)){var o=a-(t=r+t>a?a-r:t);for(n=r;n<o;++n)e[n]=e[n+t];e.length=o;}}function M$2(e){return 0===e?0:e<0?-1:1}var N$6=0;function T$7(){return ++N$6}var O$6={},F$3=Object.create(null),I$6=Object.create(null);var j$2=function(){function r(r,t,n){this.canvas=V$2.ADAPTER.createCanvas(),this.context=this.canvas.getContext("2d"),this.resolution=n||V$2.RESOLUTION,this.resize(r,t);}return r.prototype.clear=function(){this.context.setTransform(1,0,0,1,0,0),this.context.clearRect(0,0,this.canvas.width,this.canvas.height);},r.prototype.resize=function(e,r){this.canvas.width=Math.round(e*this.resolution),this.canvas.height=Math.round(r*this.resolution);},r.prototype.destroy=function(){this.context=null,this.canvas=null;},Object.defineProperty(r.prototype,"width",{get:function(){return this.canvas.width},set:function(e){this.canvas.width=Math.round(e);},enumerable:!1,configurable:!0}),Object.defineProperty(r.prototype,"height",{get:function(){return this.canvas.height},set:function(e){this.canvas.height=Math.round(e);},enumerable:!1,configurable:!0}),r}();function q$3(e){var r,t,n,a=e.width,o=e.height,f=e.getContext("2d"),i=f.getImageData(0,0,a,o).data,l=i.length,c={top:null,left:null,right:null,bottom:null},d=null;for(r=0;r<l;r+=4)0!==i[r+3]&&(t=r/4%a,n=~~(r/4/a),null===c.top&&(c.top=n),(null===c.left||t<c.left)&&(c.left=t),(null===c.right||c.right<t)&&(c.right=t+1),(null===c.bottom||c.bottom<n)&&(c.bottom=n));return null!==c.top&&(a=c.right-c.left,o=c.bottom-c.top+1,d=f.getImageData(c.left,c.top,a,o)),{height:o,width:a,data:d}}var J$3;function z$3(e,r){if(void 0===r&&(r=globalThis.location),0===e.indexOf("data:"))return "";r=r||globalThis.location,J$3||(J$3=document.createElement("a")),J$3.href=e;var t=o$a.parse(J$3.href),n=!t.port&&""===r.port||t.port===r.port;return t.hostname===r.hostname&&n&&t.protocol===r.protocol?"":"anonymous"}function Y$3(r,t){var n=V$2.RETINA_PREFIX.exec(r);return n?parseFloat(n[1]):void 0!==t?t:1}

  /*!
   * @pixi/math - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/math is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  var t$3,i$5=2*Math.PI,h$6=180/Math.PI,s$6=Math.PI/180;!function(t){t[t.POLY=0]="POLY",t[t.RECT=1]="RECT",t[t.CIRC=2]="CIRC",t[t.ELIP=3]="ELIP",t[t.RREC=4]="RREC";}(t$3||(t$3={}));var o$9=function(){function t(t,i){void 0===t&&(t=0),void 0===i&&(i=0),this.x=0,this.y=0,this.x=t,this.y=i;}return t.prototype.clone=function(){return new t(this.x,this.y)},t.prototype.copyFrom=function(t){return this.set(t.x,t.y),this},t.prototype.copyTo=function(t){return t.set(this.x,this.y),t},t.prototype.equals=function(t){return t.x===this.x&&t.y===this.y},t.prototype.set=function(t,i){return void 0===t&&(t=0),void 0===i&&(i=t),this.x=t,this.y=i,this},t}(),n$9=[new o$9,new o$9,new o$9,new o$9],r$4=function(){function i(i,h,s,o){void 0===i&&(i=0),void 0===h&&(h=0),void 0===s&&(s=0),void 0===o&&(o=0),this.x=Number(i),this.y=Number(h),this.width=Number(s),this.height=Number(o),this.type=t$3.RECT;}return Object.defineProperty(i.prototype,"left",{get:function(){return this.x},enumerable:!1,configurable:!0}),Object.defineProperty(i.prototype,"right",{get:function(){return this.x+this.width},enumerable:!1,configurable:!0}),Object.defineProperty(i.prototype,"top",{get:function(){return this.y},enumerable:!1,configurable:!0}),Object.defineProperty(i.prototype,"bottom",{get:function(){return this.y+this.height},enumerable:!1,configurable:!0}),Object.defineProperty(i,"EMPTY",{get:function(){return new i(0,0,0,0)},enumerable:!1,configurable:!0}),i.prototype.clone=function(){return new i(this.x,this.y,this.width,this.height)},i.prototype.copyFrom=function(t){return this.x=t.x,this.y=t.y,this.width=t.width,this.height=t.height,this},i.prototype.copyTo=function(t){return t.x=this.x,t.y=this.y,t.width=this.width,t.height=this.height,t},i.prototype.contains=function(t,i){return !(this.width<=0||this.height<=0)&&(t>=this.x&&t<this.x+this.width&&i>=this.y&&i<this.y+this.height)},i.prototype.intersects=function(t,i){if(!i){var h=this.x<t.x?t.x:this.x;if((this.right>t.right?t.right:this.right)<=h)return !1;var s=this.y<t.y?t.y:this.y;return (this.bottom>t.bottom?t.bottom:this.bottom)>s}var o=this.left,r=this.right,e=this.top,a=this.bottom;if(r<=o||a<=e)return !1;var c=n$9[0].set(t.left,t.top),y=n$9[1].set(t.left,t.bottom),u=n$9[2].set(t.right,t.top),p=n$9[3].set(t.right,t.bottom);if(u.x<=c.x||y.y<=c.y)return !1;var x=Math.sign(i.a*i.d-i.b*i.c);if(0===x)return !1;if(i.apply(c,c),i.apply(y,y),i.apply(u,u),i.apply(p,p),Math.max(c.x,y.x,u.x,p.x)<=o||Math.min(c.x,y.x,u.x,p.x)>=r||Math.max(c.y,y.y,u.y,p.y)<=e||Math.min(c.y,y.y,u.y,p.y)>=a)return !1;var d=x*(y.y-c.y),f=x*(c.x-y.x),l=d*o+f*e,b=d*r+f*e,v=d*o+f*a,w=d*r+f*a;if(Math.max(l,b,v,w)<=d*c.x+f*c.y||Math.min(l,b,v,w)>=d*p.x+f*p.y)return !1;var _=x*(c.y-u.y),g=x*(u.x-c.x),m=_*o+g*e,M=_*r+g*e,I=_*o+g*a,D=_*r+g*a;return !(Math.max(m,M,I,D)<=_*c.x+g*c.y||Math.min(m,M,I,D)>=_*p.x+g*p.y)},i.prototype.pad=function(t,i){return void 0===t&&(t=0),void 0===i&&(i=t),this.x-=t,this.y-=i,this.width+=2*t,this.height+=2*i,this},i.prototype.fit=function(t){var i=Math.max(this.x,t.x),h=Math.min(this.x+this.width,t.x+t.width),s=Math.max(this.y,t.y),o=Math.min(this.y+this.height,t.y+t.height);return this.x=i,this.width=Math.max(h-i,0),this.y=s,this.height=Math.max(o-s,0),this},i.prototype.ceil=function(t,i){void 0===t&&(t=1),void 0===i&&(i=.001);var h=Math.ceil((this.x+this.width-i)*t)/t,s=Math.ceil((this.y+this.height-i)*t)/t;return this.x=Math.floor((this.x+i)*t)/t,this.y=Math.floor((this.y+i)*t)/t,this.width=h-this.x,this.height=s-this.y,this},i.prototype.enlarge=function(t){var i=Math.min(this.x,t.x),h=Math.max(this.x+this.width,t.x+t.width),s=Math.min(this.y,t.y),o=Math.max(this.y+this.height,t.y+t.height);return this.x=i,this.width=h-i,this.y=s,this.height=o-s,this},i}(),e$3=function(){function i(i,h,s){void 0===i&&(i=0),void 0===h&&(h=0),void 0===s&&(s=0),this.x=i,this.y=h,this.radius=s,this.type=t$3.CIRC;}return i.prototype.clone=function(){return new i(this.x,this.y,this.radius)},i.prototype.contains=function(t,i){if(this.radius<=0)return !1;var h=this.radius*this.radius,s=this.x-t,o=this.y-i;return (s*=s)+(o*=o)<=h},i.prototype.getBounds=function(){return new r$4(this.x-this.radius,this.y-this.radius,2*this.radius,2*this.radius)},i}(),a$7=function(){function i(i,h,s,o){void 0===i&&(i=0),void 0===h&&(h=0),void 0===s&&(s=0),void 0===o&&(o=0),this.x=i,this.y=h,this.width=s,this.height=o,this.type=t$3.ELIP;}return i.prototype.clone=function(){return new i(this.x,this.y,this.width,this.height)},i.prototype.contains=function(t,i){if(this.width<=0||this.height<=0)return !1;var h=(t-this.x)/this.width,s=(i-this.y)/this.height;return (h*=h)+(s*=s)<=1},i.prototype.getBounds=function(){return new r$4(this.x-this.width,this.y-this.height,this.width,this.height)},i}(),c$a=function(){function i(){for(var i=arguments,h=[],s=0;s<arguments.length;s++)h[s]=i[s];var o=Array.isArray(h[0])?h[0]:h;if("number"!=typeof o[0]){for(var n=[],r=0,e=o.length;r<e;r++)n.push(o[r].x,o[r].y);o=n;}this.points=o,this.type=t$3.POLY,this.closeStroke=!0;}return i.prototype.clone=function(){var t=new i(this.points.slice());return t.closeStroke=this.closeStroke,t},i.prototype.contains=function(t,i){for(var h=!1,s=this.points.length/2,o=0,n=s-1;o<s;n=o++){var r=this.points[2*o],e=this.points[2*o+1],a=this.points[2*n],c=this.points[2*n+1];e>i!=c>i&&t<(i-e)/(c-e)*(a-r)+r&&(h=!h);}return h},i}(),y$8=function(){function i(i,h,s,o,n){void 0===i&&(i=0),void 0===h&&(h=0),void 0===s&&(s=0),void 0===o&&(o=0),void 0===n&&(n=20),this.x=i,this.y=h,this.width=s,this.height=o,this.radius=n,this.type=t$3.RREC;}return i.prototype.clone=function(){return new i(this.x,this.y,this.width,this.height,this.radius)},i.prototype.contains=function(t,i){if(this.width<=0||this.height<=0)return !1;if(t>=this.x&&t<=this.x+this.width&&i>=this.y&&i<=this.y+this.height){var h=Math.max(0,Math.min(this.radius,Math.min(this.width,this.height)/2));if(i>=this.y+h&&i<=this.y+this.height-h||t>=this.x+h&&t<=this.x+this.width-h)return !0;var s=t-(this.x+h),o=i-(this.y+h),n=h*h;if(s*s+o*o<=n)return !0;if((s=t-(this.x+this.width-h))*s+o*o<=n)return !0;if(s*s+(o=i-(this.y+this.height-h))*o<=n)return !0;if((s=t-(this.x+h))*s+o*o<=n)return !0}return !1},i}(),u$9=function(){function t(t,i,h,s){void 0===h&&(h=0),void 0===s&&(s=0),this._x=h,this._y=s,this.cb=t,this.scope=i;}return t.prototype.clone=function(i,h){return void 0===i&&(i=this.cb),void 0===h&&(h=this.scope),new t(i,h,this._x,this._y)},t.prototype.set=function(t,i){return void 0===t&&(t=0),void 0===i&&(i=t),this._x===t&&this._y===i||(this._x=t,this._y=i,this.cb.call(this.scope)),this},t.prototype.copyFrom=function(t){return this._x===t.x&&this._y===t.y||(this._x=t.x,this._y=t.y,this.cb.call(this.scope)),this},t.prototype.copyTo=function(t){return t.set(this._x,this._y),t},t.prototype.equals=function(t){return t.x===this._x&&t.y===this._y},Object.defineProperty(t.prototype,"x",{get:function(){return this._x},set:function(t){this._x!==t&&(this._x=t,this.cb.call(this.scope));},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"y",{get:function(){return this._y},set:function(t){this._y!==t&&(this._y=t,this.cb.call(this.scope));},enumerable:!1,configurable:!0}),t}(),p$7=function(){function t(t,i,h,s,o,n){void 0===t&&(t=1),void 0===i&&(i=0),void 0===h&&(h=0),void 0===s&&(s=1),void 0===o&&(o=0),void 0===n&&(n=0),this.array=null,this.a=t,this.b=i,this.c=h,this.d=s,this.tx=o,this.ty=n;}return t.prototype.fromArray=function(t){this.a=t[0],this.b=t[1],this.c=t[3],this.d=t[4],this.tx=t[2],this.ty=t[5];},t.prototype.set=function(t,i,h,s,o,n){return this.a=t,this.b=i,this.c=h,this.d=s,this.tx=o,this.ty=n,this},t.prototype.toArray=function(t,i){this.array||(this.array=new Float32Array(9));var h=i||this.array;return t?(h[0]=this.a,h[1]=this.b,h[2]=0,h[3]=this.c,h[4]=this.d,h[5]=0,h[6]=this.tx,h[7]=this.ty,h[8]=1):(h[0]=this.a,h[1]=this.c,h[2]=this.tx,h[3]=this.b,h[4]=this.d,h[5]=this.ty,h[6]=0,h[7]=0,h[8]=1),h},t.prototype.apply=function(t,i){i=i||new o$9;var h=t.x,s=t.y;return i.x=this.a*h+this.c*s+this.tx,i.y=this.b*h+this.d*s+this.ty,i},t.prototype.applyInverse=function(t,i){i=i||new o$9;var h=1/(this.a*this.d+this.c*-this.b),s=t.x,n=t.y;return i.x=this.d*h*s+-this.c*h*n+(this.ty*this.c-this.tx*this.d)*h,i.y=this.a*h*n+-this.b*h*s+(-this.ty*this.a+this.tx*this.b)*h,i},t.prototype.translate=function(t,i){return this.tx+=t,this.ty+=i,this},t.prototype.scale=function(t,i){return this.a*=t,this.d*=i,this.c*=t,this.b*=i,this.tx*=t,this.ty*=i,this},t.prototype.rotate=function(t){var i=Math.cos(t),h=Math.sin(t),s=this.a,o=this.c,n=this.tx;return this.a=s*i-this.b*h,this.b=s*h+this.b*i,this.c=o*i-this.d*h,this.d=o*h+this.d*i,this.tx=n*i-this.ty*h,this.ty=n*h+this.ty*i,this},t.prototype.append=function(t){var i=this.a,h=this.b,s=this.c,o=this.d;return this.a=t.a*i+t.b*s,this.b=t.a*h+t.b*o,this.c=t.c*i+t.d*s,this.d=t.c*h+t.d*o,this.tx=t.tx*i+t.ty*s+this.tx,this.ty=t.tx*h+t.ty*o+this.ty,this},t.prototype.setTransform=function(t,i,h,s,o,n,r,e,a){return this.a=Math.cos(r+a)*o,this.b=Math.sin(r+a)*o,this.c=-Math.sin(r-e)*n,this.d=Math.cos(r-e)*n,this.tx=t-(h*this.a+s*this.c),this.ty=i-(h*this.b+s*this.d),this},t.prototype.prepend=function(t){var i=this.tx;if(1!==t.a||0!==t.b||0!==t.c||1!==t.d){var h=this.a,s=this.c;this.a=h*t.a+this.b*t.c,this.b=h*t.b+this.b*t.d,this.c=s*t.a+this.d*t.c,this.d=s*t.b+this.d*t.d;}return this.tx=i*t.a+this.ty*t.c+t.tx,this.ty=i*t.b+this.ty*t.d+t.ty,this},t.prototype.decompose=function(t){var h=this.a,s=this.b,o=this.c,n=this.d,r=t.pivot,e=-Math.atan2(-o,n),a=Math.atan2(s,h),c=Math.abs(e+a);return c<1e-5||Math.abs(i$5-c)<1e-5?(t.rotation=a,t.skew.x=t.skew.y=0):(t.rotation=0,t.skew.x=e,t.skew.y=a),t.scale.x=Math.sqrt(h*h+s*s),t.scale.y=Math.sqrt(o*o+n*n),t.position.x=this.tx+(r.x*h+r.y*o),t.position.y=this.ty+(r.x*s+r.y*n),t},t.prototype.invert=function(){var t=this.a,i=this.b,h=this.c,s=this.d,o=this.tx,n=t*s-i*h;return this.a=s/n,this.b=-i/n,this.c=-h/n,this.d=t/n,this.tx=(h*this.ty-s*o)/n,this.ty=-(t*this.ty-i*o)/n,this},t.prototype.identity=function(){return this.a=1,this.b=0,this.c=0,this.d=1,this.tx=0,this.ty=0,this},t.prototype.clone=function(){var i=new t;return i.a=this.a,i.b=this.b,i.c=this.c,i.d=this.d,i.tx=this.tx,i.ty=this.ty,i},t.prototype.copyTo=function(t){return t.a=this.a,t.b=this.b,t.c=this.c,t.d=this.d,t.tx=this.tx,t.ty=this.ty,t},t.prototype.copyFrom=function(t){return this.a=t.a,this.b=t.b,this.c=t.c,this.d=t.d,this.tx=t.tx,this.ty=t.ty,this},Object.defineProperty(t,"IDENTITY",{get:function(){return new t},enumerable:!1,configurable:!0}),Object.defineProperty(t,"TEMP_MATRIX",{get:function(){return new t},enumerable:!1,configurable:!0}),t}(),x$6=[1,1,0,-1,-1,-1,0,1,1,1,0,-1,-1,-1,0,1],d$9=[0,1,1,1,0,-1,-1,-1,0,1,1,1,0,-1,-1,-1],f$7=[0,-1,-1,-1,0,1,1,1,0,1,1,1,0,-1,-1,-1],l$9=[1,1,0,-1,-1,-1,0,1,-1,-1,0,1,1,1,0,-1],b$6=[],v$7=[],w$2=Math.sign;!function(){for(var t=0;t<16;t++){var i=[];b$6.push(i);for(var h=0;h<16;h++)for(var s=w$2(x$6[t]*x$6[h]+f$7[t]*d$9[h]),o=w$2(d$9[t]*x$6[h]+l$9[t]*d$9[h]),n=w$2(x$6[t]*f$7[h]+f$7[t]*l$9[h]),r=w$2(d$9[t]*f$7[h]+l$9[t]*l$9[h]),e=0;e<16;e++)if(x$6[e]===s&&d$9[e]===o&&f$7[e]===n&&l$9[e]===r){i.push(e);break}}for(t=0;t<16;t++){var a=new p$7;a.set(x$6[t],d$9[t],f$7[t],l$9[t],0,0),v$7.push(a);}}();var _$8={E:0,SE:1,S:2,SW:3,W:4,NW:5,N:6,NE:7,MIRROR_VERTICAL:8,MAIN_DIAGONAL:10,MIRROR_HORIZONTAL:12,REVERSE_DIAGONAL:14,uX:function(t){return x$6[t]},uY:function(t){return d$9[t]},vX:function(t){return f$7[t]},vY:function(t){return l$9[t]},inv:function(t){return 8&t?15&t:7&-t},add:function(t,i){return b$6[t][i]},sub:function(t,i){return b$6[t][_$8.inv(i)]},rotate180:function(t){return 4^t},isVertical:function(t){return 2==(3&t)},byDirection:function(t,i){return 2*Math.abs(t)<=Math.abs(i)?i>=0?_$8.S:_$8.N:2*Math.abs(i)<=Math.abs(t)?t>0?_$8.E:_$8.W:i>0?t>0?_$8.SE:_$8.SW:t>0?_$8.NE:_$8.NW},matrixAppendRotationInv:function(t,i,h,s){void 0===h&&(h=0),void 0===s&&(s=0);var o=v$7[_$8.inv(i)];o.tx=h,o.ty=s,t.append(o);}},g$7=function(){function t(){this.worldTransform=new p$7,this.localTransform=new p$7,this.position=new u$9(this.onChange,this,0,0),this.scale=new u$9(this.onChange,this,1,1),this.pivot=new u$9(this.onChange,this,0,0),this.skew=new u$9(this.updateSkew,this,0,0),this._rotation=0,this._cx=1,this._sx=0,this._cy=0,this._sy=1,this._localID=0,this._currentLocalID=0,this._worldID=0,this._parentID=0;}return t.prototype.onChange=function(){this._localID++;},t.prototype.updateSkew=function(){this._cx=Math.cos(this._rotation+this.skew.y),this._sx=Math.sin(this._rotation+this.skew.y),this._cy=-Math.sin(this._rotation-this.skew.x),this._sy=Math.cos(this._rotation-this.skew.x),this._localID++;},t.prototype.updateLocalTransform=function(){var t=this.localTransform;this._localID!==this._currentLocalID&&(t.a=this._cx*this.scale.x,t.b=this._sx*this.scale.x,t.c=this._cy*this.scale.y,t.d=this._sy*this.scale.y,t.tx=this.position.x-(this.pivot.x*t.a+this.pivot.y*t.c),t.ty=this.position.y-(this.pivot.x*t.b+this.pivot.y*t.d),this._currentLocalID=this._localID,this._parentID=-1);},t.prototype.updateTransform=function(t){var i=this.localTransform;if(this._localID!==this._currentLocalID&&(i.a=this._cx*this.scale.x,i.b=this._sx*this.scale.x,i.c=this._cy*this.scale.y,i.d=this._sy*this.scale.y,i.tx=this.position.x-(this.pivot.x*i.a+this.pivot.y*i.c),i.ty=this.position.y-(this.pivot.x*i.b+this.pivot.y*i.d),this._currentLocalID=this._localID,this._parentID=-1),this._parentID!==t._worldID){var h=t.worldTransform,s=this.worldTransform;s.a=i.a*h.a+i.b*h.c,s.b=i.a*h.b+i.b*h.d,s.c=i.c*h.a+i.d*h.c,s.d=i.c*h.b+i.d*h.d,s.tx=i.tx*h.a+i.ty*h.c+h.tx,s.ty=i.tx*h.b+i.ty*h.d+h.ty,this._parentID=t._worldID,this._worldID++;}},t.prototype.setFromMatrix=function(t){t.decompose(this),this._localID++;},Object.defineProperty(t.prototype,"rotation",{get:function(){return this._rotation},set:function(t){this._rotation!==t&&(this._rotation=t,this.updateSkew());},enumerable:!1,configurable:!0}),t.IDENTITY=new t,t}();

  /*!
   * @pixi/display - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/display is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  V$2.SORTABLE_CHILDREN=!1;var a$6=function(){function t(){this.minX=1/0,this.minY=1/0,this.maxX=-1/0,this.maxY=-1/0,this.rect=null,this.updateID=-1;}return t.prototype.isEmpty=function(){return this.minX>this.maxX||this.minY>this.maxY},t.prototype.clear=function(){this.minX=1/0,this.minY=1/0,this.maxX=-1/0,this.maxY=-1/0;},t.prototype.getRectangle=function(t){return this.minX>this.maxX||this.minY>this.maxY?r$4.EMPTY:((t=t||new r$4(0,0,1,1)).x=this.minX,t.y=this.minY,t.width=this.maxX-this.minX,t.height=this.maxY-this.minY,t)},t.prototype.addPoint=function(t){this.minX=Math.min(this.minX,t.x),this.maxX=Math.max(this.maxX,t.x),this.minY=Math.min(this.minY,t.y),this.maxY=Math.max(this.maxY,t.y);},t.prototype.addPointMatrix=function(t,i){var e=t.a,n=t.b,r=t.c,s=t.d,o=t.tx,a=t.ty,h=e*i.x+r*i.y+o,l=n*i.x+s*i.y+a;this.minX=Math.min(this.minX,h),this.maxX=Math.max(this.maxX,h),this.minY=Math.min(this.minY,l),this.maxY=Math.max(this.maxY,l);},t.prototype.addQuad=function(t){var i=this.minX,e=this.minY,n=this.maxX,r=this.maxY,s=t[0],o=t[1];i=s<i?s:i,e=o<e?o:e,n=s>n?s:n,r=o>r?o:r,i=(s=t[2])<i?s:i,e=(o=t[3])<e?o:e,n=s>n?s:n,r=o>r?o:r,i=(s=t[4])<i?s:i,e=(o=t[5])<e?o:e,n=s>n?s:n,r=o>r?o:r,i=(s=t[6])<i?s:i,e=(o=t[7])<e?o:e,n=s>n?s:n,r=o>r?o:r,this.minX=i,this.minY=e,this.maxX=n,this.maxY=r;},t.prototype.addFrame=function(t,i,e,n,r){this.addFrameMatrix(t.worldTransform,i,e,n,r);},t.prototype.addFrameMatrix=function(t,i,e,n,r){var s=t.a,o=t.b,a=t.c,h=t.d,l=t.tx,d=t.ty,u=this.minX,_=this.minY,p=this.maxX,m=this.maxY,c=s*i+a*e+l,f=o*i+h*e+d;u=c<u?c:u,_=f<_?f:_,p=c>p?c:p,m=f>m?f:m,u=(c=s*n+a*e+l)<u?c:u,_=(f=o*n+h*e+d)<_?f:_,p=c>p?c:p,m=f>m?f:m,u=(c=s*i+a*r+l)<u?c:u,_=(f=o*i+h*r+d)<_?f:_,p=c>p?c:p,m=f>m?f:m,u=(c=s*n+a*r+l)<u?c:u,_=(f=o*n+h*r+d)<_?f:_,p=c>p?c:p,m=f>m?f:m,this.minX=u,this.minY=_,this.maxX=p,this.maxY=m;},t.prototype.addVertexData=function(t,i,e){for(var n=this.minX,r=this.minY,s=this.maxX,o=this.maxY,a=i;a<e;a+=2){var h=t[a],l=t[a+1];n=h<n?h:n,r=l<r?l:r,s=h>s?h:s,o=l>o?l:o;}this.minX=n,this.minY=r,this.maxX=s,this.maxY=o;},t.prototype.addVertices=function(t,i,e,n){this.addVerticesMatrix(t.worldTransform,i,e,n);},t.prototype.addVerticesMatrix=function(t,i,e,n,r,s){void 0===r&&(r=0),void 0===s&&(s=r);for(var o=t.a,a=t.b,h=t.c,l=t.d,d=t.tx,u=t.ty,_=this.minX,p=this.minY,m=this.maxX,c=this.maxY,f=e;f<n;f+=2){var E=i[f],T=i[f+1],N=o*E+h*T+d,R=l*T+a*E+u;_=Math.min(_,N-r),m=Math.max(m,N+r),p=Math.min(p,R-s),c=Math.max(c,R+s);}this.minX=_,this.minY=p,this.maxX=m,this.maxY=c;},t.prototype.addBounds=function(t){var i=this.minX,e=this.minY,n=this.maxX,r=this.maxY;this.minX=t.minX<i?t.minX:i,this.minY=t.minY<e?t.minY:e,this.maxX=t.maxX>n?t.maxX:n,this.maxY=t.maxY>r?t.maxY:r;},t.prototype.addBoundsMask=function(t,i){var e=t.minX>i.minX?t.minX:i.minX,n=t.minY>i.minY?t.minY:i.minY,r=t.maxX<i.maxX?t.maxX:i.maxX,s=t.maxY<i.maxY?t.maxY:i.maxY;if(e<=r&&n<=s){var o=this.minX,a=this.minY,h=this.maxX,l=this.maxY;this.minX=e<o?e:o,this.minY=n<a?n:a,this.maxX=r>h?r:h,this.maxY=s>l?s:l;}},t.prototype.addBoundsMatrix=function(t,i){this.addFrameMatrix(i,t.minX,t.minY,t.maxX,t.maxY);},t.prototype.addBoundsArea=function(t,i){var e=t.minX>i.x?t.minX:i.x,n=t.minY>i.y?t.minY:i.y,r=t.maxX<i.x+i.width?t.maxX:i.x+i.width,s=t.maxY<i.y+i.height?t.maxY:i.y+i.height;if(e<=r&&n<=s){var o=this.minX,a=this.minY,h=this.maxX,l=this.maxY;this.minX=e<o?e:o,this.minY=n<a?n:a,this.maxX=r>h?r:h,this.maxY=s>l?s:l;}},t.prototype.pad=function(t,i){void 0===t&&(t=0),void 0===i&&(i=t),this.isEmpty()||(this.minX-=t,this.maxX+=t,this.minY-=i,this.maxY+=i);},t.prototype.addFramePad=function(t,i,e,n,r,s){t-=r,i-=s,e+=r,n+=s,this.minX=this.minX<t?this.minX:t,this.maxX=this.maxX>e?this.maxX:e,this.minY=this.minY<i?this.minY:i,this.maxY=this.maxY>n?this.maxY:n;},t}(),h$5=function(t,i){return h$5=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,i){t.__proto__=i;}||function(t,i){for(var e in i)i.hasOwnProperty(e)&&(t[e]=i[e]);},h$5(t,i)};function l$8(t,i){function e(){this.constructor=t;}h$5(t,i),t.prototype=null===i?Object.create(i):(e.prototype=i.prototype,new e);}var d$8,u$8,_$7,p$6,m$5,c$9,f$6,E$5,T$6,N$5,R$3,I$5,A$4,O$5,y$7,b$5,P$5,L$4,x$5,D$3,U$4=function(t){function s(){var i=t.call(this)||this;return i.tempDisplayObjectParent=null,i.transform=new g$7,i.alpha=1,i.visible=!0,i.renderable=!0,i.cullable=!1,i.cullArea=null,i.parent=null,i.worldAlpha=1,i._lastSortedIndex=0,i._zIndex=0,i.filterArea=null,i.filters=null,i._enabledFilters=null,i._bounds=new a$6,i._localBounds=null,i._boundsID=0,i._boundsRect=null,i._localBoundsRect=null,i._mask=null,i._maskRefCount=0,i._destroyed=!1,i.isSprite=!1,i.isMask=!1,i}return l$8(s,t),s.mixin=function(t){for(var i=Object.keys(t),e=0;e<i.length;++e){var n=i[e];Object.defineProperty(s.prototype,n,Object.getOwnPropertyDescriptor(t,n));}},Object.defineProperty(s.prototype,"destroyed",{get:function(){return this._destroyed},enumerable:!1,configurable:!0}),s.prototype._recursivePostUpdateTransform=function(){this.parent?(this.parent._recursivePostUpdateTransform(),this.transform.updateTransform(this.parent.transform)):this.transform.updateTransform(this._tempDisplayObjectParent.transform);},s.prototype.updateTransform=function(){this._boundsID++,this.transform.updateTransform(this.parent.transform),this.worldAlpha=this.alpha*this.parent.worldAlpha;},s.prototype.getBounds=function(t,e){return t||(this.parent?(this._recursivePostUpdateTransform(),this.updateTransform()):(this.parent=this._tempDisplayObjectParent,this.updateTransform(),this.parent=null)),this._bounds.updateID!==this._boundsID&&(this.calculateBounds(),this._bounds.updateID=this._boundsID),e||(this._boundsRect||(this._boundsRect=new r$4),e=this._boundsRect),this._bounds.getRectangle(e)},s.prototype.getLocalBounds=function(t){t||(this._localBoundsRect||(this._localBoundsRect=new r$4),t=this._localBoundsRect),this._localBounds||(this._localBounds=new a$6);var e=this.transform,n=this.parent;this.parent=null,this.transform=this._tempDisplayObjectParent.transform;var r=this._bounds,s=this._boundsID;this._bounds=this._localBounds;var o=this.getBounds(!1,t);return this.parent=n,this.transform=e,this._bounds=r,this._bounds.updateID+=this._boundsID-s,o},s.prototype.toGlobal=function(t,i,e){return void 0===e&&(e=!1),e||(this._recursivePostUpdateTransform(),this.parent?this.displayObjectUpdateTransform():(this.parent=this._tempDisplayObjectParent,this.displayObjectUpdateTransform(),this.parent=null)),this.worldTransform.apply(t,i)},s.prototype.toLocal=function(t,i,e,n){return i&&(t=i.toGlobal(t,e,n)),n||(this._recursivePostUpdateTransform(),this.parent?this.displayObjectUpdateTransform():(this.parent=this._tempDisplayObjectParent,this.displayObjectUpdateTransform(),this.parent=null)),this.worldTransform.applyInverse(t,e)},s.prototype.setParent=function(t){if(!t||!t.addChild)throw new Error("setParent: Argument must be a Container");return t.addChild(this),t},s.prototype.setTransform=function(t,i,e,n,r,s,o,a,h){return void 0===t&&(t=0),void 0===i&&(i=0),void 0===e&&(e=1),void 0===n&&(n=1),void 0===r&&(r=0),void 0===s&&(s=0),void 0===o&&(o=0),void 0===a&&(a=0),void 0===h&&(h=0),this.position.x=t,this.position.y=i,this.scale.x=e||1,this.scale.y=n||1,this.rotation=r,this.skew.x=s,this.skew.y=o,this.pivot.x=a,this.pivot.y=h,this},s.prototype.destroy=function(t){this.parent&&this.parent.removeChild(this),this._destroyed=!0,this.transform=null,this.parent=null,this._bounds=null,this.mask=null,this.cullArea=null,this.filters=null,this.filterArea=null,this.hitArea=null,this.interactive=!1,this.interactiveChildren=!1,this.emit("destroyed"),this.removeAllListeners();},Object.defineProperty(s.prototype,"_tempDisplayObjectParent",{get:function(){return null===this.tempDisplayObjectParent&&(this.tempDisplayObjectParent=new C$5),this.tempDisplayObjectParent},enumerable:!1,configurable:!0}),s.prototype.enableTempParent=function(){var t=this.parent;return this.parent=this._tempDisplayObjectParent,t},s.prototype.disableTempParent=function(t){this.parent=t;},Object.defineProperty(s.prototype,"x",{get:function(){return this.position.x},set:function(t){this.transform.position.x=t;},enumerable:!1,configurable:!0}),Object.defineProperty(s.prototype,"y",{get:function(){return this.position.y},set:function(t){this.transform.position.y=t;},enumerable:!1,configurable:!0}),Object.defineProperty(s.prototype,"worldTransform",{get:function(){return this.transform.worldTransform},enumerable:!1,configurable:!0}),Object.defineProperty(s.prototype,"localTransform",{get:function(){return this.transform.localTransform},enumerable:!1,configurable:!0}),Object.defineProperty(s.prototype,"position",{get:function(){return this.transform.position},set:function(t){this.transform.position.copyFrom(t);},enumerable:!1,configurable:!0}),Object.defineProperty(s.prototype,"scale",{get:function(){return this.transform.scale},set:function(t){this.transform.scale.copyFrom(t);},enumerable:!1,configurable:!0}),Object.defineProperty(s.prototype,"pivot",{get:function(){return this.transform.pivot},set:function(t){this.transform.pivot.copyFrom(t);},enumerable:!1,configurable:!0}),Object.defineProperty(s.prototype,"skew",{get:function(){return this.transform.skew},set:function(t){this.transform.skew.copyFrom(t);},enumerable:!1,configurable:!0}),Object.defineProperty(s.prototype,"rotation",{get:function(){return this.transform.rotation},set:function(t){this.transform.rotation=t;},enumerable:!1,configurable:!0}),Object.defineProperty(s.prototype,"angle",{get:function(){return this.transform.rotation*h$6},set:function(t){this.transform.rotation=t*s$6;},enumerable:!1,configurable:!0}),Object.defineProperty(s.prototype,"zIndex",{get:function(){return this._zIndex},set:function(t){this._zIndex=t,this.parent&&(this.parent.sortDirty=!0);},enumerable:!1,configurable:!0}),Object.defineProperty(s.prototype,"worldVisible",{get:function(){var t=this;do{if(!t.visible)return !1;t=t.parent;}while(t);return !0},enumerable:!1,configurable:!0}),Object.defineProperty(s.prototype,"mask",{get:function(){return this._mask},set:function(t){if(this._mask!==t){var i;if(this._mask)(i=this._mask.isMaskData?this._mask.maskObject:this._mask)&&(i._maskRefCount--,0===i._maskRefCount&&(i.renderable=!0,i.isMask=!1));if(this._mask=t,this._mask)(i=this._mask.isMaskData?this._mask.maskObject:this._mask)&&(0===i._maskRefCount&&(i.renderable=!1,i.isMask=!0),i._maskRefCount++);}},enumerable:!1,configurable:!0}),s}(r$5),C$5=function(t){function i(){var i=null!==t&&t.apply(this,arguments)||this;return i.sortDirty=null,i}return l$8(i,t),i}(U$4);function v$6(t,i){return t.zIndex===i.zIndex?t._lastSortedIndex-i._lastSortedIndex:t.zIndex-i.zIndex}U$4.prototype.displayObjectUpdateTransform=U$4.prototype.updateTransform,function(t){t[t.WEBGL_LEGACY=0]="WEBGL_LEGACY",t[t.WEBGL=1]="WEBGL",t[t.WEBGL2=2]="WEBGL2";}(d$8||(d$8={})),function(t){t[t.UNKNOWN=0]="UNKNOWN",t[t.WEBGL=1]="WEBGL",t[t.CANVAS=2]="CANVAS";}(u$8||(u$8={})),function(t){t[t.COLOR=16384]="COLOR",t[t.DEPTH=256]="DEPTH",t[t.STENCIL=1024]="STENCIL";}(_$7||(_$7={})),function(t){t[t.NORMAL=0]="NORMAL",t[t.ADD=1]="ADD",t[t.MULTIPLY=2]="MULTIPLY",t[t.SCREEN=3]="SCREEN",t[t.OVERLAY=4]="OVERLAY",t[t.DARKEN=5]="DARKEN",t[t.LIGHTEN=6]="LIGHTEN",t[t.COLOR_DODGE=7]="COLOR_DODGE",t[t.COLOR_BURN=8]="COLOR_BURN",t[t.HARD_LIGHT=9]="HARD_LIGHT",t[t.SOFT_LIGHT=10]="SOFT_LIGHT",t[t.DIFFERENCE=11]="DIFFERENCE",t[t.EXCLUSION=12]="EXCLUSION",t[t.HUE=13]="HUE",t[t.SATURATION=14]="SATURATION",t[t.COLOR=15]="COLOR",t[t.LUMINOSITY=16]="LUMINOSITY",t[t.NORMAL_NPM=17]="NORMAL_NPM",t[t.ADD_NPM=18]="ADD_NPM",t[t.SCREEN_NPM=19]="SCREEN_NPM",t[t.NONE=20]="NONE",t[t.SRC_OVER=0]="SRC_OVER",t[t.SRC_IN=21]="SRC_IN",t[t.SRC_OUT=22]="SRC_OUT",t[t.SRC_ATOP=23]="SRC_ATOP",t[t.DST_OVER=24]="DST_OVER",t[t.DST_IN=25]="DST_IN",t[t.DST_OUT=26]="DST_OUT",t[t.DST_ATOP=27]="DST_ATOP",t[t.ERASE=26]="ERASE",t[t.SUBTRACT=28]="SUBTRACT",t[t.XOR=29]="XOR";}(p$6||(p$6={})),function(t){t[t.POINTS=0]="POINTS",t[t.LINES=1]="LINES",t[t.LINE_LOOP=2]="LINE_LOOP",t[t.LINE_STRIP=3]="LINE_STRIP",t[t.TRIANGLES=4]="TRIANGLES",t[t.TRIANGLE_STRIP=5]="TRIANGLE_STRIP",t[t.TRIANGLE_FAN=6]="TRIANGLE_FAN";}(m$5||(m$5={})),function(t){t[t.RGBA=6408]="RGBA",t[t.RGB=6407]="RGB",t[t.RG=33319]="RG",t[t.RED=6403]="RED",t[t.RGBA_INTEGER=36249]="RGBA_INTEGER",t[t.RGB_INTEGER=36248]="RGB_INTEGER",t[t.RG_INTEGER=33320]="RG_INTEGER",t[t.RED_INTEGER=36244]="RED_INTEGER",t[t.ALPHA=6406]="ALPHA",t[t.LUMINANCE=6409]="LUMINANCE",t[t.LUMINANCE_ALPHA=6410]="LUMINANCE_ALPHA",t[t.DEPTH_COMPONENT=6402]="DEPTH_COMPONENT",t[t.DEPTH_STENCIL=34041]="DEPTH_STENCIL";}(c$9||(c$9={})),function(t){t[t.TEXTURE_2D=3553]="TEXTURE_2D",t[t.TEXTURE_CUBE_MAP=34067]="TEXTURE_CUBE_MAP",t[t.TEXTURE_2D_ARRAY=35866]="TEXTURE_2D_ARRAY",t[t.TEXTURE_CUBE_MAP_POSITIVE_X=34069]="TEXTURE_CUBE_MAP_POSITIVE_X",t[t.TEXTURE_CUBE_MAP_NEGATIVE_X=34070]="TEXTURE_CUBE_MAP_NEGATIVE_X",t[t.TEXTURE_CUBE_MAP_POSITIVE_Y=34071]="TEXTURE_CUBE_MAP_POSITIVE_Y",t[t.TEXTURE_CUBE_MAP_NEGATIVE_Y=34072]="TEXTURE_CUBE_MAP_NEGATIVE_Y",t[t.TEXTURE_CUBE_MAP_POSITIVE_Z=34073]="TEXTURE_CUBE_MAP_POSITIVE_Z",t[t.TEXTURE_CUBE_MAP_NEGATIVE_Z=34074]="TEXTURE_CUBE_MAP_NEGATIVE_Z";}(f$6||(f$6={})),function(t){t[t.UNSIGNED_BYTE=5121]="UNSIGNED_BYTE",t[t.UNSIGNED_SHORT=5123]="UNSIGNED_SHORT",t[t.UNSIGNED_SHORT_5_6_5=33635]="UNSIGNED_SHORT_5_6_5",t[t.UNSIGNED_SHORT_4_4_4_4=32819]="UNSIGNED_SHORT_4_4_4_4",t[t.UNSIGNED_SHORT_5_5_5_1=32820]="UNSIGNED_SHORT_5_5_5_1",t[t.UNSIGNED_INT=5125]="UNSIGNED_INT",t[t.UNSIGNED_INT_10F_11F_11F_REV=35899]="UNSIGNED_INT_10F_11F_11F_REV",t[t.UNSIGNED_INT_2_10_10_10_REV=33640]="UNSIGNED_INT_2_10_10_10_REV",t[t.UNSIGNED_INT_24_8=34042]="UNSIGNED_INT_24_8",t[t.UNSIGNED_INT_5_9_9_9_REV=35902]="UNSIGNED_INT_5_9_9_9_REV",t[t.BYTE=5120]="BYTE",t[t.SHORT=5122]="SHORT",t[t.INT=5124]="INT",t[t.FLOAT=5126]="FLOAT",t[t.FLOAT_32_UNSIGNED_INT_24_8_REV=36269]="FLOAT_32_UNSIGNED_INT_24_8_REV",t[t.HALF_FLOAT=36193]="HALF_FLOAT";}(E$5||(E$5={})),function(t){t[t.FLOAT=0]="FLOAT",t[t.INT=1]="INT",t[t.UINT=2]="UINT";}(T$6||(T$6={})),function(t){t[t.NEAREST=0]="NEAREST",t[t.LINEAR=1]="LINEAR";}(N$5||(N$5={})),function(t){t[t.CLAMP=33071]="CLAMP",t[t.REPEAT=10497]="REPEAT",t[t.MIRRORED_REPEAT=33648]="MIRRORED_REPEAT";}(R$3||(R$3={})),function(t){t[t.OFF=0]="OFF",t[t.POW2=1]="POW2",t[t.ON=2]="ON",t[t.ON_MANUAL=3]="ON_MANUAL";}(I$5||(I$5={})),function(t){t[t.NPM=0]="NPM",t[t.UNPACK=1]="UNPACK",t[t.PMA=2]="PMA",t[t.NO_PREMULTIPLIED_ALPHA=0]="NO_PREMULTIPLIED_ALPHA",t[t.PREMULTIPLY_ON_UPLOAD=1]="PREMULTIPLY_ON_UPLOAD",t[t.PREMULTIPLY_ALPHA=2]="PREMULTIPLY_ALPHA",t[t.PREMULTIPLIED_ALPHA=2]="PREMULTIPLIED_ALPHA";}(A$4||(A$4={})),function(t){t[t.NO=0]="NO",t[t.YES=1]="YES",t[t.AUTO=2]="AUTO",t[t.BLEND=0]="BLEND",t[t.CLEAR=1]="CLEAR",t[t.BLIT=2]="BLIT";}(O$5||(O$5={})),function(t){t[t.AUTO=0]="AUTO",t[t.MANUAL=1]="MANUAL";}(y$7||(y$7={})),function(t){t.LOW="lowp",t.MEDIUM="mediump",t.HIGH="highp";}(b$5||(b$5={})),function(t){t[t.NONE=0]="NONE",t[t.SCISSOR=1]="SCISSOR",t[t.STENCIL=2]="STENCIL",t[t.SPRITE=3]="SPRITE",t[t.COLOR=4]="COLOR";}(P$5||(P$5={})),function(t){t[t.RED=1]="RED",t[t.GREEN=2]="GREEN",t[t.BLUE=4]="BLUE",t[t.ALPHA=8]="ALPHA";}(L$4||(L$4={})),function(t){t[t.NONE=0]="NONE",t[t.LOW=2]="LOW",t[t.MEDIUM=4]="MEDIUM",t[t.HIGH=8]="HIGH";}(x$5||(x$5={})),function(t){t[t.ELEMENT_ARRAY_BUFFER=34963]="ELEMENT_ARRAY_BUFFER",t[t.ARRAY_BUFFER=34962]="ARRAY_BUFFER",t[t.UNIFORM_BUFFER=35345]="UNIFORM_BUFFER";}(D$3||(D$3={}));var g$6=function(i){function e(){var e=i.call(this)||this;return e.children=[],e.sortableChildren=V$2.SORTABLE_CHILDREN,e.sortDirty=!1,e}return l$8(e,i),e.prototype.onChildrenChange=function(t){},e.prototype.addChild=function(){for(var t=arguments,i=[],e=0;e<arguments.length;e++)i[e]=t[e];if(i.length>1)for(var n=0;n<i.length;n++)this.addChild(i[n]);else {var r=i[0];r.parent&&r.parent.removeChild(r),r.parent=this,this.sortDirty=!0,r.transform._parentID=-1,this.children.push(r),this._boundsID++,this.onChildrenChange(this.children.length-1),this.emit("childAdded",r,this,this.children.length-1),r.emit("added",this);}return i[0]},e.prototype.addChildAt=function(t,i){if(i<0||i>this.children.length)throw new Error(t+"addChildAt: The index "+i+" supplied is out of bounds "+this.children.length);return t.parent&&t.parent.removeChild(t),t.parent=this,this.sortDirty=!0,t.transform._parentID=-1,this.children.splice(i,0,t),this._boundsID++,this.onChildrenChange(i),t.emit("added",this),this.emit("childAdded",t,this,i),t},e.prototype.swapChildren=function(t,i){if(t!==i){var e=this.getChildIndex(t),n=this.getChildIndex(i);this.children[e]=i,this.children[n]=t,this.onChildrenChange(e<n?e:n);}},e.prototype.getChildIndex=function(t){var i=this.children.indexOf(t);if(-1===i)throw new Error("The supplied DisplayObject must be a child of the caller");return i},e.prototype.setChildIndex=function(t,i){if(i<0||i>=this.children.length)throw new Error("The index "+i+" supplied is out of bounds "+this.children.length);var e=this.getChildIndex(t);_$9(this.children,e,1),this.children.splice(i,0,t),this.onChildrenChange(i);},e.prototype.getChildAt=function(t){if(t<0||t>=this.children.length)throw new Error("getChildAt: Index ("+t+") does not exist.");return this.children[t]},e.prototype.removeChild=function(){for(var t=arguments,i=[],e=0;e<arguments.length;e++)i[e]=t[e];if(i.length>1)for(var n=0;n<i.length;n++)this.removeChild(i[n]);else {var r=i[0],s=this.children.indexOf(r);if(-1===s)return null;r.parent=null,r.transform._parentID=-1,_$9(this.children,s,1),this._boundsID++,this.onChildrenChange(s),r.emit("removed",this),this.emit("childRemoved",r,this,s);}return i[0]},e.prototype.removeChildAt=function(t){var i=this.getChildAt(t);return i.parent=null,i.transform._parentID=-1,_$9(this.children,t,1),this._boundsID++,this.onChildrenChange(t),i.emit("removed",this),this.emit("childRemoved",i,this,t),i},e.prototype.removeChildren=function(t,i){void 0===t&&(t=0),void 0===i&&(i=this.children.length);var e,n=t,r=i-n;if(r>0&&r<=i){e=this.children.splice(n,r);for(var s=0;s<e.length;++s)e[s].parent=null,e[s].transform&&(e[s].transform._parentID=-1);this._boundsID++,this.onChildrenChange(t);for(s=0;s<e.length;++s)e[s].emit("removed",this),this.emit("childRemoved",e[s],this,s);return e}if(0===r&&0===this.children.length)return [];throw new RangeError("removeChildren: numeric values are outside the acceptable range.")},e.prototype.sortChildren=function(){for(var t=!1,i=0,e=this.children.length;i<e;++i){var n=this.children[i];n._lastSortedIndex=i,t||0===n.zIndex||(t=!0);}t&&this.children.length>1&&this.children.sort(v$6),this.sortDirty=!1;},e.prototype.updateTransform=function(){this.sortableChildren&&this.sortDirty&&this.sortChildren(),this._boundsID++,this.transform.updateTransform(this.parent.transform),this.worldAlpha=this.alpha*this.parent.worldAlpha;for(var t=0,i=this.children.length;t<i;++t){var e=this.children[t];e.visible&&e.updateTransform();}},e.prototype.calculateBounds=function(){this._bounds.clear(),this._calculateBounds();for(var t=0;t<this.children.length;t++){var i=this.children[t];if(i.visible&&i.renderable)if(i.calculateBounds(),i._mask){var e=i._mask.isMaskData?i._mask.maskObject:i._mask;e?(e.calculateBounds(),this._bounds.addBoundsMask(i._bounds,e._bounds)):this._bounds.addBounds(i._bounds);}else i.filterArea?this._bounds.addBoundsArea(i._bounds,i.filterArea):this._bounds.addBounds(i._bounds);}this._bounds.updateID=this._boundsID;},e.prototype.getLocalBounds=function(t,e){void 0===e&&(e=!1);var n=i.prototype.getLocalBounds.call(this,t);if(!e)for(var r=0,s=this.children.length;r<s;++r){var o=this.children[r];o.visible&&o.updateTransform();}return n},e.prototype._calculateBounds=function(){},e.prototype._renderWithCulling=function(t){var i=t.renderTexture.sourceFrame;if(i.width>0&&i.height>0){var n,r;if(this.cullArea?(n=this.cullArea,r=this.worldTransform):this._render!==e.prototype._render&&(n=this.getBounds(!0)),n&&i.intersects(n,r))this._render(t);else if(this.cullArea)return;for(var s=0,o=this.children.length;s<o;++s){var a=this.children[s],h=a.cullable;a.cullable=h||!this.cullArea,a.render(t),a.cullable=h;}}},e.prototype.render=function(t){if(this.visible&&!(this.worldAlpha<=0)&&this.renderable)if(this._mask||this.filters&&this.filters.length)this.renderAdvanced(t);else if(this.cullable)this._renderWithCulling(t);else {this._render(t);for(var i=0,e=this.children.length;i<e;++i)this.children[i].render(t);}},e.prototype.renderAdvanced=function(t){var i=this.filters,e=this._mask;if(i){this._enabledFilters||(this._enabledFilters=[]),this._enabledFilters.length=0;for(var n=0;n<i.length;n++)i[n].enabled&&this._enabledFilters.push(i[n]);}var r=i&&this._enabledFilters&&this._enabledFilters.length||e&&(!e.isMaskData||e.enabled&&(e.autoDetect||e.type!==P$5.NONE));if(r&&t.batch.flush(),i&&this._enabledFilters&&this._enabledFilters.length&&t.filter.push(this,this._enabledFilters),e&&t.mask.push(this,this._mask),this.cullable)this._renderWithCulling(t);else {this._render(t);n=0;for(var s=this.children.length;n<s;++n)this.children[n].render(t);}r&&t.batch.flush(),e&&t.mask.pop(this),i&&this._enabledFilters&&this._enabledFilters.length&&t.filter.pop();},e.prototype._render=function(t){},e.prototype.destroy=function(t){i.prototype.destroy.call(this),this.sortDirty=!1;var e="boolean"==typeof t?t:t&&t.children,n=this.removeChildren(0,this.children.length);if(e)for(var r=0;r<n.length;++r)n[r].destroy(t);},Object.defineProperty(e.prototype,"width",{get:function(){return this.scale.x*this.getLocalBounds().width},set:function(t){var i=this.getLocalBounds().width;this.scale.x=0!==i?t/i:1,this._width=t;},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"height",{get:function(){return this.scale.y*this.getLocalBounds().height},set:function(t){var i=this.getLocalBounds().height;this.scale.y=0!==i?t/i:1,this._height=t;},enumerable:!1,configurable:!0}),e}(U$4);g$6.prototype.containerUpdateTransform=g$6.prototype.updateTransform;

  /*!
   * @pixi/extensions - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/extensions is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  var e$2,n$8=function(){return n$8=Object.assign||function(e){for(var n,r=arguments,t=1,a=arguments.length;t<a;t++)for(var o in n=r[t])Object.prototype.hasOwnProperty.call(n,o)&&(e[o]=n[o]);return e},n$8.apply(this,arguments)};!function(e){e.Application="application",e.RendererPlugin="renderer-webgl-plugin",e.CanvasRendererPlugin="renderer-canvas-plugin",e.Loader="loader",e.LoadParser="load-parser",e.ResolveParser="resolve-parser",e.CacheParser="cache-parser",e.DetectionParser="detection-parser";}(e$2||(e$2={}));var r$3=function(e){if("function"==typeof e||"object"==typeof e&&e.extension){var r="object"!=typeof e.extension?{type:e.extension}:e.extension;e=n$8(n$8({},r),{ref:e});}if("object"!=typeof e)throw new Error("Invalid extension type");return "string"==typeof(e=n$8({},e)).type&&(e.type=[e.type]),e},t$2={_addHandlers:null,_removeHandlers:null,_queue:{},remove:function(){for(var e=arguments,n=this,t=[],a=0;a<arguments.length;a++)t[a]=e[a];return t.map(r$3).forEach((function(e){e.type.forEach((function(r){var t,a;return null===(a=(t=n._removeHandlers)[r])||void 0===a?void 0:a.call(t,e)}));})),this},add:function(){for(var e=arguments,n=this,t=[],a=0;a<arguments.length;a++)t[a]=e[a];return t.map(r$3).forEach((function(e){e.type.forEach((function(r){var t=n._addHandlers,a=n._queue;t[r]?t[r](e):(a[r]=a[r]||[],a[r].push(e));}));})),this},handle:function(e,n,r){var t=this._addHandlers=this._addHandlers||{},a=this._removeHandlers=this._removeHandlers||{};t[e]=n,a[e]=r;var o=this._queue;return o[e]&&(o[e].forEach((function(e){return n(e)})),delete o[e]),this},handleByMap:function(e,n){return this.handle(e,(function(e){n[e.name]=e.ref;}),(function(e){delete n[e.name];}))},handleByList:function(n,r){return this.handle(n,(function(t){var a,o;r.push(t.ref),n===e$2.Loader&&(null===(o=(a=t.ref).add)||void 0===o||o.call(a));}),(function(e){var n=r.indexOf(e.ref);-1!==n&&r.splice(n,1);}))}};

  /*!
   * @pixi/runner - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/runner is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  var t$1=function(){function t(t){this.items=[],this._name=t,this._aliasCount=0;}return t.prototype.emit=function(t,e,i,n,s,r,o,h){if(arguments.length>8)throw new Error("max arguments reached");var u=this,a=u.name,m=u.items;this._aliasCount++;for(var p=0,l=m.length;p<l;p++)m[p][a](t,e,i,n,s,r,o,h);return m===this.items&&this._aliasCount--,this},t.prototype.ensureNonAliasedItems=function(){this._aliasCount>0&&this.items.length>1&&(this._aliasCount=0,this.items=this.items.slice(0));},t.prototype.add=function(t){return t[this._name]&&(this.ensureNonAliasedItems(),this.remove(t),this.items.push(t)),this},t.prototype.remove=function(t){var e=this.items.indexOf(t);return -1!==e&&(this.ensureNonAliasedItems(),this.items.splice(e,1)),this},t.prototype.contains=function(t){return -1!==this.items.indexOf(t)},t.prototype.removeAll=function(){return this.ensureNonAliasedItems(),this.items.length=0,this},t.prototype.destroy=function(){this.removeAll(),this.items=null,this._name=null;},Object.defineProperty(t.prototype,"empty",{get:function(){return 0===this.items.length},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"name",{get:function(){return this._name},enumerable:!1,configurable:!0}),t}();Object.defineProperties(t$1.prototype,{dispatch:{value:t$1.prototype.emit},run:{value:t$1.prototype.emit}});

  /*!
   * @pixi/ticker - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/ticker is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  var i$4;V$2.TARGET_FPMS=.06,function(t){t[t.INTERACTION=50]="INTERACTION",t[t.HIGH=25]="HIGH",t[t.NORMAL=0]="NORMAL",t[t.LOW=-25]="LOW",t[t.UTILITY=-50]="UTILITY";}(i$4||(i$4={}));var s$5=function(){function t(t,e,i,s){void 0===e&&(e=null),void 0===i&&(i=0),void 0===s&&(s=!1),this.next=null,this.previous=null,this._destroyed=!1,this.fn=t,this.context=e,this.priority=i,this.once=s;}return t.prototype.match=function(t,e){return void 0===e&&(e=null),this.fn===t&&this.context===e},t.prototype.emit=function(t){this.fn&&(this.context?this.fn.call(this.context,t):this.fn(t));var e=this.next;return this.once&&this.destroy(!0),this._destroyed&&(this.next=null),e},t.prototype.connect=function(t){this.previous=t,t.next&&(t.next.previous=this),this.next=t.next,t.next=this;},t.prototype.destroy=function(t){void 0===t&&(t=!1),this._destroyed=!0,this.fn=null,this.context=null,this.previous&&(this.previous.next=this.next),this.next&&(this.next.previous=this.previous);var e=this.next;return this.next=t?null:e,this.previous=null,e},t}(),n$7=function(){function e(){var e=this;this.autoStart=!1,this.deltaTime=1,this.lastTime=-1,this.speed=1,this.started=!1,this._requestId=null,this._maxElapsedMS=100,this._minElapsedMS=0,this._protected=!1,this._lastFrame=-1,this._head=new s$5(null,null,1/0),this.deltaMS=1/V$2.TARGET_FPMS,this.elapsedMS=1/V$2.TARGET_FPMS,this._tick=function(t){e._requestId=null,e.started&&(e.update(t),e.started&&null===e._requestId&&e._head.next&&(e._requestId=requestAnimationFrame(e._tick)));};}return e.prototype._requestIfNeeded=function(){null===this._requestId&&this._head.next&&(this.lastTime=performance.now(),this._lastFrame=this.lastTime,this._requestId=requestAnimationFrame(this._tick));},e.prototype._cancelIfNeeded=function(){null!==this._requestId&&(cancelAnimationFrame(this._requestId),this._requestId=null);},e.prototype._startIfPossible=function(){this.started?this._requestIfNeeded():this.autoStart&&this.start();},e.prototype.add=function(t,e,n){return void 0===n&&(n=i$4.NORMAL),this._addListener(new s$5(t,e,n))},e.prototype.addOnce=function(t,e,n){return void 0===n&&(n=i$4.NORMAL),this._addListener(new s$5(t,e,n,!0))},e.prototype._addListener=function(t){var e=this._head.next,i=this._head;if(e){for(;e;){if(t.priority>e.priority){t.connect(i);break}i=e,e=e.next;}t.previous||t.connect(i);}else t.connect(i);return this._startIfPossible(),this},e.prototype.remove=function(t,e){for(var i=this._head.next;i;)i=i.match(t,e)?i.destroy():i.next;return this._head.next||this._cancelIfNeeded(),this},Object.defineProperty(e.prototype,"count",{get:function(){if(!this._head)return 0;for(var t=0,e=this._head;e=e.next;)t++;return t},enumerable:!1,configurable:!0}),e.prototype.start=function(){this.started||(this.started=!0,this._requestIfNeeded());},e.prototype.stop=function(){this.started&&(this.started=!1,this._cancelIfNeeded());},e.prototype.destroy=function(){if(!this._protected){this.stop();for(var t=this._head.next;t;)t=t.destroy(!0);this._head.destroy(),this._head=null;}},e.prototype.update=function(e){var i;if(void 0===e&&(e=performance.now()),e>this.lastTime){if((i=this.elapsedMS=e-this.lastTime)>this._maxElapsedMS&&(i=this._maxElapsedMS),i*=this.speed,this._minElapsedMS){var s=e-this._lastFrame|0;if(s<this._minElapsedMS)return;this._lastFrame=e-s%this._minElapsedMS;}this.deltaMS=i,this.deltaTime=this.deltaMS*V$2.TARGET_FPMS;for(var n=this._head,r=n.next;r;)r=r.emit(this.deltaTime);n.next||this._cancelIfNeeded();}else this.deltaTime=this.deltaMS=this.elapsedMS=0;this.lastTime=e;},Object.defineProperty(e.prototype,"FPS",{get:function(){return 1e3/this.elapsedMS},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"minFPS",{get:function(){return 1e3/this._maxElapsedMS},set:function(e){var i=Math.min(this.maxFPS,e),s=Math.min(Math.max(0,i)/1e3,V$2.TARGET_FPMS);this._maxElapsedMS=1/s;},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"maxFPS",{get:function(){return this._minElapsedMS?Math.round(1e3/this._minElapsedMS):0},set:function(t){if(0===t)this._minElapsedMS=0;else {var e=Math.max(this.minFPS,t);this._minElapsedMS=1/(e/1e3);}},enumerable:!1,configurable:!0}),Object.defineProperty(e,"shared",{get:function(){if(!e._shared){var t=e._shared=new e;t.autoStart=!0,t._protected=!0;}return e._shared},enumerable:!1,configurable:!0}),Object.defineProperty(e,"system",{get:function(){if(!e._system){var t=e._system=new e;t.autoStart=!0,t._protected=!0;}return e._system},enumerable:!1,configurable:!0}),e}(),r$2=function(){function t(){}return t.init=function(t){var e=this;t=Object.assign({autoStart:!0,sharedTicker:!1},t),Object.defineProperty(this,"ticker",{set:function(t){this._ticker&&this._ticker.remove(this.render,this),this._ticker=t,t&&t.add(this.render,this,i$4.LOW);},get:function(){return this._ticker}}),this.stop=function(){e._ticker.stop();},this.start=function(){e._ticker.start();},this._ticker=null,this.ticker=t.sharedTicker?n$7.shared:new n$7,t.autoStart&&this.start();},t.destroy=function(){if(this._ticker){var t=this._ticker;this.ticker=null,t.destroy();}},t.extension=e$2.Application,t}();

  /*!
   * @pixi/core - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/core is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  V$2.PREFER_ENV=X$2.any?E$6.WEBGL:E$6.WEBGL2,V$2.STRICT_TEXTURE_CACHE=!1;var Y$2=[];function K$2(e,t){if(!e)return null;var r="";if("string"==typeof e){var i=/\.(\w{3,4})(?:$|\?|#)/i.exec(e);i&&(r=i[1].toLowerCase());}for(var n=Y$2.length-1;n>=0;--n){var o=Y$2[n];if(o.test&&o.test(e,r))return new o(e,t)}throw new Error("Unrecognized source type to auto-detect Resource")}var q$2=function(e,t){return q$2=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(e,t){e.__proto__=t;}||function(e,t){for(var r in t)t.hasOwnProperty(r)&&(e[r]=t[r]);},q$2(e,t)};function Z$2(e,t){function r(){this.constructor=e;}q$2(e,t),e.prototype=null===t?Object.create(t):(r.prototype=t.prototype,new r);}var $$2=function(){return $$2=Object.assign||function(e){for(var t,r=arguments,i=1,n=arguments.length;i<n;i++)for(var o in t=r[i])Object.prototype.hasOwnProperty.call(t,o)&&(e[o]=t[o]);return e},$$2.apply(this,arguments)};var J$2=function(){function e(e,t){void 0===e&&(e=0),void 0===t&&(t=0),this._width=e,this._height=t,this.destroyed=!1,this.internal=!1,this.onResize=new t$1("setRealSize"),this.onUpdate=new t$1("update"),this.onError=new t$1("onError");}return e.prototype.bind=function(e){this.onResize.add(e),this.onUpdate.add(e),this.onError.add(e),(this._width||this._height)&&this.onResize.emit(this._width,this._height);},e.prototype.unbind=function(e){this.onResize.remove(e),this.onUpdate.remove(e),this.onError.remove(e);},e.prototype.resize=function(e,t){e===this._width&&t===this._height||(this._width=e,this._height=t,this.onResize.emit(e,t));},Object.defineProperty(e.prototype,"valid",{get:function(){return !!this._width&&!!this._height},enumerable:!1,configurable:!0}),e.prototype.update=function(){this.destroyed||this.onUpdate.emit();},e.prototype.load=function(){return Promise.resolve(this)},Object.defineProperty(e.prototype,"width",{get:function(){return this._width},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"height",{get:function(){return this._height},enumerable:!1,configurable:!0}),e.prototype.style=function(e,t,r){return !1},e.prototype.dispose=function(){},e.prototype.destroy=function(){this.destroyed||(this.destroyed=!0,this.dispose(),this.onError.removeAll(),this.onError=null,this.onResize.removeAll(),this.onResize=null,this.onUpdate.removeAll(),this.onUpdate=null);},e.test=function(e,t){return !1},e}(),Q$2=function(e){function t(t,r){var i=this,n=r||{},o=n.width,s=n.height;if(!o||!s)throw new Error("BufferResource width or height invalid");return (i=e.call(this,o,s)||this).data=t,i}return Z$2(t,e),t.prototype.upload=function(e,t,i){var n=e.gl;n.pixelStorei(n.UNPACK_PREMULTIPLY_ALPHA_WEBGL,t.alphaMode===D$4.UNPACK);var o=t.realWidth,s=t.realHeight;return i.width===o&&i.height===s?n.texSubImage2D(t.target,0,0,0,o,s,t.format,i.type,this.data):(i.width=o,i.height=s,n.texImage2D(t.target,0,i.internalFormat,o,s,0,t.format,i.type,this.data)),!0},t.prototype.dispose=function(){this.data=null;},t.test=function(e){return e instanceof Float32Array||e instanceof Uint8Array||e instanceof Uint32Array},t}(J$2),ee={scaleMode:U$5.NEAREST,format:I$7.RGBA,alphaMode:D$4.NPM},te=function(t){function i(i,a){void 0===i&&(i=null),void 0===a&&(a=null);var u=t.call(this)||this,h=(a=a||{}).alphaMode,l=a.mipmap,f=a.anisotropicLevel,d=a.scaleMode,c=a.width,p=a.height,v=a.wrapMode,m=a.format,g=a.type,y=a.target,_=a.resolution,b=a.resourceOptions;return !i||i instanceof J$2||((i=K$2(i,b)).internal=!0),u.resolution=_||V$2.RESOLUTION,u.width=Math.round((c||0)*u.resolution)/u.resolution,u.height=Math.round((p||0)*u.resolution)/u.resolution,u._mipmap=void 0!==l?l:V$2.MIPMAP_TEXTURES,u.anisotropicLevel=void 0!==f?f:V$2.ANISOTROPIC_LEVEL,u._wrapMode=v||V$2.WRAP_MODE,u._scaleMode=void 0!==d?d:V$2.SCALE_MODE,u.format=m||I$7.RGBA,u.type=g||L$5.UNSIGNED_BYTE,u.target=y||A$6.TEXTURE_2D,u.alphaMode=void 0!==h?h:D$4.UNPACK,u.uid=T$7(),u.touched=0,u.isPowerOfTwo=!1,u._refreshPOT(),u._glTextures={},u.dirtyId=0,u.dirtyStyleId=0,u.cacheId=null,u.valid=c>0&&p>0,u.textureCacheIds=[],u.destroyed=!1,u.resource=null,u._batchEnabled=0,u._batchLocation=0,u.parentTextureArray=null,u.setResource(i),u}return Z$2(i,t),Object.defineProperty(i.prototype,"realWidth",{get:function(){return Math.round(this.width*this.resolution)},enumerable:!1,configurable:!0}),Object.defineProperty(i.prototype,"realHeight",{get:function(){return Math.round(this.height*this.resolution)},enumerable:!1,configurable:!0}),Object.defineProperty(i.prototype,"mipmap",{get:function(){return this._mipmap},set:function(e){this._mipmap!==e&&(this._mipmap=e,this.dirtyStyleId++);},enumerable:!1,configurable:!0}),Object.defineProperty(i.prototype,"scaleMode",{get:function(){return this._scaleMode},set:function(e){this._scaleMode!==e&&(this._scaleMode=e,this.dirtyStyleId++);},enumerable:!1,configurable:!0}),Object.defineProperty(i.prototype,"wrapMode",{get:function(){return this._wrapMode},set:function(e){this._wrapMode!==e&&(this._wrapMode=e,this.dirtyStyleId++);},enumerable:!1,configurable:!0}),i.prototype.setStyle=function(e,t){var r;return void 0!==e&&e!==this.scaleMode&&(this.scaleMode=e,r=!0),void 0!==t&&t!==this.mipmap&&(this.mipmap=t,r=!0),r&&this.dirtyStyleId++,this},i.prototype.setSize=function(e,t,r){return r=r||this.resolution,this.setRealSize(e*r,t*r,r)},i.prototype.setRealSize=function(e,t,r){return this.resolution=r||this.resolution,this.width=Math.round(e)/this.resolution,this.height=Math.round(t)/this.resolution,this._refreshPOT(),this.update(),this},i.prototype._refreshPOT=function(){this.isPowerOfTwo=C$6(this.realWidth)&&C$6(this.realHeight);},i.prototype.setResolution=function(e){var t=this.resolution;return t===e||(this.resolution=e,this.valid&&(this.width=Math.round(this.width*t)/e,this.height=Math.round(this.height*t)/e,this.emit("update",this)),this._refreshPOT()),this},i.prototype.setResource=function(e){if(this.resource===e)return this;if(this.resource)throw new Error("Resource can be set only once");return e.bind(this),this.resource=e,this},i.prototype.update=function(){this.valid?(this.dirtyId++,this.dirtyStyleId++,this.emit("update",this)):this.width>0&&this.height>0&&(this.valid=!0,this.emit("loaded",this),this.emit("update",this));},i.prototype.onError=function(e){this.emit("error",this,e);},i.prototype.destroy=function(){this.resource&&(this.resource.unbind(this),this.resource.internal&&this.resource.destroy(),this.resource=null),this.cacheId&&(delete I$6[this.cacheId],delete F$3[this.cacheId],this.cacheId=null),this.dispose(),i.removeFromCache(this),this.textureCacheIds=null,this.destroyed=!0;},i.prototype.dispose=function(){this.emit("dispose",this);},i.prototype.castToBaseTexture=function(){return this},i.from=function(t,r,n){void 0===n&&(n=V$2.STRICT_TEXTURE_CACHE);var o="string"==typeof t,s=null;if(o)s=t;else {if(!t._pixiId){var a=r&&r.pixiIdPrefix||"pixiid";t._pixiId=a+"_"+T$7();}s=t._pixiId;}var u=I$6[s];if(o&&n&&!u)throw new Error('The cacheId "'+s+'" does not exist in BaseTextureCache.');return u||((u=new i(t,r)).cacheId=s,i.addToCache(u,s)),u},i.fromBuffer=function(e,t,r,n){e=e||new Float32Array(t*r*4);var s=new Q$2(e,{width:t,height:r}),a=e instanceof Float32Array?L$5.FLOAT:L$5.UNSIGNED_BYTE;return new i(s,Object.assign(ee,n||{width:t,height:r,type:a}))},i.addToCache=function(e,t){t&&(-1===e.textureCacheIds.indexOf(t)&&e.textureCacheIds.push(t),I$6[t]&&console.warn("BaseTexture added to the cache with an id ["+t+"] that already had an entry"),I$6[t]=e);},i.removeFromCache=function(e){if("string"==typeof e){var t=I$6[e];if(t){var r=t.textureCacheIds.indexOf(e);return r>-1&&t.textureCacheIds.splice(r,1),delete I$6[e],t}}else if(e&&e.textureCacheIds){for(var i=0;i<e.textureCacheIds.length;++i)delete I$6[e.textureCacheIds[i]];return e.textureCacheIds.length=0,e}return null},i._globalBatch=0,i}(r$5),re=function(e){function t(t,r){var i=this,n=r||{},o=n.width,s=n.height;(i=e.call(this,o,s)||this).items=[],i.itemDirtyIds=[];for(var a=0;a<t;a++){var u=new te;i.items.push(u),i.itemDirtyIds.push(-2);}return i.length=t,i._load=null,i.baseTexture=null,i}return Z$2(t,e),t.prototype.initFromArray=function(e,t){for(var r=0;r<this.length;r++)e[r]&&(e[r].castToBaseTexture?this.addBaseTextureAt(e[r].castToBaseTexture(),r):e[r]instanceof J$2?this.addResourceAt(e[r],r):this.addResourceAt(K$2(e[r],t),r));},t.prototype.dispose=function(){for(var e=0,t=this.length;e<t;e++)this.items[e].destroy();this.items=null,this.itemDirtyIds=null,this._load=null;},t.prototype.addResourceAt=function(e,t){if(!this.items[t])throw new Error("Index "+t+" is out of bounds");return e.valid&&!this.valid&&this.resize(e.width,e.height),this.items[t].setResource(e),this},t.prototype.bind=function(t){if(null!==this.baseTexture)throw new Error("Only one base texture per TextureArray is allowed");e.prototype.bind.call(this,t);for(var r=0;r<this.length;r++)this.items[r].parentTextureArray=t,this.items[r].on("update",t.update,t);},t.prototype.unbind=function(t){e.prototype.unbind.call(this,t);for(var r=0;r<this.length;r++)this.items[r].parentTextureArray=null,this.items[r].off("update",t.update,t);},t.prototype.load=function(){var e=this;if(this._load)return this._load;var t=this.items.map((function(e){return e.resource})).filter((function(e){return e})).map((function(e){return e.load()}));return this._load=Promise.all(t).then((function(){var t=e.items[0],r=t.realWidth,i=t.realHeight;return e.resize(r,i),Promise.resolve(e)})),this._load},t}(J$2),ie=function(e){function t(t,r){var i,n,o=this,s=r||{},a=s.width,u=s.height;return Array.isArray(t)?(i=t,n=t.length):n=t,o=e.call(this,n,{width:a,height:u})||this,i&&o.initFromArray(i,r),o}return Z$2(t,e),t.prototype.addBaseTextureAt=function(e,t){if(!e.resource)throw new Error("ArrayResource does not support RenderTexture");return this.addResourceAt(e.resource,t),this},t.prototype.bind=function(t){e.prototype.bind.call(this,t),t.target=A$6.TEXTURE_2D_ARRAY;},t.prototype.upload=function(e,t,r){var i=this,n=i.length,o=i.itemDirtyIds,s=i.items,a=e.gl;r.dirtyId<0&&a.texImage3D(a.TEXTURE_2D_ARRAY,0,r.internalFormat,this._width,this._height,n,0,t.format,r.type,null);for(var u=0;u<n;u++){var h=s[u];o[u]<h.dirtyId&&(o[u]=h.dirtyId,h.valid&&a.texSubImage3D(a.TEXTURE_2D_ARRAY,0,0,0,u,h.resource.width,h.resource.height,1,t.format,r.type,h.resource.source));}return !0},t}(re),ne=function(e){function t(t){var r=this,i=t,n=i.naturalWidth||i.videoWidth||i.width,o=i.naturalHeight||i.videoHeight||i.height;return (r=e.call(this,n,o)||this).source=t,r.noSubImage=!1,r}return Z$2(t,e),t.crossOrigin=function(e,t,r){void 0===r&&0!==t.indexOf("data:")?e.crossOrigin=z$3(t):!1!==r&&(e.crossOrigin="string"==typeof r?r:"anonymous");},t.prototype.upload=function(e,t,i,n){var o=e.gl,s=t.realWidth,a=t.realHeight;if((n=n||this.source)instanceof HTMLImageElement){if(!n.complete||0===n.naturalWidth)return !1}else if(n instanceof HTMLVideoElement&&n.readyState<=1)return !1;return o.pixelStorei(o.UNPACK_PREMULTIPLY_ALPHA_WEBGL,t.alphaMode===D$4.UNPACK),this.noSubImage||t.target!==o.TEXTURE_2D||i.width!==s||i.height!==a?(i.width=s,i.height=a,o.texImage2D(t.target,0,i.internalFormat,t.format,i.type,n)):o.texSubImage2D(o.TEXTURE_2D,0,0,0,t.format,i.type,n),!0},t.prototype.update=function(){if(!this.destroyed){var t=this.source,r=t.naturalWidth||t.videoWidth||t.width,i=t.naturalHeight||t.videoHeight||t.height;this.resize(r,i),e.prototype.update.call(this);}},t.prototype.dispose=function(){this.source=null;},t}(J$2),oe=function(e){function t(t){return e.call(this,t)||this}return Z$2(t,e),t.test=function(e){var t=globalThis.OffscreenCanvas;return !!(t&&e instanceof t)||globalThis.HTMLCanvasElement&&e instanceof HTMLCanvasElement},t}(ne),se=function(e){function t(r,i){var n=this,o=i||{},a=o.width,u=o.height,h=o.autoLoad,l=o.linkBaseTexture;if(r&&r.length!==t.SIDES)throw new Error("Invalid length. Got "+r.length+", expected 6");n=e.call(this,6,{width:a,height:u})||this;for(var f=0;f<t.SIDES;f++)n.items[f].target=A$6.TEXTURE_CUBE_MAP_POSITIVE_X+f;return n.linkBaseTexture=!1!==l,r&&n.initFromArray(r,i),!1!==h&&n.load(),n}return Z$2(t,e),t.prototype.bind=function(t){e.prototype.bind.call(this,t),t.target=A$6.TEXTURE_CUBE_MAP;},t.prototype.addBaseTextureAt=function(e,t,r){if(!this.items[t])throw new Error("Index "+t+" is out of bounds");if(!this.linkBaseTexture||e.parentTextureArray||Object.keys(e._glTextures).length>0){if(!e.resource)throw new Error("CubeResource does not support copying of renderTexture.");this.addResourceAt(e.resource,t);}else e.target=A$6.TEXTURE_CUBE_MAP_POSITIVE_X+t,e.parentTextureArray=this.baseTexture,this.items[t]=e;return e.valid&&!this.valid&&this.resize(e.realWidth,e.realHeight),this.items[t]=e,this},t.prototype.upload=function(e,r,i){for(var n=this.itemDirtyIds,o=0;o<t.SIDES;o++){var s=this.items[o];(n[o]<s.dirtyId||i.dirtyId<r.dirtyId)&&(s.valid&&s.resource?(s.resource.upload(e,s,i),n[o]=s.dirtyId):n[o]<-1&&(e.gl.texImage2D(s.target,0,i.internalFormat,r.realWidth,r.realHeight,0,r.format,i.type,null),n[o]=-1));}return !0},t.test=function(e){return Array.isArray(e)&&e.length===t.SIDES},t.SIDES=6,t}(re),ae=function(t){function i(r,i){var n=this;if(i=i||{},!(r instanceof HTMLImageElement)){var o=new Image;ne.crossOrigin(o,r,i.crossorigin),o.src=r,r=o;}return n=t.call(this,r)||this,!r.complete&&n._width&&n._height&&(n._width=0,n._height=0),n.url=r.src,n._process=null,n.preserveBitmap=!1,n.createBitmap=(void 0!==i.createBitmap?i.createBitmap:V$2.CREATE_IMAGE_BITMAP)&&!!globalThis.createImageBitmap,n.alphaMode="number"==typeof i.alphaMode?i.alphaMode:null,n.bitmap=null,n._load=null,!1!==i.autoLoad&&n.load(),n}return Z$2(i,t),i.prototype.load=function(e){var t=this;return this._load||(void 0!==e&&(this.createBitmap=e),this._load=new Promise((function(e,r){var i=t.source;t.url=i.src;var n=function(){t.destroyed||(i.onload=null,i.onerror=null,t.resize(i.width,i.height),t._load=null,t.createBitmap?e(t.process()):e(t));};i.complete&&i.src?n():(i.onload=n,i.onerror=function(e){r(e),t.onError.emit(e);});}))),this._load},i.prototype.process=function(){var e=this,t=this.source;if(null!==this._process)return this._process;if(null!==this.bitmap||!globalThis.createImageBitmap)return Promise.resolve(this);var i=globalThis.createImageBitmap,n=!t.crossOrigin||"anonymous"===t.crossOrigin;return this._process=fetch(t.src,{mode:n?"cors":"no-cors"}).then((function(e){return e.blob()})).then((function(n){return i(n,0,0,t.width,t.height,{premultiplyAlpha:e.alphaMode===D$4.UNPACK?"premultiply":"none"})})).then((function(t){return e.destroyed?Promise.reject():(e.bitmap=t,e.update(),e._process=null,Promise.resolve(e))})),this._process},i.prototype.upload=function(e,r,i){if("number"==typeof this.alphaMode&&(r.alphaMode=this.alphaMode),!this.createBitmap)return t.prototype.upload.call(this,e,r,i);if(!this.bitmap&&(this.process(),!this.bitmap))return !1;if(t.prototype.upload.call(this,e,r,i,this.bitmap),!this.preserveBitmap){var n=!0,o=r._glTextures;for(var s in o){var a=o[s];if(a!==i&&a.dirtyId!==r.dirtyId){n=!1;break}}n&&(this.bitmap.close&&this.bitmap.close(),this.bitmap=null);}return !0},i.prototype.dispose=function(){this.source.onload=null,this.source.onerror=null,t.prototype.dispose.call(this),this.bitmap&&(this.bitmap.close(),this.bitmap=null),this._process=null,this._load=null;},i.test=function(e){return "string"==typeof e||e instanceof HTMLImageElement},i}(ne),ue=function(e){function t(t,r){var i=this;return r=r||{},(i=e.call(this,document.createElement("canvas"))||this)._width=0,i._height=0,i.svg=t,i.scale=r.scale||1,i._overrideWidth=r.width,i._overrideHeight=r.height,i._resolve=null,i._crossorigin=r.crossorigin,i._load=null,!1!==r.autoLoad&&i.load(),i}return Z$2(t,e),t.prototype.load=function(){var e=this;return this._load||(this._load=new Promise((function(r){if(e._resolve=function(){e.resize(e.source.width,e.source.height),r(e);},t.SVG_XML.test(e.svg.trim())){if(!btoa)throw new Error("Your browser doesn't support base64 conversions.");e.svg="data:image/svg+xml;base64,"+btoa(unescape(encodeURIComponent(e.svg)));}e._loadSvg();}))),this._load},t.prototype._loadSvg=function(){var e=this,t=new Image;ne.crossOrigin(t,this.svg,this._crossorigin),t.src=this.svg,t.onerror=function(r){e._resolve&&(t.onerror=null,e.onError.emit(r));},t.onload=function(){if(e._resolve){var r=t.width,i=t.height;if(!r||!i)throw new Error("The SVG image must have width and height defined (in pixels), canvas API needs them.");var n=r*e.scale,o=i*e.scale;(e._overrideWidth||e._overrideHeight)&&(n=e._overrideWidth||e._overrideHeight/i*r,o=e._overrideHeight||e._overrideWidth/r*i),n=Math.round(n),o=Math.round(o);var s=e.source;s.width=n,s.height=o,s._pixiId="canvas_"+T$7(),s.getContext("2d").drawImage(t,0,0,r,i,0,0,n,o),e._resolve(),e._resolve=null;}};},t.getSize=function(e){var r=t.SVG_SIZE.exec(e),i={};return r&&(i[r[1]]=Math.round(parseFloat(r[3])),i[r[5]]=Math.round(parseFloat(r[7]))),i},t.prototype.dispose=function(){e.prototype.dispose.call(this),this._resolve=null,this._crossorigin=null;},t.test=function(e,r){return "svg"===r||"string"==typeof e&&/^data:image\/svg\+xml(;(charset=utf8|utf8))?;base64/.test(e)||"string"==typeof e&&t.SVG_XML.test(e)},t.SVG_XML=/^(<\?xml[^?]+\?>)?\s*(<!--[^(-->)]*-->)?\s*\<svg/m,t.SVG_SIZE=/<svg[^>]*(?:\s(width|height)=('|")(\d*(?:\.\d+)?)(?:px)?('|"))[^>]*(?:\s(width|height)=('|")(\d*(?:\.\d+)?)(?:px)?('|"))[^>]*>/i,t}(ne),he=function(e){function t(r,i){var n=this;if(i=i||{},!(r instanceof HTMLVideoElement)){var o=document.createElement("video");o.setAttribute("preload","auto"),o.setAttribute("webkit-playsinline",""),o.setAttribute("playsinline",""),"string"==typeof r&&(r=[r]);var s=r[0].src||r[0];ne.crossOrigin(o,s,i.crossorigin);for(var a=0;a<r.length;++a){var u=document.createElement("source"),h=r[a],l=h.src,f=h.mime,d=(l=l||r[a]).split("?").shift().toLowerCase(),c=d.slice(d.lastIndexOf(".")+1);f=f||t.MIME_TYPES[c]||"video/"+c,u.src=l,u.type=f,o.appendChild(u);}r=o;}return (n=e.call(this,r)||this).noSubImage=!0,n._autoUpdate=!0,n._isConnectedToTicker=!1,n._updateFPS=i.updateFPS||0,n._msToNextUpdate=0,n.autoPlay=!1!==i.autoPlay,n._load=null,n._resolve=null,n._onCanPlay=n._onCanPlay.bind(n),n._onError=n._onError.bind(n),!1!==i.autoLoad&&n.load(),n}return Z$2(t,e),t.prototype.update=function(t){if(!this.destroyed){var r=n$7.shared.elapsedMS*this.source.playbackRate;this._msToNextUpdate=Math.floor(this._msToNextUpdate-r),(!this._updateFPS||this._msToNextUpdate<=0)&&(e.prototype.update.call(this),this._msToNextUpdate=this._updateFPS?Math.floor(1e3/this._updateFPS):0);}},t.prototype.load=function(){var e=this;if(this._load)return this._load;var t=this.source;return (t.readyState===t.HAVE_ENOUGH_DATA||t.readyState===t.HAVE_FUTURE_DATA)&&t.width&&t.height&&(t.complete=!0),t.addEventListener("play",this._onPlayStart.bind(this)),t.addEventListener("pause",this._onPlayStop.bind(this)),this._isSourceReady()?this._onCanPlay():(t.addEventListener("canplay",this._onCanPlay),t.addEventListener("canplaythrough",this._onCanPlay),t.addEventListener("error",this._onError,!0)),this._load=new Promise((function(r){e.valid?r(e):(e._resolve=r,t.load());})),this._load},t.prototype._onError=function(e){this.source.removeEventListener("error",this._onError,!0),this.onError.emit(e);},t.prototype._isSourcePlaying=function(){var e=this.source;return e.currentTime>0&&!1===e.paused&&!1===e.ended&&e.readyState>2},t.prototype._isSourceReady=function(){var e=this.source;return 3===e.readyState||4===e.readyState},t.prototype._onPlayStart=function(){this.valid||this._onCanPlay(),this.autoUpdate&&!this._isConnectedToTicker&&(n$7.shared.add(this.update,this),this._isConnectedToTicker=!0);},t.prototype._onPlayStop=function(){this._isConnectedToTicker&&(n$7.shared.remove(this.update,this),this._isConnectedToTicker=!1);},t.prototype._onCanPlay=function(){var e=this.source;e.removeEventListener("canplay",this._onCanPlay),e.removeEventListener("canplaythrough",this._onCanPlay);var t=this.valid;this.resize(e.videoWidth,e.videoHeight),!t&&this._resolve&&(this._resolve(this),this._resolve=null),this._isSourcePlaying()?this._onPlayStart():this.autoPlay&&e.play();},t.prototype.dispose=function(){this._isConnectedToTicker&&(n$7.shared.remove(this.update,this),this._isConnectedToTicker=!1);var t=this.source;t&&(t.removeEventListener("error",this._onError,!0),t.pause(),t.src="",t.load()),e.prototype.dispose.call(this);},Object.defineProperty(t.prototype,"autoUpdate",{get:function(){return this._autoUpdate},set:function(e){e!==this._autoUpdate&&(this._autoUpdate=e,!this._autoUpdate&&this._isConnectedToTicker?(n$7.shared.remove(this.update,this),this._isConnectedToTicker=!1):this._autoUpdate&&!this._isConnectedToTicker&&this._isSourcePlaying()&&(n$7.shared.add(this.update,this),this._isConnectedToTicker=!0));},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"updateFPS",{get:function(){return this._updateFPS},set:function(e){e!==this._updateFPS&&(this._updateFPS=e);},enumerable:!1,configurable:!0}),t.test=function(e,r){return globalThis.HTMLVideoElement&&e instanceof HTMLVideoElement||t.TYPES.indexOf(r)>-1},t.TYPES=["mp4","m4v","webm","ogg","ogv","h264","avi","mov"],t.MIME_TYPES={ogv:"video/ogg",mov:"video/quicktime",m4v:"video/mp4"},t}(ne),le=function(e){function t(t){return e.call(this,t)||this}return Z$2(t,e),t.test=function(e){return !!globalThis.createImageBitmap&&"undefined"!=typeof ImageBitmap&&e instanceof ImageBitmap},t}(ne);Y$2.push(ae,le,oe,he,ue,Q$2,se,ie);var de=function(e){function t(){return null!==e&&e.apply(this,arguments)||this}return Z$2(t,e),t.prototype.upload=function(e,t,i){var n=e.gl;n.pixelStorei(n.UNPACK_PREMULTIPLY_ALPHA_WEBGL,t.alphaMode===D$4.UNPACK);var o=t.realWidth,s=t.realHeight;return i.width===o&&i.height===s?n.texSubImage2D(t.target,0,0,0,o,s,t.format,i.type,this.data):(i.width=o,i.height=s,n.texImage2D(t.target,0,i.internalFormat,o,s,0,t.format,i.type,this.data)),!0},t}(Q$2),ce=function(){function e(e,t){this.width=Math.round(e||100),this.height=Math.round(t||100),this.stencil=!1,this.depth=!1,this.dirtyId=0,this.dirtyFormat=0,this.dirtySize=0,this.depthTexture=null,this.colorTextures=[],this.glFramebuffers={},this.disposeRunner=new t$1("disposeFramebuffer"),this.multisample=F$4.NONE;}return Object.defineProperty(e.prototype,"colorTexture",{get:function(){return this.colorTextures[0]},enumerable:!1,configurable:!0}),e.prototype.addColorTexture=function(e,t){return void 0===e&&(e=0),this.colorTextures[e]=t||new te(null,{scaleMode:U$5.NEAREST,resolution:1,mipmap:P$7.OFF,width:this.width,height:this.height}),this.dirtyId++,this.dirtyFormat++,this},e.prototype.addDepthTexture=function(e){return this.depthTexture=e||new te(new de(null,{width:this.width,height:this.height}),{scaleMode:U$5.NEAREST,resolution:1,width:this.width,height:this.height,mipmap:P$7.OFF,format:I$7.DEPTH_COMPONENT,type:L$5.UNSIGNED_SHORT}),this.dirtyId++,this.dirtyFormat++,this},e.prototype.enableDepth=function(){return this.depth=!0,this.dirtyId++,this.dirtyFormat++,this},e.prototype.enableStencil=function(){return this.stencil=!0,this.dirtyId++,this.dirtyFormat++,this},e.prototype.resize=function(e,t){if(e=Math.round(e),t=Math.round(t),e!==this.width||t!==this.height){this.width=e,this.height=t,this.dirtyId++,this.dirtySize++;for(var r=0;r<this.colorTextures.length;r++){var i=this.colorTextures[r],n=i.resolution;i.setSize(e/n,t/n);}if(this.depthTexture){n=this.depthTexture.resolution;this.depthTexture.setSize(e/n,t/n);}}},e.prototype.dispose=function(){this.disposeRunner.emit(this,!1);},e.prototype.destroyDepthTexture=function(){this.depthTexture&&(this.depthTexture.destroy(),this.depthTexture=null,++this.dirtyId,++this.dirtyFormat);},e}(),pe=function(e){function t(t){void 0===t&&(t={});var r=this;if("number"==typeof t){var i=arguments[0],n=arguments[1],o=arguments[2],s=arguments[3];t={width:i,height:n,scaleMode:o,resolution:s};}return t.width=t.width||100,t.height=t.height||100,t.multisample=void 0!==t.multisample?t.multisample:F$4.NONE,(r=e.call(this,null,t)||this).mipmap=P$7.OFF,r.valid=!0,r.clearColor=[0,0,0,0],r.framebuffer=new ce(r.realWidth,r.realHeight).addColorTexture(0,r),r.framebuffer.multisample=t.multisample,r.maskStack=[],r.filterStack=[{}],r}return Z$2(t,e),t.prototype.resize=function(e,t){this.framebuffer.resize(e*this.resolution,t*this.resolution),this.setRealSize(this.framebuffer.width,this.framebuffer.height);},t.prototype.dispose=function(){this.framebuffer.dispose(),e.prototype.dispose.call(this);},t.prototype.destroy=function(){e.prototype.destroy.call(this),this.framebuffer.destroyDepthTexture(),this.framebuffer=null;},t}(te),ve=function(){function e(){this.x0=0,this.y0=0,this.x1=1,this.y1=0,this.x2=1,this.y2=1,this.x3=0,this.y3=1,this.uvsFloat32=new Float32Array(8);}return e.prototype.set=function(e,t,r){var i=t.width,n=t.height;if(r){var o=e.width/2/i,s=e.height/2/n,a=e.x/i+o,u=e.y/n+s;r=_$8.add(r,_$8.NW),this.x0=a+o*_$8.uX(r),this.y0=u+s*_$8.uY(r),r=_$8.add(r,2),this.x1=a+o*_$8.uX(r),this.y1=u+s*_$8.uY(r),r=_$8.add(r,2),this.x2=a+o*_$8.uX(r),this.y2=u+s*_$8.uY(r),r=_$8.add(r,2),this.x3=a+o*_$8.uX(r),this.y3=u+s*_$8.uY(r);}else this.x0=e.x/i,this.y0=e.y/n,this.x1=(e.x+e.width)/i,this.y1=e.y/n,this.x2=(e.x+e.width)/i,this.y2=(e.y+e.height)/n,this.x3=e.x/i,this.y3=(e.y+e.height)/n;this.uvsFloat32[0]=this.x0,this.uvsFloat32[1]=this.y0,this.uvsFloat32[2]=this.x1,this.uvsFloat32[3]=this.y1,this.uvsFloat32[4]=this.x2,this.uvsFloat32[5]=this.y2,this.uvsFloat32[6]=this.x3,this.uvsFloat32[7]=this.y3;},e}(),me=new ve;function ge(e){e.destroy=function(){},e.on=function(){},e.once=function(){},e.emit=function(){};}var ye=function(t){function r(e,i,n,o,s,a){var u=t.call(this)||this;if(u.noFrame=!1,i||(u.noFrame=!0,i=new r$4(0,0,1,1)),e instanceof r&&(e=e.baseTexture),u.baseTexture=e,u._frame=i,u.trim=o,u.valid=!1,u._uvs=me,u.uvMatrix=null,u.orig=n||i,u._rotate=Number(s||0),!0===s)u._rotate=2;else if(u._rotate%2!=0)throw new Error("attempt to use diamond-shaped UVs. If you are sure, set rotation manually");return u.defaultAnchor=a?new o$9(a.x,a.y):new o$9(0,0),u._updateID=0,u.textureCacheIds=[],e.valid?u.noFrame?e.valid&&u.onBaseTextureUpdated(e):u.frame=i:e.once("loaded",u.onBaseTextureUpdated,u),u.noFrame&&e.on("update",u.onBaseTextureUpdated,u),u}return Z$2(r,t),r.prototype.update=function(){this.baseTexture.resource&&this.baseTexture.resource.update();},r.prototype.onBaseTextureUpdated=function(e){if(this.noFrame){if(!this.baseTexture.valid)return;this._frame.width=e.width,this._frame.height=e.height,this.valid=!0,this.updateUvs();}else this.frame=this._frame;this.emit("update",this);},r.prototype.destroy=function(e){if(this.baseTexture){if(e){var t=this.baseTexture.resource;t&&t.url&&F$3[t.url]&&r.removeFromCache(t.url),this.baseTexture.destroy();}this.baseTexture.off("loaded",this.onBaseTextureUpdated,this),this.baseTexture.off("update",this.onBaseTextureUpdated,this),this.baseTexture=null;}this._frame=null,this._uvs=null,this.trim=null,this.orig=null,this.valid=!1,r.removeFromCache(this),this.textureCacheIds=null;},r.prototype.clone=function(){var e=this._frame.clone(),t=this._frame===this.orig?e:this.orig.clone(),i=new r(this.baseTexture,!this.noFrame&&e,t,this.trim&&this.trim.clone(),this.rotate,this.defaultAnchor);return this.noFrame&&(i._frame=e),i},r.prototype.updateUvs=function(){this._uvs===me&&(this._uvs=new ve),this._uvs.set(this._frame,this.baseTexture,this.rotate),this._updateID++;},r.from=function(t,i,n){void 0===i&&(i={}),void 0===n&&(n=V$2.STRICT_TEXTURE_CACHE);var o="string"==typeof t,s=null;if(o)s=t;else if(t instanceof te){if(!t.cacheId){var a=i&&i.pixiIdPrefix||"pixiid";t.cacheId=a+"-"+T$7(),te.addToCache(t,t.cacheId);}s=t.cacheId;}else {if(!t._pixiId){a=i&&i.pixiIdPrefix||"pixiid";t._pixiId=a+"_"+T$7();}s=t._pixiId;}var u=F$3[s];if(o&&n&&!u)throw new Error('The cacheId "'+s+'" does not exist in TextureCache.');return u||t instanceof te?!u&&t instanceof te&&(u=new r(t),r.addToCache(u,s)):(i.resolution||(i.resolution=Y$3(t)),(u=new r(new te(t,i))).baseTexture.cacheId=s,te.addToCache(u.baseTexture,s),r.addToCache(u,s)),u},r.fromURL=function(e,t){var i=Object.assign({autoLoad:!1},null==t?void 0:t.resourceOptions),n=r.from(e,Object.assign({resourceOptions:i},t),!1),o=n.baseTexture.resource;return n.baseTexture.valid?Promise.resolve(n):o.load().then((function(){return Promise.resolve(n)}))},r.fromBuffer=function(e,t,i,n){return new r(te.fromBuffer(e,t,i,n))},r.fromLoader=function(t,i,n,o){var s=new te(t,Object.assign({scaleMode:V$2.SCALE_MODE,resolution:Y$3(i)},o)),a=s.resource;a instanceof ae&&(a.url=i);var u=new r(s);return n||(n=i),te.addToCache(u.baseTexture,n),r.addToCache(u,n),n!==i&&(te.addToCache(u.baseTexture,i),r.addToCache(u,i)),u.baseTexture.valid?Promise.resolve(u):new Promise((function(e){u.baseTexture.once("loaded",(function(){return e(u)}));}))},r.addToCache=function(e,t){t&&(-1===e.textureCacheIds.indexOf(t)&&e.textureCacheIds.push(t),F$3[t]&&console.warn("Texture added to the cache with an id ["+t+"] that already had an entry"),F$3[t]=e);},r.removeFromCache=function(e){if("string"==typeof e){var t=F$3[e];if(t){var r=t.textureCacheIds.indexOf(e);return r>-1&&t.textureCacheIds.splice(r,1),delete F$3[e],t}}else if(e&&e.textureCacheIds){for(var i=0;i<e.textureCacheIds.length;++i)F$3[e.textureCacheIds[i]]===e&&delete F$3[e.textureCacheIds[i]];return e.textureCacheIds.length=0,e}return null},Object.defineProperty(r.prototype,"resolution",{get:function(){return this.baseTexture.resolution},enumerable:!1,configurable:!0}),Object.defineProperty(r.prototype,"frame",{get:function(){return this._frame},set:function(e){this._frame=e,this.noFrame=!1;var t=e.x,r=e.y,i=e.width,n=e.height,o=t+i>this.baseTexture.width,s=r+n>this.baseTexture.height;if(o||s){var a=o&&s?"and":"or",u="X: "+t+" + "+i+" = "+(t+i)+" > "+this.baseTexture.width,h="Y: "+r+" + "+n+" = "+(r+n)+" > "+this.baseTexture.height;throw new Error("Texture Error: frame does not fit inside the base Texture dimensions: "+u+" "+a+" "+h)}this.valid=i&&n&&this.baseTexture.valid,this.trim||this.rotate||(this.orig=e),this.valid&&this.updateUvs();},enumerable:!1,configurable:!0}),Object.defineProperty(r.prototype,"rotate",{get:function(){return this._rotate},set:function(e){this._rotate=e,this.valid&&this.updateUvs();},enumerable:!1,configurable:!0}),Object.defineProperty(r.prototype,"width",{get:function(){return this.orig.width},enumerable:!1,configurable:!0}),Object.defineProperty(r.prototype,"height",{get:function(){return this.orig.height},enumerable:!1,configurable:!0}),r.prototype.castToBaseTexture=function(){return this.baseTexture},Object.defineProperty(r,"EMPTY",{get:function(){return r._EMPTY||(r._EMPTY=new r(new te),ge(r._EMPTY),ge(r._EMPTY.baseTexture)),r._EMPTY},enumerable:!1,configurable:!0}),Object.defineProperty(r,"WHITE",{get:function(){if(!r._WHITE){var t=V$2.ADAPTER.createCanvas(16,16),i=t.getContext("2d");t.width=16,t.height=16,i.fillStyle="white",i.fillRect(0,0,16,16),r._WHITE=new r(te.from(t)),ge(r._WHITE),ge(r._WHITE.baseTexture);}return r._WHITE},enumerable:!1,configurable:!0}),r}(r$5),_e=function(e){function t(t,r){var i=e.call(this,t,r)||this;return i.valid=!0,i.filterFrame=null,i.filterPoolKey=null,i.updateUvs(),i}return Z$2(t,e),Object.defineProperty(t.prototype,"framebuffer",{get:function(){return this.baseTexture.framebuffer},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"multisample",{get:function(){return this.framebuffer.multisample},set:function(e){this.framebuffer.multisample=e;},enumerable:!1,configurable:!0}),t.prototype.resize=function(e,t,r){void 0===r&&(r=!0);var i=this.baseTexture.resolution,n=Math.round(e*i)/i,o=Math.round(t*i)/i;this.valid=n>0&&o>0,this._frame.width=this.orig.width=n,this._frame.height=this.orig.height=o,r&&this.baseTexture.resize(n,o),this.updateUvs();},t.prototype.setResolution=function(e){var t=this.baseTexture;t.resolution!==e&&(t.setResolution(e),this.resize(t.width,t.height,!1));},t.create=function(e){for(var r=arguments,i=[],n=1;n<arguments.length;n++)i[n-1]=r[n];return "number"==typeof e&&(e={width:e,height:i[0],scaleMode:i[1],resolution:i[2]}),new t(new pe(e))},t}(ye),be=function(){function e(e){this.texturePool={},this.textureOptions=e||{},this.enableFullScreen=!1,this._pixelsWidth=0,this._pixelsHeight=0;}return e.prototype.createTexture=function(e,t,r){void 0===r&&(r=F$4.NONE);var i=new pe(Object.assign({width:e,height:t,resolution:1,multisample:r},this.textureOptions));return new _e(i)},e.prototype.getOptimalTexture=function(e,t,r,i){var n;void 0===r&&(r=1),void 0===i&&(i=F$4.NONE),e=Math.ceil(e*r-1e-6),t=Math.ceil(t*r-1e-6),this.enableFullScreen&&e===this._pixelsWidth&&t===this._pixelsHeight?n=i>1?-i:-1:(n=((65535&(e=R$4(e)))<<16|65535&(t=R$4(t)))>>>0,i>1&&(n+=4294967296*i)),this.texturePool[n]||(this.texturePool[n]=[]);var o=this.texturePool[n].pop();return o||(o=this.createTexture(e,t,i)),o.filterPoolKey=n,o.setResolution(r),o},e.prototype.getFilterTexture=function(e,t,r){var i=this.getOptimalTexture(e.width,e.height,t||e.resolution,r||F$4.NONE);return i.filterFrame=e.filterFrame,i},e.prototype.returnTexture=function(e){var t=e.filterPoolKey;e.filterFrame=null,this.texturePool[t].push(e);},e.prototype.returnFilterTexture=function(e){this.returnTexture(e);},e.prototype.clear=function(e){if(e=!1!==e)for(var t in this.texturePool){var r=this.texturePool[t];if(r)for(var i=0;i<r.length;i++)r[i].destroy(!0);}this.texturePool={};},e.prototype.setScreenSize=function(e){if(e.width!==this._pixelsWidth||e.height!==this._pixelsHeight){for(var t in this.enableFullScreen=e.width>0&&e.height>0,this.texturePool)if(Number(t)<0){var r=this.texturePool[t];if(r)for(var i=0;i<r.length;i++)r[i].destroy(!0);this.texturePool[t]=[];}this._pixelsWidth=e.width,this._pixelsHeight=e.height;}},e.SCREEN_KEY=-1,e}(),xe=function(){function e(e,t,r,i,n,s,a){void 0===t&&(t=0),void 0===r&&(r=!1),void 0===i&&(i=L$5.FLOAT),this.buffer=e,this.size=t,this.normalized=r,this.type=i,this.stride=n,this.start=s,this.instance=a;}return e.prototype.destroy=function(){this.buffer=null;},e.from=function(t,r,i,n,o){return new e(t,r,i,n,o)},e}(),Ee=0,Te=function(){function e(e,t,r){void 0===t&&(t=!0),void 0===r&&(r=!1),this.data=e||new Float32Array(1),this._glBuffers={},this._updateID=0,this.index=r,this.static=t,this.id=Ee++,this.disposeRunner=new t$1("disposeBuffer");}return e.prototype.update=function(e){e instanceof Array&&(e=new Float32Array(e)),this.data=e||this.data,this._updateID++;},e.prototype.dispose=function(){this.disposeRunner.emit(this,!1);},e.prototype.destroy=function(){this.dispose(),this.data=null;},Object.defineProperty(e.prototype,"index",{get:function(){return this.type===n$a.ELEMENT_ARRAY_BUFFER},set:function(e){this.type=e?n$a.ELEMENT_ARRAY_BUFFER:n$a.ARRAY_BUFFER;},enumerable:!1,configurable:!0}),e.from=function(t){return t instanceof Array&&(t=new Float32Array(t)),new e(t)},e}(),Re={Float32Array:Float32Array,Uint32Array:Uint32Array,Int32Array:Int32Array,Uint8Array:Uint8Array};var Se={5126:4,5123:2,5121:1},we=0,Ae={Float32Array:Float32Array,Uint32Array:Uint32Array,Int32Array:Int32Array,Uint8Array:Uint8Array,Uint16Array:Uint16Array},Ie=function(){function e(e,t){void 0===e&&(e=[]),void 0===t&&(t={}),this.buffers=e,this.indexBuffer=null,this.attributes=t,this.glVertexArrayObjects={},this.id=we++,this.instanced=!1,this.instanceCount=1,this.disposeRunner=new t$1("disposeGeometry"),this.refCount=0;}return e.prototype.addAttribute=function(e,t,r,i,n,o,s,a){if(void 0===r&&(r=0),void 0===i&&(i=!1),void 0===a&&(a=!1),!t)throw new Error("You must pass a buffer when creating an attribute");t instanceof Te||(t instanceof Array&&(t=new Float32Array(t)),t=new Te(t));var u=e.split("|");if(u.length>1){for(var h=0;h<u.length;h++)this.addAttribute(u[h],t,r,i,n);return this}var l=this.buffers.indexOf(t);return -1===l&&(this.buffers.push(t),l=this.buffers.length-1),this.attributes[e]=new xe(l,r,i,n,o,s,a),this.instanced=this.instanced||a,this},e.prototype.getAttribute=function(e){return this.attributes[e]},e.prototype.getBuffer=function(e){return this.buffers[this.getAttribute(e).buffer]},e.prototype.addIndex=function(e){return e instanceof Te||(e instanceof Array&&(e=new Uint16Array(e)),e=new Te(e)),e.type=n$a.ELEMENT_ARRAY_BUFFER,this.indexBuffer=e,-1===this.buffers.indexOf(e)&&this.buffers.push(e),this},e.prototype.getIndex=function(){return this.indexBuffer},e.prototype.interleave=function(){if(1===this.buffers.length||2===this.buffers.length&&this.indexBuffer)return this;var e,t=[],r=[],i=new Te;for(e in this.attributes){var n=this.attributes[e],o=this.buffers[n.buffer];t.push(o.data),r.push(n.size*Se[n.type]/4),n.buffer=0;}for(i.data=function(e,t){for(var r=0,i=0,n={},o=0;o<e.length;o++)i+=t[o],r+=e[o].length;var s=new ArrayBuffer(4*r),a=null,u=0;for(o=0;o<e.length;o++){var h=t[o],l=e[o],f=k$4(l);n[f]||(n[f]=new Re[f](s)),a=n[f];for(var d=0;d<l.length;d++)a[(d/h|0)*i+u+d%h]=l[d];u+=h;}return new Float32Array(s)}(t,r),e=0;e<this.buffers.length;e++)this.buffers[e]!==this.indexBuffer&&this.buffers[e].destroy();return this.buffers=[i],this.indexBuffer&&this.buffers.push(this.indexBuffer),this},e.prototype.getSize=function(){for(var e in this.attributes){var t=this.attributes[e];return this.buffers[t.buffer].data.length/(t.stride/4||t.size)}return 0},e.prototype.dispose=function(){this.disposeRunner.emit(this,!1);},e.prototype.destroy=function(){this.dispose(),this.buffers=null,this.indexBuffer=null,this.attributes=null;},e.prototype.clone=function(){for(var t=new e,r=0;r<this.buffers.length;r++)t.buffers[r]=new Te(this.buffers[r].data.slice(0));for(var r in this.attributes){var i=this.attributes[r];t.attributes[r]=new xe(i.buffer,i.size,i.normalized,i.type,i.stride,i.start,i.instance);}return this.indexBuffer&&(t.indexBuffer=t.buffers[this.buffers.indexOf(this.indexBuffer)],t.indexBuffer.type=n$a.ELEMENT_ARRAY_BUFFER),t},e.merge=function(t){for(var r,i=new e,n=[],o=[],s=[],a=0;a<t.length;a++){r=t[a];for(var u=0;u<r.buffers.length;u++)o[u]=o[u]||0,o[u]+=r.buffers[u].data.length,s[u]=0;}for(a=0;a<r.buffers.length;a++)n[a]=new(Ae[k$4(r.buffers[a].data)])(o[a]),i.buffers[a]=new Te(n[a]);for(a=0;a<t.length;a++){r=t[a];for(u=0;u<r.buffers.length;u++)n[u].set(r.buffers[u].data,s[u]),s[u]+=r.buffers[u].data.length;}if(i.attributes=r.attributes,r.indexBuffer){i.indexBuffer=i.buffers[r.buffers.indexOf(r.indexBuffer)],i.indexBuffer.type=n$a.ELEMENT_ARRAY_BUFFER;var l=0,f=0,d=0,c=0;for(a=0;a<r.buffers.length;a++)if(r.buffers[a]!==r.indexBuffer){c=a;break}for(var a in r.attributes){var p=r.attributes[a];(0|p.buffer)===c&&(f+=p.size*Se[p.type]/4);}for(a=0;a<t.length;a++){var v=t[a].indexBuffer.data;for(u=0;u<v.length;u++)i.indexBuffer.data[u+d]+=l;l+=t[a].buffers[c].data.length/f,d+=v.length;}}return i},e}(),Ce=function(e){function t(){var t=e.call(this)||this;return t.addAttribute("aVertexPosition",new Float32Array([0,0,1,0,1,1,0,1])).addIndex([0,1,3,2]),t}return Z$2(t,e),t}(Ie),Fe=function(e){function t(){var t=e.call(this)||this;return t.vertices=new Float32Array([-1,-1,1,-1,1,1,-1,1]),t.uvs=new Float32Array([0,0,1,0,1,1,0,1]),t.vertexBuffer=new Te(t.vertices),t.uvBuffer=new Te(t.uvs),t.addAttribute("aVertexPosition",t.vertexBuffer).addAttribute("aTextureCoord",t.uvBuffer).addIndex([0,1,2,0,2,3]),t}return Z$2(t,e),t.prototype.map=function(e,t){var r=0,i=0;return this.uvs[0]=r,this.uvs[1]=i,this.uvs[2]=r+t.width/e.width,this.uvs[3]=i,this.uvs[4]=r+t.width/e.width,this.uvs[5]=i+t.height/e.height,this.uvs[6]=r,this.uvs[7]=i+t.height/e.height,r=t.x,i=t.y,this.vertices[0]=r,this.vertices[1]=i,this.vertices[2]=r+t.width,this.vertices[3]=i,this.vertices[4]=r+t.width,this.vertices[5]=i+t.height,this.vertices[6]=r,this.vertices[7]=i+t.height,this.invalidate(),this},t.prototype.invalidate=function(){return this.vertexBuffer._updateID++,this.uvBuffer._updateID++,this},t}(Ie),Ne=0,Oe=function(){function e(e,t,r){this.group=!0,this.syncUniforms={},this.dirtyId=0,this.id=Ne++,this.static=!!t,this.ubo=!!r,e instanceof Te?(this.buffer=e,this.buffer.type=n$a.UNIFORM_BUFFER,this.autoManage=!1,this.ubo=!0):(this.uniforms=e,this.ubo&&(this.buffer=new Te(new Float32Array(1)),this.buffer.type=n$a.UNIFORM_BUFFER,this.autoManage=!0));}return e.prototype.update=function(){this.dirtyId++,!this.autoManage&&this.buffer&&this.buffer.update();},e.prototype.add=function(t,r,i){if(this.ubo)throw new Error("[UniformGroup] uniform groups in ubo mode cannot be modified, or have uniform groups nested in them");this.uniforms[t]=new e(r,i);},e.from=function(t,r,i){return new e(t,r,i)},e.uboFrom=function(t,r){return new e(t,null==r||r,!0)},e}(),Me=function(){function e(){this.renderTexture=null,this.target=null,this.legacy=!1,this.resolution=1,this.multisample=F$4.NONE,this.sourceFrame=new r$4,this.destinationFrame=new r$4,this.bindingSourceFrame=new r$4,this.bindingDestinationFrame=new r$4,this.filters=[],this.transform=null;}return e.prototype.clear=function(){this.target=null,this.filters=null,this.renderTexture=null;},e}(),Pe=[new o$9,new o$9,new o$9,new o$9],Be=new p$7,Ue=function(){function e(e){this.renderer=e,this.defaultFilterStack=[{}],this.texturePool=new be,this.texturePool.setScreenSize(e.view),this.statePool=[],this.quad=new Ce,this.quadUv=new Fe,this.tempRect=new r$4,this.activeState={},this.globalUniforms=new Oe({outputFrame:new r$4,inputSize:new Float32Array(4),inputPixel:new Float32Array(4),inputClamp:new Float32Array(4),resolution:1,filterArea:new Float32Array(4),filterClamp:new Float32Array(4)},!0),this.forceClear=!1,this.useMaxPadding=!1;}return e.prototype.push=function(e,t){for(var r,i,n=this.renderer,o=this.defaultFilterStack,s=this.statePool.pop()||new Me,a=this.renderer.renderTexture,u=t[0].resolution,h=t[0].multisample,l=t[0].padding,f=t[0].autoFit,d=null===(r=t[0].legacy)||void 0===r||r,c=1;c<t.length;c++){var p=t[c];u=Math.min(u,p.resolution),h=Math.min(h,p.multisample),l=this.useMaxPadding?Math.max(l,p.padding):l+p.padding,f=f&&p.autoFit,d=d||null===(i=p.legacy)||void 0===i||i;}1===o.length&&(this.defaultFilterStack[0].renderTexture=a.current),o.push(s),s.resolution=u,s.multisample=h,s.legacy=d,s.target=e,s.sourceFrame.copyFrom(e.filterArea||e.getBounds(!0)),s.sourceFrame.pad(l);var v=this.tempRect.copyFrom(a.sourceFrame);n.projection.transform&&this.transformAABB(Be.copyFrom(n.projection.transform).invert(),v),f?(s.sourceFrame.fit(v),(s.sourceFrame.width<=0||s.sourceFrame.height<=0)&&(s.sourceFrame.width=0,s.sourceFrame.height=0)):s.sourceFrame.intersects(v)||(s.sourceFrame.width=0,s.sourceFrame.height=0),this.roundFrame(s.sourceFrame,a.current?a.current.resolution:n.resolution,a.sourceFrame,a.destinationFrame,n.projection.transform),s.renderTexture=this.getOptimalFilterTexture(s.sourceFrame.width,s.sourceFrame.height,u,h),s.filters=t,s.destinationFrame.width=s.renderTexture.width,s.destinationFrame.height=s.renderTexture.height;var m=this.tempRect;m.x=0,m.y=0,m.width=s.sourceFrame.width,m.height=s.sourceFrame.height,s.renderTexture.filterFrame=s.sourceFrame,s.bindingSourceFrame.copyFrom(a.sourceFrame),s.bindingDestinationFrame.copyFrom(a.destinationFrame),s.transform=n.projection.transform,n.projection.transform=null,a.bind(s.renderTexture,s.sourceFrame,m),n.framebuffer.clear(0,0,0,0);},e.prototype.pop=function(){var e=this.defaultFilterStack,t=e.pop(),r=t.filters;this.activeState=t;var i=this.globalUniforms.uniforms;i.outputFrame=t.sourceFrame,i.resolution=t.resolution;var n=i.inputSize,o=i.inputPixel,s=i.inputClamp;if(n[0]=t.destinationFrame.width,n[1]=t.destinationFrame.height,n[2]=1/n[0],n[3]=1/n[1],o[0]=Math.round(n[0]*t.resolution),o[1]=Math.round(n[1]*t.resolution),o[2]=1/o[0],o[3]=1/o[1],s[0]=.5*o[2],s[1]=.5*o[3],s[2]=t.sourceFrame.width*n[2]-.5*o[2],s[3]=t.sourceFrame.height*n[3]-.5*o[3],t.legacy){var a=i.filterArea;a[0]=t.destinationFrame.width,a[1]=t.destinationFrame.height,a[2]=t.sourceFrame.x,a[3]=t.sourceFrame.y,i.filterClamp=i.inputClamp;}this.globalUniforms.update();var u=e[e.length-1];if(this.renderer.framebuffer.blit(),1===r.length)r[0].apply(this,t.renderTexture,u.renderTexture,G$1.BLEND,t),this.returnFilterTexture(t.renderTexture);else {var h=t.renderTexture,f=this.getOptimalFilterTexture(h.width,h.height,t.resolution);f.filterFrame=h.filterFrame;var d=0;for(d=0;d<r.length-1;++d){1===d&&t.multisample>1&&((f=this.getOptimalFilterTexture(h.width,h.height,t.resolution)).filterFrame=h.filterFrame),r[d].apply(this,h,f,G$1.CLEAR,t);var c=h;h=f,f=c;}r[d].apply(this,h,u.renderTexture,G$1.BLEND,t),d>1&&t.multisample>1&&this.returnFilterTexture(t.renderTexture),this.returnFilterTexture(h),this.returnFilterTexture(f);}t.clear(),this.statePool.push(t);},e.prototype.bindAndClear=function(e,t){void 0===t&&(t=G$1.CLEAR);var r=this.renderer,i=r.renderTexture,n=r.state;if(e===this.defaultFilterStack[this.defaultFilterStack.length-1].renderTexture?this.renderer.projection.transform=this.activeState.transform:this.renderer.projection.transform=null,e&&e.filterFrame){var o=this.tempRect;o.x=0,o.y=0,o.width=e.filterFrame.width,o.height=e.filterFrame.height,i.bind(e,e.filterFrame,o);}else e!==this.defaultFilterStack[this.defaultFilterStack.length-1].renderTexture?i.bind(e):this.renderer.renderTexture.bind(e,this.activeState.bindingSourceFrame,this.activeState.bindingDestinationFrame);var s=1&n.stateId||this.forceClear;(t===G$1.CLEAR||t===G$1.BLIT&&s)&&this.renderer.framebuffer.clear(0,0,0,0);},e.prototype.applyFilter=function(e,t,r,i){var n=this.renderer;n.state.set(e.state),this.bindAndClear(r,i),e.uniforms.uSampler=t,e.uniforms.filterGlobals=this.globalUniforms,n.shader.bind(e),e.legacy=!!e.program.attributeData.aTextureCoord,e.legacy?(this.quadUv.map(t._frame,t.filterFrame),n.geometry.bind(this.quadUv),n.geometry.draw(R$5.TRIANGLES)):(n.geometry.bind(this.quad),n.geometry.draw(R$5.TRIANGLE_STRIP));},e.prototype.calculateSpriteMatrix=function(e,t){var r=this.activeState,i=r.sourceFrame,n=r.destinationFrame,o=t._texture.orig,s=e.set(n.width,0,0,n.height,i.x,i.y),a=t.worldTransform.copyTo(p$7.TEMP_MATRIX);return a.invert(),s.prepend(a),s.scale(1/o.width,1/o.height),s.translate(t.anchor.x,t.anchor.y),s},e.prototype.destroy=function(){this.renderer=null,this.texturePool.clear(!1);},e.prototype.getOptimalFilterTexture=function(e,t,r,i){return void 0===r&&(r=1),void 0===i&&(i=F$4.NONE),this.texturePool.getOptimalTexture(e,t,r,i)},e.prototype.getFilterTexture=function(e,t,r){if("number"==typeof e){var i=e;e=t,t=i;}e=e||this.activeState.renderTexture;var n=this.texturePool.getOptimalTexture(e.width,e.height,t||e.resolution,r||F$4.NONE);return n.filterFrame=e.filterFrame,n},e.prototype.returnFilterTexture=function(e){this.texturePool.returnTexture(e);},e.prototype.emptyPool=function(){this.texturePool.clear(!0);},e.prototype.resize=function(){this.texturePool.setScreenSize(this.renderer.view);},e.prototype.transformAABB=function(e,t){var r=Pe[0],i=Pe[1],n=Pe[2],o=Pe[3];r.set(t.left,t.top),i.set(t.left,t.bottom),n.set(t.right,t.top),o.set(t.right,t.bottom),e.apply(r,r),e.apply(i,i),e.apply(n,n),e.apply(o,o);var s=Math.min(r.x,i.x,n.x,o.x),a=Math.min(r.y,i.y,n.y,o.y),u=Math.max(r.x,i.x,n.x,o.x),h=Math.max(r.y,i.y,n.y,o.y);t.x=s,t.y=a,t.width=u-s,t.height=h-a;},e.prototype.roundFrame=function(e,t,r,i,n){if(!(e.width<=0||e.height<=0||r.width<=0||r.height<=0)){if(n){var o=n.a,s=n.b,a=n.c,u=n.d;if((Math.abs(s)>1e-4||Math.abs(a)>1e-4)&&(Math.abs(o)>1e-4||Math.abs(u)>1e-4))return}(n=n?Be.copyFrom(n):Be.identity()).translate(-r.x,-r.y).scale(i.width/r.width,i.height/r.height).translate(i.x,i.y),this.transformAABB(n,e),e.ceil(t),this.transformAABB(n.invert(),e);}},e}(),Le=function(){function e(e){this.renderer=e;}return e.prototype.flush=function(){},e.prototype.destroy=function(){this.renderer=null;},e.prototype.start=function(){},e.prototype.stop=function(){this.flush();},e.prototype.render=function(e){},e}(),De=function(){function e(e){this.renderer=e,this.emptyRenderer=new Le(e),this.currentRenderer=this.emptyRenderer;}return e.prototype.setObjectRenderer=function(e){this.currentRenderer!==e&&(this.currentRenderer.stop(),this.currentRenderer=e,this.currentRenderer.start());},e.prototype.flush=function(){this.setObjectRenderer(this.emptyRenderer);},e.prototype.reset=function(){this.setObjectRenderer(this.emptyRenderer);},e.prototype.copyBoundTextures=function(e,t){for(var r=this.renderer.texture.boundTextures,i=t-1;i>=0;--i)e[i]=r[i]||null,e[i]&&(e[i]._batchLocation=i);},e.prototype.boundArray=function(e,t,r,i){for(var n=e.elements,o=e.ids,s=e.count,a=0,u=0;u<s;u++){var h=n[u],l=h._batchLocation;if(l>=0&&l<i&&t[l]===h)o[u]=l;else for(;a<i;){var f=t[a];if(!f||f._batchEnabled!==r||f._batchLocation!==a){o[u]=a,h._batchLocation=a,t[a]=h;break}a++;}}},e.prototype.destroy=function(){this.renderer=null;},e}(),Ge=0,ke=function(){function r(e){this.renderer=e,this.webGLVersion=1,this.extensions={},this.supports={uint32Indices:!1},this.handleContextLost=this.handleContextLost.bind(this),this.handleContextRestored=this.handleContextRestored.bind(this),e.view.addEventListener("webglcontextlost",this.handleContextLost,!1),e.view.addEventListener("webglcontextrestored",this.handleContextRestored,!1);}return Object.defineProperty(r.prototype,"isLost",{get:function(){return !this.gl||this.gl.isContextLost()},enumerable:!1,configurable:!0}),r.prototype.contextChange=function(e){this.gl=e,this.renderer.gl=e,this.renderer.CONTEXT_UID=Ge++,e.isContextLost()&&e.getExtension("WEBGL_lose_context")&&e.getExtension("WEBGL_lose_context").restoreContext();},r.prototype.initFromContext=function(e){this.gl=e,this.validateContext(e),this.renderer.gl=e,this.renderer.CONTEXT_UID=Ge++,this.renderer.runners.contextChange.emit(e);},r.prototype.initFromOptions=function(e){var t=this.createContext(this.renderer.view,e);this.initFromContext(t);},r.prototype.createContext=function(r,i){var n;if(V$2.PREFER_ENV>=E$6.WEBGL2&&(n=r.getContext("webgl2",i)),n)this.webGLVersion=2;else if(this.webGLVersion=1,!(n=r.getContext("webgl",i)||r.getContext("experimental-webgl",i)))throw new Error("This browser does not support WebGL. Try using the canvas renderer");return this.gl=n,this.getExtensions(),this.gl},r.prototype.getExtensions=function(){var e=this.gl,t={anisotropicFiltering:e.getExtension("EXT_texture_filter_anisotropic"),floatTextureLinear:e.getExtension("OES_texture_float_linear"),s3tc:e.getExtension("WEBGL_compressed_texture_s3tc"),s3tc_sRGB:e.getExtension("WEBGL_compressed_texture_s3tc_srgb"),etc:e.getExtension("WEBGL_compressed_texture_etc"),etc1:e.getExtension("WEBGL_compressed_texture_etc1"),pvrtc:e.getExtension("WEBGL_compressed_texture_pvrtc")||e.getExtension("WEBKIT_WEBGL_compressed_texture_pvrtc"),atc:e.getExtension("WEBGL_compressed_texture_atc"),astc:e.getExtension("WEBGL_compressed_texture_astc")};1===this.webGLVersion?Object.assign(this.extensions,t,{drawBuffers:e.getExtension("WEBGL_draw_buffers"),depthTexture:e.getExtension("WEBGL_depth_texture"),loseContext:e.getExtension("WEBGL_lose_context"),vertexArrayObject:e.getExtension("OES_vertex_array_object")||e.getExtension("MOZ_OES_vertex_array_object")||e.getExtension("WEBKIT_OES_vertex_array_object"),uint32ElementIndex:e.getExtension("OES_element_index_uint"),floatTexture:e.getExtension("OES_texture_float"),floatTextureLinear:e.getExtension("OES_texture_float_linear"),textureHalfFloat:e.getExtension("OES_texture_half_float"),textureHalfFloatLinear:e.getExtension("OES_texture_half_float_linear")}):2===this.webGLVersion&&Object.assign(this.extensions,t,{colorBufferFloat:e.getExtension("EXT_color_buffer_float")});},r.prototype.handleContextLost=function(e){e.preventDefault();},r.prototype.handleContextRestored=function(){this.renderer.runners.contextChange.emit(this.gl);},r.prototype.destroy=function(){var e=this.renderer.view;this.renderer=null,e.removeEventListener("webglcontextlost",this.handleContextLost),e.removeEventListener("webglcontextrestored",this.handleContextRestored),this.gl.useProgram(null),this.extensions.loseContext&&this.extensions.loseContext.loseContext();},r.prototype.postrender=function(){this.renderer.renderingToScreen&&this.gl.flush();},r.prototype.validateContext=function(e){var t=e.getContextAttributes(),r="WebGL2RenderingContext"in globalThis&&e instanceof globalThis.WebGL2RenderingContext;r&&(this.webGLVersion=2),t&&!t.stencil&&console.warn("Provided WebGL context does not have a stencil buffer, masks may not render correctly");var i=r||!!e.getExtension("OES_element_index_uint");this.supports.uint32Indices=i,i||console.warn("Provided WebGL context does not support 32 index buffer, complex graphics may not render correctly");},r}(),Ve=function(e){this.framebuffer=e,this.stencil=null,this.dirtyId=-1,this.dirtyFormat=-1,this.dirtySize=-1,this.multisample=F$4.NONE,this.msaaBuffer=null,this.blitFramebuffer=null,this.mipLevel=0;},He=new r$4,je=function(){function r(e){this.renderer=e,this.managedFramebuffers=[],this.unknownFramebuffer=new ce(10,10),this.msaaSamples=null;}return r.prototype.contextChange=function(){var r=this.gl=this.renderer.gl;if(this.CONTEXT_UID=this.renderer.CONTEXT_UID,this.current=this.unknownFramebuffer,this.viewport=new r$4,this.hasMRT=!0,this.writeDepthTexture=!0,this.disposeAll(!0),1===this.renderer.context.webGLVersion){var i=this.renderer.context.extensions.drawBuffers,n=this.renderer.context.extensions.depthTexture;V$2.PREFER_ENV===E$6.WEBGL_LEGACY&&(i=null,n=null),i?r.drawBuffers=function(e){return i.drawBuffersWEBGL(e)}:(this.hasMRT=!1,r.drawBuffers=function(){}),n||(this.writeDepthTexture=!1);}else this.msaaSamples=r.getInternalformatParameter(r.RENDERBUFFER,r.RGBA8,r.SAMPLES);},r.prototype.bind=function(e,t,r){void 0===r&&(r=0);var i=this.gl;if(e){var n=e.glFramebuffers[this.CONTEXT_UID]||this.initFramebuffer(e);this.current!==e&&(this.current=e,i.bindFramebuffer(i.FRAMEBUFFER,n.framebuffer)),n.mipLevel!==r&&(e.dirtyId++,e.dirtyFormat++,n.mipLevel=r),n.dirtyId!==e.dirtyId&&(n.dirtyId=e.dirtyId,n.dirtyFormat!==e.dirtyFormat?(n.dirtyFormat=e.dirtyFormat,n.dirtySize=e.dirtySize,this.updateFramebuffer(e,r)):n.dirtySize!==e.dirtySize&&(n.dirtySize=e.dirtySize,this.resizeFramebuffer(e)));for(var o=0;o<e.colorTextures.length;o++){var s=e.colorTextures[o];this.renderer.texture.unbind(s.parentTextureArray||s);}if(e.depthTexture&&this.renderer.texture.unbind(e.depthTexture),t){var a=t.width>>r,u=t.height>>r,h=a/t.width;this.setViewport(t.x*h,t.y*h,a,u);}else {a=e.width>>r,u=e.height>>r;this.setViewport(0,0,a,u);}}else this.current&&(this.current=null,i.bindFramebuffer(i.FRAMEBUFFER,null)),t?this.setViewport(t.x,t.y,t.width,t.height):this.setViewport(0,0,this.renderer.width,this.renderer.height);},r.prototype.setViewport=function(e,t,r,i){var n=this.viewport;e=Math.round(e),t=Math.round(t),r=Math.round(r),i=Math.round(i),n.width===r&&n.height===i&&n.x===e&&n.y===t||(n.x=e,n.y=t,n.width=r,n.height=i,this.gl.viewport(e,t,r,i));},Object.defineProperty(r.prototype,"size",{get:function(){return this.current?{x:0,y:0,width:this.current.width,height:this.current.height}:{x:0,y:0,width:this.renderer.width,height:this.renderer.height}},enumerable:!1,configurable:!0}),r.prototype.clear=function(e,t,r,i,n){void 0===n&&(n=N$7.COLOR|N$7.DEPTH);var o=this.gl;o.clearColor(e,t,r,i),o.clear(n);},r.prototype.initFramebuffer=function(e){var t=this.gl,r=new Ve(t.createFramebuffer());return r.multisample=this.detectSamples(e.multisample),e.glFramebuffers[this.CONTEXT_UID]=r,this.managedFramebuffers.push(e),e.disposeRunner.add(this),r},r.prototype.resizeFramebuffer=function(e){var t=this.gl,r=e.glFramebuffers[this.CONTEXT_UID];r.msaaBuffer&&(t.bindRenderbuffer(t.RENDERBUFFER,r.msaaBuffer),t.renderbufferStorageMultisample(t.RENDERBUFFER,r.multisample,t.RGBA8,e.width,e.height)),r.stencil&&(t.bindRenderbuffer(t.RENDERBUFFER,r.stencil),r.msaaBuffer?t.renderbufferStorageMultisample(t.RENDERBUFFER,r.multisample,t.DEPTH24_STENCIL8,e.width,e.height):t.renderbufferStorage(t.RENDERBUFFER,t.DEPTH_STENCIL,e.width,e.height));var i=e.colorTextures,n=i.length;t.drawBuffers||(n=Math.min(n,1));for(var o=0;o<n;o++){var s=i[o],a=s.parentTextureArray||s;this.renderer.texture.bind(a,0);}e.depthTexture&&this.writeDepthTexture&&this.renderer.texture.bind(e.depthTexture,0);},r.prototype.updateFramebuffer=function(e,t){var r=this.gl,i=e.glFramebuffers[this.CONTEXT_UID],n=e.colorTextures,o=n.length;r.drawBuffers||(o=Math.min(o,1)),i.multisample>1&&this.canMultisampleFramebuffer(e)?(i.msaaBuffer=i.msaaBuffer||r.createRenderbuffer(),r.bindRenderbuffer(r.RENDERBUFFER,i.msaaBuffer),r.renderbufferStorageMultisample(r.RENDERBUFFER,i.multisample,r.RGBA8,e.width,e.height),r.framebufferRenderbuffer(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.RENDERBUFFER,i.msaaBuffer)):i.msaaBuffer&&(r.deleteRenderbuffer(i.msaaBuffer),i.msaaBuffer=null,i.blitFramebuffer&&(i.blitFramebuffer.dispose(),i.blitFramebuffer=null));for(var s=[],a=0;a<o;a++){var u=n[a],h=u.parentTextureArray||u;this.renderer.texture.bind(h,0),0===a&&i.msaaBuffer||(r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0+a,u.target,h._glTextures[this.CONTEXT_UID].texture,t),s.push(r.COLOR_ATTACHMENT0+a));}if((s.length>1&&r.drawBuffers(s),e.depthTexture)&&this.writeDepthTexture){var l=e.depthTexture;this.renderer.texture.bind(l,0),r.framebufferTexture2D(r.FRAMEBUFFER,r.DEPTH_ATTACHMENT,r.TEXTURE_2D,l._glTextures[this.CONTEXT_UID].texture,t);}!e.stencil&&!e.depth||e.depthTexture&&this.writeDepthTexture?i.stencil&&(r.deleteRenderbuffer(i.stencil),i.stencil=null):(i.stencil=i.stencil||r.createRenderbuffer(),r.bindRenderbuffer(r.RENDERBUFFER,i.stencil),i.msaaBuffer?r.renderbufferStorageMultisample(r.RENDERBUFFER,i.multisample,r.DEPTH24_STENCIL8,e.width,e.height):r.renderbufferStorage(r.RENDERBUFFER,r.DEPTH_STENCIL,e.width,e.height),r.framebufferRenderbuffer(r.FRAMEBUFFER,r.DEPTH_STENCIL_ATTACHMENT,r.RENDERBUFFER,i.stencil));},r.prototype.canMultisampleFramebuffer=function(e){return 1!==this.renderer.context.webGLVersion&&e.colorTextures.length<=1&&!e.depthTexture},r.prototype.detectSamples=function(e){var t=this.msaaSamples,r=F$4.NONE;if(e<=1||null===t)return r;for(var i=0;i<t.length;i++)if(t[i]<=e){r=t[i];break}return 1===r&&(r=F$4.NONE),r},r.prototype.blit=function(e,t,r){var i=this,n=i.current,o=i.renderer,s=i.gl,a=i.CONTEXT_UID;if(2===o.context.webGLVersion&&n){var u=n.glFramebuffers[a];if(u){if(!e){if(!u.msaaBuffer)return;var h=n.colorTextures[0];if(!h)return;u.blitFramebuffer||(u.blitFramebuffer=new ce(n.width,n.height),u.blitFramebuffer.addColorTexture(0,h)),(e=u.blitFramebuffer).colorTextures[0]!==h&&(e.colorTextures[0]=h,e.dirtyId++,e.dirtyFormat++),e.width===n.width&&e.height===n.height||(e.width=n.width,e.height=n.height,e.dirtyId++,e.dirtySize++);}t||((t=He).width=n.width,t.height=n.height),r||(r=t);var l=t.width===r.width&&t.height===r.height;this.bind(e),s.bindFramebuffer(s.READ_FRAMEBUFFER,u.framebuffer),s.blitFramebuffer(t.left,t.top,t.right,t.bottom,r.left,r.top,r.right,r.bottom,s.COLOR_BUFFER_BIT,l?s.NEAREST:s.LINEAR);}}},r.prototype.disposeFramebuffer=function(e,t){var r=e.glFramebuffers[this.CONTEXT_UID],i=this.gl;if(r){delete e.glFramebuffers[this.CONTEXT_UID];var n=this.managedFramebuffers.indexOf(e);n>=0&&this.managedFramebuffers.splice(n,1),e.disposeRunner.remove(this),t||(i.deleteFramebuffer(r.framebuffer),r.msaaBuffer&&i.deleteRenderbuffer(r.msaaBuffer),r.stencil&&i.deleteRenderbuffer(r.stencil)),r.blitFramebuffer&&r.blitFramebuffer.dispose();}},r.prototype.disposeAll=function(e){var t=this.managedFramebuffers;this.managedFramebuffers=[];for(var r=0;r<t.length;r++)this.disposeFramebuffer(t[r],e);},r.prototype.forceStencil=function(){var e=this.current;if(e){var t=e.glFramebuffers[this.CONTEXT_UID];if(t&&!t.stencil){e.stencil=!0;var r=e.width,i=e.height,n=this.gl,o=n.createRenderbuffer();n.bindRenderbuffer(n.RENDERBUFFER,o),t.msaaBuffer?n.renderbufferStorageMultisample(n.RENDERBUFFER,t.multisample,n.DEPTH24_STENCIL8,r,i):n.renderbufferStorage(n.RENDERBUFFER,n.DEPTH_STENCIL,r,i),t.stencil=o,n.framebufferRenderbuffer(n.FRAMEBUFFER,n.DEPTH_STENCIL_ATTACHMENT,n.RENDERBUFFER,o);}}},r.prototype.reset=function(){this.current=this.unknownFramebuffer,this.viewport=new r$4;},r.prototype.destroy=function(){this.renderer=null;},r}(),ze={5126:4,5123:2,5121:1},Xe=function(){function r(e){this.renderer=e,this._activeGeometry=null,this._activeVao=null,this.hasVao=!0,this.hasInstance=!0,this.canUseUInt32ElementIndex=!1,this.managedGeometries={};}return r.prototype.contextChange=function(){this.disposeAll(!0);var r=this.gl=this.renderer.gl,i=this.renderer.context;if(this.CONTEXT_UID=this.renderer.CONTEXT_UID,2!==i.webGLVersion){var n=this.renderer.context.extensions.vertexArrayObject;V$2.PREFER_ENV===E$6.WEBGL_LEGACY&&(n=null),n?(r.createVertexArray=function(){return n.createVertexArrayOES()},r.bindVertexArray=function(e){return n.bindVertexArrayOES(e)},r.deleteVertexArray=function(e){return n.deleteVertexArrayOES(e)}):(this.hasVao=!1,r.createVertexArray=function(){return null},r.bindVertexArray=function(){return null},r.deleteVertexArray=function(){return null});}if(2!==i.webGLVersion){var o=r.getExtension("ANGLE_instanced_arrays");o?(r.vertexAttribDivisor=function(e,t){return o.vertexAttribDivisorANGLE(e,t)},r.drawElementsInstanced=function(e,t,r,i,n){return o.drawElementsInstancedANGLE(e,t,r,i,n)},r.drawArraysInstanced=function(e,t,r,i){return o.drawArraysInstancedANGLE(e,t,r,i)}):this.hasInstance=!1;}this.canUseUInt32ElementIndex=2===i.webGLVersion||!!i.extensions.uint32ElementIndex;},r.prototype.bind=function(e,t){t=t||this.renderer.shader.shader;var r=this.gl,i=e.glVertexArrayObjects[this.CONTEXT_UID],n=!1;i||(this.managedGeometries[e.id]=e,e.disposeRunner.add(this),e.glVertexArrayObjects[this.CONTEXT_UID]=i={},n=!0);var o=i[t.program.id]||this.initGeometryVao(e,t,n);this._activeGeometry=e,this._activeVao!==o&&(this._activeVao=o,this.hasVao?r.bindVertexArray(o):this.activateVao(e,t.program)),this.updateBuffers();},r.prototype.reset=function(){this.unbind();},r.prototype.updateBuffers=function(){for(var e=this._activeGeometry,t=this.renderer.buffer,r=0;r<e.buffers.length;r++){var i=e.buffers[r];t.update(i);}},r.prototype.checkCompatibility=function(e,t){var r=e.attributes,i=t.attributeData;for(var n in i)if(!r[n])throw new Error('shader and geometry incompatible, geometry missing the "'+n+'" attribute')},r.prototype.getSignature=function(e,t){var r=e.attributes,i=t.attributeData,n=["g",e.id];for(var o in r)i[o]&&n.push(o,i[o].location);return n.join("-")},r.prototype.initGeometryVao=function(e,t,r){void 0===r&&(r=!0);var i=this.gl,n=this.CONTEXT_UID,o=this.renderer.buffer,s=t.program;s.glPrograms[n]||this.renderer.shader.generateProgram(t),this.checkCompatibility(e,s);var a=this.getSignature(e,s),u=e.glVertexArrayObjects[this.CONTEXT_UID],h=u[a];if(h)return u[s.id]=h,h;var l=e.buffers,f=e.attributes,d={},c={};for(var p in l)d[p]=0,c[p]=0;for(var p in f)!f[p].size&&s.attributeData[p]?f[p].size=s.attributeData[p].size:f[p].size||console.warn("PIXI Geometry attribute '"+p+"' size cannot be determined (likely the bound shader does not have the attribute)"),d[f[p].buffer]+=f[p].size*ze[f[p].type];for(var p in f){var v=f[p],m=v.size;void 0===v.stride&&(d[v.buffer]===m*ze[v.type]?v.stride=0:v.stride=d[v.buffer]),void 0===v.start&&(v.start=c[v.buffer],c[v.buffer]+=m*ze[v.type]);}h=i.createVertexArray(),i.bindVertexArray(h);for(var g=0;g<l.length;g++){var y=l[g];o.bind(y),r&&y._glBuffers[n].refCount++;}return this.activateVao(e,s),this._activeVao=h,u[s.id]=h,u[a]=h,h},r.prototype.disposeGeometry=function(e,t){var r;if(this.managedGeometries[e.id]){delete this.managedGeometries[e.id];var i=e.glVertexArrayObjects[this.CONTEXT_UID],n=this.gl,o=e.buffers,s=null===(r=this.renderer)||void 0===r?void 0:r.buffer;if(e.disposeRunner.remove(this),i){if(s)for(var a=0;a<o.length;a++){var u=o[a]._glBuffers[this.CONTEXT_UID];u&&(u.refCount--,0!==u.refCount||t||s.dispose(o[a],t));}if(!t)for(var h in i)if("g"===h[0]){var l=i[h];this._activeVao===l&&this.unbind(),n.deleteVertexArray(l);}delete e.glVertexArrayObjects[this.CONTEXT_UID];}}},r.prototype.disposeAll=function(e){for(var t=Object.keys(this.managedGeometries),r=0;r<t.length;r++)this.disposeGeometry(this.managedGeometries[t[r]],e);},r.prototype.activateVao=function(e,t){var r=this.gl,i=this.CONTEXT_UID,n=this.renderer.buffer,o=e.buffers,s=e.attributes;e.indexBuffer&&n.bind(e.indexBuffer);var a=null;for(var u in s){var h=s[u],l=o[h.buffer],f=l._glBuffers[i];if(t.attributeData[u]){a!==f&&(n.bind(l),a=f);var d=t.attributeData[u].location;if(r.enableVertexAttribArray(d),r.vertexAttribPointer(d,h.size,h.type||r.FLOAT,h.normalized,h.stride,h.start),h.instance){if(!this.hasInstance)throw new Error("geometry error, GPU Instancing is not supported on this device");r.vertexAttribDivisor(d,1);}}}},r.prototype.draw=function(e,t,r,i){var n=this.gl,o=this._activeGeometry;if(o.indexBuffer){var s=o.indexBuffer.data.BYTES_PER_ELEMENT,a=2===s?n.UNSIGNED_SHORT:n.UNSIGNED_INT;2===s||4===s&&this.canUseUInt32ElementIndex?o.instanced?n.drawElementsInstanced(e,t||o.indexBuffer.data.length,a,(r||0)*s,i||1):n.drawElements(e,t||o.indexBuffer.data.length,a,(r||0)*s):console.warn("unsupported index buffer type: uint32");}else o.instanced?n.drawArraysInstanced(e,r,t||o.getSize(),i||1):n.drawArrays(e,r,t||o.getSize());return this},r.prototype.unbind=function(){this.gl.bindVertexArray(null),this._activeVao=null,this._activeGeometry=null;},r.prototype.destroy=function(){this.renderer=null;},r}(),We=function(){function t(t){void 0===t&&(t=null),this.type=B$3.NONE,this.autoDetect=!0,this.maskObject=t||null,this.pooled=!1,this.isMaskData=!0,this.resolution=null,this.multisample=V$2.FILTER_MULTISAMPLE,this.enabled=!0,this.colorMask=15,this._filters=null,this._stencilCounter=0,this._scissorCounter=0,this._scissorRect=null,this._scissorRectLocal=null,this._colorMask=15,this._target=null;}return Object.defineProperty(t.prototype,"filter",{get:function(){return this._filters?this._filters[0]:null},set:function(e){e?this._filters?this._filters[0]=e:this._filters=[e]:this._filters=null;},enumerable:!1,configurable:!0}),t.prototype.reset=function(){this.pooled&&(this.maskObject=null,this.type=B$3.NONE,this.autoDetect=!0),this._target=null,this._scissorRectLocal=null;},t.prototype.copyCountersOrReset=function(e){e?(this._stencilCounter=e._stencilCounter,this._scissorCounter=e._scissorCounter,this._scissorRect=e._scissorRect):(this._stencilCounter=0,this._scissorCounter=0,this._scissorRect=null);},t}();function Ye(e,t,r){var i=e.createShader(t);return e.shaderSource(i,r),e.compileShader(i),i}function Ke(e,t){var r=e.getShaderSource(t).split("\n").map((function(e,t){return t+": "+e})),i=e.getShaderInfoLog(t),n=i.split("\n"),o={},s=n.map((function(e){return parseFloat(e.replace(/^ERROR\: 0\:([\d]+)\:.*$/,"$1"))})).filter((function(e){return !(!e||o[e])&&(o[e]=!0,!0)})),a=[""];s.forEach((function(e){r[e-1]="%c"+r[e-1]+"%c",a.push("background: #FF0000; color:#FFFFFF; font-size: 10px","font-size: 10px");}));var u=r.join("\n");a[0]=u,console.error(i),console.groupCollapsed("click to view full shader code"),console.warn.apply(console,a),console.groupEnd();}function qe(e){for(var t=new Array(e),r=0;r<t.length;r++)t[r]=!1;return t}function Ze(e,t){switch(e){case"float":case"int":case"uint":case"sampler2D":case"sampler2DArray":return 0;case"vec2":return new Float32Array(2*t);case"vec3":return new Float32Array(3*t);case"vec4":return new Float32Array(4*t);case"ivec2":return new Int32Array(2*t);case"ivec3":return new Int32Array(3*t);case"ivec4":return new Int32Array(4*t);case"uvec2":return new Uint32Array(2*t);case"uvec3":return new Uint32Array(3*t);case"uvec4":return new Uint32Array(4*t);case"bool":return !1;case"bvec2":return qe(2*t);case"bvec3":return qe(3*t);case"bvec4":return qe(4*t);case"mat2":return new Float32Array([1,0,0,1]);case"mat3":return new Float32Array([1,0,0,0,1,0,0,0,1]);case"mat4":return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])}return null}var $e,Je={},Qe=Je;function et$1(){if(Qe===Je||Qe&&Qe.isContextLost()){var r=V$2.ADAPTER.createCanvas(),i=void 0;V$2.PREFER_ENV>=E$6.WEBGL2&&(i=r.getContext("webgl2",{})),i||((i=r.getContext("webgl",{})||r.getContext("experimental-webgl",{}))?i.getExtension("WEBGL_draw_buffers"):i=null),Qe=i;}return Qe}function tt$1(e,t,r){if("precision"!==e.substring(0,9)){var i=t;return t===M$3.HIGH&&r!==M$3.HIGH&&(i=M$3.MEDIUM),"precision "+i+" float;\n"+e}return r!==M$3.HIGH&&"precision highp"===e.substring(0,15)?e.replace("precision highp","precision mediump"):e}var rt={float:1,vec2:2,vec3:3,vec4:4,int:1,ivec2:2,ivec3:3,ivec4:4,uint:1,uvec2:2,uvec3:3,uvec4:4,bool:1,bvec2:2,bvec3:3,bvec4:4,mat2:4,mat3:9,mat4:16,sampler2D:1};function it(e){return rt[e]}var nt=null,ot={FLOAT:"float",FLOAT_VEC2:"vec2",FLOAT_VEC3:"vec3",FLOAT_VEC4:"vec4",INT:"int",INT_VEC2:"ivec2",INT_VEC3:"ivec3",INT_VEC4:"ivec4",UNSIGNED_INT:"uint",UNSIGNED_INT_VEC2:"uvec2",UNSIGNED_INT_VEC3:"uvec3",UNSIGNED_INT_VEC4:"uvec4",BOOL:"bool",BOOL_VEC2:"bvec2",BOOL_VEC3:"bvec3",BOOL_VEC4:"bvec4",FLOAT_MAT2:"mat2",FLOAT_MAT3:"mat3",FLOAT_MAT4:"mat4",SAMPLER_2D:"sampler2D",INT_SAMPLER_2D:"sampler2D",UNSIGNED_INT_SAMPLER_2D:"sampler2D",SAMPLER_CUBE:"samplerCube",INT_SAMPLER_CUBE:"samplerCube",UNSIGNED_INT_SAMPLER_CUBE:"samplerCube",SAMPLER_2D_ARRAY:"sampler2DArray",INT_SAMPLER_2D_ARRAY:"sampler2DArray",UNSIGNED_INT_SAMPLER_2D_ARRAY:"sampler2DArray"};function st(e,t){if(!nt){var r=Object.keys(ot);nt={};for(var i=0;i<r.length;++i){var n=r[i];nt[e[n]]=ot[n];}}return nt[t]}var at=[{test:function(e){return "float"===e.type&&1===e.size},code:function(e){return '\n            if(uv["'+e+'"] !== ud["'+e+'"].value)\n            {\n                ud["'+e+'"].value = uv["'+e+'"]\n                gl.uniform1f(ud["'+e+'"].location, uv["'+e+'"])\n            }\n            '}},{test:function(e){return ("sampler2D"===e.type||"samplerCube"===e.type||"sampler2DArray"===e.type)&&1===e.size&&!e.isArray},code:function(e){return 't = syncData.textureCount++;\n\n            renderer.texture.bind(uv["'+e+'"], t);\n\n            if(ud["'+e+'"].value !== t)\n            {\n                ud["'+e+'"].value = t;\n                gl.uniform1i(ud["'+e+'"].location, t);\n; // eslint-disable-line max-len\n            }'}},{test:function(e,t){return "mat3"===e.type&&1===e.size&&void 0!==t.a},code:function(e){return '\n            gl.uniformMatrix3fv(ud["'+e+'"].location, false, uv["'+e+'"].toArray(true));\n            '},codeUbo:function(e){return "\n                var "+e+"_matrix = uv."+e+".toArray(true);\n\n                data[offset] = "+e+"_matrix[0];\n                data[offset+1] = "+e+"_matrix[1];\n                data[offset+2] = "+e+"_matrix[2];\n        \n                data[offset + 4] = "+e+"_matrix[3];\n                data[offset + 5] = "+e+"_matrix[4];\n                data[offset + 6] = "+e+"_matrix[5];\n        \n                data[offset + 8] = "+e+"_matrix[6];\n                data[offset + 9] = "+e+"_matrix[7];\n                data[offset + 10] = "+e+"_matrix[8];\n            "}},{test:function(e,t){return "vec2"===e.type&&1===e.size&&void 0!==t.x},code:function(e){return '\n                cv = ud["'+e+'"].value;\n                v = uv["'+e+'"];\n\n                if(cv[0] !== v.x || cv[1] !== v.y)\n                {\n                    cv[0] = v.x;\n                    cv[1] = v.y;\n                    gl.uniform2f(ud["'+e+'"].location, v.x, v.y);\n                }'},codeUbo:function(e){return "\n                v = uv."+e+";\n\n                data[offset] = v.x;\n                data[offset+1] = v.y;\n            "}},{test:function(e){return "vec2"===e.type&&1===e.size},code:function(e){return '\n                cv = ud["'+e+'"].value;\n                v = uv["'+e+'"];\n\n                if(cv[0] !== v[0] || cv[1] !== v[1])\n                {\n                    cv[0] = v[0];\n                    cv[1] = v[1];\n                    gl.uniform2f(ud["'+e+'"].location, v[0], v[1]);\n                }\n            '}},{test:function(e,t){return "vec4"===e.type&&1===e.size&&void 0!==t.width},code:function(e){return '\n                cv = ud["'+e+'"].value;\n                v = uv["'+e+'"];\n\n                if(cv[0] !== v.x || cv[1] !== v.y || cv[2] !== v.width || cv[3] !== v.height)\n                {\n                    cv[0] = v.x;\n                    cv[1] = v.y;\n                    cv[2] = v.width;\n                    cv[3] = v.height;\n                    gl.uniform4f(ud["'+e+'"].location, v.x, v.y, v.width, v.height)\n                }'},codeUbo:function(e){return "\n                    v = uv."+e+";\n\n                    data[offset] = v.x;\n                    data[offset+1] = v.y;\n                    data[offset+2] = v.width;\n                    data[offset+3] = v.height;\n                "}},{test:function(e){return "vec4"===e.type&&1===e.size},code:function(e){return '\n                cv = ud["'+e+'"].value;\n                v = uv["'+e+'"];\n\n                if(cv[0] !== v[0] || cv[1] !== v[1] || cv[2] !== v[2] || cv[3] !== v[3])\n                {\n                    cv[0] = v[0];\n                    cv[1] = v[1];\n                    cv[2] = v[2];\n                    cv[3] = v[3];\n\n                    gl.uniform4f(ud["'+e+'"].location, v[0], v[1], v[2], v[3])\n                }'}}],ut={float:"\n    if (cv !== v)\n    {\n        cu.value = v;\n        gl.uniform1f(location, v);\n    }",vec2:"\n    if (cv[0] !== v[0] || cv[1] !== v[1])\n    {\n        cv[0] = v[0];\n        cv[1] = v[1];\n\n        gl.uniform2f(location, v[0], v[1])\n    }",vec3:"\n    if (cv[0] !== v[0] || cv[1] !== v[1] || cv[2] !== v[2])\n    {\n        cv[0] = v[0];\n        cv[1] = v[1];\n        cv[2] = v[2];\n\n        gl.uniform3f(location, v[0], v[1], v[2])\n    }",vec4:"\n    if (cv[0] !== v[0] || cv[1] !== v[1] || cv[2] !== v[2] || cv[3] !== v[3])\n    {\n        cv[0] = v[0];\n        cv[1] = v[1];\n        cv[2] = v[2];\n        cv[3] = v[3];\n\n        gl.uniform4f(location, v[0], v[1], v[2], v[3]);\n    }",int:"\n    if (cv !== v)\n    {\n        cu.value = v;\n\n        gl.uniform1i(location, v);\n    }",ivec2:"\n    if (cv[0] !== v[0] || cv[1] !== v[1])\n    {\n        cv[0] = v[0];\n        cv[1] = v[1];\n\n        gl.uniform2i(location, v[0], v[1]);\n    }",ivec3:"\n    if (cv[0] !== v[0] || cv[1] !== v[1] || cv[2] !== v[2])\n    {\n        cv[0] = v[0];\n        cv[1] = v[1];\n        cv[2] = v[2];\n\n        gl.uniform3i(location, v[0], v[1], v[2]);\n    }",ivec4:"\n    if (cv[0] !== v[0] || cv[1] !== v[1] || cv[2] !== v[2] || cv[3] !== v[3])\n    {\n        cv[0] = v[0];\n        cv[1] = v[1];\n        cv[2] = v[2];\n        cv[3] = v[3];\n\n        gl.uniform4i(location, v[0], v[1], v[2], v[3]);\n    }",uint:"\n    if (cv !== v)\n    {\n        cu.value = v;\n\n        gl.uniform1ui(location, v);\n    }",uvec2:"\n    if (cv[0] !== v[0] || cv[1] !== v[1])\n    {\n        cv[0] = v[0];\n        cv[1] = v[1];\n\n        gl.uniform2ui(location, v[0], v[1]);\n    }",uvec3:"\n    if (cv[0] !== v[0] || cv[1] !== v[1] || cv[2] !== v[2])\n    {\n        cv[0] = v[0];\n        cv[1] = v[1];\n        cv[2] = v[2];\n\n        gl.uniform3ui(location, v[0], v[1], v[2]);\n    }",uvec4:"\n    if (cv[0] !== v[0] || cv[1] !== v[1] || cv[2] !== v[2] || cv[3] !== v[3])\n    {\n        cv[0] = v[0];\n        cv[1] = v[1];\n        cv[2] = v[2];\n        cv[3] = v[3];\n\n        gl.uniform4ui(location, v[0], v[1], v[2], v[3]);\n    }",bool:"\n    if (cv !== v)\n    {\n        cu.value = v;\n        gl.uniform1i(location, v);\n    }",bvec2:"\n    if (cv[0] != v[0] || cv[1] != v[1])\n    {\n        cv[0] = v[0];\n        cv[1] = v[1];\n\n        gl.uniform2i(location, v[0], v[1]);\n    }",bvec3:"\n    if (cv[0] !== v[0] || cv[1] !== v[1] || cv[2] !== v[2])\n    {\n        cv[0] = v[0];\n        cv[1] = v[1];\n        cv[2] = v[2];\n\n        gl.uniform3i(location, v[0], v[1], v[2]);\n    }",bvec4:"\n    if (cv[0] !== v[0] || cv[1] !== v[1] || cv[2] !== v[2] || cv[3] !== v[3])\n    {\n        cv[0] = v[0];\n        cv[1] = v[1];\n        cv[2] = v[2];\n        cv[3] = v[3];\n\n        gl.uniform4i(location, v[0], v[1], v[2], v[3]);\n    }",mat2:"gl.uniformMatrix2fv(location, false, v)",mat3:"gl.uniformMatrix3fv(location, false, v)",mat4:"gl.uniformMatrix4fv(location, false, v)",sampler2D:"gl.uniform1i(location, v)",samplerCube:"gl.uniform1i(location, v)",sampler2DArray:"gl.uniform1i(location, v)"},ht={float:"gl.uniform1fv(location, v)",vec2:"gl.uniform2fv(location, v)",vec3:"gl.uniform3fv(location, v)",vec4:"gl.uniform4fv(location, v)",mat4:"gl.uniformMatrix4fv(location, false, v)",mat3:"gl.uniformMatrix3fv(location, false, v)",mat2:"gl.uniformMatrix2fv(location, false, v)",int:"gl.uniform1iv(location, v)",ivec2:"gl.uniform2iv(location, v)",ivec3:"gl.uniform3iv(location, v)",ivec4:"gl.uniform4iv(location, v)",uint:"gl.uniform1uiv(location, v)",uvec2:"gl.uniform2uiv(location, v)",uvec3:"gl.uniform3uiv(location, v)",uvec4:"gl.uniform4uiv(location, v)",bool:"gl.uniform1iv(location, v)",bvec2:"gl.uniform2iv(location, v)",bvec3:"gl.uniform3iv(location, v)",bvec4:"gl.uniform4iv(location, v)",sampler2D:"gl.uniform1iv(location, v)",samplerCube:"gl.uniform1iv(location, v)",sampler2DArray:"gl.uniform1iv(location, v)"};var lt,ft=["precision mediump float;","void main(void){","float test = 0.1;","%forloop%","gl_FragColor = vec4(0.0);","}"].join("\n");function dt(e){for(var t="",r=0;r<e;++r)r>0&&(t+="\nelse "),r<e-1&&(t+="if(test == "+r+".0){}");return t}function ct(e,t){if(0===e)throw new Error("Invalid value of `0` passed to `checkMaxIfStatementsInShader`");for(var r=t.createShader(t.FRAGMENT_SHADER);;){var i=ft.replace(/%forloop%/gi,dt(e));if(t.shaderSource(r,i),t.compileShader(r),t.getShaderParameter(r,t.COMPILE_STATUS))break;e=e/2|0;}return e}var pt=0,vt={},mt=function(){function t(r,i,n){void 0===n&&(n="pixi-shader"),this.id=pt++,this.vertexSrc=r||t.defaultVertexSrc,this.fragmentSrc=i||t.defaultFragmentSrc,this.vertexSrc=this.vertexSrc.trim(),this.fragmentSrc=this.fragmentSrc.trim(),"#version"!==this.vertexSrc.substring(0,8)&&(n=n.replace(/\s+/g,"-"),vt[n]?(vt[n]++,n+="-"+vt[n]):vt[n]=1,this.vertexSrc="#define SHADER_NAME "+n+"\n"+this.vertexSrc,this.fragmentSrc="#define SHADER_NAME "+n+"\n"+this.fragmentSrc,this.vertexSrc=tt$1(this.vertexSrc,V$2.PRECISION_VERTEX,M$3.HIGH),this.fragmentSrc=tt$1(this.fragmentSrc,V$2.PRECISION_FRAGMENT,function(){if(!$e){$e=M$3.MEDIUM;var e=et$1();if(e&&e.getShaderPrecisionFormat){var t=e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.HIGH_FLOAT);$e=t.precision?M$3.HIGH:M$3.MEDIUM;}}return $e}())),this.glPrograms={},this.syncUniforms=null;}return Object.defineProperty(t,"defaultVertexSrc",{get:function(){return "attribute vec2 aVertexPosition;\nattribute vec2 aTextureCoord;\n\nuniform mat3 projectionMatrix;\n\nvarying vec2 vTextureCoord;\n\nvoid main(void){\n   gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);\n   vTextureCoord = aTextureCoord;\n}\n"},enumerable:!1,configurable:!0}),Object.defineProperty(t,"defaultFragmentSrc",{get:function(){return "varying vec2 vTextureCoord;\n\nuniform sampler2D uSampler;\n\nvoid main(void){\n   gl_FragColor *= texture2D(uSampler, vTextureCoord);\n}"},enumerable:!1,configurable:!0}),t.from=function(e,r,i){var n=e+r,o=O$6[n];return o||(O$6[n]=o=new t(e,r,i)),o},t}(),gt=function(){function e(e,t){this.uniformBindCount=0,this.program=e,this.uniformGroup=t?t instanceof Oe?t:new Oe(t):new Oe({});}return e.prototype.checkUniformExists=function(e,t){if(t.uniforms[e])return !0;for(var r in t.uniforms){var i=t.uniforms[r];if(i.group&&this.checkUniformExists(e,i))return !0}return !1},e.prototype.destroy=function(){this.uniformGroup=null;},Object.defineProperty(e.prototype,"uniforms",{get:function(){return this.uniformGroup.uniforms},enumerable:!1,configurable:!0}),e.from=function(t,r,i){return new e(mt.from(t,r),i)},e}(),yt=function(){function e(){this.data=0,this.blendMode=T$8.NORMAL,this.polygonOffset=0,this.blend=!0,this.depthMask=!0;}return Object.defineProperty(e.prototype,"blend",{get:function(){return !!(1&this.data)},set:function(e){!!(1&this.data)!==e&&(this.data^=1);},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"offsets",{get:function(){return !!(2&this.data)},set:function(e){!!(2&this.data)!==e&&(this.data^=2);},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"culling",{get:function(){return !!(4&this.data)},set:function(e){!!(4&this.data)!==e&&(this.data^=4);},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"depthTest",{get:function(){return !!(8&this.data)},set:function(e){!!(8&this.data)!==e&&(this.data^=8);},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"depthMask",{get:function(){return !!(32&this.data)},set:function(e){!!(32&this.data)!==e&&(this.data^=32);},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"clockwiseFrontFace",{get:function(){return !!(16&this.data)},set:function(e){!!(16&this.data)!==e&&(this.data^=16);},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"blendMode",{get:function(){return this._blendMode},set:function(e){this.blend=e!==T$8.NONE,this._blendMode=e;},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"polygonOffset",{get:function(){return this._polygonOffset},set:function(e){this.offsets=!!e,this._polygonOffset=e;},enumerable:!1,configurable:!0}),e.for2d=function(){var t=new e;return t.depthTest=!1,t.blend=!0,t},e}(),_t=function(t){function r(i,n,o){var s=this,a=mt.from(i||r.defaultVertexSrc,n||r.defaultFragmentSrc);return (s=t.call(this,a,o)||this).padding=0,s.resolution=V$2.FILTER_RESOLUTION,s.multisample=V$2.FILTER_MULTISAMPLE,s.enabled=!0,s.autoFit=!0,s.state=new yt,s}return Z$2(r,t),r.prototype.apply=function(e,t,r,i,n){e.applyFilter(this,t,r,i);},Object.defineProperty(r.prototype,"blendMode",{get:function(){return this.state.blendMode},set:function(e){this.state.blendMode=e;},enumerable:!1,configurable:!0}),Object.defineProperty(r.prototype,"resolution",{get:function(){return this._resolution},set:function(e){this._resolution=e;},enumerable:!1,configurable:!0}),Object.defineProperty(r,"defaultVertexSrc",{get:function(){return "attribute vec2 aVertexPosition;\n\nuniform mat3 projectionMatrix;\n\nvarying vec2 vTextureCoord;\n\nuniform vec4 inputSize;\nuniform vec4 outputFrame;\n\nvec4 filterVertexPosition( void )\n{\n    vec2 position = aVertexPosition * max(outputFrame.zw, vec2(0.)) + outputFrame.xy;\n\n    return vec4((projectionMatrix * vec3(position, 1.0)).xy, 0.0, 1.0);\n}\n\nvec2 filterTextureCoord( void )\n{\n    return aVertexPosition * (outputFrame.zw * inputSize.zw);\n}\n\nvoid main(void)\n{\n    gl_Position = filterVertexPosition();\n    vTextureCoord = filterTextureCoord();\n}\n"},enumerable:!1,configurable:!0}),Object.defineProperty(r,"defaultFragmentSrc",{get:function(){return "varying vec2 vTextureCoord;\n\nuniform sampler2D uSampler;\n\nvoid main(void){\n   gl_FragColor = texture2D(uSampler, vTextureCoord);\n}\n"},enumerable:!1,configurable:!0}),r}(gt),bt=new p$7,xt=function(){function e(e,t){this._texture=e,this.mapCoord=new p$7,this.uClampFrame=new Float32Array(4),this.uClampOffset=new Float32Array(2),this._textureID=-1,this._updateID=0,this.clampOffset=0,this.clampMargin=void 0===t?.5:t,this.isSimple=!1;}return Object.defineProperty(e.prototype,"texture",{get:function(){return this._texture},set:function(e){this._texture=e,this._textureID=-1;},enumerable:!1,configurable:!0}),e.prototype.multiplyUvs=function(e,t){void 0===t&&(t=e);for(var r=this.mapCoord,i=0;i<e.length;i+=2){var n=e[i],o=e[i+1];t[i]=n*r.a+o*r.c+r.tx,t[i+1]=n*r.b+o*r.d+r.ty;}return t},e.prototype.update=function(e){var t=this._texture;if(!t||!t.valid)return !1;if(!e&&this._textureID===t._updateID)return !1;this._textureID=t._updateID,this._updateID++;var r=t._uvs;this.mapCoord.set(r.x1-r.x0,r.y1-r.y0,r.x3-r.x0,r.y3-r.y0,r.x0,r.y0);var i=t.orig,n=t.trim;n&&(bt.set(i.width/n.width,0,0,i.height/n.height,-n.x/n.width,-n.y/n.height),this.mapCoord.append(bt));var o=t.baseTexture,s=this.uClampFrame,a=this.clampMargin/o.resolution,u=this.clampOffset;return s[0]=(t._frame.x+a+u)/o.width,s[1]=(t._frame.y+a+u)/o.height,s[2]=(t._frame.x+t._frame.width-a+u)/o.width,s[3]=(t._frame.y+t._frame.height-a+u)/o.height,this.uClampOffset[0]=u/o.realWidth,this.uClampOffset[1]=u/o.realHeight,this.isSimple=t._frame.width===o.width&&t._frame.height===o.height&&0===t.rotate,!0},e}(),Et=function(e){function t(t,r,i){var n=this,o=null;return "string"!=typeof t&&void 0===r&&void 0===i&&(o=t,t=void 0,r=void 0,i=void 0),(n=e.call(this,t||"attribute vec2 aVertexPosition;\nattribute vec2 aTextureCoord;\n\nuniform mat3 projectionMatrix;\nuniform mat3 otherMatrix;\n\nvarying vec2 vMaskCoord;\nvarying vec2 vTextureCoord;\n\nvoid main(void)\n{\n    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);\n\n    vTextureCoord = aTextureCoord;\n    vMaskCoord = ( otherMatrix * vec3( aTextureCoord, 1.0)  ).xy;\n}\n",r||"varying vec2 vMaskCoord;\nvarying vec2 vTextureCoord;\n\nuniform sampler2D uSampler;\nuniform sampler2D mask;\nuniform float alpha;\nuniform float npmAlpha;\nuniform vec4 maskClamp;\n\nvoid main(void)\n{\n    float clip = step(3.5,\n        step(maskClamp.x, vMaskCoord.x) +\n        step(maskClamp.y, vMaskCoord.y) +\n        step(vMaskCoord.x, maskClamp.z) +\n        step(vMaskCoord.y, maskClamp.w));\n\n    vec4 original = texture2D(uSampler, vTextureCoord);\n    vec4 masky = texture2D(mask, vMaskCoord);\n    float alphaMul = 1.0 - npmAlpha * (1.0 - masky.a);\n\n    original *= (alphaMul * masky.r * alpha * clip);\n\n    gl_FragColor = original;\n}\n",i)||this).maskSprite=o,n.maskMatrix=new p$7,n}return Z$2(t,e),Object.defineProperty(t.prototype,"maskSprite",{get:function(){return this._maskSprite},set:function(e){this._maskSprite=e,this._maskSprite&&(this._maskSprite.renderable=!1);},enumerable:!1,configurable:!0}),t.prototype.apply=function(e,t,r,i){var n=this._maskSprite,o=n._texture;o.valid&&(o.uvMatrix||(o.uvMatrix=new xt(o,0)),o.uvMatrix.update(),this.uniforms.npmAlpha=o.baseTexture.alphaMode?0:1,this.uniforms.mask=o,this.uniforms.otherMatrix=e.calculateSpriteMatrix(this.maskMatrix,n).prepend(o.uvMatrix.mapCoord),this.uniforms.alpha=n.worldAlpha,this.uniforms.maskClamp=o.uvMatrix.uClampFrame,e.applyFilter(this,t,r,i));},t}(_t),Tt=function(){function e(e){this.renderer=e,this.enableScissor=!0,this.alphaMaskPool=[],this.maskDataPool=[],this.maskStack=[],this.alphaMaskIndex=0;}return e.prototype.setMaskStack=function(e){this.maskStack=e,this.renderer.scissor.setMaskStack(e),this.renderer.stencil.setMaskStack(e);},e.prototype.push=function(e,t){var r=t;if(!r.isMaskData){var i=this.maskDataPool.pop()||new We;i.pooled=!0,i.maskObject=t,r=i;}var n=0!==this.maskStack.length?this.maskStack[this.maskStack.length-1]:null;if(r.copyCountersOrReset(n),r._colorMask=n?n._colorMask:15,r.autoDetect&&this.detect(r),r._target=e,r.type!==B$3.SPRITE&&this.maskStack.push(r),r.enabled)switch(r.type){case B$3.SCISSOR:this.renderer.scissor.push(r);break;case B$3.STENCIL:this.renderer.stencil.push(r);break;case B$3.SPRITE:r.copyCountersOrReset(null),this.pushSpriteMask(r);break;case B$3.COLOR:this.pushColorMask(r);}r.type===B$3.SPRITE&&this.maskStack.push(r);},e.prototype.pop=function(e){var t=this.maskStack.pop();if(t&&t._target===e){if(t.enabled)switch(t.type){case B$3.SCISSOR:this.renderer.scissor.pop(t);break;case B$3.STENCIL:this.renderer.stencil.pop(t.maskObject);break;case B$3.SPRITE:this.popSpriteMask(t);break;case B$3.COLOR:this.popColorMask(t);}if(t.reset(),t.pooled&&this.maskDataPool.push(t),0!==this.maskStack.length){var r=this.maskStack[this.maskStack.length-1];r.type===B$3.SPRITE&&r._filters&&(r._filters[0].maskSprite=r.maskObject);}}},e.prototype.detect=function(e){var t=e.maskObject;t?t.isSprite?e.type=B$3.SPRITE:this.enableScissor&&this.renderer.scissor.testScissor(e)?e.type=B$3.SCISSOR:e.type=B$3.STENCIL:e.type=B$3.COLOR;},e.prototype.pushSpriteMask=function(e){var t,r,i=e.maskObject,n=e._target,o=e._filters;o||(o=this.alphaMaskPool[this.alphaMaskIndex])||(o=this.alphaMaskPool[this.alphaMaskIndex]=[new Et]);var s,a,u=this.renderer,h=u.renderTexture;if(h.current){var l=h.current;s=e.resolution||l.resolution,a=null!==(t=e.multisample)&&void 0!==t?t:l.multisample;}else s=e.resolution||u.resolution,a=null!==(r=e.multisample)&&void 0!==r?r:u.multisample;o[0].resolution=s,o[0].multisample=a,o[0].maskSprite=i;var f=n.filterArea;n.filterArea=i.getBounds(!0),u.filter.push(n,o),n.filterArea=f,e._filters||this.alphaMaskIndex++;},e.prototype.popSpriteMask=function(e){this.renderer.filter.pop(),e._filters?e._filters[0].maskSprite=null:(this.alphaMaskIndex--,this.alphaMaskPool[this.alphaMaskIndex][0].maskSprite=null);},e.prototype.pushColorMask=function(e){var t=e._colorMask,r=e._colorMask=t&e.colorMask;r!==t&&this.renderer.gl.colorMask(0!=(1&r),0!=(2&r),0!=(4&r),0!=(8&r));},e.prototype.popColorMask=function(e){var t=e._colorMask,r=this.maskStack.length>0?this.maskStack[this.maskStack.length-1]._colorMask:15;r!==t&&this.renderer.gl.colorMask(0!=(1&r),0!=(2&r),0!=(4&r),0!=(8&r));},e.prototype.destroy=function(){this.renderer=null;},e}(),Rt=function(){function e(e){this.renderer=e,this.maskStack=[],this.glConst=0;}return e.prototype.getStackLength=function(){return this.maskStack.length},e.prototype.setMaskStack=function(e){var t=this.renderer.gl,r=this.getStackLength();this.maskStack=e;var i=this.getStackLength();i!==r&&(0===i?t.disable(this.glConst):(t.enable(this.glConst),this._useCurrent()));},e.prototype._useCurrent=function(){},e.prototype.destroy=function(){this.renderer=null,this.maskStack=null;},e}(),St=new p$7,wt=[],At=function(t){function r(r){var i=t.call(this,r)||this;return i.glConst=V$2.ADAPTER.getWebGLRenderingContext().SCISSOR_TEST,i}return Z$2(r,t),r.prototype.getStackLength=function(){var e=this.maskStack[this.maskStack.length-1];return e?e._scissorCounter:0},r.prototype.calcScissorRect=function(e){var t;if(!e._scissorRectLocal){var r=e._scissorRect,i=e.maskObject,n=this.renderer,o=n.renderTexture,s=i.getBounds(!0,null!==(t=wt.pop())&&void 0!==t?t:new r$4);this.roundFrameToPixels(s,o.current?o.current.resolution:n.resolution,o.sourceFrame,o.destinationFrame,n.projection.transform),r&&s.fit(r),e._scissorRectLocal=s;}},r.isMatrixRotated=function(e){if(!e)return !1;var t=e.a,r=e.b,i=e.c,n=e.d;return (Math.abs(r)>1e-4||Math.abs(i)>1e-4)&&(Math.abs(t)>1e-4||Math.abs(n)>1e-4)},r.prototype.testScissor=function(e){var t=e.maskObject;if(!t.isFastRect||!t.isFastRect())return !1;if(r.isMatrixRotated(t.worldTransform))return !1;if(r.isMatrixRotated(this.renderer.projection.transform))return !1;this.calcScissorRect(e);var i=e._scissorRectLocal;return i.width>0&&i.height>0},r.prototype.roundFrameToPixels=function(e,t,i,n,o){r.isMatrixRotated(o)||((o=o?St.copyFrom(o):St.identity()).translate(-i.x,-i.y).scale(n.width/i.width,n.height/i.height).translate(n.x,n.y),this.renderer.filter.transformAABB(o,e),e.fit(n),e.x=Math.round(e.x*t),e.y=Math.round(e.y*t),e.width=Math.round(e.width*t),e.height=Math.round(e.height*t));},r.prototype.push=function(e){e._scissorRectLocal||this.calcScissorRect(e);var t=this.renderer.gl;e._scissorRect||t.enable(t.SCISSOR_TEST),e._scissorCounter++,e._scissorRect=e._scissorRectLocal,this._useCurrent();},r.prototype.pop=function(e){var t=this.renderer.gl;e&&wt.push(e._scissorRectLocal),this.getStackLength()>0?this._useCurrent():t.disable(t.SCISSOR_TEST);},r.prototype._useCurrent=function(){var e,t=this.maskStack[this.maskStack.length-1]._scissorRect;e=this.renderer.renderTexture.current?t.y:this.renderer.height-t.height-t.y,this.renderer.gl.scissor(t.x,e,t.width,t.height);},r}(Rt),It=function(t){function r(r){var i=t.call(this,r)||this;return i.glConst=V$2.ADAPTER.getWebGLRenderingContext().STENCIL_TEST,i}return Z$2(r,t),r.prototype.getStackLength=function(){var e=this.maskStack[this.maskStack.length-1];return e?e._stencilCounter:0},r.prototype.push=function(e){var t=e.maskObject,r=this.renderer.gl,i=e._stencilCounter;0===i&&(this.renderer.framebuffer.forceStencil(),r.clearStencil(0),r.clear(r.STENCIL_BUFFER_BIT),r.enable(r.STENCIL_TEST)),e._stencilCounter++;var n=e._colorMask;0!==n&&(e._colorMask=0,r.colorMask(!1,!1,!1,!1)),r.stencilFunc(r.EQUAL,i,4294967295),r.stencilOp(r.KEEP,r.KEEP,r.INCR),t.renderable=!0,t.render(this.renderer),this.renderer.batch.flush(),t.renderable=!1,0!==n&&(e._colorMask=n,r.colorMask(0!=(1&n),0!=(2&n),0!=(4&n),0!=(8&n))),this._useCurrent();},r.prototype.pop=function(e){var t=this.renderer.gl;if(0===this.getStackLength())t.disable(t.STENCIL_TEST);else {var r=0!==this.maskStack.length?this.maskStack[this.maskStack.length-1]:null,i=r?r._colorMask:15;0!==i&&(r._colorMask=0,t.colorMask(!1,!1,!1,!1)),t.stencilOp(t.KEEP,t.KEEP,t.DECR),e.renderable=!0,e.render(this.renderer),this.renderer.batch.flush(),e.renderable=!1,0!==i&&(r._colorMask=i,t.colorMask(0!=(1&i),0!=(2&i),0!=(4&i),0!=(8&i))),this._useCurrent();}},r.prototype._useCurrent=function(){var e=this.renderer.gl;e.stencilFunc(e.EQUAL,this.getStackLength(),4294967295),e.stencilOp(e.KEEP,e.KEEP,e.KEEP);},r}(Rt),Ct=function(){function e(e){this.renderer=e,this.destinationFrame=null,this.sourceFrame=null,this.defaultFrame=null,this.projectionMatrix=new p$7,this.transform=null;}return e.prototype.update=function(e,t,r,i){this.destinationFrame=e||this.destinationFrame||this.defaultFrame,this.sourceFrame=t||this.sourceFrame||e,this.calculateProjection(this.destinationFrame,this.sourceFrame,r,i),this.transform&&this.projectionMatrix.append(this.transform);var n=this.renderer;n.globalUniforms.uniforms.projectionMatrix=this.projectionMatrix,n.globalUniforms.update(),n.shader.shader&&n.shader.syncUniformGroup(n.shader.shader.uniforms.globals);},e.prototype.calculateProjection=function(e,t,r,i){var n=this.projectionMatrix,o=i?-1:1;n.identity(),n.a=1/t.width*2,n.d=o*(1/t.height*2),n.tx=-1-t.x*n.a,n.ty=-o-t.y*n.d;},e.prototype.setTransform=function(e){},e.prototype.destroy=function(){this.renderer=null;},e}(),Ft=new r$4,Nt=new r$4,Ot=function(){function e(e){this.renderer=e,this.clearColor=e._backgroundColorRgba,this.defaultMaskStack=[],this.current=null,this.sourceFrame=new r$4,this.destinationFrame=new r$4,this.viewportFrame=new r$4;}return e.prototype.bind=function(e,t,r){void 0===e&&(e=null);var i,n,o,s=this.renderer;this.current=e,e?(o=(i=e.baseTexture).resolution,t||(Ft.width=e.frame.width,Ft.height=e.frame.height,t=Ft),r||(Nt.x=e.frame.x,Nt.y=e.frame.y,Nt.width=t.width,Nt.height=t.height,r=Nt),n=i.framebuffer):(o=s.resolution,t||(Ft.width=s.screen.width,Ft.height=s.screen.height,t=Ft),r||((r=Ft).width=t.width,r.height=t.height));var a=this.viewportFrame;a.x=r.x*o,a.y=r.y*o,a.width=r.width*o,a.height=r.height*o,e||(a.y=s.view.height-(a.y+a.height)),a.ceil(),this.renderer.framebuffer.bind(n,a),this.renderer.projection.update(r,t,o,!n),e?this.renderer.mask.setMaskStack(i.maskStack):this.renderer.mask.setMaskStack(this.defaultMaskStack),this.sourceFrame.copyFrom(t),this.destinationFrame.copyFrom(r);},e.prototype.clear=function(e,t){e=this.current?e||this.current.baseTexture.clearColor:e||this.clearColor;var r=this.destinationFrame,i=this.current?this.current.baseTexture:this.renderer.screen,n=r.width!==i.width||r.height!==i.height;if(n){var o=this.viewportFrame,s=o.x,a=o.y,u=o.width,h=o.height;s=Math.round(s),a=Math.round(a),u=Math.round(u),h=Math.round(h),this.renderer.gl.enable(this.renderer.gl.SCISSOR_TEST),this.renderer.gl.scissor(s,a,u,h);}this.renderer.framebuffer.clear(e[0],e[1],e[2],e[3],t),n&&this.renderer.scissor.pop();},e.prototype.resize=function(){this.bind(null);},e.prototype.reset=function(){this.bind(null);},e.prototype.destroy=function(){this.renderer=null;},e}();function Mt(e,t,r,i,n){r.buffer.update(n);}var Pt={float:"\n        data[offset] = v;\n    ",vec2:"\n        data[offset] = v[0];\n        data[offset+1] = v[1];\n    ",vec3:"\n        data[offset] = v[0];\n        data[offset+1] = v[1];\n        data[offset+2] = v[2];\n\n    ",vec4:"\n        data[offset] = v[0];\n        data[offset+1] = v[1];\n        data[offset+2] = v[2];\n        data[offset+3] = v[3];\n    ",mat2:"\n        data[offset] = v[0];\n        data[offset+1] = v[1];\n\n        data[offset+4] = v[2];\n        data[offset+5] = v[3];\n    ",mat3:"\n        data[offset] = v[0];\n        data[offset+1] = v[1];\n        data[offset+2] = v[2];\n\n        data[offset + 4] = v[3];\n        data[offset + 5] = v[4];\n        data[offset + 6] = v[5];\n\n        data[offset + 8] = v[6];\n        data[offset + 9] = v[7];\n        data[offset + 10] = v[8];\n    ",mat4:"\n        for(var i = 0; i < 16; i++)\n        {\n            data[offset + i] = v[i];\n        }\n    "},Bt={float:4,vec2:8,vec3:12,vec4:16,int:4,ivec2:8,ivec3:12,ivec4:16,uint:4,uvec2:8,uvec3:12,uvec4:16,bool:4,bvec2:8,bvec3:12,bvec4:16,mat2:32,mat3:48,mat4:64};function Ut(e){for(var t=e.map((function(e){return {data:e,offset:0,dataLen:0,dirty:0}})),r=0,i=0,n=0,o=0;o<t.length;o++){var s=t[o];if(r=Bt[s.data.type],s.data.size>1&&(r=Math.max(r,16)*s.data.size),s.dataLen=r,i%r!=0&&i<16){var a=i%r%16;i+=a,n+=a;}i+r>16?(n=16*Math.ceil(n/16),s.offset=n,n+=r,i=r):(s.offset=n,i+=r,n+=r);}return {uboElements:t,size:n=16*Math.ceil(n/16)}}function Lt(e,t){var r=[];for(var i in e)t[i]&&r.push(t[i]);return r.sort((function(e,t){return e.index-t.index})),r}function Dt(e,t){if(!e.autoManage)return {size:0,syncFunc:Mt};for(var r=Ut(Lt(e.uniforms,t)),i=r.uboElements,n=r.size,o=["\n    var v = null;\n    var v2 = null;\n    var cv = null;\n    var t = 0;\n    var gl = renderer.gl\n    var index = 0;\n    var data = buffer.data;\n    "],s=0;s<i.length;s++){for(var a=i[s],u=e.uniforms[a.data.name],h=a.data.name,l=!1,f=0;f<at.length;f++){var d=at[f];if(d.codeUbo&&d.test(a.data,u)){o.push("offset = "+a.offset/4+";",at[f].codeUbo(a.data.name,u)),l=!0;break}}if(!l)if(a.data.size>1){var c=it(a.data.type),p=Math.max(Bt[a.data.type]/16,1),v=c/p,m=(4-v%4)%4;o.push("\n                cv = ud."+h+".value;\n                v = uv."+h+";\n                offset = "+a.offset/4+";\n\n                t = 0;\n\n                for(var i=0; i < "+a.data.size*p+"; i++)\n                {\n                    for(var j = 0; j < "+v+"; j++)\n                    {\n                        data[offset++] = v[t++];\n                    }\n                    offset += "+m+";\n                }\n\n                ");}else {var g=Pt[a.data.type];o.push("\n                cv = ud."+h+".value;\n                v = uv."+h+";\n                offset = "+a.offset/4+";\n                "+g+";\n                ");}}return o.push("\n       renderer.buffer.update(buffer);\n    "),{size:n,syncFunc:new Function("ud","uv","renderer","syncData","buffer",o.join("\n"))}}var kt=function(){function e(e,t){this.program=e,this.uniformData=t,this.uniformGroups={},this.uniformDirtyGroups={},this.uniformBufferBindings={};}return e.prototype.destroy=function(){this.uniformData=null,this.uniformGroups=null,this.uniformDirtyGroups=null,this.uniformBufferBindings=null,this.program=null;},e}();function Vt(e,t){var r=Ye(e,e.VERTEX_SHADER,t.vertexSrc),i=Ye(e,e.FRAGMENT_SHADER,t.fragmentSrc),n=e.createProgram();if(e.attachShader(n,r),e.attachShader(n,i),e.linkProgram(n),e.getProgramParameter(n,e.LINK_STATUS)||function(e,t,r,i){e.getProgramParameter(t,e.LINK_STATUS)||(e.getShaderParameter(r,e.COMPILE_STATUS)||Ke(e,r),e.getShaderParameter(i,e.COMPILE_STATUS)||Ke(e,i),console.error("PixiJS Error: Could not initialize shader."),""!==e.getProgramInfoLog(t)&&console.warn("PixiJS Warning: gl.getProgramInfoLog()",e.getProgramInfoLog(t)));}(e,n,r,i),t.attributeData=function(e,t){for(var r={},i=t.getProgramParameter(e,t.ACTIVE_ATTRIBUTES),n=0;n<i;n++){var o=t.getActiveAttrib(e,n);if(0!==o.name.indexOf("gl_")){var s=st(t,o.type),a={type:s,name:o.name,size:it(s),location:t.getAttribLocation(e,o.name)};r[o.name]=a;}}return r}(n,e),t.uniformData=function(e,t){for(var r={},i=t.getProgramParameter(e,t.ACTIVE_UNIFORMS),n=0;n<i;n++){var o=t.getActiveUniform(e,n),s=o.name.replace(/\[.*?\]$/,""),a=!!o.name.match(/\[.*?\]$/),u=st(t,o.type);r[s]={name:s,index:n,type:u,size:o.size,isArray:a,value:Ze(u,o.size)};}return r}(n,e),!/^[ \t]*#[ \t]*version[ \t]+300[ \t]+es[ \t]*$/m.test(t.vertexSrc)){var o=Object.keys(t.attributeData);o.sort((function(e,t){return e>t?1:-1}));for(var s=0;s<o.length;s++)t.attributeData[o[s]].location=s,e.bindAttribLocation(n,s,o[s]);e.linkProgram(n);}e.deleteShader(r),e.deleteShader(i);var a={};for(var s in t.uniformData){var u=t.uniformData[s];a[s]={location:e.getUniformLocation(n,s),value:Ze(u.type,u.size)};}return new kt(n,a)}var Ht=0,jt={textureCount:0,uboCount:0},zt=function(){function e(e){this.destroyed=!1,this.renderer=e,this.systemCheck(),this.gl=null,this.shader=null,this.program=null,this.cache={},this._uboCache={},this.id=Ht++;}return e.prototype.systemCheck=function(){if(!function(){if("boolean"==typeof lt)return lt;try{var e=new Function("param1","param2","param3","return param1[param2] === param3;");lt=!0===e({a:"b"},"a","b");}catch(e){lt=!1;}return lt}())throw new Error("Current environment does not allow unsafe-eval, please use @pixi/unsafe-eval module to enable support.")},e.prototype.contextChange=function(e){this.gl=e,this.reset();},e.prototype.bind=function(e,t){e.uniforms.globals=this.renderer.globalUniforms;var r=e.program,i=r.glPrograms[this.renderer.CONTEXT_UID]||this.generateProgram(e);return this.shader=e,this.program!==r&&(this.program=r,this.gl.useProgram(i.program)),t||(jt.textureCount=0,jt.uboCount=0,this.syncUniformGroup(e.uniformGroup,jt)),i},e.prototype.setUniforms=function(e){var t=this.shader.program,r=t.glPrograms[this.renderer.CONTEXT_UID];t.syncUniforms(r.uniformData,e,this.renderer);},e.prototype.syncUniformGroup=function(e,t){var r=this.getGlProgram();e.static&&e.dirtyId===r.uniformDirtyGroups[e.id]||(r.uniformDirtyGroups[e.id]=e.dirtyId,this.syncUniforms(e,r,t));},e.prototype.syncUniforms=function(e,t,r){(e.syncUniforms[this.shader.program.id]||this.createSyncGroups(e))(t.uniformData,e.uniforms,this.renderer,r);},e.prototype.createSyncGroups=function(e){var t=this.getSignature(e,this.shader.program.uniformData,"u");return this.cache[t]||(this.cache[t]=function(e,t){var r,i=["\n        var v = null;\n        var cv = null;\n        var cu = null;\n        var t = 0;\n        var gl = renderer.gl;\n    "];for(var n in e.uniforms){var o=t[n];if(o){for(var s=e.uniforms[n],a=!1,u=0;u<at.length;u++)if(at[u].test(o,s)){i.push(at[u].code(n,s)),a=!0;break}if(!a){var h=(1===o.size?ut:ht)[o.type].replace("location",'ud["'+n+'"].location');i.push('\n            cu = ud["'+n+'"];\n            cv = cu.value;\n            v = uv["'+n+'"];\n            '+h+";");}}else (null===(r=e.uniforms[n])||void 0===r?void 0:r.group)&&(e.uniforms[n].ubo?i.push("\n                        renderer.shader.syncUniformBufferGroup(uv."+n+", '"+n+"');\n                    "):i.push("\n                        renderer.shader.syncUniformGroup(uv."+n+", syncData);\n                    "));}return new Function("ud","uv","renderer","syncData",i.join("\n"))}(e,this.shader.program.uniformData)),e.syncUniforms[this.shader.program.id]=this.cache[t],e.syncUniforms[this.shader.program.id]},e.prototype.syncUniformBufferGroup=function(e,t){var r=this.getGlProgram();if(!e.static||0!==e.dirtyId||!r.uniformGroups[e.id]){e.dirtyId=0;var i=r.uniformGroups[e.id]||this.createSyncBufferGroup(e,r,t);e.buffer.update(),i(r.uniformData,e.uniforms,this.renderer,jt,e.buffer);}this.renderer.buffer.bindBufferBase(e.buffer,r.uniformBufferBindings[t]);},e.prototype.createSyncBufferGroup=function(e,t,r){var i=this.renderer.gl;this.renderer.buffer.bind(e.buffer);var n=this.gl.getUniformBlockIndex(t.program,r);t.uniformBufferBindings[r]=this.shader.uniformBindCount,i.uniformBlockBinding(t.program,n,this.shader.uniformBindCount),this.shader.uniformBindCount++;var o=this.getSignature(e,this.shader.program.uniformData,"ubo"),s=this._uboCache[o];if(s||(s=this._uboCache[o]=Dt(e,this.shader.program.uniformData)),e.autoManage){var a=new Float32Array(s.size/4);e.buffer.update(a);}return t.uniformGroups[e.id]=s.syncFunc,t.uniformGroups[e.id]},e.prototype.getSignature=function(e,t,r){var i=e.uniforms,n=[r+"-"];for(var o in i)n.push(o),t[o]&&n.push(t[o].type);return n.join("-")},e.prototype.getGlProgram=function(){return this.shader?this.shader.program.glPrograms[this.renderer.CONTEXT_UID]:null},e.prototype.generateProgram=function(e){var t=this.gl,r=e.program,i=Vt(t,r);return r.glPrograms[this.renderer.CONTEXT_UID]=i,i},e.prototype.reset=function(){this.program=null,this.shader=null;},e.prototype.destroy=function(){this.renderer=null,this.destroyed=!0;},e}();var Xt=function(){function e(){this.gl=null,this.stateId=0,this.polygonOffset=0,this.blendMode=T$8.NONE,this._blendEq=!1,this.map=[],this.map[0]=this.setBlend,this.map[1]=this.setOffset,this.map[2]=this.setCullFace,this.map[3]=this.setDepthTest,this.map[4]=this.setFrontFace,this.map[5]=this.setDepthMask,this.checks=[],this.defaultState=new yt,this.defaultState.blend=!0;}return e.prototype.contextChange=function(e){this.gl=e,this.blendModes=function(e,t){return void 0===t&&(t=[]),t[T$8.NORMAL]=[e.ONE,e.ONE_MINUS_SRC_ALPHA],t[T$8.ADD]=[e.ONE,e.ONE],t[T$8.MULTIPLY]=[e.DST_COLOR,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA],t[T$8.SCREEN]=[e.ONE,e.ONE_MINUS_SRC_COLOR,e.ONE,e.ONE_MINUS_SRC_ALPHA],t[T$8.OVERLAY]=[e.ONE,e.ONE_MINUS_SRC_ALPHA],t[T$8.DARKEN]=[e.ONE,e.ONE_MINUS_SRC_ALPHA],t[T$8.LIGHTEN]=[e.ONE,e.ONE_MINUS_SRC_ALPHA],t[T$8.COLOR_DODGE]=[e.ONE,e.ONE_MINUS_SRC_ALPHA],t[T$8.COLOR_BURN]=[e.ONE,e.ONE_MINUS_SRC_ALPHA],t[T$8.HARD_LIGHT]=[e.ONE,e.ONE_MINUS_SRC_ALPHA],t[T$8.SOFT_LIGHT]=[e.ONE,e.ONE_MINUS_SRC_ALPHA],t[T$8.DIFFERENCE]=[e.ONE,e.ONE_MINUS_SRC_ALPHA],t[T$8.EXCLUSION]=[e.ONE,e.ONE_MINUS_SRC_ALPHA],t[T$8.HUE]=[e.ONE,e.ONE_MINUS_SRC_ALPHA],t[T$8.SATURATION]=[e.ONE,e.ONE_MINUS_SRC_ALPHA],t[T$8.COLOR]=[e.ONE,e.ONE_MINUS_SRC_ALPHA],t[T$8.LUMINOSITY]=[e.ONE,e.ONE_MINUS_SRC_ALPHA],t[T$8.NONE]=[0,0],t[T$8.NORMAL_NPM]=[e.SRC_ALPHA,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA],t[T$8.ADD_NPM]=[e.SRC_ALPHA,e.ONE,e.ONE,e.ONE],t[T$8.SCREEN_NPM]=[e.SRC_ALPHA,e.ONE_MINUS_SRC_COLOR,e.ONE,e.ONE_MINUS_SRC_ALPHA],t[T$8.SRC_IN]=[e.DST_ALPHA,e.ZERO],t[T$8.SRC_OUT]=[e.ONE_MINUS_DST_ALPHA,e.ZERO],t[T$8.SRC_ATOP]=[e.DST_ALPHA,e.ONE_MINUS_SRC_ALPHA],t[T$8.DST_OVER]=[e.ONE_MINUS_DST_ALPHA,e.ONE],t[T$8.DST_IN]=[e.ZERO,e.SRC_ALPHA],t[T$8.DST_OUT]=[e.ZERO,e.ONE_MINUS_SRC_ALPHA],t[T$8.DST_ATOP]=[e.ONE_MINUS_DST_ALPHA,e.SRC_ALPHA],t[T$8.XOR]=[e.ONE_MINUS_DST_ALPHA,e.ONE_MINUS_SRC_ALPHA],t[T$8.SUBTRACT]=[e.ONE,e.ONE,e.ONE,e.ONE,e.FUNC_REVERSE_SUBTRACT,e.FUNC_ADD],t}(e),this.set(this.defaultState),this.reset();},e.prototype.set=function(e){if(e=e||this.defaultState,this.stateId!==e.data){for(var t=this.stateId^e.data,r=0;t;)1&t&&this.map[r].call(this,!!(e.data&1<<r)),t>>=1,r++;this.stateId=e.data;}for(r=0;r<this.checks.length;r++)this.checks[r](this,e);},e.prototype.forceState=function(e){e=e||this.defaultState;for(var t=0;t<this.map.length;t++)this.map[t].call(this,!!(e.data&1<<t));for(t=0;t<this.checks.length;t++)this.checks[t](this,e);this.stateId=e.data;},e.prototype.setBlend=function(t){this.updateCheck(e.checkBlendMode,t),this.gl[t?"enable":"disable"](this.gl.BLEND);},e.prototype.setOffset=function(t){this.updateCheck(e.checkPolygonOffset,t),this.gl[t?"enable":"disable"](this.gl.POLYGON_OFFSET_FILL);},e.prototype.setDepthTest=function(e){this.gl[e?"enable":"disable"](this.gl.DEPTH_TEST);},e.prototype.setDepthMask=function(e){this.gl.depthMask(e);},e.prototype.setCullFace=function(e){this.gl[e?"enable":"disable"](this.gl.CULL_FACE);},e.prototype.setFrontFace=function(e){this.gl.frontFace(this.gl[e?"CW":"CCW"]);},e.prototype.setBlendMode=function(e){if(e!==this.blendMode){this.blendMode=e;var t=this.blendModes[e],r=this.gl;2===t.length?r.blendFunc(t[0],t[1]):r.blendFuncSeparate(t[0],t[1],t[2],t[3]),6===t.length?(this._blendEq=!0,r.blendEquationSeparate(t[4],t[5])):this._blendEq&&(this._blendEq=!1,r.blendEquationSeparate(r.FUNC_ADD,r.FUNC_ADD));}},e.prototype.setPolygonOffset=function(e,t){this.gl.polygonOffset(e,t);},e.prototype.reset=function(){this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL,!1),this.forceState(this.defaultState),this._blendEq=!0,this.blendMode=-1,this.setBlendMode(0);},e.prototype.updateCheck=function(e,t){var r=this.checks.indexOf(e);t&&-1===r?this.checks.push(e):t||-1===r||this.checks.splice(r,1);},e.checkBlendMode=function(e,t){e.setBlendMode(t.blendMode);},e.checkPolygonOffset=function(e,t){e.setPolygonOffset(1,t.polygonOffset);},e.prototype.destroy=function(){this.gl=null;},e}(),Wt=function(){function t(t){this.renderer=t,this.count=0,this.checkCount=0,this.maxIdle=V$2.GC_MAX_IDLE,this.checkCountMax=V$2.GC_MAX_CHECK_COUNT,this.mode=V$2.GC_MODE;}return t.prototype.postrender=function(){this.renderer.renderingToScreen&&(this.count++,this.mode!==C$7.MANUAL&&(this.checkCount++,this.checkCount>this.checkCountMax&&(this.checkCount=0,this.run())));},t.prototype.run=function(){for(var e=this.renderer.texture,t=e.managedTextures,r=!1,i=0;i<t.length;i++){var n=t[i];!n.framebuffer&&this.count-n.touched>this.maxIdle&&(e.destroyTexture(n,!0),t[i]=null,r=!0);}if(r){var o=0;for(i=0;i<t.length;i++)null!==t[i]&&(t[o++]=t[i]);t.length=o;}},t.prototype.unload=function(e){var t=this.renderer.texture,r=e._texture;r&&!r.framebuffer&&t.destroyTexture(r);for(var i=e.children.length-1;i>=0;i--)this.unload(e.children[i]);},t.prototype.destroy=function(){this.renderer=null;},t}();var Yt=function(e){this.texture=e,this.width=-1,this.height=-1,this.dirtyId=-1,this.dirtyStyleId=-1,this.mipmap=!1,this.wrapMode=33071,this.type=L$5.UNSIGNED_BYTE,this.internalFormat=I$7.RGBA,this.samplerType=0;},Kt=function(){function e(e){this.renderer=e,this.boundTextures=[],this.currentLocation=-1,this.managedTextures=[],this._unknownBoundTextures=!1,this.unknownTexture=new te,this.hasIntegerTextures=!1;}return e.prototype.contextChange=function(){var e=this.gl=this.renderer.gl;this.CONTEXT_UID=this.renderer.CONTEXT_UID,this.webGLVersion=this.renderer.context.webGLVersion,this.internalFormats=function(e){var t,r,i,s,a,u,h,l,f,d,c,p,v,m,g,y,_,b,x,E,T,R,S;return "WebGL2RenderingContext"in globalThis&&e instanceof globalThis.WebGL2RenderingContext?((t={})[L$5.UNSIGNED_BYTE]=((r={})[I$7.RGBA]=e.RGBA8,r[I$7.RGB]=e.RGB8,r[I$7.RG]=e.RG8,r[I$7.RED]=e.R8,r[I$7.RGBA_INTEGER]=e.RGBA8UI,r[I$7.RGB_INTEGER]=e.RGB8UI,r[I$7.RG_INTEGER]=e.RG8UI,r[I$7.RED_INTEGER]=e.R8UI,r[I$7.ALPHA]=e.ALPHA,r[I$7.LUMINANCE]=e.LUMINANCE,r[I$7.LUMINANCE_ALPHA]=e.LUMINANCE_ALPHA,r),t[L$5.BYTE]=((i={})[I$7.RGBA]=e.RGBA8_SNORM,i[I$7.RGB]=e.RGB8_SNORM,i[I$7.RG]=e.RG8_SNORM,i[I$7.RED]=e.R8_SNORM,i[I$7.RGBA_INTEGER]=e.RGBA8I,i[I$7.RGB_INTEGER]=e.RGB8I,i[I$7.RG_INTEGER]=e.RG8I,i[I$7.RED_INTEGER]=e.R8I,i),t[L$5.UNSIGNED_SHORT]=((s={})[I$7.RGBA_INTEGER]=e.RGBA16UI,s[I$7.RGB_INTEGER]=e.RGB16UI,s[I$7.RG_INTEGER]=e.RG16UI,s[I$7.RED_INTEGER]=e.R16UI,s[I$7.DEPTH_COMPONENT]=e.DEPTH_COMPONENT16,s),t[L$5.SHORT]=((a={})[I$7.RGBA_INTEGER]=e.RGBA16I,a[I$7.RGB_INTEGER]=e.RGB16I,a[I$7.RG_INTEGER]=e.RG16I,a[I$7.RED_INTEGER]=e.R16I,a),t[L$5.UNSIGNED_INT]=((u={})[I$7.RGBA_INTEGER]=e.RGBA32UI,u[I$7.RGB_INTEGER]=e.RGB32UI,u[I$7.RG_INTEGER]=e.RG32UI,u[I$7.RED_INTEGER]=e.R32UI,u[I$7.DEPTH_COMPONENT]=e.DEPTH_COMPONENT24,u),t[L$5.INT]=((h={})[I$7.RGBA_INTEGER]=e.RGBA32I,h[I$7.RGB_INTEGER]=e.RGB32I,h[I$7.RG_INTEGER]=e.RG32I,h[I$7.RED_INTEGER]=e.R32I,h),t[L$5.FLOAT]=((l={})[I$7.RGBA]=e.RGBA32F,l[I$7.RGB]=e.RGB32F,l[I$7.RG]=e.RG32F,l[I$7.RED]=e.R32F,l[I$7.DEPTH_COMPONENT]=e.DEPTH_COMPONENT32F,l),t[L$5.HALF_FLOAT]=((f={})[I$7.RGBA]=e.RGBA16F,f[I$7.RGB]=e.RGB16F,f[I$7.RG]=e.RG16F,f[I$7.RED]=e.R16F,f),t[L$5.UNSIGNED_SHORT_5_6_5]=((d={})[I$7.RGB]=e.RGB565,d),t[L$5.UNSIGNED_SHORT_4_4_4_4]=((c={})[I$7.RGBA]=e.RGBA4,c),t[L$5.UNSIGNED_SHORT_5_5_5_1]=((p={})[I$7.RGBA]=e.RGB5_A1,p),t[L$5.UNSIGNED_INT_2_10_10_10_REV]=((v={})[I$7.RGBA]=e.RGB10_A2,v[I$7.RGBA_INTEGER]=e.RGB10_A2UI,v),t[L$5.UNSIGNED_INT_10F_11F_11F_REV]=((m={})[I$7.RGB]=e.R11F_G11F_B10F,m),t[L$5.UNSIGNED_INT_5_9_9_9_REV]=((g={})[I$7.RGB]=e.RGB9_E5,g),t[L$5.UNSIGNED_INT_24_8]=((y={})[I$7.DEPTH_STENCIL]=e.DEPTH24_STENCIL8,y),t[L$5.FLOAT_32_UNSIGNED_INT_24_8_REV]=((_={})[I$7.DEPTH_STENCIL]=e.DEPTH32F_STENCIL8,_),S=t):((b={})[L$5.UNSIGNED_BYTE]=((x={})[I$7.RGBA]=e.RGBA,x[I$7.RGB]=e.RGB,x[I$7.ALPHA]=e.ALPHA,x[I$7.LUMINANCE]=e.LUMINANCE,x[I$7.LUMINANCE_ALPHA]=e.LUMINANCE_ALPHA,x),b[L$5.UNSIGNED_SHORT_5_6_5]=((E={})[I$7.RGB]=e.RGB,E),b[L$5.UNSIGNED_SHORT_4_4_4_4]=((T={})[I$7.RGBA]=e.RGBA,T),b[L$5.UNSIGNED_SHORT_5_5_5_1]=((R={})[I$7.RGBA]=e.RGBA,R),S=b),S}(e);var t=e.getParameter(e.MAX_TEXTURE_IMAGE_UNITS);this.boundTextures.length=t;for(var r=0;r<t;r++)this.boundTextures[r]=null;this.emptyTextures={};var i=new Yt(e.createTexture());e.bindTexture(e.TEXTURE_2D,i.texture),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,new Uint8Array(4)),this.emptyTextures[e.TEXTURE_2D]=i,this.emptyTextures[e.TEXTURE_CUBE_MAP]=new Yt(e.createTexture()),e.bindTexture(e.TEXTURE_CUBE_MAP,this.emptyTextures[e.TEXTURE_CUBE_MAP].texture);for(r=0;r<6;r++)e.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+r,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,null);e.texParameteri(e.TEXTURE_CUBE_MAP,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_CUBE_MAP,e.TEXTURE_MIN_FILTER,e.LINEAR);for(r=0;r<this.boundTextures.length;r++)this.bind(null,r);},e.prototype.bind=function(e,t){void 0===t&&(t=0);var r=this.gl;if((e=null==e?void 0:e.castToBaseTexture())&&e.valid&&!e.parentTextureArray){e.touched=this.renderer.textureGC.count;var i=e._glTextures[this.CONTEXT_UID]||this.initTexture(e);this.boundTextures[t]!==e&&(this.currentLocation!==t&&(this.currentLocation=t,r.activeTexture(r.TEXTURE0+t)),r.bindTexture(e.target,i.texture)),i.dirtyId!==e.dirtyId&&(this.currentLocation!==t&&(this.currentLocation=t,r.activeTexture(r.TEXTURE0+t)),this.updateTexture(e)),this.boundTextures[t]=e;}else this.currentLocation!==t&&(this.currentLocation=t,r.activeTexture(r.TEXTURE0+t)),r.bindTexture(r.TEXTURE_2D,this.emptyTextures[r.TEXTURE_2D].texture),this.boundTextures[t]=null;},e.prototype.reset=function(){this._unknownBoundTextures=!0,this.hasIntegerTextures=!1,this.currentLocation=-1;for(var e=0;e<this.boundTextures.length;e++)this.boundTextures[e]=this.unknownTexture;},e.prototype.unbind=function(e){var t=this.gl,r=this.boundTextures;if(this._unknownBoundTextures){this._unknownBoundTextures=!1;for(var i=0;i<r.length;i++)r[i]===this.unknownTexture&&this.bind(null,i);}for(i=0;i<r.length;i++)r[i]===e&&(this.currentLocation!==i&&(t.activeTexture(t.TEXTURE0+i),this.currentLocation=i),t.bindTexture(e.target,this.emptyTextures[e.target].texture),r[i]=null);},e.prototype.ensureSamplerType=function(e){var t=this,r=t.boundTextures,i=t.hasIntegerTextures,n=t.CONTEXT_UID;if(i)for(var o=e-1;o>=0;--o){var s=r[o];if(s)s._glTextures[n].samplerType!==O$7.FLOAT&&this.renderer.texture.unbind(s);}},e.prototype.initTexture=function(e){var t=new Yt(this.gl.createTexture());return t.dirtyId=-1,e._glTextures[this.CONTEXT_UID]=t,this.managedTextures.push(e),e.on("dispose",this.destroyTexture,this),t},e.prototype.initTextureType=function(e,t){var r,i;t.internalFormat=null!==(i=null===(r=this.internalFormats[e.type])||void 0===r?void 0:r[e.format])&&void 0!==i?i:e.format,2===this.webGLVersion&&e.type===L$5.HALF_FLOAT?t.type=this.gl.HALF_FLOAT:t.type=e.type;},e.prototype.updateTexture=function(e){var t=e._glTextures[this.CONTEXT_UID];if(t){var r=this.renderer;if(this.initTextureType(e,t),e.resource&&e.resource.upload(r,e,t))t.samplerType!==O$7.FLOAT&&(this.hasIntegerTextures=!0);else {var i=e.realWidth,n=e.realHeight,o=r.gl;(t.width!==i||t.height!==n||t.dirtyId<0)&&(t.width=i,t.height=n,o.texImage2D(e.target,0,t.internalFormat,i,n,0,e.format,t.type,null));}e.dirtyStyleId!==t.dirtyStyleId&&this.updateTextureStyle(e),t.dirtyId=e.dirtyId;}},e.prototype.destroyTexture=function(e,t){var r=this.gl;if((e=e.castToBaseTexture())._glTextures[this.CONTEXT_UID]&&(this.unbind(e),r.deleteTexture(e._glTextures[this.CONTEXT_UID].texture),e.off("dispose",this.destroyTexture,this),delete e._glTextures[this.CONTEXT_UID],!t)){var i=this.managedTextures.indexOf(e);-1!==i&&_$9(this.managedTextures,i,1);}},e.prototype.updateTextureStyle=function(e){var t=e._glTextures[this.CONTEXT_UID];t&&(e.mipmap!==P$7.POW2&&2===this.webGLVersion||e.isPowerOfTwo?t.mipmap=e.mipmap>=1:t.mipmap=!1,2===this.webGLVersion||e.isPowerOfTwo?t.wrapMode=e.wrapMode:t.wrapMode=S$5.CLAMP,e.resource&&e.resource.style(this.renderer,e,t)||this.setStyle(e,t),t.dirtyStyleId=e.dirtyStyleId);},e.prototype.setStyle=function(e,t){var r=this.gl;if(t.mipmap&&e.mipmap!==P$7.ON_MANUAL&&r.generateMipmap(e.target),r.texParameteri(e.target,r.TEXTURE_WRAP_S,t.wrapMode),r.texParameteri(e.target,r.TEXTURE_WRAP_T,t.wrapMode),t.mipmap){r.texParameteri(e.target,r.TEXTURE_MIN_FILTER,e.scaleMode===U$5.LINEAR?r.LINEAR_MIPMAP_LINEAR:r.NEAREST_MIPMAP_NEAREST);var n=this.renderer.context.extensions.anisotropicFiltering;if(n&&e.anisotropicLevel>0&&e.scaleMode===U$5.LINEAR){var o=Math.min(e.anisotropicLevel,r.getParameter(n.MAX_TEXTURE_MAX_ANISOTROPY_EXT));r.texParameterf(e.target,n.TEXTURE_MAX_ANISOTROPY_EXT,o);}}else r.texParameteri(e.target,r.TEXTURE_MIN_FILTER,e.scaleMode===U$5.LINEAR?r.LINEAR:r.NEAREST);r.texParameteri(e.target,r.TEXTURE_MAG_FILTER,e.scaleMode===U$5.LINEAR?r.LINEAR:r.NEAREST);},e.prototype.destroy=function(){this.renderer=null;},e}(),Zt=new p$7,$t=function(t){function r(r,i){void 0===r&&(r=_$a.UNKNOWN);var n=t.call(this)||this;return i=Object.assign({},V$2.RENDER_OPTIONS,i),n.options=i,n.type=r,n.screen=new r$4(0,0,i.width,i.height),n.view=i.view||V$2.ADAPTER.createCanvas(),n.resolution=i.resolution||V$2.RESOLUTION,n.useContextAlpha=i.useContextAlpha,n.autoDensity=!!i.autoDensity,n.preserveDrawingBuffer=i.preserveDrawingBuffer,n.clearBeforeRender=i.clearBeforeRender,n._backgroundColor=0,n._backgroundColorRgba=[0,0,0,1],n._backgroundColorString="#000000",n.backgroundColor=i.backgroundColor||n._backgroundColor,n.backgroundAlpha=i.backgroundAlpha,void 0!==i.transparent&&(n.useContextAlpha=i.transparent,n.backgroundAlpha=i.transparent?0:1),n._lastObjectRendered=null,n.plugins={},n}return Z$2(r,t),r.prototype.initPlugins=function(e){for(var t in e)this.plugins[t]=new e[t](this);},Object.defineProperty(r.prototype,"width",{get:function(){return this.view.width},enumerable:!1,configurable:!0}),Object.defineProperty(r.prototype,"height",{get:function(){return this.view.height},enumerable:!1,configurable:!0}),r.prototype.resize=function(e,t){this.view.width=Math.round(e*this.resolution),this.view.height=Math.round(t*this.resolution);var r=this.view.width/this.resolution,i=this.view.height/this.resolution;this.screen.width=r,this.screen.height=i,this.autoDensity&&(this.view.style.width=r+"px",this.view.style.height=i+"px"),this.emit("resize",r,i);},r.prototype.generateTexture=function(e,t,r,i){void 0===t&&(t={}),"number"==typeof t&&(t={scaleMode:t,resolution:r,region:i});var n=t.region,o=function(e,t){var r={};for(var i in e)Object.prototype.hasOwnProperty.call(e,i)&&t.indexOf(i)<0&&(r[i]=e[i]);if(null!=e&&"function"==typeof Object.getOwnPropertySymbols){var n=0;for(i=Object.getOwnPropertySymbols(e);n<i.length;n++)t.indexOf(i[n])<0&&Object.prototype.propertyIsEnumerable.call(e,i[n])&&(r[i[n]]=e[i[n]]);}return r}(t,["region"]);0===(i=n||e.getLocalBounds(null,!0)).width&&(i.width=1),0===i.height&&(i.height=1);var s=_e.create($$2({width:i.width,height:i.height},o));return Zt.tx=-i.x,Zt.ty=-i.y,this.render(e,{renderTexture:s,clear:!1,transform:Zt,skipUpdateTransform:!!e.parent}),s},r.prototype.destroy=function(e){for(var t in this.plugins)this.plugins[t].destroy(),this.plugins[t]=null;e&&this.view.parentNode&&this.view.parentNode.removeChild(this.view);var r=this;r.plugins=null,r.type=_$a.UNKNOWN,r.view=null,r.screen=null,r._tempDisplayObjectParent=null,r.options=null,this._backgroundColorRgba=null,this._backgroundColorString=null,this._lastObjectRendered=null;},Object.defineProperty(r.prototype,"backgroundColor",{get:function(){return this._backgroundColor},set:function(e){this._backgroundColor=e,this._backgroundColorString=g$8(e),s$7(e,this._backgroundColorRgba);},enumerable:!1,configurable:!0}),Object.defineProperty(r.prototype,"backgroundAlpha",{get:function(){return this._backgroundColorRgba[3]},set:function(e){this._backgroundColorRgba[3]=e;},enumerable:!1,configurable:!0}),r}(r$5),Jt=function(e){this.buffer=e||null,this.updateID=-1,this.byteLength=-1,this.refCount=0;},Qt=function(){function e(e){this.renderer=e,this.managedBuffers={},this.boundBufferBases={};}return e.prototype.destroy=function(){this.renderer=null;},e.prototype.contextChange=function(){this.disposeAll(!0),this.gl=this.renderer.gl,this.CONTEXT_UID=this.renderer.CONTEXT_UID;},e.prototype.bind=function(e){var t=this.gl,r=this.CONTEXT_UID,i=e._glBuffers[r]||this.createGLBuffer(e);t.bindBuffer(e.type,i.buffer);},e.prototype.bindBufferBase=function(e,t){var r=this.gl,i=this.CONTEXT_UID;if(this.boundBufferBases[t]!==e){var n=e._glBuffers[i]||this.createGLBuffer(e);this.boundBufferBases[t]=e,r.bindBufferBase(r.UNIFORM_BUFFER,t,n.buffer);}},e.prototype.bindBufferRange=function(e,t,r){var i=this.gl,n=this.CONTEXT_UID;r=r||0;var o=e._glBuffers[n]||this.createGLBuffer(e);i.bindBufferRange(i.UNIFORM_BUFFER,t||0,o.buffer,256*r,256);},e.prototype.update=function(e){var t=this.gl,r=this.CONTEXT_UID,i=e._glBuffers[r];if(e._updateID!==i.updateID)if(i.updateID=e._updateID,t.bindBuffer(e.type,i.buffer),i.byteLength>=e.data.byteLength)t.bufferSubData(e.type,0,e.data);else {var n=e.static?t.STATIC_DRAW:t.DYNAMIC_DRAW;i.byteLength=e.data.byteLength,t.bufferData(e.type,e.data,n);}},e.prototype.dispose=function(e,t){if(this.managedBuffers[e.id]){delete this.managedBuffers[e.id];var r=e._glBuffers[this.CONTEXT_UID],i=this.gl;e.disposeRunner.remove(this),r&&(t||i.deleteBuffer(r.buffer),delete e._glBuffers[this.CONTEXT_UID]);}},e.prototype.disposeAll=function(e){for(var t=Object.keys(this.managedBuffers),r=0;r<t.length;r++)this.dispose(this.managedBuffers[t[r]],e);},e.prototype.createGLBuffer=function(e){var t=this.CONTEXT_UID,r=this.gl;return e._glBuffers[t]=new Jt(r.createBuffer()),this.managedBuffers[e.id]=e,e.disposeRunner.add(this),e._glBuffers[t]},e}(),er=function(e){function t(r){var i=e.call(this,_$a.WEBGL,r)||this;return r=i.options,i.gl=null,i.CONTEXT_UID=0,i.runners={destroy:new t$1("destroy"),contextChange:new t$1("contextChange"),reset:new t$1("reset"),update:new t$1("update"),postrender:new t$1("postrender"),prerender:new t$1("prerender"),resize:new t$1("resize")},i.runners.contextChange.add(i),i.globalUniforms=new Oe({projectionMatrix:new p$7},!0),i.addSystem(Tt,"mask").addSystem(ke,"context").addSystem(Xt,"state").addSystem(zt,"shader").addSystem(Kt,"texture").addSystem(Qt,"buffer").addSystem(Xe,"geometry").addSystem(je,"framebuffer").addSystem(At,"scissor").addSystem(It,"stencil").addSystem(Ct,"projection").addSystem(Wt,"textureGC").addSystem(Ue,"filter").addSystem(Ot,"renderTexture").addSystem(De,"batch"),i.initPlugins(t.__plugins),i.multisample=void 0,r.context?i.context.initFromContext(r.context):i.context.initFromOptions({alpha:!!i.useContextAlpha,antialias:r.antialias,premultipliedAlpha:i.useContextAlpha&&"notMultiplied"!==i.useContextAlpha,stencil:!0,preserveDrawingBuffer:r.preserveDrawingBuffer,powerPreference:i.options.powerPreference}),i.renderingToScreen=!0,c$b(2===i.context.webGLVersion?"WebGL 2":"WebGL 1"),i.resize(i.options.width,i.options.height),i}return Z$2(t,e),t.create=function(e){if(d$a())return new t(e);throw new Error('WebGL unsupported in this browser, use "pixi.js-legacy" for fallback canvas2d support.')},t.prototype.contextChange=function(){var e,t=this.gl;if(1===this.context.webGLVersion){var r=t.getParameter(t.FRAMEBUFFER_BINDING);t.bindFramebuffer(t.FRAMEBUFFER,null),e=t.getParameter(t.SAMPLES),t.bindFramebuffer(t.FRAMEBUFFER,r);}else {r=t.getParameter(t.DRAW_FRAMEBUFFER_BINDING);t.bindFramebuffer(t.DRAW_FRAMEBUFFER,null),e=t.getParameter(t.SAMPLES),t.bindFramebuffer(t.DRAW_FRAMEBUFFER,r);}e>=F$4.HIGH?this.multisample=F$4.HIGH:e>=F$4.MEDIUM?this.multisample=F$4.MEDIUM:e>=F$4.LOW?this.multisample=F$4.LOW:this.multisample=F$4.NONE;},t.prototype.addSystem=function(e,t){var r=new e(this);if(this[t])throw new Error('Whoops! The name "'+t+'" is already in use');for(var i in this[t]=r,this.runners)this.runners[i].add(r);return this},t.prototype.render=function(e,t){var r,i,n,o;if(t&&(t instanceof _e?(r=t,i=arguments[2],n=arguments[3],o=arguments[4]):(r=t.renderTexture,i=t.clear,n=t.transform,o=t.skipUpdateTransform)),this.renderingToScreen=!r,this.runners.prerender.emit(),this.emit("prerender"),this.projection.transform=n,!this.context.isLost){if(r||(this._lastObjectRendered=e),!o){var s=e.enableTempParent();e.updateTransform(),e.disableTempParent(s);}this.renderTexture.bind(r),this.batch.currentRenderer.start(),(void 0!==i?i:this.clearBeforeRender)&&this.renderTexture.clear(),e.render(this),this.batch.currentRenderer.flush(),r&&r.baseTexture.update(),this.runners.postrender.emit(),this.projection.transform=null,this.emit("postrender");}},t.prototype.generateTexture=function(t,r,i,n){void 0===r&&(r={});var o=e.prototype.generateTexture.call(this,t,r,i,n);return this.framebuffer.blit(),o},t.prototype.resize=function(t,r){e.prototype.resize.call(this,t,r),this.runners.resize.emit(this.screen.height,this.screen.width);},t.prototype.reset=function(){return this.runners.reset.emit(),this},t.prototype.clear=function(){this.renderTexture.bind(),this.renderTexture.clear();},t.prototype.destroy=function(t){for(var r in this.runners.destroy.emit(),this.runners)this.runners[r].destroy();e.prototype.destroy.call(this,t),this.gl=null;},Object.defineProperty(t.prototype,"extract",{get:function(){return this.plugins.extract},enumerable:!1,configurable:!0}),t.registerPlugin=function(e,t){t$2.add({name:e,type:e$2.RendererPlugin,ref:t});},t.__plugins={},t}($t);function tr(e){return er.create(e)}t$2.handleByMap(e$2.RendererPlugin,er.__plugins);var rr="attribute vec2 aVertexPosition;\nattribute vec2 aTextureCoord;\n\nuniform mat3 projectionMatrix;\n\nvarying vec2 vTextureCoord;\n\nvoid main(void)\n{\n    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);\n    vTextureCoord = aTextureCoord;\n}",ir="attribute vec2 aVertexPosition;\n\nuniform mat3 projectionMatrix;\n\nvarying vec2 vTextureCoord;\n\nuniform vec4 inputSize;\nuniform vec4 outputFrame;\n\nvec4 filterVertexPosition( void )\n{\n    vec2 position = aVertexPosition * max(outputFrame.zw, vec2(0.)) + outputFrame.xy;\n\n    return vec4((projectionMatrix * vec3(position, 1.0)).xy, 0.0, 1.0);\n}\n\nvec2 filterTextureCoord( void )\n{\n    return aVertexPosition * (outputFrame.zw * inputSize.zw);\n}\n\nvoid main(void)\n{\n    gl_Position = filterVertexPosition();\n    vTextureCoord = filterTextureCoord();\n}\n",or=function(){this.texArray=null,this.blend=0,this.type=R$5.TRIANGLES,this.start=0,this.size=0,this.data=null;},sr=function(){function e(){this.elements=[],this.ids=[],this.count=0;}return e.prototype.clear=function(){for(var e=0;e<this.count;e++)this.elements[e]=null;this.count=0;},e}(),ar=function(){function e(e){"number"==typeof e?this.rawBinaryData=new ArrayBuffer(e):e instanceof Uint8Array?this.rawBinaryData=e.buffer:this.rawBinaryData=e,this.uint32View=new Uint32Array(this.rawBinaryData),this.float32View=new Float32Array(this.rawBinaryData);}return Object.defineProperty(e.prototype,"int8View",{get:function(){return this._int8View||(this._int8View=new Int8Array(this.rawBinaryData)),this._int8View},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"uint8View",{get:function(){return this._uint8View||(this._uint8View=new Uint8Array(this.rawBinaryData)),this._uint8View},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"int16View",{get:function(){return this._int16View||(this._int16View=new Int16Array(this.rawBinaryData)),this._int16View},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"uint16View",{get:function(){return this._uint16View||(this._uint16View=new Uint16Array(this.rawBinaryData)),this._uint16View},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"int32View",{get:function(){return this._int32View||(this._int32View=new Int32Array(this.rawBinaryData)),this._int32View},enumerable:!1,configurable:!0}),e.prototype.view=function(e){return this[e+"View"]},e.prototype.destroy=function(){this.rawBinaryData=null,this._int8View=null,this._uint8View=null,this._int16View=null,this._uint16View=null,this._int32View=null,this.uint32View=null,this.float32View=null;},e.sizeOf=function(e){switch(e){case"int8":case"uint8":return 1;case"int16":case"uint16":return 2;case"int32":case"uint32":case"float32":return 4;default:throw new Error(e+" isn't a valid view type")}},e}(),ur=function(r){function i(t){var i=r.call(this,t)||this;return i.shaderGenerator=null,i.geometryClass=null,i.vertexSize=null,i.state=yt.for2d(),i.size=4*V$2.SPRITE_BATCH_SIZE,i._vertexCount=0,i._indexCount=0,i._bufferedElements=[],i._bufferedTextures=[],i._bufferSize=0,i._shader=null,i._packedGeometries=[],i._packedGeometryPoolSize=2,i._flushId=0,i._aBuffers={},i._iBuffers={},i.MAX_TEXTURES=1,i.renderer.on("prerender",i.onPrerender,i),t.runners.contextChange.add(i),i._dcIndex=0,i._aIndex=0,i._iIndex=0,i._attributeBuffer=null,i._indexBuffer=null,i._tempBoundTextures=[],i}return Z$2(i,r),i.prototype.contextChange=function(){var r=this.renderer.gl;V$2.PREFER_ENV===E$6.WEBGL_LEGACY?this.MAX_TEXTURES=1:(this.MAX_TEXTURES=Math.min(r.getParameter(r.MAX_TEXTURE_IMAGE_UNITS),V$2.SPRITE_MAX_TEXTURES),this.MAX_TEXTURES=ct(this.MAX_TEXTURES,r)),this._shader=this.shaderGenerator.generateShader(this.MAX_TEXTURES);for(var i=0;i<this._packedGeometryPoolSize;i++)this._packedGeometries[i]=new this.geometryClass;this.initFlushBuffers();},i.prototype.initFlushBuffers=function(){for(var e=i._drawCallPool,t=i._textureArrayPool,r=this.size/4,n=Math.floor(r/this.MAX_TEXTURES)+1;e.length<r;)e.push(new or);for(;t.length<n;)t.push(new sr);for(var o=0;o<this.MAX_TEXTURES;o++)this._tempBoundTextures[o]=null;},i.prototype.onPrerender=function(){this._flushId=0;},i.prototype.render=function(e){e._texture.valid&&(this._vertexCount+e.vertexData.length/2>this.size&&this.flush(),this._vertexCount+=e.vertexData.length/2,this._indexCount+=e.indices.length,this._bufferedTextures[this._bufferSize]=e._texture.baseTexture,this._bufferedElements[this._bufferSize++]=e);},i.prototype.buildTexturesAndDrawCalls=function(){var e=this._bufferedTextures,t=this.MAX_TEXTURES,r=i._textureArrayPool,n=this.renderer.batch,o=this._tempBoundTextures,s=this.renderer.textureGC.count,a=++te._globalBatch,u=0,h=r[0],l=0;n.copyBoundTextures(o,t);for(var f=0;f<this._bufferSize;++f){var d=e[f];e[f]=null,d._batchEnabled!==a&&(h.count>=t&&(n.boundArray(h,o,a,t),this.buildDrawCalls(h,l,f),l=f,h=r[++u],++a),d._batchEnabled=a,d.touched=s,h.elements[h.count++]=d);}h.count>0&&(n.boundArray(h,o,a,t),this.buildDrawCalls(h,l,this._bufferSize),++u,++a);for(f=0;f<o.length;f++)o[f]=null;te._globalBatch=a;},i.prototype.buildDrawCalls=function(e,t,r){var n=this,o=n._bufferedElements,s=n._attributeBuffer,a=n._indexBuffer,u=n.vertexSize,h=i._drawCallPool,l=this._dcIndex,f=this._aIndex,d=this._iIndex,c=h[l];c.start=this._iIndex,c.texArray=e;for(var p=t;p<r;++p){var v=o[p],m=v._texture.baseTexture,g=p$8[m.alphaMode?1:0][v.blendMode];o[p]=null,t<p&&c.blend!==g&&(c.size=d-c.start,t=p,(c=h[++l]).texArray=e,c.start=d),this.packInterleavedGeometry(v,s,a,f,d),f+=v.vertexData.length/2*u,d+=v.indices.length,c.blend=g;}t<r&&(c.size=d-c.start,++l),this._dcIndex=l,this._aIndex=f,this._iIndex=d;},i.prototype.bindAndClearTexArray=function(e){for(var t=this.renderer.texture,r=0;r<e.count;r++)t.bind(e.elements[r],e.ids[r]),e.elements[r]=null;e.count=0;},i.prototype.updateGeometry=function(){var t=this,r=t._packedGeometries,i=t._attributeBuffer,n=t._indexBuffer;V$2.CAN_UPLOAD_SAME_BUFFER?(r[this._flushId]._buffer.update(i.rawBinaryData),r[this._flushId]._indexBuffer.update(n),this.renderer.geometry.updateBuffers()):(this._packedGeometryPoolSize<=this._flushId&&(this._packedGeometryPoolSize++,r[this._flushId]=new this.geometryClass),r[this._flushId]._buffer.update(i.rawBinaryData),r[this._flushId]._indexBuffer.update(n),this.renderer.geometry.bind(r[this._flushId]),this.renderer.geometry.updateBuffers(),this._flushId++);},i.prototype.drawBatches=function(){for(var e=this._dcIndex,t=this.renderer,r=t.gl,n=t.state,o=i._drawCallPool,s=null,a=0;a<e;a++){var u=o[a],h=u.texArray,l=u.type,f=u.size,d=u.start,c=u.blend;s!==h&&(s=h,this.bindAndClearTexArray(h)),this.state.blendMode=c,n.set(this.state),r.drawElements(l,f,r.UNSIGNED_SHORT,2*d);}},i.prototype.flush=function(){0!==this._vertexCount&&(this._attributeBuffer=this.getAttributeBuffer(this._vertexCount),this._indexBuffer=this.getIndexBuffer(this._indexCount),this._aIndex=0,this._iIndex=0,this._dcIndex=0,this.buildTexturesAndDrawCalls(),this.updateGeometry(),this.drawBatches(),this._bufferSize=0,this._vertexCount=0,this._indexCount=0);},i.prototype.start=function(){this.renderer.state.set(this.state),this.renderer.texture.ensureSamplerType(this.MAX_TEXTURES),this.renderer.shader.bind(this._shader),V$2.CAN_UPLOAD_SAME_BUFFER&&this.renderer.geometry.bind(this._packedGeometries[this._flushId]);},i.prototype.stop=function(){this.flush();},i.prototype.destroy=function(){for(var e=0;e<this._packedGeometryPoolSize;e++)this._packedGeometries[e]&&this._packedGeometries[e].destroy();this.renderer.off("prerender",this.onPrerender,this),this._aBuffers=null,this._iBuffers=null,this._packedGeometries=null,this._attributeBuffer=null,this._indexBuffer=null,this._shader&&(this._shader.destroy(),this._shader=null),r.prototype.destroy.call(this);},i.prototype.getAttributeBuffer=function(e){var t=R$4(Math.ceil(e/8)),r=P$6(t),i=8*t;this._aBuffers.length<=r&&(this._iBuffers.length=r+1);var n=this._aBuffers[i];return n||(this._aBuffers[i]=n=new ar(i*this.vertexSize*4)),n},i.prototype.getIndexBuffer=function(e){var t=R$4(Math.ceil(e/12)),r=P$6(t),i=12*t;this._iBuffers.length<=r&&(this._iBuffers.length=r+1);var n=this._iBuffers[r];return n||(this._iBuffers[r]=n=new Uint16Array(i)),n},i.prototype.packInterleavedGeometry=function(e,t,r,i,n){for(var o=t.uint32View,s=t.float32View,a=i/this.vertexSize,u=e.uvs,h=e.indices,l=e.vertexData,f=e._texture.baseTexture._batchLocation,d=Math.min(e.worldAlpha,1),c=d<1&&e._texture.baseTexture.alphaMode?y$9(e._tintRGB,d):e._tintRGB+(255*d<<24),p=0;p<l.length;p+=2)s[i++]=l[p],s[i++]=l[p+1],s[i++]=u[p],s[i++]=u[p+1],o[i++]=c,s[i++]=f;for(p=0;p<h.length;p++)r[n++]=a+h[p];},i._drawCallPool=[],i._textureArrayPool=[],i}(Le),hr=function(){function e(e,t){if(this.vertexSrc=e,this.fragTemplate=t,this.programCache={},this.defaultGroupCache={},t.indexOf("%count%")<0)throw new Error('Fragment template must contain "%count%".');if(t.indexOf("%forloop%")<0)throw new Error('Fragment template must contain "%forloop%".')}return e.prototype.generateShader=function(e){if(!this.programCache[e]){for(var t=new Int32Array(e),r=0;r<e;r++)t[r]=r;this.defaultGroupCache[e]=Oe.from({uSamplers:t},!0);var i=this.fragTemplate;i=(i=i.replace(/%count%/gi,""+e)).replace(/%forloop%/gi,this.generateSampleSrc(e)),this.programCache[e]=new mt(this.vertexSrc,i);}var n={tint:new Float32Array([1,1,1,1]),translationMatrix:new p$7,default:this.defaultGroupCache[e]};return new gt(this.programCache[e],n)},e.prototype.generateSampleSrc=function(e){var t="";t+="\n",t+="\n";for(var r=0;r<e;r++)r>0&&(t+="\nelse "),r<e-1&&(t+="if(vTextureId < "+r+".5)"),t+="\n{",t+="\n\tcolor = texture2D(uSamplers["+r+"], vTextureCoord);",t+="\n}";return t+="\n",t+="\n"},e}(),lr=function(e){function t(t){void 0===t&&(t=!1);var r=e.call(this)||this;return r._buffer=new Te(null,t,!1),r._indexBuffer=new Te(null,t,!0),r.addAttribute("aVertexPosition",r._buffer,2,!1,L$5.FLOAT).addAttribute("aTextureCoord",r._buffer,2,!1,L$5.FLOAT).addAttribute("aColor",r._buffer,4,!0,L$5.UNSIGNED_BYTE).addAttribute("aTextureId",r._buffer,1,!0,L$5.FLOAT).addIndex(r._indexBuffer),r}return Z$2(t,e),t}(Ie),fr="precision highp float;\nattribute vec2 aVertexPosition;\nattribute vec2 aTextureCoord;\nattribute vec4 aColor;\nattribute float aTextureId;\n\nuniform mat3 projectionMatrix;\nuniform mat3 translationMatrix;\nuniform vec4 tint;\n\nvarying vec2 vTextureCoord;\nvarying vec4 vColor;\nvarying float vTextureId;\n\nvoid main(void){\n    gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);\n\n    vTextureCoord = aTextureCoord;\n    vTextureId = aTextureId;\n    vColor = aColor * tint;\n}\n",dr="varying vec2 vTextureCoord;\nvarying vec4 vColor;\nvarying float vTextureId;\nuniform sampler2D uSamplers[%count%];\n\nvoid main(void){\n    vec4 color;\n    %forloop%\n    gl_FragColor = color * vColor;\n}\n",cr=function(){function e(){}return e.create=function(e){var t=Object.assign({vertex:fr,fragment:dr,geometryClass:lr,vertexSize:6},e),r=t.vertex,i=t.fragment,n=t.vertexSize,o=t.geometryClass;return function(e){function t(t){var s=e.call(this,t)||this;return s.shaderGenerator=new hr(r,i),s.geometryClass=o,s.vertexSize=n,s}return Z$2(t,e),t}(ur)},Object.defineProperty(e,"defaultVertexSrc",{get:function(){return fr},enumerable:!1,configurable:!0}),Object.defineProperty(e,"defaultFragmentTemplate",{get:function(){return dr},enumerable:!1,configurable:!0}),e}(),pr=cr.create();Object.assign(pr,{extension:{name:"batch",type:e$2.RendererPlugin}});

  /*!
   * @pixi/accessibility - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/accessibility is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  var n$6={accessible:!1,accessibleTitle:null,accessibleHint:null,tabIndex:0,_accessibleActive:!1,_accessibleDiv:null,accessibleType:"button",accessiblePointerEvents:"auto",accessibleChildren:!0,renderId:-1};U$4.mixin(n$6);var o$8=function(){function e(e){this.debug=!1,this._isActive=!1,this._isMobileAccessibility=!1,this.pool=[],this.renderId=0,this.children=[],this.androidUpdateCount=0,this.androidUpdateFrequency=500,this._hookDiv=null,(X$2.tablet||X$2.phone)&&this.createTouchHook();var i=document.createElement("div");i.style.width="100px",i.style.height="100px",i.style.position="absolute",i.style.top="0px",i.style.left="0px",i.style.zIndex=2..toString(),this.div=i,this.renderer=e,this._onKeyDown=this._onKeyDown.bind(this),this._onMouseMove=this._onMouseMove.bind(this),globalThis.addEventListener("keydown",this._onKeyDown,!1);}return Object.defineProperty(e.prototype,"isActive",{get:function(){return this._isActive},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"isMobileAccessibility",{get:function(){return this._isMobileAccessibility},enumerable:!1,configurable:!0}),e.prototype.createTouchHook=function(){var e=this,t=document.createElement("button");t.style.width="1px",t.style.height="1px",t.style.position="absolute",t.style.top="-1000px",t.style.left="-1000px",t.style.zIndex=2..toString(),t.style.backgroundColor="#FF0000",t.title="select to enable accessibility for this content",t.addEventListener("focus",(function(){e._isMobileAccessibility=!0,e.activate(),e.destroyTouchHook();})),document.body.appendChild(t),this._hookDiv=t;},e.prototype.destroyTouchHook=function(){this._hookDiv&&(document.body.removeChild(this._hookDiv),this._hookDiv=null);},e.prototype.activate=function(){var e;this._isActive||(this._isActive=!0,globalThis.document.addEventListener("mousemove",this._onMouseMove,!0),globalThis.removeEventListener("keydown",this._onKeyDown,!1),this.renderer.on("postrender",this.update,this),null===(e=this.renderer.view.parentNode)||void 0===e||e.appendChild(this.div));},e.prototype.deactivate=function(){var e;this._isActive&&!this._isMobileAccessibility&&(this._isActive=!1,globalThis.document.removeEventListener("mousemove",this._onMouseMove,!0),globalThis.addEventListener("keydown",this._onKeyDown,!1),this.renderer.off("postrender",this.update),null===(e=this.div.parentNode)||void 0===e||e.removeChild(this.div));},e.prototype.updateAccessibleObjects=function(e){if(e.visible&&e.accessibleChildren){e.accessible&&e.interactive&&(e._accessibleActive||this.addChild(e),e.renderId=this.renderId);var t=e.children;if(t)for(var i=0;i<t.length;i++)this.updateAccessibleObjects(t[i]);}},e.prototype.update=function(){var e=performance.now();if(!(X$2.android.device&&e<this.androidUpdateCount)&&(this.androidUpdateCount=e+this.androidUpdateFrequency,this.renderer.renderingToScreen)){this.renderer._lastObjectRendered&&this.updateAccessibleObjects(this.renderer._lastObjectRendered);var s=this.renderer.view.getBoundingClientRect(),n=s.left,o=s.top,r=s.width,l=s.height,a=this.renderer,c=a.width,d=a.height,h=a.resolution,p=r/c*h,u=l/d*h,b=this.div;b.style.left=n+"px",b.style.top=o+"px",b.style.width=c+"px",b.style.height=d+"px";for(var v=0;v<this.children.length;v++){var y=this.children[v];if(y.renderId!==this.renderId)y._accessibleActive=!1,_$9(this.children,v,1),this.div.removeChild(y._accessibleDiv),this.pool.push(y._accessibleDiv),y._accessibleDiv=null,v--;else {b=y._accessibleDiv;var g=y.hitArea,x=y.worldTransform;y.hitArea?(b.style.left=(x.tx+g.x*x.a)*p+"px",b.style.top=(x.ty+g.y*x.d)*u+"px",b.style.width=g.width*x.a*p+"px",b.style.height=g.height*x.d*u+"px"):(g=y.getBounds(),this.capHitArea(g),b.style.left=g.x*p+"px",b.style.top=g.y*u+"px",b.style.width=g.width*p+"px",b.style.height=g.height*u+"px",b.title!==y.accessibleTitle&&null!==y.accessibleTitle&&(b.title=y.accessibleTitle),b.getAttribute("aria-label")!==y.accessibleHint&&null!==y.accessibleHint&&b.setAttribute("aria-label",y.accessibleHint)),y.accessibleTitle===b.title&&y.tabIndex===b.tabIndex||(b.title=y.accessibleTitle,b.tabIndex=y.tabIndex,this.debug&&this.updateDebugHTML(b));}}this.renderId++;}},e.prototype.updateDebugHTML=function(e){e.innerHTML="type: "+e.type+"</br> title : "+e.title+"</br> tabIndex: "+e.tabIndex;},e.prototype.capHitArea=function(e){e.x<0&&(e.width+=e.x,e.x=0),e.y<0&&(e.height+=e.y,e.y=0);var t=this.renderer,i=t.width,s=t.height;e.x+e.width>i&&(e.width=i-e.x),e.y+e.height>s&&(e.height=s-e.y);},e.prototype.addChild=function(e){var t=this.pool.pop();t||((t=document.createElement("button")).style.width="100px",t.style.height="100px",t.style.backgroundColor=this.debug?"rgba(255,255,255,0.5)":"transparent",t.style.position="absolute",t.style.zIndex=2..toString(),t.style.borderStyle="none",navigator.userAgent.toLowerCase().indexOf("chrome")>-1?t.setAttribute("aria-live","off"):t.setAttribute("aria-live","polite"),navigator.userAgent.match(/rv:.*Gecko\//)?t.setAttribute("aria-relevant","additions"):t.setAttribute("aria-relevant","text"),t.addEventListener("click",this._onClick.bind(this)),t.addEventListener("focus",this._onFocus.bind(this)),t.addEventListener("focusout",this._onFocusOut.bind(this))),t.style.pointerEvents=e.accessiblePointerEvents,t.type=e.accessibleType,e.accessibleTitle&&null!==e.accessibleTitle?t.title=e.accessibleTitle:e.accessibleHint&&null!==e.accessibleHint||(t.title="displayObject "+e.tabIndex),e.accessibleHint&&null!==e.accessibleHint&&t.setAttribute("aria-label",e.accessibleHint),this.debug&&this.updateDebugHTML(t),e._accessibleActive=!0,e._accessibleDiv=t,t.displayObject=e,this.children.push(e),this.div.appendChild(e._accessibleDiv),e._accessibleDiv.tabIndex=e.tabIndex;},e.prototype._onClick=function(e){var t=this.renderer.plugins.interaction,i=e.target.displayObject,s=t.eventData;t.dispatchEvent(i,"click",s),t.dispatchEvent(i,"pointertap",s),t.dispatchEvent(i,"tap",s);},e.prototype._onFocus=function(e){e.target.getAttribute("aria-live")||e.target.setAttribute("aria-live","assertive");var t=this.renderer.plugins.interaction,i=e.target.displayObject,s=t.eventData;t.dispatchEvent(i,"mouseover",s);},e.prototype._onFocusOut=function(e){e.target.getAttribute("aria-live")||e.target.setAttribute("aria-live","polite");var t=this.renderer.plugins.interaction,i=e.target.displayObject,s=t.eventData;t.dispatchEvent(i,"mouseout",s);},e.prototype._onKeyDown=function(e){9===e.keyCode&&this.activate();},e.prototype._onMouseMove=function(e){0===e.movementX&&0===e.movementY||this.deactivate();},e.prototype.destroy=function(){this.destroyTouchHook(),this.div=null,globalThis.document.removeEventListener("mousemove",this._onMouseMove,!0),globalThis.removeEventListener("keydown",this._onKeyDown),this.pool=null,this.children=null,this.renderer=null;},e.extension={name:"accessibility",type:[e$2.RendererPlugin,e$2.CanvasRendererPlugin]},e}();

  /*!
   * @pixi/interaction - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/interaction is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  var a$5=function(){function e(){this.pressure=0,this.rotationAngle=0,this.twist=0,this.tangentialPressure=0,this.global=new o$9,this.target=null,this.originalEvent=null,this.identifier=null,this.isPrimary=!1,this.button=0,this.buttons=0,this.width=0,this.height=0,this.tiltX=0,this.tiltY=0,this.pointerType=null,this.pressure=0,this.rotationAngle=0,this.twist=0,this.tangentialPressure=0;}return Object.defineProperty(e.prototype,"pointerId",{get:function(){return this.identifier},enumerable:!1,configurable:!0}),e.prototype.getLocalPosition=function(t,e,i){return t.worldTransform.applyInverse(i||this.global,e)},e.prototype.copyEvent=function(t){"isPrimary"in t&&t.isPrimary&&(this.isPrimary=!0),this.button="button"in t&&t.button;var e="buttons"in t&&t.buttons;this.buttons=Number.isInteger(e)?e:"which"in t&&t.which,this.width="width"in t&&t.width,this.height="height"in t&&t.height,this.tiltX="tiltX"in t&&t.tiltX,this.tiltY="tiltY"in t&&t.tiltY,this.pointerType="pointerType"in t&&t.pointerType,this.pressure="pressure"in t&&t.pressure,this.rotationAngle="rotationAngle"in t&&t.rotationAngle,this.twist="twist"in t&&t.twist||0,this.tangentialPressure="tangentialPressure"in t&&t.tangentialPressure||0;},e.prototype.reset=function(){this.isPrimary=!1;},e}(),h$4=function(t,e){return h$4=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,e){t.__proto__=e;}||function(t,e){for(var i in e)e.hasOwnProperty(i)&&(t[i]=e[i]);},h$4(t,e)};var p$5=function(){function t(){this.stopped=!1,this.stopsPropagatingAt=null,this.stopPropagationHint=!1,this.target=null,this.currentTarget=null,this.type=null,this.data=null;}return t.prototype.stopPropagation=function(){this.stopped=!0,this.stopPropagationHint=!0,this.stopsPropagatingAt=this.currentTarget;},t.prototype.reset=function(){this.stopped=!1,this.stopsPropagatingAt=null,this.stopPropagationHint=!1,this.currentTarget=null,this.target=null;},t}(),c$8=function(){function t(e){this._pointerId=e,this._flags=t.FLAGS.NONE;}return t.prototype._doSet=function(t,e){this._flags=e?this._flags|t:this._flags&~t;},Object.defineProperty(t.prototype,"pointerId",{get:function(){return this._pointerId},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"flags",{get:function(){return this._flags},set:function(t){this._flags=t;},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"none",{get:function(){return this._flags===t.FLAGS.NONE},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"over",{get:function(){return 0!=(this._flags&t.FLAGS.OVER)},set:function(e){this._doSet(t.FLAGS.OVER,e);},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"rightDown",{get:function(){return 0!=(this._flags&t.FLAGS.RIGHT_DOWN)},set:function(e){this._doSet(t.FLAGS.RIGHT_DOWN,e);},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"leftDown",{get:function(){return 0!=(this._flags&t.FLAGS.LEFT_DOWN)},set:function(e){this._doSet(t.FLAGS.LEFT_DOWN,e);},enumerable:!1,configurable:!0}),t.FLAGS=Object.freeze({NONE:0,OVER:1,LEFT_DOWN:2,RIGHT_DOWN:4}),t}(),u$7=function(){function e(){this._tempPoint=new o$9;}return e.prototype.recursiveFindHit=function(t,e,i,n,o){var r;if(!e||!e.visible)return !1;var s=t.data.global,a=!1,h=o=e.interactive||o,p=!0;if(e.hitArea)n&&(e.worldTransform.applyInverse(s,this._tempPoint),e.hitArea.contains(this._tempPoint.x,this._tempPoint.y)?a=!0:(n=!1,p=!1)),h=!1;else if(e._mask&&n){var c=e._mask.isMaskData?e._mask.maskObject:e._mask;c&&!(null===(r=c.containsPoint)||void 0===r?void 0:r.call(c,s))&&(n=!1);}if(p&&e.interactiveChildren&&e.children)for(var u=e.children,l=u.length-1;l>=0;l--){var v=u[l],d=this.recursiveFindHit(t,v,i,n,h);if(d){if(!v.parent)continue;h=!1,d&&(t.target&&(n=!1),a=!0);}}return o&&(n&&!t.target&&!e.hitArea&&e.containsPoint&&e.containsPoint(s)&&(a=!0),e.interactive&&(a&&!t.target&&(t.target=e),i&&i(t,e,!!a))),a},e.prototype.findHit=function(t,e,i,n){this.recursiveFindHit(t,e,i,n,!1);},e}(),l$7={interactive:!1,interactiveChildren:!0,hitArea:null,get buttonMode(){return "pointer"===this.cursor},set buttonMode(t){t?this.cursor="pointer":"pointer"===this.cursor&&(this.cursor=null);},cursor:null,get trackedPointers(){return void 0===this._trackedPointers&&(this._trackedPointers={}),this._trackedPointers},_trackedPointers:void 0};U$4.mixin(l$7);var v$5={target:null,data:{global:null}},d$7=function(t){function n(e,i){var n=t.call(this)||this;return i=i||{},n.renderer=e,n.autoPreventDefault=void 0===i.autoPreventDefault||i.autoPreventDefault,n.interactionFrequency=i.interactionFrequency||10,n.mouse=new a$5,n.mouse.identifier=1,n.mouse.global.set(-999999),n.activeInteractionData={},n.activeInteractionData[1]=n.mouse,n.interactionDataPool=[],n.eventData=new p$5,n.interactionDOMElement=null,n.moveWhenInside=!1,n.eventsAdded=!1,n.tickerAdded=!1,n.mouseOverRenderer=!("PointerEvent"in globalThis),n.supportsTouchEvents="ontouchstart"in globalThis,n.supportsPointerEvents=!!globalThis.PointerEvent,n.onPointerUp=n.onPointerUp.bind(n),n.processPointerUp=n.processPointerUp.bind(n),n.onPointerCancel=n.onPointerCancel.bind(n),n.processPointerCancel=n.processPointerCancel.bind(n),n.onPointerDown=n.onPointerDown.bind(n),n.processPointerDown=n.processPointerDown.bind(n),n.onPointerMove=n.onPointerMove.bind(n),n.processPointerMove=n.processPointerMove.bind(n),n.onPointerOut=n.onPointerOut.bind(n),n.processPointerOverOut=n.processPointerOverOut.bind(n),n.onPointerOver=n.onPointerOver.bind(n),n.cursorStyles={default:"inherit",pointer:"pointer"},n.currentCursorMode=null,n.cursor=null,n.resolution=1,n.delayedEvents=[],n.search=new u$7,n._tempDisplayObject=new C$5,n._eventListenerOptions={capture:!0,passive:!1},n._useSystemTicker=void 0===i.useSystemTicker||i.useSystemTicker,n.setTargetElement(n.renderer.view,n.renderer.resolution),n}return function(t,e){function i(){this.constructor=t;}h$4(t,e),t.prototype=null===e?Object.create(e):(i.prototype=e.prototype,new i);}(n,t),Object.defineProperty(n.prototype,"useSystemTicker",{get:function(){return this._useSystemTicker},set:function(t){this._useSystemTicker=t,t?this.addTickerListener():this.removeTickerListener();},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"lastObjectRendered",{get:function(){return this.renderer._lastObjectRendered||this._tempDisplayObject},enumerable:!1,configurable:!0}),n.prototype.hitTest=function(t,e){return v$5.target=null,v$5.data.global=t,e||(e=this.lastObjectRendered),this.processInteractive(v$5,e,null,!0),v$5.target},n.prototype.setTargetElement=function(t,e){void 0===e&&(e=1),this.removeTickerListener(),this.removeEvents(),this.interactionDOMElement=t,this.resolution=e,this.addEvents(),this.addTickerListener();},n.prototype.addTickerListener=function(){!this.tickerAdded&&this.interactionDOMElement&&this._useSystemTicker&&(n$7.system.add(this.tickerUpdate,this,i$4.INTERACTION),this.tickerAdded=!0);},n.prototype.removeTickerListener=function(){this.tickerAdded&&(n$7.system.remove(this.tickerUpdate,this),this.tickerAdded=!1);},n.prototype.addEvents=function(){if(!this.eventsAdded&&this.interactionDOMElement){var t=this.interactionDOMElement.style;globalThis.navigator.msPointerEnabled?(t.msContentZooming="none",t.msTouchAction="none"):this.supportsPointerEvents&&(t.touchAction="none"),this.supportsPointerEvents?(globalThis.document.addEventListener("pointermove",this.onPointerMove,this._eventListenerOptions),this.interactionDOMElement.addEventListener("pointerdown",this.onPointerDown,this._eventListenerOptions),this.interactionDOMElement.addEventListener("pointerleave",this.onPointerOut,this._eventListenerOptions),this.interactionDOMElement.addEventListener("pointerover",this.onPointerOver,this._eventListenerOptions),globalThis.addEventListener("pointercancel",this.onPointerCancel,this._eventListenerOptions),globalThis.addEventListener("pointerup",this.onPointerUp,this._eventListenerOptions)):(globalThis.document.addEventListener("mousemove",this.onPointerMove,this._eventListenerOptions),this.interactionDOMElement.addEventListener("mousedown",this.onPointerDown,this._eventListenerOptions),this.interactionDOMElement.addEventListener("mouseout",this.onPointerOut,this._eventListenerOptions),this.interactionDOMElement.addEventListener("mouseover",this.onPointerOver,this._eventListenerOptions),globalThis.addEventListener("mouseup",this.onPointerUp,this._eventListenerOptions)),this.supportsTouchEvents&&(this.interactionDOMElement.addEventListener("touchstart",this.onPointerDown,this._eventListenerOptions),this.interactionDOMElement.addEventListener("touchcancel",this.onPointerCancel,this._eventListenerOptions),this.interactionDOMElement.addEventListener("touchend",this.onPointerUp,this._eventListenerOptions),this.interactionDOMElement.addEventListener("touchmove",this.onPointerMove,this._eventListenerOptions)),this.eventsAdded=!0;}},n.prototype.removeEvents=function(){if(this.eventsAdded&&this.interactionDOMElement){var t=this.interactionDOMElement.style;globalThis.navigator.msPointerEnabled?(t.msContentZooming="",t.msTouchAction=""):this.supportsPointerEvents&&(t.touchAction=""),this.supportsPointerEvents?(globalThis.document.removeEventListener("pointermove",this.onPointerMove,this._eventListenerOptions),this.interactionDOMElement.removeEventListener("pointerdown",this.onPointerDown,this._eventListenerOptions),this.interactionDOMElement.removeEventListener("pointerleave",this.onPointerOut,this._eventListenerOptions),this.interactionDOMElement.removeEventListener("pointerover",this.onPointerOver,this._eventListenerOptions),globalThis.removeEventListener("pointercancel",this.onPointerCancel,this._eventListenerOptions),globalThis.removeEventListener("pointerup",this.onPointerUp,this._eventListenerOptions)):(globalThis.document.removeEventListener("mousemove",this.onPointerMove,this._eventListenerOptions),this.interactionDOMElement.removeEventListener("mousedown",this.onPointerDown,this._eventListenerOptions),this.interactionDOMElement.removeEventListener("mouseout",this.onPointerOut,this._eventListenerOptions),this.interactionDOMElement.removeEventListener("mouseover",this.onPointerOver,this._eventListenerOptions),globalThis.removeEventListener("mouseup",this.onPointerUp,this._eventListenerOptions)),this.supportsTouchEvents&&(this.interactionDOMElement.removeEventListener("touchstart",this.onPointerDown,this._eventListenerOptions),this.interactionDOMElement.removeEventListener("touchcancel",this.onPointerCancel,this._eventListenerOptions),this.interactionDOMElement.removeEventListener("touchend",this.onPointerUp,this._eventListenerOptions),this.interactionDOMElement.removeEventListener("touchmove",this.onPointerMove,this._eventListenerOptions)),this.interactionDOMElement=null,this.eventsAdded=!1;}},n.prototype.tickerUpdate=function(t){this._deltaTime+=t,this._deltaTime<this.interactionFrequency||(this._deltaTime=0,this.update());},n.prototype.update=function(){if(this.interactionDOMElement)if(this._didMove)this._didMove=!1;else {for(var t in this.cursor=null,this.activeInteractionData)if(this.activeInteractionData.hasOwnProperty(t)){var e=this.activeInteractionData[t];if(e.originalEvent&&"touch"!==e.pointerType){var i=this.configureInteractionEventForDOMEvent(this.eventData,e.originalEvent,e);this.processInteractive(i,this.lastObjectRendered,this.processPointerOverOut,!0);}}this.setCursorMode(this.cursor);}},n.prototype.setCursorMode=function(t){t=t||"default";var e=!0;if(globalThis.OffscreenCanvas&&this.interactionDOMElement instanceof OffscreenCanvas&&(e=!1),this.currentCursorMode!==t){this.currentCursorMode=t;var i=this.cursorStyles[t];if(i)switch(typeof i){case"string":e&&(this.interactionDOMElement.style.cursor=i);break;case"function":i(t);break;case"object":e&&Object.assign(this.interactionDOMElement.style,i);}else e&&"string"==typeof t&&!Object.prototype.hasOwnProperty.call(this.cursorStyles,t)&&(this.interactionDOMElement.style.cursor=t);}},n.prototype.dispatchEvent=function(t,e,i){i.stopPropagationHint&&t!==i.stopsPropagatingAt||(i.currentTarget=t,i.type=e,t.emit(e,i),t[e]&&t[e](i));},n.prototype.delayDispatchEvent=function(t,e,i){this.delayedEvents.push({displayObject:t,eventString:e,eventData:i});},n.prototype.mapPositionToPoint=function(t,e,i){var n;n=this.interactionDOMElement.parentElement?this.interactionDOMElement.getBoundingClientRect():{x:0,y:0,width:this.interactionDOMElement.width,height:this.interactionDOMElement.height,left:0,top:0};var o=1/this.resolution;t.x=(e-n.left)*(this.interactionDOMElement.width/n.width)*o,t.y=(i-n.top)*(this.interactionDOMElement.height/n.height)*o;},n.prototype.processInteractive=function(t,e,i,n){var o=this.search.findHit(t,e,i,n),r=this.delayedEvents;if(!r.length)return o;t.stopPropagationHint=!1;var s=r.length;this.delayedEvents=[];for(var a=0;a<s;a++){var h=r[a],p=h.displayObject,c=h.eventString,u=h.eventData;u.stopsPropagatingAt===p&&(u.stopPropagationHint=!0),this.dispatchEvent(p,c,u);}return o},n.prototype.onPointerDown=function(t){if(!this.supportsTouchEvents||"touch"!==t.pointerType){var e=this.normalizeToPointerData(t);if(this.autoPreventDefault&&e[0].isNormalized)(t.cancelable||!("cancelable"in t))&&t.preventDefault();for(var i=e.length,n=0;n<i;n++){var o=e[n],r=this.getInteractionDataForPointerId(o),s=this.configureInteractionEventForDOMEvent(this.eventData,o,r);if(s.data.originalEvent=t,this.processInteractive(s,this.lastObjectRendered,this.processPointerDown,!0),this.emit("pointerdown",s),"touch"===o.pointerType)this.emit("touchstart",s);else if("mouse"===o.pointerType||"pen"===o.pointerType){var a=2===o.button;this.emit(a?"rightdown":"mousedown",this.eventData);}}}},n.prototype.processPointerDown=function(t,e,i){var n=t.data,o=t.data.identifier;if(i)if(e.trackedPointers[o]||(e.trackedPointers[o]=new c$8(o)),this.dispatchEvent(e,"pointerdown",t),"touch"===n.pointerType)this.dispatchEvent(e,"touchstart",t);else if("mouse"===n.pointerType||"pen"===n.pointerType){var r=2===n.button;r?e.trackedPointers[o].rightDown=!0:e.trackedPointers[o].leftDown=!0,this.dispatchEvent(e,r?"rightdown":"mousedown",t);}},n.prototype.onPointerComplete=function(t,e,i){var n=this.normalizeToPointerData(t),o=n.length,r=t.target;t.composedPath&&t.composedPath().length>0&&(r=t.composedPath()[0]);for(var s=r!==this.interactionDOMElement?"outside":"",a=0;a<o;a++){var h=n[a],p=this.getInteractionDataForPointerId(h),c=this.configureInteractionEventForDOMEvent(this.eventData,h,p);if(c.data.originalEvent=t,this.processInteractive(c,this.lastObjectRendered,i,e||!s),this.emit(e?"pointercancel":"pointerup"+s,c),"mouse"===h.pointerType||"pen"===h.pointerType){var u=2===h.button;this.emit(u?"rightup"+s:"mouseup"+s,c);}else "touch"===h.pointerType&&(this.emit(e?"touchcancel":"touchend"+s,c),this.releaseInteractionDataForPointerId(h.pointerId));}},n.prototype.onPointerCancel=function(t){this.supportsTouchEvents&&"touch"===t.pointerType||this.onPointerComplete(t,!0,this.processPointerCancel);},n.prototype.processPointerCancel=function(t,e){var i=t.data,n=t.data.identifier;void 0!==e.trackedPointers[n]&&(delete e.trackedPointers[n],this.dispatchEvent(e,"pointercancel",t),"touch"===i.pointerType&&this.dispatchEvent(e,"touchcancel",t));},n.prototype.onPointerUp=function(t){this.supportsTouchEvents&&"touch"===t.pointerType||this.onPointerComplete(t,!1,this.processPointerUp);},n.prototype.processPointerUp=function(t,e,i){var n=t.data,o=t.data.identifier,r=e.trackedPointers[o],s="touch"===n.pointerType,a="mouse"===n.pointerType||"pen"===n.pointerType,h=!1;if(a){var p=2===n.button,u=c$8.FLAGS,l=p?u.RIGHT_DOWN:u.LEFT_DOWN,v=void 0!==r&&r.flags&l;i?(this.dispatchEvent(e,p?"rightup":"mouseup",t),v&&(this.dispatchEvent(e,p?"rightclick":"click",t),h=!0)):v&&this.dispatchEvent(e,p?"rightupoutside":"mouseupoutside",t),r&&(p?r.rightDown=!1:r.leftDown=!1);}i?(this.dispatchEvent(e,"pointerup",t),s&&this.dispatchEvent(e,"touchend",t),r&&(a&&!h||this.dispatchEvent(e,"pointertap",t),s&&(this.dispatchEvent(e,"tap",t),r.over=!1))):r&&(this.dispatchEvent(e,"pointerupoutside",t),s&&this.dispatchEvent(e,"touchendoutside",t)),r&&r.none&&delete e.trackedPointers[o];},n.prototype.onPointerMove=function(t){if(!this.supportsTouchEvents||"touch"!==t.pointerType){var e=this.normalizeToPointerData(t);"mouse"!==e[0].pointerType&&"pen"!==e[0].pointerType||(this._didMove=!0,this.cursor=null);for(var i=e.length,n=0;n<i;n++){var o=e[n],r=this.getInteractionDataForPointerId(o),s=this.configureInteractionEventForDOMEvent(this.eventData,o,r);s.data.originalEvent=t,this.processInteractive(s,this.lastObjectRendered,this.processPointerMove,!0),this.emit("pointermove",s),"touch"===o.pointerType&&this.emit("touchmove",s),"mouse"!==o.pointerType&&"pen"!==o.pointerType||this.emit("mousemove",s);}"mouse"===e[0].pointerType&&this.setCursorMode(this.cursor);}},n.prototype.processPointerMove=function(t,e,i){var n=t.data,o="touch"===n.pointerType,r="mouse"===n.pointerType||"pen"===n.pointerType;r&&this.processPointerOverOut(t,e,i),this.moveWhenInside&&!i||(this.dispatchEvent(e,"pointermove",t),o&&this.dispatchEvent(e,"touchmove",t),r&&this.dispatchEvent(e,"mousemove",t));},n.prototype.onPointerOut=function(t){if(!this.supportsTouchEvents||"touch"!==t.pointerType){var e=this.normalizeToPointerData(t)[0];"mouse"===e.pointerType&&(this.mouseOverRenderer=!1,this.setCursorMode(null));var i=this.getInteractionDataForPointerId(e),n=this.configureInteractionEventForDOMEvent(this.eventData,e,i);n.data.originalEvent=e,this.processInteractive(n,this.lastObjectRendered,this.processPointerOverOut,!1),this.emit("pointerout",n),"mouse"===e.pointerType||"pen"===e.pointerType?this.emit("mouseout",n):this.releaseInteractionDataForPointerId(i.identifier);}},n.prototype.processPointerOverOut=function(t,e,i){var n=t.data,o=t.data.identifier,r="mouse"===n.pointerType||"pen"===n.pointerType,s=e.trackedPointers[o];i&&!s&&(s=e.trackedPointers[o]=new c$8(o)),void 0!==s&&(i&&this.mouseOverRenderer?(s.over||(s.over=!0,this.delayDispatchEvent(e,"pointerover",t),r&&this.delayDispatchEvent(e,"mouseover",t)),r&&null===this.cursor&&(this.cursor=e.cursor)):s.over&&(s.over=!1,this.dispatchEvent(e,"pointerout",this.eventData),r&&this.dispatchEvent(e,"mouseout",t),s.none&&delete e.trackedPointers[o]));},n.prototype.onPointerOver=function(t){var e=this.normalizeToPointerData(t)[0],i=this.getInteractionDataForPointerId(e),n=this.configureInteractionEventForDOMEvent(this.eventData,e,i);n.data.originalEvent=e,"mouse"===e.pointerType&&(this.mouseOverRenderer=!0),this.emit("pointerover",n),"mouse"!==e.pointerType&&"pen"!==e.pointerType||this.emit("mouseover",n);},n.prototype.getInteractionDataForPointerId=function(t){var e,i=t.pointerId;return 1===i||"mouse"===t.pointerType?e=this.mouse:this.activeInteractionData[i]?e=this.activeInteractionData[i]:((e=this.interactionDataPool.pop()||new a$5).identifier=i,this.activeInteractionData[i]=e),e.copyEvent(t),e},n.prototype.releaseInteractionDataForPointerId=function(t){var e=this.activeInteractionData[t];e&&(delete this.activeInteractionData[t],e.reset(),this.interactionDataPool.push(e));},n.prototype.configureInteractionEventForDOMEvent=function(t,e,i){return t.data=i,this.mapPositionToPoint(i.global,e.clientX,e.clientY),"touch"===e.pointerType&&(e.globalX=i.global.x,e.globalY=i.global.y),i.originalEvent=e,t.reset(),t},n.prototype.normalizeToPointerData=function(t){var e=[];if(this.supportsTouchEvents&&t instanceof TouchEvent)for(var i=0,n=t.changedTouches.length;i<n;i++){var o=t.changedTouches[i];void 0===o.button&&(o.button=t.touches.length?1:0),void 0===o.buttons&&(o.buttons=t.touches.length?1:0),void 0===o.isPrimary&&(o.isPrimary=1===t.touches.length&&"touchstart"===t.type),void 0===o.width&&(o.width=o.radiusX||1),void 0===o.height&&(o.height=o.radiusY||1),void 0===o.tiltX&&(o.tiltX=0),void 0===o.tiltY&&(o.tiltY=0),void 0===o.pointerType&&(o.pointerType="touch"),void 0===o.pointerId&&(o.pointerId=o.identifier||0),void 0===o.pressure&&(o.pressure=o.force||.5),void 0===o.twist&&(o.twist=0),void 0===o.tangentialPressure&&(o.tangentialPressure=0),void 0===o.layerX&&(o.layerX=o.offsetX=o.clientX),void 0===o.layerY&&(o.layerY=o.offsetY=o.clientY),o.isNormalized=!0,e.push(o);}else if(globalThis.MouseEvent&&(!(t instanceof MouseEvent)||this.supportsPointerEvents&&t instanceof globalThis.PointerEvent))e.push(t);else {var r=t;void 0===r.isPrimary&&(r.isPrimary=!0),void 0===r.width&&(r.width=1),void 0===r.height&&(r.height=1),void 0===r.tiltX&&(r.tiltX=0),void 0===r.tiltY&&(r.tiltY=0),void 0===r.pointerType&&(r.pointerType="mouse"),void 0===r.pointerId&&(r.pointerId=1),void 0===r.pressure&&(r.pressure=.5),void 0===r.twist&&(r.twist=0),void 0===r.tangentialPressure&&(r.tangentialPressure=0),r.isNormalized=!0,e.push(r);}return e},n.prototype.destroy=function(){this.removeEvents(),this.removeTickerListener(),this.removeAllListeners(),this.renderer=null,this.mouse=null,this.eventData=null,this.interactionDOMElement=null,this.onPointerDown=null,this.processPointerDown=null,this.onPointerUp=null,this.processPointerUp=null,this.onPointerCancel=null,this.processPointerCancel=null,this.onPointerMove=null,this.processPointerMove=null,this.onPointerOut=null,this.processPointerOverOut=null,this.onPointerOver=null,this.search=null;},n.extension={name:"interaction",type:[e$2.RendererPlugin,e$2.CanvasRendererPlugin]},n}(r$5);

  /*!
   * @pixi/extract - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/extract is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  var a$4=new r$4,i$3=function(){function t(e){this.renderer=e;}return t.prototype.image=function(e,t,r){var n=new Image;return n.src=this.base64(e,t,r),n},t.prototype.base64=function(e,t,r){return this.canvas(e).toDataURL(t,r)},t.prototype.canvas=function(r,i){var o,h,d=this.renderer,u=!1,s=!1;r&&(r instanceof _e?h=r:(h=this.renderer.generateTexture(r),s=!0)),h?(o=h.baseTexture.resolution,i=null!=i?i:h.frame,u=!1,d.renderTexture.bind(h)):(o=d.resolution,i||((i=a$4).width=d.width,i.height=d.height),u=!0,d.renderTexture.bind(null));var l=Math.round(i.width*o),x=Math.round(i.height*o),c=new j$2(l,x,1),p=new Uint8Array(4*l*x),g=d.gl;g.readPixels(Math.round(i.x*o),Math.round(i.y*o),l,x,g.RGBA,g.UNSIGNED_BYTE,p);var m=c.context.getImageData(0,0,l,x);if(t.arrayPostDivide(p,m.data),c.context.putImageData(m,0,0),u){var f=new j$2(c.width,c.height,1);f.context.scale(1,-1),f.context.drawImage(c.canvas,0,-x),c.destroy(),c=f;}return s&&h.destroy(!0),c.canvas},t.prototype.pixels=function(e,r){var i,o,h=this.renderer,d=!1;e&&(e instanceof _e?o=e:(o=this.renderer.generateTexture(e),d=!0)),o?(i=o.baseTexture.resolution,r=null!=r?r:o.frame,h.renderTexture.bind(o)):(i=h.resolution,r||((r=a$4).width=h.width,r.height=h.height),h.renderTexture.bind(null));var u=Math.round(r.width*i),s=Math.round(r.height*i),l=new Uint8Array(4*u*s),x=h.gl;return x.readPixels(Math.round(r.x*i),Math.round(r.y*i),u,s,x.RGBA,x.UNSIGNED_BYTE,l),d&&o.destroy(!0),t.arrayPostDivide(l,l),l},t.prototype.destroy=function(){this.renderer=null;},t.arrayPostDivide=function(e,t){for(var r=0;r<e.length;r+=4){var n=t[r+3]=e[r+3];0!==n?(t[r]=Math.round(Math.min(255*e[r]/n,255)),t[r+1]=Math.round(Math.min(255*e[r+1]/n,255)),t[r+2]=Math.round(Math.min(255*e[r+2]/n,255))):(t[r]=e[r],t[r+1]=e[r+1],t[r+2]=e[r+2]);}},t.extension={name:"extract",type:e$2.RendererPlugin},t}();

  /*!
   * @pixi/loaders - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/loaders is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  var i$2=function(){function t(t,e,r){void 0===e&&(e=!1),this._fn=t,this._once=e,this._thisArg=r,this._next=this._prev=this._owner=null;}return t.prototype.detach=function(){return null!==this._owner&&(this._owner.detach(this),!0)},t}();function n$5(t,e){return t._head?(t._tail._next=e,e._prev=t._tail,t._tail=e):(t._head=e,t._tail=e),e._owner=t,e}var s$4,o$7=function(){function t(){this._head=this._tail=void 0;}return t.prototype.handlers=function(t){void 0===t&&(t=!1);var e=this._head;if(t)return !!e;for(var r=[];e;)r.push(e),e=e._next;return r},t.prototype.has=function(t){if(!(t instanceof i$2))throw new Error("MiniSignal#has(): First arg must be a SignalBinding object.");return t._owner===this},t.prototype.dispatch=function(){for(var t=arguments,e=[],r=0;r<arguments.length;r++)e[r]=t[r];var i=this._head;if(!i)return !1;for(;i;)i._once&&this.detach(i),i._fn.apply(i._thisArg,e),i=i._next;return !0},t.prototype.add=function(t,e){if(void 0===e&&(e=null),"function"!=typeof t)throw new Error("MiniSignal#add(): First arg must be a Function.");return n$5(this,new i$2(t,!1,e))},t.prototype.once=function(t,e){if(void 0===e&&(e=null),"function"!=typeof t)throw new Error("MiniSignal#once(): First arg must be a Function.");return n$5(this,new i$2(t,!0,e))},t.prototype.detach=function(t){if(!(t instanceof i$2))throw new Error("MiniSignal#detach(): First arg must be a SignalBinding object.");return t._owner!==this||(t._prev&&(t._prev._next=t._next),t._next&&(t._next._prev=t._prev),t===this._head?(this._head=t._next,null===t._next&&(this._tail=null)):t===this._tail&&(this._tail=t._prev,this._tail._next=null),t._owner=null),this},t.prototype.detachAll=function(){var t=this._head;if(!t)return this;for(this._head=this._tail=null;t;)t._owner=null,t=t._next;return this},t}();function a$3(t,e){e=e||{};for(var r={key:["source","protocol","authority","userInfo","user","password","host","port","relative","path","directory","file","query","anchor"],q:{name:"queryKey",parser:/(?:^|&)([^&=]*)=?([^&]*)/g},parser:{strict:/^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/,loose:/^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/}},i=r.parser[e.strictMode?"strict":"loose"].exec(t),n={},s=14;s--;)n[r.key[s]]=i[s]||"";return n[r.q.name]={},n[r.key[12]].replace(r.q.parser,(function(t,e,i){e&&(n[r.q.name][e]=i);})),n}var h$3=null;function u$6(){}function d$6(t,e,r){e&&0===e.indexOf(".")&&(e=e.substring(1)),e&&(t[e]=r);}function l$6(t){return t.toString().replace("object ","")}var p$4=function(){function t(e,r,i){if(this._dequeue=u$6,this._onLoadBinding=null,this._elementTimer=0,this._boundComplete=null,this._boundOnError=null,this._boundOnProgress=null,this._boundOnTimeout=null,this._boundXhrOnError=null,this._boundXhrOnTimeout=null,this._boundXhrOnAbort=null,this._boundXhrOnLoad=null,"string"!=typeof e||"string"!=typeof r)throw new Error("Both name and url are required for constructing a resource.");i=i||{},this._flags=0,this._setFlag(t.STATUS_FLAGS.DATA_URL,0===r.indexOf("data:")),this.name=e,this.url=r,this.extension=this._getExtension(),this.data=null,this.crossOrigin=!0===i.crossOrigin?"anonymous":i.crossOrigin,this.timeout=i.timeout||0,this.loadType=i.loadType||this._determineLoadType(),this.xhrType=i.xhrType,this.metadata=i.metadata||{},this.error=null,this.xhr=null,this.children=[],this.type=t.TYPE.UNKNOWN,this.progressChunk=0,this._dequeue=u$6,this._onLoadBinding=null,this._elementTimer=0,this._boundComplete=this.complete.bind(this),this._boundOnError=this._onError.bind(this),this._boundOnProgress=this._onProgress.bind(this),this._boundOnTimeout=this._onTimeout.bind(this),this._boundXhrOnError=this._xhrOnError.bind(this),this._boundXhrOnTimeout=this._xhrOnTimeout.bind(this),this._boundXhrOnAbort=this._xhrOnAbort.bind(this),this._boundXhrOnLoad=this._xhrOnLoad.bind(this),this.onStart=new o$7,this.onProgress=new o$7,this.onComplete=new o$7,this.onAfterMiddleware=new o$7;}return t.setExtensionLoadType=function(e,r){d$6(t._loadTypeMap,e,r);},t.setExtensionXhrType=function(e,r){d$6(t._xhrTypeMap,e,r);},Object.defineProperty(t.prototype,"isDataUrl",{get:function(){return this._hasFlag(t.STATUS_FLAGS.DATA_URL)},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"isComplete",{get:function(){return this._hasFlag(t.STATUS_FLAGS.COMPLETE)},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"isLoading",{get:function(){return this._hasFlag(t.STATUS_FLAGS.LOADING)},enumerable:!1,configurable:!0}),t.prototype.complete=function(){this._clearEvents(),this._finish();},t.prototype.abort=function(e){if(!this.error){if(this.error=new Error(e),this._clearEvents(),this.xhr)this.xhr.abort();else if(this.xdr)this.xdr.abort();else if(this.data)if(this.data.src)this.data.src=t.EMPTY_GIF;else for(;this.data.firstChild;)this.data.removeChild(this.data.firstChild);this._finish();}},t.prototype.load=function(e){var r=this;if(!this.isLoading)if(this.isComplete)e&&setTimeout((function(){return e(r)}),1);else switch(e&&this.onComplete.once(e),this._setFlag(t.STATUS_FLAGS.LOADING,!0),this.onStart.dispatch(this),!1!==this.crossOrigin&&"string"==typeof this.crossOrigin||(this.crossOrigin=this._determineCrossOrigin(this.url)),this.loadType){case t.LOAD_TYPE.IMAGE:this.type=t.TYPE.IMAGE,this._loadElement("image");break;case t.LOAD_TYPE.AUDIO:this.type=t.TYPE.AUDIO,this._loadSourceElement("audio");break;case t.LOAD_TYPE.VIDEO:this.type=t.TYPE.VIDEO,this._loadSourceElement("video");break;case t.LOAD_TYPE.XHR:default:void 0===s$4&&(s$4=!(!globalThis.XDomainRequest||"withCredentials"in new XMLHttpRequest)),s$4&&this.crossOrigin?this._loadXdr():this._loadXhr();}},t.prototype._hasFlag=function(t){return 0!=(this._flags&t)},t.prototype._setFlag=function(t,e){this._flags=e?this._flags|t:this._flags&~t;},t.prototype._clearEvents=function(){clearTimeout(this._elementTimer),this.data&&this.data.removeEventListener&&(this.data.removeEventListener("error",this._boundOnError,!1),this.data.removeEventListener("load",this._boundComplete,!1),this.data.removeEventListener("progress",this._boundOnProgress,!1),this.data.removeEventListener("canplaythrough",this._boundComplete,!1)),this.xhr&&(this.xhr.removeEventListener?(this.xhr.removeEventListener("error",this._boundXhrOnError,!1),this.xhr.removeEventListener("timeout",this._boundXhrOnTimeout,!1),this.xhr.removeEventListener("abort",this._boundXhrOnAbort,!1),this.xhr.removeEventListener("progress",this._boundOnProgress,!1),this.xhr.removeEventListener("load",this._boundXhrOnLoad,!1)):(this.xhr.onerror=null,this.xhr.ontimeout=null,this.xhr.onprogress=null,this.xhr.onload=null));},t.prototype._finish=function(){if(this.isComplete)throw new Error("Complete called again for an already completed resource.");this._setFlag(t.STATUS_FLAGS.COMPLETE,!0),this._setFlag(t.STATUS_FLAGS.LOADING,!1),this.onComplete.dispatch(this);},t.prototype._loadElement=function(t){this.metadata.loadElement?this.data=this.metadata.loadElement:"image"===t&&void 0!==globalThis.Image?this.data=new Image:this.data=document.createElement(t),this.crossOrigin&&(this.data.crossOrigin=this.crossOrigin),this.metadata.skipSource||(this.data.src=this.url),this.data.addEventListener("error",this._boundOnError,!1),this.data.addEventListener("load",this._boundComplete,!1),this.data.addEventListener("progress",this._boundOnProgress,!1),this.timeout&&(this._elementTimer=setTimeout(this._boundOnTimeout,this.timeout));},t.prototype._loadSourceElement=function(t){if(this.metadata.loadElement?this.data=this.metadata.loadElement:"audio"===t&&void 0!==globalThis.Audio?this.data=new Audio:this.data=document.createElement(t),null!==this.data){if(this.crossOrigin&&(this.data.crossOrigin=this.crossOrigin),!this.metadata.skipSource)if(navigator.isCocoonJS)this.data.src=Array.isArray(this.url)?this.url[0]:this.url;else if(Array.isArray(this.url))for(var e=this.metadata.mimeType,r=0;r<this.url.length;++r)this.data.appendChild(this._createSource(t,this.url[r],Array.isArray(e)?e[r]:e));else {e=this.metadata.mimeType;this.data.appendChild(this._createSource(t,this.url,Array.isArray(e)?e[0]:e));}this.data.addEventListener("error",this._boundOnError,!1),this.data.addEventListener("load",this._boundComplete,!1),this.data.addEventListener("progress",this._boundOnProgress,!1),this.data.addEventListener("canplaythrough",this._boundComplete,!1),this.data.load(),this.timeout&&(this._elementTimer=setTimeout(this._boundOnTimeout,this.timeout));}else this.abort("Unsupported element: "+t);},t.prototype._loadXhr=function(){"string"!=typeof this.xhrType&&(this.xhrType=this._determineXhrType());var e=this.xhr=new XMLHttpRequest;"use-credentials"===this.crossOrigin&&(e.withCredentials=!0),e.open("GET",this.url,!0),e.timeout=this.timeout,this.xhrType===t.XHR_RESPONSE_TYPE.JSON||this.xhrType===t.XHR_RESPONSE_TYPE.DOCUMENT?e.responseType=t.XHR_RESPONSE_TYPE.TEXT:e.responseType=this.xhrType,e.addEventListener("error",this._boundXhrOnError,!1),e.addEventListener("timeout",this._boundXhrOnTimeout,!1),e.addEventListener("abort",this._boundXhrOnAbort,!1),e.addEventListener("progress",this._boundOnProgress,!1),e.addEventListener("load",this._boundXhrOnLoad,!1),e.send();},t.prototype._loadXdr=function(){"string"!=typeof this.xhrType&&(this.xhrType=this._determineXhrType());var t=this.xhr=new globalThis.XDomainRequest;t.timeout=this.timeout||5e3,t.onerror=this._boundXhrOnError,t.ontimeout=this._boundXhrOnTimeout,t.onprogress=this._boundOnProgress,t.onload=this._boundXhrOnLoad,t.open("GET",this.url,!0),setTimeout((function(){return t.send()}),1);},t.prototype._createSource=function(t,e,r){r||(r=t+"/"+this._getExtension(e));var i=document.createElement("source");return i.src=e,i.type=r,i},t.prototype._onError=function(t){this.abort("Failed to load element using: "+t.target.nodeName);},t.prototype._onProgress=function(t){t&&t.lengthComputable&&this.onProgress.dispatch(this,t.loaded/t.total);},t.prototype._onTimeout=function(){this.abort("Load timed out.");},t.prototype._xhrOnError=function(){var t=this.xhr;this.abort(l$6(t)+" Request failed. Status: "+t.status+', text: "'+t.statusText+'"');},t.prototype._xhrOnTimeout=function(){var t=this.xhr;this.abort(l$6(t)+" Request timed out.");},t.prototype._xhrOnAbort=function(){var t=this.xhr;this.abort(l$6(t)+" Request was aborted by the user.");},t.prototype._xhrOnLoad=function(){var e=this.xhr,r="",i=void 0===e.status?200:e.status;if(""!==e.responseType&&"text"!==e.responseType&&void 0!==e.responseType||(r=e.responseText),0===i&&(r.length>0||e.responseType===t.XHR_RESPONSE_TYPE.BUFFER)?i=200:1223===i&&(i=204),2===(i/100|0)){if(this.xhrType===t.XHR_RESPONSE_TYPE.TEXT)this.data=r,this.type=t.TYPE.TEXT;else if(this.xhrType===t.XHR_RESPONSE_TYPE.JSON)try{this.data=JSON.parse(r),this.type=t.TYPE.JSON;}catch(t){return void this.abort("Error trying to parse loaded json: "+t)}else if(this.xhrType===t.XHR_RESPONSE_TYPE.DOCUMENT)try{if(globalThis.DOMParser){var n=new DOMParser;this.data=n.parseFromString(r,"text/xml");}else {var s=document.createElement("div");s.innerHTML=r,this.data=s;}this.type=t.TYPE.XML;}catch(t){return void this.abort("Error trying to parse loaded xml: "+t)}else this.data=e.response||r;this.complete();}else this.abort("["+e.status+"] "+e.statusText+": "+e.responseURL);},t.prototype._determineCrossOrigin=function(t,e){if(0===t.indexOf("data:"))return "";if(globalThis.origin!==globalThis.location.origin)return "anonymous";e=e||globalThis.location,h$3||(h$3=document.createElement("a")),h$3.href=t;var r=a$3(h$3.href,{strictMode:!0}),i=!r.port&&""===e.port||r.port===e.port,n=r.protocol?r.protocol+":":"";return r.host===e.hostname&&i&&n===e.protocol?"":"anonymous"},t.prototype._determineXhrType=function(){return t._xhrTypeMap[this.extension]||t.XHR_RESPONSE_TYPE.TEXT},t.prototype._determineLoadType=function(){return t._loadTypeMap[this.extension]||t.LOAD_TYPE.XHR},t.prototype._getExtension=function(t){void 0===t&&(t=this.url);var e="";if(this.isDataUrl){var r=t.indexOf("/");e=t.substring(r+1,t.indexOf(";",r));}else {var i=t.indexOf("?"),n=t.indexOf("#"),s=Math.min(i>-1?i:t.length,n>-1?n:t.length);e=(t=t.substring(0,s)).substring(t.lastIndexOf(".")+1);}return e.toLowerCase()},t.prototype._getMimeFromXhrType=function(e){switch(e){case t.XHR_RESPONSE_TYPE.BUFFER:return "application/octet-binary";case t.XHR_RESPONSE_TYPE.BLOB:return "application/blob";case t.XHR_RESPONSE_TYPE.DOCUMENT:return "application/xml";case t.XHR_RESPONSE_TYPE.JSON:return "application/json";case t.XHR_RESPONSE_TYPE.DEFAULT:case t.XHR_RESPONSE_TYPE.TEXT:default:return "text/plain"}},t}();function c$7(){}function _$6(t){return function(){for(var e=arguments,r=[],i=0;i<arguments.length;i++)r[i]=e[i];if(null===t)throw new Error("Callback was already called.");var n=t;t=null,n.apply(this,r);}}!function(t){var e,r,i,n;(e=t.STATUS_FLAGS||(t.STATUS_FLAGS={}))[e.NONE=0]="NONE",e[e.DATA_URL=1]="DATA_URL",e[e.COMPLETE=2]="COMPLETE",e[e.LOADING=4]="LOADING",(r=t.TYPE||(t.TYPE={}))[r.UNKNOWN=0]="UNKNOWN",r[r.JSON=1]="JSON",r[r.XML=2]="XML",r[r.IMAGE=3]="IMAGE",r[r.AUDIO=4]="AUDIO",r[r.VIDEO=5]="VIDEO",r[r.TEXT=6]="TEXT",(i=t.LOAD_TYPE||(t.LOAD_TYPE={}))[i.XHR=1]="XHR",i[i.IMAGE=2]="IMAGE",i[i.AUDIO=3]="AUDIO",i[i.VIDEO=4]="VIDEO",(n=t.XHR_RESPONSE_TYPE||(t.XHR_RESPONSE_TYPE={})).DEFAULT="text",n.BUFFER="arraybuffer",n.BLOB="blob",n.DOCUMENT="document",n.JSON="json",n.TEXT="text",t._loadTypeMap={gif:t.LOAD_TYPE.IMAGE,png:t.LOAD_TYPE.IMAGE,bmp:t.LOAD_TYPE.IMAGE,jpg:t.LOAD_TYPE.IMAGE,jpeg:t.LOAD_TYPE.IMAGE,tif:t.LOAD_TYPE.IMAGE,tiff:t.LOAD_TYPE.IMAGE,webp:t.LOAD_TYPE.IMAGE,tga:t.LOAD_TYPE.IMAGE,svg:t.LOAD_TYPE.IMAGE,"svg+xml":t.LOAD_TYPE.IMAGE,mp3:t.LOAD_TYPE.AUDIO,ogg:t.LOAD_TYPE.AUDIO,wav:t.LOAD_TYPE.AUDIO,mp4:t.LOAD_TYPE.VIDEO,webm:t.LOAD_TYPE.VIDEO},t._xhrTypeMap={xhtml:t.XHR_RESPONSE_TYPE.DOCUMENT,html:t.XHR_RESPONSE_TYPE.DOCUMENT,htm:t.XHR_RESPONSE_TYPE.DOCUMENT,xml:t.XHR_RESPONSE_TYPE.DOCUMENT,tmx:t.XHR_RESPONSE_TYPE.DOCUMENT,svg:t.XHR_RESPONSE_TYPE.DOCUMENT,tsx:t.XHR_RESPONSE_TYPE.DOCUMENT,gif:t.XHR_RESPONSE_TYPE.BLOB,png:t.XHR_RESPONSE_TYPE.BLOB,bmp:t.XHR_RESPONSE_TYPE.BLOB,jpg:t.XHR_RESPONSE_TYPE.BLOB,jpeg:t.XHR_RESPONSE_TYPE.BLOB,tif:t.XHR_RESPONSE_TYPE.BLOB,tiff:t.XHR_RESPONSE_TYPE.BLOB,webp:t.XHR_RESPONSE_TYPE.BLOB,tga:t.XHR_RESPONSE_TYPE.BLOB,json:t.XHR_RESPONSE_TYPE.JSON,text:t.XHR_RESPONSE_TYPE.TEXT,txt:t.XHR_RESPONSE_TYPE.TEXT,ttf:t.XHR_RESPONSE_TYPE.BUFFER,otf:t.XHR_RESPONSE_TYPE.BUFFER},t.EMPTY_GIF="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";}(p$4||(p$4={}));var E$4=function(t,e){this.data=t,this.callback=e;},f$5=function(){function t(t,e){var r=this;if(void 0===e&&(e=1),this.workers=0,this.saturated=c$7,this.unsaturated=c$7,this.empty=c$7,this.drain=c$7,this.error=c$7,this.started=!1,this.paused=!1,this._tasks=[],this._insert=function(t,e,i){if(i&&"function"!=typeof i)throw new Error("task callback must be a function");if(r.started=!0,null==t&&r.idle())setTimeout((function(){return r.drain()}),1);else {var n=new E$4(t,"function"==typeof i?i:c$7);e?r._tasks.unshift(n):r._tasks.push(n),setTimeout(r.process,1);}},this.process=function(){for(;!r.paused&&r.workers<r.concurrency&&r._tasks.length;){var t=r._tasks.shift();0===r._tasks.length&&r.empty(),r.workers+=1,r.workers===r.concurrency&&r.saturated(),r._worker(t.data,_$6(r._next(t)));}},this._worker=t,0===e)throw new Error("Concurrency must not be zero");this.concurrency=e,this.buffer=e/4;}return t.prototype._next=function(t){var e=this;return function(){for(var r=arguments,i=[],n=0;n<arguments.length;n++)i[n]=r[n];e.workers-=1,t.callback.apply(t,i),null!=i[0]&&e.error(i[0],t.data),e.workers<=e.concurrency-e.buffer&&e.unsaturated(),e.idle()&&e.drain(),e.process();}},t.prototype.push=function(t,e){this._insert(t,!1,e);},t.prototype.kill=function(){this.workers=0,this.drain=c$7,this.started=!1,this._tasks=[];},t.prototype.unshift=function(t,e){this._insert(t,!0,e);},t.prototype.length=function(){return this._tasks.length},t.prototype.running=function(){return this.workers},t.prototype.idle=function(){return this._tasks.length+this.workers===0},t.prototype.pause=function(){!0!==this.paused&&(this.paused=!0);},t.prototype.resume=function(){if(!1!==this.paused){this.paused=!1;for(var t=1;t<=this.concurrency;t++)this.process();}},t.eachSeries=function(t,e,r,i){var n=0,s=t.length;!function o(a){a||n===s?r&&r(a):i?setTimeout((function(){e(t[n++],o);}),1):e(t[n++],o);}();},t.queue=function(e,r){return new t(e,r)},t}(),g$5=/(#[\w-]+)?$/,T$5=function(){function r(t,e){var i=this;void 0===t&&(t=""),void 0===e&&(e=10),this.progress=0,this.loading=!1,this.defaultQueryString="",this._beforeMiddleware=[],this._afterMiddleware=[],this._resourcesParsing=[],this._boundLoadResource=function(t,e){return i._loadResource(t,e)},this.resources={},this.baseUrl=t,this._beforeMiddleware=[],this._afterMiddleware=[],this._resourcesParsing=[],this._boundLoadResource=function(t,e){return i._loadResource(t,e)},this._queue=f$5.queue(this._boundLoadResource,e),this._queue.pause(),this.resources={},this.onProgress=new o$7,this.onError=new o$7,this.onLoad=new o$7,this.onStart=new o$7,this.onComplete=new o$7;for(var n=0;n<r._plugins.length;++n){var s=r._plugins[n],a=s.pre,h=s.use;a&&this.pre(a),h&&this.use(h);}this._protected=!1;}return r.prototype._add=function(t,e,r,i){if(this.loading&&(!r||!r.parentResource))throw new Error("Cannot add resources while the loader is running.");if(this.resources[t])throw new Error('Resource named "'+t+'" already exists.');if(e=this._prepareUrl(e),this.resources[t]=new p$4(t,e,r),"function"==typeof i&&this.resources[t].onAfterMiddleware.once(i),this.loading){for(var n=r.parentResource,s=[],o=0;o<n.children.length;++o)n.children[o].isComplete||s.push(n.children[o]);var a=n.progressChunk*(s.length+1)/(s.length+2);n.children.push(this.resources[t]),n.progressChunk=a;for(o=0;o<s.length;++o)s[o].progressChunk=a;this.resources[t].progressChunk=a;}return this._queue.push(this.resources[t]),this},r.prototype.pre=function(t){return this._beforeMiddleware.push(t),this},r.prototype.use=function(t){return this._afterMiddleware.push(t),this},r.prototype.reset=function(){for(var t in this.progress=0,this.loading=!1,this._queue.kill(),this._queue.pause(),this.resources){var e=this.resources[t];e._onLoadBinding&&e._onLoadBinding.detach(),e.isLoading&&e.abort("loader reset");}return this.resources={},this},r.prototype.load=function(t){if("function"==typeof t&&this.onComplete.once(t),this.loading)return this;if(this._queue.idle())this._onStart(),this._onComplete();else {for(var e=100/this._queue._tasks.length,r=0;r<this._queue._tasks.length;++r)this._queue._tasks[r].data.progressChunk=e;this._onStart(),this._queue.resume();}return this},Object.defineProperty(r.prototype,"concurrency",{get:function(){return this._queue.concurrency},set:function(t){this._queue.concurrency=t;},enumerable:!1,configurable:!0}),r.prototype._prepareUrl=function(t){var e,r=a$3(t,{strictMode:!0});if(e=r.protocol||!r.path||0===t.indexOf("//")?t:this.baseUrl.length&&this.baseUrl.lastIndexOf("/")!==this.baseUrl.length-1&&"/"!==t.charAt(0)?this.baseUrl+"/"+t:this.baseUrl+t,this.defaultQueryString){var i=g$5.exec(e)[0];-1!==(e=e.slice(0,e.length-i.length)).indexOf("?")?e+="&"+this.defaultQueryString:e+="?"+this.defaultQueryString,e+=i;}return e},r.prototype._loadResource=function(t,e){var r=this;t._dequeue=e,f$5.eachSeries(this._beforeMiddleware,(function(e,i){e.call(r,t,(function(){i(t.isComplete?{}:null);}));}),(function(){t.isComplete?r._onLoad(t):(t._onLoadBinding=t.onComplete.once(r._onLoad,r),t.load());}),!0);},r.prototype._onStart=function(){this.progress=0,this.loading=!0,this.onStart.dispatch(this);},r.prototype._onComplete=function(){this.progress=100,this.loading=!1,this.onComplete.dispatch(this,this.resources);},r.prototype._onLoad=function(t){var e=this;t._onLoadBinding=null,this._resourcesParsing.push(t),t._dequeue(),f$5.eachSeries(this._afterMiddleware,(function(r,i){r.call(e,t,i);}),(function(){t.onAfterMiddleware.dispatch(t),e.progress=Math.min(100,e.progress+t.progressChunk),e.onProgress.dispatch(e,t),t.error?e.onError.dispatch(t.error,e,t):e.onLoad.dispatch(e,t),e._resourcesParsing.splice(e._resourcesParsing.indexOf(t),1),e._queue.idle()&&0===e._resourcesParsing.length&&e._onComplete();}),!0);},r.prototype.destroy=function(){this._protected||this.reset();},Object.defineProperty(r,"shared",{get:function(){var t=r._shared;return t||((t=new r)._protected=!0,r._shared=t),t},enumerable:!1,configurable:!0}),r.registerPlugin=function(i){return t$2.add({type:e$2.Loader,ref:i}),r},r._plugins=[],r}();t$2.handleByList(e$2.Loader,T$5._plugins),T$5.prototype.add=function(t,e,r,i){if(Array.isArray(t)){for(var n=0;n<t.length;++n)this.add(t[n]);return this}if("object"==typeof t&&(r=t,i=e||r.callback||r.onComplete,e=r.url,t=r.name||r.key||r.url),"string"!=typeof e&&(i=r,r=e,e=t),"string"!=typeof e)throw new Error("No url passed to add resource to loader.");return "function"==typeof r&&(i=r,r=null),this._add(t,e,r,i)};var O$4=function(){function t(){}return t.init=function(t){t=Object.assign({sharedLoader:!1},t),this.loader=t.sharedLoader?T$5.shared:new T$5;},t.destroy=function(){this.loader&&(this.loader.destroy(),this.loader=null);},t.extension=e$2.Application,t}(),m$4=function(){function t(){}return t.add=function(){p$4.setExtensionLoadType("svg",p$4.LOAD_TYPE.XHR),p$4.setExtensionXhrType("svg",p$4.XHR_RESPONSE_TYPE.TEXT);},t.use=function(t,e){if(!t.data||t.type!==p$4.TYPE.IMAGE&&"svg"!==t.extension)e();else {var i=t.data,n=t.url,s=t.name,o=t.metadata;ye.fromLoader(i,n,s,o).then((function(r){t.texture=r,e();})).catch(e);}},t.extension=e$2.Loader,t}();function y$6(t,e){if(t.data){if(t.xhr&&t.xhrType===p$4.XHR_RESPONSE_TYPE.BLOB)if(self.Blob&&"string"!=typeof t.data){if(0===t.data.type.indexOf("image")){var r=globalThis.URL||globalThis.webkitURL,i=r.createObjectURL(t.data);return t.blob=t.data,t.data=new Image,t.data.src=i,t.type=p$4.TYPE.IMAGE,void(t.data.onload=function(){r.revokeObjectURL(i),t.data.onload=null,e();})}}else {var n=t.xhr.getResponseHeader("content-type");if(n&&0===n.indexOf("image"))return t.data=new Image,t.data.src="data:"+n+";base64,"+function(t){for(var e="",r=0;r<t.length;){for(var i=[0,0,0],n=[0,0,0,0],s=0;s<i.length;++s)r<t.length?i[s]=255&t.charCodeAt(r++):i[s]=0;switch(n[0]=i[0]>>2,n[1]=(3&i[0])<<4|i[1]>>4,n[2]=(15&i[1])<<2|i[2]>>6,n[3]=63&i[2],r-(t.length-1)){case 2:n[3]=64,n[2]=64;break;case 1:n[3]=64;}for(s=0;s<n.length;++s)e+="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".charAt(n[s]);}return e}(t.xhr.responseText),t.type=p$4.TYPE.IMAGE,void(t.data.onload=function(){t.data.onload=null,e();})}e();}else e();}var b$4=function(){function t(){}return t.extension=e$2.Loader,t.use=y$6,t}();t$2.add(m$4,b$4);

  /*!
   * @pixi/compressed-textures - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/compressed-textures is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  var M$1,S$4;!function(_){_[_.COMPRESSED_RGB_S3TC_DXT1_EXT=33776]="COMPRESSED_RGB_S3TC_DXT1_EXT",_[_.COMPRESSED_RGBA_S3TC_DXT1_EXT=33777]="COMPRESSED_RGBA_S3TC_DXT1_EXT",_[_.COMPRESSED_RGBA_S3TC_DXT3_EXT=33778]="COMPRESSED_RGBA_S3TC_DXT3_EXT",_[_.COMPRESSED_RGBA_S3TC_DXT5_EXT=33779]="COMPRESSED_RGBA_S3TC_DXT5_EXT",_[_.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT=35917]="COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT",_[_.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT=35918]="COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT",_[_.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT=35919]="COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT",_[_.COMPRESSED_SRGB_S3TC_DXT1_EXT=35916]="COMPRESSED_SRGB_S3TC_DXT1_EXT",_[_.COMPRESSED_R11_EAC=37488]="COMPRESSED_R11_EAC",_[_.COMPRESSED_SIGNED_R11_EAC=37489]="COMPRESSED_SIGNED_R11_EAC",_[_.COMPRESSED_RG11_EAC=37490]="COMPRESSED_RG11_EAC",_[_.COMPRESSED_SIGNED_RG11_EAC=37491]="COMPRESSED_SIGNED_RG11_EAC",_[_.COMPRESSED_RGB8_ETC2=37492]="COMPRESSED_RGB8_ETC2",_[_.COMPRESSED_RGBA8_ETC2_EAC=37496]="COMPRESSED_RGBA8_ETC2_EAC",_[_.COMPRESSED_SRGB8_ETC2=37493]="COMPRESSED_SRGB8_ETC2",_[_.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC=37497]="COMPRESSED_SRGB8_ALPHA8_ETC2_EAC",_[_.COMPRESSED_RGB8_PUNCHTHROUGH_ALPHA1_ETC2=37494]="COMPRESSED_RGB8_PUNCHTHROUGH_ALPHA1_ETC2",_[_.COMPRESSED_SRGB8_PUNCHTHROUGH_ALPHA1_ETC2=37495]="COMPRESSED_SRGB8_PUNCHTHROUGH_ALPHA1_ETC2",_[_.COMPRESSED_RGB_PVRTC_4BPPV1_IMG=35840]="COMPRESSED_RGB_PVRTC_4BPPV1_IMG",_[_.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG=35842]="COMPRESSED_RGBA_PVRTC_4BPPV1_IMG",_[_.COMPRESSED_RGB_PVRTC_2BPPV1_IMG=35841]="COMPRESSED_RGB_PVRTC_2BPPV1_IMG",_[_.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG=35843]="COMPRESSED_RGBA_PVRTC_2BPPV1_IMG",_[_.COMPRESSED_RGB_ETC1_WEBGL=36196]="COMPRESSED_RGB_ETC1_WEBGL",_[_.COMPRESSED_RGB_ATC_WEBGL=35986]="COMPRESSED_RGB_ATC_WEBGL",_[_.COMPRESSED_RGBA_ATC_EXPLICIT_ALPHA_WEBGL=35986]="COMPRESSED_RGBA_ATC_EXPLICIT_ALPHA_WEBGL",_[_.COMPRESSED_RGBA_ATC_INTERPOLATED_ALPHA_WEBGL=34798]="COMPRESSED_RGBA_ATC_INTERPOLATED_ALPHA_WEBGL";}(S$4||(S$4={}));var n$4=((M$1={})[S$4.COMPRESSED_RGB_S3TC_DXT1_EXT]=.5,M$1[S$4.COMPRESSED_RGBA_S3TC_DXT1_EXT]=.5,M$1[S$4.COMPRESSED_RGBA_S3TC_DXT3_EXT]=1,M$1[S$4.COMPRESSED_RGBA_S3TC_DXT5_EXT]=1,M$1[S$4.COMPRESSED_SRGB_S3TC_DXT1_EXT]=.5,M$1[S$4.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT]=.5,M$1[S$4.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT]=1,M$1[S$4.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT]=1,M$1[S$4.COMPRESSED_R11_EAC]=.5,M$1[S$4.COMPRESSED_SIGNED_R11_EAC]=.5,M$1[S$4.COMPRESSED_RG11_EAC]=1,M$1[S$4.COMPRESSED_SIGNED_RG11_EAC]=1,M$1[S$4.COMPRESSED_RGB8_ETC2]=.5,M$1[S$4.COMPRESSED_RGBA8_ETC2_EAC]=1,M$1[S$4.COMPRESSED_SRGB8_ETC2]=.5,M$1[S$4.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC]=1,M$1[S$4.COMPRESSED_RGB8_PUNCHTHROUGH_ALPHA1_ETC2]=.5,M$1[S$4.COMPRESSED_SRGB8_PUNCHTHROUGH_ALPHA1_ETC2]=.5,M$1[S$4.COMPRESSED_RGB_PVRTC_4BPPV1_IMG]=.5,M$1[S$4.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG]=.5,M$1[S$4.COMPRESSED_RGB_PVRTC_2BPPV1_IMG]=.25,M$1[S$4.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG]=.25,M$1[S$4.COMPRESSED_RGB_ETC1_WEBGL]=.5,M$1[S$4.COMPRESSED_RGB_ATC_WEBGL]=.5,M$1[S$4.COMPRESSED_RGBA_ATC_EXPLICIT_ALPHA_WEBGL]=1,M$1[S$4.COMPRESSED_RGBA_ATC_INTERPOLATED_ALPHA_WEBGL]=1,M$1),I$4=function(_,e){return I$4=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(_,e){_.__proto__=e;}||function(_,e){for(var R in e)e.hasOwnProperty(R)&&(_[R]=e[R]);},I$4(_,e)};function o$6(_,e){function R(){this.constructor=_;}I$4(_,e),_.prototype=null===e?Object.create(e):(R.prototype=e.prototype,new R);}function X$1(_,e,R,t){return new(R||(R=Promise))((function(T,r){function E(_){try{O(t.next(_));}catch(_){r(_);}}function G(_){try{O(t.throw(_));}catch(_){r(_);}}function O(_){var e;_.done?T(_.value):(e=_.value,e instanceof R?e:new R((function(_){_(e);}))).then(E,G);}O((t=t.apply(_,e||[])).next());}))}function a$2(_,e){var R,t,T,r,E={label:0,sent:function(){if(1&T[0])throw T[1];return T[1]},trys:[],ops:[]};return r={next:G(0),throw:G(1),return:G(2)},"function"==typeof Symbol&&(r[Symbol.iterator]=function(){return this}),r;function G(r){return function(G){return function(r){if(R)throw new TypeError("Generator is already executing.");for(;E;)try{if(R=1,t&&(T=2&r[0]?t.return:r[0]?t.throw||((T=t.return)&&T.call(t),0):t.next)&&!(T=T.call(t,r[1])).done)return T;switch(t=0,T&&(r=[2&r[0],T.value]),r[0]){case 0:case 1:T=r;break;case 4:return E.label++,{value:r[1],done:!1};case 5:E.label++,t=r[1],r=[0];continue;case 7:r=E.ops.pop(),E.trys.pop();continue;default:if(!(T=E.trys,(T=T.length>0&&T[T.length-1])||6!==r[0]&&2!==r[0])){E=0;continue}if(3===r[0]&&(!T||r[1]>T[0]&&r[1]<T[3])){E.label=r[1];break}if(6===r[0]&&E.label<T[1]){E.label=T[1],T=r;break}if(T&&E.label<T[2]){E.label=T[2],E.ops.push(r);break}T[2]&&E.ops.pop(),E.trys.pop();continue}r=e.call(_,E);}catch(_){r=[6,_],t=0;}finally{R=T=0;}if(5&r[0])throw r[1];return {value:r[0]?r[1]:void 0,done:!0}}([r,G])}}}var i$1,F$2,B$2=function(e){function R(R,t){void 0===t&&(t={width:1,height:1,autoLoad:!0});var T,r,E=this;return "string"==typeof R?(T=R,r=new Uint8Array):(T=null,r=R),(E=e.call(this,r,t)||this).origin=T,E.buffer=r?new ar(r):null,E.origin&&!1!==t.autoLoad&&E.load(),r&&r.length&&(E.loaded=!0,E.onBlobLoaded(E.buffer.rawBinaryData)),E}return o$6(R,e),R.prototype.onBlobLoaded=function(_){},R.prototype.load=function(){return X$1(this,void 0,Promise,(function(){var e;return a$2(this,(function(R){switch(R.label){case 0:return [4,fetch(this.origin)];case 1:return [4,R.sent().blob()];case 2:return [4,R.sent().arrayBuffer()];case 3:return e=R.sent(),this.data=new Uint32Array(e),this.buffer=new ar(e),this.loaded=!0,this.onBlobLoaded(e),this.update(),[2,this]}}))}))},R}(Q$2),u$5=function(_){function e(R,t){var T=_.call(this,R,t)||this;return T.format=t.format,T.levels=t.levels||1,T._width=t.width,T._height=t.height,T._extension=e._formatToExtension(T.format),(t.levelBuffers||T.buffer)&&(T._levelBuffers=t.levelBuffers||e._createLevelBuffers(R instanceof Uint8Array?R:T.buffer.uint8View,T.format,T.levels,4,4,T.width,T.height)),T}return o$6(e,_),e.prototype.upload=function(_,e,R){var t=_.gl;if(!_.context.extensions[this._extension])throw new Error(this._extension+" textures are not supported on the current machine");if(!this._levelBuffers)return !1;for(var T=0,r=this.levels;T<r;T++){var E=this._levelBuffers[T],G=E.levelID,O=E.levelWidth,A=E.levelHeight,D=E.levelBuffer;t.compressedTexImage2D(t.TEXTURE_2D,G,this.format,O,A,0,D);}return !0},e.prototype.onBlobLoaded=function(){this._levelBuffers=e._createLevelBuffers(this.buffer.uint8View,this.format,this.levels,4,4,this.width,this.height);},e._formatToExtension=function(_){if(_>=33776&&_<=33779)return "s3tc";if(_>=37488&&_<=37497)return "etc";if(_>=35840&&_<=35843)return "pvrtc";if(_>=36196)return "etc1";if(_>=35986&&_<=34798)return "atc";throw new Error("Invalid (compressed) texture format given!")},e._createLevelBuffers=function(_,e,R,t,T,r,E){for(var G=new Array(R),O=_.byteOffset,A=r,D=E,M=A+t-1&~(t-1),S=D+T-1&~(T-1),I=M*S*n$4[e],o=0;o<R;o++)G[o]={levelID:o,levelWidth:R>1?A:M,levelHeight:R>1?D:S,levelBuffer:new Uint8Array(_.buffer,O,I)},O+=I,I=(M=(A=A>>1||1)+t-1&~(t-1))*(S=(D=D>>1||1)+T-1&~(T-1))*n$4[e];return G},e}(B$2),P$4=function(){function _(){}return _.use=function(e,R){var t=e.data;if(e.type===p$4.TYPE.JSON&&t&&t.cacheID&&t.textures){for(var T=t.textures,G=void 0,O=void 0,A=0,D=T.length;A<D;A++){var M=T[A],S=M.src,n=M.format;if(n||(O=S),_.textureFormats[n]){G=S;break}}if(!(G=G||O))return void R(new Error("Cannot load compressed-textures in "+e.url+", make sure you provide a fallback"));if(G===e.url)return void R(new Error("URL of compressed texture cannot be the same as the manifest's URL"));var I={crossOrigin:e.crossOrigin,metadata:e.metadata.imageMetadata,parentResource:e},o=o$a.resolve(e.url.replace(this.baseUrl,""),G),X=t.cacheID;this.add(X,o,I,(function(_){if(_.error)R(_.error);else {var t=_.texture,T=void 0===t?null:t,r=_.textures,E=void 0===r?{}:r;Object.assign(e,{texture:T,textures:E}),R();}}));}else R();},Object.defineProperty(_,"textureExtensions",{get:function(){if(!_._textureExtensions){var e=document.createElement("canvas").getContext("webgl");if(!e)return {};var R={s3tc:e.getExtension("WEBGL_compressed_texture_s3tc"),s3tc_sRGB:e.getExtension("WEBGL_compressed_texture_s3tc_srgb"),etc:e.getExtension("WEBGL_compressed_texture_etc"),etc1:e.getExtension("WEBGL_compressed_texture_etc1"),pvrtc:e.getExtension("WEBGL_compressed_texture_pvrtc")||e.getExtension("WEBKIT_WEBGL_compressed_texture_pvrtc"),atc:e.getExtension("WEBGL_compressed_texture_atc"),astc:e.getExtension("WEBGL_compressed_texture_astc")};_._textureExtensions=R;}return _._textureExtensions},enumerable:!1,configurable:!0}),Object.defineProperty(_,"textureFormats",{get:function(){if(!_._textureFormats){var e=_.textureExtensions;for(var R in _._textureFormats={},e){var t=e[R];t&&Object.assign(_._textureFormats,Object.getPrototypeOf(t));}}return _._textureFormats},enumerable:!1,configurable:!0}),_.extension=e$2.Loader,_}();function s$3(_,e,R){var r={textures:{},texture:null};return e?(e.map((function(_){return new ye(new te(_,Object.assign({mipmap:P$7.OFF,alphaMode:D$4.NO_PREMULTIPLIED_ALPHA},R)))})).forEach((function(e,R){var E=e.baseTexture,G=_+"-"+(R+1);te.addToCache(E,G),ye.addToCache(e,G),0===R&&(te.addToCache(E,_),ye.addToCache(e,_),r.texture=e),r.textures[G]=e;})),r):r}var C$4,f$4,N$4=3,l$5=4,c$6=7,U$3=19,L$3=2,d$5=0,h$2=1,v$4=2,p$3=3;!function(_){_[_.DXGI_FORMAT_UNKNOWN=0]="DXGI_FORMAT_UNKNOWN",_[_.DXGI_FORMAT_R32G32B32A32_TYPELESS=1]="DXGI_FORMAT_R32G32B32A32_TYPELESS",_[_.DXGI_FORMAT_R32G32B32A32_FLOAT=2]="DXGI_FORMAT_R32G32B32A32_FLOAT",_[_.DXGI_FORMAT_R32G32B32A32_UINT=3]="DXGI_FORMAT_R32G32B32A32_UINT",_[_.DXGI_FORMAT_R32G32B32A32_SINT=4]="DXGI_FORMAT_R32G32B32A32_SINT",_[_.DXGI_FORMAT_R32G32B32_TYPELESS=5]="DXGI_FORMAT_R32G32B32_TYPELESS",_[_.DXGI_FORMAT_R32G32B32_FLOAT=6]="DXGI_FORMAT_R32G32B32_FLOAT",_[_.DXGI_FORMAT_R32G32B32_UINT=7]="DXGI_FORMAT_R32G32B32_UINT",_[_.DXGI_FORMAT_R32G32B32_SINT=8]="DXGI_FORMAT_R32G32B32_SINT",_[_.DXGI_FORMAT_R16G16B16A16_TYPELESS=9]="DXGI_FORMAT_R16G16B16A16_TYPELESS",_[_.DXGI_FORMAT_R16G16B16A16_FLOAT=10]="DXGI_FORMAT_R16G16B16A16_FLOAT",_[_.DXGI_FORMAT_R16G16B16A16_UNORM=11]="DXGI_FORMAT_R16G16B16A16_UNORM",_[_.DXGI_FORMAT_R16G16B16A16_UINT=12]="DXGI_FORMAT_R16G16B16A16_UINT",_[_.DXGI_FORMAT_R16G16B16A16_SNORM=13]="DXGI_FORMAT_R16G16B16A16_SNORM",_[_.DXGI_FORMAT_R16G16B16A16_SINT=14]="DXGI_FORMAT_R16G16B16A16_SINT",_[_.DXGI_FORMAT_R32G32_TYPELESS=15]="DXGI_FORMAT_R32G32_TYPELESS",_[_.DXGI_FORMAT_R32G32_FLOAT=16]="DXGI_FORMAT_R32G32_FLOAT",_[_.DXGI_FORMAT_R32G32_UINT=17]="DXGI_FORMAT_R32G32_UINT",_[_.DXGI_FORMAT_R32G32_SINT=18]="DXGI_FORMAT_R32G32_SINT",_[_.DXGI_FORMAT_R32G8X24_TYPELESS=19]="DXGI_FORMAT_R32G8X24_TYPELESS",_[_.DXGI_FORMAT_D32_FLOAT_S8X24_UINT=20]="DXGI_FORMAT_D32_FLOAT_S8X24_UINT",_[_.DXGI_FORMAT_R32_FLOAT_X8X24_TYPELESS=21]="DXGI_FORMAT_R32_FLOAT_X8X24_TYPELESS",_[_.DXGI_FORMAT_X32_TYPELESS_G8X24_UINT=22]="DXGI_FORMAT_X32_TYPELESS_G8X24_UINT",_[_.DXGI_FORMAT_R10G10B10A2_TYPELESS=23]="DXGI_FORMAT_R10G10B10A2_TYPELESS",_[_.DXGI_FORMAT_R10G10B10A2_UNORM=24]="DXGI_FORMAT_R10G10B10A2_UNORM",_[_.DXGI_FORMAT_R10G10B10A2_UINT=25]="DXGI_FORMAT_R10G10B10A2_UINT",_[_.DXGI_FORMAT_R11G11B10_FLOAT=26]="DXGI_FORMAT_R11G11B10_FLOAT",_[_.DXGI_FORMAT_R8G8B8A8_TYPELESS=27]="DXGI_FORMAT_R8G8B8A8_TYPELESS",_[_.DXGI_FORMAT_R8G8B8A8_UNORM=28]="DXGI_FORMAT_R8G8B8A8_UNORM",_[_.DXGI_FORMAT_R8G8B8A8_UNORM_SRGB=29]="DXGI_FORMAT_R8G8B8A8_UNORM_SRGB",_[_.DXGI_FORMAT_R8G8B8A8_UINT=30]="DXGI_FORMAT_R8G8B8A8_UINT",_[_.DXGI_FORMAT_R8G8B8A8_SNORM=31]="DXGI_FORMAT_R8G8B8A8_SNORM",_[_.DXGI_FORMAT_R8G8B8A8_SINT=32]="DXGI_FORMAT_R8G8B8A8_SINT",_[_.DXGI_FORMAT_R16G16_TYPELESS=33]="DXGI_FORMAT_R16G16_TYPELESS",_[_.DXGI_FORMAT_R16G16_FLOAT=34]="DXGI_FORMAT_R16G16_FLOAT",_[_.DXGI_FORMAT_R16G16_UNORM=35]="DXGI_FORMAT_R16G16_UNORM",_[_.DXGI_FORMAT_R16G16_UINT=36]="DXGI_FORMAT_R16G16_UINT",_[_.DXGI_FORMAT_R16G16_SNORM=37]="DXGI_FORMAT_R16G16_SNORM",_[_.DXGI_FORMAT_R16G16_SINT=38]="DXGI_FORMAT_R16G16_SINT",_[_.DXGI_FORMAT_R32_TYPELESS=39]="DXGI_FORMAT_R32_TYPELESS",_[_.DXGI_FORMAT_D32_FLOAT=40]="DXGI_FORMAT_D32_FLOAT",_[_.DXGI_FORMAT_R32_FLOAT=41]="DXGI_FORMAT_R32_FLOAT",_[_.DXGI_FORMAT_R32_UINT=42]="DXGI_FORMAT_R32_UINT",_[_.DXGI_FORMAT_R32_SINT=43]="DXGI_FORMAT_R32_SINT",_[_.DXGI_FORMAT_R24G8_TYPELESS=44]="DXGI_FORMAT_R24G8_TYPELESS",_[_.DXGI_FORMAT_D24_UNORM_S8_UINT=45]="DXGI_FORMAT_D24_UNORM_S8_UINT",_[_.DXGI_FORMAT_R24_UNORM_X8_TYPELESS=46]="DXGI_FORMAT_R24_UNORM_X8_TYPELESS",_[_.DXGI_FORMAT_X24_TYPELESS_G8_UINT=47]="DXGI_FORMAT_X24_TYPELESS_G8_UINT",_[_.DXGI_FORMAT_R8G8_TYPELESS=48]="DXGI_FORMAT_R8G8_TYPELESS",_[_.DXGI_FORMAT_R8G8_UNORM=49]="DXGI_FORMAT_R8G8_UNORM",_[_.DXGI_FORMAT_R8G8_UINT=50]="DXGI_FORMAT_R8G8_UINT",_[_.DXGI_FORMAT_R8G8_SNORM=51]="DXGI_FORMAT_R8G8_SNORM",_[_.DXGI_FORMAT_R8G8_SINT=52]="DXGI_FORMAT_R8G8_SINT",_[_.DXGI_FORMAT_R16_TYPELESS=53]="DXGI_FORMAT_R16_TYPELESS",_[_.DXGI_FORMAT_R16_FLOAT=54]="DXGI_FORMAT_R16_FLOAT",_[_.DXGI_FORMAT_D16_UNORM=55]="DXGI_FORMAT_D16_UNORM",_[_.DXGI_FORMAT_R16_UNORM=56]="DXGI_FORMAT_R16_UNORM",_[_.DXGI_FORMAT_R16_UINT=57]="DXGI_FORMAT_R16_UINT",_[_.DXGI_FORMAT_R16_SNORM=58]="DXGI_FORMAT_R16_SNORM",_[_.DXGI_FORMAT_R16_SINT=59]="DXGI_FORMAT_R16_SINT",_[_.DXGI_FORMAT_R8_TYPELESS=60]="DXGI_FORMAT_R8_TYPELESS",_[_.DXGI_FORMAT_R8_UNORM=61]="DXGI_FORMAT_R8_UNORM",_[_.DXGI_FORMAT_R8_UINT=62]="DXGI_FORMAT_R8_UINT",_[_.DXGI_FORMAT_R8_SNORM=63]="DXGI_FORMAT_R8_SNORM",_[_.DXGI_FORMAT_R8_SINT=64]="DXGI_FORMAT_R8_SINT",_[_.DXGI_FORMAT_A8_UNORM=65]="DXGI_FORMAT_A8_UNORM",_[_.DXGI_FORMAT_R1_UNORM=66]="DXGI_FORMAT_R1_UNORM",_[_.DXGI_FORMAT_R9G9B9E5_SHAREDEXP=67]="DXGI_FORMAT_R9G9B9E5_SHAREDEXP",_[_.DXGI_FORMAT_R8G8_B8G8_UNORM=68]="DXGI_FORMAT_R8G8_B8G8_UNORM",_[_.DXGI_FORMAT_G8R8_G8B8_UNORM=69]="DXGI_FORMAT_G8R8_G8B8_UNORM",_[_.DXGI_FORMAT_BC1_TYPELESS=70]="DXGI_FORMAT_BC1_TYPELESS",_[_.DXGI_FORMAT_BC1_UNORM=71]="DXGI_FORMAT_BC1_UNORM",_[_.DXGI_FORMAT_BC1_UNORM_SRGB=72]="DXGI_FORMAT_BC1_UNORM_SRGB",_[_.DXGI_FORMAT_BC2_TYPELESS=73]="DXGI_FORMAT_BC2_TYPELESS",_[_.DXGI_FORMAT_BC2_UNORM=74]="DXGI_FORMAT_BC2_UNORM",_[_.DXGI_FORMAT_BC2_UNORM_SRGB=75]="DXGI_FORMAT_BC2_UNORM_SRGB",_[_.DXGI_FORMAT_BC3_TYPELESS=76]="DXGI_FORMAT_BC3_TYPELESS",_[_.DXGI_FORMAT_BC3_UNORM=77]="DXGI_FORMAT_BC3_UNORM",_[_.DXGI_FORMAT_BC3_UNORM_SRGB=78]="DXGI_FORMAT_BC3_UNORM_SRGB",_[_.DXGI_FORMAT_BC4_TYPELESS=79]="DXGI_FORMAT_BC4_TYPELESS",_[_.DXGI_FORMAT_BC4_UNORM=80]="DXGI_FORMAT_BC4_UNORM",_[_.DXGI_FORMAT_BC4_SNORM=81]="DXGI_FORMAT_BC4_SNORM",_[_.DXGI_FORMAT_BC5_TYPELESS=82]="DXGI_FORMAT_BC5_TYPELESS",_[_.DXGI_FORMAT_BC5_UNORM=83]="DXGI_FORMAT_BC5_UNORM",_[_.DXGI_FORMAT_BC5_SNORM=84]="DXGI_FORMAT_BC5_SNORM",_[_.DXGI_FORMAT_B5G6R5_UNORM=85]="DXGI_FORMAT_B5G6R5_UNORM",_[_.DXGI_FORMAT_B5G5R5A1_UNORM=86]="DXGI_FORMAT_B5G5R5A1_UNORM",_[_.DXGI_FORMAT_B8G8R8A8_UNORM=87]="DXGI_FORMAT_B8G8R8A8_UNORM",_[_.DXGI_FORMAT_B8G8R8X8_UNORM=88]="DXGI_FORMAT_B8G8R8X8_UNORM",_[_.DXGI_FORMAT_R10G10B10_XR_BIAS_A2_UNORM=89]="DXGI_FORMAT_R10G10B10_XR_BIAS_A2_UNORM",_[_.DXGI_FORMAT_B8G8R8A8_TYPELESS=90]="DXGI_FORMAT_B8G8R8A8_TYPELESS",_[_.DXGI_FORMAT_B8G8R8A8_UNORM_SRGB=91]="DXGI_FORMAT_B8G8R8A8_UNORM_SRGB",_[_.DXGI_FORMAT_B8G8R8X8_TYPELESS=92]="DXGI_FORMAT_B8G8R8X8_TYPELESS",_[_.DXGI_FORMAT_B8G8R8X8_UNORM_SRGB=93]="DXGI_FORMAT_B8G8R8X8_UNORM_SRGB",_[_.DXGI_FORMAT_BC6H_TYPELESS=94]="DXGI_FORMAT_BC6H_TYPELESS",_[_.DXGI_FORMAT_BC6H_UF16=95]="DXGI_FORMAT_BC6H_UF16",_[_.DXGI_FORMAT_BC6H_SF16=96]="DXGI_FORMAT_BC6H_SF16",_[_.DXGI_FORMAT_BC7_TYPELESS=97]="DXGI_FORMAT_BC7_TYPELESS",_[_.DXGI_FORMAT_BC7_UNORM=98]="DXGI_FORMAT_BC7_UNORM",_[_.DXGI_FORMAT_BC7_UNORM_SRGB=99]="DXGI_FORMAT_BC7_UNORM_SRGB",_[_.DXGI_FORMAT_AYUV=100]="DXGI_FORMAT_AYUV",_[_.DXGI_FORMAT_Y410=101]="DXGI_FORMAT_Y410",_[_.DXGI_FORMAT_Y416=102]="DXGI_FORMAT_Y416",_[_.DXGI_FORMAT_NV12=103]="DXGI_FORMAT_NV12",_[_.DXGI_FORMAT_P010=104]="DXGI_FORMAT_P010",_[_.DXGI_FORMAT_P016=105]="DXGI_FORMAT_P016",_[_.DXGI_FORMAT_420_OPAQUE=106]="DXGI_FORMAT_420_OPAQUE",_[_.DXGI_FORMAT_YUY2=107]="DXGI_FORMAT_YUY2",_[_.DXGI_FORMAT_Y210=108]="DXGI_FORMAT_Y210",_[_.DXGI_FORMAT_Y216=109]="DXGI_FORMAT_Y216",_[_.DXGI_FORMAT_NV11=110]="DXGI_FORMAT_NV11",_[_.DXGI_FORMAT_AI44=111]="DXGI_FORMAT_AI44",_[_.DXGI_FORMAT_IA44=112]="DXGI_FORMAT_IA44",_[_.DXGI_FORMAT_P8=113]="DXGI_FORMAT_P8",_[_.DXGI_FORMAT_A8P8=114]="DXGI_FORMAT_A8P8",_[_.DXGI_FORMAT_B4G4R4A4_UNORM=115]="DXGI_FORMAT_B4G4R4A4_UNORM",_[_.DXGI_FORMAT_P208=116]="DXGI_FORMAT_P208",_[_.DXGI_FORMAT_V208=117]="DXGI_FORMAT_V208",_[_.DXGI_FORMAT_V408=118]="DXGI_FORMAT_V408",_[_.DXGI_FORMAT_SAMPLER_FEEDBACK_MIN_MIP_OPAQUE=119]="DXGI_FORMAT_SAMPLER_FEEDBACK_MIN_MIP_OPAQUE",_[_.DXGI_FORMAT_SAMPLER_FEEDBACK_MIP_REGION_USED_OPAQUE=120]="DXGI_FORMAT_SAMPLER_FEEDBACK_MIP_REGION_USED_OPAQUE",_[_.DXGI_FORMAT_FORCE_UINT=121]="DXGI_FORMAT_FORCE_UINT";}(C$4||(C$4={})),function(_){_[_.DDS_DIMENSION_TEXTURE1D=2]="DDS_DIMENSION_TEXTURE1D",_[_.DDS_DIMENSION_TEXTURE2D=3]="DDS_DIMENSION_TEXTURE2D",_[_.DDS_DIMENSION_TEXTURE3D=6]="DDS_DIMENSION_TEXTURE3D";}(f$4||(f$4={}));var x$4,w$1,m$3,y$5=((i$1={})[827611204]=S$4.COMPRESSED_RGBA_S3TC_DXT1_EXT,i$1[861165636]=S$4.COMPRESSED_RGBA_S3TC_DXT3_EXT,i$1[894720068]=S$4.COMPRESSED_RGBA_S3TC_DXT5_EXT,i$1),Y$1=((F$2={})[C$4.DXGI_FORMAT_BC1_TYPELESS]=S$4.COMPRESSED_RGBA_S3TC_DXT1_EXT,F$2[C$4.DXGI_FORMAT_BC1_UNORM]=S$4.COMPRESSED_RGBA_S3TC_DXT1_EXT,F$2[C$4.DXGI_FORMAT_BC2_TYPELESS]=S$4.COMPRESSED_RGBA_S3TC_DXT3_EXT,F$2[C$4.DXGI_FORMAT_BC2_UNORM]=S$4.COMPRESSED_RGBA_S3TC_DXT3_EXT,F$2[C$4.DXGI_FORMAT_BC3_TYPELESS]=S$4.COMPRESSED_RGBA_S3TC_DXT5_EXT,F$2[C$4.DXGI_FORMAT_BC3_UNORM]=S$4.COMPRESSED_RGBA_S3TC_DXT5_EXT,F$2[C$4.DXGI_FORMAT_BC1_UNORM_SRGB]=S$4.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT,F$2[C$4.DXGI_FORMAT_BC2_UNORM_SRGB]=S$4.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT,F$2[C$4.DXGI_FORMAT_BC3_UNORM_SRGB]=S$4.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT,F$2);function b$3(_){var e=new Uint32Array(_);if(542327876!==e[0])throw new Error("Invalid DDS file magic word");var R=new Uint32Array(_,0,124/Uint32Array.BYTES_PER_ELEMENT),t=R[N$4],T=R[l$5],r=R[c$6],E=new Uint32Array(_,U$3*Uint32Array.BYTES_PER_ELEMENT,32/Uint32Array.BYTES_PER_ELEMENT),G=E[1];if(4&G){var O=E[L$3];if(808540228!==O){var A=y$5[O],D=new Uint8Array(_,128);return [new u$5(D,{format:A,width:T,height:t,levels:r})]}var M=new Uint32Array(e.buffer,128,20/Uint32Array.BYTES_PER_ELEMENT),S=M[d$5],I=M[h$2],o=M[v$4],X=M[p$3],a=Y$1[S];if(void 0===a)throw new Error("DDSParser cannot parse texture data with DXGI format "+S);if(4===o)throw new Error("DDSParser does not support cubemap textures");if(I===f$4.DDS_DIMENSION_TEXTURE3D)throw new Error("DDSParser does not supported 3D texture data");var i=new Array;if(1===X)i.push(new Uint8Array(_,148));else {for(var F=n$4[a],B=0,P=T,s=t,C=0;C<r;C++){B+=Math.max(1,P+3&-4)*Math.max(1,s+3&-4)*F,P>>>=1,s>>>=1;}var x=148;for(C=0;C<X;C++)i.push(new Uint8Array(_,x,B)),x+=B;}return i.map((function(_){return new u$5(_,{format:a,width:T,height:t,levels:r})}))}if(64&G)throw new Error("DDSParser does not support uncompressed texture data.");if(512&G)throw new Error("DDSParser does not supported YUV uncompressed texture data.");if(131072&G)throw new Error("DDSParser does not support single-channel (lumninance) texture data!");if(2&G)throw new Error("DDSParser does not support single-channel (alpha) texture data!");throw new Error("DDSParser failed to load a texture file due to an unknown reason!")}var g$4=[171,75,84,88,32,49,49,187,13,10,26,10],H$2=12,V$1=16,W$1=24,k$3=28,K$1=36,j$1=40,Q$1=44,z$2=48,J$1=52,q$1=56,Z$1=60,$$1=((x$4={})[L$5.UNSIGNED_BYTE]=1,x$4[L$5.UNSIGNED_SHORT]=2,x$4[L$5.INT]=4,x$4[L$5.UNSIGNED_INT]=4,x$4[L$5.FLOAT]=4,x$4[L$5.HALF_FLOAT]=8,x$4),__=((w$1={})[I$7.RGBA]=4,w$1[I$7.RGB]=3,w$1[I$7.RG]=2,w$1[I$7.RED]=1,w$1[I$7.LUMINANCE]=1,w$1[I$7.LUMINANCE_ALPHA]=2,w$1[I$7.ALPHA]=1,w$1),e_=((m$3={})[L$5.UNSIGNED_SHORT_4_4_4_4]=2,m$3[L$5.UNSIGNED_SHORT_5_5_5_1]=2,m$3[L$5.UNSIGNED_SHORT_5_6_5]=2,m$3);function R_(_,R,t){void 0===t&&(t=!1);var T=new DataView(R);if(!function(_,e){for(var R=0;R<g$4.length;R++)if(e.getUint8(R)!==g$4[R])return !1;return !0}(0,T))return null;var r=67305985===T.getUint32(H$2,!0),E=T.getUint32(V$1,r),G=T.getUint32(W$1,r),O=T.getUint32(k$3,r),D=T.getUint32(K$1,r),M=T.getUint32(j$1,r)||1,S=T.getUint32(Q$1,r)||1,I=T.getUint32(z$2,r)||1,o=T.getUint32(J$1,r),X=T.getUint32(q$1,r),a=T.getUint32(Z$1,r);if(0===M||1!==S)throw new Error("Only 2D textures are supported");if(1!==o)throw new Error("CubeTextures are not supported by KTXLoader yet!");if(1!==I)throw new Error("WebGL does not support array textures");var i,F=D+3&-4,B=M+3&-4,P=new Array(I),s=D*M;if(0===E&&(s=F*B),void 0===(i=0!==E?$$1[E]?$$1[E]*__[G]:e_[E]:n$4[O]))throw new Error("Unable to resolve the pixel format stored in the *.ktx file!");for(var C=t?function(_,e,R){var t=new Map,T=0;for(;T<e;){var r=_.getUint32(64+T,R),E=64+T+4,G=3-(r+3)%4;if(0===r||r>e-T){console.error("KTXLoader: keyAndValueByteSize out of bounds");break}for(var O=0;O<r&&0!==_.getUint8(E+O);O++);if(-1===O){console.error("KTXLoader: Failed to find null byte terminating kvData key");break}var A=(new TextDecoder).decode(new Uint8Array(_.buffer,E,O)),D=new DataView(_.buffer,E+O+1,r-O-1);t.set(A,D),T+=4+r+G;}return t}(T,a,r):null,f=s*i,N=D,l=M,c=F,U=B,L=64+a,d=0;d<X;d++){for(var h=T.getUint32(L,r),v=L+4,p=0;p<I;p++){var x=P[p];x||(x=P[p]=new Array(X)),x[d]={levelID:d,levelWidth:X>1||0!==E?N:c,levelHeight:X>1||0!==E?l:U,levelBuffer:new Uint8Array(R,v,f)},v+=f;}L=(L+=h+4)%4!=0?L+4-L%4:L,f=(c=(N=N>>1||1)+4-1&-4)*(U=(l=l>>1||1)+4-1&-4)*i;}return 0!==E?{uncompressed:P.map((function(_){var R=_[0].levelBuffer,t=!1;return E===L$5.FLOAT?R=new Float32Array(_[0].levelBuffer.buffer,_[0].levelBuffer.byteOffset,_[0].levelBuffer.byteLength/4):E===L$5.UNSIGNED_INT?(t=!0,R=new Uint32Array(_[0].levelBuffer.buffer,_[0].levelBuffer.byteOffset,_[0].levelBuffer.byteLength/4)):E===L$5.INT&&(t=!0,R=new Int32Array(_[0].levelBuffer.buffer,_[0].levelBuffer.byteOffset,_[0].levelBuffer.byteLength/4)),{resource:new Q$2(R,{width:_[0].levelWidth,height:_[0].levelHeight}),type:E,format:t?t_(G):G}})),kvData:C}:{compressed:P.map((function(_){return new u$5(null,{format:O,width:D,height:M,levels:X,levelBuffers:_})})),kvData:C}}function t_(_){switch(_){case I$7.RGBA:return I$7.RGBA_INTEGER;case I$7.RGB:return I$7.RGB_INTEGER;case I$7.RG:return I$7.RG_INTEGER;case I$7.RED:return I$7.RED_INTEGER;default:return _}}p$4.setExtensionXhrType("dds",p$4.XHR_RESPONSE_TYPE.BUFFER);var T_=function(){function _(){}return _.use=function(_,e){if("dds"===_.extension&&_.data)try{Object.assign(_,s$3(_.name||_.url,b$3(_.data),_.metadata));}catch(_){return void e(_)}e();},_.extension=e$2.Loader,_}();p$4.setExtensionXhrType("ktx",p$4.XHR_RESPONSE_TYPE.BUFFER);var r_=function(){function _(){}return _.use=function(_,e){if("ktx"===_.extension&&_.data)try{var R=_.name||_.url,r=R_(0,_.data,this.loadKeyValueData),E=r.compressed,A=r.uncompressed,D=r.kvData;if(E){var M=s$3(R,E,_.metadata);if(D&&M.textures)for(var S in M.textures)M.textures[S].baseTexture.ktxKeyValueData=D;Object.assign(_,M);}else if(A){var n={};A.forEach((function(_,e){var r=new ye(new te(_.resource,{mipmap:P$7.OFF,alphaMode:D$4.NO_PREMULTIPLIED_ALPHA,type:_.type,format:_.format})),E=R+"-"+(e+1);D&&(r.baseTexture.ktxKeyValueData=D),te.addToCache(r.baseTexture,E),ye.addToCache(r,E),0===e&&(n[R]=r,te.addToCache(r.baseTexture,R),ye.addToCache(r,R)),n[E]=r;})),Object.assign(_,{textures:n});}}catch(_){return void e(_)}e();},_.extension=e$2.Loader,_.loadKeyValueData=!1,_}();

  /*!
   * @pixi/particle-container - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/particle-container is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  var y$4=function(t,e){return y$4=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,e){t.__proto__=e;}||function(t,e){for(var i in e)e.hasOwnProperty(i)&&(t[i]=e[i]);},y$4(t,e)};function v$3(t,e){function i(){this.constructor=t;}y$4(t,e),t.prototype=null===e?Object.create(e):(i.prototype=e.prototype,new i);}(function(e){function i(i,r,o,a){void 0===i&&(i=1500),void 0===o&&(o=16384),void 0===a&&(a=!1);var n=e.call(this)||this;return o>16384&&(o=16384),n._properties=[!1,!0,!1,!1,!1],n._maxSize=i,n._batchSize=o,n._buffers=null,n._bufferUpdateIDs=[],n._updateID=0,n.interactiveChildren=!1,n.blendMode=T$8.NORMAL,n.autoResize=a,n.roundPixels=!0,n.baseTexture=null,n.setProperties(r),n._tint=0,n.tintRgb=new Float32Array(4),n.tint=16777215,n}return v$3(i,e),i.prototype.setProperties=function(t){t&&(this._properties[0]="vertices"in t||"scale"in t?!!t.vertices||!!t.scale:this._properties[0],this._properties[1]="position"in t?!!t.position:this._properties[1],this._properties[2]="rotation"in t?!!t.rotation:this._properties[2],this._properties[3]="uvs"in t?!!t.uvs:this._properties[3],this._properties[4]="tint"in t||"alpha"in t?!!t.tint||!!t.alpha:this._properties[4]);},i.prototype.updateTransform=function(){this.displayObjectUpdateTransform();},Object.defineProperty(i.prototype,"tint",{get:function(){return this._tint},set:function(t){this._tint=t,s$7(t,this.tintRgb);},enumerable:!1,configurable:!0}),i.prototype.render=function(t){var e=this;this.visible&&!(this.worldAlpha<=0)&&this.children.length&&this.renderable&&(this.baseTexture||(this.baseTexture=this.children[0]._texture.baseTexture,this.baseTexture.valid||this.baseTexture.once("update",(function(){return e.onChildrenChange(0)}))),t.batch.setObjectRenderer(t.plugins.particle),t.plugins.particle.render(this));},i.prototype.onChildrenChange=function(t){for(var e=Math.floor(t/this._batchSize);this._bufferUpdateIDs.length<e;)this._bufferUpdateIDs.push(0);this._bufferUpdateIDs[e]=++this._updateID;},i.prototype.dispose=function(){if(this._buffers){for(var t=0;t<this._buffers.length;++t)this._buffers[t].destroy();this._buffers=null;}},i.prototype.destroy=function(t){e.prototype.destroy.call(this,t),this.dispose(),this._properties=null,this._buffers=null,this._bufferUpdateIDs=null;},i})(g$6);var _$5=function(){function t(t,i,r){this.geometry=new Ie,this.indexBuffer=null,this.size=r,this.dynamicProperties=[],this.staticProperties=[];for(var o=0;o<t.length;++o){var a=t[o];a={attributeName:a.attributeName,size:a.size,uploadFunction:a.uploadFunction,type:a.type||L$5.FLOAT,offset:a.offset},i[o]?this.dynamicProperties.push(a):this.staticProperties.push(a);}this.staticStride=0,this.staticBuffer=null,this.staticData=null,this.staticDataUint32=null,this.dynamicStride=0,this.dynamicBuffer=null,this.dynamicData=null,this.dynamicDataUint32=null,this._updateID=0,this.initBuffers();}return t.prototype.initBuffers=function(){var t=this.geometry,i=0;this.indexBuffer=new Te(A$5(this.size),!0,!0),t.addIndex(this.indexBuffer),this.dynamicStride=0;for(var r=0;r<this.dynamicProperties.length;++r){(u=this.dynamicProperties[r]).offset=i,i+=u.size,this.dynamicStride+=u.size;}var a=new ArrayBuffer(this.size*this.dynamicStride*4*4);this.dynamicData=new Float32Array(a),this.dynamicDataUint32=new Uint32Array(a),this.dynamicBuffer=new Te(this.dynamicData,!1,!1);var n=0;this.staticStride=0;for(r=0;r<this.staticProperties.length;++r){(u=this.staticProperties[r]).offset=n,n+=u.size,this.staticStride+=u.size;}var s=new ArrayBuffer(this.size*this.staticStride*4*4);this.staticData=new Float32Array(s),this.staticDataUint32=new Uint32Array(s),this.staticBuffer=new Te(this.staticData,!0,!1);for(r=0;r<this.dynamicProperties.length;++r){var u=this.dynamicProperties[r];t.addAttribute(u.attributeName,this.dynamicBuffer,0,u.type===L$5.UNSIGNED_BYTE,u.type,4*this.dynamicStride,4*u.offset);}for(r=0;r<this.staticProperties.length;++r){u=this.staticProperties[r];t.addAttribute(u.attributeName,this.staticBuffer,0,u.type===L$5.UNSIGNED_BYTE,u.type,4*this.staticStride,4*u.offset);}},t.prototype.uploadDynamic=function(t,i,r){for(var o=0;o<this.dynamicProperties.length;o++){var a=this.dynamicProperties[o];a.uploadFunction(t,i,r,a.type===L$5.UNSIGNED_BYTE?this.dynamicDataUint32:this.dynamicData,this.dynamicStride,a.offset);}this.dynamicBuffer._updateID++;},t.prototype.uploadStatic=function(t,i,r){for(var o=0;o<this.staticProperties.length;o++){var a=this.staticProperties[o];a.uploadFunction(t,i,r,a.type===L$5.UNSIGNED_BYTE?this.staticDataUint32:this.staticData,this.staticStride,a.offset);}this.staticBuffer._updateID++;},t.prototype.destroy=function(){this.indexBuffer=null,this.dynamicProperties=null,this.dynamicBuffer=null,this.dynamicData=null,this.dynamicDataUint32=null,this.staticProperties=null,this.staticBuffer=null,this.staticData=null,this.staticDataUint32=null,this.geometry.destroy();},t}(),x$3=function(t){function i(i){var r=t.call(this,i)||this;return r.shader=null,r.properties=null,r.tempMatrix=new p$7,r.properties=[{attributeName:"aVertexPosition",size:2,uploadFunction:r.uploadVertices,offset:0},{attributeName:"aPositionCoord",size:2,uploadFunction:r.uploadPosition,offset:0},{attributeName:"aRotation",size:1,uploadFunction:r.uploadRotation,offset:0},{attributeName:"aTextureCoord",size:2,uploadFunction:r.uploadUvs,offset:0},{attributeName:"aColor",size:1,type:L$5.UNSIGNED_BYTE,uploadFunction:r.uploadTint,offset:0}],r.shader=gt.from("attribute vec2 aVertexPosition;\nattribute vec2 aTextureCoord;\nattribute vec4 aColor;\n\nattribute vec2 aPositionCoord;\nattribute float aRotation;\n\nuniform mat3 translationMatrix;\nuniform vec4 uColor;\n\nvarying vec2 vTextureCoord;\nvarying vec4 vColor;\n\nvoid main(void){\n    float x = (aVertexPosition.x) * cos(aRotation) - (aVertexPosition.y) * sin(aRotation);\n    float y = (aVertexPosition.x) * sin(aRotation) + (aVertexPosition.y) * cos(aRotation);\n\n    vec2 v = vec2(x, y);\n    v = v + aPositionCoord;\n\n    gl_Position = vec4((translationMatrix * vec3(v, 1.0)).xy, 0.0, 1.0);\n\n    vTextureCoord = aTextureCoord;\n    vColor = aColor * uColor;\n}\n","varying vec2 vTextureCoord;\nvarying vec4 vColor;\n\nuniform sampler2D uSampler;\n\nvoid main(void){\n    vec4 color = texture2D(uSampler, vTextureCoord) * vColor;\n    gl_FragColor = color;\n}",{}),r.state=yt.for2d(),r}return v$3(i,t),i.prototype.render=function(t){var e=t.children,i=t._maxSize,r=t._batchSize,o=this.renderer,s=e.length;if(0!==s){s>i&&!t.autoResize&&(s=i);var u=t._buffers;u||(u=t._buffers=this.generateBuffers(t));var p=e[0]._texture.baseTexture,h=p.alphaMode>0;this.state.blendMode=v$8(t.blendMode,h),o.state.set(this.state);var f=o.gl,d=t.worldTransform.copyTo(this.tempMatrix);d.prepend(o.globalUniforms.uniforms.projectionMatrix),this.shader.uniforms.translationMatrix=d.toArray(!0),this.shader.uniforms.uColor=m$6(t.tintRgb,t.worldAlpha,this.shader.uniforms.uColor,h),this.shader.uniforms.uSampler=p,this.renderer.shader.bind(this.shader);for(var l=!1,c=0,y=0;c<s;c+=r,y+=1){var v=s-c;v>r&&(v=r),y>=u.length&&u.push(this._generateOneMoreBuffer(t));var m=u[y];m.uploadDynamic(e,c,v);var _=t._bufferUpdateIDs[y]||0;(l=l||m._updateID<_)&&(m._updateID=t._updateID,m.uploadStatic(e,c,v)),o.geometry.bind(m.geometry),f.drawElements(f.TRIANGLES,6*v,f.UNSIGNED_SHORT,0);}}},i.prototype.generateBuffers=function(t){for(var e=[],i=t._maxSize,r=t._batchSize,o=t._properties,a=0;a<i;a+=r)e.push(new _$5(this.properties,o,r));return e},i.prototype._generateOneMoreBuffer=function(t){var e=t._batchSize,i=t._properties;return new _$5(this.properties,i,e)},i.prototype.uploadVertices=function(t,e,i,r,o,a){for(var n=0,s=0,u=0,p=0,h=0;h<i;++h){var f=t[e+h],d=f._texture,l=f.scale.x,c=f.scale.y,y=d.trim,v=d.orig;y?(n=(s=y.x-f.anchor.x*v.width)+y.width,u=(p=y.y-f.anchor.y*v.height)+y.height):(n=v.width*(1-f.anchor.x),s=v.width*-f.anchor.x,u=v.height*(1-f.anchor.y),p=v.height*-f.anchor.y),r[a]=s*l,r[a+1]=p*c,r[a+o]=n*l,r[a+o+1]=p*c,r[a+2*o]=n*l,r[a+2*o+1]=u*c,r[a+3*o]=s*l,r[a+3*o+1]=u*c,a+=4*o;}},i.prototype.uploadPosition=function(t,e,i,r,o,a){for(var n=0;n<i;n++){var s=t[e+n].position;r[a]=s.x,r[a+1]=s.y,r[a+o]=s.x,r[a+o+1]=s.y,r[a+2*o]=s.x,r[a+2*o+1]=s.y,r[a+3*o]=s.x,r[a+3*o+1]=s.y,a+=4*o;}},i.prototype.uploadRotation=function(t,e,i,r,o,a){for(var n=0;n<i;n++){var s=t[e+n].rotation;r[a]=s,r[a+o]=s,r[a+2*o]=s,r[a+3*o]=s,a+=4*o;}},i.prototype.uploadUvs=function(t,e,i,r,o,a){for(var n=0;n<i;++n){var s=t[e+n]._texture._uvs;s?(r[a]=s.x0,r[a+1]=s.y0,r[a+o]=s.x1,r[a+o+1]=s.y1,r[a+2*o]=s.x2,r[a+2*o+1]=s.y2,r[a+3*o]=s.x3,r[a+3*o+1]=s.y3,a+=4*o):(r[a]=0,r[a+1]=0,r[a+o]=0,r[a+o+1]=0,r[a+2*o]=0,r[a+2*o+1]=0,r[a+3*o]=0,r[a+3*o+1]=0,a+=4*o);}},i.prototype.uploadTint=function(t,e,i,r,o,a){for(var n=0;n<i;++n){var u=t[e+n],p=u._texture.baseTexture.alphaMode>0,h=u.alpha,f=h<1&&p?y$9(u._tintRGB,h):u._tintRGB+(255*h<<24);r[a]=f,r[a+o]=f,r[a+2*o]=f,r[a+3*o]=f,a+=4*o;}},i.prototype.destroy=function(){t.prototype.destroy.call(this),this.shader&&(this.shader.destroy(),this.shader=null),this.tempMatrix=null;},i.extension={name:"particle",type:e$2.RendererPlugin},i}(Le);

  /*!
   * @pixi/graphics - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/graphics is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  var P$3,T$4;!function(t){t.MITER="miter",t.BEVEL="bevel",t.ROUND="round";}(P$3||(P$3={})),function(t){t.BUTT="butt",t.ROUND="round",t.SQUARE="square";}(T$4||(T$4={}));var D$2={adaptive:!0,maxLength:10,minSegments:8,maxSegments:2048,epsilon:1e-4,_segmentsCount:function(t,e){if(void 0===e&&(e=20),!this.adaptive||!t||isNaN(t))return e;var i=Math.ceil(t/this.maxLength);return i<this.minSegments?i=this.minSegments:i>this.maxSegments&&(i=this.maxSegments),i}},A$3=function(){function e(){this.color=16777215,this.alpha=1,this.texture=ye.WHITE,this.matrix=null,this.visible=!1,this.reset();}return e.prototype.clone=function(){var t=new e;return t.color=this.color,t.alpha=this.alpha,t.texture=this.texture,t.matrix=this.matrix,t.visible=this.visible,t},e.prototype.reset=function(){this.color=16777215,this.alpha=1,this.texture=ye.WHITE,this.matrix=null,this.visible=!1;},e.prototype.destroy=function(){this.texture=null,this.matrix=null;},e}(),E$3=function(t,e){return E$3=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,e){t.__proto__=e;}||function(t,e){for(var i in e)e.hasOwnProperty(i)&&(t[i]=e[i]);},E$3(t,e)};function C$3(t,e){function i(){this.constructor=t;}E$3(t,e),t.prototype=null===e?Object.create(e):(i.prototype=e.prototype,new i);}function R$2(t,e){var i,r;void 0===e&&(e=!1);var n=t.length;if(!(n<6)){for(var s=0,h=0,a=t[n-2],o=t[n-1];h<n;h+=2){var l=t[h],u=t[h+1];s+=(l-a)*(u+o),a=l,o=u;}if(!e&&s>0||e&&s<=0){var p=n/2;for(h=p+p%2;h<n;h+=2){var c=n-h-2,f=n-h-1,d=h,y=h+1;i=[t[d],t[c]],t[c]=i[0],t[d]=i[1],r=[t[y],t[f]],t[f]=r[0],t[y]=r[1];}}}}var I$3={build:function(t){t.points=t.shape.points.slice();},triangulate:function(t,e){var i=t.points,r=t.holes,n=e.points,s=e.indices;if(i.length>=6){R$2(i,!1);for(var h=[],a=0;a<r.length;a++){var o=r[a];R$2(o.points,!0),h.push(i.length/2),i=i.concat(o.points);}var l=g$9(i,h,2);if(!l)return;var u=n.length/2;for(a=0;a<l.length;a+=3)s.push(l[a]+u),s.push(l[a+1]+u),s.push(l[a+2]+u);for(a=0;a<i.length;a++)n.push(i[a]);}}},B$1={build:function(t){var e,i,r,n,s,h,a=t.points;if(t.type===t$3.CIRC){var l=t.shape;e=l.x,i=l.y,s=h=l.radius,r=n=0;}else if(t.type===t$3.ELIP){var u=t.shape;e=u.x,i=u.y,s=u.width,h=u.height,r=n=0;}else {var p=t.shape,c=p.width/2,f=p.height/2;e=p.x+c,i=p.y+f,r=c-(s=h=Math.max(0,Math.min(p.radius,Math.min(c,f)))),n=f-h;}if(s>=0&&h>=0&&r>=0&&n>=0){var d=Math.ceil(2.3*Math.sqrt(s+h)),y=8*d+(r?4:0)+(n?4:0);if(a.length=y,0!==y){if(0===d)return a.length=8,a[0]=a[6]=e+r,a[1]=a[3]=i+n,a[2]=a[4]=e-r,void(a[5]=a[7]=i-n);var v=0,g=4*d+(r?2:0)+2,b=g,m=y,x=e+(T=r+s),_=e-T,w=i+(D=n);if(a[v++]=x,a[v++]=w,a[--g]=w,a[--g]=_,n){var S=i-D;a[b++]=_,a[b++]=S,a[--m]=S,a[--m]=x;}for(var M=1;M<d;M++){var P=Math.PI/2*(M/d);x=e+(T=r+Math.cos(P)*s),_=e-T,w=i+(D=n+Math.sin(P)*h),S=i-D;a[v++]=x,a[v++]=w,a[--g]=w,a[--g]=_,a[b++]=_,a[b++]=S,a[--m]=S,a[--m]=x;}var T,D;x=e+(T=r),_=e-T,w=i+(D=n+h),S=i-D;a[v++]=x,a[v++]=w,a[--m]=S,a[--m]=x,r&&(a[v++]=_,a[v++]=w,a[--m]=S,a[--m]=_);}}else a.length=0;},triangulate:function(t,e){var i=t.points,r=e.points,n=e.indices;if(0!==i.length){var s,h,a=r.length/2,l=a;if(t.type!==t$3.RREC){var u=t.shape;s=u.x,h=u.y;}else {var p=t.shape;s=p.x+p.width/2,h=p.y+p.height/2;}var c=t.matrix;r.push(t.matrix?c.a*s+c.c*h+c.tx:s,t.matrix?c.b*s+c.d*h+c.ty:h),a++,r.push(i[0],i[1]);for(var f=2;f<i.length;f+=2)r.push(i[f],i[f+1]),n.push(a++,l,a);n.push(l+1,l,a);}}},L$2={build:function(t){var e=t.shape,i=e.x,r=e.y,n=e.width,s=e.height,h=t.points;h.length=0,h.push(i,r,i+n,r,i+n,r+s,i,r+s);},triangulate:function(t,e){var i=t.points,r=e.points,n=r.length/2;r.push(i[0],i[1],i[2],i[3],i[6],i[7],i[4],i[5]),e.indices.push(n,n+1,n+2,n+1,n+2,n+3);}};function U$2(t,e,i){return t+(e-t)*i}function O$3(t,e,i,r,n,s,h){void 0===h&&(h=[]);for(var a=h,o=0,l=0,u=0,p=0,c=0,f=0,d=0,y=0;d<=20;++d)o=U$2(t,i,y=d/20),l=U$2(e,r,y),u=U$2(i,n,y),p=U$2(r,s,y),c=U$2(o,u,y),f=U$2(l,p,y),0===d&&a[a.length-2]===c&&a[a.length-1]===f||a.push(c,f);return a}var j={build:function(t){if(et.nextRoundedRectBehavior)B$1.build(t);else {var e=t.shape,i=t.points,r=e.x,n=e.y,s=e.width,h=e.height,a=Math.max(0,Math.min(e.radius,Math.min(s,h)/2));i.length=0,a?(O$3(r,n+a,r,n,r+a,n,i),O$3(r+s-a,n,r+s,n,r+s,n+a,i),O$3(r+s,n+h-a,r+s,n+h,r+s-a,n+h,i),O$3(r+a,n+h,r,n+h,r,n+h-a,i)):i.push(r,n,r+s,n,r+s,n+h,r,n+h);}},triangulate:function(t,e){if(et.nextRoundedRectBehavior)B$1.triangulate(t,e);else {for(var i=t.points,r=e.points,n=e.indices,s=r.length/2,h=g$9(i,null,2),a=0,o=h.length;a<o;a+=3)n.push(h[a]+s),n.push(h[a+1]+s),n.push(h[a+2]+s);for(a=0,o=i.length;a<o;a++)r.push(i[a],i[++a]);}}};function N$3(t,e,i,r,n,s,h,a){var o,l;h?(o=r,l=-i):(o=-r,l=i);var u=t-i*n+o,p=e-r*n+l,c=t+i*s+o,f=e+r*s+l;return a.push(u,p),a.push(c,f),2}function F$1(t,e,i,r,n,s,h,a){var o=i-t,l=r-e,u=Math.atan2(o,l),p=Math.atan2(n-t,s-e);a&&u<p?u+=2*Math.PI:!a&&u>p&&(p+=2*Math.PI);var c=u,f=p-u,d=Math.abs(f),y=Math.sqrt(o*o+l*l),v=1+(15*d*Math.sqrt(y)/Math.PI>>0),g=f/v;if(c+=g,a){h.push(t,e),h.push(i,r);for(var b=1,m=c;b<v;b++,m+=g)h.push(t,e),h.push(t+Math.sin(m)*y,e+Math.cos(m)*y);h.push(t,e),h.push(n,s);}else {h.push(i,r),h.push(t,e);for(b=1,m=c;b<v;b++,m+=g)h.push(t+Math.sin(m)*y,e+Math.cos(m)*y),h.push(t,e);h.push(n,s),h.push(t,e);}return 2*v}function z$1(t,e){t.lineStyle.native?function(t,e){var i=0,r=t.shape,n=t.points||r.points,s=r.type!==t$3.POLY||r.closeStroke;if(0!==n.length){var h=e.points,a=e.indices,l=n.length/2,u=h.length/2,p=u;for(h.push(n[0],n[1]),i=1;i<l;i++)h.push(n[2*i],n[2*i+1]),a.push(p,p+1),p++;s&&a.push(p,u);}}(t,e):function(t,e){var i=t.shape,r=t.points||i.points.slice(),n=e.closePointEps;if(0!==r.length){var s=t.lineStyle,h=new o$9(r[0],r[1]),a=new o$9(r[r.length-2],r[r.length-1]),u=i.type!==t$3.POLY||i.closeStroke,p=Math.abs(h.x-a.x)<n&&Math.abs(h.y-a.y)<n;if(u){r=r.slice(),p&&(r.pop(),r.pop(),a.set(r[r.length-2],r[r.length-1]));var c=.5*(h.x+a.x),f=.5*(a.y+h.y);r.unshift(c,f),r.push(c,f);}var d=e.points,y=r.length/2,v=r.length,g=d.length/2,b=s.width/2,m=b*b,x=s.miterLimit*s.miterLimit,_=r[0],w=r[1],S=r[2],M=r[3],A=0,E=0,C=-(w-M),R=_-S,I=0,B=0,L=Math.sqrt(C*C+R*R);C/=L,R/=L,C*=b,R*=b;var U=s.alignment,O=2*(1-U),j=2*U;u||(s.cap===T$4.ROUND?v+=F$1(_-C*(O-j)*.5,w-R*(O-j)*.5,_-C*O,w-R*O,_+C*j,w+R*j,d,!0)+2:s.cap===T$4.SQUARE&&(v+=N$3(_,w,C,R,O,j,!0,d))),d.push(_-C*O,w-R*O),d.push(_+C*j,w+R*j);for(var z=1;z<y-1;++z){_=r[2*(z-1)],w=r[2*(z-1)+1],S=r[2*z],M=r[2*z+1],A=r[2*(z+1)],E=r[2*(z+1)+1],C=-(w-M),R=_-S,C/=L=Math.sqrt(C*C+R*R),R/=L,C*=b,R*=b,I=-(M-E),B=S-A,I/=L=Math.sqrt(I*I+B*B),B/=L,I*=b,B*=b;var q=S-_,k=w-M,H=S-A,G=E-M,W=k*H-G*q,Y=W<0;if(Math.abs(W)<.1)d.push(S-C*O,M-R*O),d.push(S+C*j,M+R*j);else {var V=(-C+_)*(-R+M)-(-C+S)*(-R+w),Q=(-I+A)*(-B+M)-(-I+S)*(-B+E),X=(q*Q-H*V)/W,Z=(G*V-k*Q)/W,J=(X-S)*(X-S)+(Z-M)*(Z-M),K=S+(X-S)*O,$=M+(Z-M)*O,tt=S-(X-S)*j,et=M-(Z-M)*j,it=Y?O:j;J<=Math.min(q*q+k*k,H*H+G*G)+it*it*m?s.join===P$3.BEVEL||J/m>x?(Y?(d.push(K,$),d.push(S+C*j,M+R*j),d.push(K,$),d.push(S+I*j,M+B*j)):(d.push(S-C*O,M-R*O),d.push(tt,et),d.push(S-I*O,M-B*O),d.push(tt,et)),v+=2):s.join===P$3.ROUND?Y?(d.push(K,$),d.push(S+C*j,M+R*j),v+=F$1(S,M,S+C*j,M+R*j,S+I*j,M+B*j,d,!0)+4,d.push(K,$),d.push(S+I*j,M+B*j)):(d.push(S-C*O,M-R*O),d.push(tt,et),v+=F$1(S,M,S-C*O,M-R*O,S-I*O,M-B*O,d,!1)+4,d.push(S-I*O,M-B*O),d.push(tt,et)):(d.push(K,$),d.push(tt,et)):(d.push(S-C*O,M-R*O),d.push(S+C*j,M+R*j),s.join===P$3.ROUND?v+=Y?F$1(S,M,S+C*j,M+R*j,S+I*j,M+B*j,d,!0)+2:F$1(S,M,S-C*O,M-R*O,S-I*O,M-B*O,d,!1)+2:s.join===P$3.MITER&&J/m<=x&&(Y?(d.push(tt,et),d.push(tt,et)):(d.push(K,$),d.push(K,$)),v+=2),d.push(S-I*O,M-B*O),d.push(S+I*j,M+B*j),v+=2);}}_=r[2*(y-2)],w=r[2*(y-2)+1],S=r[2*(y-1)],C=-(w-(M=r[2*(y-1)+1])),R=_-S,C/=L=Math.sqrt(C*C+R*R),R/=L,C*=b,R*=b,d.push(S-C*O,M-R*O),d.push(S+C*j,M+R*j),u||(s.cap===T$4.ROUND?v+=F$1(S-C*(O-j)*.5,M-R*(O-j)*.5,S-C*O,M-R*O,S+C*j,M+R*j,d,!1)+2:s.cap===T$4.SQUARE&&(v+=N$3(S,M,C,R,O,j,!1,d)));var rt=e.indices,nt=D$2.epsilon*D$2.epsilon;for(z=g;z<v+g-2;++z)_=d[2*z],w=d[2*z+1],S=d[2*(z+1)],M=d[2*(z+1)+1],A=d[2*(z+2)],E=d[2*(z+2)+1],Math.abs(_*(M-E)+S*(E-w)+A*(w-M))<nt||rt.push(z,z+1,z+2);}}(t,e);}var q,k$2=function(){function t(){}return t.curveTo=function(t,e,i,r,n,s){var h=s[s.length-2],a=s[s.length-1]-e,o=h-t,l=r-e,u=i-t,p=Math.abs(a*u-o*l);if(p<1e-8||0===n)return s[s.length-2]===t&&s[s.length-1]===e||s.push(t,e),null;var c=a*a+o*o,f=l*l+u*u,d=a*l+o*u,y=n*Math.sqrt(c)/p,v=n*Math.sqrt(f)/p,g=y*d/c,b=v*d/f,m=y*u+v*o,x=y*l+v*a,_=o*(v+g),w=a*(v+g),S=u*(y+b),M=l*(y+b);return {cx:m+t,cy:x+e,radius:n,startAngle:Math.atan2(w-x,_-m),endAngle:Math.atan2(M-x,S-m),anticlockwise:o*l>u*a}},t.arc=function(t,e,i,r,n,s,h,a,o){for(var l=h-s,p=D$2._segmentsCount(Math.abs(l)*n,40*Math.ceil(Math.abs(l)/i$5)),c=l/(2*p),f=2*c,d=Math.cos(c),y=Math.sin(c),v=p-1,g=v%1/v,b=0;b<=v;++b){var m=c+s+f*(b+g*b),x=Math.cos(m),_=-Math.sin(m);o.push((d*x+y*_)*n+i,(d*-_+y*x)*n+r);}},t}(),H$1=function(){function t(){}return t.curveLength=function(t,e,i,r,n,s,h,a){for(var o=0,l=0,u=0,p=0,c=0,f=0,d=0,y=0,v=0,g=0,b=0,m=t,x=e,_=1;_<=10;++_)g=m-(y=(d=(f=(c=1-(l=_/10))*c)*c)*t+3*f*l*i+3*c*(u=l*l)*n+(p=u*l)*h),b=x-(v=d*e+3*f*l*r+3*c*u*s+p*a),m=y,x=v,o+=Math.sqrt(g*g+b*b);return o},t.curveTo=function(e,i,r,n,s,h,a){var o=a[a.length-2],l=a[a.length-1];a.length-=2;var u=D$2._segmentsCount(t.curveLength(o,l,e,i,r,n,s,h)),p=0,c=0,f=0,d=0,y=0;a.push(o,l);for(var v=1,g=0;v<=u;++v)f=(c=(p=1-(g=v/u))*p)*p,y=(d=g*g)*g,a.push(f*o+3*c*g*e+3*p*d*r+y*s,f*l+3*c*g*i+3*p*d*n+y*h);},t}(),G=function(){function t(){}return t.curveLength=function(t,e,i,r,n,s){var h=t-2*i+n,a=e-2*r+s,o=2*i-2*t,l=2*r-2*e,u=4*(h*h+a*a),p=4*(h*o+a*l),c=o*o+l*l,f=2*Math.sqrt(u+p+c),d=Math.sqrt(u),y=2*u*d,v=2*Math.sqrt(c),g=p/d;return (y*f+d*p*(f-v)+(4*c*u-p*p)*Math.log((2*d+g+f)/(g+v)))/(4*y)},t.curveTo=function(e,i,r,n,s){for(var h=s[s.length-2],a=s[s.length-1],o=D$2._segmentsCount(t.curveLength(h,a,e,i,r,n)),l=0,u=0,p=1;p<=o;++p){var c=p/o;l=h+(e-h)*c,u=a+(i-a)*c,s.push(l+(e+(r-e)*c-l)*c,u+(i+(n-i)*c-u)*c);}},t}(),W=function(){function t(){this.reset();}return t.prototype.begin=function(t,e,i){this.reset(),this.style=t,this.start=e,this.attribStart=i;},t.prototype.end=function(t,e){this.attribSize=e-this.attribStart,this.size=t-this.start;},t.prototype.reset=function(){this.style=null,this.size=0,this.start=0,this.attribStart=0,this.attribSize=0;},t}(),Y=((q={})[t$3.POLY]=I$3,q[t$3.CIRC]=B$1,q[t$3.ELIP]=B$1,q[t$3.RECT]=L$2,q[t$3.RREC]=j,q),V=[],Q=[],X=function(){function t(t,e,i,r){void 0===e&&(e=null),void 0===i&&(i=null),void 0===r&&(r=null),this.points=[],this.holes=[],this.shape=t,this.lineStyle=i,this.fillStyle=e,this.matrix=r,this.type=t.type;}return t.prototype.clone=function(){return new t(this.shape,this.fillStyle,this.lineStyle,this.matrix)},t.prototype.destroy=function(){this.shape=null,this.holes.length=0,this.holes=null,this.points.length=0,this.points=null,this.lineStyle=null,this.fillStyle=null;},t}(),Z=new o$9,J=function(t){function n(){var e=t.call(this)||this;return e.closePointEps=1e-4,e.boundsPadding=0,e.uvsFloat32=null,e.indicesUint16=null,e.batchable=!1,e.points=[],e.colors=[],e.uvs=[],e.indices=[],e.textureIds=[],e.graphicsData=[],e.drawCalls=[],e.batchDirty=-1,e.batches=[],e.dirty=0,e.cacheDirty=-1,e.clearDirty=0,e.shapeIndex=0,e._bounds=new a$6,e.boundsDirty=-1,e}return C$3(n,t),Object.defineProperty(n.prototype,"bounds",{get:function(){return this.updateBatches(),this.boundsDirty!==this.dirty&&(this.boundsDirty=this.dirty,this.calculateBounds()),this._bounds},enumerable:!1,configurable:!0}),n.prototype.invalidate=function(){this.boundsDirty=-1,this.dirty++,this.batchDirty++,this.shapeIndex=0,this.points.length=0,this.colors.length=0,this.uvs.length=0,this.indices.length=0,this.textureIds.length=0;for(var t=0;t<this.drawCalls.length;t++)this.drawCalls[t].texArray.clear(),Q.push(this.drawCalls[t]);this.drawCalls.length=0;for(t=0;t<this.batches.length;t++){var e=this.batches[t];e.reset(),V.push(e);}this.batches.length=0;},n.prototype.clear=function(){return this.graphicsData.length>0&&(this.invalidate(),this.clearDirty++,this.graphicsData.length=0),this},n.prototype.drawShape=function(t,e,i,r){void 0===e&&(e=null),void 0===i&&(i=null),void 0===r&&(r=null);var n=new X(t,e,i,r);return this.graphicsData.push(n),this.dirty++,this},n.prototype.drawHole=function(t,e){if(void 0===e&&(e=null),!this.graphicsData.length)return null;var i=new X(t,null,null,e),r=this.graphicsData[this.graphicsData.length-1];return i.lineStyle=r.lineStyle,r.holes.push(i),this.dirty++,this},n.prototype.destroy=function(){t.prototype.destroy.call(this);for(var e=0;e<this.graphicsData.length;++e)this.graphicsData[e].destroy();this.points.length=0,this.points=null,this.colors.length=0,this.colors=null,this.uvs.length=0,this.uvs=null,this.indices.length=0,this.indices=null,this.indexBuffer.destroy(),this.indexBuffer=null,this.graphicsData.length=0,this.graphicsData=null,this.drawCalls.length=0,this.drawCalls=null,this.batches.length=0,this.batches=null,this._bounds=null;},n.prototype.containsPoint=function(t){for(var e=this.graphicsData,i=0;i<e.length;++i){var r=e[i];if(r.fillStyle.visible&&(r.shape&&(r.matrix?r.matrix.applyInverse(t,Z):Z.copyFrom(t),r.shape.contains(Z.x,Z.y)))){var n=!1;if(r.holes)for(var s=0;s<r.holes.length;s++){if(r.holes[s].shape.contains(Z.x,Z.y)){n=!0;break}}if(!n)return !0}}return !1},n.prototype.updateBatches=function(){if(this.graphicsData.length){if(this.validateBatching()){this.cacheDirty=this.dirty;var t=this.uvs,e=this.graphicsData,i=null,r=null;this.batches.length>0&&(r=(i=this.batches[this.batches.length-1]).style);for(var n=this.shapeIndex;n<e.length;n++){this.shapeIndex++;var s=e[n],h=s.fillStyle,a=s.lineStyle;Y[s.type].build(s),s.matrix&&this.transformPoints(s.points,s.matrix),(h.visible||a.visible)&&this.processHoles(s.holes);for(var o=0;o<2;o++){var l=0===o?h:a;if(l.visible){var u=l.texture.baseTexture,p=this.indices.length,c=this.points.length/2;u.wrapMode=S$5.REPEAT,0===o?this.processFill(s):this.processLine(s);var f=this.points.length/2-c;0!==f&&(i&&!this._compareStyles(r,l)&&(i.end(p,c),i=null),i||((i=V.pop()||new W).begin(l,p,c),this.batches.push(i),r=l),this.addUvs(this.points,t,l.texture,c,f,l.matrix));}}}var d=this.indices.length,y=this.points.length/2;if(i&&i.end(d,y),0!==this.batches.length){var v=y>65535;this.indicesUint16&&this.indices.length===this.indicesUint16.length&&v===this.indicesUint16.BYTES_PER_ELEMENT>2?this.indicesUint16.set(this.indices):this.indicesUint16=v?new Uint32Array(this.indices):new Uint16Array(this.indices),this.batchable=this.isBatchable(),this.batchable?this.packBatches():this.buildDrawCalls();}else this.batchable=!0;}}else this.batchable=!0;},n.prototype._compareStyles=function(t,e){return !(!t||!e)&&(t.texture.baseTexture===e.texture.baseTexture&&(t.color+t.alpha===e.color+e.alpha&&!!t.native==!!e.native))},n.prototype.validateBatching=function(){if(this.dirty===this.cacheDirty||!this.graphicsData.length)return !1;for(var t=0,e=this.graphicsData.length;t<e;t++){var i=this.graphicsData[t],r=i.fillStyle,n=i.lineStyle;if(r&&!r.texture.baseTexture.valid)return !1;if(n&&!n.texture.baseTexture.valid)return !1}return !0},n.prototype.packBatches=function(){this.batchDirty++,this.uvsFloat32=new Float32Array(this.uvs);for(var t=this.batches,e=0,i=t.length;e<i;e++)for(var r=t[e],n=0;n<r.size;n++){var s=r.start+n;this.indicesUint16[s]=this.indicesUint16[s]-r.attribStart;}},n.prototype.isBatchable=function(){if(this.points.length>131070)return !1;for(var t=this.batches,e=0;e<t.length;e++)if(t[e].style.native)return !1;return this.points.length<2*n.BATCHABLE_SIZE},n.prototype.buildDrawCalls=function(){for(var t=++te._globalBatch,n=0;n<this.drawCalls.length;n++)this.drawCalls[n].texArray.clear(),Q.push(this.drawCalls[n]);this.drawCalls.length=0;var s=this.colors,h=this.textureIds,a=Q.pop();a||((a=new or).texArray=new sr),a.texArray.count=0,a.start=0,a.size=0,a.type=R$5.TRIANGLES;var o=0,l=null,u=0,p=!1,c=R$5.TRIANGLES,f=0;this.drawCalls.push(a);for(n=0;n<this.batches.length;n++){var d=this.batches[n],y=d.style,v=y.texture.baseTexture;p!==!!y.native&&(c=(p=!!y.native)?R$5.LINES:R$5.TRIANGLES,l=null,o=8,t++),l!==v&&(l=v,v._batchEnabled!==t&&(8===o&&(t++,o=0,a.size>0&&((a=Q.pop())||((a=new or).texArray=new sr),this.drawCalls.push(a)),a.start=f,a.size=0,a.texArray.count=0,a.type=c),v.touched=1,v._batchEnabled=t,v._batchLocation=o,v.wrapMode=S$5.REPEAT,a.texArray.elements[a.texArray.count++]=v,o++)),a.size+=d.size,f+=d.size,u=v._batchLocation,this.addColors(s,y.color,y.alpha,d.attribSize,d.attribStart),this.addTextureIds(h,u,d.attribSize,d.attribStart);}te._globalBatch=t,this.packAttributes();},n.prototype.packAttributes=function(){for(var t=this.points,e=this.uvs,i=this.colors,r=this.textureIds,n=new ArrayBuffer(3*t.length*4),s=new Float32Array(n),h=new Uint32Array(n),a=0,o=0;o<t.length/2;o++)s[a++]=t[2*o],s[a++]=t[2*o+1],s[a++]=e[2*o],s[a++]=e[2*o+1],h[a++]=i[o],s[a++]=r[o];this._buffer.update(n),this._indexBuffer.update(this.indicesUint16);},n.prototype.processFill=function(t){t.holes.length?I$3.triangulate(t,this):Y[t.type].triangulate(t,this);},n.prototype.processLine=function(t){z$1(t,this);for(var e=0;e<t.holes.length;e++)z$1(t.holes[e],this);},n.prototype.processHoles=function(t){for(var e=0;e<t.length;e++){var i=t[e];Y[i.type].build(i),i.matrix&&this.transformPoints(i.points,i.matrix);}},n.prototype.calculateBounds=function(){var t=this._bounds;t.clear(),t.addVertexData(this.points,0,this.points.length),t.pad(this.boundsPadding,this.boundsPadding);},n.prototype.transformPoints=function(t,e){for(var i=0;i<t.length/2;i++){var r=t[2*i],n=t[2*i+1];t[2*i]=e.a*r+e.c*n+e.tx,t[2*i+1]=e.b*r+e.d*n+e.ty;}},n.prototype.addColors=function(t,e,i,r,n){void 0===n&&(n=0);var s=y$9((e>>16)+(65280&e)+((255&e)<<16),i);t.length=Math.max(t.length,n+r);for(var h=0;h<r;h++)t[n+h]=s;},n.prototype.addTextureIds=function(t,e,i,r){void 0===r&&(r=0),t.length=Math.max(t.length,r+i);for(var n=0;n<i;n++)t[r+n]=e;},n.prototype.addUvs=function(t,e,i,r,n,s){void 0===s&&(s=null);for(var h=0,a=e.length,o=i.frame;h<n;){var l=t[2*(r+h)],u=t[2*(r+h)+1];if(s){var p=s.a*l+s.c*u+s.tx;u=s.b*l+s.d*u+s.ty,l=p;}h++,e.push(l/o.width,u/o.height);}var c=i.baseTexture;(o.width<c.width||o.height<c.height)&&this.adjustUvs(e,i,a,n);},n.prototype.adjustUvs=function(t,e,i,r){for(var n=e.baseTexture,s=1e-6,h=i+2*r,a=e.frame,o=a.width/n.width,l=a.height/n.height,u=a.x/a.width,p=a.y/a.height,c=Math.floor(t[i]+s),f=Math.floor(t[i+1]+s),d=i+2;d<h;d+=2)c=Math.min(c,Math.floor(t[d]+s)),f=Math.min(f,Math.floor(t[d+1]+s));u-=c,p-=f;for(d=i;d<h;d+=2)t[d]=(t[d]+u)*o,t[d+1]=(t[d+1]+p)*l;},n.BATCHABLE_SIZE=100,n}(lr),K=function(t){function e(){var e=null!==t&&t.apply(this,arguments)||this;return e.width=0,e.alignment=.5,e.native=!1,e.cap=T$4.BUTT,e.join=P$3.MITER,e.miterLimit=10,e}return C$3(e,t),e.prototype.clone=function(){var t=new e;return t.color=this.color,t.alpha=this.alpha,t.texture=this.texture,t.matrix=this.matrix,t.visible=this.visible,t.width=this.width,t.alignment=this.alignment,t.native=this.native,t.cap=this.cap,t.join=this.join,t.miterLimit=this.miterLimit,t},e.prototype.reset=function(){t.prototype.reset.call(this),this.color=0,this.alignment=.5,this.width=0,this.native=!1;},e}(A$3),$=new Float32Array(3),tt={},et=function(e){function i(t){void 0===t&&(t=null);var i=e.call(this)||this;return i.shader=null,i.pluginName="batch",i.currentPath=null,i.batches=[],i.batchTint=-1,i.batchDirty=-1,i.vertexData=null,i._fillStyle=new A$3,i._lineStyle=new K,i._matrix=null,i._holeMode=!1,i.state=yt.for2d(),i._geometry=t||new J,i._geometry.refCount++,i._transformID=-1,i.tint=16777215,i.blendMode=T$8.NORMAL,i}return C$3(i,e),Object.defineProperty(i.prototype,"geometry",{get:function(){return this._geometry},enumerable:!1,configurable:!0}),i.prototype.clone=function(){return this.finishPoly(),new i(this._geometry)},Object.defineProperty(i.prototype,"blendMode",{get:function(){return this.state.blendMode},set:function(t){this.state.blendMode=t;},enumerable:!1,configurable:!0}),Object.defineProperty(i.prototype,"tint",{get:function(){return this._tint},set:function(t){this._tint=t;},enumerable:!1,configurable:!0}),Object.defineProperty(i.prototype,"fill",{get:function(){return this._fillStyle},enumerable:!1,configurable:!0}),Object.defineProperty(i.prototype,"line",{get:function(){return this._lineStyle},enumerable:!1,configurable:!0}),i.prototype.lineStyle=function(t,e,i,r,n){return void 0===t&&(t=null),void 0===e&&(e=0),void 0===i&&(i=1),void 0===r&&(r=.5),void 0===n&&(n=!1),"number"==typeof t&&(t={width:t,color:e,alpha:i,alignment:r,native:n}),this.lineTextureStyle(t)},i.prototype.lineTextureStyle=function(e){e=Object.assign({width:0,texture:ye.WHITE,color:e&&e.texture?16777215:0,alpha:1,matrix:null,alignment:.5,native:!1,cap:T$4.BUTT,join:P$3.MITER,miterLimit:10},e),this.currentPath&&this.startPoly();var i=e.width>0&&e.alpha>0;return i?(e.matrix&&(e.matrix=e.matrix.clone(),e.matrix.invert()),Object.assign(this._lineStyle,{visible:i},e)):this._lineStyle.reset(),this},i.prototype.startPoly=function(){if(this.currentPath){var t=this.currentPath.points,e=this.currentPath.points.length;e>2&&(this.drawShape(this.currentPath),this.currentPath=new c$a,this.currentPath.closeStroke=!1,this.currentPath.points.push(t[e-2],t[e-1]));}else this.currentPath=new c$a,this.currentPath.closeStroke=!1;},i.prototype.finishPoly=function(){this.currentPath&&(this.currentPath.points.length>2?(this.drawShape(this.currentPath),this.currentPath=null):this.currentPath.points.length=0);},i.prototype.moveTo=function(t,e){return this.startPoly(),this.currentPath.points[0]=t,this.currentPath.points[1]=e,this},i.prototype.lineTo=function(t,e){this.currentPath||this.moveTo(0,0);var i=this.currentPath.points,r=i[i.length-2],n=i[i.length-1];return r===t&&n===e||i.push(t,e),this},i.prototype._initCurve=function(t,e){void 0===t&&(t=0),void 0===e&&(e=0),this.currentPath?0===this.currentPath.points.length&&(this.currentPath.points=[t,e]):this.moveTo(t,e);},i.prototype.quadraticCurveTo=function(t,e,i,r){this._initCurve();var n=this.currentPath.points;return 0===n.length&&this.moveTo(0,0),G.curveTo(t,e,i,r,n),this},i.prototype.bezierCurveTo=function(t,e,i,r,n,s){return this._initCurve(),H$1.curveTo(t,e,i,r,n,s,this.currentPath.points),this},i.prototype.arcTo=function(t,e,i,r,n){this._initCurve(t,e);var s=this.currentPath.points,h=k$2.curveTo(t,e,i,r,n,s);if(h){var a=h.cx,o=h.cy,l=h.radius,u=h.startAngle,p=h.endAngle,c=h.anticlockwise;this.arc(a,o,l,u,p,c);}return this},i.prototype.arc=function(t,e,i,r,n,s){if(void 0===s&&(s=!1),r===n)return this;if(!s&&n<=r?n+=i$5:s&&r<=n&&(r+=i$5),0===n-r)return this;var h=t+Math.cos(r)*i,a=e+Math.sin(r)*i,o=this._geometry.closePointEps,l=this.currentPath?this.currentPath.points:null;if(l){var p=Math.abs(l[l.length-2]-h),c=Math.abs(l[l.length-1]-a);p<o&&c<o||l.push(h,a);}else this.moveTo(h,a),l=this.currentPath.points;return k$2.arc(h,a,t,e,i,r,n,s,l),this},i.prototype.beginFill=function(e,i){return void 0===e&&(e=0),void 0===i&&(i=1),this.beginTextureFill({texture:ye.WHITE,color:e,alpha:i})},i.prototype.beginTextureFill=function(e){e=Object.assign({texture:ye.WHITE,color:16777215,alpha:1,matrix:null},e),this.currentPath&&this.startPoly();var i=e.alpha>0;return i?(e.matrix&&(e.matrix=e.matrix.clone(),e.matrix.invert()),Object.assign(this._fillStyle,{visible:i},e)):this._fillStyle.reset(),this},i.prototype.endFill=function(){return this.finishPoly(),this._fillStyle.reset(),this},i.prototype.drawRect=function(t,e,i,r){return this.drawShape(new r$4(t,e,i,r))},i.prototype.drawRoundedRect=function(t,e,i,r,n){return this.drawShape(new y$8(t,e,i,r,n))},i.prototype.drawCircle=function(t,e,i){return this.drawShape(new e$3(t,e,i))},i.prototype.drawEllipse=function(t,e,i,r){return this.drawShape(new a$7(t,e,i,r))},i.prototype.drawPolygon=function(){for(var t,e=arguments,i=[],r=0;r<arguments.length;r++)i[r]=e[r];var n=!0,s=i[0];s.points?(n=s.closeStroke,t=s.points):t=Array.isArray(i[0])?i[0]:i;var h=new c$a(t);return h.closeStroke=n,this.drawShape(h),this},i.prototype.drawShape=function(t){return this._holeMode?this._geometry.drawHole(t,this._matrix):this._geometry.drawShape(t,this._fillStyle.clone(),this._lineStyle.clone(),this._matrix),this},i.prototype.clear=function(){return this._geometry.clear(),this._lineStyle.reset(),this._fillStyle.reset(),this._boundsID++,this._matrix=null,this._holeMode=!1,this.currentPath=null,this},i.prototype.isFastRect=function(){var t=this._geometry.graphicsData;return !(1!==t.length||t[0].shape.type!==t$3.RECT||t[0].matrix||t[0].holes.length||t[0].lineStyle.visible&&t[0].lineStyle.width)},i.prototype._render=function(t){this.finishPoly();var e=this._geometry;e.updateBatches(),e.batchable?(this.batchDirty!==e.batchDirty&&this._populateBatches(),this._renderBatched(t)):(t.batch.flush(),this._renderDirect(t));},i.prototype._populateBatches=function(){var t=this._geometry,e=this.blendMode,i=t.batches.length;this.batchTint=-1,this._transformID=-1,this.batchDirty=t.batchDirty,this.batches.length=i,this.vertexData=new Float32Array(t.points);for(var r=0;r<i;r++){var n=t.batches[r],s=n.style.color,h=new Float32Array(this.vertexData.buffer,4*n.attribStart*2,2*n.attribSize),a=new Float32Array(t.uvsFloat32.buffer,4*n.attribStart*2,2*n.attribSize),o={vertexData:h,blendMode:e,indices:new Uint16Array(t.indicesUint16.buffer,2*n.start,n.size),uvs:a,_batchRGB:s$7(s),_tintRGB:s,_texture:n.style.texture,alpha:n.style.alpha,worldAlpha:1};this.batches[r]=o;}},i.prototype._renderBatched=function(t){if(this.batches.length){t.batch.setObjectRenderer(t.plugins[this.pluginName]),this.calculateVertices(),this.calculateTints();for(var e=0,i=this.batches.length;e<i;e++){var r=this.batches[e];r.worldAlpha=this.worldAlpha*r.alpha,t.plugins[this.pluginName].render(r);}}},i.prototype._renderDirect=function(t){var e=this._resolveDirectShader(t),i=this._geometry,r=this.tint,n=this.worldAlpha,s=e.uniforms,h=i.drawCalls;s.translationMatrix=this.transform.worldTransform,s.tint[0]=(r>>16&255)/255*n,s.tint[1]=(r>>8&255)/255*n,s.tint[2]=(255&r)/255*n,s.tint[3]=n,t.shader.bind(e),t.geometry.bind(i,e),t.state.set(this.state);for(var a=0,o=h.length;a<o;a++)this._renderDrawCallDirect(t,i.drawCalls[a]);},i.prototype._renderDrawCallDirect=function(t,e){for(var i=e.texArray,r=e.type,n=e.size,s=e.start,h=i.count,a=0;a<h;a++)t.texture.bind(i.elements[a],a);t.geometry.draw(r,n,s);},i.prototype._resolveDirectShader=function(t){var e=this.shader,i=this.pluginName;if(!e){if(!tt[i]){for(var r=t.plugins[i].MAX_TEXTURES,n=new Int32Array(r),a=0;a<r;a++)n[a]=a;var o={tint:new Float32Array([1,1,1,1]),translationMatrix:new p$7,default:Oe.from({uSamplers:n},!0)},l=t.plugins[i]._shader.program;tt[i]=new gt(l,o);}e=tt[i];}return e},i.prototype._calculateBounds=function(){this.finishPoly();var t=this._geometry;if(t.graphicsData.length){var e=t.bounds,i=e.minX,r=e.minY,n=e.maxX,s=e.maxY;this._bounds.addFrame(this.transform,i,r,n,s);}},i.prototype.containsPoint=function(t){return this.worldTransform.applyInverse(t,i._TEMP_POINT),this._geometry.containsPoint(i._TEMP_POINT)},i.prototype.calculateTints=function(){if(this.batchTint!==this.tint){this.batchTint=this.tint;for(var t=s$7(this.tint,$),e=0;e<this.batches.length;e++){var i=this.batches[e],r=i._batchRGB,n=(t[0]*r[0]*255<<16)+(t[1]*r[1]*255<<8)+(0|t[2]*r[2]*255);i._tintRGB=(n>>16)+(65280&n)+((255&n)<<16);}}},i.prototype.calculateVertices=function(){var t=this.transform._worldID;if(this._transformID!==t){this._transformID=t;for(var e=this.transform.worldTransform,i=e.a,r=e.b,n=e.c,s=e.d,h=e.tx,a=e.ty,o=this._geometry.points,l=this.vertexData,u=0,p=0;p<o.length;p+=2){var c=o[p],f=o[p+1];l[u++]=i*c+n*f+h,l[u++]=s*f+r*c+a;}}},i.prototype.closePath=function(){var t=this.currentPath;return t&&(t.closeStroke=!0,this.finishPoly()),this},i.prototype.setMatrix=function(t){return this._matrix=t,this},i.prototype.beginHole=function(){return this.finishPoly(),this._holeMode=!0,this},i.prototype.endHole=function(){return this.finishPoly(),this._holeMode=!1,this},i.prototype.destroy=function(t){this._geometry.refCount--,0===this._geometry.refCount&&this._geometry.dispose(),this._matrix=null,this.currentPath=null,this._lineStyle.destroy(),this._lineStyle=null,this._fillStyle.destroy(),this._fillStyle=null,this._geometry=null,this.shader=null,this.vertexData=null,this.batches.length=0,this.batches=null,e.prototype.destroy.call(this,t);},i.nextRoundedRectBehavior=!1,i._TEMP_POINT=new o$9,i}(g$6);

  /*!
   * @pixi/sprite - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/sprite is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  var u$4=function(t,e){return u$4=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,e){t.__proto__=e;}||function(t,e){for(var i in e)e.hasOwnProperty(i)&&(t[i]=e[i]);},u$4(t,e)};var c$5=new o$9,_$4=new Uint16Array([0,1,2,0,2,3]),l$4=function(r){function o(i){var o=r.call(this)||this;return o._anchor=new u$9(o._onAnchorUpdate,o,i?i.defaultAnchor.x:0,i?i.defaultAnchor.y:0),o._texture=null,o._width=0,o._height=0,o._tint=null,o._tintRGB=null,o.tint=16777215,o.blendMode=T$8.NORMAL,o._cachedTint=16777215,o.uvs=null,o.texture=i||ye.EMPTY,o.vertexData=new Float32Array(8),o.vertexTrimmedData=null,o._transformID=-1,o._textureID=-1,o._transformTrimmedID=-1,o._textureTrimmedID=-1,o.indices=_$4,o.pluginName="batch",o.isSprite=!0,o._roundPixels=V$2.ROUND_PIXELS,o}return function(t,e){function i(){this.constructor=t;}u$4(t,e),t.prototype=null===e?Object.create(e):(i.prototype=e.prototype,new i);}(o,r),o.prototype._onTextureUpdate=function(){this._textureID=-1,this._textureTrimmedID=-1,this._cachedTint=16777215,this._width&&(this.scale.x=M$2(this.scale.x)*this._width/this._texture.orig.width),this._height&&(this.scale.y=M$2(this.scale.y)*this._height/this._texture.orig.height);},o.prototype._onAnchorUpdate=function(){this._transformID=-1,this._transformTrimmedID=-1;},o.prototype.calculateVertices=function(){var t=this._texture;if(this._transformID!==this.transform._worldID||this._textureID!==t._updateID){this._textureID!==t._updateID&&(this.uvs=this._texture._uvs.uvsFloat32),this._transformID=this.transform._worldID,this._textureID=t._updateID;var e=this.transform.worldTransform,i=e.a,r=e.b,o=e.c,n=e.d,s=e.tx,a=e.ty,u=this.vertexData,c=t.trim,_=t.orig,l=this._anchor,d=0,p=0,x=0,f=0;if(c?(d=(p=c.x-l._x*_.width)+c.width,x=(f=c.y-l._y*_.height)+c.height):(d=(p=-l._x*_.width)+_.width,x=(f=-l._y*_.height)+_.height),u[0]=i*p+o*f+s,u[1]=n*f+r*p+a,u[2]=i*d+o*f+s,u[3]=n*f+r*d+a,u[4]=i*d+o*x+s,u[5]=n*x+r*d+a,u[6]=i*p+o*x+s,u[7]=n*x+r*p+a,this._roundPixels)for(var m=V$2.RESOLUTION,g=0;g<u.length;++g)u[g]=Math.round((u[g]*m|0)/m);}},o.prototype.calculateTrimmedVertices=function(){if(this.vertexTrimmedData){if(this._transformTrimmedID===this.transform._worldID&&this._textureTrimmedID===this._texture._updateID)return}else this.vertexTrimmedData=new Float32Array(8);this._transformTrimmedID=this.transform._worldID,this._textureTrimmedID=this._texture._updateID;var t=this._texture,e=this.vertexTrimmedData,i=t.orig,r=this._anchor,o=this.transform.worldTransform,n=o.a,s=o.b,h=o.c,a=o.d,u=o.tx,c=o.ty,_=-r._x*i.width,l=_+i.width,d=-r._y*i.height,p=d+i.height;e[0]=n*_+h*d+u,e[1]=a*d+s*_+c,e[2]=n*l+h*d+u,e[3]=a*d+s*l+c,e[4]=n*l+h*p+u,e[5]=a*p+s*l+c,e[6]=n*_+h*p+u,e[7]=a*p+s*_+c;},o.prototype._render=function(t){this.calculateVertices(),t.batch.setObjectRenderer(t.plugins[this.pluginName]),t.plugins[this.pluginName].render(this);},o.prototype._calculateBounds=function(){var t=this._texture.trim,e=this._texture.orig;!t||t.width===e.width&&t.height===e.height?(this.calculateVertices(),this._bounds.addQuad(this.vertexData)):(this.calculateTrimmedVertices(),this._bounds.addQuad(this.vertexTrimmedData));},o.prototype.getLocalBounds=function(t){return 0===this.children.length?(this._localBounds||(this._localBounds=new a$6),this._localBounds.minX=this._texture.orig.width*-this._anchor._x,this._localBounds.minY=this._texture.orig.height*-this._anchor._y,this._localBounds.maxX=this._texture.orig.width*(1-this._anchor._x),this._localBounds.maxY=this._texture.orig.height*(1-this._anchor._y),t||(this._localBoundsRect||(this._localBoundsRect=new r$4),t=this._localBoundsRect),this._localBounds.getRectangle(t)):r.prototype.getLocalBounds.call(this,t)},o.prototype.containsPoint=function(t){this.worldTransform.applyInverse(t,c$5);var e=this._texture.orig.width,i=this._texture.orig.height,r=-e*this.anchor.x,o=0;return c$5.x>=r&&c$5.x<r+e&&(o=-i*this.anchor.y,c$5.y>=o&&c$5.y<o+i)},o.prototype.destroy=function(t){if(r.prototype.destroy.call(this,t),this._texture.off("update",this._onTextureUpdate,this),this._anchor=null,"boolean"==typeof t?t:t&&t.texture){var e="boolean"==typeof t?t:t&&t.baseTexture;this._texture.destroy(!!e);}this._texture=null;},o.from=function(t,i){return new o(t instanceof ye?t:ye.from(t,i))},Object.defineProperty(o.prototype,"roundPixels",{get:function(){return this._roundPixels},set:function(t){this._roundPixels!==t&&(this._transformID=-1),this._roundPixels=t;},enumerable:!1,configurable:!0}),Object.defineProperty(o.prototype,"width",{get:function(){return Math.abs(this.scale.x)*this._texture.orig.width},set:function(t){var e=M$2(this.scale.x)||1;this.scale.x=e*t/this._texture.orig.width,this._width=t;},enumerable:!1,configurable:!0}),Object.defineProperty(o.prototype,"height",{get:function(){return Math.abs(this.scale.y)*this._texture.orig.height},set:function(t){var e=M$2(this.scale.y)||1;this.scale.y=e*t/this._texture.orig.height,this._height=t;},enumerable:!1,configurable:!0}),Object.defineProperty(o.prototype,"anchor",{get:function(){return this._anchor},set:function(t){this._anchor.copyFrom(t);},enumerable:!1,configurable:!0}),Object.defineProperty(o.prototype,"tint",{get:function(){return this._tint},set:function(t){this._tint=t,this._tintRGB=(t>>16)+(65280&t)+((255&t)<<16);},enumerable:!1,configurable:!0}),Object.defineProperty(o.prototype,"texture",{get:function(){return this._texture},set:function(t){this._texture!==t&&(this._texture&&this._texture.off("update",this._onTextureUpdate,this),this._texture=t||ye.EMPTY,this._cachedTint=16777215,this._textureID=-1,this._textureTrimmedID=-1,t&&(t.baseTexture.valid?this._onTextureUpdate():t.once("update",this._onTextureUpdate,this)));},enumerable:!1,configurable:!0}),o}(g$6);

  /*!
   * @pixi/text - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/text is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  var l$3,c$4=function(t,e){return c$4=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,e){t.__proto__=e;}||function(t,e){for(var i in e)e.hasOwnProperty(i)&&(t[i]=e[i]);},c$4(t,e)};!function(t){t[t.LINEAR_VERTICAL=0]="LINEAR_VERTICAL",t[t.LINEAR_HORIZONTAL=1]="LINEAR_HORIZONTAL";}(l$3||(l$3={}));var f$3={align:"left",breakWords:!1,dropShadow:!1,dropShadowAlpha:1,dropShadowAngle:Math.PI/6,dropShadowBlur:0,dropShadowColor:"black",dropShadowDistance:5,fill:"black",fillGradientType:l$3.LINEAR_VERTICAL,fillGradientStops:[],fontFamily:"Arial",fontSize:26,fontStyle:"normal",fontVariant:"normal",fontWeight:"normal",letterSpacing:0,lineHeight:0,lineJoin:"miter",miterLimit:10,padding:0,stroke:"black",strokeThickness:0,textBaseline:"alphabetic",trim:!1,whiteSpace:"pre",wordWrap:!1,wordWrapWidth:100,leading:0},u$3=["serif","sans-serif","monospace","cursive","fantasy","system-ui"],p$2=function(){function t(t){this.styleID=0,this.reset(),y$3(this,t,t);}return t.prototype.clone=function(){var e={};return y$3(e,this,f$3),new t(e)},t.prototype.reset=function(){y$3(this,f$3,f$3);},Object.defineProperty(t.prototype,"align",{get:function(){return this._align},set:function(t){this._align!==t&&(this._align=t,this.styleID++);},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"breakWords",{get:function(){return this._breakWords},set:function(t){this._breakWords!==t&&(this._breakWords=t,this.styleID++);},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"dropShadow",{get:function(){return this._dropShadow},set:function(t){this._dropShadow!==t&&(this._dropShadow=t,this.styleID++);},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"dropShadowAlpha",{get:function(){return this._dropShadowAlpha},set:function(t){this._dropShadowAlpha!==t&&(this._dropShadowAlpha=t,this.styleID++);},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"dropShadowAngle",{get:function(){return this._dropShadowAngle},set:function(t){this._dropShadowAngle!==t&&(this._dropShadowAngle=t,this.styleID++);},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"dropShadowBlur",{get:function(){return this._dropShadowBlur},set:function(t){this._dropShadowBlur!==t&&(this._dropShadowBlur=t,this.styleID++);},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"dropShadowColor",{get:function(){return this._dropShadowColor},set:function(t){var e=g$3(t);this._dropShadowColor!==e&&(this._dropShadowColor=e,this.styleID++);},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"dropShadowDistance",{get:function(){return this._dropShadowDistance},set:function(t){this._dropShadowDistance!==t&&(this._dropShadowDistance=t,this.styleID++);},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"fill",{get:function(){return this._fill},set:function(t){var e=g$3(t);this._fill!==e&&(this._fill=e,this.styleID++);},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"fillGradientType",{get:function(){return this._fillGradientType},set:function(t){this._fillGradientType!==t&&(this._fillGradientType=t,this.styleID++);},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"fillGradientStops",{get:function(){return this._fillGradientStops},set:function(t){(function(t,e){if(!Array.isArray(t)||!Array.isArray(e))return !1;if(t.length!==e.length)return !1;for(var i=0;i<t.length;++i)if(t[i]!==e[i])return !1;return !0})(this._fillGradientStops,t)||(this._fillGradientStops=t,this.styleID++);},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"fontFamily",{get:function(){return this._fontFamily},set:function(t){this.fontFamily!==t&&(this._fontFamily=t,this.styleID++);},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"fontSize",{get:function(){return this._fontSize},set:function(t){this._fontSize!==t&&(this._fontSize=t,this.styleID++);},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"fontStyle",{get:function(){return this._fontStyle},set:function(t){this._fontStyle!==t&&(this._fontStyle=t,this.styleID++);},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"fontVariant",{get:function(){return this._fontVariant},set:function(t){this._fontVariant!==t&&(this._fontVariant=t,this.styleID++);},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"fontWeight",{get:function(){return this._fontWeight},set:function(t){this._fontWeight!==t&&(this._fontWeight=t,this.styleID++);},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"letterSpacing",{get:function(){return this._letterSpacing},set:function(t){this._letterSpacing!==t&&(this._letterSpacing=t,this.styleID++);},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"lineHeight",{get:function(){return this._lineHeight},set:function(t){this._lineHeight!==t&&(this._lineHeight=t,this.styleID++);},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"leading",{get:function(){return this._leading},set:function(t){this._leading!==t&&(this._leading=t,this.styleID++);},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"lineJoin",{get:function(){return this._lineJoin},set:function(t){this._lineJoin!==t&&(this._lineJoin=t,this.styleID++);},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"miterLimit",{get:function(){return this._miterLimit},set:function(t){this._miterLimit!==t&&(this._miterLimit=t,this.styleID++);},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"padding",{get:function(){return this._padding},set:function(t){this._padding!==t&&(this._padding=t,this.styleID++);},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"stroke",{get:function(){return this._stroke},set:function(t){var e=g$3(t);this._stroke!==e&&(this._stroke=e,this.styleID++);},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"strokeThickness",{get:function(){return this._strokeThickness},set:function(t){this._strokeThickness!==t&&(this._strokeThickness=t,this.styleID++);},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"textBaseline",{get:function(){return this._textBaseline},set:function(t){this._textBaseline!==t&&(this._textBaseline=t,this.styleID++);},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"trim",{get:function(){return this._trim},set:function(t){this._trim!==t&&(this._trim=t,this.styleID++);},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"whiteSpace",{get:function(){return this._whiteSpace},set:function(t){this._whiteSpace!==t&&(this._whiteSpace=t,this.styleID++);},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"wordWrap",{get:function(){return this._wordWrap},set:function(t){this._wordWrap!==t&&(this._wordWrap=t,this.styleID++);},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"wordWrapWidth",{get:function(){return this._wordWrapWidth},set:function(t){this._wordWrapWidth!==t&&(this._wordWrapWidth=t,this.styleID++);},enumerable:!1,configurable:!0}),t.prototype.toFontString=function(){var t="number"==typeof this.fontSize?this.fontSize+"px":this.fontSize,e=this.fontFamily;Array.isArray(this.fontFamily)||(e=this.fontFamily.split(","));for(var i=e.length-1;i>=0;i--){var n=e[i].trim();!/([\"\'])[^\'\"]+\1/.test(n)&&u$3.indexOf(n)<0&&(n='"'+n+'"'),e[i]=n;}return this.fontStyle+" "+this.fontVariant+" "+this.fontWeight+" "+t+" "+e.join(",")},t}();function d$4(t){return "number"==typeof t?g$8(t):("string"==typeof t&&0===t.indexOf("0x")&&(t=t.replace("0x","#")),t)}function g$3(t){if(Array.isArray(t)){for(var e=0;e<t.length;++e)t[e]=d$4(t[e]);return t}return d$4(t)}function y$3(t,e,i){for(var n in i)Array.isArray(e[n])?t[n]=e[n].slice():t[n]=e[n];}var _$3=function(){function t(t,e,i,n,r,o,a,s,h){this.text=t,this.style=e,this.width=i,this.height=n,this.lines=r,this.lineWidths=o,this.lineHeight=a,this.maxLineWidth=s,this.fontProperties=h;}return t.measureText=function(e,i,n,r){void 0===r&&(r=t._canvas),n=null==n?i.wordWrap:n;var o=i.toFontString(),a=t.measureFont(o);0===a.fontSize&&(a.fontSize=i.fontSize,a.ascent=i.fontSize);var s=r.getContext("2d");s.font=o;for(var h=(n?t.wordWrap(e,i,r):e).split(/(?:\r\n|\r|\n)/),l=new Array(h.length),c=0,f=0;f<h.length;f++){var u=s.measureText(h[f]).width+(h[f].length-1)*i.letterSpacing;l[f]=u,c=Math.max(c,u);}var p=c+i.strokeThickness;i.dropShadow&&(p+=i.dropShadowDistance);var d=i.lineHeight||a.fontSize+i.strokeThickness,g=Math.max(d,a.fontSize+i.strokeThickness)+(h.length-1)*(d+i.leading);return i.dropShadow&&(g+=i.dropShadowDistance),new t(e,i,p,g,h,l,d+i.leading,c,a)},t.wordWrap=function(e,i,n){void 0===n&&(n=t._canvas);for(var r=n.getContext("2d"),o=0,a="",s="",h=Object.create(null),l=i.letterSpacing,c=i.whiteSpace,f=t.collapseSpaces(c),u=t.collapseNewlines(c),p=!f,d=i.wordWrapWidth+l,g=t.tokenize(e),y=0;y<g.length;y++){var _=g[y];if(t.isNewline(_)){if(!u){s+=t.addLine(a),p=!f,a="",o=0;continue}_=" ";}if(f){var b=t.isBreakingSpace(_),S=t.isBreakingSpace(a[a.length-1]);if(b&&S)continue}var m=t.getFromCache(_,l,h,r);if(m>d)if(""!==a&&(s+=t.addLine(a),a="",o=0),t.canBreakWords(_,i.breakWords))for(var w=t.wordWrapSplit(_),v=0;v<w.length;v++){for(var x=w[v],I=1;w[v+I];){var k=w[v+I],T=x[x.length-1];if(t.canBreakChars(T,k,_,v,i.breakWords))break;x+=k,I++;}v+=x.length-1;var L=t.getFromCache(x,l,h,r);L+o>d&&(s+=t.addLine(a),p=!1,a="",o=0),a+=x,o+=L;}else {a.length>0&&(s+=t.addLine(a),a="",o=0);var O=y===g.length-1;s+=t.addLine(_,!O),p=!1,a="",o=0;}else m+o>d&&(p=!1,s+=t.addLine(a),a="",o=0),(a.length>0||!t.isBreakingSpace(_)||p)&&(a+=_,o+=m);}return s+=t.addLine(a,!1)},t.addLine=function(e,i){return void 0===i&&(i=!0),e=t.trimRight(e),e=i?e+"\n":e},t.getFromCache=function(t,e,i,n){var r=i[t];if("number"!=typeof r){var o=t.length*e;r=n.measureText(t).width+o,i[t]=r;}return r},t.collapseSpaces=function(t){return "normal"===t||"pre-line"===t},t.collapseNewlines=function(t){return "normal"===t},t.trimRight=function(e){if("string"!=typeof e)return "";for(var i=e.length-1;i>=0;i--){var n=e[i];if(!t.isBreakingSpace(n))break;e=e.slice(0,-1);}return e},t.isNewline=function(e){return "string"==typeof e&&t._newlines.indexOf(e.charCodeAt(0))>=0},t.isBreakingSpace=function(e,i){return "string"==typeof e&&t._breakingSpaces.indexOf(e.charCodeAt(0))>=0},t.tokenize=function(e){var i=[],n="";if("string"!=typeof e)return i;for(var r=0;r<e.length;r++){var o=e[r],a=e[r+1];t.isBreakingSpace(o,a)||t.isNewline(o)?(""!==n&&(i.push(n),n=""),i.push(o)):n+=o;}return ""!==n&&i.push(n),i},t.canBreakWords=function(t,e){return e},t.canBreakChars=function(t,e,i,n,r){return !0},t.wordWrapSplit=function(t){return t.split("")},t.measureFont=function(e){if(t._fonts[e])return t._fonts[e];var i={ascent:0,descent:0,fontSize:0},n=t._canvas,r=t._context;r.font=e;var o=t.METRICS_STRING+t.BASELINE_SYMBOL,a=Math.ceil(r.measureText(o).width),s=Math.ceil(r.measureText(t.BASELINE_SYMBOL).width),h=Math.ceil(t.HEIGHT_MULTIPLIER*s);s=s*t.BASELINE_MULTIPLIER|0,n.width=a,n.height=h,r.fillStyle="#f00",r.fillRect(0,0,a,h),r.font=e,r.textBaseline="alphabetic",r.fillStyle="#000",r.fillText(o,0,s);var l=r.getImageData(0,0,a,h).data,c=l.length,f=4*a,u=0,p=0,d=!1;for(u=0;u<s;++u){for(var g=0;g<f;g+=4)if(255!==l[p+g]){d=!0;break}if(d)break;p+=f;}for(i.ascent=s-u,p=c-f,d=!1,u=h;u>s;--u){for(g=0;g<f;g+=4)if(255!==l[p+g]){d=!0;break}if(d)break;p-=f;}return i.descent=u-s,i.fontSize=i.ascent+i.descent,t._fonts[e]=i,i},t.clearMetrics=function(e){void 0===e&&(e=""),e?delete t._fonts[e]:t._fonts={};},Object.defineProperty(t,"_canvas",{get:function(){if(!t.__canvas){var e=void 0;try{var n=new OffscreenCanvas(0,0),r=n.getContext("2d");if(r&&r.measureText)return t.__canvas=n,n;e=V$2.ADAPTER.createCanvas();}catch(t){e=V$2.ADAPTER.createCanvas();}e.width=e.height=10,t.__canvas=e;}return t.__canvas},enumerable:!1,configurable:!0}),Object.defineProperty(t,"_context",{get:function(){return t.__context||(t.__context=t._canvas.getContext("2d")),t.__context},enumerable:!1,configurable:!0}),t}();_$3._fonts={},_$3.METRICS_STRING="|ÉqÅ",_$3.BASELINE_SYMBOL="M",_$3.BASELINE_MULTIPLIER=1.4,_$3.HEIGHT_MULTIPLIER=2,_$3._newlines=[10,13],_$3._breakingSpaces=[9,32,8192,8193,8194,8195,8196,8197,8198,8200,8201,8202,8287,12288];var b$2={texture:!0,children:!1,baseTexture:!0},S$3=function(t){function r(r,o,a){var s=this,h=!1;a||(a=V$2.ADAPTER.createCanvas(),h=!0),a.width=3,a.height=3;var l=ye.from(a);return l.orig=new r$4,l.trim=new r$4,(s=t.call(this,l)||this)._ownCanvas=h,s.canvas=a,s.context=a.getContext("2d"),s._resolution=V$2.RESOLUTION,s._autoResolution=!0,s._text=null,s._style=null,s._styleListener=null,s._font="",s.text=r,s.style=o,s.localStyleID=-1,s}return function(t,e){function i(){this.constructor=t;}c$4(t,e),t.prototype=null===e?Object.create(e):(i.prototype=e.prototype,new i);}(r,t),r.prototype.updateText=function(t){var e=this._style;if(this.localStyleID!==e.styleID&&(this.dirty=!0,this.localStyleID=e.styleID),this.dirty||!t){this._font=this._style.toFontString();var i,n,s=this.context,h=_$3.measureText(this._text||" ",this._style,this._style.wordWrap,this.canvas),l=h.width,c=h.height,f=h.lines,u=h.lineHeight,p=h.lineWidths,d=h.maxLineWidth,g=h.fontProperties;this.canvas.width=Math.ceil(Math.ceil(Math.max(1,l)+2*e.padding)*this._resolution),this.canvas.height=Math.ceil(Math.ceil(Math.max(1,c)+2*e.padding)*this._resolution),s.scale(this._resolution,this._resolution),s.clearRect(0,0,this.canvas.width,this.canvas.height),s.font=this._font,s.lineWidth=e.strokeThickness,s.textBaseline=e.textBaseline,s.lineJoin=e.lineJoin,s.miterLimit=e.miterLimit;for(var y=e.dropShadow?2:1,b=0;b<y;++b){var S=e.dropShadow&&0===b,m=S?Math.ceil(Math.max(1,c)+2*e.padding):0,w=m*this._resolution;if(S){s.fillStyle="black",s.strokeStyle="black";var v=e.dropShadowColor,x=s$7("number"==typeof v?v:h$7(v)),I=e.dropShadowBlur*this._resolution,k=e.dropShadowDistance*this._resolution;s.shadowColor="rgba("+255*x[0]+","+255*x[1]+","+255*x[2]+","+e.dropShadowAlpha+")",s.shadowBlur=I,s.shadowOffsetX=Math.cos(e.dropShadowAngle)*k,s.shadowOffsetY=Math.sin(e.dropShadowAngle)*k+w;}else s.fillStyle=this._generateFillStyle(e,f,h),s.strokeStyle=e.stroke,s.shadowColor="black",s.shadowBlur=0,s.shadowOffsetX=0,s.shadowOffsetY=0;var T=(u-g.fontSize)/2;(!r.nextLineHeightBehavior||u-g.fontSize<0)&&(T=0);for(var L=0;L<f.length;L++)i=e.strokeThickness/2,n=e.strokeThickness/2+L*u+g.ascent+T,"right"===e.align?i+=d-p[L]:"center"===e.align&&(i+=(d-p[L])/2),e.stroke&&e.strokeThickness&&this.drawLetterSpacing(f[L],i+e.padding,n+e.padding-m,!0),e.fill&&this.drawLetterSpacing(f[L],i+e.padding,n+e.padding-m);}this.updateTexture();}},r.prototype.drawLetterSpacing=function(t,e,i,n){void 0===n&&(n=!1);var o=this._style.letterSpacing,a=r.experimentalLetterSpacing&&("letterSpacing"in CanvasRenderingContext2D.prototype||"textLetterSpacing"in CanvasRenderingContext2D.prototype);if(0===o||a)return a&&(this.context.letterSpacing=o,this.context.textLetterSpacing=o),void(n?this.context.strokeText(t,e,i):this.context.fillText(t,e,i));for(var s=e,h=Array.from?Array.from(t):t.split(""),l=this.context.measureText(t).width,c=0,f=0;f<h.length;++f){var u=h[f];n?this.context.strokeText(u,s,i):this.context.fillText(u,s,i);for(var p="",d=f+1;d<h.length;++d)p+=h[d];s+=l-(c=this.context.measureText(p).width)+o,l=c;}},r.prototype.updateTexture=function(){var t=this.canvas;if(this._style.trim){var e=q$3(t);e.data&&(t.width=e.width,t.height=e.height,this.context.putImageData(e.data,0,0));}var i=this._texture,n=this._style,r=n.trim?0:n.padding,o=i.baseTexture;i.trim.width=i._frame.width=t.width/this._resolution,i.trim.height=i._frame.height=t.height/this._resolution,i.trim.x=-r,i.trim.y=-r,i.orig.width=i._frame.width-2*r,i.orig.height=i._frame.height-2*r,this._onTextureUpdate(),o.setRealSize(t.width,t.height,this._resolution),i.updateUvs(),this.dirty=!1;},r.prototype._render=function(e){this._autoResolution&&this._resolution!==e.resolution&&(this._resolution=e.resolution,this.dirty=!0),this.updateText(!0),t.prototype._render.call(this,e);},r.prototype.updateTransform=function(){this.updateText(!0),t.prototype.updateTransform.call(this);},r.prototype.getBounds=function(e,i){return this.updateText(!0),-1===this._textureID&&(e=!1),t.prototype.getBounds.call(this,e,i)},r.prototype.getLocalBounds=function(e){return this.updateText(!0),t.prototype.getLocalBounds.call(this,e)},r.prototype._calculateBounds=function(){this.calculateVertices(),this._bounds.addQuad(this.vertexData);},r.prototype._generateFillStyle=function(t,e,i){var n,r=t.fill;if(!Array.isArray(r))return r;if(1===r.length)return r[0];var o=t.dropShadow?t.dropShadowDistance:0,a=t.padding||0,s=this.canvas.width/this._resolution-o-2*a,h=this.canvas.height/this._resolution-o-2*a,c=r.slice(),f=t.fillGradientStops.slice();if(!f.length)for(var u=c.length+1,p=1;p<u;++p)f.push(p/u);if(c.unshift(r[0]),f.unshift(0),c.push(r[r.length-1]),f.push(1),t.fillGradientType===l$3.LINEAR_VERTICAL){n=this.context.createLinearGradient(s/2,a,s/2,h+a);var d=i.fontProperties.fontSize+t.strokeThickness;for(p=0;p<e.length;p++){var g=i.lineHeight*(p-1)+d,y=i.lineHeight*p,_=y;p>0&&g>y&&(_=(y+g)/2);var b=y+d,S=i.lineHeight*(p+1),m=b;p+1<e.length&&S<b&&(m=(b+S)/2);for(var w=(m-_)/h,v=0;v<c.length;v++){var x=0;x="number"==typeof f[v]?f[v]:v/c.length;var I=Math.min(1,Math.max(0,_/h+x*w));I=Number(I.toFixed(5)),n.addColorStop(I,c[v]);}}}else {n=this.context.createLinearGradient(a,h/2,s+a,h/2);var k=c.length+1,T=1;for(p=0;p<c.length;p++){var L=void 0;L="number"==typeof f[p]?f[p]:T/k,n.addColorStop(L,c[p]),T++;}}return n},r.prototype.destroy=function(e){"boolean"==typeof e&&(e={children:e}),e=Object.assign({},b$2,e),t.prototype.destroy.call(this,e),this._ownCanvas&&(this.canvas.height=this.canvas.width=0),this.context=null,this.canvas=null,this._style=null;},Object.defineProperty(r.prototype,"width",{get:function(){return this.updateText(!0),Math.abs(this.scale.x)*this._texture.orig.width},set:function(t){this.updateText(!0);var e=M$2(this.scale.x)||1;this.scale.x=e*t/this._texture.orig.width,this._width=t;},enumerable:!1,configurable:!0}),Object.defineProperty(r.prototype,"height",{get:function(){return this.updateText(!0),Math.abs(this.scale.y)*this._texture.orig.height},set:function(t){this.updateText(!0);var e=M$2(this.scale.y)||1;this.scale.y=e*t/this._texture.orig.height,this._height=t;},enumerable:!1,configurable:!0}),Object.defineProperty(r.prototype,"style",{get:function(){return this._style},set:function(t){t=t||{},this._style=t instanceof p$2?t:new p$2(t),this.localStyleID=-1,this.dirty=!0;},enumerable:!1,configurable:!0}),Object.defineProperty(r.prototype,"text",{get:function(){return this._text},set:function(t){t=String(null==t?"":t),this._text!==t&&(this._text=t,this.dirty=!0);},enumerable:!1,configurable:!0}),Object.defineProperty(r.prototype,"resolution",{get:function(){return this._resolution},set:function(t){this._autoResolution=!1,this._resolution!==t&&(this._resolution=t,this.dirty=!0);},enumerable:!1,configurable:!0}),r.nextLineHeightBehavior=!1,r.experimentalLetterSpacing=!1,r}(l$4);

  /*!
   * @pixi/prepare - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/prepare is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  V$2.UPLOADS_PER_FRAME=4;var f$2=function(t,e){return f$2=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,e){t.__proto__=e;}||function(t,e){for(var i in e)e.hasOwnProperty(i)&&(t[i]=e[i]);},f$2(t,e)};var l$2=function(){function t(t){this.maxItemsPerFrame=t,this.itemsLeft=0;}return t.prototype.beginFrame=function(){this.itemsLeft=this.maxItemsPerFrame;},t.prototype.allowedToUpload=function(){return this.itemsLeft-- >0},t}();function c$3(t,i){var r=!1;if(t&&t._textures&&t._textures.length)for(var o=0;o<t._textures.length;o++)if(t._textures[o]instanceof ye){var n=t._textures[o].baseTexture;-1===i.indexOf(n)&&(i.push(n),r=!0);}return r}function d$3(t,e){if(t.baseTexture instanceof te){var r=t.baseTexture;return -1===e.indexOf(r)&&e.push(r),!0}return !1}function m$2(t,i){if(t._texture&&t._texture instanceof ye){var r=t._texture.baseTexture;return -1===i.indexOf(r)&&i.push(r),!0}return !1}function k$1(t,e){return e instanceof S$3&&(e.updateText(!0),!0)}function g$2(t,e){if(e instanceof p$2){var i=e.toFontString();return _$3.measureFont(i),!0}return !1}function x$2(t,e){if(t instanceof S$3){-1===e.indexOf(t.style)&&e.push(t.style),-1===e.indexOf(t)&&e.push(t);var i=t._texture.baseTexture;return -1===e.indexOf(i)&&e.push(i),!0}return !1}function y$2(t,e){return t instanceof p$2&&(-1===e.indexOf(t)&&e.push(t),!0)}var H=function(){function e(e){var i=this;this.limiter=new l$2(V$2.UPLOADS_PER_FRAME),this.renderer=e,this.uploadHookHelper=null,this.queue=[],this.addHooks=[],this.uploadHooks=[],this.completes=[],this.ticking=!1,this.delayedTick=function(){i.queue&&i.prepareItems();},this.registerFindHook(x$2),this.registerFindHook(y$2),this.registerFindHook(c$3),this.registerFindHook(d$3),this.registerFindHook(m$2),this.registerUploadHook(k$1),this.registerUploadHook(g$2);}return e.prototype.upload=function(t,e){var i=this;return "function"==typeof t&&(e=t,t=null),new Promise((function(r){t&&i.add(t);var o=function(){null==e||e(),r();};i.queue.length?(i.completes.push(o),i.ticking||(i.ticking=!0,n$7.system.addOnce(i.tick,i,i$4.UTILITY))):o();}))},e.prototype.tick=function(){setTimeout(this.delayedTick,0);},e.prototype.prepareItems=function(){for(this.limiter.beginFrame();this.queue.length&&this.limiter.allowedToUpload();){var t=this.queue[0],e=!1;if(t&&!t._destroyed)for(var i=0,r=this.uploadHooks.length;i<r;i++)if(this.uploadHooks[i](this.uploadHookHelper,t)){this.queue.shift(),e=!0;break}e||this.queue.shift();}if(this.queue.length)n$7.system.addOnce(this.tick,this,i$4.UTILITY);else {this.ticking=!1;var o=this.completes.slice(0);this.completes.length=0;for(i=0,r=o.length;i<r;i++)o[i]();}},e.prototype.registerFindHook=function(t){return t&&this.addHooks.push(t),this},e.prototype.registerUploadHook=function(t){return t&&this.uploadHooks.push(t),this},e.prototype.add=function(t){for(var e=0,i=this.addHooks.length;e<i&&!this.addHooks[e](t,this.queue);e++);if(t instanceof g$6)for(e=t.children.length-1;e>=0;e--)this.add(t.children[e]);return this},e.prototype.destroy=function(){this.ticking&&n$7.system.remove(this.tick,this),this.ticking=!1,this.addHooks=null,this.uploadHooks=null,this.renderer=null,this.completes=null,this.queue=null,this.limiter=null,this.uploadHookHelper=null;},e}();function v$2(t,e){return e instanceof te&&(e._glTextures[t.CONTEXT_UID]||t.texture.bind(e),!0)}function _$2(t,e){if(!(e instanceof et))return !1;var i=e.geometry;e.finishPoly(),i.updateBatches();for(var r=i.batches,n=0;n<r.length;n++){var s=r[n].style.texture;s&&v$2(t,s.baseTexture);}return i.batchable||t.geometry.bind(i,e._resolveDirectShader(t)),!0}function T$3(t,e){return t instanceof et&&(e.push(t),!0)}var b$1=function(t){function e(e){var i=t.call(this,e)||this;return i.uploadHookHelper=i.renderer,i.registerFindHook(T$3),i.registerUploadHook(v$2),i.registerUploadHook(_$2),i}return function(t,e){function i(){this.constructor=t;}f$2(t,e),t.prototype=null===e?Object.create(e):(i.prototype=e.prototype,new i);}(e,t),e.extension={name:"prepare",type:e$2.RendererPlugin},e}(H);

  /*!
   * @pixi/spritesheet - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/spritesheet is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  var n$3=function(){function s(t,s,i){void 0===i&&(i=null),this.linkedSheets=[],this._texture=t instanceof ye?t:null,this.baseTexture=t instanceof te?t:this._texture.baseTexture,this.textures={},this.animations={},this.data=s;var o=this.baseTexture.resource;this.resolution=this._updateResolution(i||(o?o.url:null)),this._frames=this.data.frames,this._frameKeys=Object.keys(this._frames),this._batchIndex=0,this._callback=null;}return s.prototype._updateResolution=function(t){void 0===t&&(t=null);var e=this.data.meta.scale,r=Y$3(t,null);return null===r&&(r=void 0!==e?parseFloat(e):1),1!==r&&this.baseTexture.setResolution(r),r},s.prototype.parse=function(t){var e=this;return new Promise((function(r){e._callback=function(e){null==t||t(e),r(e);},e._batchIndex=0,e._frameKeys.length<=s.BATCH_SIZE?(e._processFrames(0),e._processAnimations(),e._parseComplete()):e._nextBatch();}))},s.prototype._processFrames=function(r){for(var i=r,o=s.BATCH_SIZE;i-r<o&&i<this._frameKeys.length;){var a=this._frameKeys[i],n=this._frames[a],u=n.frame;if(u){var l=null,h=null,c=!1!==n.trimmed&&n.sourceSize?n.sourceSize:n.frame,f=new r$4(0,0,Math.floor(c.w)/this.resolution,Math.floor(c.h)/this.resolution);l=n.rotated?new r$4(Math.floor(u.x)/this.resolution,Math.floor(u.y)/this.resolution,Math.floor(u.h)/this.resolution,Math.floor(u.w)/this.resolution):new r$4(Math.floor(u.x)/this.resolution,Math.floor(u.y)/this.resolution,Math.floor(u.w)/this.resolution,Math.floor(u.h)/this.resolution),!1!==n.trimmed&&n.spriteSourceSize&&(h=new r$4(Math.floor(n.spriteSourceSize.x)/this.resolution,Math.floor(n.spriteSourceSize.y)/this.resolution,Math.floor(u.w)/this.resolution,Math.floor(u.h)/this.resolution)),this.textures[a]=new ye(this.baseTexture,l,f,h,n.rotated?2:0,n.anchor),ye.addToCache(this.textures[a],a);}i++;}},s.prototype._processAnimations=function(){var t=this.data.animations||{};for(var e in t){this.animations[e]=[];for(var r=0;r<t[e].length;r++){var s=t[e][r];this.animations[e].push(this.textures[s]);}}},s.prototype._parseComplete=function(){var t=this._callback;this._callback=null,this._batchIndex=0,t.call(this,this.textures);},s.prototype._nextBatch=function(){var t=this;this._processFrames(this._batchIndex*s.BATCH_SIZE),this._batchIndex++,setTimeout((function(){t._batchIndex*s.BATCH_SIZE<t._frameKeys.length?t._nextBatch():(t._processAnimations(),t._parseComplete());}),0);},s.prototype.destroy=function(t){var e;for(var r in void 0===t&&(t=!1),this.textures)this.textures[r].destroy();this._frames=null,this._frameKeys=null,this.data=null,this.textures=null,t&&(null===(e=this._texture)||void 0===e||e.destroy(),this.baseTexture.destroy()),this._texture=null,this.baseTexture=null,this.linkedSheets=[];},s.BATCH_SIZE=1e3,s}(),u$2=function(){function t(){}return t.use=function(e,r){var s,i,u=this,l=e.name+"_image";if(e.data&&e.type===p$4.TYPE.JSON&&e.data.frames&&!u.resources[l]){var h=null===(i=null===(s=e.data)||void 0===s?void 0:s.meta)||void 0===i?void 0:i.related_multi_packs;if(Array.isArray(h))for(var c=function(t){if("string"!=typeof t)return "continue";var r=t.replace(".json",""),s=o$a.resolve(e.url.replace(u.baseUrl,""),t);if(u.resources[r]||Object.values(u.resources).some((function(t){return o$a.format(o$a.parse(t.url))===s})))return "continue";var i={crossOrigin:e.crossOrigin,loadType:p$4.LOAD_TYPE.XHR,xhrType:p$4.XHR_RESPONSE_TYPE.JSON,parentResource:e,metadata:e.metadata};u.add(r,s,i);},f=0,m=h;f<m.length;f++){c(m[f]);}var p={crossOrigin:e.crossOrigin,metadata:e.metadata.imageMetadata,parentResource:e},d=t.getResourcePath(e,u.baseUrl);u.add(l,d,p,(function(t){if(t.error)r(t.error);else {var s=new n$3(t.texture,e.data,e.url);s.parse().then((function(){e.spritesheet=s,e.textures=s.textures,r();}));}}));}else r();},t.getResourcePath=function(t,e){return t.isDataUrl?t.data.meta.image:o$a.resolve(t.url.replace(e,""),t.data.meta.image)},t.extension=e$2.Loader,t}();

  /*!
   * @pixi/sprite-tiling - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/sprite-tiling is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  var f$1=function(e,t){return f$1=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(e,t){e.__proto__=t;}||function(e,t){for(var r in t)t.hasOwnProperty(r)&&(e[r]=t[r]);},f$1(e,t)};function v$1(e,t){function r(){this.constructor=e;}f$1(e,t),e.prototype=null===t?Object.create(t):(r.prototype=t.prototype,new r);}var x$1=new o$9;(function(r){function n(e,n,o){void 0===n&&(n=100),void 0===o&&(o=100);var i=r.call(this,e)||this;return i.tileTransform=new g$7,i._width=n,i._height=o,i.uvMatrix=i.texture.uvMatrix||new xt(e),i.pluginName="tilingSprite",i.uvRespectAnchor=!1,i}return v$1(n,r),Object.defineProperty(n.prototype,"clampMargin",{get:function(){return this.uvMatrix.clampMargin},set:function(e){this.uvMatrix.clampMargin=e,this.uvMatrix.update(!0);},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"tileScale",{get:function(){return this.tileTransform.scale},set:function(e){this.tileTransform.scale.copyFrom(e);},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"tilePosition",{get:function(){return this.tileTransform.position},set:function(e){this.tileTransform.position.copyFrom(e);},enumerable:!1,configurable:!0}),n.prototype._onTextureUpdate=function(){this.uvMatrix&&(this.uvMatrix.texture=this._texture),this._cachedTint=16777215;},n.prototype._render=function(e){var t=this._texture;t&&t.valid&&(this.tileTransform.updateLocalTransform(),this.uvMatrix.update(),e.batch.setObjectRenderer(e.plugins[this.pluginName]),e.plugins[this.pluginName].render(this));},n.prototype._calculateBounds=function(){var e=this._width*-this._anchor._x,t=this._height*-this._anchor._y,r=this._width*(1-this._anchor._x),n=this._height*(1-this._anchor._y);this._bounds.addFrame(this.transform,e,t,r,n);},n.prototype.getLocalBounds=function(e){return 0===this.children.length?(this._bounds.minX=this._width*-this._anchor._x,this._bounds.minY=this._height*-this._anchor._y,this._bounds.maxX=this._width*(1-this._anchor._x),this._bounds.maxY=this._height*(1-this._anchor._y),e||(this._localBoundsRect||(this._localBoundsRect=new r$4),e=this._localBoundsRect),this._bounds.getRectangle(e)):r.prototype.getLocalBounds.call(this,e)},n.prototype.containsPoint=function(e){this.worldTransform.applyInverse(e,x$1);var t=this._width,r=this._height,n=-t*this.anchor._x;if(x$1.x>=n&&x$1.x<n+t){var o=-r*this.anchor._y;if(x$1.y>=o&&x$1.y<o+r)return !0}return !1},n.prototype.destroy=function(e){r.prototype.destroy.call(this,e),this.tileTransform=null,this.uvMatrix=null;},n.from=function(t,r){return new n(t instanceof ye?t:ye.from(t,r),r.width,r.height)},Object.defineProperty(n.prototype,"width",{get:function(){return this._width},set:function(e){this._width=e;},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"height",{get:function(){return this._height},set:function(e){this._height=e;},enumerable:!1,configurable:!0}),n})(l$4);var g$1="#version 100\n#define SHADER_NAME Tiling-Sprite-100\n\nprecision lowp float;\n\nattribute vec2 aVertexPosition;\nattribute vec2 aTextureCoord;\n\nuniform mat3 projectionMatrix;\nuniform mat3 translationMatrix;\nuniform mat3 uTransform;\n\nvarying vec2 vTextureCoord;\n\nvoid main(void)\n{\n    gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);\n\n    vTextureCoord = (uTransform * vec3(aTextureCoord, 1.0)).xy;\n}\n",y$1=new p$7,C$2=function(e){function t(t){var r=e.call(this,t)||this;return t.runners.contextChange.add(r),r.quad=new Fe,r.state=yt.for2d(),r}return v$1(t,e),t.prototype.contextChange=function(){var e=this.renderer,t={globals:e.globalUniforms};this.simpleShader=gt.from(g$1,"#version 100\n#define SHADER_NAME Tiling-Sprite-Simple-100\n\nprecision lowp float;\n\nvarying vec2 vTextureCoord;\n\nuniform sampler2D uSampler;\nuniform vec4 uColor;\n\nvoid main(void)\n{\n    vec4 texSample = texture2D(uSampler, vTextureCoord);\n    gl_FragColor = texSample * uColor;\n}\n",t),this.shader=e.context.webGLVersion>1?gt.from("#version 300 es\n#define SHADER_NAME Tiling-Sprite-300\n\nprecision lowp float;\n\nin vec2 aVertexPosition;\nin vec2 aTextureCoord;\n\nuniform mat3 projectionMatrix;\nuniform mat3 translationMatrix;\nuniform mat3 uTransform;\n\nout vec2 vTextureCoord;\n\nvoid main(void)\n{\n    gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);\n\n    vTextureCoord = (uTransform * vec3(aTextureCoord, 1.0)).xy;\n}\n","#version 300 es\n#define SHADER_NAME Tiling-Sprite-100\n\nprecision lowp float;\n\nin vec2 vTextureCoord;\n\nout vec4 fragmentColor;\n\nuniform sampler2D uSampler;\nuniform vec4 uColor;\nuniform mat3 uMapCoord;\nuniform vec4 uClampFrame;\nuniform vec2 uClampOffset;\n\nvoid main(void)\n{\n    vec2 coord = vTextureCoord + ceil(uClampOffset - vTextureCoord);\n    coord = (uMapCoord * vec3(coord, 1.0)).xy;\n    vec2 unclamped = coord;\n    coord = clamp(coord, uClampFrame.xy, uClampFrame.zw);\n\n    vec4 texSample = texture(uSampler, coord, unclamped == coord ? 0.0f : -32.0f);// lod-bias very negative to force lod 0\n\n    fragmentColor = texSample * uColor;\n}\n",t):gt.from(g$1,"#version 100\n#ifdef GL_EXT_shader_texture_lod\n    #extension GL_EXT_shader_texture_lod : enable\n#endif\n#define SHADER_NAME Tiling-Sprite-100\n\nprecision lowp float;\n\nvarying vec2 vTextureCoord;\n\nuniform sampler2D uSampler;\nuniform vec4 uColor;\nuniform mat3 uMapCoord;\nuniform vec4 uClampFrame;\nuniform vec2 uClampOffset;\n\nvoid main(void)\n{\n    vec2 coord = vTextureCoord + ceil(uClampOffset - vTextureCoord);\n    coord = (uMapCoord * vec3(coord, 1.0)).xy;\n    vec2 unclamped = coord;\n    coord = clamp(coord, uClampFrame.xy, uClampFrame.zw);\n\n    #ifdef GL_EXT_shader_texture_lod\n        vec4 texSample = unclamped == coord\n            ? texture2D(uSampler, coord) \n            : texture2DLodEXT(uSampler, coord, 0);\n    #else\n        vec4 texSample = texture2D(uSampler, coord);\n    #endif\n\n    gl_FragColor = texSample * uColor;\n}\n",t);},t.prototype.render=function(e){var t=this.renderer,r=this.quad,n=r.vertices;n[0]=n[6]=e._width*-e.anchor.x,n[1]=n[3]=e._height*-e.anchor.y,n[2]=n[4]=e._width*(1-e.anchor.x),n[5]=n[7]=e._height*(1-e.anchor.y);var o=e.uvRespectAnchor?e.anchor.x:0,i=e.uvRespectAnchor?e.anchor.y:0;(n=r.uvs)[0]=n[6]=-o,n[1]=n[3]=-i,n[2]=n[4]=1-o,n[5]=n[7]=1-i,r.invalidate();var a=e._texture,u=a.baseTexture,s=u.alphaMode>0,c=e.tileTransform.localTransform,l=e.uvMatrix,h=u.isPowerOfTwo&&a.frame.width===u.width&&a.frame.height===u.height;h&&(u._glTextures[t.CONTEXT_UID]?h=u.wrapMode!==S$5.CLAMP:u.wrapMode===S$5.CLAMP&&(u.wrapMode=S$5.REPEAT));var f=h?this.simpleShader:this.shader,v=a.width,x=a.height,_=e._width,g=e._height;y$1.set(c.a*v/_,c.b*v/g,c.c*x/_,c.d*x/g,c.tx/_,c.ty/g),y$1.invert(),h?y$1.prepend(l.mapCoord):(f.uniforms.uMapCoord=l.mapCoord.toArray(!0),f.uniforms.uClampFrame=l.uClampFrame,f.uniforms.uClampOffset=l.uClampOffset),f.uniforms.uTransform=y$1.toArray(!0),f.uniforms.uColor=w$3(e.tint,e.worldAlpha,f.uniforms.uColor,s),f.uniforms.translationMatrix=e.transform.worldTransform.toArray(!0),f.uniforms.uSampler=a,t.shader.bind(f),t.geometry.bind(r),this.state.blendMode=v$8(e.blendMode,s),t.state.set(this.state),t.geometry.draw(this.renderer.gl.TRIANGLES,6,0);},t.extension={name:"tilingSprite",type:e$2.RendererPlugin},t}(Le);

  /*!
   * @pixi/mesh - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/mesh is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  var c$2=function(t,e){return c$2=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,e){t.__proto__=e;}||function(t,e){for(var r in e)e.hasOwnProperty(r)&&(t[r]=e[r]);},c$2(t,e)};function m$1(t,e){function r(){this.constructor=t;}c$2(t,e),t.prototype=null===e?Object.create(e):(r.prototype=e.prototype,new r);}var y=function(){function t(t,e){this.uvBuffer=t,this.uvMatrix=e,this.data=null,this._bufferUpdateId=-1,this._textureUpdateId=-1,this._updateID=0;}return t.prototype.update=function(t){if(t||this._bufferUpdateId!==this.uvBuffer._updateID||this._textureUpdateId!==this.uvMatrix._updateID){this._bufferUpdateId=this.uvBuffer._updateID,this._textureUpdateId=this.uvMatrix._updateID;var e=this.uvBuffer.data;this.data&&this.data.length===e.length||(this.data=new Float32Array(e.length)),this.uvMatrix.multiplyUvs(e,this.data),this._updateID++;}},t}(),x=new o$9,v=new c$a,g=function(e){function r(r,i,n,o){void 0===o&&(o=R$5.TRIANGLES);var a=e.call(this)||this;return a.geometry=r,a.shader=i,a.state=n||yt.for2d(),a.drawMode=o,a.start=0,a.size=0,a.uvs=null,a.indices=null,a.vertexData=new Float32Array(1),a.vertexDirty=-1,a._transformID=-1,a._roundPixels=V$2.ROUND_PIXELS,a.batchUvs=null,a}return m$1(r,e),Object.defineProperty(r.prototype,"geometry",{get:function(){return this._geometry},set:function(t){this._geometry!==t&&(this._geometry&&(this._geometry.refCount--,0===this._geometry.refCount&&this._geometry.dispose()),this._geometry=t,this._geometry&&this._geometry.refCount++,this.vertexDirty=-1);},enumerable:!1,configurable:!0}),Object.defineProperty(r.prototype,"uvBuffer",{get:function(){return this.geometry.buffers[1]},enumerable:!1,configurable:!0}),Object.defineProperty(r.prototype,"verticesBuffer",{get:function(){return this.geometry.buffers[0]},enumerable:!1,configurable:!0}),Object.defineProperty(r.prototype,"material",{get:function(){return this.shader},set:function(t){this.shader=t;},enumerable:!1,configurable:!0}),Object.defineProperty(r.prototype,"blendMode",{get:function(){return this.state.blendMode},set:function(t){this.state.blendMode=t;},enumerable:!1,configurable:!0}),Object.defineProperty(r.prototype,"roundPixels",{get:function(){return this._roundPixels},set:function(t){this._roundPixels!==t&&(this._transformID=-1),this._roundPixels=t;},enumerable:!1,configurable:!0}),Object.defineProperty(r.prototype,"tint",{get:function(){return "tint"in this.shader?this.shader.tint:null},set:function(t){this.shader.tint=t;},enumerable:!1,configurable:!0}),Object.defineProperty(r.prototype,"texture",{get:function(){return "texture"in this.shader?this.shader.texture:null},set:function(t){this.shader.texture=t;},enumerable:!1,configurable:!0}),r.prototype._render=function(t){var e=this.geometry.buffers[0].data;this.shader.batchable&&this.drawMode===R$5.TRIANGLES&&e.length<2*r.BATCHABLE_SIZE?this._renderToBatch(t):this._renderDefault(t);},r.prototype._renderDefault=function(t){var e=this.shader;e.alpha=this.worldAlpha,e.update&&e.update(),t.batch.flush(),e.uniforms.translationMatrix=this.transform.worldTransform.toArray(!0),t.shader.bind(e),t.state.set(this.state),t.geometry.bind(this.geometry,e),t.geometry.draw(this.drawMode,this.size,this.start,this.geometry.instanceCount);},r.prototype._renderToBatch=function(t){var e=this.geometry,r=this.shader;r.uvMatrix&&(r.uvMatrix.update(),this.calculateUvs()),this.calculateVertices(),this.indices=e.indexBuffer.data,this._tintRGB=r._tintRGB,this._texture=r.texture;var i=this.material.pluginName;t.batch.setObjectRenderer(t.plugins[i]),t.plugins[i].render(this);},r.prototype.calculateVertices=function(){var t=this.geometry.buffers[0],e=t.data,r=t._updateID;if(r!==this.vertexDirty||this._transformID!==this.transform._worldID){this._transformID=this.transform._worldID,this.vertexData.length!==e.length&&(this.vertexData=new Float32Array(e.length));for(var i=this.transform.worldTransform,n=i.a,o=i.b,a=i.c,s=i.d,u=i.tx,h=i.ty,l=this.vertexData,f=0;f<l.length/2;f++){var p=e[2*f],c=e[2*f+1];l[2*f]=n*p+a*c+u,l[2*f+1]=o*p+s*c+h;}if(this._roundPixels){var m=V$2.RESOLUTION;for(f=0;f<l.length;++f)l[f]=Math.round((l[f]*m|0)/m);}this.vertexDirty=r;}},r.prototype.calculateUvs=function(){var t=this.geometry.buffers[1],e=this.shader;e.uvMatrix.isSimple?this.uvs=t.data:(this.batchUvs||(this.batchUvs=new y(t,e.uvMatrix)),this.batchUvs.update(),this.uvs=this.batchUvs.data);},r.prototype._calculateBounds=function(){this.calculateVertices(),this._bounds.addVertexData(this.vertexData,0,this.vertexData.length);},r.prototype.containsPoint=function(t){if(!this.getBounds().contains(t.x,t.y))return !1;this.worldTransform.applyInverse(t,x);for(var e=this.geometry.getBuffer("aVertexPosition").data,r=v.points,i=this.geometry.getIndex().data,n=i.length,o=4===this.drawMode?3:1,a=0;a+2<n;a+=o){var s=2*i[a],u=2*i[a+1],h=2*i[a+2];if(r[0]=e[s],r[1]=e[s+1],r[2]=e[u],r[3]=e[u+1],r[4]=e[h],r[5]=e[h+1],v.contains(x.x,x.y))return !0}return !1},r.prototype.destroy=function(t){e.prototype.destroy.call(this,t),this._cachedTexture&&(this._cachedTexture.destroy(),this._cachedTexture=null),this.geometry=null,this.shader=null,this.state=null,this.uvs=null,this.indices=null,this.vertexData=null;},r.BATCHABLE_SIZE=100,r}(g$6),b=function(t){function i(i,n){var o=this,a={uSampler:i,alpha:1,uTextureMatrix:p$7.IDENTITY,uColor:new Float32Array([1,1,1,1])};return (n=Object.assign({tint:16777215,alpha:1,pluginName:"batch"},n)).uniforms&&Object.assign(a,n.uniforms),(o=t.call(this,n.program||mt.from("attribute vec2 aVertexPosition;\nattribute vec2 aTextureCoord;\n\nuniform mat3 projectionMatrix;\nuniform mat3 translationMatrix;\nuniform mat3 uTextureMatrix;\n\nvarying vec2 vTextureCoord;\n\nvoid main(void)\n{\n    gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);\n\n    vTextureCoord = (uTextureMatrix * vec3(aTextureCoord, 1.0)).xy;\n}\n","varying vec2 vTextureCoord;\nuniform vec4 uColor;\n\nuniform sampler2D uSampler;\n\nvoid main(void)\n{\n    gl_FragColor = texture2D(uSampler, vTextureCoord) * uColor;\n}\n"),a)||this)._colorDirty=!1,o.uvMatrix=new xt(i),o.batchable=void 0===n.program,o.pluginName=n.pluginName,o.tint=n.tint,o.alpha=n.alpha,o}return m$1(i,t),Object.defineProperty(i.prototype,"texture",{get:function(){return this.uniforms.uSampler},set:function(t){this.uniforms.uSampler!==t&&(!this.uniforms.uSampler.baseTexture.alphaMode!=!t.baseTexture.alphaMode&&(this._colorDirty=!0),this.uniforms.uSampler=t,this.uvMatrix.texture=t);},enumerable:!1,configurable:!0}),Object.defineProperty(i.prototype,"alpha",{get:function(){return this._alpha},set:function(t){t!==this._alpha&&(this._alpha=t,this._colorDirty=!0);},enumerable:!1,configurable:!0}),Object.defineProperty(i.prototype,"tint",{get:function(){return this._tint},set:function(t){t!==this._tint&&(this._tint=t,this._tintRGB=(t>>16)+(65280&t)+((255&t)<<16),this._colorDirty=!0);},enumerable:!1,configurable:!0}),i.prototype.update=function(){if(this._colorDirty){this._colorDirty=!1;var t=this.texture.baseTexture;w$3(this._tint,this._alpha,this.uniforms.uColor,t.alphaMode);}this.uvMatrix.update()&&(this.uniforms.uTextureMatrix=this.uvMatrix.mapCoord);},i}(gt),_$1=function(t){function e(e,r,i){var o=t.call(this)||this,a=new Te(e),s=new Te(r,!0),u=new Te(i,!0,!0);return o.addAttribute("aVertexPosition",a,2,!1,L$5.FLOAT).addAttribute("aTextureCoord",s,2,!1,L$5.FLOAT).addIndex(u),o._updateId=-1,o}return m$1(e,t),Object.defineProperty(e.prototype,"vertexDirtyId",{get:function(){return this.buffers[0]._updateID},enumerable:!1,configurable:!0}),e}(Ie);

  /*!
   * @pixi/text-bitmap - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/text-bitmap is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  var w=function(e,t){return w=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(e,t){e.__proto__=t;}||function(e,t){for(var r in t)t.hasOwnProperty(r)&&(e[r]=t[r]);},w(e,t)};var T$2=function(){this.info=[],this.common=[],this.page=[],this.char=[],this.kerning=[],this.distanceField=[];},A$2=function(){function e(){}return e.test=function(e){return "string"==typeof e&&0===e.indexOf("info face=")},e.parse=function(e){var t=e.match(/^[a-z]+\s+.+$/gm),r={info:[],common:[],page:[],char:[],chars:[],kerning:[],kernings:[],distanceField:[]};for(var i in t){var n=t[i].match(/^[a-z]+/gm)[0],a=t[i].match(/[a-zA-Z]+=([^\s"']+|"([^"]*)")/gm),o={};for(var s in a){var h=a[s].split("="),l=h[0],u=h[1].replace(/"/gm,""),f=parseFloat(u),c=isNaN(f)?u:f;o[l]=c;}r[n].push(o);}var d=new T$2;return r.info.forEach((function(e){return d.info.push({face:e.face,size:parseInt(e.size,10)})})),r.common.forEach((function(e){return d.common.push({lineHeight:parseInt(e.lineHeight,10)})})),r.page.forEach((function(e){return d.page.push({id:parseInt(e.id,10),file:e.file})})),r.char.forEach((function(e){return d.char.push({id:parseInt(e.id,10),page:parseInt(e.page,10),x:parseInt(e.x,10),y:parseInt(e.y,10),width:parseInt(e.width,10),height:parseInt(e.height,10),xoffset:parseInt(e.xoffset,10),yoffset:parseInt(e.yoffset,10),xadvance:parseInt(e.xadvance,10)})})),r.kerning.forEach((function(e){return d.kerning.push({first:parseInt(e.first,10),second:parseInt(e.second,10),amount:parseInt(e.amount,10)})})),r.distanceField.forEach((function(e){return d.distanceField.push({distanceRange:parseInt(e.distanceRange,10),fieldType:e.fieldType})})),d},e}(),S$2=function(){function e(){}return e.test=function(e){return e instanceof XMLDocument&&e.getElementsByTagName("page").length&&null!==e.getElementsByTagName("info")[0].getAttribute("face")},e.parse=function(e){for(var t=new T$2,r=e.getElementsByTagName("info"),i=e.getElementsByTagName("common"),n=e.getElementsByTagName("page"),a=e.getElementsByTagName("char"),o=e.getElementsByTagName("kerning"),s=e.getElementsByTagName("distanceField"),h=0;h<r.length;h++)t.info.push({face:r[h].getAttribute("face"),size:parseInt(r[h].getAttribute("size"),10)});for(h=0;h<i.length;h++)t.common.push({lineHeight:parseInt(i[h].getAttribute("lineHeight"),10)});for(h=0;h<n.length;h++)t.page.push({id:parseInt(n[h].getAttribute("id"),10)||0,file:n[h].getAttribute("file")});for(h=0;h<a.length;h++){var l=a[h];t.char.push({id:parseInt(l.getAttribute("id"),10),page:parseInt(l.getAttribute("page"),10)||0,x:parseInt(l.getAttribute("x"),10),y:parseInt(l.getAttribute("y"),10),width:parseInt(l.getAttribute("width"),10),height:parseInt(l.getAttribute("height"),10),xoffset:parseInt(l.getAttribute("xoffset"),10),yoffset:parseInt(l.getAttribute("yoffset"),10),xadvance:parseInt(l.getAttribute("xadvance"),10)});}for(h=0;h<o.length;h++)t.kerning.push({first:parseInt(o[h].getAttribute("first"),10),second:parseInt(o[h].getAttribute("second"),10),amount:parseInt(o[h].getAttribute("amount"),10)});for(h=0;h<s.length;h++)t.distanceField.push({fieldType:s[h].getAttribute("fieldType"),distanceRange:parseInt(s[h].getAttribute("distanceRange"),10)});return t},e}(),P$2=function(){function e(){}return e.test=function(e){if("string"==typeof e&&e.indexOf("<font>")>-1){var t=(new globalThis.DOMParser).parseFromString(e,"text/xml");return S$2.test(t)}return !1},e.parse=function(e){var t=(new globalThis.DOMParser).parseFromString(e,"text/xml");return S$2.parse(t)},e}(),M=[A$2,S$2,P$2];function C$1(e){for(var t=0;t<M.length;t++)if(M[t].test(e))return M[t];return null}function I$2(e,t,r,i,n,a,o){var l=r.text,u=r.fontProperties;t.translate(i,n),t.scale(a,a);var f=o.strokeThickness/2,c=-o.strokeThickness/2;if(t.font=o.toFontString(),t.lineWidth=o.strokeThickness,t.textBaseline=o.textBaseline,t.lineJoin=o.lineJoin,t.miterLimit=o.miterLimit,t.fillStyle=function(e,t,r,i,n,a){var o,s=r.fill;if(!Array.isArray(s))return s;if(1===s.length)return s[0];var h=r.dropShadow?r.dropShadowDistance:0,l=r.padding||0,u=e.width/i-h-2*l,f=e.height/i-h-2*l,c=s.slice(),d=r.fillGradientStops.slice();if(!d.length)for(var p=c.length+1,m=1;m<p;++m)d.push(m/p);if(c.unshift(s[0]),d.unshift(0),c.push(s[s.length-1]),d.push(1),r.fillGradientType===l$3.LINEAR_VERTICAL){o=t.createLinearGradient(u/2,l,u/2,f+l);var x=0,v=(a.fontProperties.fontSize+r.strokeThickness)/f;for(m=0;m<n.length;m++)for(var y=a.lineHeight*m,b=0;b<c.length;b++){var _=y/f+("number"==typeof d[b]?d[b]:b/c.length)*v,w=Math.max(x,_);w=Math.min(w,1),o.addColorStop(w,c[b]),x=w;}}else {o=t.createLinearGradient(l,f/2,u+l,f/2);var T=c.length+1,A=1;for(m=0;m<c.length;m++){var S=void 0;S="number"==typeof d[m]?d[m]:A/T,o.addColorStop(S,c[m]),A++;}}return o}(e,t,o,a,[l],r),t.strokeStyle=o.stroke,o.dropShadow){var d=o.dropShadowColor,p=s$7("number"==typeof d?d:h$7(d)),m=o.dropShadowBlur*a,x=o.dropShadowDistance*a;t.shadowColor="rgba("+255*p[0]+","+255*p[1]+","+255*p[2]+","+o.dropShadowAlpha+")",t.shadowBlur=m,t.shadowOffsetX=Math.cos(o.dropShadowAngle)*x,t.shadowOffsetY=Math.sin(o.dropShadowAngle)*x;}else t.shadowColor="black",t.shadowBlur=0,t.shadowOffsetX=0,t.shadowOffsetY=0;o.stroke&&o.strokeThickness&&t.strokeText(l,f,c+r.lineHeight-u.descent),o.fill&&t.fillText(l,f,c+r.lineHeight-u.descent),t.setTransform(1,0,0,1,0,0),t.fillStyle="rgba(0, 0, 0, 0)";}function O$2(e){return Array.from?Array.from(e):e.split("")}function E$2(e){return e.codePointAt?e.codePointAt(0):e.charCodeAt(0)}var F=function(){function t(t,r,i){var n,a,o=t.info[0],s=t.common[0],h=t.page[0],u=t.distanceField[0],f=Y$3(h.file),d={};this._ownsTextures=i,this.font=o.face,this.size=o.size,this.lineHeight=s.lineHeight/f,this.chars={},this.pageTextures=d;for(var p=0;p<t.page.length;p++){var g=t.page[p],m=g.id,x=g.file;d[m]=r instanceof Array?r[p]:r[x],(null==u?void 0:u.fieldType)&&"none"!==u.fieldType&&(d[m].baseTexture.alphaMode=D$4.NO_PREMULTIPLIED_ALPHA);}for(p=0;p<t.char.length;p++){var y=t.char[p],b=(m=y.id,y.page),_=t.char[p],w=_.x,T=_.y,A=_.width,S=_.height,P=_.xoffset,M=_.yoffset,C=_.xadvance;T/=f,A/=f,S/=f,P/=f,M/=f,C/=f;var I=new r$4((w/=f)+d[b].frame.x/f,T+d[b].frame.y/f,A,S);this.chars[m]={xOffset:P,yOffset:M,xAdvance:C,kerning:{},texture:new ye(d[b].baseTexture,I),page:b};}for(p=0;p<t.kerning.length;p++){var O=t.kerning[p],E=O.first,F=O.second,k=O.amount;E/=f,F/=f,k/=f,this.chars[F]&&(this.chars[F].kerning[E]=k);}this.distanceFieldRange=null==u?void 0:u.distanceRange,this.distanceFieldType=null!==(a=null===(n=null==u?void 0:u.fieldType)||void 0===n?void 0:n.toLowerCase())&&void 0!==a?a:"none";}return t.prototype.destroy=function(){for(var e in this.chars)this.chars[e].texture.destroy(),this.chars[e].texture=null;for(var e in this.pageTextures)this._ownsTextures&&this.pageTextures[e].destroy(!0),this.pageTextures[e]=null;this.chars=null,this.pageTextures=null;},t.install=function(e,r,i){var n;if(e instanceof T$2)n=e;else {var a=C$1(e);if(!a)throw new Error("Unrecognized data format for font.");n=a.parse(e);}r instanceof ye&&(r=[r]);var o=new t(n,r,i);return t.available[o.font]=o,o},t.uninstall=function(e){var r=t.available[e];if(!r)throw new Error("No font found named '"+e+"'");r.destroy(),delete t.available[e];},t.from=function(e,r,n){if(!e)throw new Error("[BitmapFont] Property `name` is required.");var a=Object.assign({},t.defaultOptions,n),o=a.chars,s=a.padding,h=a.resolution,l=a.textureWidth,u=a.textureHeight,d=function(e){"string"==typeof e&&(e=[e]);for(var t=[],r=0,i=e.length;r<i;r++){var n=e[r];if(Array.isArray(n)){if(2!==n.length)throw new Error("[BitmapFont]: Invalid character range length, expecting 2 got "+n.length+".");var a=n[0].charCodeAt(0),o=n[1].charCodeAt(0);if(o<a)throw new Error("[BitmapFont]: Invalid character range.");for(var s=a,h=o;s<=h;s++)t.push(String.fromCharCode(s));}else t.push.apply(t,O$2(n));}if(0===t.length)throw new Error("[BitmapFont]: Empty set when resolving characters.");return t}(o),p=r instanceof p$2?r:new p$2(r),g=l,v=new T$2;v.info[0]={face:p.fontFamily,size:p.fontSize},v.common[0]={lineHeight:p.fontSize};for(var y,b,_,w=0,A=0,S=0,P=[],M=0;M<d.length;M++){y||((y=V$2.ADAPTER.createCanvas()).width=l,y.height=u,b=y.getContext("2d"),_=new te(y,{resolution:h}),P.push(new ye(_)),v.page.push({id:P.length-1,file:""}));var C=_$3.measureText(d[M],p,!1,y),F=C.width,k=Math.ceil(C.height),N=Math.ceil(("italic"===p.fontStyle?2:1)*F);if(A>=u-k*h){if(0===A)throw new Error("[BitmapFont] textureHeight "+u+"px is too small for "+p.fontSize+"px fonts");--M,y=null,b=null,_=null,A=0,w=0,S=0;}else if(S=Math.max(k+C.fontProperties.descent,S),N*h+w>=g)--M,A+=S*h,A=Math.ceil(A),w=0,S=0;else {I$2(y,b,C,w,A,h,p);var z=E$2(C.text);v.char.push({id:z,page:P.length-1,x:w/h,y:A/h,width:N,height:k,xoffset:0,yoffset:0,xadvance:Math.ceil(F-(p.dropShadow?p.dropShadowDistance:0)-(p.stroke?p.strokeThickness:0))}),w+=(N+2*s)*h,w=Math.ceil(w);}}M=0;for(var H=d.length;M<H;M++)for(var D=d[M],B=0;B<H;B++){var L=d[B],R=b.measureText(D).width,j=b.measureText(L).width,W=b.measureText(D+L).width-(R+j);W&&v.kerning.push({first:E$2(D),second:E$2(L),amount:W});}var U=new t(v,P,!0);return void 0!==t.available[e]&&t.uninstall(e),t.available[e]=U,U},t.ALPHA=[["a","z"],["A","Z"]," "],t.NUMERIC=[["0","9"]],t.ALPHANUMERIC=[["a","z"],["A","Z"],["0","9"]," "],t.ASCII=[[" ","~"]],t.defaultOptions={resolution:1,textureWidth:512,textureHeight:512,padding:4,chars:t.ALPHANUMERIC},t.available={},t}(),k=[],N$2=[],z=[];(function(e){function s(t,n){void 0===n&&(n={});var a=e.call(this)||this;a._tint=16777215;var o=Object.assign({},s.styleDefaults,n),h=o.align,l=o.tint,u=o.maxWidth,f=o.letterSpacing,c=o.fontName,d=o.fontSize;if(!F.available[c])throw new Error('Missing BitmapFont "'+c+'"');return a._activePagesMeshData=[],a._textWidth=0,a._textHeight=0,a._align=h,a._tint=l,a._fontName=c,a._fontSize=d||F.available[c].size,a.text=t,a._maxWidth=u,a._maxLineHeight=0,a._letterSpacing=f,a._anchor=new u$9((function(){a.dirty=!0;}),a,0,0),a._roundPixels=V$2.ROUND_PIXELS,a.dirty=!0,a._resolution=V$2.RESOLUTION,a._autoResolution=!0,a._textureCache={},a}return function(e,t){function r(){this.constructor=e;}w(e,t),e.prototype=null===t?Object.create(t):(r.prototype=t.prototype,new r);}(s,e),s.prototype.updateText=function(){for(var e,r=F.available[this._fontName],i=this._fontSize/r.size,s=new o$9,h=[],l=[],f=[],p=O$2(this._text.replace(/(?:\r\n|\r)/g,"\n")||" "),g$1=this._maxWidth*r.size/this._fontSize,m="none"===r.distanceFieldType?k:N$2,x=null,v=0,b$1=0,_=0,w=-1,T=0,A=0,S=0,P=0,M=0;M<p.length;M++){var C=E$2(ee=p[M]);if(/(?:\s)/.test(ee)&&(w=M,T=v,P++),"\r"!==ee&&"\n"!==ee){var I=r.chars[C];if(I){x&&I.kerning[x]&&(s.x+=I.kerning[x]);var H=z.pop()||{texture:ye.EMPTY,line:0,charCode:0,prevSpaces:0,position:new o$9};H.texture=I.texture,H.line=_,H.charCode=C,H.position.x=s.x+I.xOffset+this._letterSpacing/2,H.position.y=s.y+I.yOffset,H.prevSpaces=P,h.push(H),v=H.position.x+Math.max(I.xAdvance,I.texture.orig.width),s.x+=I.xAdvance+this._letterSpacing,S=Math.max(S,I.yOffset+I.texture.height),x=C,-1!==w&&g$1>0&&s.x>g$1&&(++A,_$9(h,1+w-A,1+M-w),M=w,w=-1,l.push(T),f.push(h.length>0?h[h.length-1].prevSpaces:0),b$1=Math.max(b$1,T),_++,s.x=0,s.y+=r.lineHeight,x=null,P=0);}}else l.push(v),f.push(-1),b$1=Math.max(b$1,v),++_,++A,s.x=0,s.y+=r.lineHeight,x=null,P=0;}var D=p[p.length-1];"\r"!==D&&"\n"!==D&&(/(?:\s)/.test(D)&&(v=T),l.push(v),b$1=Math.max(b$1,v),f.push(-1));var B=[];for(M=0;M<=_;M++){var L=0;"right"===this._align?L=b$1-l[M]:"center"===this._align?L=(b$1-l[M])/2:"justify"===this._align&&(L=f[M]<0?0:(b$1-l[M])/f[M]),B.push(L);}var R=h.length,j={},W=[],U=this._activePagesMeshData;for(M=0;M<U.length;M++)m.push(U[M]);for(M=0;M<R;M++){var X=(re=h[M].texture).baseTexture.uid;if(!j[X]){if(!(le=m.pop())){var Y=new _$1,G=void 0,V=void 0;"none"===r.distanceFieldType?(G=new b(ye.EMPTY),V=T$8.NORMAL):(G=new b(ye.EMPTY,{program:mt.from("// Mesh material default fragment\r\nattribute vec2 aVertexPosition;\r\nattribute vec2 aTextureCoord;\r\n\r\nuniform mat3 projectionMatrix;\r\nuniform mat3 translationMatrix;\r\nuniform mat3 uTextureMatrix;\r\n\r\nvarying vec2 vTextureCoord;\r\n\r\nvoid main(void)\r\n{\r\n    gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);\r\n\r\n    vTextureCoord = (uTextureMatrix * vec3(aTextureCoord, 1.0)).xy;\r\n}\r\n","// Pixi texture info\r\nvarying vec2 vTextureCoord;\r\nuniform sampler2D uSampler;\r\n\r\n// Tint\r\nuniform vec4 uColor;\r\n\r\n// on 2D applications fwidth is screenScale / glyphAtlasScale * distanceFieldRange\r\nuniform float uFWidth;\r\n\r\nvoid main(void) {\r\n\r\n  // To stack MSDF and SDF we need a non-pre-multiplied-alpha texture.\r\n  vec4 texColor = texture2D(uSampler, vTextureCoord);\r\n\r\n  // MSDF\r\n  float median = texColor.r + texColor.g + texColor.b -\r\n                  min(texColor.r, min(texColor.g, texColor.b)) -\r\n                  max(texColor.r, max(texColor.g, texColor.b));\r\n  // SDF\r\n  median = min(median, texColor.a);\r\n\r\n  float screenPxDistance = uFWidth * (median - 0.5);\r\n  float alpha = clamp(screenPxDistance + 0.5, 0.0, 1.0);\r\n\r\n  // NPM Textures, NPM outputs\r\n  gl_FragColor = vec4(uColor.rgb, uColor.a * alpha);\r\n\r\n}\r\n"),uniforms:{uFWidth:0}}),V=T$8.NORMAL_NPM);var Z=new g(Y,G);Z.blendMode=V,le={index:0,indexCount:0,vertexCount:0,uvsCount:0,total:0,mesh:Z,vertices:null,uvs:null,indices:null};}le.index=0,le.indexCount=0,le.vertexCount=0,le.uvsCount=0,le.total=0;var q=this._textureCache;q[X]=q[X]||new ye(re.baseTexture),le.mesh.texture=q[X],le.mesh.tint=this._tint,W.push(le),j[X]=le;}j[X].total++;}for(M=0;M<U.length;M++)-1===W.indexOf(U[M])&&this.removeChild(U[M].mesh);for(M=0;M<W.length;M++)W[M].mesh.parent!==this&&this.addChild(W[M].mesh);for(var M in this._activePagesMeshData=W,j){var $=(le=j[M]).total;if(!((null===(e=le.indices)||void 0===e?void 0:e.length)>6*$)||le.vertices.length<2*g.BATCHABLE_SIZE)le.vertices=new Float32Array(8*$),le.uvs=new Float32Array(8*$),le.indices=new Uint16Array(6*$);else for(var J=le.total,K=le.vertices,Q=4*J*2;Q<K.length;Q++)K[Q]=0;le.mesh.size=6*$;}for(M=0;M<R;M++){var ee,te=(ee=h[M]).position.x+B[ee.line]*("justify"===this._align?ee.prevSpaces:1);this._roundPixels&&(te=Math.round(te));var re,ie=te*i,ne=ee.position.y*i,ae=j[(re=ee.texture).baseTexture.uid],oe=re.frame,se=re._uvs,he=ae.index++;ae.indices[6*he+0]=0+4*he,ae.indices[6*he+1]=1+4*he,ae.indices[6*he+2]=2+4*he,ae.indices[6*he+3]=0+4*he,ae.indices[6*he+4]=2+4*he,ae.indices[6*he+5]=3+4*he,ae.vertices[8*he+0]=ie,ae.vertices[8*he+1]=ne,ae.vertices[8*he+2]=ie+oe.width*i,ae.vertices[8*he+3]=ne,ae.vertices[8*he+4]=ie+oe.width*i,ae.vertices[8*he+5]=ne+oe.height*i,ae.vertices[8*he+6]=ie,ae.vertices[8*he+7]=ne+oe.height*i,ae.uvs[8*he+0]=se.x0,ae.uvs[8*he+1]=se.y0,ae.uvs[8*he+2]=se.x1,ae.uvs[8*he+3]=se.y1,ae.uvs[8*he+4]=se.x2,ae.uvs[8*he+5]=se.y2,ae.uvs[8*he+6]=se.x3,ae.uvs[8*he+7]=se.y3;}for(var M in this._textWidth=b$1*i,this._textHeight=(s.y+r.lineHeight)*i,j){var le=j[M];if(0!==this.anchor.x||0!==this.anchor.y)for(var ue=0,fe=this._textWidth*this.anchor.x,ce=this._textHeight*this.anchor.y,de=0;de<le.total;de++)le.vertices[ue++]-=fe,le.vertices[ue++]-=ce,le.vertices[ue++]-=fe,le.vertices[ue++]-=ce,le.vertices[ue++]-=fe,le.vertices[ue++]-=ce,le.vertices[ue++]-=fe,le.vertices[ue++]-=ce;this._maxLineHeight=S*i;var pe=le.mesh.geometry.getBuffer("aVertexPosition"),ge=le.mesh.geometry.getBuffer("aTextureCoord"),me=le.mesh.geometry.getIndex();pe.data=le.vertices,ge.data=le.uvs,me.data=le.indices,pe.update(),ge.update(),me.update();}for(M=0;M<h.length;M++)z.push(h[M]);},s.prototype.updateTransform=function(){this.validate(),this.containerUpdateTransform();},s.prototype._render=function(t){this._autoResolution&&this._resolution!==t.resolution&&(this._resolution=t.resolution,this.dirty=!0);var r=F.available[this._fontName],i=r.distanceFieldRange,n=r.distanceFieldType,a=r.size;if("none"!==n)for(var o=this.worldTransform,s=o.a,h=o.b,l=o.c,u=o.d,f=Math.sqrt(s*s+h*h),c=Math.sqrt(l*l+u*u),d=(Math.abs(f)+Math.abs(c))/2,p=this._fontSize/a,g=0,m=this._activePagesMeshData;g<m.length;g++){m[g].mesh.shader.uniforms.uFWidth=d*i*p*this._resolution;}e.prototype._render.call(this,t);},s.prototype.getLocalBounds=function(){return this.validate(),e.prototype.getLocalBounds.call(this)},s.prototype.validate=function(){this.dirty&&(this.updateText(),this.dirty=!1);},Object.defineProperty(s.prototype,"tint",{get:function(){return this._tint},set:function(e){if(this._tint!==e){this._tint=e;for(var t=0;t<this._activePagesMeshData.length;t++)this._activePagesMeshData[t].mesh.tint=e;}},enumerable:!1,configurable:!0}),Object.defineProperty(s.prototype,"align",{get:function(){return this._align},set:function(e){this._align!==e&&(this._align=e,this.dirty=!0);},enumerable:!1,configurable:!0}),Object.defineProperty(s.prototype,"fontName",{get:function(){return this._fontName},set:function(e){if(!F.available[e])throw new Error('Missing BitmapFont "'+e+'"');this._fontName!==e&&(this._fontName=e,this.dirty=!0);},enumerable:!1,configurable:!0}),Object.defineProperty(s.prototype,"fontSize",{get:function(){return this._fontSize},set:function(e){this._fontSize!==e&&(this._fontSize=e,this.dirty=!0);},enumerable:!1,configurable:!0}),Object.defineProperty(s.prototype,"anchor",{get:function(){return this._anchor},set:function(e){"number"==typeof e?this._anchor.set(e):this._anchor.copyFrom(e);},enumerable:!1,configurable:!0}),Object.defineProperty(s.prototype,"text",{get:function(){return this._text},set:function(e){e=String(null==e?"":e),this._text!==e&&(this._text=e,this.dirty=!0);},enumerable:!1,configurable:!0}),Object.defineProperty(s.prototype,"maxWidth",{get:function(){return this._maxWidth},set:function(e){this._maxWidth!==e&&(this._maxWidth=e,this.dirty=!0);},enumerable:!1,configurable:!0}),Object.defineProperty(s.prototype,"maxLineHeight",{get:function(){return this.validate(),this._maxLineHeight},enumerable:!1,configurable:!0}),Object.defineProperty(s.prototype,"textWidth",{get:function(){return this.validate(),this._textWidth},enumerable:!1,configurable:!0}),Object.defineProperty(s.prototype,"letterSpacing",{get:function(){return this._letterSpacing},set:function(e){this._letterSpacing!==e&&(this._letterSpacing=e,this.dirty=!0);},enumerable:!1,configurable:!0}),Object.defineProperty(s.prototype,"roundPixels",{get:function(){return this._roundPixels},set:function(e){e!==this._roundPixels&&(this._roundPixels=e,this.dirty=!0);},enumerable:!1,configurable:!0}),Object.defineProperty(s.prototype,"textHeight",{get:function(){return this.validate(),this._textHeight},enumerable:!1,configurable:!0}),Object.defineProperty(s.prototype,"resolution",{get:function(){return this._resolution},set:function(e){this._autoResolution=!1,this._resolution!==e&&(this._resolution=e,this.dirty=!0);},enumerable:!1,configurable:!0}),s.prototype.destroy=function(t){var r=this._textureCache;for(var i in r){r[i].destroy(),delete r[i];}this._textureCache=null,e.prototype.destroy.call(this,t);},s.styleDefaults={align:"left",tint:16777215,maxWidth:0,letterSpacing:0},s})(g$6);var D$1=function(){function e(){}return e.add=function(){p$4.setExtensionXhrType("fnt",p$4.XHR_RESPONSE_TYPE.TEXT);},e.use=function(t,r){var i=C$1(t.data);if(i)for(var n=e.getBaseUrl(this,t),a=i.parse(t.data),o={},s=function(e){o[e.metadata.pageFile]=e.texture,Object.keys(o).length===a.page.length&&(t.bitmapFont=F.install(a,o,!0),r());},h=0;h<a.page.length;++h){var l=a.page[h].file,u=n+l,f=!1;for(var c in this.resources){var d=this.resources[c];if(d.url===u){d.metadata.pageFile=l,d.texture?s(d):d.onAfterMiddleware.add(s),f=!0;break}}if(!f){var p={crossOrigin:t.crossOrigin,loadType:p$4.LOAD_TYPE.IMAGE,metadata:Object.assign({pageFile:l},t.metadata.imageMetadata),parentResource:t};this.add(u,p,s);}}else r();},e.getBaseUrl=function(t,r){var i=r.isDataUrl?"":e.dirname(r.url);return r.isDataUrl&&("."===i&&(i=""),t.baseUrl&&i&&"/"===t.baseUrl.charAt(t.baseUrl.length-1)&&(i+="/")),(i=i.replace(t.baseUrl,""))&&"/"!==i.charAt(i.length-1)&&(i+="/"),i},e.dirname=function(e){var t=e.replace(/\\/g,"/").replace(/\/$/,"").replace(/\/[^\/]*$/,"");return t===e?".":""===t?"/":t},e.extension=e$2.Loader,e}();

  /*!
   * @pixi/filter-alpha - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/filter-alpha is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  var o$5=function(r,t){return o$5=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(r,t){r.__proto__=t;}||function(r,t){for(var o in t)t.hasOwnProperty(o)&&(r[o]=t[o]);},o$5(r,t)};(function(t){function n(o){void 0===o&&(o=1);var n=t.call(this,rr,"varying vec2 vTextureCoord;\n\nuniform sampler2D uSampler;\nuniform float uAlpha;\n\nvoid main(void)\n{\n   gl_FragColor = texture2D(uSampler, vTextureCoord) * uAlpha;\n}\n",{uAlpha:1})||this;return n.alpha=o,n}return function(r,t){function n(){this.constructor=r;}o$5(r,t),r.prototype=null===t?Object.create(t):(n.prototype=t.prototype,new n);}(n,t),Object.defineProperty(n.prototype,"alpha",{get:function(){return this.uniforms.uAlpha},set:function(r){this.uniforms.uAlpha=r;},enumerable:!1,configurable:!0}),n})(_t);

  /*!
   * @pixi/filter-blur - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/filter-blur is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  var r$1=function(t,e){return r$1=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,e){t.__proto__=e;}||function(t,e){for(var r in e)e.hasOwnProperty(r)&&(t[r]=e[r]);},r$1(t,e)};function i(t,e){function i(){this.constructor=t;}r$1(t,e),t.prototype=null===e?Object.create(e):(i.prototype=e.prototype,new i);}var E$1,n$2,_,o$4,T$1,N$1,u$1,R$1,l$1,I$1,A$1,s$2,O$1,a$1,L$1,P$1,U$1,S$1,h$1,p$1,c$1={5:[.153388,.221461,.250301],7:[.071303,.131514,.189879,.214607],9:[.028532,.067234,.124009,.179044,.20236],11:[.0093,.028002,.065984,.121703,.175713,.198596],13:[.002406,.009255,.027867,.065666,.121117,.174868,.197641],15:[489e-6,.002403,.009246,.02784,.065602,.120999,.174697,.197448]},f=["varying vec2 vBlurTexCoords[%size%];","uniform sampler2D uSampler;","void main(void)","{","    gl_FragColor = vec4(0.0);","    %blur%","}"].join("\n");!function(t){t[t.WEBGL_LEGACY=0]="WEBGL_LEGACY",t[t.WEBGL=1]="WEBGL",t[t.WEBGL2=2]="WEBGL2";}(E$1||(E$1={})),function(t){t[t.UNKNOWN=0]="UNKNOWN",t[t.WEBGL=1]="WEBGL",t[t.CANVAS=2]="CANVAS";}(n$2||(n$2={})),function(t){t[t.COLOR=16384]="COLOR",t[t.DEPTH=256]="DEPTH",t[t.STENCIL=1024]="STENCIL";}(_||(_={})),function(t){t[t.NORMAL=0]="NORMAL",t[t.ADD=1]="ADD",t[t.MULTIPLY=2]="MULTIPLY",t[t.SCREEN=3]="SCREEN",t[t.OVERLAY=4]="OVERLAY",t[t.DARKEN=5]="DARKEN",t[t.LIGHTEN=6]="LIGHTEN",t[t.COLOR_DODGE=7]="COLOR_DODGE",t[t.COLOR_BURN=8]="COLOR_BURN",t[t.HARD_LIGHT=9]="HARD_LIGHT",t[t.SOFT_LIGHT=10]="SOFT_LIGHT",t[t.DIFFERENCE=11]="DIFFERENCE",t[t.EXCLUSION=12]="EXCLUSION",t[t.HUE=13]="HUE",t[t.SATURATION=14]="SATURATION",t[t.COLOR=15]="COLOR",t[t.LUMINOSITY=16]="LUMINOSITY",t[t.NORMAL_NPM=17]="NORMAL_NPM",t[t.ADD_NPM=18]="ADD_NPM",t[t.SCREEN_NPM=19]="SCREEN_NPM",t[t.NONE=20]="NONE",t[t.SRC_OVER=0]="SRC_OVER",t[t.SRC_IN=21]="SRC_IN",t[t.SRC_OUT=22]="SRC_OUT",t[t.SRC_ATOP=23]="SRC_ATOP",t[t.DST_OVER=24]="DST_OVER",t[t.DST_IN=25]="DST_IN",t[t.DST_OUT=26]="DST_OUT",t[t.DST_ATOP=27]="DST_ATOP",t[t.ERASE=26]="ERASE",t[t.SUBTRACT=28]="SUBTRACT",t[t.XOR=29]="XOR";}(o$4||(o$4={})),function(t){t[t.POINTS=0]="POINTS",t[t.LINES=1]="LINES",t[t.LINE_LOOP=2]="LINE_LOOP",t[t.LINE_STRIP=3]="LINE_STRIP",t[t.TRIANGLES=4]="TRIANGLES",t[t.TRIANGLE_STRIP=5]="TRIANGLE_STRIP",t[t.TRIANGLE_FAN=6]="TRIANGLE_FAN";}(T$1||(T$1={})),function(t){t[t.RGBA=6408]="RGBA",t[t.RGB=6407]="RGB",t[t.RG=33319]="RG",t[t.RED=6403]="RED",t[t.RGBA_INTEGER=36249]="RGBA_INTEGER",t[t.RGB_INTEGER=36248]="RGB_INTEGER",t[t.RG_INTEGER=33320]="RG_INTEGER",t[t.RED_INTEGER=36244]="RED_INTEGER",t[t.ALPHA=6406]="ALPHA",t[t.LUMINANCE=6409]="LUMINANCE",t[t.LUMINANCE_ALPHA=6410]="LUMINANCE_ALPHA",t[t.DEPTH_COMPONENT=6402]="DEPTH_COMPONENT",t[t.DEPTH_STENCIL=34041]="DEPTH_STENCIL";}(N$1||(N$1={})),function(t){t[t.TEXTURE_2D=3553]="TEXTURE_2D",t[t.TEXTURE_CUBE_MAP=34067]="TEXTURE_CUBE_MAP",t[t.TEXTURE_2D_ARRAY=35866]="TEXTURE_2D_ARRAY",t[t.TEXTURE_CUBE_MAP_POSITIVE_X=34069]="TEXTURE_CUBE_MAP_POSITIVE_X",t[t.TEXTURE_CUBE_MAP_NEGATIVE_X=34070]="TEXTURE_CUBE_MAP_NEGATIVE_X",t[t.TEXTURE_CUBE_MAP_POSITIVE_Y=34071]="TEXTURE_CUBE_MAP_POSITIVE_Y",t[t.TEXTURE_CUBE_MAP_NEGATIVE_Y=34072]="TEXTURE_CUBE_MAP_NEGATIVE_Y",t[t.TEXTURE_CUBE_MAP_POSITIVE_Z=34073]="TEXTURE_CUBE_MAP_POSITIVE_Z",t[t.TEXTURE_CUBE_MAP_NEGATIVE_Z=34074]="TEXTURE_CUBE_MAP_NEGATIVE_Z";}(u$1||(u$1={})),function(t){t[t.UNSIGNED_BYTE=5121]="UNSIGNED_BYTE",t[t.UNSIGNED_SHORT=5123]="UNSIGNED_SHORT",t[t.UNSIGNED_SHORT_5_6_5=33635]="UNSIGNED_SHORT_5_6_5",t[t.UNSIGNED_SHORT_4_4_4_4=32819]="UNSIGNED_SHORT_4_4_4_4",t[t.UNSIGNED_SHORT_5_5_5_1=32820]="UNSIGNED_SHORT_5_5_5_1",t[t.UNSIGNED_INT=5125]="UNSIGNED_INT",t[t.UNSIGNED_INT_10F_11F_11F_REV=35899]="UNSIGNED_INT_10F_11F_11F_REV",t[t.UNSIGNED_INT_2_10_10_10_REV=33640]="UNSIGNED_INT_2_10_10_10_REV",t[t.UNSIGNED_INT_24_8=34042]="UNSIGNED_INT_24_8",t[t.UNSIGNED_INT_5_9_9_9_REV=35902]="UNSIGNED_INT_5_9_9_9_REV",t[t.BYTE=5120]="BYTE",t[t.SHORT=5122]="SHORT",t[t.INT=5124]="INT",t[t.FLOAT=5126]="FLOAT",t[t.FLOAT_32_UNSIGNED_INT_24_8_REV=36269]="FLOAT_32_UNSIGNED_INT_24_8_REV",t[t.HALF_FLOAT=36193]="HALF_FLOAT";}(R$1||(R$1={})),function(t){t[t.FLOAT=0]="FLOAT",t[t.INT=1]="INT",t[t.UINT=2]="UINT";}(l$1||(l$1={})),function(t){t[t.NEAREST=0]="NEAREST",t[t.LINEAR=1]="LINEAR";}(I$1||(I$1={})),function(t){t[t.CLAMP=33071]="CLAMP",t[t.REPEAT=10497]="REPEAT",t[t.MIRRORED_REPEAT=33648]="MIRRORED_REPEAT";}(A$1||(A$1={})),function(t){t[t.OFF=0]="OFF",t[t.POW2=1]="POW2",t[t.ON=2]="ON",t[t.ON_MANUAL=3]="ON_MANUAL";}(s$2||(s$2={})),function(t){t[t.NPM=0]="NPM",t[t.UNPACK=1]="UNPACK",t[t.PMA=2]="PMA",t[t.NO_PREMULTIPLIED_ALPHA=0]="NO_PREMULTIPLIED_ALPHA",t[t.PREMULTIPLY_ON_UPLOAD=1]="PREMULTIPLY_ON_UPLOAD",t[t.PREMULTIPLY_ALPHA=2]="PREMULTIPLY_ALPHA",t[t.PREMULTIPLIED_ALPHA=2]="PREMULTIPLIED_ALPHA";}(O$1||(O$1={})),function(t){t[t.NO=0]="NO",t[t.YES=1]="YES",t[t.AUTO=2]="AUTO",t[t.BLEND=0]="BLEND",t[t.CLEAR=1]="CLEAR",t[t.BLIT=2]="BLIT";}(a$1||(a$1={})),function(t){t[t.AUTO=0]="AUTO",t[t.MANUAL=1]="MANUAL";}(L$1||(L$1={})),function(t){t.LOW="lowp",t.MEDIUM="mediump",t.HIGH="highp";}(P$1||(P$1={})),function(t){t[t.NONE=0]="NONE",t[t.SCISSOR=1]="SCISSOR",t[t.STENCIL=2]="STENCIL",t[t.SPRITE=3]="SPRITE",t[t.COLOR=4]="COLOR";}(U$1||(U$1={})),function(t){t[t.RED=1]="RED",t[t.GREEN=2]="GREEN",t[t.BLUE=4]="BLUE",t[t.ALPHA=8]="ALPHA";}(S$1||(S$1={})),function(t){t[t.NONE=0]="NONE",t[t.LOW=2]="LOW",t[t.MEDIUM=4]="MEDIUM",t[t.HIGH=8]="HIGH";}(h$1||(h$1={})),function(t){t[t.ELEMENT_ARRAY_BUFFER=34963]="ELEMENT_ARRAY_BUFFER",t[t.ARRAY_BUFFER=34962]="ARRAY_BUFFER",t[t.UNIFORM_BUFFER=35345]="UNIFORM_BUFFER";}(p$1||(p$1={}));var d$2=function(t){function r(r,i,E,n,_){void 0===i&&(i=8),void 0===E&&(E=4),void 0===n&&(n=V$2.FILTER_RESOLUTION),void 0===_&&(_=5);var o=this,T=function(t,e){var r,i=Math.ceil(t/2),E="\n    attribute vec2 aVertexPosition;\n\n    uniform mat3 projectionMatrix;\n\n    uniform float strength;\n\n    varying vec2 vBlurTexCoords[%size%];\n\n    uniform vec4 inputSize;\n    uniform vec4 outputFrame;\n\n    vec4 filterVertexPosition( void )\n    {\n        vec2 position = aVertexPosition * max(outputFrame.zw, vec2(0.)) + outputFrame.xy;\n\n        return vec4((projectionMatrix * vec3(position, 1.0)).xy, 0.0, 1.0);\n    }\n\n    vec2 filterTextureCoord( void )\n    {\n        return aVertexPosition * (outputFrame.zw * inputSize.zw);\n    }\n\n    void main(void)\n    {\n        gl_Position = filterVertexPosition();\n\n        vec2 textureCoord = filterTextureCoord();\n        %blur%\n    }",n="";r=e?"vBlurTexCoords[%index%] =  textureCoord + vec2(%sampleIndex% * strength, 0.0);":"vBlurTexCoords[%index%] =  textureCoord + vec2(0.0, %sampleIndex% * strength);";for(var _=0;_<t;_++){var o=r.replace("%index%",_.toString());n+=o=o.replace("%sampleIndex%",_-(i-1)+".0"),n+="\n";}return (E=E.replace("%blur%",n)).replace("%size%",t.toString())}(_,r),N=function(t){for(var e,r=c$1[t],i=r.length,E=f,n="",_=0;_<t;_++){var o="gl_FragColor += texture2D(uSampler, vBlurTexCoords[%index%]) * %value%;".replace("%index%",_.toString());e=_,_>=i&&(e=t-_-1),n+=o=o.replace("%value%",r[e].toString()),n+="\n";}return (E=E.replace("%blur%",n)).replace("%size%",t.toString())}(_);return (o=t.call(this,T,N)||this).horizontal=r,o.resolution=n,o._quality=0,o.quality=E,o.blur=i,o}return i(r,t),r.prototype.apply=function(t,e,r,i){if(r?this.horizontal?this.uniforms.strength=1/r.width*(r.width/e.width):this.uniforms.strength=1/r.height*(r.height/e.height):this.horizontal?this.uniforms.strength=1/t.renderer.width*(t.renderer.width/e.width):this.uniforms.strength=1/t.renderer.height*(t.renderer.height/e.height),this.uniforms.strength*=this.strength,this.uniforms.strength/=this.passes,1===this.passes)t.applyFilter(this,e,r,i);else {var E=t.getFilterTexture(),n=t.renderer,_=e,o=E;this.state.blend=!1,t.applyFilter(this,_,o,a$1.CLEAR);for(var T=1;T<this.passes-1;T++){t.bindAndClear(_,a$1.BLIT),this.uniforms.uSampler=o;var N=o;o=_,_=N,n.shader.bind(this),n.geometry.draw(5);}this.state.blend=!0,t.applyFilter(this,o,r,i),t.returnFilterTexture(E);}},Object.defineProperty(r.prototype,"blur",{get:function(){return this.strength},set:function(t){this.padding=1+2*Math.abs(t),this.strength=t;},enumerable:!1,configurable:!0}),Object.defineProperty(r.prototype,"quality",{get:function(){return this._quality},set:function(t){this._quality=t,this.passes=t;},enumerable:!1,configurable:!0}),r}(_t);(function(t){function r(r,i,E,n){void 0===r&&(r=8),void 0===i&&(i=4),void 0===E&&(E=V$2.FILTER_RESOLUTION),void 0===n&&(n=5);var _=t.call(this)||this;return _.blurXFilter=new d$2(!0,r,i,E,n),_.blurYFilter=new d$2(!1,r,i,E,n),_.resolution=E,_.quality=i,_.blur=r,_.repeatEdgePixels=!1,_}return i(r,t),r.prototype.apply=function(t,e,r,i){var E=Math.abs(this.blurXFilter.strength),n=Math.abs(this.blurYFilter.strength);if(E&&n){var _=t.getFilterTexture();this.blurXFilter.apply(t,e,_,a$1.CLEAR),this.blurYFilter.apply(t,_,r,i),t.returnFilterTexture(_);}else n?this.blurYFilter.apply(t,e,r,i):this.blurXFilter.apply(t,e,r,i);},r.prototype.updatePadding=function(){this._repeatEdgePixels?this.padding=0:this.padding=2*Math.max(Math.abs(this.blurXFilter.strength),Math.abs(this.blurYFilter.strength));},Object.defineProperty(r.prototype,"blur",{get:function(){return this.blurXFilter.blur},set:function(t){this.blurXFilter.blur=this.blurYFilter.blur=t,this.updatePadding();},enumerable:!1,configurable:!0}),Object.defineProperty(r.prototype,"quality",{get:function(){return this.blurXFilter.quality},set:function(t){this.blurXFilter.quality=this.blurYFilter.quality=t;},enumerable:!1,configurable:!0}),Object.defineProperty(r.prototype,"blurX",{get:function(){return this.blurXFilter.blur},set:function(t){this.blurXFilter.blur=t,this.updatePadding();},enumerable:!1,configurable:!0}),Object.defineProperty(r.prototype,"blurY",{get:function(){return this.blurYFilter.blur},set:function(t){this.blurYFilter.blur=t,this.updatePadding();},enumerable:!1,configurable:!0}),Object.defineProperty(r.prototype,"blendMode",{get:function(){return this.blurYFilter.blendMode},set:function(t){this.blurYFilter.blendMode=t;},enumerable:!1,configurable:!0}),Object.defineProperty(r.prototype,"repeatEdgePixels",{get:function(){return this._repeatEdgePixels},set:function(t){this._repeatEdgePixels=t,this.updatePadding();},enumerable:!1,configurable:!0}),r})(_t);

  /*!
   * @pixi/filter-color-matrix - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/filter-color-matrix is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  var o$3=function(t,r){return o$3=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r;}||function(t,r){for(var o in r)r.hasOwnProperty(o)&&(t[o]=r[o]);},o$3(t,r)};var n$1=function(r){function n(){var o=this,n={m:new Float32Array([1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1,0]),uAlpha:1};return (o=r.call(this,ir,"varying vec2 vTextureCoord;\nuniform sampler2D uSampler;\nuniform float m[20];\nuniform float uAlpha;\n\nvoid main(void)\n{\n    vec4 c = texture2D(uSampler, vTextureCoord);\n\n    if (uAlpha == 0.0) {\n        gl_FragColor = c;\n        return;\n    }\n\n    // Un-premultiply alpha before applying the color matrix. See issue #3539.\n    if (c.a > 0.0) {\n      c.rgb /= c.a;\n    }\n\n    vec4 result;\n\n    result.r = (m[0] * c.r);\n        result.r += (m[1] * c.g);\n        result.r += (m[2] * c.b);\n        result.r += (m[3] * c.a);\n        result.r += m[4];\n\n    result.g = (m[5] * c.r);\n        result.g += (m[6] * c.g);\n        result.g += (m[7] * c.b);\n        result.g += (m[8] * c.a);\n        result.g += m[9];\n\n    result.b = (m[10] * c.r);\n       result.b += (m[11] * c.g);\n       result.b += (m[12] * c.b);\n       result.b += (m[13] * c.a);\n       result.b += m[14];\n\n    result.a = (m[15] * c.r);\n       result.a += (m[16] * c.g);\n       result.a += (m[17] * c.b);\n       result.a += (m[18] * c.a);\n       result.a += m[19];\n\n    vec3 rgb = mix(c.rgb, result.rgb, uAlpha);\n\n    // Premultiply alpha again.\n    rgb *= result.a;\n\n    gl_FragColor = vec4(rgb, result.a);\n}\n",n)||this).alpha=1,o}return function(t,r){function n(){this.constructor=t;}o$3(t,r),t.prototype=null===r?Object.create(r):(n.prototype=r.prototype,new n);}(n,r),n.prototype._loadMatrix=function(t,r){void 0===r&&(r=!1);var o=t;r&&(this._multiply(o,this.uniforms.m,t),o=this._colorMatrix(o)),this.uniforms.m=o;},n.prototype._multiply=function(t,r,o){return t[0]=r[0]*o[0]+r[1]*o[5]+r[2]*o[10]+r[3]*o[15],t[1]=r[0]*o[1]+r[1]*o[6]+r[2]*o[11]+r[3]*o[16],t[2]=r[0]*o[2]+r[1]*o[7]+r[2]*o[12]+r[3]*o[17],t[3]=r[0]*o[3]+r[1]*o[8]+r[2]*o[13]+r[3]*o[18],t[4]=r[0]*o[4]+r[1]*o[9]+r[2]*o[14]+r[3]*o[19]+r[4],t[5]=r[5]*o[0]+r[6]*o[5]+r[7]*o[10]+r[8]*o[15],t[6]=r[5]*o[1]+r[6]*o[6]+r[7]*o[11]+r[8]*o[16],t[7]=r[5]*o[2]+r[6]*o[7]+r[7]*o[12]+r[8]*o[17],t[8]=r[5]*o[3]+r[6]*o[8]+r[7]*o[13]+r[8]*o[18],t[9]=r[5]*o[4]+r[6]*o[9]+r[7]*o[14]+r[8]*o[19]+r[9],t[10]=r[10]*o[0]+r[11]*o[5]+r[12]*o[10]+r[13]*o[15],t[11]=r[10]*o[1]+r[11]*o[6]+r[12]*o[11]+r[13]*o[16],t[12]=r[10]*o[2]+r[11]*o[7]+r[12]*o[12]+r[13]*o[17],t[13]=r[10]*o[3]+r[11]*o[8]+r[12]*o[13]+r[13]*o[18],t[14]=r[10]*o[4]+r[11]*o[9]+r[12]*o[14]+r[13]*o[19]+r[14],t[15]=r[15]*o[0]+r[16]*o[5]+r[17]*o[10]+r[18]*o[15],t[16]=r[15]*o[1]+r[16]*o[6]+r[17]*o[11]+r[18]*o[16],t[17]=r[15]*o[2]+r[16]*o[7]+r[17]*o[12]+r[18]*o[17],t[18]=r[15]*o[3]+r[16]*o[8]+r[17]*o[13]+r[18]*o[18],t[19]=r[15]*o[4]+r[16]*o[9]+r[17]*o[14]+r[18]*o[19]+r[19],t},n.prototype._colorMatrix=function(t){var r=new Float32Array(t);return r[4]/=255,r[9]/=255,r[14]/=255,r[19]/=255,r},n.prototype.brightness=function(t,r){var o=[t,0,0,0,0,0,t,0,0,0,0,0,t,0,0,0,0,0,1,0];this._loadMatrix(o,r);},n.prototype.tint=function(t,r){var o=[(t>>16&255)/255,0,0,0,0,0,(t>>8&255)/255,0,0,0,0,0,(255&t)/255,0,0,0,0,0,1,0];this._loadMatrix(o,r);},n.prototype.greyscale=function(t,r){var o=[t,t,t,0,0,t,t,t,0,0,t,t,t,0,0,0,0,0,1,0];this._loadMatrix(o,r);},n.prototype.blackAndWhite=function(t){this._loadMatrix([.3,.6,.1,0,0,.3,.6,.1,0,0,.3,.6,.1,0,0,0,0,0,1,0],t);},n.prototype.hue=function(t,r){t=(t||0)/180*Math.PI;var o=Math.cos(t),n=Math.sin(t),e=1/3,i=(0, Math.sqrt)(e),a=[o+(1-o)*e,e*(1-o)-i*n,e*(1-o)+i*n,0,0,e*(1-o)+i*n,o+e*(1-o),e*(1-o)-i*n,0,0,e*(1-o)-i*n,e*(1-o)+i*n,o+e*(1-o),0,0,0,0,0,1,0];this._loadMatrix(a,r);},n.prototype.contrast=function(t,r){var o=(t||0)+1,n=-.5*(o-1),e=[o,0,0,0,n,0,o,0,0,n,0,0,o,0,n,0,0,0,1,0];this._loadMatrix(e,r);},n.prototype.saturate=function(t,r){void 0===t&&(t=0);var o=2*t/3+1,n=-.5*(o-1),e=[o,n,n,0,0,n,o,n,0,0,n,n,o,0,0,0,0,0,1,0];this._loadMatrix(e,r);},n.prototype.desaturate=function(){this.saturate(-1);},n.prototype.negative=function(t){this._loadMatrix([-1,0,0,1,0,0,-1,0,1,0,0,0,-1,1,0,0,0,0,1,0],t);},n.prototype.sepia=function(t){this._loadMatrix([.393,.7689999,.18899999,0,0,.349,.6859999,.16799999,0,0,.272,.5339999,.13099999,0,0,0,0,0,1,0],t);},n.prototype.technicolor=function(t){this._loadMatrix([1.9125277891456083,-.8545344976951645,-.09155508482755585,0,11.793603434377337,-.3087833385928097,1.7658908555458428,-.10601743074722245,0,-70.35205161461398,-.231103377548616,-.7501899197440212,1.847597816108189,0,30.950940869491138,0,0,0,1,0],t);},n.prototype.polaroid=function(t){this._loadMatrix([1.438,-.062,-.062,0,0,-.122,1.378,-.122,0,0,-.016,-.016,1.483,0,0,0,0,0,1,0],t);},n.prototype.toBGR=function(t){this._loadMatrix([0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,1,0],t);},n.prototype.kodachrome=function(t){this._loadMatrix([1.1285582396593525,-.3967382283601348,-.03992559172921793,0,63.72958762196502,-.16404339962244616,1.0835251566291304,-.05498805115633132,0,24.732407896706203,-.16786010706155763,-.5603416277695248,1.6014850761964943,0,35.62982807460946,0,0,0,1,0],t);},n.prototype.browni=function(t){this._loadMatrix([.5997023498159715,.34553243048391263,-.2708298674538042,0,47.43192855600873,-.037703249837783157,.8609577587992641,.15059552388459913,0,-36.96841498319127,.24113635128153335,-.07441037908422492,.44972182064877153,0,-7.562075277591283,0,0,0,1,0],t);},n.prototype.vintage=function(t){this._loadMatrix([.6279345635605994,.3202183420819367,-.03965408211312453,0,9.651285835294123,.02578397704808868,.6441188644374771,.03259127616149294,0,7.462829176470591,.0466055556782719,-.0851232987247891,.5241648018700465,0,5.159190588235296,0,0,0,1,0],t);},n.prototype.colorTone=function(t,r,o,n,e){var i=((o=o||16770432)>>16&255)/255,a=(o>>8&255)/255,u=(255&o)/255,l=((n=n||3375104)>>16&255)/255,p=(n>>8&255)/255,c=(255&n)/255,s=[.3,.59,.11,0,0,i,a,u,t=t||.2,0,l,p,c,r=r||.15,0,i-l,a-p,u-c,0,0];this._loadMatrix(s,e);},n.prototype.night=function(t,r){var o=[-2*(t=t||.1),-t,0,0,0,-t,0,t,0,0,0,t,2*t,0,0,0,0,0,1,0];this._loadMatrix(o,r);},n.prototype.predator=function(t,r){var o=[11.224130630493164*t,-4.794486999511719*t,-2.8746118545532227*t,0*t,.40342438220977783*t,-3.6330697536468506*t,9.193157196044922*t,-2.951810836791992*t,0*t,-1.316135048866272*t,-3.2184197902679443*t,-4.2375030517578125*t,7.476448059082031*t,0*t,.8044459223747253*t,0,0,0,1,0];this._loadMatrix(o,r);},n.prototype.lsd=function(t){this._loadMatrix([2,-.4,.5,0,0,-.5,2,-.4,0,0,-.4,-.5,3,0,0,0,0,0,1,0],t);},n.prototype.reset=function(){this._loadMatrix([1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1,0],!1);},Object.defineProperty(n.prototype,"matrix",{get:function(){return this.uniforms.m},set:function(t){this.uniforms.m=t;},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"alpha",{get:function(){return this.uniforms.uAlpha},set:function(t){this.uniforms.uAlpha=t;},enumerable:!1,configurable:!0}),n}(_t);n$1.prototype.grayscale=n$1.prototype.greyscale;

  /*!
   * @pixi/filter-displacement - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/filter-displacement is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  var e$1=function(t,r){return e$1=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r;}||function(t,r){for(var n in r)r.hasOwnProperty(n)&&(t[n]=r[n]);},e$1(t,r)};(function(t){function i(e,i){var o=this,a=new p$7;return e.renderable=!1,(o=t.call(this,"attribute vec2 aVertexPosition;\n\nuniform mat3 projectionMatrix;\nuniform mat3 filterMatrix;\n\nvarying vec2 vTextureCoord;\nvarying vec2 vFilterCoord;\n\nuniform vec4 inputSize;\nuniform vec4 outputFrame;\n\nvec4 filterVertexPosition( void )\n{\n    vec2 position = aVertexPosition * max(outputFrame.zw, vec2(0.)) + outputFrame.xy;\n\n    return vec4((projectionMatrix * vec3(position, 1.0)).xy, 0.0, 1.0);\n}\n\nvec2 filterTextureCoord( void )\n{\n    return aVertexPosition * (outputFrame.zw * inputSize.zw);\n}\n\nvoid main(void)\n{\n\tgl_Position = filterVertexPosition();\n\tvTextureCoord = filterTextureCoord();\n\tvFilterCoord = ( filterMatrix * vec3( vTextureCoord, 1.0)  ).xy;\n}\n","varying vec2 vFilterCoord;\nvarying vec2 vTextureCoord;\n\nuniform vec2 scale;\nuniform mat2 rotation;\nuniform sampler2D uSampler;\nuniform sampler2D mapSampler;\n\nuniform highp vec4 inputSize;\nuniform vec4 inputClamp;\n\nvoid main(void)\n{\n  vec4 map =  texture2D(mapSampler, vFilterCoord);\n\n  map -= 0.5;\n  map.xy = scale * inputSize.zw * (rotation * map.xy);\n\n  gl_FragColor = texture2D(uSampler, clamp(vec2(vTextureCoord.x + map.x, vTextureCoord.y + map.y), inputClamp.xy, inputClamp.zw));\n}\n",{mapSampler:e._texture,filterMatrix:a,scale:{x:1,y:1},rotation:new Float32Array([1,0,0,1])})||this).maskSprite=e,o.maskMatrix=a,null==i&&(i=20),o.scale=new o$9(i,i),o}return function(t,r){function n(){this.constructor=t;}e$1(t,r),t.prototype=null===r?Object.create(r):(n.prototype=r.prototype,new n);}(i,t),i.prototype.apply=function(t,r,n,e){this.uniforms.filterMatrix=t.calculateSpriteMatrix(this.maskMatrix,this.maskSprite),this.uniforms.scale.x=this.scale.x,this.uniforms.scale.y=this.scale.y;var i=this.maskSprite.worldTransform,o=Math.sqrt(i.a*i.a+i.b*i.b),a=Math.sqrt(i.c*i.c+i.d*i.d);0!==o&&0!==a&&(this.uniforms.rotation[0]=i.a/o,this.uniforms.rotation[1]=i.b/o,this.uniforms.rotation[2]=i.c/a,this.uniforms.rotation[3]=i.d/a),t.applyFilter(this,r,n,e);},Object.defineProperty(i.prototype,"map",{get:function(){return this.uniforms.mapSampler},set:function(t){this.uniforms.mapSampler=t;},enumerable:!1,configurable:!0}),i})(_t);

  /*!
   * @pixi/filter-fxaa - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/filter-fxaa is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  var e=function(n,r){return e=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(n,e){n.__proto__=e;}||function(n,e){for(var r in e)e.hasOwnProperty(r)&&(n[r]=e[r]);},e(n,r)};(function(n){function r(){return n.call(this,"\nattribute vec2 aVertexPosition;\n\nuniform mat3 projectionMatrix;\n\nvarying vec2 v_rgbNW;\nvarying vec2 v_rgbNE;\nvarying vec2 v_rgbSW;\nvarying vec2 v_rgbSE;\nvarying vec2 v_rgbM;\n\nvarying vec2 vFragCoord;\n\nuniform vec4 inputSize;\nuniform vec4 outputFrame;\n\nvec4 filterVertexPosition( void )\n{\n    vec2 position = aVertexPosition * max(outputFrame.zw, vec2(0.)) + outputFrame.xy;\n\n    return vec4((projectionMatrix * vec3(position, 1.0)).xy, 0.0, 1.0);\n}\n\nvoid texcoords(vec2 fragCoord, vec2 inverseVP,\n               out vec2 v_rgbNW, out vec2 v_rgbNE,\n               out vec2 v_rgbSW, out vec2 v_rgbSE,\n               out vec2 v_rgbM) {\n    v_rgbNW = (fragCoord + vec2(-1.0, -1.0)) * inverseVP;\n    v_rgbNE = (fragCoord + vec2(1.0, -1.0)) * inverseVP;\n    v_rgbSW = (fragCoord + vec2(-1.0, 1.0)) * inverseVP;\n    v_rgbSE = (fragCoord + vec2(1.0, 1.0)) * inverseVP;\n    v_rgbM = vec2(fragCoord * inverseVP);\n}\n\nvoid main(void) {\n\n   gl_Position = filterVertexPosition();\n\n   vFragCoord = aVertexPosition * outputFrame.zw;\n\n   texcoords(vFragCoord, inputSize.zw, v_rgbNW, v_rgbNE, v_rgbSW, v_rgbSE, v_rgbM);\n}\n",'varying vec2 v_rgbNW;\nvarying vec2 v_rgbNE;\nvarying vec2 v_rgbSW;\nvarying vec2 v_rgbSE;\nvarying vec2 v_rgbM;\n\nvarying vec2 vFragCoord;\nuniform sampler2D uSampler;\nuniform highp vec4 inputSize;\n\n\n/**\n Basic FXAA implementation based on the code on geeks3d.com with the\n modification that the texture2DLod stuff was removed since it\'s\n unsupported by WebGL.\n\n --\n\n From:\n https://github.com/mitsuhiko/webgl-meincraft\n\n Copyright (c) 2011 by Armin Ronacher.\n\n Some rights reserved.\n\n Redistribution and use in source and binary forms, with or without\n modification, are permitted provided that the following conditions are\n met:\n\n * Redistributions of source code must retain the above copyright\n notice, this list of conditions and the following disclaimer.\n\n * Redistributions in binary form must reproduce the above\n copyright notice, this list of conditions and the following\n disclaimer in the documentation and/or other materials provided\n with the distribution.\n\n * The names of the contributors may not be used to endorse or\n promote products derived from this software without specific\n prior written permission.\n\n THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS\n "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT\n LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR\n A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT\n OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,\n SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT\n LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,\n DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY\n THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT\n (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE\n OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.\n */\n\n#ifndef FXAA_REDUCE_MIN\n#define FXAA_REDUCE_MIN   (1.0/ 128.0)\n#endif\n#ifndef FXAA_REDUCE_MUL\n#define FXAA_REDUCE_MUL   (1.0 / 8.0)\n#endif\n#ifndef FXAA_SPAN_MAX\n#define FXAA_SPAN_MAX     8.0\n#endif\n\n//optimized version for mobile, where dependent\n//texture reads can be a bottleneck\nvec4 fxaa(sampler2D tex, vec2 fragCoord, vec2 inverseVP,\n          vec2 v_rgbNW, vec2 v_rgbNE,\n          vec2 v_rgbSW, vec2 v_rgbSE,\n          vec2 v_rgbM) {\n    vec4 color;\n    vec3 rgbNW = texture2D(tex, v_rgbNW).xyz;\n    vec3 rgbNE = texture2D(tex, v_rgbNE).xyz;\n    vec3 rgbSW = texture2D(tex, v_rgbSW).xyz;\n    vec3 rgbSE = texture2D(tex, v_rgbSE).xyz;\n    vec4 texColor = texture2D(tex, v_rgbM);\n    vec3 rgbM  = texColor.xyz;\n    vec3 luma = vec3(0.299, 0.587, 0.114);\n    float lumaNW = dot(rgbNW, luma);\n    float lumaNE = dot(rgbNE, luma);\n    float lumaSW = dot(rgbSW, luma);\n    float lumaSE = dot(rgbSE, luma);\n    float lumaM  = dot(rgbM,  luma);\n    float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));\n    float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));\n\n    mediump vec2 dir;\n    dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));\n    dir.y =  ((lumaNW + lumaSW) - (lumaNE + lumaSE));\n\n    float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) *\n                          (0.25 * FXAA_REDUCE_MUL), FXAA_REDUCE_MIN);\n\n    float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);\n    dir = min(vec2(FXAA_SPAN_MAX, FXAA_SPAN_MAX),\n              max(vec2(-FXAA_SPAN_MAX, -FXAA_SPAN_MAX),\n                  dir * rcpDirMin)) * inverseVP;\n\n    vec3 rgbA = 0.5 * (\n                       texture2D(tex, fragCoord * inverseVP + dir * (1.0 / 3.0 - 0.5)).xyz +\n                       texture2D(tex, fragCoord * inverseVP + dir * (2.0 / 3.0 - 0.5)).xyz);\n    vec3 rgbB = rgbA * 0.5 + 0.25 * (\n                                     texture2D(tex, fragCoord * inverseVP + dir * -0.5).xyz +\n                                     texture2D(tex, fragCoord * inverseVP + dir * 0.5).xyz);\n\n    float lumaB = dot(rgbB, luma);\n    if ((lumaB < lumaMin) || (lumaB > lumaMax))\n        color = vec4(rgbA, texColor.a);\n    else\n        color = vec4(rgbB, texColor.a);\n    return color;\n}\n\nvoid main() {\n\n      vec4 color;\n\n      color = fxaa(uSampler, vFragCoord, inputSize.zw, v_rgbNW, v_rgbNE, v_rgbSW, v_rgbSE, v_rgbM);\n\n      gl_FragColor = color;\n}\n')||this}return function(n,r){function o(){this.constructor=n;}e(n,r),n.prototype=null===r?Object.create(r):(o.prototype=r.prototype,new o);}(r,n),r})(_t);

  /*!
   * @pixi/filter-noise - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/filter-noise is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  var r=function(o,n){return r=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(o,n){o.__proto__=n;}||function(o,n){for(var r in n)n.hasOwnProperty(r)&&(o[r]=n[r]);},r(o,n)};(function(n){function e(r,e){void 0===r&&(r=.5),void 0===e&&(e=Math.random());var t=n.call(this,ir,"precision highp float;\n\nvarying vec2 vTextureCoord;\nvarying vec4 vColor;\n\nuniform float uNoise;\nuniform float uSeed;\nuniform sampler2D uSampler;\n\nfloat rand(vec2 co)\n{\n    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);\n}\n\nvoid main()\n{\n    vec4 color = texture2D(uSampler, vTextureCoord);\n    float randomValue = rand(gl_FragCoord.xy * uSeed);\n    float diff = (randomValue - 0.5) * uNoise;\n\n    // Un-premultiply alpha before applying the color matrix. See issue #3539.\n    if (color.a > 0.0) {\n        color.rgb /= color.a;\n    }\n\n    color.r += diff;\n    color.g += diff;\n    color.b += diff;\n\n    // Premultiply alpha again.\n    color.rgb *= color.a;\n\n    gl_FragColor = color;\n}\n",{uNoise:0,uSeed:0})||this;return t.noise=r,t.seed=e,t}return function(o,n){function e(){this.constructor=o;}r(o,n),o.prototype=null===n?Object.create(n):(e.prototype=n.prototype,new e);}(e,n),Object.defineProperty(e.prototype,"noise",{get:function(){return this.uniforms.uNoise},set:function(o){this.uniforms.uNoise=o;},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"seed",{get:function(){return this.uniforms.uSeed},set:function(o){this.uniforms.uSeed=o;},enumerable:!1,configurable:!0}),e})(_t);

  /*!
   * @pixi/mixin-cache-as-bitmap - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/mixin-cache-as-bitmap is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  var o$2,h,E,c,T,l,N,R,A,I,d$1,p,u,L,O,D,U,C,P,m;!function(t){t[t.WEBGL_LEGACY=0]="WEBGL_LEGACY",t[t.WEBGL=1]="WEBGL",t[t.WEBGL2=2]="WEBGL2";}(o$2||(o$2={})),function(t){t[t.UNKNOWN=0]="UNKNOWN",t[t.WEBGL=1]="WEBGL",t[t.CANVAS=2]="CANVAS";}(h||(h={})),function(t){t[t.COLOR=16384]="COLOR",t[t.DEPTH=256]="DEPTH",t[t.STENCIL=1024]="STENCIL";}(E||(E={})),function(t){t[t.NORMAL=0]="NORMAL",t[t.ADD=1]="ADD",t[t.MULTIPLY=2]="MULTIPLY",t[t.SCREEN=3]="SCREEN",t[t.OVERLAY=4]="OVERLAY",t[t.DARKEN=5]="DARKEN",t[t.LIGHTEN=6]="LIGHTEN",t[t.COLOR_DODGE=7]="COLOR_DODGE",t[t.COLOR_BURN=8]="COLOR_BURN",t[t.HARD_LIGHT=9]="HARD_LIGHT",t[t.SOFT_LIGHT=10]="SOFT_LIGHT",t[t.DIFFERENCE=11]="DIFFERENCE",t[t.EXCLUSION=12]="EXCLUSION",t[t.HUE=13]="HUE",t[t.SATURATION=14]="SATURATION",t[t.COLOR=15]="COLOR",t[t.LUMINOSITY=16]="LUMINOSITY",t[t.NORMAL_NPM=17]="NORMAL_NPM",t[t.ADD_NPM=18]="ADD_NPM",t[t.SCREEN_NPM=19]="SCREEN_NPM",t[t.NONE=20]="NONE",t[t.SRC_OVER=0]="SRC_OVER",t[t.SRC_IN=21]="SRC_IN",t[t.SRC_OUT=22]="SRC_OUT",t[t.SRC_ATOP=23]="SRC_ATOP",t[t.DST_OVER=24]="DST_OVER",t[t.DST_IN=25]="DST_IN",t[t.DST_OUT=26]="DST_OUT",t[t.DST_ATOP=27]="DST_ATOP",t[t.ERASE=26]="ERASE",t[t.SUBTRACT=28]="SUBTRACT",t[t.XOR=29]="XOR";}(c||(c={})),function(t){t[t.POINTS=0]="POINTS",t[t.LINES=1]="LINES",t[t.LINE_LOOP=2]="LINE_LOOP",t[t.LINE_STRIP=3]="LINE_STRIP",t[t.TRIANGLES=4]="TRIANGLES",t[t.TRIANGLE_STRIP=5]="TRIANGLE_STRIP",t[t.TRIANGLE_FAN=6]="TRIANGLE_FAN";}(T||(T={})),function(t){t[t.RGBA=6408]="RGBA",t[t.RGB=6407]="RGB",t[t.RG=33319]="RG",t[t.RED=6403]="RED",t[t.RGBA_INTEGER=36249]="RGBA_INTEGER",t[t.RGB_INTEGER=36248]="RGB_INTEGER",t[t.RG_INTEGER=33320]="RG_INTEGER",t[t.RED_INTEGER=36244]="RED_INTEGER",t[t.ALPHA=6406]="ALPHA",t[t.LUMINANCE=6409]="LUMINANCE",t[t.LUMINANCE_ALPHA=6410]="LUMINANCE_ALPHA",t[t.DEPTH_COMPONENT=6402]="DEPTH_COMPONENT",t[t.DEPTH_STENCIL=34041]="DEPTH_STENCIL";}(l||(l={})),function(t){t[t.TEXTURE_2D=3553]="TEXTURE_2D",t[t.TEXTURE_CUBE_MAP=34067]="TEXTURE_CUBE_MAP",t[t.TEXTURE_2D_ARRAY=35866]="TEXTURE_2D_ARRAY",t[t.TEXTURE_CUBE_MAP_POSITIVE_X=34069]="TEXTURE_CUBE_MAP_POSITIVE_X",t[t.TEXTURE_CUBE_MAP_NEGATIVE_X=34070]="TEXTURE_CUBE_MAP_NEGATIVE_X",t[t.TEXTURE_CUBE_MAP_POSITIVE_Y=34071]="TEXTURE_CUBE_MAP_POSITIVE_Y",t[t.TEXTURE_CUBE_MAP_NEGATIVE_Y=34072]="TEXTURE_CUBE_MAP_NEGATIVE_Y",t[t.TEXTURE_CUBE_MAP_POSITIVE_Z=34073]="TEXTURE_CUBE_MAP_POSITIVE_Z",t[t.TEXTURE_CUBE_MAP_NEGATIVE_Z=34074]="TEXTURE_CUBE_MAP_NEGATIVE_Z";}(N||(N={})),function(t){t[t.UNSIGNED_BYTE=5121]="UNSIGNED_BYTE",t[t.UNSIGNED_SHORT=5123]="UNSIGNED_SHORT",t[t.UNSIGNED_SHORT_5_6_5=33635]="UNSIGNED_SHORT_5_6_5",t[t.UNSIGNED_SHORT_4_4_4_4=32819]="UNSIGNED_SHORT_4_4_4_4",t[t.UNSIGNED_SHORT_5_5_5_1=32820]="UNSIGNED_SHORT_5_5_5_1",t[t.UNSIGNED_INT=5125]="UNSIGNED_INT",t[t.UNSIGNED_INT_10F_11F_11F_REV=35899]="UNSIGNED_INT_10F_11F_11F_REV",t[t.UNSIGNED_INT_2_10_10_10_REV=33640]="UNSIGNED_INT_2_10_10_10_REV",t[t.UNSIGNED_INT_24_8=34042]="UNSIGNED_INT_24_8",t[t.UNSIGNED_INT_5_9_9_9_REV=35902]="UNSIGNED_INT_5_9_9_9_REV",t[t.BYTE=5120]="BYTE",t[t.SHORT=5122]="SHORT",t[t.INT=5124]="INT",t[t.FLOAT=5126]="FLOAT",t[t.FLOAT_32_UNSIGNED_INT_24_8_REV=36269]="FLOAT_32_UNSIGNED_INT_24_8_REV",t[t.HALF_FLOAT=36193]="HALF_FLOAT";}(R||(R={})),function(t){t[t.FLOAT=0]="FLOAT",t[t.INT=1]="INT",t[t.UINT=2]="UINT";}(A||(A={})),function(t){t[t.NEAREST=0]="NEAREST",t[t.LINEAR=1]="LINEAR";}(I||(I={})),function(t){t[t.CLAMP=33071]="CLAMP",t[t.REPEAT=10497]="REPEAT",t[t.MIRRORED_REPEAT=33648]="MIRRORED_REPEAT";}(d$1||(d$1={})),function(t){t[t.OFF=0]="OFF",t[t.POW2=1]="POW2",t[t.ON=2]="ON",t[t.ON_MANUAL=3]="ON_MANUAL";}(p||(p={})),function(t){t[t.NPM=0]="NPM",t[t.UNPACK=1]="UNPACK",t[t.PMA=2]="PMA",t[t.NO_PREMULTIPLIED_ALPHA=0]="NO_PREMULTIPLIED_ALPHA",t[t.PREMULTIPLY_ON_UPLOAD=1]="PREMULTIPLY_ON_UPLOAD",t[t.PREMULTIPLY_ALPHA=2]="PREMULTIPLY_ALPHA",t[t.PREMULTIPLIED_ALPHA=2]="PREMULTIPLIED_ALPHA";}(u||(u={})),function(t){t[t.NO=0]="NO",t[t.YES=1]="YES",t[t.AUTO=2]="AUTO",t[t.BLEND=0]="BLEND",t[t.CLEAR=1]="CLEAR",t[t.BLIT=2]="BLIT";}(L||(L={})),function(t){t[t.AUTO=0]="AUTO",t[t.MANUAL=1]="MANUAL";}(O||(O={})),function(t){t.LOW="lowp",t.MEDIUM="mediump",t.HIGH="highp";}(D||(D={})),function(t){t[t.NONE=0]="NONE",t[t.SCISSOR=1]="SCISSOR",t[t.STENCIL=2]="STENCIL",t[t.SPRITE=3]="SPRITE",t[t.COLOR=4]="COLOR";}(U||(U={})),function(t){t[t.RED=1]="RED",t[t.GREEN=2]="GREEN",t[t.BLUE=4]="BLUE",t[t.ALPHA=8]="ALPHA";}(C||(C={})),function(t){t[t.NONE=0]="NONE",t[t.LOW=2]="LOW",t[t.MEDIUM=4]="MEDIUM",t[t.HIGH=8]="HIGH";}(P||(P={})),function(t){t[t.ELEMENT_ARRAY_BUFFER=34963]="ELEMENT_ARRAY_BUFFER",t[t.ARRAY_BUFFER=34962]="ARRAY_BUFFER",t[t.UNIFORM_BUFFER=35345]="UNIFORM_BUFFER";}(m||(m={}));var B=new p$7;U$4.prototype._cacheAsBitmap=!1,U$4.prototype._cacheData=null,U$4.prototype._cacheAsBitmapResolution=null,U$4.prototype._cacheAsBitmapMultisample=P.NONE;var S=function(){this.textureCacheId=null,this.originalRender=null,this.originalRenderCanvas=null,this.originalCalculateBounds=null,this.originalGetLocalBounds=null,this.originalUpdateTransform=null,this.originalDestroy=null,this.originalMask=null,this.originalFilterArea=null,this.originalContainsPoint=null,this.sprite=null;};Object.defineProperties(U$4.prototype,{cacheAsBitmapResolution:{get:function(){return this._cacheAsBitmapResolution},set:function(t){t!==this._cacheAsBitmapResolution&&(this._cacheAsBitmapResolution=t,this.cacheAsBitmap&&(this.cacheAsBitmap=!1,this.cacheAsBitmap=!0));}},cacheAsBitmapMultisample:{get:function(){return this._cacheAsBitmapMultisample},set:function(t){t!==this._cacheAsBitmapMultisample&&(this._cacheAsBitmapMultisample=t,this.cacheAsBitmap&&(this.cacheAsBitmap=!1,this.cacheAsBitmap=!0));}},cacheAsBitmap:{get:function(){return this._cacheAsBitmap},set:function(t){var a;this._cacheAsBitmap!==t&&(this._cacheAsBitmap=t,t?(this._cacheData||(this._cacheData=new S),(a=this._cacheData).originalRender=this.render,a.originalRenderCanvas=this.renderCanvas,a.originalUpdateTransform=this.updateTransform,a.originalCalculateBounds=this.calculateBounds,a.originalGetLocalBounds=this.getLocalBounds,a.originalDestroy=this.destroy,a.originalContainsPoint=this.containsPoint,a.originalMask=this._mask,a.originalFilterArea=this.filterArea,this.render=this._renderCached,this.renderCanvas=this._renderCachedCanvas,this.destroy=this._cacheAsBitmapDestroy):((a=this._cacheData).sprite&&this._destroyCachedDisplayObject(),this.render=a.originalRender,this.renderCanvas=a.originalRenderCanvas,this.calculateBounds=a.originalCalculateBounds,this.getLocalBounds=a.originalGetLocalBounds,this.destroy=a.originalDestroy,this.updateTransform=a.originalUpdateTransform,this.containsPoint=a.originalContainsPoint,this._mask=a.originalMask,this.filterArea=a.originalFilterArea));}}}),U$4.prototype._renderCached=function(t){!this.visible||this.worldAlpha<=0||!this.renderable||(this._initCachedDisplayObject(t),this._cacheData.sprite.transform._worldID=this.transform._worldID,this._cacheData.sprite.worldAlpha=this.worldAlpha,this._cacheData.sprite._render(t));},U$4.prototype._initCachedDisplayObject=function(s){var r;if(!this._cacheData||!this._cacheData.sprite){var o=this.alpha;this.alpha=1,s.batch.flush();var h=this.getLocalBounds(null,!0).clone();if(this.filters&&this.filters.length){var E=this.filters[0].padding;h.pad(E);}h.ceil(V$2.RESOLUTION);var c=s.renderTexture.current,T=s.renderTexture.sourceFrame.clone(),l=s.renderTexture.destinationFrame.clone(),N=s.projection.transform,R=_e.create({width:h.width,height:h.height,resolution:this.cacheAsBitmapResolution||s.resolution,multisample:null!==(r=this.cacheAsBitmapMultisample)&&void 0!==r?r:s.multisample}),A="cacheAsBitmap_"+T$7();this._cacheData.textureCacheId=A,te.addToCache(R.baseTexture,A),ye.addToCache(R,A);var I=this.transform.localTransform.copyTo(B).invert().translate(-h.x,-h.y);this.render=this._cacheData.originalRender,s.render(this,{renderTexture:R,clear:!0,transform:I,skipUpdateTransform:!1}),s.framebuffer.blit(),s.projection.transform=N,s.renderTexture.bind(c,T,l),this.render=this._renderCached,this.updateTransform=this.displayObjectUpdateTransform,this.calculateBounds=this._calculateCachedBounds,this.getLocalBounds=this._getCachedLocalBounds,this._mask=null,this.filterArea=null,this.alpha=o;var d=new l$4(R);d.transform.worldTransform=this.transform.worldTransform,d.anchor.x=-h.x/h.width,d.anchor.y=-h.y/h.height,d.alpha=o,d._bounds=this._bounds,this._cacheData.sprite=d,this.transform._parentID=-1,this.parent?this.updateTransform():(this.enableTempParent(),this.updateTransform(),this.disableTempParent(null)),this.containsPoint=d.containsPoint.bind(d);}},U$4.prototype._renderCachedCanvas=function(t){!this.visible||this.worldAlpha<=0||!this.renderable||(this._initCachedDisplayObjectCanvas(t),this._cacheData.sprite.worldAlpha=this.worldAlpha,this._cacheData.sprite._renderCanvas(t));},U$4.prototype._initCachedDisplayObjectCanvas=function(s){if(!this._cacheData||!this._cacheData.sprite){var r=this.getLocalBounds(null,!0),o=this.alpha;this.alpha=1;var h=s.context,E=s._projTransform;r.ceil(V$2.RESOLUTION);var c=_e.create({width:r.width,height:r.height}),T="cacheAsBitmap_"+T$7();this._cacheData.textureCacheId=T,te.addToCache(c.baseTexture,T),ye.addToCache(c,T);var l=B;this.transform.localTransform.copyTo(l),l.invert(),l.tx-=r.x,l.ty-=r.y,this.renderCanvas=this._cacheData.originalRenderCanvas,s.render(this,{renderTexture:c,clear:!0,transform:l,skipUpdateTransform:!1}),s.context=h,s._projTransform=E,this.renderCanvas=this._renderCachedCanvas,this.updateTransform=this.displayObjectUpdateTransform,this.calculateBounds=this._calculateCachedBounds,this.getLocalBounds=this._getCachedLocalBounds,this._mask=null,this.filterArea=null,this.alpha=o;var N=new l$4(c);N.transform.worldTransform=this.transform.worldTransform,N.anchor.x=-r.x/r.width,N.anchor.y=-r.y/r.height,N.alpha=o,N._bounds=this._bounds,this._cacheData.sprite=N,this.transform._parentID=-1,this.parent?this.updateTransform():(this.parent=s._tempDisplayObjectParent,this.updateTransform(),this.parent=null),this.containsPoint=N.containsPoint.bind(N);}},U$4.prototype._calculateCachedBounds=function(){this._bounds.clear(),this._cacheData.sprite.transform._worldID=this.transform._worldID,this._cacheData.sprite._calculateBounds(),this._bounds.updateID=this._boundsID;},U$4.prototype._getCachedLocalBounds=function(){return this._cacheData.sprite.getLocalBounds(null)},U$4.prototype._destroyCachedDisplayObject=function(){this._cacheData.sprite._texture.destroy(!0),this._cacheData.sprite=null,te.removeFromCache(this._cacheData.textureCacheId),ye.removeFromCache(this._cacheData.textureCacheId),this._cacheData.textureCacheId=null;},U$4.prototype._cacheAsBitmapDestroy=function(t){this.cacheAsBitmap=!1,this.destroy(t);};

  /*!
   * @pixi/mixin-get-child-by-name - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/mixin-get-child-by-name is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  U$4.prototype.name=null,g$6.prototype.getChildByName=function(i,e){for(var r=0,t=this.children.length;r<t;r++)if(this.children[r].name===i)return this.children[r];if(e)for(r=0,t=this.children.length;r<t;r++){var n=this.children[r];if(n.getChildByName){var h=n.getChildByName(i,!0);if(h)return h}}return null};

  /*!
   * @pixi/mixin-get-global-position - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/mixin-get-global-position is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  U$4.prototype.getGlobalPosition=function(i,t){return void 0===i&&(i=new o$9),void 0===t&&(t=!1),this.parent?this.parent.toGlobal(this.position,i,t):(i.x=this.position.x,i.y=this.position.y),i};

  /*!
   * @pixi/app - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/app is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  var t=function(){function i(){}return i.init=function(e){var i=this;Object.defineProperty(this,"resizeTo",{set:function(e){globalThis.removeEventListener("resize",this.queueResize),this._resizeTo=e,e&&(globalThis.addEventListener("resize",this.queueResize),this.resize());},get:function(){return this._resizeTo}}),this.queueResize=function(){i._resizeTo&&(i.cancelResize(),i._resizeId=requestAnimationFrame((function(){return i.resize()})));},this.cancelResize=function(){i._resizeId&&(cancelAnimationFrame(i._resizeId),i._resizeId=null);},this.resize=function(){if(i._resizeTo){var e,r;if(i.cancelResize(),i._resizeTo===globalThis.window)e=globalThis.innerWidth,r=globalThis.innerHeight;else {var n=i._resizeTo;e=n.clientWidth,r=n.clientHeight;}i.renderer.resize(e,r);}},this._resizeId=null,this._resizeTo=null,this.resizeTo=e.resizeTo||null;},i.destroy=function(){globalThis.removeEventListener("resize",this.queueResize),this.cancelResize(),this.cancelResize=null,this.queueResize=null,this.resizeTo=null,this.resize=null;},i.extension=e$2.Application,i}(),s$1=function(){function t(e){var i=this;this.stage=new g$6,e=Object.assign({forceCanvas:!1},e),this.renderer=tr(e),t._plugins.forEach((function(r){r.init.call(i,e);}));}return t.registerPlugin=function(r){t$2.add({type:e$2.Application,ref:r});},t.prototype.render=function(){this.renderer.render(this.stage);},Object.defineProperty(t.prototype,"view",{get:function(){return this.renderer.view},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"screen",{get:function(){return this.renderer.screen},enumerable:!1,configurable:!0}),t.prototype.destroy=function(e,i){var r=this,n=t._plugins.slice(0);n.reverse(),n.forEach((function(e){e.destroy.call(r);})),this.stage.destroy(i),this.stage=null,this.renderer.destroy(e),this.renderer=null;},t._plugins=[],t}();t$2.handleByList(e$2.Application,s$1._plugins),t$2.add(t);

  /*!
   * @pixi/mesh-extras - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/mesh-extras is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  var o$1=function(t,e){return o$1=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,e){t.__proto__=e;}||function(t,e){for(var i in e)e.hasOwnProperty(i)&&(t[i]=e[i]);},o$1(t,e)};function s(t,e){function i(){this.constructor=t;}o$1(t,e),t.prototype=null===e?Object.create(e):(i.prototype=e.prototype,new i);}var n=function(t){function e(e,i,r,h){void 0===e&&(e=100),void 0===i&&(i=100),void 0===r&&(r=10),void 0===h&&(h=10);var o=t.call(this)||this;return o.segWidth=r,o.segHeight=h,o.width=e,o.height=i,o.build(),o}return s(e,t),e.prototype.build=function(){for(var t=this.segWidth*this.segHeight,e=[],i=[],r=[],h=this.segWidth-1,o=this.segHeight-1,s=this.width/h,n=this.height/o,a=0;a<t;a++){var u=a%this.segWidth,d=a/this.segWidth|0;e.push(u*s,d*n),i.push(u/h,d/o);}var f=h*o;for(a=0;a<f;a++){var p=a%h,g=a/h|0,c=g*this.segWidth+p,l=g*this.segWidth+p+1,_=(g+1)*this.segWidth+p,y=(g+1)*this.segWidth+p+1;r.push(c,l,_,l,y,_);}this.buffers[0].data=new Float32Array(e),this.buffers[1].data=new Float32Array(i),this.indexBuffer.data=new Uint16Array(r),this.buffers[0].update(),this.buffers[1].update(),this.indexBuffer.update();},e}(_$1),a=function(t){function e(e,i,r){void 0===e&&(e=200),void 0===r&&(r=0);var h=t.call(this,new Float32Array(4*i.length),new Float32Array(4*i.length),new Uint16Array(6*(i.length-1)))||this;return h.points=i,h._width=e,h.textureScale=r,h.build(),h}return s(e,t),Object.defineProperty(e.prototype,"width",{get:function(){return this._width},enumerable:!1,configurable:!0}),e.prototype.build=function(){var t=this.points;if(t){var e=this.getBuffer("aVertexPosition"),i=this.getBuffer("aTextureCoord"),r=this.getIndex();if(!(t.length<1)){e.data.length/4!==t.length&&(e.data=new Float32Array(4*t.length),i.data=new Float32Array(4*t.length),r.data=new Uint16Array(6*(t.length-1)));var h=i.data,o=r.data;h[0]=0,h[1]=0,h[2]=0,h[3]=1;for(var s=0,n=t[0],a=this._width*this.textureScale,u=t.length,d=0;d<u;d++){var f=4*d;if(this.textureScale>0){var p=n.x-t[d].x,g=n.y-t[d].y,c=Math.sqrt(p*p+g*g);n=t[d],s+=c/a;}else s=d/(u-1);h[f]=s,h[f+1]=0,h[f+2]=s,h[f+3]=1;}var l=0;for(d=0;d<u-1;d++){f=2*d;o[l++]=f,o[l++]=f+1,o[l++]=f+2,o[l++]=f+2,o[l++]=f+1,o[l++]=f+3;}i.update(),r.update(),this.updateVertices();}}},e.prototype.updateVertices=function(){var t=this.points;if(!(t.length<1)){for(var e,i=t[0],r=0,h=0,o=this.buffers[0].data,s=t.length,n=0;n<s;n++){var a=t[n],u=4*n;h=-((e=n<t.length-1?t[n+1]:a).x-i.x),r=e.y-i.y;var d=Math.sqrt(r*r+h*h),f=this.textureScale>0?this.textureScale*this._width/2:this._width/2;r/=d,h/=d,r*=f,h*=f,o[u]=a.x+r,o[u+1]=a.y+h,o[u+2]=a.x-r,o[u+3]=a.y-h,i=a;}this.buffers[0].update();}},e.prototype.update=function(){this.textureScale>0?this.build():this.updateVertices();},e}(_$1);(function(t){function e(e,h,o){void 0===o&&(o=0);var s=this,n=new a(e.height,h,o),u=new b(e);return o>0&&(e.baseTexture.wrapMode=S$5.REPEAT),(s=t.call(this,n,u)||this).autoUpdate=!0,s}return s(e,t),e.prototype._render=function(e){var i=this.geometry;(this.autoUpdate||i._width!==this.shader.texture.height)&&(i._width=this.shader.texture.height,i.update()),t.prototype._render.call(this,e);},e})(g);var d=function(t){function e(e,r,o){var s=this,a=new n(e.width,e.height,r,o),u=new b(ye.WHITE);return (s=t.call(this,a,u)||this).texture=e,s.autoResize=!0,s}return s(e,t),e.prototype.textureUpdated=function(){this._textureID=this.shader.texture._updateID;var t=this.geometry,e=this.shader.texture,i=e.width,r=e.height;!this.autoResize||t.width===i&&t.height===r||(t.width=this.shader.texture.width,t.height=this.shader.texture.height,t.build());},Object.defineProperty(e.prototype,"texture",{get:function(){return this.shader.texture},set:function(t){this.shader.texture!==t&&(this.shader.texture=t,this._textureID=-1,t.baseTexture.valid?this.textureUpdated():t.once("update",this.textureUpdated,this));},enumerable:!1,configurable:!0}),e.prototype._render=function(e){this._textureID!==this.shader.texture._updateID&&this.textureUpdated(),t.prototype._render.call(this,e);},e.prototype.destroy=function(e){this.shader.texture.off("update",this.textureUpdated,this),t.prototype.destroy.call(this,e);},e}(g);(function(e){function r(r,o,s,n,a){void 0===r&&(r=ye.EMPTY);var u=this,d=new _$1(o,s,n);d.getBuffer("aVertexPosition").static=!1;var f=new b(r);return (u=e.call(this,d,f,null,a)||this).autoUpdate=!0,u}return s(r,e),Object.defineProperty(r.prototype,"vertices",{get:function(){return this.geometry.getBuffer("aVertexPosition").data},set:function(t){this.geometry.getBuffer("aVertexPosition").data=t;},enumerable:!1,configurable:!0}),r.prototype._render=function(t){this.autoUpdate&&this.geometry.getBuffer("aVertexPosition").update(),e.prototype._render.call(this,t);},r})(g);(function(t){function e(e,i,r,o,s){void 0===i&&(i=10),void 0===r&&(r=10),void 0===o&&(o=10),void 0===s&&(s=10);var n=t.call(this,ye.WHITE,4,4)||this;return n._origWidth=e.orig.width,n._origHeight=e.orig.height,n._width=n._origWidth,n._height=n._origHeight,n._leftWidth=i,n._rightWidth=o,n._topHeight=r,n._bottomHeight=s,n.texture=e,n}return s(e,t),e.prototype.textureUpdated=function(){this._textureID=this.shader.texture._updateID,this._refresh();},Object.defineProperty(e.prototype,"vertices",{get:function(){return this.geometry.getBuffer("aVertexPosition").data},set:function(t){this.geometry.getBuffer("aVertexPosition").data=t;},enumerable:!1,configurable:!0}),e.prototype.updateHorizontalVertices=function(){var t=this.vertices,e=this._getMinScale();t[9]=t[11]=t[13]=t[15]=this._topHeight*e,t[17]=t[19]=t[21]=t[23]=this._height-this._bottomHeight*e,t[25]=t[27]=t[29]=t[31]=this._height;},e.prototype.updateVerticalVertices=function(){var t=this.vertices,e=this._getMinScale();t[2]=t[10]=t[18]=t[26]=this._leftWidth*e,t[4]=t[12]=t[20]=t[28]=this._width-this._rightWidth*e,t[6]=t[14]=t[22]=t[30]=this._width;},e.prototype._getMinScale=function(){var t=this._leftWidth+this._rightWidth,e=this._width>t?1:this._width/t,i=this._topHeight+this._bottomHeight,r=this._height>i?1:this._height/i;return Math.min(e,r)},Object.defineProperty(e.prototype,"width",{get:function(){return this._width},set:function(t){this._width=t,this._refresh();},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"height",{get:function(){return this._height},set:function(t){this._height=t,this._refresh();},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"leftWidth",{get:function(){return this._leftWidth},set:function(t){this._leftWidth=t,this._refresh();},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"rightWidth",{get:function(){return this._rightWidth},set:function(t){this._rightWidth=t,this._refresh();},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"topHeight",{get:function(){return this._topHeight},set:function(t){this._topHeight=t,this._refresh();},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"bottomHeight",{get:function(){return this._bottomHeight},set:function(t){this._bottomHeight=t,this._refresh();},enumerable:!1,configurable:!0}),e.prototype._refresh=function(){var t=this.texture,e=this.geometry.buffers[1].data;this._origWidth=t.orig.width,this._origHeight=t.orig.height;var i=1/this._origWidth,r=1/this._origHeight;e[0]=e[8]=e[16]=e[24]=0,e[1]=e[3]=e[5]=e[7]=0,e[6]=e[14]=e[22]=e[30]=1,e[25]=e[27]=e[29]=e[31]=1,e[2]=e[10]=e[18]=e[26]=i*this._leftWidth,e[4]=e[12]=e[20]=e[28]=1-i*this._rightWidth,e[9]=e[11]=e[13]=e[15]=r*this._topHeight,e[17]=e[19]=e[21]=e[23]=1-r*this._bottomHeight,this.updateHorizontalVertices(),this.updateVerticalVertices(),this.geometry.buffers[0].update(),this.geometry.buffers[1].update();},e})(d);

  /*!
   * @pixi/sprite-animated - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * @pixi/sprite-animated is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  var o=function(t,e){return o=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,e){t.__proto__=e;}||function(t,e){for(var r in e)e.hasOwnProperty(r)&&(t[r]=e[r]);},o(t,e)};(function(e){function n(r,i){void 0===i&&(i=!0);var o=e.call(this,r[0]instanceof ye?r[0]:r[0].texture)||this;return o._textures=null,o._durations=null,o._autoUpdate=i,o._isConnectedToTicker=!1,o.animationSpeed=1,o.loop=!0,o.updateAnchor=!1,o.onComplete=null,o.onFrameChange=null,o.onLoop=null,o._currentTime=0,o._playing=!1,o._previousFrame=null,o.textures=r,o}return function(t,e){function r(){this.constructor=t;}o(t,e),t.prototype=null===e?Object.create(e):(r.prototype=e.prototype,new r);}(n,e),n.prototype.stop=function(){this._playing&&(this._playing=!1,this._autoUpdate&&this._isConnectedToTicker&&(n$7.shared.remove(this.update,this),this._isConnectedToTicker=!1));},n.prototype.play=function(){this._playing||(this._playing=!0,this._autoUpdate&&!this._isConnectedToTicker&&(n$7.shared.add(this.update,this,i$4.HIGH),this._isConnectedToTicker=!0));},n.prototype.gotoAndStop=function(t){this.stop();var e=this.currentFrame;this._currentTime=t,e!==this.currentFrame&&this.updateTexture();},n.prototype.gotoAndPlay=function(t){var e=this.currentFrame;this._currentTime=t,e!==this.currentFrame&&this.updateTexture(),this.play();},n.prototype.update=function(t){if(this._playing){var e=this.animationSpeed*t,r=this.currentFrame;if(null!==this._durations){var i=this._currentTime%1*this._durations[this.currentFrame];for(i+=e/60*1e3;i<0;)this._currentTime--,i+=this._durations[this.currentFrame];var o=Math.sign(this.animationSpeed*t);for(this._currentTime=Math.floor(this._currentTime);i>=this._durations[this.currentFrame];)i-=this._durations[this.currentFrame]*o,this._currentTime+=o;this._currentTime+=i/this._durations[this.currentFrame];}else this._currentTime+=e;this._currentTime<0&&!this.loop?(this.gotoAndStop(0),this.onComplete&&this.onComplete()):this._currentTime>=this._textures.length&&!this.loop?(this.gotoAndStop(this._textures.length-1),this.onComplete&&this.onComplete()):r!==this.currentFrame&&(this.loop&&this.onLoop&&(this.animationSpeed>0&&this.currentFrame<r||this.animationSpeed<0&&this.currentFrame>r)&&this.onLoop(),this.updateTexture());}},n.prototype.updateTexture=function(){var t=this.currentFrame;this._previousFrame!==t&&(this._previousFrame=t,this._texture=this._textures[t],this._textureID=-1,this._textureTrimmedID=-1,this._cachedTint=16777215,this.uvs=this._texture._uvs.uvsFloat32,this.updateAnchor&&this._anchor.copyFrom(this._texture.defaultAnchor),this.onFrameChange&&this.onFrameChange(this.currentFrame));},n.prototype.destroy=function(t){this.stop(),e.prototype.destroy.call(this,t),this.onComplete=null,this.onFrameChange=null,this.onLoop=null;},n.fromFrames=function(e){for(var r=[],i=0;i<e.length;++i)r.push(ye.from(e[i]));return new n(r)},n.fromImages=function(e){for(var r=[],i=0;i<e.length;++i)r.push(ye.from(e[i]));return new n(r)},Object.defineProperty(n.prototype,"totalFrames",{get:function(){return this._textures.length},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"textures",{get:function(){return this._textures},set:function(e){if(e[0]instanceof ye)this._textures=e,this._durations=null;else {this._textures=[],this._durations=[];for(var r=0;r<e.length;r++)this._textures.push(e[r].texture),this._durations.push(e[r].time);}this._previousFrame=null,this.gotoAndStop(0),this.updateTexture();},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"currentFrame",{get:function(){var t=Math.floor(this._currentTime)%this._textures.length;return t<0&&(t+=this._textures.length),t},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"playing",{get:function(){return this._playing},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"autoUpdate",{get:function(){return this._autoUpdate},set:function(t){t!==this._autoUpdate&&(this._autoUpdate=t,!this._autoUpdate&&this._isConnectedToTicker?(n$7.shared.remove(this.update,this),this._isConnectedToTicker=!1):this._autoUpdate&&!this._isConnectedToTicker&&this._playing&&(n$7.shared.add(this.update,this),this._isConnectedToTicker=!0));},enumerable:!1,configurable:!0}),n})(l$4);

  /*!
   * pixi.js - v6.5.1
   * Compiled Sun, 24 Jul 2022 20:56:21 UTC
   *
   * pixi.js is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  t$2.add(o$8,i$3,d$7,x$3,b$1,pr,C$2,D$1,P$4,T_,r_,u$2,r$2,O$4);

  var matter = {exports: {}};

  /*!
   * matter-js 0.18.0 by @liabru
   * http://brm.io/matter-js/
   * License MIT
   * 
   * The MIT License (MIT)
   * 
   * Copyright (c) Liam Brummitt and contributors.
   * 
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   * 
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   * 
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */

  (function (module, exports) {
  (function webpackUniversalModuleDefinition(root, factory) {
  	module.exports = factory();
  })(commonjsGlobal, function() {
  return /******/ (function(modules) { // webpackBootstrap
  /******/ 	// The module cache
  /******/ 	var installedModules = {};
  /******/
  /******/ 	// The require function
  /******/ 	function __webpack_require__(moduleId) {
  /******/
  /******/ 		// Check if module is in cache
  /******/ 		if(installedModules[moduleId]) {
  /******/ 			return installedModules[moduleId].exports;
  /******/ 		}
  /******/ 		// Create a new module (and put it into the cache)
  /******/ 		var module = installedModules[moduleId] = {
  /******/ 			i: moduleId,
  /******/ 			l: false,
  /******/ 			exports: {}
  /******/ 		};
  /******/
  /******/ 		// Execute the module function
  /******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
  /******/
  /******/ 		// Flag the module as loaded
  /******/ 		module.l = true;
  /******/
  /******/ 		// Return the exports of the module
  /******/ 		return module.exports;
  /******/ 	}
  /******/
  /******/
  /******/ 	// expose the modules object (__webpack_modules__)
  /******/ 	__webpack_require__.m = modules;
  /******/
  /******/ 	// expose the module cache
  /******/ 	__webpack_require__.c = installedModules;
  /******/
  /******/ 	// define getter function for harmony exports
  /******/ 	__webpack_require__.d = function(exports, name, getter) {
  /******/ 		if(!__webpack_require__.o(exports, name)) {
  /******/ 			Object.defineProperty(exports, name, { enumerable: true, get: getter });
  /******/ 		}
  /******/ 	};
  /******/
  /******/ 	// define __esModule on exports
  /******/ 	__webpack_require__.r = function(exports) {
  /******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
  /******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
  /******/ 		}
  /******/ 		Object.defineProperty(exports, '__esModule', { value: true });
  /******/ 	};
  /******/
  /******/ 	// create a fake namespace object
  /******/ 	// mode & 1: value is a module id, require it
  /******/ 	// mode & 2: merge all properties of value into the ns
  /******/ 	// mode & 4: return value when already ns object
  /******/ 	// mode & 8|1: behave like require
  /******/ 	__webpack_require__.t = function(value, mode) {
  /******/ 		if(mode & 1) value = __webpack_require__(value);
  /******/ 		if(mode & 8) return value;
  /******/ 		if((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;
  /******/ 		var ns = Object.create(null);
  /******/ 		__webpack_require__.r(ns);
  /******/ 		Object.defineProperty(ns, 'default', { enumerable: true, value: value });
  /******/ 		if(mode & 2 && typeof value != 'string') for(var key in value) __webpack_require__.d(ns, key, function(key) { return value[key]; }.bind(null, key));
  /******/ 		return ns;
  /******/ 	};
  /******/
  /******/ 	// getDefaultExport function for compatibility with non-harmony modules
  /******/ 	__webpack_require__.n = function(module) {
  /******/ 		var getter = module && module.__esModule ?
  /******/ 			function getDefault() { return module['default']; } :
  /******/ 			function getModuleExports() { return module; };
  /******/ 		__webpack_require__.d(getter, 'a', getter);
  /******/ 		return getter;
  /******/ 	};
  /******/
  /******/ 	// Object.prototype.hasOwnProperty.call
  /******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
  /******/
  /******/ 	// __webpack_public_path__
  /******/ 	__webpack_require__.p = "";
  /******/
  /******/
  /******/ 	// Load entry module and return exports
  /******/ 	return __webpack_require__(__webpack_require__.s = 21);
  /******/ })
  /************************************************************************/
  /******/ ([
  /* 0 */
  /***/ (function(module, exports) {

  /**
  * The `Matter.Common` module contains utility functions that are common to all modules.
  *
  * @class Common
  */

  var Common = {};

  module.exports = Common;

  (function() {

      Common._nextId = 0;
      Common._seed = 0;
      Common._nowStartTime = +(new Date());
      Common._warnedOnce = {};
      Common._decomp = null;
      
      /**
       * Extends the object in the first argument using the object in the second argument.
       * @method extend
       * @param {} obj
       * @param {boolean} deep
       * @return {} obj extended
       */
      Common.extend = function(obj, deep) {
          var argsStart,
              deepClone;

          if (typeof deep === 'boolean') {
              argsStart = 2;
              deepClone = deep;
          } else {
              argsStart = 1;
              deepClone = true;
          }

          for (var i = argsStart; i < arguments.length; i++) {
              var source = arguments[i];

              if (source) {
                  for (var prop in source) {
                      if (deepClone && source[prop] && source[prop].constructor === Object) {
                          if (!obj[prop] || obj[prop].constructor === Object) {
                              obj[prop] = obj[prop] || {};
                              Common.extend(obj[prop], deepClone, source[prop]);
                          } else {
                              obj[prop] = source[prop];
                          }
                      } else {
                          obj[prop] = source[prop];
                      }
                  }
              }
          }
          
          return obj;
      };

      /**
       * Creates a new clone of the object, if deep is true references will also be cloned.
       * @method clone
       * @param {} obj
       * @param {bool} deep
       * @return {} obj cloned
       */
      Common.clone = function(obj, deep) {
          return Common.extend({}, deep, obj);
      };

      /**
       * Returns the list of keys for the given object.
       * @method keys
       * @param {} obj
       * @return {string[]} keys
       */
      Common.keys = function(obj) {
          if (Object.keys)
              return Object.keys(obj);

          // avoid hasOwnProperty for performance
          var keys = [];
          for (var key in obj)
              keys.push(key);
          return keys;
      };

      /**
       * Returns the list of values for the given object.
       * @method values
       * @param {} obj
       * @return {array} Array of the objects property values
       */
      Common.values = function(obj) {
          var values = [];
          
          if (Object.keys) {
              var keys = Object.keys(obj);
              for (var i = 0; i < keys.length; i++) {
                  values.push(obj[keys[i]]);
              }
              return values;
          }
          
          // avoid hasOwnProperty for performance
          for (var key in obj)
              values.push(obj[key]);
          return values;
      };

      /**
       * Gets a value from `base` relative to the `path` string.
       * @method get
       * @param {} obj The base object
       * @param {string} path The path relative to `base`, e.g. 'Foo.Bar.baz'
       * @param {number} [begin] Path slice begin
       * @param {number} [end] Path slice end
       * @return {} The object at the given path
       */
      Common.get = function(obj, path, begin, end) {
          path = path.split('.').slice(begin, end);

          for (var i = 0; i < path.length; i += 1) {
              obj = obj[path[i]];
          }

          return obj;
      };

      /**
       * Sets a value on `base` relative to the given `path` string.
       * @method set
       * @param {} obj The base object
       * @param {string} path The path relative to `base`, e.g. 'Foo.Bar.baz'
       * @param {} val The value to set
       * @param {number} [begin] Path slice begin
       * @param {number} [end] Path slice end
       * @return {} Pass through `val` for chaining
       */
      Common.set = function(obj, path, val, begin, end) {
          var parts = path.split('.').slice(begin, end);
          Common.get(obj, path, 0, -1)[parts[parts.length - 1]] = val;
          return val;
      };

      /**
       * Shuffles the given array in-place.
       * The function uses a seeded random generator.
       * @method shuffle
       * @param {array} array
       * @return {array} array shuffled randomly
       */
      Common.shuffle = function(array) {
          for (var i = array.length - 1; i > 0; i--) {
              var j = Math.floor(Common.random() * (i + 1));
              var temp = array[i];
              array[i] = array[j];
              array[j] = temp;
          }
          return array;
      };

      /**
       * Randomly chooses a value from a list with equal probability.
       * The function uses a seeded random generator.
       * @method choose
       * @param {array} choices
       * @return {object} A random choice object from the array
       */
      Common.choose = function(choices) {
          return choices[Math.floor(Common.random() * choices.length)];
      };

      /**
       * Returns true if the object is a HTMLElement, otherwise false.
       * @method isElement
       * @param {object} obj
       * @return {boolean} True if the object is a HTMLElement, otherwise false
       */
      Common.isElement = function(obj) {
          if (typeof HTMLElement !== 'undefined') {
              return obj instanceof HTMLElement;
          }

          return !!(obj && obj.nodeType && obj.nodeName);
      };

      /**
       * Returns true if the object is an array.
       * @method isArray
       * @param {object} obj
       * @return {boolean} True if the object is an array, otherwise false
       */
      Common.isArray = function(obj) {
          return Object.prototype.toString.call(obj) === '[object Array]';
      };

      /**
       * Returns true if the object is a function.
       * @method isFunction
       * @param {object} obj
       * @return {boolean} True if the object is a function, otherwise false
       */
      Common.isFunction = function(obj) {
          return typeof obj === "function";
      };

      /**
       * Returns true if the object is a plain object.
       * @method isPlainObject
       * @param {object} obj
       * @return {boolean} True if the object is a plain object, otherwise false
       */
      Common.isPlainObject = function(obj) {
          return typeof obj === 'object' && obj.constructor === Object;
      };

      /**
       * Returns true if the object is a string.
       * @method isString
       * @param {object} obj
       * @return {boolean} True if the object is a string, otherwise false
       */
      Common.isString = function(obj) {
          return toString.call(obj) === '[object String]';
      };
      
      /**
       * Returns the given value clamped between a minimum and maximum value.
       * @method clamp
       * @param {number} value
       * @param {number} min
       * @param {number} max
       * @return {number} The value clamped between min and max inclusive
       */
      Common.clamp = function(value, min, max) {
          if (value < min)
              return min;
          if (value > max)
              return max;
          return value;
      };
      
      /**
       * Returns the sign of the given value.
       * @method sign
       * @param {number} value
       * @return {number} -1 if negative, +1 if 0 or positive
       */
      Common.sign = function(value) {
          return value < 0 ? -1 : 1;
      };
      
      /**
       * Returns the current timestamp since the time origin (e.g. from page load).
       * The result is in milliseconds and will use high-resolution timing if available.
       * @method now
       * @return {number} the current timestamp in milliseconds
       */
      Common.now = function() {
          if (typeof window !== 'undefined' && window.performance) {
              if (window.performance.now) {
                  return window.performance.now();
              } else if (window.performance.webkitNow) {
                  return window.performance.webkitNow();
              }
          }

          if (Date.now) {
              return Date.now();
          }

          return (new Date()) - Common._nowStartTime;
      };
      
      /**
       * Returns a random value between a minimum and a maximum value inclusive.
       * The function uses a seeded random generator.
       * @method random
       * @param {number} min
       * @param {number} max
       * @return {number} A random number between min and max inclusive
       */
      Common.random = function(min, max) {
          min = (typeof min !== "undefined") ? min : 0;
          max = (typeof max !== "undefined") ? max : 1;
          return min + _seededRandom() * (max - min);
      };

      var _seededRandom = function() {
          // https://en.wikipedia.org/wiki/Linear_congruential_generator
          Common._seed = (Common._seed * 9301 + 49297) % 233280;
          return Common._seed / 233280;
      };

      /**
       * Converts a CSS hex colour string into an integer.
       * @method colorToNumber
       * @param {string} colorString
       * @return {number} An integer representing the CSS hex string
       */
      Common.colorToNumber = function(colorString) {
          colorString = colorString.replace('#','');

          if (colorString.length == 3) {
              colorString = colorString.charAt(0) + colorString.charAt(0)
                          + colorString.charAt(1) + colorString.charAt(1)
                          + colorString.charAt(2) + colorString.charAt(2);
          }

          return parseInt(colorString, 16);
      };

      /**
       * The console logging level to use, where each level includes all levels above and excludes the levels below.
       * The default level is 'debug' which shows all console messages.  
       *
       * Possible level values are:
       * - 0 = None
       * - 1 = Debug
       * - 2 = Info
       * - 3 = Warn
       * - 4 = Error
       * @property Common.logLevel
       * @type {Number}
       * @default 1
       */
      Common.logLevel = 1;

      /**
       * Shows a `console.log` message only if the current `Common.logLevel` allows it.
       * The message will be prefixed with 'matter-js' to make it easily identifiable.
       * @method log
       * @param ...objs {} The objects to log.
       */
      Common.log = function() {
          if (console && Common.logLevel > 0 && Common.logLevel <= 3) {
              console.log.apply(console, ['matter-js:'].concat(Array.prototype.slice.call(arguments)));
          }
      };

      /**
       * Shows a `console.info` message only if the current `Common.logLevel` allows it.
       * The message will be prefixed with 'matter-js' to make it easily identifiable.
       * @method info
       * @param ...objs {} The objects to log.
       */
      Common.info = function() {
          if (console && Common.logLevel > 0 && Common.logLevel <= 2) {
              console.info.apply(console, ['matter-js:'].concat(Array.prototype.slice.call(arguments)));
          }
      };

      /**
       * Shows a `console.warn` message only if the current `Common.logLevel` allows it.
       * The message will be prefixed with 'matter-js' to make it easily identifiable.
       * @method warn
       * @param ...objs {} The objects to log.
       */
      Common.warn = function() {
          if (console && Common.logLevel > 0 && Common.logLevel <= 3) {
              console.warn.apply(console, ['matter-js:'].concat(Array.prototype.slice.call(arguments)));
          }
      };

      /**
       * Uses `Common.warn` to log the given message one time only.
       * @method warnOnce
       * @param ...objs {} The objects to log.
       */
      Common.warnOnce = function() {
          var message = Array.prototype.slice.call(arguments).join(' ');

          if (!Common._warnedOnce[message]) {
              Common.warn(message);
              Common._warnedOnce[message] = true;
          }
      };

      /**
       * Shows a deprecated console warning when the function on the given object is called.
       * The target function will be replaced with a new function that first shows the warning
       * and then calls the original function.
       * @method deprecated
       * @param {object} obj The object or module
       * @param {string} name The property name of the function on obj
       * @param {string} warning The one-time message to show if the function is called
       */
      Common.deprecated = function(obj, prop, warning) {
          obj[prop] = Common.chain(function() {
              Common.warnOnce('🔅 deprecated 🔅', warning);
          }, obj[prop]);
      };

      /**
       * Returns the next unique sequential ID.
       * @method nextId
       * @return {Number} Unique sequential ID
       */
      Common.nextId = function() {
          return Common._nextId++;
      };

      /**
       * A cross browser compatible indexOf implementation.
       * @method indexOf
       * @param {array} haystack
       * @param {object} needle
       * @return {number} The position of needle in haystack, otherwise -1.
       */
      Common.indexOf = function(haystack, needle) {
          if (haystack.indexOf)
              return haystack.indexOf(needle);

          for (var i = 0; i < haystack.length; i++) {
              if (haystack[i] === needle)
                  return i;
          }

          return -1;
      };

      /**
       * A cross browser compatible array map implementation.
       * @method map
       * @param {array} list
       * @param {function} func
       * @return {array} Values from list transformed by func.
       */
      Common.map = function(list, func) {
          if (list.map) {
              return list.map(func);
          }

          var mapped = [];

          for (var i = 0; i < list.length; i += 1) {
              mapped.push(func(list[i]));
          }

          return mapped;
      };

      /**
       * Takes a directed graph and returns the partially ordered set of vertices in topological order.
       * Circular dependencies are allowed.
       * @method topologicalSort
       * @param {object} graph
       * @return {array} Partially ordered set of vertices in topological order.
       */
      Common.topologicalSort = function(graph) {
          // https://github.com/mgechev/javascript-algorithms
          // Copyright (c) Minko Gechev (MIT license)
          // Modifications: tidy formatting and naming
          var result = [],
              visited = [],
              temp = [];

          for (var node in graph) {
              if (!visited[node] && !temp[node]) {
                  Common._topologicalSort(node, visited, temp, graph, result);
              }
          }

          return result;
      };

      Common._topologicalSort = function(node, visited, temp, graph, result) {
          var neighbors = graph[node] || [];
          temp[node] = true;

          for (var i = 0; i < neighbors.length; i += 1) {
              var neighbor = neighbors[i];

              if (temp[neighbor]) {
                  // skip circular dependencies
                  continue;
              }

              if (!visited[neighbor]) {
                  Common._topologicalSort(neighbor, visited, temp, graph, result);
              }
          }

          temp[node] = false;
          visited[node] = true;

          result.push(node);
      };

      /**
       * Takes _n_ functions as arguments and returns a new function that calls them in order.
       * The arguments applied when calling the new function will also be applied to every function passed.
       * The value of `this` refers to the last value returned in the chain that was not `undefined`.
       * Therefore if a passed function does not return a value, the previously returned value is maintained.
       * After all passed functions have been called the new function returns the last returned value (if any).
       * If any of the passed functions are a chain, then the chain will be flattened.
       * @method chain
       * @param ...funcs {function} The functions to chain.
       * @return {function} A new function that calls the passed functions in order.
       */
      Common.chain = function() {
          var funcs = [];

          for (var i = 0; i < arguments.length; i += 1) {
              var func = arguments[i];

              if (func._chained) {
                  // flatten already chained functions
                  funcs.push.apply(funcs, func._chained);
              } else {
                  funcs.push(func);
              }
          }

          var chain = function() {
              // https://github.com/GoogleChrome/devtools-docs/issues/53#issuecomment-51941358
              var lastResult,
                  args = new Array(arguments.length);

              for (var i = 0, l = arguments.length; i < l; i++) {
                  args[i] = arguments[i];
              }

              for (i = 0; i < funcs.length; i += 1) {
                  var result = funcs[i].apply(lastResult, args);

                  if (typeof result !== 'undefined') {
                      lastResult = result;
                  }
              }

              return lastResult;
          };

          chain._chained = funcs;

          return chain;
      };

      /**
       * Chains a function to excute before the original function on the given `path` relative to `base`.
       * See also docs for `Common.chain`.
       * @method chainPathBefore
       * @param {} base The base object
       * @param {string} path The path relative to `base`
       * @param {function} func The function to chain before the original
       * @return {function} The chained function that replaced the original
       */
      Common.chainPathBefore = function(base, path, func) {
          return Common.set(base, path, Common.chain(
              func,
              Common.get(base, path)
          ));
      };

      /**
       * Chains a function to excute after the original function on the given `path` relative to `base`.
       * See also docs for `Common.chain`.
       * @method chainPathAfter
       * @param {} base The base object
       * @param {string} path The path relative to `base`
       * @param {function} func The function to chain after the original
       * @return {function} The chained function that replaced the original
       */
      Common.chainPathAfter = function(base, path, func) {
          return Common.set(base, path, Common.chain(
              Common.get(base, path),
              func
          ));
      };

      /**
       * Provide the [poly-decomp](https://github.com/schteppe/poly-decomp.js) library module to enable
       * concave vertex decomposition support when using `Bodies.fromVertices` e.g. `Common.setDecomp(require('poly-decomp'))`.
       * @method setDecomp
       * @param {} decomp The [poly-decomp](https://github.com/schteppe/poly-decomp.js) library module.
       */
      Common.setDecomp = function(decomp) {
          Common._decomp = decomp;
      };

      /**
       * Returns the [poly-decomp](https://github.com/schteppe/poly-decomp.js) library module provided through `Common.setDecomp`,
       * otherwise returns the global `decomp` if set.
       * @method getDecomp
       * @return {} The [poly-decomp](https://github.com/schteppe/poly-decomp.js) library module if provided.
       */
      Common.getDecomp = function() {
          // get user provided decomp if set
          var decomp = Common._decomp;

          try {
              // otherwise from window global
              if (!decomp && typeof window !== 'undefined') {
                  decomp = window.decomp;
              }
      
              // otherwise from node global
              if (!decomp && typeof commonjsGlobal !== 'undefined') {
                  decomp = commonjsGlobal.decomp;
              }
          } catch (e) {
              // decomp not available
              decomp = null;
          }

          return decomp;
      };
  })();


  /***/ }),
  /* 1 */
  /***/ (function(module, exports) {

  /**
  * The `Matter.Bounds` module contains methods for creating and manipulating axis-aligned bounding boxes (AABB).
  *
  * @class Bounds
  */

  var Bounds = {};

  module.exports = Bounds;

  (function() {

      /**
       * Creates a new axis-aligned bounding box (AABB) for the given vertices.
       * @method create
       * @param {vertices} vertices
       * @return {bounds} A new bounds object
       */
      Bounds.create = function(vertices) {
          var bounds = { 
              min: { x: 0, y: 0 }, 
              max: { x: 0, y: 0 }
          };

          if (vertices)
              Bounds.update(bounds, vertices);
          
          return bounds;
      };

      /**
       * Updates bounds using the given vertices and extends the bounds given a velocity.
       * @method update
       * @param {bounds} bounds
       * @param {vertices} vertices
       * @param {vector} velocity
       */
      Bounds.update = function(bounds, vertices, velocity) {
          bounds.min.x = Infinity;
          bounds.max.x = -Infinity;
          bounds.min.y = Infinity;
          bounds.max.y = -Infinity;

          for (var i = 0; i < vertices.length; i++) {
              var vertex = vertices[i];
              if (vertex.x > bounds.max.x) bounds.max.x = vertex.x;
              if (vertex.x < bounds.min.x) bounds.min.x = vertex.x;
              if (vertex.y > bounds.max.y) bounds.max.y = vertex.y;
              if (vertex.y < bounds.min.y) bounds.min.y = vertex.y;
          }
          
          if (velocity) {
              if (velocity.x > 0) {
                  bounds.max.x += velocity.x;
              } else {
                  bounds.min.x += velocity.x;
              }
              
              if (velocity.y > 0) {
                  bounds.max.y += velocity.y;
              } else {
                  bounds.min.y += velocity.y;
              }
          }
      };

      /**
       * Returns true if the bounds contains the given point.
       * @method contains
       * @param {bounds} bounds
       * @param {vector} point
       * @return {boolean} True if the bounds contain the point, otherwise false
       */
      Bounds.contains = function(bounds, point) {
          return point.x >= bounds.min.x && point.x <= bounds.max.x 
                 && point.y >= bounds.min.y && point.y <= bounds.max.y;
      };

      /**
       * Returns true if the two bounds intersect.
       * @method overlaps
       * @param {bounds} boundsA
       * @param {bounds} boundsB
       * @return {boolean} True if the bounds overlap, otherwise false
       */
      Bounds.overlaps = function(boundsA, boundsB) {
          return (boundsA.min.x <= boundsB.max.x && boundsA.max.x >= boundsB.min.x
                  && boundsA.max.y >= boundsB.min.y && boundsA.min.y <= boundsB.max.y);
      };

      /**
       * Translates the bounds by the given vector.
       * @method translate
       * @param {bounds} bounds
       * @param {vector} vector
       */
      Bounds.translate = function(bounds, vector) {
          bounds.min.x += vector.x;
          bounds.max.x += vector.x;
          bounds.min.y += vector.y;
          bounds.max.y += vector.y;
      };

      /**
       * Shifts the bounds to the given position.
       * @method shift
       * @param {bounds} bounds
       * @param {vector} position
       */
      Bounds.shift = function(bounds, position) {
          var deltaX = bounds.max.x - bounds.min.x,
              deltaY = bounds.max.y - bounds.min.y;
              
          bounds.min.x = position.x;
          bounds.max.x = position.x + deltaX;
          bounds.min.y = position.y;
          bounds.max.y = position.y + deltaY;
      };
      
  })();


  /***/ }),
  /* 2 */
  /***/ (function(module, exports) {

  /**
  * The `Matter.Vector` module contains methods for creating and manipulating vectors.
  * Vectors are the basis of all the geometry related operations in the engine.
  * A `Matter.Vector` object is of the form `{ x: 0, y: 0 }`.
  *
  * See the included usage [examples](https://github.com/liabru/matter-js/tree/master/examples).
  *
  * @class Vector
  */

  // TODO: consider params for reusing vector objects

  var Vector = {};

  module.exports = Vector;

  (function() {

      /**
       * Creates a new vector.
       * @method create
       * @param {number} x
       * @param {number} y
       * @return {vector} A new vector
       */
      Vector.create = function(x, y) {
          return { x: x || 0, y: y || 0 };
      };

      /**
       * Returns a new vector with `x` and `y` copied from the given `vector`.
       * @method clone
       * @param {vector} vector
       * @return {vector} A new cloned vector
       */
      Vector.clone = function(vector) {
          return { x: vector.x, y: vector.y };
      };

      /**
       * Returns the magnitude (length) of a vector.
       * @method magnitude
       * @param {vector} vector
       * @return {number} The magnitude of the vector
       */
      Vector.magnitude = function(vector) {
          return Math.sqrt((vector.x * vector.x) + (vector.y * vector.y));
      };

      /**
       * Returns the magnitude (length) of a vector (therefore saving a `sqrt` operation).
       * @method magnitudeSquared
       * @param {vector} vector
       * @return {number} The squared magnitude of the vector
       */
      Vector.magnitudeSquared = function(vector) {
          return (vector.x * vector.x) + (vector.y * vector.y);
      };

      /**
       * Rotates the vector about (0, 0) by specified angle.
       * @method rotate
       * @param {vector} vector
       * @param {number} angle
       * @param {vector} [output]
       * @return {vector} The vector rotated about (0, 0)
       */
      Vector.rotate = function(vector, angle, output) {
          var cos = Math.cos(angle), sin = Math.sin(angle);
          if (!output) output = {};
          var x = vector.x * cos - vector.y * sin;
          output.y = vector.x * sin + vector.y * cos;
          output.x = x;
          return output;
      };

      /**
       * Rotates the vector about a specified point by specified angle.
       * @method rotateAbout
       * @param {vector} vector
       * @param {number} angle
       * @param {vector} point
       * @param {vector} [output]
       * @return {vector} A new vector rotated about the point
       */
      Vector.rotateAbout = function(vector, angle, point, output) {
          var cos = Math.cos(angle), sin = Math.sin(angle);
          if (!output) output = {};
          var x = point.x + ((vector.x - point.x) * cos - (vector.y - point.y) * sin);
          output.y = point.y + ((vector.x - point.x) * sin + (vector.y - point.y) * cos);
          output.x = x;
          return output;
      };

      /**
       * Normalises a vector (such that its magnitude is `1`).
       * @method normalise
       * @param {vector} vector
       * @return {vector} A new vector normalised
       */
      Vector.normalise = function(vector) {
          var magnitude = Vector.magnitude(vector);
          if (magnitude === 0)
              return { x: 0, y: 0 };
          return { x: vector.x / magnitude, y: vector.y / magnitude };
      };

      /**
       * Returns the dot-product of two vectors.
       * @method dot
       * @param {vector} vectorA
       * @param {vector} vectorB
       * @return {number} The dot product of the two vectors
       */
      Vector.dot = function(vectorA, vectorB) {
          return (vectorA.x * vectorB.x) + (vectorA.y * vectorB.y);
      };

      /**
       * Returns the cross-product of two vectors.
       * @method cross
       * @param {vector} vectorA
       * @param {vector} vectorB
       * @return {number} The cross product of the two vectors
       */
      Vector.cross = function(vectorA, vectorB) {
          return (vectorA.x * vectorB.y) - (vectorA.y * vectorB.x);
      };

      /**
       * Returns the cross-product of three vectors.
       * @method cross3
       * @param {vector} vectorA
       * @param {vector} vectorB
       * @param {vector} vectorC
       * @return {number} The cross product of the three vectors
       */
      Vector.cross3 = function(vectorA, vectorB, vectorC) {
          return (vectorB.x - vectorA.x) * (vectorC.y - vectorA.y) - (vectorB.y - vectorA.y) * (vectorC.x - vectorA.x);
      };

      /**
       * Adds the two vectors.
       * @method add
       * @param {vector} vectorA
       * @param {vector} vectorB
       * @param {vector} [output]
       * @return {vector} A new vector of vectorA and vectorB added
       */
      Vector.add = function(vectorA, vectorB, output) {
          if (!output) output = {};
          output.x = vectorA.x + vectorB.x;
          output.y = vectorA.y + vectorB.y;
          return output;
      };

      /**
       * Subtracts the two vectors.
       * @method sub
       * @param {vector} vectorA
       * @param {vector} vectorB
       * @param {vector} [output]
       * @return {vector} A new vector of vectorA and vectorB subtracted
       */
      Vector.sub = function(vectorA, vectorB, output) {
          if (!output) output = {};
          output.x = vectorA.x - vectorB.x;
          output.y = vectorA.y - vectorB.y;
          return output;
      };

      /**
       * Multiplies a vector and a scalar.
       * @method mult
       * @param {vector} vector
       * @param {number} scalar
       * @return {vector} A new vector multiplied by scalar
       */
      Vector.mult = function(vector, scalar) {
          return { x: vector.x * scalar, y: vector.y * scalar };
      };

      /**
       * Divides a vector and a scalar.
       * @method div
       * @param {vector} vector
       * @param {number} scalar
       * @return {vector} A new vector divided by scalar
       */
      Vector.div = function(vector, scalar) {
          return { x: vector.x / scalar, y: vector.y / scalar };
      };

      /**
       * Returns the perpendicular vector. Set `negate` to true for the perpendicular in the opposite direction.
       * @method perp
       * @param {vector} vector
       * @param {bool} [negate=false]
       * @return {vector} The perpendicular vector
       */
      Vector.perp = function(vector, negate) {
          negate = negate === true ? -1 : 1;
          return { x: negate * -vector.y, y: negate * vector.x };
      };

      /**
       * Negates both components of a vector such that it points in the opposite direction.
       * @method neg
       * @param {vector} vector
       * @return {vector} The negated vector
       */
      Vector.neg = function(vector) {
          return { x: -vector.x, y: -vector.y };
      };

      /**
       * Returns the angle between the vector `vectorB - vectorA` and the x-axis in radians.
       * @method angle
       * @param {vector} vectorA
       * @param {vector} vectorB
       * @return {number} The angle in radians
       */
      Vector.angle = function(vectorA, vectorB) {
          return Math.atan2(vectorB.y - vectorA.y, vectorB.x - vectorA.x);
      };

      /**
       * Temporary vector pool (not thread-safe).
       * @property _temp
       * @type {vector[]}
       * @private
       */
      Vector._temp = [
          Vector.create(), Vector.create(), 
          Vector.create(), Vector.create(), 
          Vector.create(), Vector.create()
      ];

  })();

  /***/ }),
  /* 3 */
  /***/ (function(module, exports, __webpack_require__) {

  /**
  * The `Matter.Vertices` module contains methods for creating and manipulating sets of vertices.
  * A set of vertices is an array of `Matter.Vector` with additional indexing properties inserted by `Vertices.create`.
  * A `Matter.Body` maintains a set of vertices to represent the shape of the object (its convex hull).
  *
  * See the included usage [examples](https://github.com/liabru/matter-js/tree/master/examples).
  *
  * @class Vertices
  */

  var Vertices = {};

  module.exports = Vertices;

  var Vector = __webpack_require__(2);
  var Common = __webpack_require__(0);

  (function() {

      /**
       * Creates a new set of `Matter.Body` compatible vertices.
       * The `points` argument accepts an array of `Matter.Vector` points orientated around the origin `(0, 0)`, for example:
       *
       *     [{ x: 0, y: 0 }, { x: 25, y: 50 }, { x: 50, y: 0 }]
       *
       * The `Vertices.create` method returns a new array of vertices, which are similar to Matter.Vector objects,
       * but with some additional references required for efficient collision detection routines.
       *
       * Vertices must be specified in clockwise order.
       *
       * Note that the `body` argument is not optional, a `Matter.Body` reference must be provided.
       *
       * @method create
       * @param {vector[]} points
       * @param {body} body
       */
      Vertices.create = function(points, body) {
          var vertices = [];

          for (var i = 0; i < points.length; i++) {
              var point = points[i],
                  vertex = {
                      x: point.x,
                      y: point.y,
                      index: i,
                      body: body,
                      isInternal: false
                  };

              vertices.push(vertex);
          }

          return vertices;
      };

      /**
       * Parses a string containing ordered x y pairs separated by spaces (and optionally commas), 
       * into a `Matter.Vertices` object for the given `Matter.Body`.
       * For parsing SVG paths, see `Svg.pathToVertices`.
       * @method fromPath
       * @param {string} path
       * @param {body} body
       * @return {vertices} vertices
       */
      Vertices.fromPath = function(path, body) {
          var pathPattern = /L?\s*([-\d.e]+)[\s,]*([-\d.e]+)*/ig,
              points = [];

          path.replace(pathPattern, function(match, x, y) {
              points.push({ x: parseFloat(x), y: parseFloat(y) });
          });

          return Vertices.create(points, body);
      };

      /**
       * Returns the centre (centroid) of the set of vertices.
       * @method centre
       * @param {vertices} vertices
       * @return {vector} The centre point
       */
      Vertices.centre = function(vertices) {
          var area = Vertices.area(vertices, true),
              centre = { x: 0, y: 0 },
              cross,
              temp,
              j;

          for (var i = 0; i < vertices.length; i++) {
              j = (i + 1) % vertices.length;
              cross = Vector.cross(vertices[i], vertices[j]);
              temp = Vector.mult(Vector.add(vertices[i], vertices[j]), cross);
              centre = Vector.add(centre, temp);
          }

          return Vector.div(centre, 6 * area);
      };

      /**
       * Returns the average (mean) of the set of vertices.
       * @method mean
       * @param {vertices} vertices
       * @return {vector} The average point
       */
      Vertices.mean = function(vertices) {
          var average = { x: 0, y: 0 };

          for (var i = 0; i < vertices.length; i++) {
              average.x += vertices[i].x;
              average.y += vertices[i].y;
          }

          return Vector.div(average, vertices.length);
      };

      /**
       * Returns the area of the set of vertices.
       * @method area
       * @param {vertices} vertices
       * @param {bool} signed
       * @return {number} The area
       */
      Vertices.area = function(vertices, signed) {
          var area = 0,
              j = vertices.length - 1;

          for (var i = 0; i < vertices.length; i++) {
              area += (vertices[j].x - vertices[i].x) * (vertices[j].y + vertices[i].y);
              j = i;
          }

          if (signed)
              return area / 2;

          return Math.abs(area) / 2;
      };

      /**
       * Returns the moment of inertia (second moment of area) of the set of vertices given the total mass.
       * @method inertia
       * @param {vertices} vertices
       * @param {number} mass
       * @return {number} The polygon's moment of inertia
       */
      Vertices.inertia = function(vertices, mass) {
          var numerator = 0,
              denominator = 0,
              v = vertices,
              cross,
              j;

          // find the polygon's moment of inertia, using second moment of area
          // from equations at http://www.physicsforums.com/showthread.php?t=25293
          for (var n = 0; n < v.length; n++) {
              j = (n + 1) % v.length;
              cross = Math.abs(Vector.cross(v[j], v[n]));
              numerator += cross * (Vector.dot(v[j], v[j]) + Vector.dot(v[j], v[n]) + Vector.dot(v[n], v[n]));
              denominator += cross;
          }

          return (mass / 6) * (numerator / denominator);
      };

      /**
       * Translates the set of vertices in-place.
       * @method translate
       * @param {vertices} vertices
       * @param {vector} vector
       * @param {number} scalar
       */
      Vertices.translate = function(vertices, vector, scalar) {
          scalar = typeof scalar !== 'undefined' ? scalar : 1;

          var verticesLength = vertices.length,
              translateX = vector.x * scalar,
              translateY = vector.y * scalar,
              i;
          
          for (i = 0; i < verticesLength; i++) {
              vertices[i].x += translateX;
              vertices[i].y += translateY;
          }

          return vertices;
      };

      /**
       * Rotates the set of vertices in-place.
       * @method rotate
       * @param {vertices} vertices
       * @param {number} angle
       * @param {vector} point
       */
      Vertices.rotate = function(vertices, angle, point) {
          if (angle === 0)
              return;

          var cos = Math.cos(angle),
              sin = Math.sin(angle),
              pointX = point.x,
              pointY = point.y,
              verticesLength = vertices.length,
              vertex,
              dx,
              dy,
              i;

          for (i = 0; i < verticesLength; i++) {
              vertex = vertices[i];
              dx = vertex.x - pointX;
              dy = vertex.y - pointY;
              vertex.x = pointX + (dx * cos - dy * sin);
              vertex.y = pointY + (dx * sin + dy * cos);
          }

          return vertices;
      };

      /**
       * Returns `true` if the `point` is inside the set of `vertices`.
       * @method contains
       * @param {vertices} vertices
       * @param {vector} point
       * @return {boolean} True if the vertices contains point, otherwise false
       */
      Vertices.contains = function(vertices, point) {
          var pointX = point.x,
              pointY = point.y,
              verticesLength = vertices.length,
              vertex = vertices[verticesLength - 1],
              nextVertex;

          for (var i = 0; i < verticesLength; i++) {
              nextVertex = vertices[i];

              if ((pointX - vertex.x) * (nextVertex.y - vertex.y) 
                  + (pointY - vertex.y) * (vertex.x - nextVertex.x) > 0) {
                  return false;
              }

              vertex = nextVertex;
          }

          return true;
      };

      /**
       * Scales the vertices from a point (default is centre) in-place.
       * @method scale
       * @param {vertices} vertices
       * @param {number} scaleX
       * @param {number} scaleY
       * @param {vector} point
       */
      Vertices.scale = function(vertices, scaleX, scaleY, point) {
          if (scaleX === 1 && scaleY === 1)
              return vertices;

          point = point || Vertices.centre(vertices);

          var vertex,
              delta;

          for (var i = 0; i < vertices.length; i++) {
              vertex = vertices[i];
              delta = Vector.sub(vertex, point);
              vertices[i].x = point.x + delta.x * scaleX;
              vertices[i].y = point.y + delta.y * scaleY;
          }

          return vertices;
      };

      /**
       * Chamfers a set of vertices by giving them rounded corners, returns a new set of vertices.
       * The radius parameter is a single number or an array to specify the radius for each vertex.
       * @method chamfer
       * @param {vertices} vertices
       * @param {number[]} radius
       * @param {number} quality
       * @param {number} qualityMin
       * @param {number} qualityMax
       */
      Vertices.chamfer = function(vertices, radius, quality, qualityMin, qualityMax) {
          if (typeof radius === 'number') {
              radius = [radius];
          } else {
              radius = radius || [8];
          }

          // quality defaults to -1, which is auto
          quality = (typeof quality !== 'undefined') ? quality : -1;
          qualityMin = qualityMin || 2;
          qualityMax = qualityMax || 14;

          var newVertices = [];

          for (var i = 0; i < vertices.length; i++) {
              var prevVertex = vertices[i - 1 >= 0 ? i - 1 : vertices.length - 1],
                  vertex = vertices[i],
                  nextVertex = vertices[(i + 1) % vertices.length],
                  currentRadius = radius[i < radius.length ? i : radius.length - 1];

              if (currentRadius === 0) {
                  newVertices.push(vertex);
                  continue;
              }

              var prevNormal = Vector.normalise({ 
                  x: vertex.y - prevVertex.y, 
                  y: prevVertex.x - vertex.x
              });

              var nextNormal = Vector.normalise({ 
                  x: nextVertex.y - vertex.y, 
                  y: vertex.x - nextVertex.x
              });

              var diagonalRadius = Math.sqrt(2 * Math.pow(currentRadius, 2)),
                  radiusVector = Vector.mult(Common.clone(prevNormal), currentRadius),
                  midNormal = Vector.normalise(Vector.mult(Vector.add(prevNormal, nextNormal), 0.5)),
                  scaledVertex = Vector.sub(vertex, Vector.mult(midNormal, diagonalRadius));

              var precision = quality;

              if (quality === -1) {
                  // automatically decide precision
                  precision = Math.pow(currentRadius, 0.32) * 1.75;
              }

              precision = Common.clamp(precision, qualityMin, qualityMax);

              // use an even value for precision, more likely to reduce axes by using symmetry
              if (precision % 2 === 1)
                  precision += 1;

              var alpha = Math.acos(Vector.dot(prevNormal, nextNormal)),
                  theta = alpha / precision;

              for (var j = 0; j < precision; j++) {
                  newVertices.push(Vector.add(Vector.rotate(radiusVector, theta * j), scaledVertex));
              }
          }

          return newVertices;
      };

      /**
       * Sorts the input vertices into clockwise order in place.
       * @method clockwiseSort
       * @param {vertices} vertices
       * @return {vertices} vertices
       */
      Vertices.clockwiseSort = function(vertices) {
          var centre = Vertices.mean(vertices);

          vertices.sort(function(vertexA, vertexB) {
              return Vector.angle(centre, vertexA) - Vector.angle(centre, vertexB);
          });

          return vertices;
      };

      /**
       * Returns true if the vertices form a convex shape (vertices must be in clockwise order).
       * @method isConvex
       * @param {vertices} vertices
       * @return {bool} `true` if the `vertices` are convex, `false` if not (or `null` if not computable).
       */
      Vertices.isConvex = function(vertices) {
          // http://paulbourke.net/geometry/polygonmesh/
          // Copyright (c) Paul Bourke (use permitted)

          var flag = 0,
              n = vertices.length,
              i,
              j,
              k,
              z;

          if (n < 3)
              return null;

          for (i = 0; i < n; i++) {
              j = (i + 1) % n;
              k = (i + 2) % n;
              z = (vertices[j].x - vertices[i].x) * (vertices[k].y - vertices[j].y);
              z -= (vertices[j].y - vertices[i].y) * (vertices[k].x - vertices[j].x);

              if (z < 0) {
                  flag |= 1;
              } else if (z > 0) {
                  flag |= 2;
              }

              if (flag === 3) {
                  return false;
              }
          }

          if (flag !== 0){
              return true;
          } else {
              return null;
          }
      };

      /**
       * Returns the convex hull of the input vertices as a new array of points.
       * @method hull
       * @param {vertices} vertices
       * @return [vertex] vertices
       */
      Vertices.hull = function(vertices) {
          // http://geomalgorithms.com/a10-_hull-1.html

          var upper = [],
              lower = [], 
              vertex,
              i;

          // sort vertices on x-axis (y-axis for ties)
          vertices = vertices.slice(0);
          vertices.sort(function(vertexA, vertexB) {
              var dx = vertexA.x - vertexB.x;
              return dx !== 0 ? dx : vertexA.y - vertexB.y;
          });

          // build lower hull
          for (i = 0; i < vertices.length; i += 1) {
              vertex = vertices[i];

              while (lower.length >= 2 
                     && Vector.cross3(lower[lower.length - 2], lower[lower.length - 1], vertex) <= 0) {
                  lower.pop();
              }

              lower.push(vertex);
          }

          // build upper hull
          for (i = vertices.length - 1; i >= 0; i -= 1) {
              vertex = vertices[i];

              while (upper.length >= 2 
                     && Vector.cross3(upper[upper.length - 2], upper[upper.length - 1], vertex) <= 0) {
                  upper.pop();
              }

              upper.push(vertex);
          }

          // concatenation of the lower and upper hulls gives the convex hull
          // omit last points because they are repeated at the beginning of the other list
          upper.pop();
          lower.pop();

          return upper.concat(lower);
      };

  })();


  /***/ }),
  /* 4 */
  /***/ (function(module, exports, __webpack_require__) {

  /**
  * The `Matter.Events` module contains methods to fire and listen to events on other objects.
  *
  * See the included usage [examples](https://github.com/liabru/matter-js/tree/master/examples).
  *
  * @class Events
  */

  var Events = {};

  module.exports = Events;

  var Common = __webpack_require__(0);

  (function() {

      /**
       * Subscribes a callback function to the given object's `eventName`.
       * @method on
       * @param {} object
       * @param {string} eventNames
       * @param {function} callback
       */
      Events.on = function(object, eventNames, callback) {
          var names = eventNames.split(' '),
              name;

          for (var i = 0; i < names.length; i++) {
              name = names[i];
              object.events = object.events || {};
              object.events[name] = object.events[name] || [];
              object.events[name].push(callback);
          }

          return callback;
      };

      /**
       * Removes the given event callback. If no callback, clears all callbacks in `eventNames`. If no `eventNames`, clears all events.
       * @method off
       * @param {} object
       * @param {string} eventNames
       * @param {function} callback
       */
      Events.off = function(object, eventNames, callback) {
          if (!eventNames) {
              object.events = {};
              return;
          }

          // handle Events.off(object, callback)
          if (typeof eventNames === 'function') {
              callback = eventNames;
              eventNames = Common.keys(object.events).join(' ');
          }

          var names = eventNames.split(' ');

          for (var i = 0; i < names.length; i++) {
              var callbacks = object.events[names[i]],
                  newCallbacks = [];

              if (callback && callbacks) {
                  for (var j = 0; j < callbacks.length; j++) {
                      if (callbacks[j] !== callback)
                          newCallbacks.push(callbacks[j]);
                  }
              }

              object.events[names[i]] = newCallbacks;
          }
      };

      /**
       * Fires all the callbacks subscribed to the given object's `eventName`, in the order they subscribed, if any.
       * @method trigger
       * @param {} object
       * @param {string} eventNames
       * @param {} event
       */
      Events.trigger = function(object, eventNames, event) {
          var names,
              name,
              callbacks,
              eventClone;

          var events = object.events;
          
          if (events && Common.keys(events).length > 0) {
              if (!event)
                  event = {};

              names = eventNames.split(' ');

              for (var i = 0; i < names.length; i++) {
                  name = names[i];
                  callbacks = events[name];

                  if (callbacks) {
                      eventClone = Common.clone(event, false);
                      eventClone.name = name;
                      eventClone.source = object;

                      for (var j = 0; j < callbacks.length; j++) {
                          callbacks[j].apply(object, [eventClone]);
                      }
                  }
              }
          }
      };

  })();


  /***/ }),
  /* 5 */
  /***/ (function(module, exports, __webpack_require__) {

  /**
  * A composite is a collection of `Matter.Body`, `Matter.Constraint` and other `Matter.Composite` objects.
  *
  * They are a container that can represent complex objects made of multiple parts, even if they are not physically connected.
  * A composite could contain anything from a single body all the way up to a whole world.
  * 
  * When making any changes to composites, use the included functions rather than changing their properties directly.
  *
  * See the included usage [examples](https://github.com/liabru/matter-js/tree/master/examples).
  *
  * @class Composite
  */

  var Composite = {};

  module.exports = Composite;

  var Events = __webpack_require__(4);
  var Common = __webpack_require__(0);
  var Bounds = __webpack_require__(1);
  var Body = __webpack_require__(6);

  (function() {

      /**
       * Creates a new composite. The options parameter is an object that specifies any properties you wish to override the defaults.
       * See the properites section below for detailed information on what you can pass via the `options` object.
       * @method create
       * @param {} [options]
       * @return {composite} A new composite
       */
      Composite.create = function(options) {
          return Common.extend({ 
              id: Common.nextId(),
              type: 'composite',
              parent: null,
              isModified: false,
              bodies: [], 
              constraints: [], 
              composites: [],
              label: 'Composite',
              plugin: {},
              cache: {
                  allBodies: null,
                  allConstraints: null,
                  allComposites: null
              }
          }, options);
      };

      /**
       * Sets the composite's `isModified` flag. 
       * If `updateParents` is true, all parents will be set (default: false).
       * If `updateChildren` is true, all children will be set (default: false).
       * @private
       * @method setModified
       * @param {composite} composite
       * @param {boolean} isModified
       * @param {boolean} [updateParents=false]
       * @param {boolean} [updateChildren=false]
       */
      Composite.setModified = function(composite, isModified, updateParents, updateChildren) {
          composite.isModified = isModified;

          if (isModified && composite.cache) {
              composite.cache.allBodies = null;
              composite.cache.allConstraints = null;
              composite.cache.allComposites = null;
          }

          if (updateParents && composite.parent) {
              Composite.setModified(composite.parent, isModified, updateParents, updateChildren);
          }

          if (updateChildren) {
              for (var i = 0; i < composite.composites.length; i++) {
                  var childComposite = composite.composites[i];
                  Composite.setModified(childComposite, isModified, updateParents, updateChildren);
              }
          }
      };

      /**
       * Generic single or multi-add function. Adds a single or an array of body(s), constraint(s) or composite(s) to the given composite.
       * Triggers `beforeAdd` and `afterAdd` events on the `composite`.
       * @method add
       * @param {composite} composite
       * @param {object|array} object A single or an array of body(s), constraint(s) or composite(s)
       * @return {composite} The original composite with the objects added
       */
      Composite.add = function(composite, object) {
          var objects = [].concat(object);

          Events.trigger(composite, 'beforeAdd', { object: object });

          for (var i = 0; i < objects.length; i++) {
              var obj = objects[i];

              switch (obj.type) {

              case 'body':
                  // skip adding compound parts
                  if (obj.parent !== obj) {
                      Common.warn('Composite.add: skipped adding a compound body part (you must add its parent instead)');
                      break;
                  }

                  Composite.addBody(composite, obj);
                  break;
              case 'constraint':
                  Composite.addConstraint(composite, obj);
                  break;
              case 'composite':
                  Composite.addComposite(composite, obj);
                  break;
              case 'mouseConstraint':
                  Composite.addConstraint(composite, obj.constraint);
                  break;

              }
          }

          Events.trigger(composite, 'afterAdd', { object: object });

          return composite;
      };

      /**
       * Generic remove function. Removes one or many body(s), constraint(s) or a composite(s) to the given composite.
       * Optionally searching its children recursively.
       * Triggers `beforeRemove` and `afterRemove` events on the `composite`.
       * @method remove
       * @param {composite} composite
       * @param {object|array} object
       * @param {boolean} [deep=false]
       * @return {composite} The original composite with the objects removed
       */
      Composite.remove = function(composite, object, deep) {
          var objects = [].concat(object);

          Events.trigger(composite, 'beforeRemove', { object: object });

          for (var i = 0; i < objects.length; i++) {
              var obj = objects[i];

              switch (obj.type) {

              case 'body':
                  Composite.removeBody(composite, obj, deep);
                  break;
              case 'constraint':
                  Composite.removeConstraint(composite, obj, deep);
                  break;
              case 'composite':
                  Composite.removeComposite(composite, obj, deep);
                  break;
              case 'mouseConstraint':
                  Composite.removeConstraint(composite, obj.constraint);
                  break;

              }
          }

          Events.trigger(composite, 'afterRemove', { object: object });

          return composite;
      };

      /**
       * Adds a composite to the given composite.
       * @private
       * @method addComposite
       * @param {composite} compositeA
       * @param {composite} compositeB
       * @return {composite} The original compositeA with the objects from compositeB added
       */
      Composite.addComposite = function(compositeA, compositeB) {
          compositeA.composites.push(compositeB);
          compositeB.parent = compositeA;
          Composite.setModified(compositeA, true, true, false);
          return compositeA;
      };

      /**
       * Removes a composite from the given composite, and optionally searching its children recursively.
       * @private
       * @method removeComposite
       * @param {composite} compositeA
       * @param {composite} compositeB
       * @param {boolean} [deep=false]
       * @return {composite} The original compositeA with the composite removed
       */
      Composite.removeComposite = function(compositeA, compositeB, deep) {
          var position = Common.indexOf(compositeA.composites, compositeB);
          if (position !== -1) {
              Composite.removeCompositeAt(compositeA, position);
          }

          if (deep) {
              for (var i = 0; i < compositeA.composites.length; i++){
                  Composite.removeComposite(compositeA.composites[i], compositeB, true);
              }
          }

          return compositeA;
      };

      /**
       * Removes a composite from the given composite.
       * @private
       * @method removeCompositeAt
       * @param {composite} composite
       * @param {number} position
       * @return {composite} The original composite with the composite removed
       */
      Composite.removeCompositeAt = function(composite, position) {
          composite.composites.splice(position, 1);
          Composite.setModified(composite, true, true, false);
          return composite;
      };

      /**
       * Adds a body to the given composite.
       * @private
       * @method addBody
       * @param {composite} composite
       * @param {body} body
       * @return {composite} The original composite with the body added
       */
      Composite.addBody = function(composite, body) {
          composite.bodies.push(body);
          Composite.setModified(composite, true, true, false);
          return composite;
      };

      /**
       * Removes a body from the given composite, and optionally searching its children recursively.
       * @private
       * @method removeBody
       * @param {composite} composite
       * @param {body} body
       * @param {boolean} [deep=false]
       * @return {composite} The original composite with the body removed
       */
      Composite.removeBody = function(composite, body, deep) {
          var position = Common.indexOf(composite.bodies, body);
          if (position !== -1) {
              Composite.removeBodyAt(composite, position);
          }

          if (deep) {
              for (var i = 0; i < composite.composites.length; i++){
                  Composite.removeBody(composite.composites[i], body, true);
              }
          }

          return composite;
      };

      /**
       * Removes a body from the given composite.
       * @private
       * @method removeBodyAt
       * @param {composite} composite
       * @param {number} position
       * @return {composite} The original composite with the body removed
       */
      Composite.removeBodyAt = function(composite, position) {
          composite.bodies.splice(position, 1);
          Composite.setModified(composite, true, true, false);
          return composite;
      };

      /**
       * Adds a constraint to the given composite.
       * @private
       * @method addConstraint
       * @param {composite} composite
       * @param {constraint} constraint
       * @return {composite} The original composite with the constraint added
       */
      Composite.addConstraint = function(composite, constraint) {
          composite.constraints.push(constraint);
          Composite.setModified(composite, true, true, false);
          return composite;
      };

      /**
       * Removes a constraint from the given composite, and optionally searching its children recursively.
       * @private
       * @method removeConstraint
       * @param {composite} composite
       * @param {constraint} constraint
       * @param {boolean} [deep=false]
       * @return {composite} The original composite with the constraint removed
       */
      Composite.removeConstraint = function(composite, constraint, deep) {
          var position = Common.indexOf(composite.constraints, constraint);
          if (position !== -1) {
              Composite.removeConstraintAt(composite, position);
          }

          if (deep) {
              for (var i = 0; i < composite.composites.length; i++){
                  Composite.removeConstraint(composite.composites[i], constraint, true);
              }
          }

          return composite;
      };

      /**
       * Removes a body from the given composite.
       * @private
       * @method removeConstraintAt
       * @param {composite} composite
       * @param {number} position
       * @return {composite} The original composite with the constraint removed
       */
      Composite.removeConstraintAt = function(composite, position) {
          composite.constraints.splice(position, 1);
          Composite.setModified(composite, true, true, false);
          return composite;
      };

      /**
       * Removes all bodies, constraints and composites from the given composite.
       * Optionally clearing its children recursively.
       * @method clear
       * @param {composite} composite
       * @param {boolean} keepStatic
       * @param {boolean} [deep=false]
       */
      Composite.clear = function(composite, keepStatic, deep) {
          if (deep) {
              for (var i = 0; i < composite.composites.length; i++){
                  Composite.clear(composite.composites[i], keepStatic, true);
              }
          }
          
          if (keepStatic) {
              composite.bodies = composite.bodies.filter(function(body) { return body.isStatic; });
          } else {
              composite.bodies.length = 0;
          }

          composite.constraints.length = 0;
          composite.composites.length = 0;

          Composite.setModified(composite, true, true, false);

          return composite;
      };

      /**
       * Returns all bodies in the given composite, including all bodies in its children, recursively.
       * @method allBodies
       * @param {composite} composite
       * @return {body[]} All the bodies
       */
      Composite.allBodies = function(composite) {
          if (composite.cache && composite.cache.allBodies) {
              return composite.cache.allBodies;
          }

          var bodies = [].concat(composite.bodies);

          for (var i = 0; i < composite.composites.length; i++)
              bodies = bodies.concat(Composite.allBodies(composite.composites[i]));

          if (composite.cache) {
              composite.cache.allBodies = bodies;
          }

          return bodies;
      };

      /**
       * Returns all constraints in the given composite, including all constraints in its children, recursively.
       * @method allConstraints
       * @param {composite} composite
       * @return {constraint[]} All the constraints
       */
      Composite.allConstraints = function(composite) {
          if (composite.cache && composite.cache.allConstraints) {
              return composite.cache.allConstraints;
          }

          var constraints = [].concat(composite.constraints);

          for (var i = 0; i < composite.composites.length; i++)
              constraints = constraints.concat(Composite.allConstraints(composite.composites[i]));

          if (composite.cache) {
              composite.cache.allConstraints = constraints;
          }

          return constraints;
      };

      /**
       * Returns all composites in the given composite, including all composites in its children, recursively.
       * @method allComposites
       * @param {composite} composite
       * @return {composite[]} All the composites
       */
      Composite.allComposites = function(composite) {
          if (composite.cache && composite.cache.allComposites) {
              return composite.cache.allComposites;
          }

          var composites = [].concat(composite.composites);

          for (var i = 0; i < composite.composites.length; i++)
              composites = composites.concat(Composite.allComposites(composite.composites[i]));

          if (composite.cache) {
              composite.cache.allComposites = composites;
          }

          return composites;
      };

      /**
       * Searches the composite recursively for an object matching the type and id supplied, null if not found.
       * @method get
       * @param {composite} composite
       * @param {number} id
       * @param {string} type
       * @return {object} The requested object, if found
       */
      Composite.get = function(composite, id, type) {
          var objects,
              object;

          switch (type) {
          case 'body':
              objects = Composite.allBodies(composite);
              break;
          case 'constraint':
              objects = Composite.allConstraints(composite);
              break;
          case 'composite':
              objects = Composite.allComposites(composite).concat(composite);
              break;
          }

          if (!objects)
              return null;

          object = objects.filter(function(object) { 
              return object.id.toString() === id.toString(); 
          });

          return object.length === 0 ? null : object[0];
      };

      /**
       * Moves the given object(s) from compositeA to compositeB (equal to a remove followed by an add).
       * @method move
       * @param {compositeA} compositeA
       * @param {object[]} objects
       * @param {compositeB} compositeB
       * @return {composite} Returns compositeA
       */
      Composite.move = function(compositeA, objects, compositeB) {
          Composite.remove(compositeA, objects);
          Composite.add(compositeB, objects);
          return compositeA;
      };

      /**
       * Assigns new ids for all objects in the composite, recursively.
       * @method rebase
       * @param {composite} composite
       * @return {composite} Returns composite
       */
      Composite.rebase = function(composite) {
          var objects = Composite.allBodies(composite)
              .concat(Composite.allConstraints(composite))
              .concat(Composite.allComposites(composite));

          for (var i = 0; i < objects.length; i++) {
              objects[i].id = Common.nextId();
          }

          return composite;
      };

      /**
       * Translates all children in the composite by a given vector relative to their current positions, 
       * without imparting any velocity.
       * @method translate
       * @param {composite} composite
       * @param {vector} translation
       * @param {bool} [recursive=true]
       */
      Composite.translate = function(composite, translation, recursive) {
          var bodies = recursive ? Composite.allBodies(composite) : composite.bodies;

          for (var i = 0; i < bodies.length; i++) {
              Body.translate(bodies[i], translation);
          }

          return composite;
      };

      /**
       * Rotates all children in the composite by a given angle about the given point, without imparting any angular velocity.
       * @method rotate
       * @param {composite} composite
       * @param {number} rotation
       * @param {vector} point
       * @param {bool} [recursive=true]
       */
      Composite.rotate = function(composite, rotation, point, recursive) {
          var cos = Math.cos(rotation),
              sin = Math.sin(rotation),
              bodies = recursive ? Composite.allBodies(composite) : composite.bodies;

          for (var i = 0; i < bodies.length; i++) {
              var body = bodies[i],
                  dx = body.position.x - point.x,
                  dy = body.position.y - point.y;
                  
              Body.setPosition(body, {
                  x: point.x + (dx * cos - dy * sin),
                  y: point.y + (dx * sin + dy * cos)
              });

              Body.rotate(body, rotation);
          }

          return composite;
      };

      /**
       * Scales all children in the composite, including updating physical properties (mass, area, axes, inertia), from a world-space point.
       * @method scale
       * @param {composite} composite
       * @param {number} scaleX
       * @param {number} scaleY
       * @param {vector} point
       * @param {bool} [recursive=true]
       */
      Composite.scale = function(composite, scaleX, scaleY, point, recursive) {
          var bodies = recursive ? Composite.allBodies(composite) : composite.bodies;

          for (var i = 0; i < bodies.length; i++) {
              var body = bodies[i],
                  dx = body.position.x - point.x,
                  dy = body.position.y - point.y;
                  
              Body.setPosition(body, {
                  x: point.x + dx * scaleX,
                  y: point.y + dy * scaleY
              });

              Body.scale(body, scaleX, scaleY);
          }

          return composite;
      };

      /**
       * Returns the union of the bounds of all of the composite's bodies.
       * @method bounds
       * @param {composite} composite The composite.
       * @returns {bounds} The composite bounds.
       */
      Composite.bounds = function(composite) {
          var bodies = Composite.allBodies(composite),
              vertices = [];

          for (var i = 0; i < bodies.length; i += 1) {
              var body = bodies[i];
              vertices.push(body.bounds.min, body.bounds.max);
          }

          return Bounds.create(vertices);
      };

      /*
      *
      *  Events Documentation
      *
      */

      /**
      * Fired when a call to `Composite.add` is made, before objects have been added.
      *
      * @event beforeAdd
      * @param {} event An event object
      * @param {} event.object The object(s) to be added (may be a single body, constraint, composite or a mixed array of these)
      * @param {} event.source The source object of the event
      * @param {} event.name The name of the event
      */

      /**
      * Fired when a call to `Composite.add` is made, after objects have been added.
      *
      * @event afterAdd
      * @param {} event An event object
      * @param {} event.object The object(s) that have been added (may be a single body, constraint, composite or a mixed array of these)
      * @param {} event.source The source object of the event
      * @param {} event.name The name of the event
      */

      /**
      * Fired when a call to `Composite.remove` is made, before objects have been removed.
      *
      * @event beforeRemove
      * @param {} event An event object
      * @param {} event.object The object(s) to be removed (may be a single body, constraint, composite or a mixed array of these)
      * @param {} event.source The source object of the event
      * @param {} event.name The name of the event
      */

      /**
      * Fired when a call to `Composite.remove` is made, after objects have been removed.
      *
      * @event afterRemove
      * @param {} event An event object
      * @param {} event.object The object(s) that have been removed (may be a single body, constraint, composite or a mixed array of these)
      * @param {} event.source The source object of the event
      * @param {} event.name The name of the event
      */

      /*
      *
      *  Properties Documentation
      *
      */

      /**
       * An integer `Number` uniquely identifying number generated in `Composite.create` by `Common.nextId`.
       *
       * @property id
       * @type number
       */

      /**
       * A `String` denoting the type of object.
       *
       * @property type
       * @type string
       * @default "composite"
       * @readOnly
       */

      /**
       * An arbitrary `String` name to help the user identify and manage composites.
       *
       * @property label
       * @type string
       * @default "Composite"
       */

      /**
       * A flag that specifies whether the composite has been modified during the current step.
       * This is automatically managed when bodies, constraints or composites are added or removed.
       *
       * @property isModified
       * @type boolean
       * @default false
       */

      /**
       * The `Composite` that is the parent of this composite. It is automatically managed by the `Matter.Composite` methods.
       *
       * @property parent
       * @type composite
       * @default null
       */

      /**
       * An array of `Body` that are _direct_ children of this composite.
       * To add or remove bodies you should use `Composite.add` and `Composite.remove` methods rather than directly modifying this property.
       * If you wish to recursively find all descendants, you should use the `Composite.allBodies` method.
       *
       * @property bodies
       * @type body[]
       * @default []
       */

      /**
       * An array of `Constraint` that are _direct_ children of this composite.
       * To add or remove constraints you should use `Composite.add` and `Composite.remove` methods rather than directly modifying this property.
       * If you wish to recursively find all descendants, you should use the `Composite.allConstraints` method.
       *
       * @property constraints
       * @type constraint[]
       * @default []
       */

      /**
       * An array of `Composite` that are _direct_ children of this composite.
       * To add or remove composites you should use `Composite.add` and `Composite.remove` methods rather than directly modifying this property.
       * If you wish to recursively find all descendants, you should use the `Composite.allComposites` method.
       *
       * @property composites
       * @type composite[]
       * @default []
       */

      /**
       * An object reserved for storing plugin-specific properties.
       *
       * @property plugin
       * @type {}
       */

      /**
       * An object used for storing cached results for performance reasons.
       * This is used internally only and is automatically managed.
       *
       * @private
       * @property cache
       * @type {}
       */

  })();


  /***/ }),
  /* 6 */
  /***/ (function(module, exports, __webpack_require__) {

  /**
  * The `Matter.Body` module contains methods for creating and manipulating body models.
  * A `Matter.Body` is a rigid body that can be simulated by a `Matter.Engine`.
  * Factories for commonly used body configurations (such as rectangles, circles and other polygons) can be found in the module `Matter.Bodies`.
  *
  * See the included usage [examples](https://github.com/liabru/matter-js/tree/master/examples).

  * @class Body
  */

  var Body = {};

  module.exports = Body;

  var Vertices = __webpack_require__(3);
  var Vector = __webpack_require__(2);
  var Sleeping = __webpack_require__(7);
  __webpack_require__(16);
  var Common = __webpack_require__(0);
  var Bounds = __webpack_require__(1);
  var Axes = __webpack_require__(11);

  (function() {

      Body._inertiaScale = 4;
      Body._nextCollidingGroupId = 1;
      Body._nextNonCollidingGroupId = -1;
      Body._nextCategory = 0x0001;

      /**
       * Creates a new rigid body model. The options parameter is an object that specifies any properties you wish to override the defaults.
       * All properties have default values, and many are pre-calculated automatically based on other properties.
       * Vertices must be specified in clockwise order.
       * See the properties section below for detailed information on what you can pass via the `options` object.
       * @method create
       * @param {} options
       * @return {body} body
       */
      Body.create = function(options) {
          var defaults = {
              id: Common.nextId(),
              type: 'body',
              label: 'Body',
              parts: [],
              plugin: {},
              angle: 0,
              vertices: Vertices.fromPath('L 0 0 L 40 0 L 40 40 L 0 40'),
              position: { x: 0, y: 0 },
              force: { x: 0, y: 0 },
              torque: 0,
              positionImpulse: { x: 0, y: 0 },
              constraintImpulse: { x: 0, y: 0, angle: 0 },
              totalContacts: 0,
              speed: 0,
              angularSpeed: 0,
              velocity: { x: 0, y: 0 },
              angularVelocity: 0,
              isSensor: false,
              isStatic: false,
              isSleeping: false,
              motion: 0,
              sleepThreshold: 60,
              density: 0.001,
              restitution: 0,
              friction: 0.1,
              frictionStatic: 0.5,
              frictionAir: 0.01,
              collisionFilter: {
                  category: 0x0001,
                  mask: 0xFFFFFFFF,
                  group: 0
              },
              slop: 0.05,
              timeScale: 1,
              render: {
                  visible: true,
                  opacity: 1,
                  strokeStyle: null,
                  fillStyle: null,
                  lineWidth: null,
                  sprite: {
                      xScale: 1,
                      yScale: 1,
                      xOffset: 0,
                      yOffset: 0
                  }
              },
              events: null,
              bounds: null,
              chamfer: null,
              circleRadius: 0,
              positionPrev: null,
              anglePrev: 0,
              parent: null,
              axes: null,
              area: 0,
              mass: 0,
              inertia: 0,
              _original: null
          };

          var body = Common.extend(defaults, options);

          _initProperties(body, options);

          return body;
      };

      /**
       * Returns the next unique group index for which bodies will collide.
       * If `isNonColliding` is `true`, returns the next unique group index for which bodies will _not_ collide.
       * See `body.collisionFilter` for more information.
       * @method nextGroup
       * @param {bool} [isNonColliding=false]
       * @return {Number} Unique group index
       */
      Body.nextGroup = function(isNonColliding) {
          if (isNonColliding)
              return Body._nextNonCollidingGroupId--;

          return Body._nextCollidingGroupId++;
      };

      /**
       * Returns the next unique category bitfield (starting after the initial default category `0x0001`).
       * There are 32 available. See `body.collisionFilter` for more information.
       * @method nextCategory
       * @return {Number} Unique category bitfield
       */
      Body.nextCategory = function() {
          Body._nextCategory = Body._nextCategory << 1;
          return Body._nextCategory;
      };

      /**
       * Initialises body properties.
       * @method _initProperties
       * @private
       * @param {body} body
       * @param {} [options]
       */
      var _initProperties = function(body, options) {
          options = options || {};

          // init required properties (order is important)
          Body.set(body, {
              bounds: body.bounds || Bounds.create(body.vertices),
              positionPrev: body.positionPrev || Vector.clone(body.position),
              anglePrev: body.anglePrev || body.angle,
              vertices: body.vertices,
              parts: body.parts || [body],
              isStatic: body.isStatic,
              isSleeping: body.isSleeping,
              parent: body.parent || body
          });

          Vertices.rotate(body.vertices, body.angle, body.position);
          Axes.rotate(body.axes, body.angle);
          Bounds.update(body.bounds, body.vertices, body.velocity);

          // allow options to override the automatically calculated properties
          Body.set(body, {
              axes: options.axes || body.axes,
              area: options.area || body.area,
              mass: options.mass || body.mass,
              inertia: options.inertia || body.inertia
          });

          // render properties
          var defaultFillStyle = (body.isStatic ? '#14151f' : Common.choose(['#f19648', '#f5d259', '#f55a3c', '#063e7b', '#ececd1'])),
              defaultStrokeStyle = body.isStatic ? '#555' : '#ccc',
              defaultLineWidth = body.isStatic && body.render.fillStyle === null ? 1 : 0;
          body.render.fillStyle = body.render.fillStyle || defaultFillStyle;
          body.render.strokeStyle = body.render.strokeStyle || defaultStrokeStyle;
          body.render.lineWidth = body.render.lineWidth || defaultLineWidth;
          body.render.sprite.xOffset += -(body.bounds.min.x - body.position.x) / (body.bounds.max.x - body.bounds.min.x);
          body.render.sprite.yOffset += -(body.bounds.min.y - body.position.y) / (body.bounds.max.y - body.bounds.min.y);
      };

      /**
       * Given a property and a value (or map of), sets the property(s) on the body, using the appropriate setter functions if they exist.
       * Prefer to use the actual setter functions in performance critical situations.
       * @method set
       * @param {body} body
       * @param {} settings A property name (or map of properties and values) to set on the body.
       * @param {} value The value to set if `settings` is a single property name.
       */
      Body.set = function(body, settings, value) {
          var property;

          if (typeof settings === 'string') {
              property = settings;
              settings = {};
              settings[property] = value;
          }

          for (property in settings) {
              if (!Object.prototype.hasOwnProperty.call(settings, property))
                  continue;

              value = settings[property];
              switch (property) {

              case 'isStatic':
                  Body.setStatic(body, value);
                  break;
              case 'isSleeping':
                  Sleeping.set(body, value);
                  break;
              case 'mass':
                  Body.setMass(body, value);
                  break;
              case 'density':
                  Body.setDensity(body, value);
                  break;
              case 'inertia':
                  Body.setInertia(body, value);
                  break;
              case 'vertices':
                  Body.setVertices(body, value);
                  break;
              case 'position':
                  Body.setPosition(body, value);
                  break;
              case 'angle':
                  Body.setAngle(body, value);
                  break;
              case 'velocity':
                  Body.setVelocity(body, value);
                  break;
              case 'angularVelocity':
                  Body.setAngularVelocity(body, value);
                  break;
              case 'parts':
                  Body.setParts(body, value);
                  break;
              case 'centre':
                  Body.setCentre(body, value);
                  break;
              default:
                  body[property] = value;

              }
          }
      };

      /**
       * Sets the body as static, including isStatic flag and setting mass and inertia to Infinity.
       * @method setStatic
       * @param {body} body
       * @param {bool} isStatic
       */
      Body.setStatic = function(body, isStatic) {
          for (var i = 0; i < body.parts.length; i++) {
              var part = body.parts[i];
              part.isStatic = isStatic;

              if (isStatic) {
                  part._original = {
                      restitution: part.restitution,
                      friction: part.friction,
                      mass: part.mass,
                      inertia: part.inertia,
                      density: part.density,
                      inverseMass: part.inverseMass,
                      inverseInertia: part.inverseInertia
                  };

                  part.restitution = 0;
                  part.friction = 1;
                  part.mass = part.inertia = part.density = Infinity;
                  part.inverseMass = part.inverseInertia = 0;

                  part.positionPrev.x = part.position.x;
                  part.positionPrev.y = part.position.y;
                  part.anglePrev = part.angle;
                  part.angularVelocity = 0;
                  part.speed = 0;
                  part.angularSpeed = 0;
                  part.motion = 0;
              } else if (part._original) {
                  part.restitution = part._original.restitution;
                  part.friction = part._original.friction;
                  part.mass = part._original.mass;
                  part.inertia = part._original.inertia;
                  part.density = part._original.density;
                  part.inverseMass = part._original.inverseMass;
                  part.inverseInertia = part._original.inverseInertia;

                  part._original = null;
              }
          }
      };

      /**
       * Sets the mass of the body. Inverse mass, density and inertia are automatically updated to reflect the change.
       * @method setMass
       * @param {body} body
       * @param {number} mass
       */
      Body.setMass = function(body, mass) {
          var moment = body.inertia / (body.mass / 6);
          body.inertia = moment * (mass / 6);
          body.inverseInertia = 1 / body.inertia;

          body.mass = mass;
          body.inverseMass = 1 / body.mass;
          body.density = body.mass / body.area;
      };

      /**
       * Sets the density of the body. Mass and inertia are automatically updated to reflect the change.
       * @method setDensity
       * @param {body} body
       * @param {number} density
       */
      Body.setDensity = function(body, density) {
          Body.setMass(body, density * body.area);
          body.density = density;
      };

      /**
       * Sets the moment of inertia (i.e. second moment of area) of the body. 
       * Inverse inertia is automatically updated to reflect the change. Mass is not changed.
       * @method setInertia
       * @param {body} body
       * @param {number} inertia
       */
      Body.setInertia = function(body, inertia) {
          body.inertia = inertia;
          body.inverseInertia = 1 / body.inertia;
      };

      /**
       * Sets the body's vertices and updates body properties accordingly, including inertia, area and mass (with respect to `body.density`).
       * Vertices will be automatically transformed to be orientated around their centre of mass as the origin.
       * They are then automatically translated to world space based on `body.position`.
       *
       * The `vertices` argument should be passed as an array of `Matter.Vector` points (or a `Matter.Vertices` array).
       * Vertices must form a convex hull, concave hulls are not supported.
       *
       * @method setVertices
       * @param {body} body
       * @param {vector[]} vertices
       */
      Body.setVertices = function(body, vertices) {
          // change vertices
          if (vertices[0].body === body) {
              body.vertices = vertices;
          } else {
              body.vertices = Vertices.create(vertices, body);
          }

          // update properties
          body.axes = Axes.fromVertices(body.vertices);
          body.area = Vertices.area(body.vertices);
          Body.setMass(body, body.density * body.area);

          // orient vertices around the centre of mass at origin (0, 0)
          var centre = Vertices.centre(body.vertices);
          Vertices.translate(body.vertices, centre, -1);

          // update inertia while vertices are at origin (0, 0)
          Body.setInertia(body, Body._inertiaScale * Vertices.inertia(body.vertices, body.mass));

          // update geometry
          Vertices.translate(body.vertices, body.position);
          Bounds.update(body.bounds, body.vertices, body.velocity);
      };

      /**
       * Sets the parts of the `body` and updates mass, inertia and centroid.
       * Each part will have its parent set to `body`.
       * By default the convex hull will be automatically computed and set on `body`, unless `autoHull` is set to `false.`
       * Note that this method will ensure that the first part in `body.parts` will always be the `body`.
       * @method setParts
       * @param {body} body
       * @param [body] parts
       * @param {bool} [autoHull=true]
       */
      Body.setParts = function(body, parts, autoHull) {
          var i;

          // add all the parts, ensuring that the first part is always the parent body
          parts = parts.slice(0);
          body.parts.length = 0;
          body.parts.push(body);
          body.parent = body;

          for (i = 0; i < parts.length; i++) {
              var part = parts[i];
              if (part !== body) {
                  part.parent = body;
                  body.parts.push(part);
              }
          }

          if (body.parts.length === 1)
              return;

          autoHull = typeof autoHull !== 'undefined' ? autoHull : true;

          // find the convex hull of all parts to set on the parent body
          if (autoHull) {
              var vertices = [];
              for (i = 0; i < parts.length; i++) {
                  vertices = vertices.concat(parts[i].vertices);
              }

              Vertices.clockwiseSort(vertices);

              var hull = Vertices.hull(vertices),
                  hullCentre = Vertices.centre(hull);

              Body.setVertices(body, hull);
              Vertices.translate(body.vertices, hullCentre);
          }

          // sum the properties of all compound parts of the parent body
          var total = Body._totalProperties(body);

          body.area = total.area;
          body.parent = body;
          body.position.x = total.centre.x;
          body.position.y = total.centre.y;
          body.positionPrev.x = total.centre.x;
          body.positionPrev.y = total.centre.y;

          Body.setMass(body, total.mass);
          Body.setInertia(body, total.inertia);
          Body.setPosition(body, total.centre);
      };

      /**
       * Set the centre of mass of the body. 
       * The `centre` is a vector in world-space unless `relative` is set, in which case it is a translation.
       * The centre of mass is the point the body rotates about and can be used to simulate non-uniform density.
       * This is equal to moving `body.position` but not the `body.vertices`.
       * Invalid if the `centre` falls outside the body's convex hull.
       * @method setCentre
       * @param {body} body
       * @param {vector} centre
       * @param {bool} relative
       */
      Body.setCentre = function(body, centre, relative) {
          if (!relative) {
              body.positionPrev.x = centre.x - (body.position.x - body.positionPrev.x);
              body.positionPrev.y = centre.y - (body.position.y - body.positionPrev.y);
              body.position.x = centre.x;
              body.position.y = centre.y;
          } else {
              body.positionPrev.x += centre.x;
              body.positionPrev.y += centre.y;
              body.position.x += centre.x;
              body.position.y += centre.y;
          }
      };

      /**
       * Sets the position of the body instantly. Velocity, angle, force etc. are unchanged.
       * @method setPosition
       * @param {body} body
       * @param {vector} position
       */
      Body.setPosition = function(body, position) {
          var delta = Vector.sub(position, body.position);
          body.positionPrev.x += delta.x;
          body.positionPrev.y += delta.y;

          for (var i = 0; i < body.parts.length; i++) {
              var part = body.parts[i];
              part.position.x += delta.x;
              part.position.y += delta.y;
              Vertices.translate(part.vertices, delta);
              Bounds.update(part.bounds, part.vertices, body.velocity);
          }
      };

      /**
       * Sets the angle of the body instantly. Angular velocity, position, force etc. are unchanged.
       * @method setAngle
       * @param {body} body
       * @param {number} angle
       */
      Body.setAngle = function(body, angle) {
          var delta = angle - body.angle;
          body.anglePrev += delta;

          for (var i = 0; i < body.parts.length; i++) {
              var part = body.parts[i];
              part.angle += delta;
              Vertices.rotate(part.vertices, delta, body.position);
              Axes.rotate(part.axes, delta);
              Bounds.update(part.bounds, part.vertices, body.velocity);
              if (i > 0) {
                  Vector.rotateAbout(part.position, delta, body.position, part.position);
              }
          }
      };

      /**
       * Sets the linear velocity of the body instantly. Position, angle, force etc. are unchanged. See also `Body.applyForce`.
       * @method setVelocity
       * @param {body} body
       * @param {vector} velocity
       */
      Body.setVelocity = function(body, velocity) {
          body.positionPrev.x = body.position.x - velocity.x;
          body.positionPrev.y = body.position.y - velocity.y;
          body.velocity.x = velocity.x;
          body.velocity.y = velocity.y;
          body.speed = Vector.magnitude(body.velocity);
      };

      /**
       * Sets the angular velocity of the body instantly. Position, angle, force etc. are unchanged. See also `Body.applyForce`.
       * @method setAngularVelocity
       * @param {body} body
       * @param {number} velocity
       */
      Body.setAngularVelocity = function(body, velocity) {
          body.anglePrev = body.angle - velocity;
          body.angularVelocity = velocity;
          body.angularSpeed = Math.abs(body.angularVelocity);
      };

      /**
       * Moves a body by a given vector relative to its current position, without imparting any velocity.
       * @method translate
       * @param {body} body
       * @param {vector} translation
       */
      Body.translate = function(body, translation) {
          Body.setPosition(body, Vector.add(body.position, translation));
      };

      /**
       * Rotates a body by a given angle relative to its current angle, without imparting any angular velocity.
       * @method rotate
       * @param {body} body
       * @param {number} rotation
       * @param {vector} [point]
       */
      Body.rotate = function(body, rotation, point) {
          if (!point) {
              Body.setAngle(body, body.angle + rotation);
          } else {
              var cos = Math.cos(rotation),
                  sin = Math.sin(rotation),
                  dx = body.position.x - point.x,
                  dy = body.position.y - point.y;
                  
              Body.setPosition(body, {
                  x: point.x + (dx * cos - dy * sin),
                  y: point.y + (dx * sin + dy * cos)
              });

              Body.setAngle(body, body.angle + rotation);
          }
      };

      /**
       * Scales the body, including updating physical properties (mass, area, axes, inertia), from a world-space point (default is body centre).
       * @method scale
       * @param {body} body
       * @param {number} scaleX
       * @param {number} scaleY
       * @param {vector} [point]
       */
      Body.scale = function(body, scaleX, scaleY, point) {
          var totalArea = 0,
              totalInertia = 0;

          point = point || body.position;

          for (var i = 0; i < body.parts.length; i++) {
              var part = body.parts[i];

              // scale vertices
              Vertices.scale(part.vertices, scaleX, scaleY, point);

              // update properties
              part.axes = Axes.fromVertices(part.vertices);
              part.area = Vertices.area(part.vertices);
              Body.setMass(part, body.density * part.area);

              // update inertia (requires vertices to be at origin)
              Vertices.translate(part.vertices, { x: -part.position.x, y: -part.position.y });
              Body.setInertia(part, Body._inertiaScale * Vertices.inertia(part.vertices, part.mass));
              Vertices.translate(part.vertices, { x: part.position.x, y: part.position.y });

              if (i > 0) {
                  totalArea += part.area;
                  totalInertia += part.inertia;
              }

              // scale position
              part.position.x = point.x + (part.position.x - point.x) * scaleX;
              part.position.y = point.y + (part.position.y - point.y) * scaleY;

              // update bounds
              Bounds.update(part.bounds, part.vertices, body.velocity);
          }

          // handle parent body
          if (body.parts.length > 1) {
              body.area = totalArea;

              if (!body.isStatic) {
                  Body.setMass(body, body.density * totalArea);
                  Body.setInertia(body, totalInertia);
              }
          }

          // handle circles
          if (body.circleRadius) { 
              if (scaleX === scaleY) {
                  body.circleRadius *= scaleX;
              } else {
                  // body is no longer a circle
                  body.circleRadius = null;
              }
          }
      };

      /**
       * Performs a simulation step for the given `body`, including updating position and angle using Verlet integration.
       * @method update
       * @param {body} body
       * @param {number} deltaTime
       * @param {number} timeScale
       * @param {number} correction
       */
      Body.update = function(body, deltaTime, timeScale, correction) {
          var deltaTimeSquared = Math.pow(deltaTime * timeScale * body.timeScale, 2);

          // from the previous step
          var frictionAir = 1 - body.frictionAir * timeScale * body.timeScale,
              velocityPrevX = body.position.x - body.positionPrev.x,
              velocityPrevY = body.position.y - body.positionPrev.y;

          // update velocity with Verlet integration
          body.velocity.x = (velocityPrevX * frictionAir * correction) + (body.force.x / body.mass) * deltaTimeSquared;
          body.velocity.y = (velocityPrevY * frictionAir * correction) + (body.force.y / body.mass) * deltaTimeSquared;

          body.positionPrev.x = body.position.x;
          body.positionPrev.y = body.position.y;
          body.position.x += body.velocity.x;
          body.position.y += body.velocity.y;

          // update angular velocity with Verlet integration
          body.angularVelocity = ((body.angle - body.anglePrev) * frictionAir * correction) + (body.torque / body.inertia) * deltaTimeSquared;
          body.anglePrev = body.angle;
          body.angle += body.angularVelocity;

          // track speed and acceleration
          body.speed = Vector.magnitude(body.velocity);
          body.angularSpeed = Math.abs(body.angularVelocity);

          // transform the body geometry
          for (var i = 0; i < body.parts.length; i++) {
              var part = body.parts[i];

              Vertices.translate(part.vertices, body.velocity);
              
              if (i > 0) {
                  part.position.x += body.velocity.x;
                  part.position.y += body.velocity.y;
              }

              if (body.angularVelocity !== 0) {
                  Vertices.rotate(part.vertices, body.angularVelocity, body.position);
                  Axes.rotate(part.axes, body.angularVelocity);
                  if (i > 0) {
                      Vector.rotateAbout(part.position, body.angularVelocity, body.position, part.position);
                  }
              }

              Bounds.update(part.bounds, part.vertices, body.velocity);
          }
      };

      /**
       * Applies a force to a body from a given world-space position, including resulting torque.
       * @method applyForce
       * @param {body} body
       * @param {vector} position
       * @param {vector} force
       */
      Body.applyForce = function(body, position, force) {
          body.force.x += force.x;
          body.force.y += force.y;
          var offset = { x: position.x - body.position.x, y: position.y - body.position.y };
          body.torque += offset.x * force.y - offset.y * force.x;
      };

      /**
       * Returns the sums of the properties of all compound parts of the parent body.
       * @method _totalProperties
       * @private
       * @param {body} body
       * @return {}
       */
      Body._totalProperties = function(body) {
          // from equations at:
          // https://ecourses.ou.edu/cgi-bin/ebook.cgi?doc=&topic=st&chap_sec=07.2&page=theory
          // http://output.to/sideway/default.asp?qno=121100087

          var properties = {
              mass: 0,
              area: 0,
              inertia: 0,
              centre: { x: 0, y: 0 }
          };

          // sum the properties of all compound parts of the parent body
          for (var i = body.parts.length === 1 ? 0 : 1; i < body.parts.length; i++) {
              var part = body.parts[i],
                  mass = part.mass !== Infinity ? part.mass : 1;

              properties.mass += mass;
              properties.area += part.area;
              properties.inertia += part.inertia;
              properties.centre = Vector.add(properties.centre, Vector.mult(part.position, mass));
          }

          properties.centre = Vector.div(properties.centre, properties.mass);

          return properties;
      };

      /*
      *
      *  Events Documentation
      *
      */

      /**
      * Fired when a body starts sleeping (where `this` is the body).
      *
      * @event sleepStart
      * @this {body} The body that has started sleeping
      * @param {} event An event object
      * @param {} event.source The source object of the event
      * @param {} event.name The name of the event
      */

      /**
      * Fired when a body ends sleeping (where `this` is the body).
      *
      * @event sleepEnd
      * @this {body} The body that has ended sleeping
      * @param {} event An event object
      * @param {} event.source The source object of the event
      * @param {} event.name The name of the event
      */

      /*
      *
      *  Properties Documentation
      *
      */

      /**
       * An integer `Number` uniquely identifying number generated in `Body.create` by `Common.nextId`.
       *
       * @property id
       * @type number
       */

      /**
       * A `String` denoting the type of object.
       *
       * @property type
       * @type string
       * @default "body"
       * @readOnly
       */

      /**
       * An arbitrary `String` name to help the user identify and manage bodies.
       *
       * @property label
       * @type string
       * @default "Body"
       */

      /**
       * An array of bodies that make up this body. 
       * The first body in the array must always be a self reference to the current body instance.
       * All bodies in the `parts` array together form a single rigid compound body.
       * Parts are allowed to overlap, have gaps or holes or even form concave bodies.
       * Parts themselves should never be added to a `World`, only the parent body should be.
       * Use `Body.setParts` when setting parts to ensure correct updates of all properties.
       *
       * @property parts
       * @type body[]
       */

      /**
       * An object reserved for storing plugin-specific properties.
       *
       * @property plugin
       * @type {}
       */

      /**
       * A self reference if the body is _not_ a part of another body.
       * Otherwise this is a reference to the body that this is a part of.
       * See `body.parts`.
       *
       * @property parent
       * @type body
       */

      /**
       * A `Number` specifying the angle of the body, in radians.
       *
       * @property angle
       * @type number
       * @default 0
       */

      /**
       * An array of `Vector` objects that specify the convex hull of the rigid body.
       * These should be provided about the origin `(0, 0)`. E.g.
       *
       *     [{ x: 0, y: 0 }, { x: 25, y: 50 }, { x: 50, y: 0 }]
       *
       * When passed via `Body.create`, the vertices are translated relative to `body.position` (i.e. world-space, and constantly updated by `Body.update` during simulation).
       * The `Vector` objects are also augmented with additional properties required for efficient collision detection. 
       *
       * Other properties such as `inertia` and `bounds` are automatically calculated from the passed vertices (unless provided via `options`).
       * Concave hulls are not currently supported. The module `Matter.Vertices` contains useful methods for working with vertices.
       *
       * @property vertices
       * @type vector[]
       */

      /**
       * A `Vector` that specifies the current world-space position of the body.
       *
       * @property position
       * @type vector
       * @default { x: 0, y: 0 }
       */

      /**
       * A `Vector` that specifies the force to apply in the current step. It is zeroed after every `Body.update`. See also `Body.applyForce`.
       *
       * @property force
       * @type vector
       * @default { x: 0, y: 0 }
       */

      /**
       * A `Number` that specifies the torque (turning force) to apply in the current step. It is zeroed after every `Body.update`.
       *
       * @property torque
       * @type number
       * @default 0
       */

      /**
       * A `Number` that _measures_ the current speed of the body after the last `Body.update`. It is read-only and always positive (it's the magnitude of `body.velocity`).
       *
       * @readOnly
       * @property speed
       * @type number
       * @default 0
       */

      /**
       * A `Number` that _measures_ the current angular speed of the body after the last `Body.update`. It is read-only and always positive (it's the magnitude of `body.angularVelocity`).
       *
       * @readOnly
       * @property angularSpeed
       * @type number
       * @default 0
       */

      /**
       * A `Vector` that _measures_ the current velocity of the body after the last `Body.update`. It is read-only. 
       * If you need to modify a body's velocity directly, you should either apply a force or simply change the body's `position` (as the engine uses position-Verlet integration).
       *
       * @readOnly
       * @property velocity
       * @type vector
       * @default { x: 0, y: 0 }
       */

      /**
       * A `Number` that _measures_ the current angular velocity of the body after the last `Body.update`. It is read-only. 
       * If you need to modify a body's angular velocity directly, you should apply a torque or simply change the body's `angle` (as the engine uses position-Verlet integration).
       *
       * @readOnly
       * @property angularVelocity
       * @type number
       * @default 0
       */

      /**
       * A flag that indicates whether a body is considered static. A static body can never change position or angle and is completely fixed.
       * If you need to set a body as static after its creation, you should use `Body.setStatic` as this requires more than just setting this flag.
       *
       * @property isStatic
       * @type boolean
       * @default false
       */

      /**
       * A flag that indicates whether a body is a sensor. Sensor triggers collision events, but doesn't react with colliding body physically.
       *
       * @property isSensor
       * @type boolean
       * @default false
       */

      /**
       * A flag that indicates whether the body is considered sleeping. A sleeping body acts similar to a static body, except it is only temporary and can be awoken.
       * If you need to set a body as sleeping, you should use `Sleeping.set` as this requires more than just setting this flag.
       *
       * @property isSleeping
       * @type boolean
       * @default false
       */

      /**
       * A `Number` that _measures_ the amount of movement a body currently has (a combination of `speed` and `angularSpeed`). It is read-only and always positive.
       * It is used and updated by the `Matter.Sleeping` module during simulation to decide if a body has come to rest.
       *
       * @readOnly
       * @property motion
       * @type number
       * @default 0
       */

      /**
       * A `Number` that defines the number of updates in which this body must have near-zero velocity before it is set as sleeping by the `Matter.Sleeping` module (if sleeping is enabled by the engine).
       *
       * @property sleepThreshold
       * @type number
       * @default 60
       */

      /**
       * A `Number` that defines the density of the body, that is its mass per unit area.
       * If you pass the density via `Body.create` the `mass` property is automatically calculated for you based on the size (area) of the object.
       * This is generally preferable to simply setting mass and allows for more intuitive definition of materials (e.g. rock has a higher density than wood).
       *
       * @property density
       * @type number
       * @default 0.001
       */

      /**
       * A `Number` that defines the mass of the body, although it may be more appropriate to specify the `density` property instead.
       * If you modify this value, you must also modify the `body.inverseMass` property (`1 / mass`).
       *
       * @property mass
       * @type number
       */

      /**
       * A `Number` that defines the inverse mass of the body (`1 / mass`).
       * If you modify this value, you must also modify the `body.mass` property.
       *
       * @property inverseMass
       * @type number
       */

      /**
       * A `Number` that defines the moment of inertia (i.e. second moment of area) of the body.
       * It is automatically calculated from the given convex hull (`vertices` array) and density in `Body.create`.
       * If you modify this value, you must also modify the `body.inverseInertia` property (`1 / inertia`).
       *
       * @property inertia
       * @type number
       */

      /**
       * A `Number` that defines the inverse moment of inertia of the body (`1 / inertia`).
       * If you modify this value, you must also modify the `body.inertia` property.
       *
       * @property inverseInertia
       * @type number
       */

      /**
       * A `Number` that defines the restitution (elasticity) of the body. The value is always positive and is in the range `(0, 1)`.
       * A value of `0` means collisions may be perfectly inelastic and no bouncing may occur. 
       * A value of `0.8` means the body may bounce back with approximately 80% of its kinetic energy.
       * Note that collision response is based on _pairs_ of bodies, and that `restitution` values are _combined_ with the following formula:
       *
       *     Math.max(bodyA.restitution, bodyB.restitution)
       *
       * @property restitution
       * @type number
       * @default 0
       */

      /**
       * A `Number` that defines the friction of the body. The value is always positive and is in the range `(0, 1)`.
       * A value of `0` means that the body may slide indefinitely.
       * A value of `1` means the body may come to a stop almost instantly after a force is applied.
       *
       * The effects of the value may be non-linear. 
       * High values may be unstable depending on the body.
       * The engine uses a Coulomb friction model including static and kinetic friction.
       * Note that collision response is based on _pairs_ of bodies, and that `friction` values are _combined_ with the following formula:
       *
       *     Math.min(bodyA.friction, bodyB.friction)
       *
       * @property friction
       * @type number
       * @default 0.1
       */

      /**
       * A `Number` that defines the static friction of the body (in the Coulomb friction model). 
       * A value of `0` means the body will never 'stick' when it is nearly stationary and only dynamic `friction` is used.
       * The higher the value (e.g. `10`), the more force it will take to initially get the body moving when nearly stationary.
       * This value is multiplied with the `friction` property to make it easier to change `friction` and maintain an appropriate amount of static friction.
       *
       * @property frictionStatic
       * @type number
       * @default 0.5
       */

      /**
       * A `Number` that defines the air friction of the body (air resistance). 
       * A value of `0` means the body will never slow as it moves through space.
       * The higher the value, the faster a body slows when moving through space.
       * The effects of the value are non-linear. 
       *
       * @property frictionAir
       * @type number
       * @default 0.01
       */

      /**
       * An `Object` that specifies the collision filtering properties of this body.
       *
       * Collisions between two bodies will obey the following rules:
       * - If the two bodies have the same non-zero value of `collisionFilter.group`,
       *   they will always collide if the value is positive, and they will never collide
       *   if the value is negative.
       * - If the two bodies have different values of `collisionFilter.group` or if one
       *   (or both) of the bodies has a value of 0, then the category/mask rules apply as follows:
       *
       * Each body belongs to a collision category, given by `collisionFilter.category`. This
       * value is used as a bit field and the category should have only one bit set, meaning that
       * the value of this property is a power of two in the range [1, 2^31]. Thus, there are 32
       * different collision categories available.
       *
       * Each body also defines a collision bitmask, given by `collisionFilter.mask` which specifies
       * the categories it collides with (the value is the bitwise AND value of all these categories).
       *
       * Using the category/mask rules, two bodies `A` and `B` collide if each includes the other's
       * category in its mask, i.e. `(categoryA & maskB) !== 0` and `(categoryB & maskA) !== 0`
       * are both true.
       *
       * @property collisionFilter
       * @type object
       */

      /**
       * An Integer `Number`, that specifies the collision group this body belongs to.
       * See `body.collisionFilter` for more information.
       *
       * @property collisionFilter.group
       * @type object
       * @default 0
       */

      /**
       * A bit field that specifies the collision category this body belongs to.
       * The category value should have only one bit set, for example `0x0001`.
       * This means there are up to 32 unique collision categories available.
       * See `body.collisionFilter` for more information.
       *
       * @property collisionFilter.category
       * @type object
       * @default 1
       */

      /**
       * A bit mask that specifies the collision categories this body may collide with.
       * See `body.collisionFilter` for more information.
       *
       * @property collisionFilter.mask
       * @type object
       * @default -1
       */

      /**
       * A `Number` that specifies a tolerance on how far a body is allowed to 'sink' or rotate into other bodies.
       * Avoid changing this value unless you understand the purpose of `slop` in physics engines.
       * The default should generally suffice, although very large bodies may require larger values for stable stacking.
       *
       * @property slop
       * @type number
       * @default 0.05
       */

      /**
       * A `Number` that allows per-body time scaling, e.g. a force-field where bodies inside are in slow-motion, while others are at full speed.
       *
       * @property timeScale
       * @type number
       * @default 1
       */

      /**
       * An `Object` that defines the rendering properties to be consumed by the module `Matter.Render`.
       *
       * @property render
       * @type object
       */

      /**
       * A flag that indicates if the body should be rendered.
       *
       * @property render.visible
       * @type boolean
       * @default true
       */

      /**
       * Sets the opacity to use when rendering.
       *
       * @property render.opacity
       * @type number
       * @default 1
      */

      /**
       * An `Object` that defines the sprite properties to use when rendering, if any.
       *
       * @property render.sprite
       * @type object
       */

      /**
       * An `String` that defines the path to the image to use as the sprite texture, if any.
       *
       * @property render.sprite.texture
       * @type string
       */
       
      /**
       * A `Number` that defines the scaling in the x-axis for the sprite, if any.
       *
       * @property render.sprite.xScale
       * @type number
       * @default 1
       */

      /**
       * A `Number` that defines the scaling in the y-axis for the sprite, if any.
       *
       * @property render.sprite.yScale
       * @type number
       * @default 1
       */

      /**
        * A `Number` that defines the offset in the x-axis for the sprite (normalised by texture width).
        *
        * @property render.sprite.xOffset
        * @type number
        * @default 0
        */

      /**
        * A `Number` that defines the offset in the y-axis for the sprite (normalised by texture height).
        *
        * @property render.sprite.yOffset
        * @type number
        * @default 0
        */

      /**
       * A `Number` that defines the line width to use when rendering the body outline (if a sprite is not defined).
       * A value of `0` means no outline will be rendered.
       *
       * @property render.lineWidth
       * @type number
       * @default 0
       */

      /**
       * A `String` that defines the fill style to use when rendering the body (if a sprite is not defined).
       * It is the same as when using a canvas, so it accepts CSS style property values.
       *
       * @property render.fillStyle
       * @type string
       * @default a random colour
       */

      /**
       * A `String` that defines the stroke style to use when rendering the body outline (if a sprite is not defined).
       * It is the same as when using a canvas, so it accepts CSS style property values.
       *
       * @property render.strokeStyle
       * @type string
       * @default a random colour
       */

      /**
       * An array of unique axis vectors (edge normals) used for collision detection.
       * These are automatically calculated from the given convex hull (`vertices` array) in `Body.create`.
       * They are constantly updated by `Body.update` during the simulation.
       *
       * @property axes
       * @type vector[]
       */
       
      /**
       * A `Number` that _measures_ the area of the body's convex hull, calculated at creation by `Body.create`.
       *
       * @property area
       * @type string
       * @default 
       */

      /**
       * A `Bounds` object that defines the AABB region for the body.
       * It is automatically calculated from the given convex hull (`vertices` array) in `Body.create` and constantly updated by `Body.update` during simulation.
       *
       * @property bounds
       * @type bounds
       */

  })();


  /***/ }),
  /* 7 */
  /***/ (function(module, exports, __webpack_require__) {

  /**
  * The `Matter.Sleeping` module contains methods to manage the sleeping state of bodies.
  *
  * @class Sleeping
  */

  var Sleeping = {};

  module.exports = Sleeping;

  var Events = __webpack_require__(4);

  (function() {

      Sleeping._motionWakeThreshold = 0.18;
      Sleeping._motionSleepThreshold = 0.08;
      Sleeping._minBias = 0.9;

      /**
       * Puts bodies to sleep or wakes them up depending on their motion.
       * @method update
       * @param {body[]} bodies
       * @param {number} timeScale
       */
      Sleeping.update = function(bodies, timeScale) {
          var timeFactor = timeScale * timeScale * timeScale;

          // update bodies sleeping status
          for (var i = 0; i < bodies.length; i++) {
              var body = bodies[i],
                  motion = body.speed * body.speed + body.angularSpeed * body.angularSpeed;

              // wake up bodies if they have a force applied
              if (body.force.x !== 0 || body.force.y !== 0) {
                  Sleeping.set(body, false);
                  continue;
              }

              var minMotion = Math.min(body.motion, motion),
                  maxMotion = Math.max(body.motion, motion);
          
              // biased average motion estimation between frames
              body.motion = Sleeping._minBias * minMotion + (1 - Sleeping._minBias) * maxMotion;
              
              if (body.sleepThreshold > 0 && body.motion < Sleeping._motionSleepThreshold * timeFactor) {
                  body.sleepCounter += 1;
                  
                  if (body.sleepCounter >= body.sleepThreshold)
                      Sleeping.set(body, true);
              } else if (body.sleepCounter > 0) {
                  body.sleepCounter -= 1;
              }
          }
      };

      /**
       * Given a set of colliding pairs, wakes the sleeping bodies involved.
       * @method afterCollisions
       * @param {pair[]} pairs
       * @param {number} timeScale
       */
      Sleeping.afterCollisions = function(pairs, timeScale) {
          var timeFactor = timeScale * timeScale * timeScale;

          // wake up bodies involved in collisions
          for (var i = 0; i < pairs.length; i++) {
              var pair = pairs[i];
              
              // don't wake inactive pairs
              if (!pair.isActive)
                  continue;

              var collision = pair.collision,
                  bodyA = collision.bodyA.parent, 
                  bodyB = collision.bodyB.parent;
          
              // don't wake if at least one body is static
              if ((bodyA.isSleeping && bodyB.isSleeping) || bodyA.isStatic || bodyB.isStatic)
                  continue;
          
              if (bodyA.isSleeping || bodyB.isSleeping) {
                  var sleepingBody = (bodyA.isSleeping && !bodyA.isStatic) ? bodyA : bodyB,
                      movingBody = sleepingBody === bodyA ? bodyB : bodyA;

                  if (!sleepingBody.isStatic && movingBody.motion > Sleeping._motionWakeThreshold * timeFactor) {
                      Sleeping.set(sleepingBody, false);
                  }
              }
          }
      };
    
      /**
       * Set a body as sleeping or awake.
       * @method set
       * @param {body} body
       * @param {boolean} isSleeping
       */
      Sleeping.set = function(body, isSleeping) {
          var wasSleeping = body.isSleeping;

          if (isSleeping) {
              body.isSleeping = true;
              body.sleepCounter = body.sleepThreshold;

              body.positionImpulse.x = 0;
              body.positionImpulse.y = 0;

              body.positionPrev.x = body.position.x;
              body.positionPrev.y = body.position.y;

              body.anglePrev = body.angle;
              body.speed = 0;
              body.angularSpeed = 0;
              body.motion = 0;

              if (!wasSleeping) {
                  Events.trigger(body, 'sleepStart');
              }
          } else {
              body.isSleeping = false;
              body.sleepCounter = 0;

              if (wasSleeping) {
                  Events.trigger(body, 'sleepEnd');
              }
          }
      };

  })();


  /***/ }),
  /* 8 */
  /***/ (function(module, exports, __webpack_require__) {

  /**
  * The `Matter.Collision` module contains methods for detecting collisions between a given pair of bodies.
  *
  * For efficient detection between a list of bodies, see `Matter.Detector` and `Matter.Query`.
  *
  * See `Matter.Engine` for collision events.
  *
  * @class Collision
  */

  var Collision = {};

  module.exports = Collision;

  var Vertices = __webpack_require__(3);
  var Pair = __webpack_require__(9);

  (function() {
      var _supports = [];

      var _overlapAB = {
          overlap: 0,
          axis: null
      };

      var _overlapBA = {
          overlap: 0,
          axis: null
      };

      /**
       * Creates a new collision record.
       * @method create
       * @param {body} bodyA The first body part represented by the collision record
       * @param {body} bodyB The second body part represented by the collision record
       * @return {collision} A new collision record
       */
      Collision.create = function(bodyA, bodyB) {
          return { 
              pair: null,
              collided: false,
              bodyA: bodyA,
              bodyB: bodyB,
              parentA: bodyA.parent,
              parentB: bodyB.parent,
              depth: 0,
              normal: { x: 0, y: 0 },
              tangent: { x: 0, y: 0 },
              penetration: { x: 0, y: 0 },
              supports: []
          };
      };

      /**
       * Detect collision between two bodies.
       * @method collides
       * @param {body} bodyA
       * @param {body} bodyB
       * @param {pairs} [pairs] Optionally reuse collision records from existing pairs.
       * @return {collision|null} A collision record if detected, otherwise null
       */
      Collision.collides = function(bodyA, bodyB, pairs) {
          Collision._overlapAxes(_overlapAB, bodyA.vertices, bodyB.vertices, bodyA.axes);

          if (_overlapAB.overlap <= 0) {
              return null;
          }

          Collision._overlapAxes(_overlapBA, bodyB.vertices, bodyA.vertices, bodyB.axes);

          if (_overlapBA.overlap <= 0) {
              return null;
          }

          // reuse collision records for gc efficiency
          var pair = pairs && pairs.table[Pair.id(bodyA, bodyB)],
              collision;

          if (!pair) {
              collision = Collision.create(bodyA, bodyB);
              collision.collided = true;
              collision.bodyA = bodyA.id < bodyB.id ? bodyA : bodyB;
              collision.bodyB = bodyA.id < bodyB.id ? bodyB : bodyA;
              collision.parentA = collision.bodyA.parent;
              collision.parentB = collision.bodyB.parent;
          } else {
              collision = pair.collision;
          }

          bodyA = collision.bodyA;
          bodyB = collision.bodyB;

          var minOverlap;

          if (_overlapAB.overlap < _overlapBA.overlap) {
              minOverlap = _overlapAB;
          } else {
              minOverlap = _overlapBA;
          }

          var normal = collision.normal,
              supports = collision.supports,
              minAxis = minOverlap.axis,
              minAxisX = minAxis.x,
              minAxisY = minAxis.y;

          // ensure normal is facing away from bodyA
          if (minAxisX * (bodyB.position.x - bodyA.position.x) + minAxisY * (bodyB.position.y - bodyA.position.y) < 0) {
              normal.x = minAxisX;
              normal.y = minAxisY;
          } else {
              normal.x = -minAxisX;
              normal.y = -minAxisY;
          }
          
          collision.tangent.x = -normal.y;
          collision.tangent.y = normal.x;

          collision.depth = minOverlap.overlap;

          collision.penetration.x = normal.x * collision.depth;
          collision.penetration.y = normal.y * collision.depth;

          // find support points, there is always either exactly one or two
          var supportsB = Collision._findSupports(bodyA, bodyB, normal, 1),
              supportCount = 0;

          // find the supports from bodyB that are inside bodyA
          if (Vertices.contains(bodyA.vertices, supportsB[0])) {
              supports[supportCount++] = supportsB[0];
          }

          if (Vertices.contains(bodyA.vertices, supportsB[1])) {
              supports[supportCount++] = supportsB[1];
          }

          // find the supports from bodyA that are inside bodyB
          if (supportCount < 2) {
              var supportsA = Collision._findSupports(bodyB, bodyA, normal, -1);

              if (Vertices.contains(bodyB.vertices, supportsA[0])) {
                  supports[supportCount++] = supportsA[0];
              }

              if (supportCount < 2 && Vertices.contains(bodyB.vertices, supportsA[1])) {
                  supports[supportCount++] = supportsA[1];
              }
          }

          // account for the edge case of overlapping but no vertex containment
          if (supportCount === 0) {
              supports[supportCount++] = supportsB[0];
          }

          // update supports array size
          supports.length = supportCount;

          return collision;
      };

      /**
       * Find the overlap between two sets of vertices.
       * @method _overlapAxes
       * @private
       * @param {object} result
       * @param {vertices} verticesA
       * @param {vertices} verticesB
       * @param {axes} axes
       */
      Collision._overlapAxes = function(result, verticesA, verticesB, axes) {
          var verticesALength = verticesA.length,
              verticesBLength = verticesB.length,
              verticesAX = verticesA[0].x,
              verticesAY = verticesA[0].y,
              verticesBX = verticesB[0].x,
              verticesBY = verticesB[0].y,
              axesLength = axes.length,
              overlapMin = Number.MAX_VALUE,
              overlapAxisNumber = 0,
              overlap,
              overlapAB,
              overlapBA,
              dot,
              i,
              j;

          for (i = 0; i < axesLength; i++) {
              var axis = axes[i],
                  axisX = axis.x,
                  axisY = axis.y,
                  minA = verticesAX * axisX + verticesAY * axisY,
                  minB = verticesBX * axisX + verticesBY * axisY,
                  maxA = minA,
                  maxB = minB;
              
              for (j = 1; j < verticesALength; j += 1) {
                  dot = verticesA[j].x * axisX + verticesA[j].y * axisY;

                  if (dot > maxA) { 
                      maxA = dot;
                  } else if (dot < minA) { 
                      minA = dot;
                  }
              }

              for (j = 1; j < verticesBLength; j += 1) {
                  dot = verticesB[j].x * axisX + verticesB[j].y * axisY;

                  if (dot > maxB) { 
                      maxB = dot;
                  } else if (dot < minB) { 
                      minB = dot;
                  }
              }

              overlapAB = maxA - minB;
              overlapBA = maxB - minA;
              overlap = overlapAB < overlapBA ? overlapAB : overlapBA;

              if (overlap < overlapMin) {
                  overlapMin = overlap;
                  overlapAxisNumber = i;

                  if (overlap <= 0) {
                      // can not be intersecting
                      break;
                  }
              } 
          }

          result.axis = axes[overlapAxisNumber];
          result.overlap = overlapMin;
      };

      /**
       * Projects vertices on an axis and returns an interval.
       * @method _projectToAxis
       * @private
       * @param {} projection
       * @param {} vertices
       * @param {} axis
       */
      Collision._projectToAxis = function(projection, vertices, axis) {
          var min = vertices[0].x * axis.x + vertices[0].y * axis.y,
              max = min;

          for (var i = 1; i < vertices.length; i += 1) {
              var dot = vertices[i].x * axis.x + vertices[i].y * axis.y;

              if (dot > max) { 
                  max = dot; 
              } else if (dot < min) { 
                  min = dot; 
              }
          }

          projection.min = min;
          projection.max = max;
      };

      /**
       * Finds supporting vertices given two bodies along a given direction using hill-climbing.
       * @method _findSupports
       * @private
       * @param {body} bodyA
       * @param {body} bodyB
       * @param {vector} normal
       * @param {number} direction
       * @return [vector]
       */
      Collision._findSupports = function(bodyA, bodyB, normal, direction) {
          var vertices = bodyB.vertices,
              verticesLength = vertices.length,
              bodyAPositionX = bodyA.position.x,
              bodyAPositionY = bodyA.position.y,
              normalX = normal.x * direction,
              normalY = normal.y * direction,
              nearestDistance = Number.MAX_VALUE,
              vertexA,
              vertexB,
              vertexC,
              distance,
              j;

          // find deepest vertex relative to the axis
          for (j = 0; j < verticesLength; j += 1) {
              vertexB = vertices[j];
              distance = normalX * (bodyAPositionX - vertexB.x) + normalY * (bodyAPositionY - vertexB.y);

              // convex hill-climbing
              if (distance < nearestDistance) {
                  nearestDistance = distance;
                  vertexA = vertexB;
              }
          }

          // measure next vertex
          vertexC = vertices[(verticesLength + vertexA.index - 1) % verticesLength];
          nearestDistance = normalX * (bodyAPositionX - vertexC.x) + normalY * (bodyAPositionY - vertexC.y);

          // compare with previous vertex
          vertexB = vertices[(vertexA.index + 1) % verticesLength];
          if (normalX * (bodyAPositionX - vertexB.x) + normalY * (bodyAPositionY - vertexB.y) < nearestDistance) {
              _supports[0] = vertexA;
              _supports[1] = vertexB;

              return _supports;
          }

          _supports[0] = vertexA;
          _supports[1] = vertexC;

          return _supports;
      };

      /*
      *
      *  Properties Documentation
      *
      */

      /**
       * A reference to the pair using this collision record, if there is one.
       *
       * @property pair
       * @type {pair|null}
       * @default null
       */

      /**
       * A flag that indicates if the bodies were colliding when the collision was last updated.
       * 
       * @property collided
       * @type boolean
       * @default false
       */

      /**
       * The first body part represented by the collision (see also `collision.parentA`).
       * 
       * @property bodyA
       * @type body
       */

      /**
       * The second body part represented by the collision (see also `collision.parentB`).
       * 
       * @property bodyB
       * @type body
       */

      /**
       * The first body represented by the collision (i.e. `collision.bodyA.parent`).
       * 
       * @property parentA
       * @type body
       */

      /**
       * The second body represented by the collision (i.e. `collision.bodyB.parent`).
       * 
       * @property parentB
       * @type body
       */

      /**
       * A `Number` that represents the minimum separating distance between the bodies along the collision normal.
       *
       * @readOnly
       * @property depth
       * @type number
       * @default 0
       */

      /**
       * A normalised `Vector` that represents the direction between the bodies that provides the minimum separating distance.
       *
       * @property normal
       * @type vector
       * @default { x: 0, y: 0 }
       */

      /**
       * A normalised `Vector` that is the tangent direction to the collision normal.
       *
       * @property tangent
       * @type vector
       * @default { x: 0, y: 0 }
       */

      /**
       * A `Vector` that represents the direction and depth of the collision.
       *
       * @property penetration
       * @type vector
       * @default { x: 0, y: 0 }
       */

      /**
       * An array of body vertices that represent the support points in the collision.
       * These are the deepest vertices (along the collision normal) of each body that are contained by the other body's vertices.
       *
       * @property supports
       * @type vector[]
       * @default []
       */

  })();


  /***/ }),
  /* 9 */
  /***/ (function(module, exports, __webpack_require__) {

  /**
  * The `Matter.Pair` module contains methods for creating and manipulating collision pairs.
  *
  * @class Pair
  */

  var Pair = {};

  module.exports = Pair;

  var Contact = __webpack_require__(17);

  (function() {
      
      /**
       * Creates a pair.
       * @method create
       * @param {collision} collision
       * @param {number} timestamp
       * @return {pair} A new pair
       */
      Pair.create = function(collision, timestamp) {
          var bodyA = collision.bodyA,
              bodyB = collision.bodyB;

          var pair = {
              id: Pair.id(bodyA, bodyB),
              bodyA: bodyA,
              bodyB: bodyB,
              collision: collision,
              contacts: [],
              activeContacts: [],
              separation: 0,
              isActive: true,
              confirmedActive: true,
              isSensor: bodyA.isSensor || bodyB.isSensor,
              timeCreated: timestamp,
              timeUpdated: timestamp,
              inverseMass: 0,
              friction: 0,
              frictionStatic: 0,
              restitution: 0,
              slop: 0
          };

          Pair.update(pair, collision, timestamp);

          return pair;
      };

      /**
       * Updates a pair given a collision.
       * @method update
       * @param {pair} pair
       * @param {collision} collision
       * @param {number} timestamp
       */
      Pair.update = function(pair, collision, timestamp) {
          var contacts = pair.contacts,
              supports = collision.supports,
              activeContacts = pair.activeContacts,
              parentA = collision.parentA,
              parentB = collision.parentB,
              parentAVerticesLength = parentA.vertices.length;
          
          pair.isActive = true;
          pair.timeUpdated = timestamp;
          pair.collision = collision;
          pair.separation = collision.depth;
          pair.inverseMass = parentA.inverseMass + parentB.inverseMass;
          pair.friction = parentA.friction < parentB.friction ? parentA.friction : parentB.friction;
          pair.frictionStatic = parentA.frictionStatic > parentB.frictionStatic ? parentA.frictionStatic : parentB.frictionStatic;
          pair.restitution = parentA.restitution > parentB.restitution ? parentA.restitution : parentB.restitution;
          pair.slop = parentA.slop > parentB.slop ? parentA.slop : parentB.slop;

          collision.pair = pair;
          activeContacts.length = 0;
          
          for (var i = 0; i < supports.length; i++) {
              var support = supports[i],
                  contactId = support.body === parentA ? support.index : parentAVerticesLength + support.index,
                  contact = contacts[contactId];

              if (contact) {
                  activeContacts.push(contact);
              } else {
                  activeContacts.push(contacts[contactId] = Contact.create(support));
              }
          }
      };
      
      /**
       * Set a pair as active or inactive.
       * @method setActive
       * @param {pair} pair
       * @param {bool} isActive
       * @param {number} timestamp
       */
      Pair.setActive = function(pair, isActive, timestamp) {
          if (isActive) {
              pair.isActive = true;
              pair.timeUpdated = timestamp;
          } else {
              pair.isActive = false;
              pair.activeContacts.length = 0;
          }
      };

      /**
       * Get the id for the given pair.
       * @method id
       * @param {body} bodyA
       * @param {body} bodyB
       * @return {string} Unique pairId
       */
      Pair.id = function(bodyA, bodyB) {
          if (bodyA.id < bodyB.id) {
              return 'A' + bodyA.id + 'B' + bodyB.id;
          } else {
              return 'A' + bodyB.id + 'B' + bodyA.id;
          }
      };

  })();


  /***/ }),
  /* 10 */
  /***/ (function(module, exports, __webpack_require__) {

  /**
  * The `Matter.Constraint` module contains methods for creating and manipulating constraints.
  * Constraints are used for specifying that a fixed distance must be maintained between two bodies (or a body and a fixed world-space position).
  * The stiffness of constraints can be modified to create springs or elastic.
  *
  * See the included usage [examples](https://github.com/liabru/matter-js/tree/master/examples).
  *
  * @class Constraint
  */

  var Constraint = {};

  module.exports = Constraint;

  var Vertices = __webpack_require__(3);
  var Vector = __webpack_require__(2);
  var Sleeping = __webpack_require__(7);
  var Bounds = __webpack_require__(1);
  var Axes = __webpack_require__(11);
  var Common = __webpack_require__(0);

  (function() {

      Constraint._warming = 0.4;
      Constraint._torqueDampen = 1;
      Constraint._minLength = 0.000001;

      /**
       * Creates a new constraint.
       * All properties have default values, and many are pre-calculated automatically based on other properties.
       * To simulate a revolute constraint (or pin joint) set `length: 0` and a high `stiffness` value (e.g. `0.7` or above).
       * If the constraint is unstable, try lowering the `stiffness` value and / or increasing `engine.constraintIterations`.
       * For compound bodies, constraints must be applied to the parent body (not one of its parts).
       * See the properties section below for detailed information on what you can pass via the `options` object.
       * @method create
       * @param {} options
       * @return {constraint} constraint
       */
      Constraint.create = function(options) {
          var constraint = options;

          // if bodies defined but no points, use body centre
          if (constraint.bodyA && !constraint.pointA)
              constraint.pointA = { x: 0, y: 0 };
          if (constraint.bodyB && !constraint.pointB)
              constraint.pointB = { x: 0, y: 0 };

          // calculate static length using initial world space points
          var initialPointA = constraint.bodyA ? Vector.add(constraint.bodyA.position, constraint.pointA) : constraint.pointA,
              initialPointB = constraint.bodyB ? Vector.add(constraint.bodyB.position, constraint.pointB) : constraint.pointB,
              length = Vector.magnitude(Vector.sub(initialPointA, initialPointB));
      
          constraint.length = typeof constraint.length !== 'undefined' ? constraint.length : length;

          // option defaults
          constraint.id = constraint.id || Common.nextId();
          constraint.label = constraint.label || 'Constraint';
          constraint.type = 'constraint';
          constraint.stiffness = constraint.stiffness || (constraint.length > 0 ? 1 : 0.7);
          constraint.damping = constraint.damping || 0;
          constraint.angularStiffness = constraint.angularStiffness || 0;
          constraint.angleA = constraint.bodyA ? constraint.bodyA.angle : constraint.angleA;
          constraint.angleB = constraint.bodyB ? constraint.bodyB.angle : constraint.angleB;
          constraint.plugin = {};

          // render
          var render = {
              visible: true,
              lineWidth: 2,
              strokeStyle: '#ffffff',
              type: 'line',
              anchors: true
          };

          if (constraint.length === 0 && constraint.stiffness > 0.1) {
              render.type = 'pin';
              render.anchors = false;
          } else if (constraint.stiffness < 0.9) {
              render.type = 'spring';
          }

          constraint.render = Common.extend(render, constraint.render);

          return constraint;
      };

      /**
       * Prepares for solving by constraint warming.
       * @private
       * @method preSolveAll
       * @param {body[]} bodies
       */
      Constraint.preSolveAll = function(bodies) {
          for (var i = 0; i < bodies.length; i += 1) {
              var body = bodies[i],
                  impulse = body.constraintImpulse;

              if (body.isStatic || (impulse.x === 0 && impulse.y === 0 && impulse.angle === 0)) {
                  continue;
              }

              body.position.x += impulse.x;
              body.position.y += impulse.y;
              body.angle += impulse.angle;
          }
      };

      /**
       * Solves all constraints in a list of collisions.
       * @private
       * @method solveAll
       * @param {constraint[]} constraints
       * @param {number} timeScale
       */
      Constraint.solveAll = function(constraints, timeScale) {
          // Solve fixed constraints first.
          for (var i = 0; i < constraints.length; i += 1) {
              var constraint = constraints[i],
                  fixedA = !constraint.bodyA || (constraint.bodyA && constraint.bodyA.isStatic),
                  fixedB = !constraint.bodyB || (constraint.bodyB && constraint.bodyB.isStatic);

              if (fixedA || fixedB) {
                  Constraint.solve(constraints[i], timeScale);
              }
          }

          // Solve free constraints last.
          for (i = 0; i < constraints.length; i += 1) {
              constraint = constraints[i];
              fixedA = !constraint.bodyA || (constraint.bodyA && constraint.bodyA.isStatic);
              fixedB = !constraint.bodyB || (constraint.bodyB && constraint.bodyB.isStatic);

              if (!fixedA && !fixedB) {
                  Constraint.solve(constraints[i], timeScale);
              }
          }
      };

      /**
       * Solves a distance constraint with Gauss-Siedel method.
       * @private
       * @method solve
       * @param {constraint} constraint
       * @param {number} timeScale
       */
      Constraint.solve = function(constraint, timeScale) {
          var bodyA = constraint.bodyA,
              bodyB = constraint.bodyB,
              pointA = constraint.pointA,
              pointB = constraint.pointB;

          if (!bodyA && !bodyB)
              return;

          // update reference angle
          if (bodyA && !bodyA.isStatic) {
              Vector.rotate(pointA, bodyA.angle - constraint.angleA, pointA);
              constraint.angleA = bodyA.angle;
          }
          
          // update reference angle
          if (bodyB && !bodyB.isStatic) {
              Vector.rotate(pointB, bodyB.angle - constraint.angleB, pointB);
              constraint.angleB = bodyB.angle;
          }

          var pointAWorld = pointA,
              pointBWorld = pointB;

          if (bodyA) pointAWorld = Vector.add(bodyA.position, pointA);
          if (bodyB) pointBWorld = Vector.add(bodyB.position, pointB);

          if (!pointAWorld || !pointBWorld)
              return;

          var delta = Vector.sub(pointAWorld, pointBWorld),
              currentLength = Vector.magnitude(delta);

          // prevent singularity
          if (currentLength < Constraint._minLength) {
              currentLength = Constraint._minLength;
          }

          // solve distance constraint with Gauss-Siedel method
          var difference = (currentLength - constraint.length) / currentLength,
              stiffness = constraint.stiffness < 1 ? constraint.stiffness * timeScale : constraint.stiffness,
              force = Vector.mult(delta, difference * stiffness),
              massTotal = (bodyA ? bodyA.inverseMass : 0) + (bodyB ? bodyB.inverseMass : 0),
              inertiaTotal = (bodyA ? bodyA.inverseInertia : 0) + (bodyB ? bodyB.inverseInertia : 0),
              resistanceTotal = massTotal + inertiaTotal,
              torque,
              share,
              normal,
              normalVelocity,
              relativeVelocity;

          if (constraint.damping) {
              var zero = Vector.create();
              normal = Vector.div(delta, currentLength);

              relativeVelocity = Vector.sub(
                  bodyB && Vector.sub(bodyB.position, bodyB.positionPrev) || zero,
                  bodyA && Vector.sub(bodyA.position, bodyA.positionPrev) || zero
              );

              normalVelocity = Vector.dot(normal, relativeVelocity);
          }

          if (bodyA && !bodyA.isStatic) {
              share = bodyA.inverseMass / massTotal;

              // keep track of applied impulses for post solving
              bodyA.constraintImpulse.x -= force.x * share;
              bodyA.constraintImpulse.y -= force.y * share;

              // apply forces
              bodyA.position.x -= force.x * share;
              bodyA.position.y -= force.y * share;

              // apply damping
              if (constraint.damping) {
                  bodyA.positionPrev.x -= constraint.damping * normal.x * normalVelocity * share;
                  bodyA.positionPrev.y -= constraint.damping * normal.y * normalVelocity * share;
              }

              // apply torque
              torque = (Vector.cross(pointA, force) / resistanceTotal) * Constraint._torqueDampen * bodyA.inverseInertia * (1 - constraint.angularStiffness);
              bodyA.constraintImpulse.angle -= torque;
              bodyA.angle -= torque;
          }

          if (bodyB && !bodyB.isStatic) {
              share = bodyB.inverseMass / massTotal;

              // keep track of applied impulses for post solving
              bodyB.constraintImpulse.x += force.x * share;
              bodyB.constraintImpulse.y += force.y * share;
              
              // apply forces
              bodyB.position.x += force.x * share;
              bodyB.position.y += force.y * share;

              // apply damping
              if (constraint.damping) {
                  bodyB.positionPrev.x += constraint.damping * normal.x * normalVelocity * share;
                  bodyB.positionPrev.y += constraint.damping * normal.y * normalVelocity * share;
              }

              // apply torque
              torque = (Vector.cross(pointB, force) / resistanceTotal) * Constraint._torqueDampen * bodyB.inverseInertia * (1 - constraint.angularStiffness);
              bodyB.constraintImpulse.angle += torque;
              bodyB.angle += torque;
          }

      };

      /**
       * Performs body updates required after solving constraints.
       * @private
       * @method postSolveAll
       * @param {body[]} bodies
       */
      Constraint.postSolveAll = function(bodies) {
          for (var i = 0; i < bodies.length; i++) {
              var body = bodies[i],
                  impulse = body.constraintImpulse;

              if (body.isStatic || (impulse.x === 0 && impulse.y === 0 && impulse.angle === 0)) {
                  continue;
              }

              Sleeping.set(body, false);

              // update geometry and reset
              for (var j = 0; j < body.parts.length; j++) {
                  var part = body.parts[j];
                  
                  Vertices.translate(part.vertices, impulse);

                  if (j > 0) {
                      part.position.x += impulse.x;
                      part.position.y += impulse.y;
                  }

                  if (impulse.angle !== 0) {
                      Vertices.rotate(part.vertices, impulse.angle, body.position);
                      Axes.rotate(part.axes, impulse.angle);
                      if (j > 0) {
                          Vector.rotateAbout(part.position, impulse.angle, body.position, part.position);
                      }
                  }

                  Bounds.update(part.bounds, part.vertices, body.velocity);
              }

              // dampen the cached impulse for warming next step
              impulse.angle *= Constraint._warming;
              impulse.x *= Constraint._warming;
              impulse.y *= Constraint._warming;
          }
      };

      /**
       * Returns the world-space position of `constraint.pointA`, accounting for `constraint.bodyA`.
       * @method pointAWorld
       * @param {constraint} constraint
       * @returns {vector} the world-space position
       */
      Constraint.pointAWorld = function(constraint) {
          return {
              x: (constraint.bodyA ? constraint.bodyA.position.x : 0) + constraint.pointA.x,
              y: (constraint.bodyA ? constraint.bodyA.position.y : 0) + constraint.pointA.y
          };
      };

      /**
       * Returns the world-space position of `constraint.pointB`, accounting for `constraint.bodyB`.
       * @method pointBWorld
       * @param {constraint} constraint
       * @returns {vector} the world-space position
       */
      Constraint.pointBWorld = function(constraint) {
          return {
              x: (constraint.bodyB ? constraint.bodyB.position.x : 0) + constraint.pointB.x,
              y: (constraint.bodyB ? constraint.bodyB.position.y : 0) + constraint.pointB.y
          };
      };

      /*
      *
      *  Properties Documentation
      *
      */

      /**
       * An integer `Number` uniquely identifying number generated in `Composite.create` by `Common.nextId`.
       *
       * @property id
       * @type number
       */

      /**
       * A `String` denoting the type of object.
       *
       * @property type
       * @type string
       * @default "constraint"
       * @readOnly
       */

      /**
       * An arbitrary `String` name to help the user identify and manage bodies.
       *
       * @property label
       * @type string
       * @default "Constraint"
       */

      /**
       * An `Object` that defines the rendering properties to be consumed by the module `Matter.Render`.
       *
       * @property render
       * @type object
       */

      /**
       * A flag that indicates if the constraint should be rendered.
       *
       * @property render.visible
       * @type boolean
       * @default true
       */

      /**
       * A `Number` that defines the line width to use when rendering the constraint outline.
       * A value of `0` means no outline will be rendered.
       *
       * @property render.lineWidth
       * @type number
       * @default 2
       */

      /**
       * A `String` that defines the stroke style to use when rendering the constraint outline.
       * It is the same as when using a canvas, so it accepts CSS style property values.
       *
       * @property render.strokeStyle
       * @type string
       * @default a random colour
       */

      /**
       * A `String` that defines the constraint rendering type. 
       * The possible values are 'line', 'pin', 'spring'.
       * An appropriate render type will be automatically chosen unless one is given in options.
       *
       * @property render.type
       * @type string
       * @default 'line'
       */

      /**
       * A `Boolean` that defines if the constraint's anchor points should be rendered.
       *
       * @property render.anchors
       * @type boolean
       * @default true
       */

      /**
       * The first possible `Body` that this constraint is attached to.
       *
       * @property bodyA
       * @type body
       * @default null
       */

      /**
       * The second possible `Body` that this constraint is attached to.
       *
       * @property bodyB
       * @type body
       * @default null
       */

      /**
       * A `Vector` that specifies the offset of the constraint from center of the `constraint.bodyA` if defined, otherwise a world-space position.
       *
       * @property pointA
       * @type vector
       * @default { x: 0, y: 0 }
       */

      /**
       * A `Vector` that specifies the offset of the constraint from center of the `constraint.bodyB` if defined, otherwise a world-space position.
       *
       * @property pointB
       * @type vector
       * @default { x: 0, y: 0 }
       */

      /**
       * A `Number` that specifies the stiffness of the constraint, i.e. the rate at which it returns to its resting `constraint.length`.
       * A value of `1` means the constraint should be very stiff.
       * A value of `0.2` means the constraint acts like a soft spring.
       *
       * @property stiffness
       * @type number
       * @default 1
       */

      /**
       * A `Number` that specifies the damping of the constraint, 
       * i.e. the amount of resistance applied to each body based on their velocities to limit the amount of oscillation.
       * Damping will only be apparent when the constraint also has a very low `stiffness`.
       * A value of `0.1` means the constraint will apply heavy damping, resulting in little to no oscillation.
       * A value of `0` means the constraint will apply no damping.
       *
       * @property damping
       * @type number
       * @default 0
       */

      /**
       * A `Number` that specifies the target resting length of the constraint. 
       * It is calculated automatically in `Constraint.create` from initial positions of the `constraint.bodyA` and `constraint.bodyB`.
       *
       * @property length
       * @type number
       */

      /**
       * An object reserved for storing plugin-specific properties.
       *
       * @property plugin
       * @type {}
       */

  })();


  /***/ }),
  /* 11 */
  /***/ (function(module, exports, __webpack_require__) {

  /**
  * The `Matter.Axes` module contains methods for creating and manipulating sets of axes.
  *
  * @class Axes
  */

  var Axes = {};

  module.exports = Axes;

  var Vector = __webpack_require__(2);
  var Common = __webpack_require__(0);

  (function() {

      /**
       * Creates a new set of axes from the given vertices.
       * @method fromVertices
       * @param {vertices} vertices
       * @return {axes} A new axes from the given vertices
       */
      Axes.fromVertices = function(vertices) {
          var axes = {};

          // find the unique axes, using edge normal gradients
          for (var i = 0; i < vertices.length; i++) {
              var j = (i + 1) % vertices.length, 
                  normal = Vector.normalise({ 
                      x: vertices[j].y - vertices[i].y, 
                      y: vertices[i].x - vertices[j].x
                  }),
                  gradient = (normal.y === 0) ? Infinity : (normal.x / normal.y);
              
              // limit precision
              gradient = gradient.toFixed(3).toString();
              axes[gradient] = normal;
          }

          return Common.values(axes);
      };

      /**
       * Rotates a set of axes by the given angle.
       * @method rotate
       * @param {axes} axes
       * @param {number} angle
       */
      Axes.rotate = function(axes, angle) {
          if (angle === 0)
              return;
          
          var cos = Math.cos(angle),
              sin = Math.sin(angle);

          for (var i = 0; i < axes.length; i++) {
              var axis = axes[i],
                  xx;
              xx = axis.x * cos - axis.y * sin;
              axis.y = axis.x * sin + axis.y * cos;
              axis.x = xx;
          }
      };

  })();


  /***/ }),
  /* 12 */
  /***/ (function(module, exports, __webpack_require__) {

  /**
  * The `Matter.Bodies` module contains factory methods for creating rigid body models 
  * with commonly used body configurations (such as rectangles, circles and other polygons).
  *
  * See the included usage [examples](https://github.com/liabru/matter-js/tree/master/examples).
  *
  * @class Bodies
  */

  // TODO: true circle bodies

  var Bodies = {};

  module.exports = Bodies;

  var Vertices = __webpack_require__(3);
  var Common = __webpack_require__(0);
  var Body = __webpack_require__(6);
  var Bounds = __webpack_require__(1);
  var Vector = __webpack_require__(2);

  (function() {

      /**
       * Creates a new rigid body model with a rectangle hull. 
       * The options parameter is an object that specifies any properties you wish to override the defaults.
       * See the properties section of the `Matter.Body` module for detailed information on what you can pass via the `options` object.
       * @method rectangle
       * @param {number} x
       * @param {number} y
       * @param {number} width
       * @param {number} height
       * @param {object} [options]
       * @return {body} A new rectangle body
       */
      Bodies.rectangle = function(x, y, width, height, options) {
          options = options || {};

          var rectangle = { 
              label: 'Rectangle Body',
              position: { x: x, y: y },
              vertices: Vertices.fromPath('L 0 0 L ' + width + ' 0 L ' + width + ' ' + height + ' L 0 ' + height)
          };

          if (options.chamfer) {
              var chamfer = options.chamfer;
              rectangle.vertices = Vertices.chamfer(rectangle.vertices, chamfer.radius, 
                  chamfer.quality, chamfer.qualityMin, chamfer.qualityMax);
              delete options.chamfer;
          }

          return Body.create(Common.extend({}, rectangle, options));
      };
      
      /**
       * Creates a new rigid body model with a trapezoid hull. 
       * The options parameter is an object that specifies any properties you wish to override the defaults.
       * See the properties section of the `Matter.Body` module for detailed information on what you can pass via the `options` object.
       * @method trapezoid
       * @param {number} x
       * @param {number} y
       * @param {number} width
       * @param {number} height
       * @param {number} slope
       * @param {object} [options]
       * @return {body} A new trapezoid body
       */
      Bodies.trapezoid = function(x, y, width, height, slope, options) {
          options = options || {};

          slope *= 0.5;
          var roof = (1 - (slope * 2)) * width;
          
          var x1 = width * slope,
              x2 = x1 + roof,
              x3 = x2 + x1,
              verticesPath;

          if (slope < 0.5) {
              verticesPath = 'L 0 0 L ' + x1 + ' ' + (-height) + ' L ' + x2 + ' ' + (-height) + ' L ' + x3 + ' 0';
          } else {
              verticesPath = 'L 0 0 L ' + x2 + ' ' + (-height) + ' L ' + x3 + ' 0';
          }

          var trapezoid = { 
              label: 'Trapezoid Body',
              position: { x: x, y: y },
              vertices: Vertices.fromPath(verticesPath)
          };

          if (options.chamfer) {
              var chamfer = options.chamfer;
              trapezoid.vertices = Vertices.chamfer(trapezoid.vertices, chamfer.radius, 
                  chamfer.quality, chamfer.qualityMin, chamfer.qualityMax);
              delete options.chamfer;
          }

          return Body.create(Common.extend({}, trapezoid, options));
      };

      /**
       * Creates a new rigid body model with a circle hull. 
       * The options parameter is an object that specifies any properties you wish to override the defaults.
       * See the properties section of the `Matter.Body` module for detailed information on what you can pass via the `options` object.
       * @method circle
       * @param {number} x
       * @param {number} y
       * @param {number} radius
       * @param {object} [options]
       * @param {number} [maxSides]
       * @return {body} A new circle body
       */
      Bodies.circle = function(x, y, radius, options, maxSides) {
          options = options || {};

          var circle = {
              label: 'Circle Body',
              circleRadius: radius
          };
          
          // approximate circles with polygons until true circles implemented in SAT
          maxSides = maxSides || 25;
          var sides = Math.ceil(Math.max(10, Math.min(maxSides, radius)));

          // optimisation: always use even number of sides (half the number of unique axes)
          if (sides % 2 === 1)
              sides += 1;

          return Bodies.polygon(x, y, sides, radius, Common.extend({}, circle, options));
      };

      /**
       * Creates a new rigid body model with a regular polygon hull with the given number of sides. 
       * The options parameter is an object that specifies any properties you wish to override the defaults.
       * See the properties section of the `Matter.Body` module for detailed information on what you can pass via the `options` object.
       * @method polygon
       * @param {number} x
       * @param {number} y
       * @param {number} sides
       * @param {number} radius
       * @param {object} [options]
       * @return {body} A new regular polygon body
       */
      Bodies.polygon = function(x, y, sides, radius, options) {
          options = options || {};

          if (sides < 3)
              return Bodies.circle(x, y, radius, options);

          var theta = 2 * Math.PI / sides,
              path = '',
              offset = theta * 0.5;

          for (var i = 0; i < sides; i += 1) {
              var angle = offset + (i * theta),
                  xx = Math.cos(angle) * radius,
                  yy = Math.sin(angle) * radius;

              path += 'L ' + xx.toFixed(3) + ' ' + yy.toFixed(3) + ' ';
          }

          var polygon = { 
              label: 'Polygon Body',
              position: { x: x, y: y },
              vertices: Vertices.fromPath(path)
          };

          if (options.chamfer) {
              var chamfer = options.chamfer;
              polygon.vertices = Vertices.chamfer(polygon.vertices, chamfer.radius, 
                  chamfer.quality, chamfer.qualityMin, chamfer.qualityMax);
              delete options.chamfer;
          }

          return Body.create(Common.extend({}, polygon, options));
      };

      /**
       * Utility to create a compound body based on set(s) of vertices.
       * 
       * _Note:_ To optionally enable automatic concave vertices decomposition the [poly-decomp](https://github.com/schteppe/poly-decomp.js) 
       * package must be first installed and provided see `Common.setDecomp`, otherwise the convex hull of each vertex set will be used.
       * 
       * The resulting vertices are reorientated about their centre of mass,
       * and offset such that `body.position` corresponds to this point.
       * 
       * The resulting offset may be found if needed by subtracting `body.bounds` from the original input bounds.
       * To later move the centre of mass see `Body.setCentre`.
       * 
       * Note that automatic conconcave decomposition results are not always optimal. 
       * For best results, simplify the input vertices as much as possible first.
       * By default this function applies some addtional simplification to help.
       * 
       * Some outputs may also require further manual processing afterwards to be robust.
       * In particular some parts may need to be overlapped to avoid collision gaps.
       * Thin parts and sharp points should be avoided or removed where possible.
       *
       * The options parameter object specifies any `Matter.Body` properties you wish to override the defaults.
       * 
       * See the properties section of the `Matter.Body` module for detailed information on what you can pass via the `options` object.
       * @method fromVertices
       * @param {number} x
       * @param {number} y
       * @param {array} vertexSets One or more arrays of vertex points e.g. `[[{ x: 0, y: 0 }...], ...]`.
       * @param {object} [options] The body options.
       * @param {bool} [flagInternal=false] Optionally marks internal edges with `isInternal`.
       * @param {number} [removeCollinear=0.01] Threshold when simplifying vertices along the same edge.
       * @param {number} [minimumArea=10] Threshold when removing small parts.
       * @param {number} [removeDuplicatePoints=0.01] Threshold when simplifying nearby vertices.
       * @return {body}
       */
      Bodies.fromVertices = function(x, y, vertexSets, options, flagInternal, removeCollinear, minimumArea, removeDuplicatePoints) {
          var decomp = Common.getDecomp(),
              canDecomp,
              body,
              parts,
              isConvex,
              isConcave,
              vertices,
              i,
              j,
              k,
              v,
              z;

          // check decomp is as expected
          canDecomp = Boolean(decomp && decomp.quickDecomp);

          options = options || {};
          parts = [];

          flagInternal = typeof flagInternal !== 'undefined' ? flagInternal : false;
          removeCollinear = typeof removeCollinear !== 'undefined' ? removeCollinear : 0.01;
          minimumArea = typeof minimumArea !== 'undefined' ? minimumArea : 10;
          removeDuplicatePoints = typeof removeDuplicatePoints !== 'undefined' ? removeDuplicatePoints : 0.01;

          // ensure vertexSets is an array of arrays
          if (!Common.isArray(vertexSets[0])) {
              vertexSets = [vertexSets];
          }

          for (v = 0; v < vertexSets.length; v += 1) {
              vertices = vertexSets[v];
              isConvex = Vertices.isConvex(vertices);
              isConcave = !isConvex;

              if (isConcave && !canDecomp) {
                  Common.warnOnce(
                      'Bodies.fromVertices: Install the \'poly-decomp\' library and use Common.setDecomp or provide \'decomp\' as a global to decompose concave vertices.'
                  );
              }

              if (isConvex || !canDecomp) {
                  if (isConvex) {
                      vertices = Vertices.clockwiseSort(vertices);
                  } else {
                      // fallback to convex hull when decomposition is not possible
                      vertices = Vertices.hull(vertices);
                  }

                  parts.push({
                      position: { x: x, y: y },
                      vertices: vertices
                  });
              } else {
                  // initialise a decomposition
                  var concave = vertices.map(function(vertex) {
                      return [vertex.x, vertex.y];
                  });

                  // vertices are concave and simple, we can decompose into parts
                  decomp.makeCCW(concave);
                  if (removeCollinear !== false)
                      decomp.removeCollinearPoints(concave, removeCollinear);
                  if (removeDuplicatePoints !== false && decomp.removeDuplicatePoints)
                      decomp.removeDuplicatePoints(concave, removeDuplicatePoints);

                  // use the quick decomposition algorithm (Bayazit)
                  var decomposed = decomp.quickDecomp(concave);

                  // for each decomposed chunk
                  for (i = 0; i < decomposed.length; i++) {
                      var chunk = decomposed[i];

                      // convert vertices into the correct structure
                      var chunkVertices = chunk.map(function(vertices) {
                          return {
                              x: vertices[0],
                              y: vertices[1]
                          };
                      });

                      // skip small chunks
                      if (minimumArea > 0 && Vertices.area(chunkVertices) < minimumArea)
                          continue;

                      // create a compound part
                      parts.push({
                          position: Vertices.centre(chunkVertices),
                          vertices: chunkVertices
                      });
                  }
              }
          }

          // create body parts
          for (i = 0; i < parts.length; i++) {
              parts[i] = Body.create(Common.extend(parts[i], options));
          }

          // flag internal edges (coincident part edges)
          if (flagInternal) {
              var coincident_max_dist = 5;

              for (i = 0; i < parts.length; i++) {
                  var partA = parts[i];

                  for (j = i + 1; j < parts.length; j++) {
                      var partB = parts[j];

                      if (Bounds.overlaps(partA.bounds, partB.bounds)) {
                          var pav = partA.vertices,
                              pbv = partB.vertices;

                          // iterate vertices of both parts
                          for (k = 0; k < partA.vertices.length; k++) {
                              for (z = 0; z < partB.vertices.length; z++) {
                                  // find distances between the vertices
                                  var da = Vector.magnitudeSquared(Vector.sub(pav[(k + 1) % pav.length], pbv[z])),
                                      db = Vector.magnitudeSquared(Vector.sub(pav[k], pbv[(z + 1) % pbv.length]));

                                  // if both vertices are very close, consider the edge concident (internal)
                                  if (da < coincident_max_dist && db < coincident_max_dist) {
                                      pav[k].isInternal = true;
                                      pbv[z].isInternal = true;
                                  }
                              }
                          }

                      }
                  }
              }
          }

          if (parts.length > 1) {
              // create the parent body to be returned, that contains generated compound parts
              body = Body.create(Common.extend({ parts: parts.slice(0) }, options));

              // offset such that body.position is at the centre off mass
              Body.setPosition(body, { x: x, y: y });

              return body;
          } else {
              return parts[0];
          }
      };

  })();


  /***/ }),
  /* 13 */
  /***/ (function(module, exports, __webpack_require__) {

  /**
  * The `Matter.Mouse` module contains methods for creating and manipulating mouse inputs.
  *
  * @class Mouse
  */

  var Mouse = {};

  module.exports = Mouse;

  var Common = __webpack_require__(0);

  (function() {

      /**
       * Creates a mouse input.
       * @method create
       * @param {HTMLElement} element
       * @return {mouse} A new mouse
       */
      Mouse.create = function(element) {
          var mouse = {};

          if (!element) {
              Common.log('Mouse.create: element was undefined, defaulting to document.body', 'warn');
          }
          
          mouse.element = element || document.body;
          mouse.absolute = { x: 0, y: 0 };
          mouse.position = { x: 0, y: 0 };
          mouse.mousedownPosition = { x: 0, y: 0 };
          mouse.mouseupPosition = { x: 0, y: 0 };
          mouse.offset = { x: 0, y: 0 };
          mouse.scale = { x: 1, y: 1 };
          mouse.wheelDelta = 0;
          mouse.button = -1;
          mouse.pixelRatio = parseInt(mouse.element.getAttribute('data-pixel-ratio'), 10) || 1;

          mouse.sourceEvents = {
              mousemove: null,
              mousedown: null,
              mouseup: null,
              mousewheel: null
          };
          
          mouse.mousemove = function(event) { 
              var position = Mouse._getRelativeMousePosition(event, mouse.element, mouse.pixelRatio),
                  touches = event.changedTouches;

              if (touches) {
                  mouse.button = 0;
                  event.preventDefault();
              }

              mouse.absolute.x = position.x;
              mouse.absolute.y = position.y;
              mouse.position.x = mouse.absolute.x * mouse.scale.x + mouse.offset.x;
              mouse.position.y = mouse.absolute.y * mouse.scale.y + mouse.offset.y;
              mouse.sourceEvents.mousemove = event;
          };
          
          mouse.mousedown = function(event) {
              var position = Mouse._getRelativeMousePosition(event, mouse.element, mouse.pixelRatio),
                  touches = event.changedTouches;

              if (touches) {
                  mouse.button = 0;
                  event.preventDefault();
              } else {
                  mouse.button = event.button;
              }

              mouse.absolute.x = position.x;
              mouse.absolute.y = position.y;
              mouse.position.x = mouse.absolute.x * mouse.scale.x + mouse.offset.x;
              mouse.position.y = mouse.absolute.y * mouse.scale.y + mouse.offset.y;
              mouse.mousedownPosition.x = mouse.position.x;
              mouse.mousedownPosition.y = mouse.position.y;
              mouse.sourceEvents.mousedown = event;
          };
          
          mouse.mouseup = function(event) {
              var position = Mouse._getRelativeMousePosition(event, mouse.element, mouse.pixelRatio),
                  touches = event.changedTouches;

              if (touches) {
                  event.preventDefault();
              }
              
              mouse.button = -1;
              mouse.absolute.x = position.x;
              mouse.absolute.y = position.y;
              mouse.position.x = mouse.absolute.x * mouse.scale.x + mouse.offset.x;
              mouse.position.y = mouse.absolute.y * mouse.scale.y + mouse.offset.y;
              mouse.mouseupPosition.x = mouse.position.x;
              mouse.mouseupPosition.y = mouse.position.y;
              mouse.sourceEvents.mouseup = event;
          };

          mouse.mousewheel = function(event) {
              mouse.wheelDelta = Math.max(-1, Math.min(1, event.wheelDelta || -event.detail));
              event.preventDefault();
          };

          Mouse.setElement(mouse, mouse.element);

          return mouse;
      };

      /**
       * Sets the element the mouse is bound to (and relative to).
       * @method setElement
       * @param {mouse} mouse
       * @param {HTMLElement} element
       */
      Mouse.setElement = function(mouse, element) {
          mouse.element = element;

          element.addEventListener('mousemove', mouse.mousemove);
          element.addEventListener('mousedown', mouse.mousedown);
          element.addEventListener('mouseup', mouse.mouseup);
          
          element.addEventListener('mousewheel', mouse.mousewheel);
          element.addEventListener('DOMMouseScroll', mouse.mousewheel);

          element.addEventListener('touchmove', mouse.mousemove);
          element.addEventListener('touchstart', mouse.mousedown);
          element.addEventListener('touchend', mouse.mouseup);
      };

      /**
       * Clears all captured source events.
       * @method clearSourceEvents
       * @param {mouse} mouse
       */
      Mouse.clearSourceEvents = function(mouse) {
          mouse.sourceEvents.mousemove = null;
          mouse.sourceEvents.mousedown = null;
          mouse.sourceEvents.mouseup = null;
          mouse.sourceEvents.mousewheel = null;
          mouse.wheelDelta = 0;
      };

      /**
       * Sets the mouse position offset.
       * @method setOffset
       * @param {mouse} mouse
       * @param {vector} offset
       */
      Mouse.setOffset = function(mouse, offset) {
          mouse.offset.x = offset.x;
          mouse.offset.y = offset.y;
          mouse.position.x = mouse.absolute.x * mouse.scale.x + mouse.offset.x;
          mouse.position.y = mouse.absolute.y * mouse.scale.y + mouse.offset.y;
      };

      /**
       * Sets the mouse position scale.
       * @method setScale
       * @param {mouse} mouse
       * @param {vector} scale
       */
      Mouse.setScale = function(mouse, scale) {
          mouse.scale.x = scale.x;
          mouse.scale.y = scale.y;
          mouse.position.x = mouse.absolute.x * mouse.scale.x + mouse.offset.x;
          mouse.position.y = mouse.absolute.y * mouse.scale.y + mouse.offset.y;
      };
      
      /**
       * Gets the mouse position relative to an element given a screen pixel ratio.
       * @method _getRelativeMousePosition
       * @private
       * @param {} event
       * @param {} element
       * @param {number} pixelRatio
       * @return {}
       */
      Mouse._getRelativeMousePosition = function(event, element, pixelRatio) {
          var elementBounds = element.getBoundingClientRect(),
              rootNode = (document.documentElement || document.body.parentNode || document.body),
              scrollX = (window.pageXOffset !== undefined) ? window.pageXOffset : rootNode.scrollLeft,
              scrollY = (window.pageYOffset !== undefined) ? window.pageYOffset : rootNode.scrollTop,
              touches = event.changedTouches,
              x, y;
          
          if (touches) {
              x = touches[0].pageX - elementBounds.left - scrollX;
              y = touches[0].pageY - elementBounds.top - scrollY;
          } else {
              x = event.pageX - elementBounds.left - scrollX;
              y = event.pageY - elementBounds.top - scrollY;
          }

          return { 
              x: x / (element.clientWidth / (element.width || element.clientWidth) * pixelRatio),
              y: y / (element.clientHeight / (element.height || element.clientHeight) * pixelRatio)
          };
      };

  })();


  /***/ }),
  /* 14 */
  /***/ (function(module, exports, __webpack_require__) {

  /**
  * The `Matter.Detector` module contains methods for efficiently detecting collisions between a list of bodies using a broadphase algorithm.
  *
  * @class Detector
  */

  var Detector = {};

  module.exports = Detector;

  var Common = __webpack_require__(0);
  var Collision = __webpack_require__(8);

  (function() {

      /**
       * Creates a new collision detector.
       * @method create
       * @param {} options
       * @return {detector} A new collision detector
       */
      Detector.create = function(options) {
          var defaults = {
              bodies: [],
              pairs: null
          };

          return Common.extend(defaults, options);
      };

      /**
       * Sets the list of bodies in the detector.
       * @method setBodies
       * @param {detector} detector
       * @param {body[]} bodies
       */
      Detector.setBodies = function(detector, bodies) {
          detector.bodies = bodies.slice(0);
      };

      /**
       * Clears the detector including its list of bodies.
       * @method clear
       * @param {detector} detector
       */
      Detector.clear = function(detector) {
          detector.bodies = [];
      };

      /**
       * Efficiently finds all collisions among all the bodies in `detector.bodies` using a broadphase algorithm.
       * 
       * _Note:_ The specific ordering of collisions returned is not guaranteed between releases and may change for performance reasons.
       * If a specific ordering is required then apply a sort to the resulting array.
       * @method collisions
       * @param {detector} detector
       * @return {collision[]} collisions
       */
      Detector.collisions = function(detector) {
          var collisions = [],
              pairs = detector.pairs,
              bodies = detector.bodies,
              bodiesLength = bodies.length,
              canCollide = Detector.canCollide,
              collides = Collision.collides,
              i,
              j;

          bodies.sort(Detector._compareBoundsX);

          for (i = 0; i < bodiesLength; i++) {
              var bodyA = bodies[i],
                  boundsA = bodyA.bounds,
                  boundXMax = bodyA.bounds.max.x,
                  boundYMax = bodyA.bounds.max.y,
                  boundYMin = bodyA.bounds.min.y,
                  bodyAStatic = bodyA.isStatic || bodyA.isSleeping,
                  partsALength = bodyA.parts.length,
                  partsASingle = partsALength === 1;

              for (j = i + 1; j < bodiesLength; j++) {
                  var bodyB = bodies[j],
                      boundsB = bodyB.bounds;

                  if (boundsB.min.x > boundXMax) {
                      break;
                  }

                  if (boundYMax < boundsB.min.y || boundYMin > boundsB.max.y) {
                      continue;
                  }

                  if (bodyAStatic && (bodyB.isStatic || bodyB.isSleeping)) {
                      continue;
                  }

                  if (!canCollide(bodyA.collisionFilter, bodyB.collisionFilter)) {
                      continue;
                  }

                  var partsBLength = bodyB.parts.length;

                  if (partsASingle && partsBLength === 1) {
                      var collision = collides(bodyA, bodyB, pairs);

                      if (collision) {
                          collisions.push(collision);
                      }
                  } else {
                      var partsAStart = partsALength > 1 ? 1 : 0,
                          partsBStart = partsBLength > 1 ? 1 : 0;
                      
                      for (var k = partsAStart; k < partsALength; k++) {
                          var partA = bodyA.parts[k],
                              boundsA = partA.bounds;

                          for (var z = partsBStart; z < partsBLength; z++) {
                              var partB = bodyB.parts[z],
                                  boundsB = partB.bounds;

                              if (boundsA.min.x > boundsB.max.x || boundsA.max.x < boundsB.min.x
                                  || boundsA.max.y < boundsB.min.y || boundsA.min.y > boundsB.max.y) {
                                  continue;
                              }

                              var collision = collides(partA, partB, pairs);

                              if (collision) {
                                  collisions.push(collision);
                              }
                          }
                      }
                  }
              }
          }

          return collisions;
      };

      /**
       * Returns `true` if both supplied collision filters will allow a collision to occur.
       * See `body.collisionFilter` for more information.
       * @method canCollide
       * @param {} filterA
       * @param {} filterB
       * @return {bool} `true` if collision can occur
       */
      Detector.canCollide = function(filterA, filterB) {
          if (filterA.group === filterB.group && filterA.group !== 0)
              return filterA.group > 0;

          return (filterA.mask & filterB.category) !== 0 && (filterB.mask & filterA.category) !== 0;
      };

      /**
       * The comparison function used in the broadphase algorithm.
       * Returns the signed delta of the bodies bounds on the x-axis.
       * @private
       * @method _sortCompare
       * @param {body} bodyA
       * @param {body} bodyB
       * @return {number} The signed delta used for sorting
       */
      Detector._compareBoundsX = function(bodyA, bodyB) {
          return bodyA.bounds.min.x - bodyB.bounds.min.x;
      };

      /*
      *
      *  Properties Documentation
      *
      */

      /**
       * The array of `Matter.Body` between which the detector finds collisions.
       * 
       * _Note:_ The order of bodies in this array _is not fixed_ and will be continually managed by the detector.
       * @property bodies
       * @type body[]
       * @default []
       */

      /**
       * Optional. A `Matter.Pairs` object from which previous collision objects may be reused. Intended for internal `Matter.Engine` usage.
       * @property pairs
       * @type {pairs|null}
       * @default null
       */

  })();


  /***/ }),
  /* 15 */
  /***/ (function(module, exports, __webpack_require__) {

  /**
  * The `Matter.Plugin` module contains functions for registering and installing plugins on modules.
  *
  * @class Plugin
  */

  var Plugin = {};

  module.exports = Plugin;

  var Common = __webpack_require__(0);

  (function() {

      Plugin._registry = {};

      /**
       * Registers a plugin object so it can be resolved later by name.
       * @method register
       * @param plugin {} The plugin to register.
       * @return {object} The plugin.
       */
      Plugin.register = function(plugin) {
          if (!Plugin.isPlugin(plugin)) {
              Common.warn('Plugin.register:', Plugin.toString(plugin), 'does not implement all required fields.');
          }

          if (plugin.name in Plugin._registry) {
              var registered = Plugin._registry[plugin.name],
                  pluginVersion = Plugin.versionParse(plugin.version).number,
                  registeredVersion = Plugin.versionParse(registered.version).number;

              if (pluginVersion > registeredVersion) {
                  Common.warn('Plugin.register:', Plugin.toString(registered), 'was upgraded to', Plugin.toString(plugin));
                  Plugin._registry[plugin.name] = plugin;
              } else if (pluginVersion < registeredVersion) {
                  Common.warn('Plugin.register:', Plugin.toString(registered), 'can not be downgraded to', Plugin.toString(plugin));
              } else if (plugin !== registered) {
                  Common.warn('Plugin.register:', Plugin.toString(plugin), 'is already registered to different plugin object');
              }
          } else {
              Plugin._registry[plugin.name] = plugin;
          }

          return plugin;
      };

      /**
       * Resolves a dependency to a plugin object from the registry if it exists. 
       * The `dependency` may contain a version, but only the name matters when resolving.
       * @method resolve
       * @param dependency {string} The dependency.
       * @return {object} The plugin if resolved, otherwise `undefined`.
       */
      Plugin.resolve = function(dependency) {
          return Plugin._registry[Plugin.dependencyParse(dependency).name];
      };

      /**
       * Returns a pretty printed plugin name and version.
       * @method toString
       * @param plugin {} The plugin.
       * @return {string} Pretty printed plugin name and version.
       */
      Plugin.toString = function(plugin) {
          return typeof plugin === 'string' ? plugin : (plugin.name || 'anonymous') + '@' + (plugin.version || plugin.range || '0.0.0');
      };

      /**
       * Returns `true` if the object meets the minimum standard to be considered a plugin.
       * This means it must define the following properties:
       * - `name`
       * - `version`
       * - `install`
       * @method isPlugin
       * @param obj {} The obj to test.
       * @return {boolean} `true` if the object can be considered a plugin otherwise `false`.
       */
      Plugin.isPlugin = function(obj) {
          return obj && obj.name && obj.version && obj.install;
      };

      /**
       * Returns `true` if a plugin with the given `name` been installed on `module`.
       * @method isUsed
       * @param module {} The module.
       * @param name {string} The plugin name.
       * @return {boolean} `true` if a plugin with the given `name` been installed on `module`, otherwise `false`.
       */
      Plugin.isUsed = function(module, name) {
          return module.used.indexOf(name) > -1;
      };

      /**
       * Returns `true` if `plugin.for` is applicable to `module` by comparing against `module.name` and `module.version`.
       * If `plugin.for` is not specified then it is assumed to be applicable.
       * The value of `plugin.for` is a string of the format `'module-name'` or `'module-name@version'`.
       * @method isFor
       * @param plugin {} The plugin.
       * @param module {} The module.
       * @return {boolean} `true` if `plugin.for` is applicable to `module`, otherwise `false`.
       */
      Plugin.isFor = function(plugin, module) {
          var parsed = plugin.for && Plugin.dependencyParse(plugin.for);
          return !plugin.for || (module.name === parsed.name && Plugin.versionSatisfies(module.version, parsed.range));
      };

      /**
       * Installs the plugins by calling `plugin.install` on each plugin specified in `plugins` if passed, otherwise `module.uses`.
       * For installing plugins on `Matter` see the convenience function `Matter.use`.
       * Plugins may be specified either by their name or a reference to the plugin object.
       * Plugins themselves may specify further dependencies, but each plugin is installed only once.
       * Order is important, a topological sort is performed to find the best resulting order of installation.
       * This sorting attempts to satisfy every dependency's requested ordering, but may not be exact in all cases.
       * This function logs the resulting status of each dependency in the console, along with any warnings.
       * - A green tick ✅ indicates a dependency was resolved and installed.
       * - An orange diamond 🔶 indicates a dependency was resolved but a warning was thrown for it or one if its dependencies.
       * - A red cross ❌ indicates a dependency could not be resolved.
       * Avoid calling this function multiple times on the same module unless you intend to manually control installation order.
       * @method use
       * @param module {} The module install plugins on.
       * @param [plugins=module.uses] {} The plugins to install on module (optional, defaults to `module.uses`).
       */
      Plugin.use = function(module, plugins) {
          module.uses = (module.uses || []).concat(plugins || []);

          if (module.uses.length === 0) {
              Common.warn('Plugin.use:', Plugin.toString(module), 'does not specify any dependencies to install.');
              return;
          }

          var dependencies = Plugin.dependencies(module),
              sortedDependencies = Common.topologicalSort(dependencies),
              status = [];

          for (var i = 0; i < sortedDependencies.length; i += 1) {
              if (sortedDependencies[i] === module.name) {
                  continue;
              }

              var plugin = Plugin.resolve(sortedDependencies[i]);

              if (!plugin) {
                  status.push('❌ ' + sortedDependencies[i]);
                  continue;
              }

              if (Plugin.isUsed(module, plugin.name)) {
                  continue;
              }

              if (!Plugin.isFor(plugin, module)) {
                  Common.warn('Plugin.use:', Plugin.toString(plugin), 'is for', plugin.for, 'but installed on', Plugin.toString(module) + '.');
                  plugin._warned = true;
              }

              if (plugin.install) {
                  plugin.install(module);
              } else {
                  Common.warn('Plugin.use:', Plugin.toString(plugin), 'does not specify an install function.');
                  plugin._warned = true;
              }

              if (plugin._warned) {
                  status.push('🔶 ' + Plugin.toString(plugin));
                  delete plugin._warned;
              } else {
                  status.push('✅ ' + Plugin.toString(plugin));
              }

              module.used.push(plugin.name);
          }

          if (status.length > 0) {
              Common.info(status.join('  '));
          }
      };

      /**
       * Recursively finds all of a module's dependencies and returns a flat dependency graph.
       * @method dependencies
       * @param module {} The module.
       * @return {object} A dependency graph.
       */
      Plugin.dependencies = function(module, tracked) {
          var parsedBase = Plugin.dependencyParse(module),
              name = parsedBase.name;

          tracked = tracked || {};

          if (name in tracked) {
              return;
          }

          module = Plugin.resolve(module) || module;

          tracked[name] = Common.map(module.uses || [], function(dependency) {
              if (Plugin.isPlugin(dependency)) {
                  Plugin.register(dependency);
              }

              var parsed = Plugin.dependencyParse(dependency),
                  resolved = Plugin.resolve(dependency);

              if (resolved && !Plugin.versionSatisfies(resolved.version, parsed.range)) {
                  Common.warn(
                      'Plugin.dependencies:', Plugin.toString(resolved), 'does not satisfy',
                      Plugin.toString(parsed), 'used by', Plugin.toString(parsedBase) + '.'
                  );

                  resolved._warned = true;
                  module._warned = true;
              } else if (!resolved) {
                  Common.warn(
                      'Plugin.dependencies:', Plugin.toString(dependency), 'used by',
                      Plugin.toString(parsedBase), 'could not be resolved.'
                  );

                  module._warned = true;
              }

              return parsed.name;
          });

          for (var i = 0; i < tracked[name].length; i += 1) {
              Plugin.dependencies(tracked[name][i], tracked);
          }

          return tracked;
      };

      /**
       * Parses a dependency string into its components.
       * The `dependency` is a string of the format `'module-name'` or `'module-name@version'`.
       * See documentation for `Plugin.versionParse` for a description of the format.
       * This function can also handle dependencies that are already resolved (e.g. a module object).
       * @method dependencyParse
       * @param dependency {string} The dependency of the format `'module-name'` or `'module-name@version'`.
       * @return {object} The dependency parsed into its components.
       */
      Plugin.dependencyParse = function(dependency) {
          if (Common.isString(dependency)) {
              var pattern = /^[\w-]+(@(\*|[\^~]?\d+\.\d+\.\d+(-[0-9A-Za-z-+]+)?))?$/;

              if (!pattern.test(dependency)) {
                  Common.warn('Plugin.dependencyParse:', dependency, 'is not a valid dependency string.');
              }

              return {
                  name: dependency.split('@')[0],
                  range: dependency.split('@')[1] || '*'
              };
          }

          return {
              name: dependency.name,
              range: dependency.range || dependency.version
          };
      };

      /**
       * Parses a version string into its components.  
       * Versions are strictly of the format `x.y.z` (as in [semver](http://semver.org/)).
       * Versions may optionally have a prerelease tag in the format `x.y.z-alpha`.
       * Ranges are a strict subset of [npm ranges](https://docs.npmjs.com/misc/semver#advanced-range-syntax).
       * Only the following range types are supported:
       * - Tilde ranges e.g. `~1.2.3`
       * - Caret ranges e.g. `^1.2.3`
       * - Greater than ranges e.g. `>1.2.3`
       * - Greater than or equal ranges e.g. `>=1.2.3`
       * - Exact version e.g. `1.2.3`
       * - Any version `*`
       * @method versionParse
       * @param range {string} The version string.
       * @return {object} The version range parsed into its components.
       */
      Plugin.versionParse = function(range) {
          var pattern = /^(\*)|(\^|~|>=|>)?\s*((\d+)\.(\d+)\.(\d+))(-[0-9A-Za-z-+]+)?$/;

          if (!pattern.test(range)) {
              Common.warn('Plugin.versionParse:', range, 'is not a valid version or range.');
          }

          var parts = pattern.exec(range);
          var major = Number(parts[4]);
          var minor = Number(parts[5]);
          var patch = Number(parts[6]);

          return {
              isRange: Boolean(parts[1] || parts[2]),
              version: parts[3],
              range: range,
              operator: parts[1] || parts[2] || '',
              major: major,
              minor: minor,
              patch: patch,
              parts: [major, minor, patch],
              prerelease: parts[7],
              number: major * 1e8 + minor * 1e4 + patch
          };
      };

      /**
       * Returns `true` if `version` satisfies the given `range`.
       * See documentation for `Plugin.versionParse` for a description of the format.
       * If a version or range is not specified, then any version (`*`) is assumed to satisfy.
       * @method versionSatisfies
       * @param version {string} The version string.
       * @param range {string} The range string.
       * @return {boolean} `true` if `version` satisfies `range`, otherwise `false`.
       */
      Plugin.versionSatisfies = function(version, range) {
          range = range || '*';

          var r = Plugin.versionParse(range),
              v = Plugin.versionParse(version);

          if (r.isRange) {
              if (r.operator === '*' || version === '*') {
                  return true;
              }

              if (r.operator === '>') {
                  return v.number > r.number;
              }

              if (r.operator === '>=') {
                  return v.number >= r.number;
              }

              if (r.operator === '~') {
                  return v.major === r.major && v.minor === r.minor && v.patch >= r.patch;
              }

              if (r.operator === '^') {
                  if (r.major > 0) {
                      return v.major === r.major && v.number >= r.number;
                  }

                  if (r.minor > 0) {
                      return v.minor === r.minor && v.patch >= r.patch;
                  }

                  return v.patch === r.patch;
              }
          }

          return version === range || version === '*';
      };

  })();


  /***/ }),
  /* 16 */
  /***/ (function(module, exports, __webpack_require__) {

  /**
  * The `Matter.Render` module is a simple canvas based renderer for visualising instances of `Matter.Engine`.
  * It is intended for development and debugging purposes, but may also be suitable for simple games.
  * It includes a number of drawing options including wireframe, vector with support for sprites and viewports.
  *
  * @class Render
  */

  var Render = {};

  module.exports = Render;

  var Common = __webpack_require__(0);
  var Composite = __webpack_require__(5);
  var Bounds = __webpack_require__(1);
  var Events = __webpack_require__(4);
  var Vector = __webpack_require__(2);
  var Mouse = __webpack_require__(13);

  (function() {

      var _requestAnimationFrame,
          _cancelAnimationFrame;

      if (typeof window !== 'undefined') {
          _requestAnimationFrame = window.requestAnimationFrame || window.webkitRequestAnimationFrame
                                        || window.mozRequestAnimationFrame || window.msRequestAnimationFrame
                                        || function(callback){ window.setTimeout(function() { callback(Common.now()); }, 1000 / 60); };

          _cancelAnimationFrame = window.cancelAnimationFrame || window.mozCancelAnimationFrame
                                        || window.webkitCancelAnimationFrame || window.msCancelAnimationFrame;
      }

      Render._goodFps = 30;
      Render._goodDelta = 1000 / 60;

      /**
       * Creates a new renderer. The options parameter is an object that specifies any properties you wish to override the defaults.
       * All properties have default values, and many are pre-calculated automatically based on other properties.
       * See the properties section below for detailed information on what you can pass via the `options` object.
       * @method create
       * @param {object} [options]
       * @return {render} A new renderer
       */
      Render.create = function(options) {
          var defaults = {
              controller: Render,
              engine: null,
              element: null,
              canvas: null,
              mouse: null,
              frameRequestId: null,
              timing: {
                  historySize: 60,
                  delta: 0,
                  deltaHistory: [],
                  lastTime: 0,
                  lastTimestamp: 0,
                  lastElapsed: 0,
                  timestampElapsed: 0,
                  timestampElapsedHistory: [],
                  engineDeltaHistory: [],
                  engineElapsedHistory: [],
                  elapsedHistory: []
              },
              options: {
                  width: 800,
                  height: 600,
                  pixelRatio: 1,
                  background: '#14151f',
                  wireframeBackground: '#14151f',
                  hasBounds: !!options.bounds,
                  enabled: true,
                  wireframes: true,
                  showSleeping: true,
                  showDebug: false,
                  showStats: false,
                  showPerformance: false,
                  showBounds: false,
                  showVelocity: false,
                  showCollisions: false,
                  showSeparations: false,
                  showAxes: false,
                  showPositions: false,
                  showAngleIndicator: false,
                  showIds: false,
                  showVertexNumbers: false,
                  showConvexHulls: false,
                  showInternalEdges: false,
                  showMousePosition: false
              }
          };

          var render = Common.extend(defaults, options);

          if (render.canvas) {
              render.canvas.width = render.options.width || render.canvas.width;
              render.canvas.height = render.options.height || render.canvas.height;
          }

          render.mouse = options.mouse;
          render.engine = options.engine;
          render.canvas = render.canvas || _createCanvas(render.options.width, render.options.height);
          render.context = render.canvas.getContext('2d');
          render.textures = {};

          render.bounds = render.bounds || {
              min: {
                  x: 0,
                  y: 0
              },
              max: {
                  x: render.canvas.width,
                  y: render.canvas.height
              }
          };

          // for temporary back compatibility only
          render.options.showBroadphase = false;

          if (render.options.pixelRatio !== 1) {
              Render.setPixelRatio(render, render.options.pixelRatio);
          }

          if (Common.isElement(render.element)) {
              render.element.appendChild(render.canvas);
          } else if (!render.canvas.parentNode) {
              Common.log('Render.create: options.element was undefined, render.canvas was created but not appended', 'warn');
          }

          return render;
      };

      /**
       * Continuously updates the render canvas on the `requestAnimationFrame` event.
       * @method run
       * @param {render} render
       */
      Render.run = function(render) {
          (function loop(time){
              render.frameRequestId = _requestAnimationFrame(loop);
              
              _updateTiming(render, time);

              Render.world(render, time);

              if (render.options.showStats || render.options.showDebug) {
                  Render.stats(render, render.context, time);
              }

              if (render.options.showPerformance || render.options.showDebug) {
                  Render.performance(render, render.context, time);
              }
          })();
      };

      /**
       * Ends execution of `Render.run` on the given `render`, by canceling the animation frame request event loop.
       * @method stop
       * @param {render} render
       */
      Render.stop = function(render) {
          _cancelAnimationFrame(render.frameRequestId);
      };

      /**
       * Sets the pixel ratio of the renderer and updates the canvas.
       * To automatically detect the correct ratio, pass the string `'auto'` for `pixelRatio`.
       * @method setPixelRatio
       * @param {render} render
       * @param {number} pixelRatio
       */
      Render.setPixelRatio = function(render, pixelRatio) {
          var options = render.options,
              canvas = render.canvas;

          if (pixelRatio === 'auto') {
              pixelRatio = _getPixelRatio(canvas);
          }

          options.pixelRatio = pixelRatio;
          canvas.setAttribute('data-pixel-ratio', pixelRatio);
          canvas.width = options.width * pixelRatio;
          canvas.height = options.height * pixelRatio;
          canvas.style.width = options.width + 'px';
          canvas.style.height = options.height + 'px';
      };

      /**
       * Positions and sizes the viewport around the given object bounds.
       * Objects must have at least one of the following properties:
       * - `object.bounds`
       * - `object.position`
       * - `object.min` and `object.max`
       * - `object.x` and `object.y`
       * @method lookAt
       * @param {render} render
       * @param {object[]} objects
       * @param {vector} [padding]
       * @param {bool} [center=true]
       */
      Render.lookAt = function(render, objects, padding, center) {
          center = typeof center !== 'undefined' ? center : true;
          objects = Common.isArray(objects) ? objects : [objects];
          padding = padding || {
              x: 0,
              y: 0
          };

          // find bounds of all objects
          var bounds = {
              min: { x: Infinity, y: Infinity },
              max: { x: -Infinity, y: -Infinity }
          };

          for (var i = 0; i < objects.length; i += 1) {
              var object = objects[i],
                  min = object.bounds ? object.bounds.min : (object.min || object.position || object),
                  max = object.bounds ? object.bounds.max : (object.max || object.position || object);

              if (min && max) {
                  if (min.x < bounds.min.x)
                      bounds.min.x = min.x;

                  if (max.x > bounds.max.x)
                      bounds.max.x = max.x;

                  if (min.y < bounds.min.y)
                      bounds.min.y = min.y;

                  if (max.y > bounds.max.y)
                      bounds.max.y = max.y;
              }
          }

          // find ratios
          var width = (bounds.max.x - bounds.min.x) + 2 * padding.x,
              height = (bounds.max.y - bounds.min.y) + 2 * padding.y,
              viewHeight = render.canvas.height,
              viewWidth = render.canvas.width,
              outerRatio = viewWidth / viewHeight,
              innerRatio = width / height,
              scaleX = 1,
              scaleY = 1;

          // find scale factor
          if (innerRatio > outerRatio) {
              scaleY = innerRatio / outerRatio;
          } else {
              scaleX = outerRatio / innerRatio;
          }

          // enable bounds
          render.options.hasBounds = true;

          // position and size
          render.bounds.min.x = bounds.min.x;
          render.bounds.max.x = bounds.min.x + width * scaleX;
          render.bounds.min.y = bounds.min.y;
          render.bounds.max.y = bounds.min.y + height * scaleY;

          // center
          if (center) {
              render.bounds.min.x += width * 0.5 - (width * scaleX) * 0.5;
              render.bounds.max.x += width * 0.5 - (width * scaleX) * 0.5;
              render.bounds.min.y += height * 0.5 - (height * scaleY) * 0.5;
              render.bounds.max.y += height * 0.5 - (height * scaleY) * 0.5;
          }

          // padding
          render.bounds.min.x -= padding.x;
          render.bounds.max.x -= padding.x;
          render.bounds.min.y -= padding.y;
          render.bounds.max.y -= padding.y;

          // update mouse
          if (render.mouse) {
              Mouse.setScale(render.mouse, {
                  x: (render.bounds.max.x - render.bounds.min.x) / render.canvas.width,
                  y: (render.bounds.max.y - render.bounds.min.y) / render.canvas.height
              });

              Mouse.setOffset(render.mouse, render.bounds.min);
          }
      };

      /**
       * Applies viewport transforms based on `render.bounds` to a render context.
       * @method startViewTransform
       * @param {render} render
       */
      Render.startViewTransform = function(render) {
          var boundsWidth = render.bounds.max.x - render.bounds.min.x,
              boundsHeight = render.bounds.max.y - render.bounds.min.y,
              boundsScaleX = boundsWidth / render.options.width,
              boundsScaleY = boundsHeight / render.options.height;

          render.context.setTransform(
              render.options.pixelRatio / boundsScaleX, 0, 0, 
              render.options.pixelRatio / boundsScaleY, 0, 0
          );
          
          render.context.translate(-render.bounds.min.x, -render.bounds.min.y);
      };

      /**
       * Resets all transforms on the render context.
       * @method endViewTransform
       * @param {render} render
       */
      Render.endViewTransform = function(render) {
          render.context.setTransform(render.options.pixelRatio, 0, 0, render.options.pixelRatio, 0, 0);
      };

      /**
       * Renders the given `engine`'s `Matter.World` object.
       * This is the entry point for all rendering and should be called every time the scene changes.
       * @method world
       * @param {render} render
       */
      Render.world = function(render, time) {
          var startTime = Common.now(),
              engine = render.engine,
              world = engine.world,
              canvas = render.canvas,
              context = render.context,
              options = render.options,
              timing = render.timing;

          var allBodies = Composite.allBodies(world),
              allConstraints = Composite.allConstraints(world),
              background = options.wireframes ? options.wireframeBackground : options.background,
              bodies = [],
              constraints = [],
              i;

          var event = {
              timestamp: engine.timing.timestamp
          };

          Events.trigger(render, 'beforeRender', event);

          // apply background if it has changed
          if (render.currentBackground !== background)
              _applyBackground(render, background);

          // clear the canvas with a transparent fill, to allow the canvas background to show
          context.globalCompositeOperation = 'source-in';
          context.fillStyle = "transparent";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.globalCompositeOperation = 'source-over';

          // handle bounds
          if (options.hasBounds) {
              // filter out bodies that are not in view
              for (i = 0; i < allBodies.length; i++) {
                  var body = allBodies[i];
                  if (Bounds.overlaps(body.bounds, render.bounds))
                      bodies.push(body);
              }

              // filter out constraints that are not in view
              for (i = 0; i < allConstraints.length; i++) {
                  var constraint = allConstraints[i],
                      bodyA = constraint.bodyA,
                      bodyB = constraint.bodyB,
                      pointAWorld = constraint.pointA,
                      pointBWorld = constraint.pointB;

                  if (bodyA) pointAWorld = Vector.add(bodyA.position, constraint.pointA);
                  if (bodyB) pointBWorld = Vector.add(bodyB.position, constraint.pointB);

                  if (!pointAWorld || !pointBWorld)
                      continue;

                  if (Bounds.contains(render.bounds, pointAWorld) || Bounds.contains(render.bounds, pointBWorld))
                      constraints.push(constraint);
              }

              // transform the view
              Render.startViewTransform(render);

              // update mouse
              if (render.mouse) {
                  Mouse.setScale(render.mouse, {
                      x: (render.bounds.max.x - render.bounds.min.x) / render.options.width,
                      y: (render.bounds.max.y - render.bounds.min.y) / render.options.height
                  });

                  Mouse.setOffset(render.mouse, render.bounds.min);
              }
          } else {
              constraints = allConstraints;
              bodies = allBodies;

              if (render.options.pixelRatio !== 1) {
                  render.context.setTransform(render.options.pixelRatio, 0, 0, render.options.pixelRatio, 0, 0);
              }
          }

          if (!options.wireframes || (engine.enableSleeping && options.showSleeping)) {
              // fully featured rendering of bodies
              Render.bodies(render, bodies, context);
          } else {
              if (options.showConvexHulls)
                  Render.bodyConvexHulls(render, bodies, context);

              // optimised method for wireframes only
              Render.bodyWireframes(render, bodies, context);
          }

          if (options.showBounds)
              Render.bodyBounds(render, bodies, context);

          if (options.showAxes || options.showAngleIndicator)
              Render.bodyAxes(render, bodies, context);

          if (options.showPositions)
              Render.bodyPositions(render, bodies, context);

          if (options.showVelocity)
              Render.bodyVelocity(render, bodies, context);

          if (options.showIds)
              Render.bodyIds(render, bodies, context);

          if (options.showSeparations)
              Render.separations(render, engine.pairs.list, context);

          if (options.showCollisions)
              Render.collisions(render, engine.pairs.list, context);

          if (options.showVertexNumbers)
              Render.vertexNumbers(render, bodies, context);

          if (options.showMousePosition)
              Render.mousePosition(render, render.mouse, context);

          Render.constraints(constraints, context);

          if (options.hasBounds) {
              // revert view transforms
              Render.endViewTransform(render);
          }

          Events.trigger(render, 'afterRender', event);

          // log the time elapsed computing this update
          timing.lastElapsed = Common.now() - startTime;
      };

      /**
       * Renders statistics about the engine and world useful for debugging.
       * @private
       * @method stats
       * @param {render} render
       * @param {RenderingContext} context
       * @param {Number} time
       */
      Render.stats = function(render, context, time) {
          var engine = render.engine,
              world = engine.world,
              bodies = Composite.allBodies(world),
              parts = 0,
              width = 55,
              height = 44,
              x = 0,
              y = 0;
          
          // count parts
          for (var i = 0; i < bodies.length; i += 1) {
              parts += bodies[i].parts.length;
          }

          // sections
          var sections = {
              'Part': parts,
              'Body': bodies.length,
              'Cons': Composite.allConstraints(world).length,
              'Comp': Composite.allComposites(world).length,
              'Pair': engine.pairs.list.length
          };

          // background
          context.fillStyle = '#0e0f19';
          context.fillRect(x, y, width * 5.5, height);

          context.font = '12px Arial';
          context.textBaseline = 'top';
          context.textAlign = 'right';

          // sections
          for (var key in sections) {
              var section = sections[key];
              // label
              context.fillStyle = '#aaa';
              context.fillText(key, x + width, y + 8);

              // value
              context.fillStyle = '#eee';
              context.fillText(section, x + width, y + 26);

              x += width;
          }
      };

      /**
       * Renders engine and render performance information.
       * @private
       * @method performance
       * @param {render} render
       * @param {RenderingContext} context
       */
      Render.performance = function(render, context) {
          var engine = render.engine,
              timing = render.timing,
              deltaHistory = timing.deltaHistory,
              elapsedHistory = timing.elapsedHistory,
              timestampElapsedHistory = timing.timestampElapsedHistory,
              engineDeltaHistory = timing.engineDeltaHistory,
              engineElapsedHistory = timing.engineElapsedHistory,
              lastEngineDelta = engine.timing.lastDelta;
          
          var deltaMean = _mean(deltaHistory),
              elapsedMean = _mean(elapsedHistory),
              engineDeltaMean = _mean(engineDeltaHistory),
              engineElapsedMean = _mean(engineElapsedHistory),
              timestampElapsedMean = _mean(timestampElapsedHistory),
              rateMean = (timestampElapsedMean / deltaMean) || 0,
              fps = (1000 / deltaMean) || 0;

          var graphHeight = 4,
              gap = 12,
              width = 60,
              height = 34,
              x = 10,
              y = 69;

          // background
          context.fillStyle = '#0e0f19';
          context.fillRect(0, 50, gap * 4 + width * 5 + 22, height);

          // show FPS
          Render.status(
              context, x, y, width, graphHeight, deltaHistory.length, 
              Math.round(fps) + ' fps', 
              fps / Render._goodFps,
              function(i) { return (deltaHistory[i] / deltaMean) - 1; }
          );

          // show engine delta
          Render.status(
              context, x + gap + width, y, width, graphHeight, engineDeltaHistory.length,
              lastEngineDelta.toFixed(2) + ' dt', 
              Render._goodDelta / lastEngineDelta,
              function(i) { return (engineDeltaHistory[i] / engineDeltaMean) - 1; }
          );

          // show engine update time
          Render.status(
              context, x + (gap + width) * 2, y, width, graphHeight, engineElapsedHistory.length,
              engineElapsedMean.toFixed(2) + ' ut', 
              1 - (engineElapsedMean / Render._goodFps),
              function(i) { return (engineElapsedHistory[i] / engineElapsedMean) - 1; }
          );

          // show render time
          Render.status(
              context, x + (gap + width) * 3, y, width, graphHeight, elapsedHistory.length,
              elapsedMean.toFixed(2) + ' rt', 
              1 - (elapsedMean / Render._goodFps),
              function(i) { return (elapsedHistory[i] / elapsedMean) - 1; }
          );

          // show effective speed
          Render.status(
              context, x + (gap + width) * 4, y, width, graphHeight, timestampElapsedHistory.length, 
              rateMean.toFixed(2) + ' x', 
              rateMean * rateMean * rateMean,
              function(i) { return (((timestampElapsedHistory[i] / deltaHistory[i]) / rateMean) || 0) - 1; }
          );
      };

      /**
       * Renders a label, indicator and a chart.
       * @private
       * @method status
       * @param {RenderingContext} context
       * @param {number} x
       * @param {number} y
       * @param {number} width
       * @param {number} height
       * @param {number} count
       * @param {string} label
       * @param {string} indicator
       * @param {function} plotY
       */
      Render.status = function(context, x, y, width, height, count, label, indicator, plotY) {
          // background
          context.strokeStyle = '#888';
          context.fillStyle = '#444';
          context.lineWidth = 1;
          context.fillRect(x, y + 7, width, 1);

          // chart
          context.beginPath();
          context.moveTo(x, y + 7 - height * Common.clamp(0.4 * plotY(0), -2, 2));
          for (var i = 0; i < width; i += 1) {
              context.lineTo(x + i, y + 7 - (i < count ? height * Common.clamp(0.4 * plotY(i), -2, 2) : 0));
          }
          context.stroke();

          // indicator
          context.fillStyle = 'hsl(' + Common.clamp(25 + 95 * indicator, 0, 120) + ',100%,60%)';
          context.fillRect(x, y - 7, 4, 4);

          // label
          context.font = '12px Arial';
          context.textBaseline = 'middle';
          context.textAlign = 'right';
          context.fillStyle = '#eee';
          context.fillText(label, x + width, y - 5);
      };

      /**
       * Description
       * @private
       * @method constraints
       * @param {constraint[]} constraints
       * @param {RenderingContext} context
       */
      Render.constraints = function(constraints, context) {
          var c = context;

          for (var i = 0; i < constraints.length; i++) {
              var constraint = constraints[i];

              if (!constraint.render.visible || !constraint.pointA || !constraint.pointB)
                  continue;

              var bodyA = constraint.bodyA,
                  bodyB = constraint.bodyB,
                  start,
                  end;

              if (bodyA) {
                  start = Vector.add(bodyA.position, constraint.pointA);
              } else {
                  start = constraint.pointA;
              }

              if (constraint.render.type === 'pin') {
                  c.beginPath();
                  c.arc(start.x, start.y, 3, 0, 2 * Math.PI);
                  c.closePath();
              } else {
                  if (bodyB) {
                      end = Vector.add(bodyB.position, constraint.pointB);
                  } else {
                      end = constraint.pointB;
                  }

                  c.beginPath();
                  c.moveTo(start.x, start.y);

                  if (constraint.render.type === 'spring') {
                      var delta = Vector.sub(end, start),
                          normal = Vector.perp(Vector.normalise(delta)),
                          coils = Math.ceil(Common.clamp(constraint.length / 5, 12, 20)),
                          offset;

                      for (var j = 1; j < coils; j += 1) {
                          offset = j % 2 === 0 ? 1 : -1;

                          c.lineTo(
                              start.x + delta.x * (j / coils) + normal.x * offset * 4,
                              start.y + delta.y * (j / coils) + normal.y * offset * 4
                          );
                      }
                  }

                  c.lineTo(end.x, end.y);
              }

              if (constraint.render.lineWidth) {
                  c.lineWidth = constraint.render.lineWidth;
                  c.strokeStyle = constraint.render.strokeStyle;
                  c.stroke();
              }

              if (constraint.render.anchors) {
                  c.fillStyle = constraint.render.strokeStyle;
                  c.beginPath();
                  c.arc(start.x, start.y, 3, 0, 2 * Math.PI);
                  c.arc(end.x, end.y, 3, 0, 2 * Math.PI);
                  c.closePath();
                  c.fill();
              }
          }
      };

      /**
       * Description
       * @private
       * @method bodies
       * @param {render} render
       * @param {body[]} bodies
       * @param {RenderingContext} context
       */
      Render.bodies = function(render, bodies, context) {
          var c = context;
              render.engine;
              var options = render.options,
              showInternalEdges = options.showInternalEdges || !options.wireframes,
              body,
              part,
              i,
              k;

          for (i = 0; i < bodies.length; i++) {
              body = bodies[i];

              if (!body.render.visible)
                  continue;

              // handle compound parts
              for (k = body.parts.length > 1 ? 1 : 0; k < body.parts.length; k++) {
                  part = body.parts[k];

                  if (!part.render.visible)
                      continue;

                  if (options.showSleeping && body.isSleeping) {
                      c.globalAlpha = 0.5 * part.render.opacity;
                  } else if (part.render.opacity !== 1) {
                      c.globalAlpha = part.render.opacity;
                  }

                  if (part.render.sprite && part.render.sprite.texture && !options.wireframes) {
                      // part sprite
                      var sprite = part.render.sprite,
                          texture = _getTexture(render, sprite.texture);

                      c.translate(part.position.x, part.position.y);
                      c.rotate(part.angle);

                      c.drawImage(
                          texture,
                          texture.width * -sprite.xOffset * sprite.xScale,
                          texture.height * -sprite.yOffset * sprite.yScale,
                          texture.width * sprite.xScale,
                          texture.height * sprite.yScale
                      );

                      // revert translation, hopefully faster than save / restore
                      c.rotate(-part.angle);
                      c.translate(-part.position.x, -part.position.y);
                  } else {
                      // part polygon
                      if (part.circleRadius) {
                          c.beginPath();
                          c.arc(part.position.x, part.position.y, part.circleRadius, 0, 2 * Math.PI);
                      } else {
                          c.beginPath();
                          c.moveTo(part.vertices[0].x, part.vertices[0].y);

                          for (var j = 1; j < part.vertices.length; j++) {
                              if (!part.vertices[j - 1].isInternal || showInternalEdges) {
                                  c.lineTo(part.vertices[j].x, part.vertices[j].y);
                              } else {
                                  c.moveTo(part.vertices[j].x, part.vertices[j].y);
                              }

                              if (part.vertices[j].isInternal && !showInternalEdges) {
                                  c.moveTo(part.vertices[(j + 1) % part.vertices.length].x, part.vertices[(j + 1) % part.vertices.length].y);
                              }
                          }

                          c.lineTo(part.vertices[0].x, part.vertices[0].y);
                          c.closePath();
                      }

                      if (!options.wireframes) {
                          c.fillStyle = part.render.fillStyle;

                          if (part.render.lineWidth) {
                              c.lineWidth = part.render.lineWidth;
                              c.strokeStyle = part.render.strokeStyle;
                              c.stroke();
                          }

                          c.fill();
                      } else {
                          c.lineWidth = 1;
                          c.strokeStyle = '#bbb';
                          c.stroke();
                      }
                  }

                  c.globalAlpha = 1;
              }
          }
      };

      /**
       * Optimised method for drawing body wireframes in one pass
       * @private
       * @method bodyWireframes
       * @param {render} render
       * @param {body[]} bodies
       * @param {RenderingContext} context
       */
      Render.bodyWireframes = function(render, bodies, context) {
          var c = context,
              showInternalEdges = render.options.showInternalEdges,
              body,
              part,
              i,
              j,
              k;

          c.beginPath();

          // render all bodies
          for (i = 0; i < bodies.length; i++) {
              body = bodies[i];

              if (!body.render.visible)
                  continue;

              // handle compound parts
              for (k = body.parts.length > 1 ? 1 : 0; k < body.parts.length; k++) {
                  part = body.parts[k];

                  c.moveTo(part.vertices[0].x, part.vertices[0].y);

                  for (j = 1; j < part.vertices.length; j++) {
                      if (!part.vertices[j - 1].isInternal || showInternalEdges) {
                          c.lineTo(part.vertices[j].x, part.vertices[j].y);
                      } else {
                          c.moveTo(part.vertices[j].x, part.vertices[j].y);
                      }

                      if (part.vertices[j].isInternal && !showInternalEdges) {
                          c.moveTo(part.vertices[(j + 1) % part.vertices.length].x, part.vertices[(j + 1) % part.vertices.length].y);
                      }
                  }

                  c.lineTo(part.vertices[0].x, part.vertices[0].y);
              }
          }

          c.lineWidth = 1;
          c.strokeStyle = '#bbb';
          c.stroke();
      };

      /**
       * Optimised method for drawing body convex hull wireframes in one pass
       * @private
       * @method bodyConvexHulls
       * @param {render} render
       * @param {body[]} bodies
       * @param {RenderingContext} context
       */
      Render.bodyConvexHulls = function(render, bodies, context) {
          var c = context,
              body,
              i,
              j;

          c.beginPath();

          // render convex hulls
          for (i = 0; i < bodies.length; i++) {
              body = bodies[i];

              if (!body.render.visible || body.parts.length === 1)
                  continue;

              c.moveTo(body.vertices[0].x, body.vertices[0].y);

              for (j = 1; j < body.vertices.length; j++) {
                  c.lineTo(body.vertices[j].x, body.vertices[j].y);
              }

              c.lineTo(body.vertices[0].x, body.vertices[0].y);
          }

          c.lineWidth = 1;
          c.strokeStyle = 'rgba(255,255,255,0.2)';
          c.stroke();
      };

      /**
       * Renders body vertex numbers.
       * @private
       * @method vertexNumbers
       * @param {render} render
       * @param {body[]} bodies
       * @param {RenderingContext} context
       */
      Render.vertexNumbers = function(render, bodies, context) {
          var c = context,
              i,
              j,
              k;

          for (i = 0; i < bodies.length; i++) {
              var parts = bodies[i].parts;
              for (k = parts.length > 1 ? 1 : 0; k < parts.length; k++) {
                  var part = parts[k];
                  for (j = 0; j < part.vertices.length; j++) {
                      c.fillStyle = 'rgba(255,255,255,0.2)';
                      c.fillText(i + '_' + j, part.position.x + (part.vertices[j].x - part.position.x) * 0.8, part.position.y + (part.vertices[j].y - part.position.y) * 0.8);
                  }
              }
          }
      };

      /**
       * Renders mouse position.
       * @private
       * @method mousePosition
       * @param {render} render
       * @param {mouse} mouse
       * @param {RenderingContext} context
       */
      Render.mousePosition = function(render, mouse, context) {
          var c = context;
          c.fillStyle = 'rgba(255,255,255,0.8)';
          c.fillText(mouse.position.x + '  ' + mouse.position.y, mouse.position.x + 5, mouse.position.y - 5);
      };

      /**
       * Draws body bounds
       * @private
       * @method bodyBounds
       * @param {render} render
       * @param {body[]} bodies
       * @param {RenderingContext} context
       */
      Render.bodyBounds = function(render, bodies, context) {
          var c = context;
              render.engine;
              var options = render.options;

          c.beginPath();

          for (var i = 0; i < bodies.length; i++) {
              var body = bodies[i];

              if (body.render.visible) {
                  var parts = bodies[i].parts;
                  for (var j = parts.length > 1 ? 1 : 0; j < parts.length; j++) {
                      var part = parts[j];
                      c.rect(part.bounds.min.x, part.bounds.min.y, part.bounds.max.x - part.bounds.min.x, part.bounds.max.y - part.bounds.min.y);
                  }
              }
          }

          if (options.wireframes) {
              c.strokeStyle = 'rgba(255,255,255,0.08)';
          } else {
              c.strokeStyle = 'rgba(0,0,0,0.1)';
          }

          c.lineWidth = 1;
          c.stroke();
      };

      /**
       * Draws body angle indicators and axes
       * @private
       * @method bodyAxes
       * @param {render} render
       * @param {body[]} bodies
       * @param {RenderingContext} context
       */
      Render.bodyAxes = function(render, bodies, context) {
          var c = context;
              render.engine;
              var options = render.options,
              part,
              i,
              j,
              k;

          c.beginPath();

          for (i = 0; i < bodies.length; i++) {
              var body = bodies[i],
                  parts = body.parts;

              if (!body.render.visible)
                  continue;

              if (options.showAxes) {
                  // render all axes
                  for (j = parts.length > 1 ? 1 : 0; j < parts.length; j++) {
                      part = parts[j];
                      for (k = 0; k < part.axes.length; k++) {
                          var axis = part.axes[k];
                          c.moveTo(part.position.x, part.position.y);
                          c.lineTo(part.position.x + axis.x * 20, part.position.y + axis.y * 20);
                      }
                  }
              } else {
                  for (j = parts.length > 1 ? 1 : 0; j < parts.length; j++) {
                      part = parts[j];
                      for (k = 0; k < part.axes.length; k++) {
                          // render a single axis indicator
                          c.moveTo(part.position.x, part.position.y);
                          c.lineTo((part.vertices[0].x + part.vertices[part.vertices.length-1].x) / 2,
                              (part.vertices[0].y + part.vertices[part.vertices.length-1].y) / 2);
                      }
                  }
              }
          }

          if (options.wireframes) {
              c.strokeStyle = 'indianred';
              c.lineWidth = 1;
          } else {
              c.strokeStyle = 'rgba(255, 255, 255, 0.4)';
              c.globalCompositeOperation = 'overlay';
              c.lineWidth = 2;
          }

          c.stroke();
          c.globalCompositeOperation = 'source-over';
      };

      /**
       * Draws body positions
       * @private
       * @method bodyPositions
       * @param {render} render
       * @param {body[]} bodies
       * @param {RenderingContext} context
       */
      Render.bodyPositions = function(render, bodies, context) {
          var c = context;
              render.engine;
              var options = render.options,
              body,
              part,
              i,
              k;

          c.beginPath();

          // render current positions
          for (i = 0; i < bodies.length; i++) {
              body = bodies[i];

              if (!body.render.visible)
                  continue;

              // handle compound parts
              for (k = 0; k < body.parts.length; k++) {
                  part = body.parts[k];
                  c.arc(part.position.x, part.position.y, 3, 0, 2 * Math.PI, false);
                  c.closePath();
              }
          }

          if (options.wireframes) {
              c.fillStyle = 'indianred';
          } else {
              c.fillStyle = 'rgba(0,0,0,0.5)';
          }
          c.fill();

          c.beginPath();

          // render previous positions
          for (i = 0; i < bodies.length; i++) {
              body = bodies[i];
              if (body.render.visible) {
                  c.arc(body.positionPrev.x, body.positionPrev.y, 2, 0, 2 * Math.PI, false);
                  c.closePath();
              }
          }

          c.fillStyle = 'rgba(255,165,0,0.8)';
          c.fill();
      };

      /**
       * Draws body velocity
       * @private
       * @method bodyVelocity
       * @param {render} render
       * @param {body[]} bodies
       * @param {RenderingContext} context
       */
      Render.bodyVelocity = function(render, bodies, context) {
          var c = context;

          c.beginPath();

          for (var i = 0; i < bodies.length; i++) {
              var body = bodies[i];

              if (!body.render.visible)
                  continue;

              c.moveTo(body.position.x, body.position.y);
              c.lineTo(body.position.x + (body.position.x - body.positionPrev.x) * 2, body.position.y + (body.position.y - body.positionPrev.y) * 2);
          }

          c.lineWidth = 3;
          c.strokeStyle = 'cornflowerblue';
          c.stroke();
      };

      /**
       * Draws body ids
       * @private
       * @method bodyIds
       * @param {render} render
       * @param {body[]} bodies
       * @param {RenderingContext} context
       */
      Render.bodyIds = function(render, bodies, context) {
          var c = context,
              i,
              j;

          for (i = 0; i < bodies.length; i++) {
              if (!bodies[i].render.visible)
                  continue;

              var parts = bodies[i].parts;
              for (j = parts.length > 1 ? 1 : 0; j < parts.length; j++) {
                  var part = parts[j];
                  c.font = "12px Arial";
                  c.fillStyle = 'rgba(255,255,255,0.5)';
                  c.fillText(part.id, part.position.x + 10, part.position.y - 10);
              }
          }
      };

      /**
       * Description
       * @private
       * @method collisions
       * @param {render} render
       * @param {pair[]} pairs
       * @param {RenderingContext} context
       */
      Render.collisions = function(render, pairs, context) {
          var c = context,
              options = render.options,
              pair,
              collision,
              i,
              j;

          c.beginPath();

          // render collision positions
          for (i = 0; i < pairs.length; i++) {
              pair = pairs[i];

              if (!pair.isActive)
                  continue;

              collision = pair.collision;
              for (j = 0; j < pair.activeContacts.length; j++) {
                  var contact = pair.activeContacts[j],
                      vertex = contact.vertex;
                  c.rect(vertex.x - 1.5, vertex.y - 1.5, 3.5, 3.5);
              }
          }

          if (options.wireframes) {
              c.fillStyle = 'rgba(255,255,255,0.7)';
          } else {
              c.fillStyle = 'orange';
          }
          c.fill();

          c.beginPath();

          // render collision normals
          for (i = 0; i < pairs.length; i++) {
              pair = pairs[i];

              if (!pair.isActive)
                  continue;

              collision = pair.collision;

              if (pair.activeContacts.length > 0) {
                  var normalPosX = pair.activeContacts[0].vertex.x,
                      normalPosY = pair.activeContacts[0].vertex.y;

                  if (pair.activeContacts.length === 2) {
                      normalPosX = (pair.activeContacts[0].vertex.x + pair.activeContacts[1].vertex.x) / 2;
                      normalPosY = (pair.activeContacts[0].vertex.y + pair.activeContacts[1].vertex.y) / 2;
                  }

                  if (collision.bodyB === collision.supports[0].body || collision.bodyA.isStatic === true) {
                      c.moveTo(normalPosX - collision.normal.x * 8, normalPosY - collision.normal.y * 8);
                  } else {
                      c.moveTo(normalPosX + collision.normal.x * 8, normalPosY + collision.normal.y * 8);
                  }

                  c.lineTo(normalPosX, normalPosY);
              }
          }

          if (options.wireframes) {
              c.strokeStyle = 'rgba(255,165,0,0.7)';
          } else {
              c.strokeStyle = 'orange';
          }

          c.lineWidth = 1;
          c.stroke();
      };

      /**
       * Description
       * @private
       * @method separations
       * @param {render} render
       * @param {pair[]} pairs
       * @param {RenderingContext} context
       */
      Render.separations = function(render, pairs, context) {
          var c = context,
              options = render.options,
              pair,
              collision,
              bodyA,
              bodyB,
              i;

          c.beginPath();

          // render separations
          for (i = 0; i < pairs.length; i++) {
              pair = pairs[i];

              if (!pair.isActive)
                  continue;

              collision = pair.collision;
              bodyA = collision.bodyA;
              bodyB = collision.bodyB;

              var k = 1;

              if (!bodyB.isStatic && !bodyA.isStatic) k = 0.5;
              if (bodyB.isStatic) k = 0;

              c.moveTo(bodyB.position.x, bodyB.position.y);
              c.lineTo(bodyB.position.x - collision.penetration.x * k, bodyB.position.y - collision.penetration.y * k);

              k = 1;

              if (!bodyB.isStatic && !bodyA.isStatic) k = 0.5;
              if (bodyA.isStatic) k = 0;

              c.moveTo(bodyA.position.x, bodyA.position.y);
              c.lineTo(bodyA.position.x + collision.penetration.x * k, bodyA.position.y + collision.penetration.y * k);
          }

          if (options.wireframes) {
              c.strokeStyle = 'rgba(255,165,0,0.5)';
          } else {
              c.strokeStyle = 'orange';
          }
          c.stroke();
      };

      /**
       * Description
       * @private
       * @method inspector
       * @param {inspector} inspector
       * @param {RenderingContext} context
       */
      Render.inspector = function(inspector, context) {
          inspector.engine;
              var selected = inspector.selected,
              render = inspector.render,
              options = render.options,
              bounds;

          if (options.hasBounds) {
              var boundsWidth = render.bounds.max.x - render.bounds.min.x,
                  boundsHeight = render.bounds.max.y - render.bounds.min.y,
                  boundsScaleX = boundsWidth / render.options.width,
                  boundsScaleY = boundsHeight / render.options.height;

              context.scale(1 / boundsScaleX, 1 / boundsScaleY);
              context.translate(-render.bounds.min.x, -render.bounds.min.y);
          }

          for (var i = 0; i < selected.length; i++) {
              var item = selected[i].data;

              context.translate(0.5, 0.5);
              context.lineWidth = 1;
              context.strokeStyle = 'rgba(255,165,0,0.9)';
              context.setLineDash([1,2]);

              switch (item.type) {

              case 'body':

                  // render body selections
                  bounds = item.bounds;
                  context.beginPath();
                  context.rect(Math.floor(bounds.min.x - 3), Math.floor(bounds.min.y - 3),
                      Math.floor(bounds.max.x - bounds.min.x + 6), Math.floor(bounds.max.y - bounds.min.y + 6));
                  context.closePath();
                  context.stroke();

                  break;

              case 'constraint':

                  // render constraint selections
                  var point = item.pointA;
                  if (item.bodyA)
                      point = item.pointB;
                  context.beginPath();
                  context.arc(point.x, point.y, 10, 0, 2 * Math.PI);
                  context.closePath();
                  context.stroke();

                  break;

              }

              context.setLineDash([]);
              context.translate(-0.5, -0.5);
          }

          // render selection region
          if (inspector.selectStart !== null) {
              context.translate(0.5, 0.5);
              context.lineWidth = 1;
              context.strokeStyle = 'rgba(255,165,0,0.6)';
              context.fillStyle = 'rgba(255,165,0,0.1)';
              bounds = inspector.selectBounds;
              context.beginPath();
              context.rect(Math.floor(bounds.min.x), Math.floor(bounds.min.y),
                  Math.floor(bounds.max.x - bounds.min.x), Math.floor(bounds.max.y - bounds.min.y));
              context.closePath();
              context.stroke();
              context.fill();
              context.translate(-0.5, -0.5);
          }

          if (options.hasBounds)
              context.setTransform(1, 0, 0, 1, 0, 0);
      };

      /**
       * Updates render timing.
       * @method _updateTiming
       * @private
       * @param {render} render
       * @param {number} time
       */
      var _updateTiming = function(render, time) {
          var engine = render.engine,
              timing = render.timing,
              historySize = timing.historySize,
              timestamp = engine.timing.timestamp;

          timing.delta = time - timing.lastTime || Render._goodDelta;
          timing.lastTime = time;

          timing.timestampElapsed = timestamp - timing.lastTimestamp || 0;
          timing.lastTimestamp = timestamp;

          timing.deltaHistory.unshift(timing.delta);
          timing.deltaHistory.length = Math.min(timing.deltaHistory.length, historySize);

          timing.engineDeltaHistory.unshift(engine.timing.lastDelta);
          timing.engineDeltaHistory.length = Math.min(timing.engineDeltaHistory.length, historySize);

          timing.timestampElapsedHistory.unshift(timing.timestampElapsed);
          timing.timestampElapsedHistory.length = Math.min(timing.timestampElapsedHistory.length, historySize);

          timing.engineElapsedHistory.unshift(engine.timing.lastElapsed);
          timing.engineElapsedHistory.length = Math.min(timing.engineElapsedHistory.length, historySize);

          timing.elapsedHistory.unshift(timing.lastElapsed);
          timing.elapsedHistory.length = Math.min(timing.elapsedHistory.length, historySize);
      };

      /**
       * Returns the mean value of the given numbers.
       * @method _mean
       * @private
       * @param {Number[]} values
       * @return {Number} the mean of given values
       */
      var _mean = function(values) {
          var result = 0;
          for (var i = 0; i < values.length; i += 1) {
              result += values[i];
          }
          return (result / values.length) || 0;
      };

      /**
       * @method _createCanvas
       * @private
       * @param {} width
       * @param {} height
       * @return canvas
       */
      var _createCanvas = function(width, height) {
          var canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          canvas.oncontextmenu = function() { return false; };
          canvas.onselectstart = function() { return false; };
          return canvas;
      };

      /**
       * Gets the pixel ratio of the canvas.
       * @method _getPixelRatio
       * @private
       * @param {HTMLElement} canvas
       * @return {Number} pixel ratio
       */
      var _getPixelRatio = function(canvas) {
          var context = canvas.getContext('2d'),
              devicePixelRatio = window.devicePixelRatio || 1,
              backingStorePixelRatio = context.webkitBackingStorePixelRatio || context.mozBackingStorePixelRatio
                                        || context.msBackingStorePixelRatio || context.oBackingStorePixelRatio
                                        || context.backingStorePixelRatio || 1;

          return devicePixelRatio / backingStorePixelRatio;
      };

      /**
       * Gets the requested texture (an Image) via its path
       * @method _getTexture
       * @private
       * @param {render} render
       * @param {string} imagePath
       * @return {Image} texture
       */
      var _getTexture = function(render, imagePath) {
          var image = render.textures[imagePath];

          if (image)
              return image;

          image = render.textures[imagePath] = new Image();
          image.src = imagePath;

          return image;
      };

      /**
       * Applies the background to the canvas using CSS.
       * @method applyBackground
       * @private
       * @param {render} render
       * @param {string} background
       */
      var _applyBackground = function(render, background) {
          var cssBackground = background;

          if (/(jpg|gif|png)$/.test(background))
              cssBackground = 'url(' + background + ')';

          render.canvas.style.background = cssBackground;
          render.canvas.style.backgroundSize = "contain";
          render.currentBackground = background;
      };

      /*
      *
      *  Events Documentation
      *
      */

      /**
      * Fired before rendering
      *
      * @event beforeRender
      * @param {} event An event object
      * @param {number} event.timestamp The engine.timing.timestamp of the event
      * @param {} event.source The source object of the event
      * @param {} event.name The name of the event
      */

      /**
      * Fired after rendering
      *
      * @event afterRender
      * @param {} event An event object
      * @param {number} event.timestamp The engine.timing.timestamp of the event
      * @param {} event.source The source object of the event
      * @param {} event.name The name of the event
      */

      /*
      *
      *  Properties Documentation
      *
      */

      /**
       * A back-reference to the `Matter.Render` module.
       *
       * @property controller
       * @type render
       */

      /**
       * A reference to the `Matter.Engine` instance to be used.
       *
       * @property engine
       * @type engine
       */

      /**
       * A reference to the element where the canvas is to be inserted (if `render.canvas` has not been specified)
       *
       * @property element
       * @type HTMLElement
       * @default null
       */

      /**
       * The canvas element to render to. If not specified, one will be created if `render.element` has been specified.
       *
       * @property canvas
       * @type HTMLCanvasElement
       * @default null
       */

      /**
       * A `Bounds` object that specifies the drawing view region.
       * Rendering will be automatically transformed and scaled to fit within the canvas size (`render.options.width` and `render.options.height`).
       * This allows for creating views that can pan or zoom around the scene.
       * You must also set `render.options.hasBounds` to `true` to enable bounded rendering.
       *
       * @property bounds
       * @type bounds
       */

      /**
       * The 2d rendering context from the `render.canvas` element.
       *
       * @property context
       * @type CanvasRenderingContext2D
       */

      /**
       * The sprite texture cache.
       *
       * @property textures
       * @type {}
       */

      /**
       * The mouse to render if `render.options.showMousePosition` is enabled.
       *
       * @property mouse
       * @type mouse
       * @default null
       */

      /**
       * The configuration options of the renderer.
       *
       * @property options
       * @type {}
       */

      /**
       * The target width in pixels of the `render.canvas` to be created.
       * See also the `options.pixelRatio` property to change render quality.
       *
       * @property options.width
       * @type number
       * @default 800
       */

      /**
       * The target height in pixels of the `render.canvas` to be created.
       * See also the `options.pixelRatio` property to change render quality.
       *
       * @property options.height
       * @type number
       * @default 600
       */

      /**
       * The [pixel ratio](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio) to use when rendering.
       *
       * @property options.pixelRatio
       * @type number
       * @default 1
       */

      /**
       * A CSS background color string to use when `render.options.wireframes` is disabled.
       * This may be also set to `'transparent'` or equivalent.
       *
       * @property options.background
       * @type string
       * @default '#14151f'
       */

      /**
       * A CSS background color string to use when `render.options.wireframes` is enabled.
       * This may be also set to `'transparent'` or equivalent.
       *
       * @property options.wireframeBackground
       * @type string
       * @default '#14151f'
       */

      /**
       * A flag that specifies if `render.bounds` should be used when rendering.
       *
       * @property options.hasBounds
       * @type boolean
       * @default false
       */

      /**
       * A flag to enable or disable all debug information overlays together.  
       * This includes and has priority over the values of:
       *
       * - `render.options.showStats`
       * - `render.options.showPerformance`
       *
       * @property options.showDebug
       * @type boolean
       * @default false
       */

      /**
       * A flag to enable or disable the engine stats info overlay.  
       * From left to right, the values shown are:
       *
       * - body parts total
       * - body total
       * - constraints total
       * - composites total
       * - collision pairs total
       *
       * @property options.showStats
       * @type boolean
       * @default false
       */

      /**
       * A flag to enable or disable performance charts.  
       * From left to right, the values shown are:
       *
       * - average render frequency (e.g. 60 fps)
       * - exact engine delta time used for last update (e.g. 16.66ms)
       * - average engine execution duration (e.g. 5.00ms)
       * - average render execution duration (e.g. 0.40ms)
       * - average effective play speed (e.g. '1.00x' is 'real-time')
       *
       * Each value is recorded over a fixed sample of past frames (60 frames).
       *
       * A chart shown below each value indicates the variance from the average over the sample.
       * The more stable or fixed the value is the flatter the chart will appear.
       *
       * @property options.showPerformance
       * @type boolean
       * @default false
       */
      
      /**
       * A flag to enable or disable rendering entirely.
       *
       * @property options.enabled
       * @type boolean
       * @default false
       */

      /**
       * A flag to toggle wireframe rendering otherwise solid fill rendering is used.
       *
       * @property options.wireframes
       * @type boolean
       * @default true
       */

      /**
       * A flag to enable or disable sleeping bodies indicators.
       *
       * @property options.showSleeping
       * @type boolean
       * @default true
       */

      /**
       * A flag to enable or disable the debug information overlay.
       *
       * @property options.showDebug
       * @type boolean
       * @default false
       */

      /**
       * A flag to enable or disable the collision broadphase debug overlay.
       *
       * @deprecated no longer implemented
       * @property options.showBroadphase
       * @type boolean
       * @default false
       */

      /**
       * A flag to enable or disable the body bounds debug overlay.
       *
       * @property options.showBounds
       * @type boolean
       * @default false
       */

      /**
       * A flag to enable or disable the body velocity debug overlay.
       *
       * @property options.showVelocity
       * @type boolean
       * @default false
       */

      /**
       * A flag to enable or disable the body collisions debug overlay.
       *
       * @property options.showCollisions
       * @type boolean
       * @default false
       */

      /**
       * A flag to enable or disable the collision resolver separations debug overlay.
       *
       * @property options.showSeparations
       * @type boolean
       * @default false
       */

      /**
       * A flag to enable or disable the body axes debug overlay.
       *
       * @property options.showAxes
       * @type boolean
       * @default false
       */

      /**
       * A flag to enable or disable the body positions debug overlay.
       *
       * @property options.showPositions
       * @type boolean
       * @default false
       */

      /**
       * A flag to enable or disable the body angle debug overlay.
       *
       * @property options.showAngleIndicator
       * @type boolean
       * @default false
       */

      /**
       * A flag to enable or disable the body and part ids debug overlay.
       *
       * @property options.showIds
       * @type boolean
       * @default false
       */

      /**
       * A flag to enable or disable the body vertex numbers debug overlay.
       *
       * @property options.showVertexNumbers
       * @type boolean
       * @default false
       */

      /**
       * A flag to enable or disable the body convex hulls debug overlay.
       *
       * @property options.showConvexHulls
       * @type boolean
       * @default false
       */

      /**
       * A flag to enable or disable the body internal edges debug overlay.
       *
       * @property options.showInternalEdges
       * @type boolean
       * @default false
       */

      /**
       * A flag to enable or disable the mouse position debug overlay.
       *
       * @property options.showMousePosition
       * @type boolean
       * @default false
       */

  })();


  /***/ }),
  /* 17 */
  /***/ (function(module, exports) {

  /**
  * The `Matter.Contact` module contains methods for creating and manipulating collision contacts.
  *
  * @class Contact
  */

  var Contact = {};

  module.exports = Contact;

  (function() {

      /**
       * Creates a new contact.
       * @method create
       * @param {vertex} vertex
       * @return {contact} A new contact
       */
      Contact.create = function(vertex) {
          return {
              vertex: vertex,
              normalImpulse: 0,
              tangentImpulse: 0
          };
      };

  })();


  /***/ }),
  /* 18 */
  /***/ (function(module, exports, __webpack_require__) {

  /**
  * The `Matter.Engine` module contains methods for creating and manipulating engines.
  * An engine is a controller that manages updating the simulation of the world.
  * See `Matter.Runner` for an optional game loop utility.
  *
  * See the included usage [examples](https://github.com/liabru/matter-js/tree/master/examples).
  *
  * @class Engine
  */

  var Engine = {};

  module.exports = Engine;

  var Sleeping = __webpack_require__(7);
  var Resolver = __webpack_require__(19);
  var Detector = __webpack_require__(14);
  var Pairs = __webpack_require__(20);
  var Events = __webpack_require__(4);
  var Composite = __webpack_require__(5);
  var Constraint = __webpack_require__(10);
  var Common = __webpack_require__(0);
  var Body = __webpack_require__(6);

  (function() {

      /**
       * Creates a new engine. The options parameter is an object that specifies any properties you wish to override the defaults.
       * All properties have default values, and many are pre-calculated automatically based on other properties.
       * See the properties section below for detailed information on what you can pass via the `options` object.
       * @method create
       * @param {object} [options]
       * @return {engine} engine
       */
      Engine.create = function(options) {
          options = options || {};

          var defaults = {
              positionIterations: 6,
              velocityIterations: 4,
              constraintIterations: 2,
              enableSleeping: false,
              events: [],
              plugin: {},
              gravity: {
                  x: 0,
                  y: 1,
                  scale: 0.001
              },
              timing: {
                  timestamp: 0,
                  timeScale: 1,
                  lastDelta: 0,
                  lastElapsed: 0
              }
          };

          var engine = Common.extend(defaults, options);

          engine.world = options.world || Composite.create({ label: 'World' });
          engine.pairs = options.pairs || Pairs.create();
          engine.detector = options.detector || Detector.create();

          // for temporary back compatibility only
          engine.grid = { buckets: [] };
          engine.world.gravity = engine.gravity;
          engine.broadphase = engine.grid;
          engine.metrics = {};
          
          return engine;
      };

      /**
       * Moves the simulation forward in time by `delta` ms.
       * The `correction` argument is an optional `Number` that specifies the time correction factor to apply to the update.
       * This can help improve the accuracy of the simulation in cases where `delta` is changing between updates.
       * The value of `correction` is defined as `delta / lastDelta`, i.e. the percentage change of `delta` over the last step.
       * Therefore the value is always `1` (no correction) when `delta` constant (or when no correction is desired, which is the default).
       * See the paper on <a href="http://lonesock.net/article/verlet.html">Time Corrected Verlet</a> for more information.
       *
       * Triggers `beforeUpdate` and `afterUpdate` events.
       * Triggers `collisionStart`, `collisionActive` and `collisionEnd` events.
       * @method update
       * @param {engine} engine
       * @param {number} [delta=16.666]
       * @param {number} [correction=1]
       */
      Engine.update = function(engine, delta, correction) {
          var startTime = Common.now();

          delta = delta || 1000 / 60;
          correction = correction || 1;

          var world = engine.world,
              detector = engine.detector,
              pairs = engine.pairs,
              timing = engine.timing,
              timestamp = timing.timestamp,
              i;

          // increment timestamp
          timing.timestamp += delta * timing.timeScale;
          timing.lastDelta = delta * timing.timeScale;

          // create an event object
          var event = {
              timestamp: timing.timestamp
          };

          Events.trigger(engine, 'beforeUpdate', event);

          // get all bodies and all constraints in the world
          var allBodies = Composite.allBodies(world),
              allConstraints = Composite.allConstraints(world);

          // update the detector bodies if they have changed
          if (world.isModified) {
              Detector.setBodies(detector, allBodies);
          }

          // reset all composite modified flags
          if (world.isModified) {
              Composite.setModified(world, false, false, true);
          }

          // update sleeping if enabled
          if (engine.enableSleeping)
              Sleeping.update(allBodies, timing.timeScale);

          // apply gravity to all bodies
          Engine._bodiesApplyGravity(allBodies, engine.gravity);

          // update all body position and rotation by integration
          Engine._bodiesUpdate(allBodies, delta, timing.timeScale, correction, world.bounds);

          // update all constraints (first pass)
          Constraint.preSolveAll(allBodies);
          for (i = 0; i < engine.constraintIterations; i++) {
              Constraint.solveAll(allConstraints, timing.timeScale);
          }
          Constraint.postSolveAll(allBodies);

          // find all collisions
          detector.pairs = engine.pairs;
          var collisions = Detector.collisions(detector);

          // update collision pairs
          Pairs.update(pairs, collisions, timestamp);

          // wake up bodies involved in collisions
          if (engine.enableSleeping)
              Sleeping.afterCollisions(pairs.list, timing.timeScale);

          // trigger collision events
          if (pairs.collisionStart.length > 0)
              Events.trigger(engine, 'collisionStart', { pairs: pairs.collisionStart });

          // iteratively resolve position between collisions
          Resolver.preSolvePosition(pairs.list);
          for (i = 0; i < engine.positionIterations; i++) {
              Resolver.solvePosition(pairs.list, timing.timeScale);
          }
          Resolver.postSolvePosition(allBodies);

          // update all constraints (second pass)
          Constraint.preSolveAll(allBodies);
          for (i = 0; i < engine.constraintIterations; i++) {
              Constraint.solveAll(allConstraints, timing.timeScale);
          }
          Constraint.postSolveAll(allBodies);

          // iteratively resolve velocity between collisions
          Resolver.preSolveVelocity(pairs.list);
          for (i = 0; i < engine.velocityIterations; i++) {
              Resolver.solveVelocity(pairs.list, timing.timeScale);
          }

          // trigger collision events
          if (pairs.collisionActive.length > 0)
              Events.trigger(engine, 'collisionActive', { pairs: pairs.collisionActive });

          if (pairs.collisionEnd.length > 0)
              Events.trigger(engine, 'collisionEnd', { pairs: pairs.collisionEnd });

          // clear force buffers
          Engine._bodiesClearForces(allBodies);

          Events.trigger(engine, 'afterUpdate', event);

          // log the time elapsed computing this update
          engine.timing.lastElapsed = Common.now() - startTime;

          return engine;
      };
      
      /**
       * Merges two engines by keeping the configuration of `engineA` but replacing the world with the one from `engineB`.
       * @method merge
       * @param {engine} engineA
       * @param {engine} engineB
       */
      Engine.merge = function(engineA, engineB) {
          Common.extend(engineA, engineB);
          
          if (engineB.world) {
              engineA.world = engineB.world;

              Engine.clear(engineA);

              var bodies = Composite.allBodies(engineA.world);

              for (var i = 0; i < bodies.length; i++) {
                  var body = bodies[i];
                  Sleeping.set(body, false);
                  body.id = Common.nextId();
              }
          }
      };

      /**
       * Clears the engine pairs and detector.
       * @method clear
       * @param {engine} engine
       */
      Engine.clear = function(engine) {
          Pairs.clear(engine.pairs);
          Detector.clear(engine.detector);
      };

      /**
       * Zeroes the `body.force` and `body.torque` force buffers.
       * @method _bodiesClearForces
       * @private
       * @param {body[]} bodies
       */
      Engine._bodiesClearForces = function(bodies) {
          for (var i = 0; i < bodies.length; i++) {
              var body = bodies[i];

              // reset force buffers
              body.force.x = 0;
              body.force.y = 0;
              body.torque = 0;
          }
      };

      /**
       * Applys a mass dependant force to all given bodies.
       * @method _bodiesApplyGravity
       * @private
       * @param {body[]} bodies
       * @param {vector} gravity
       */
      Engine._bodiesApplyGravity = function(bodies, gravity) {
          var gravityScale = typeof gravity.scale !== 'undefined' ? gravity.scale : 0.001;

          if ((gravity.x === 0 && gravity.y === 0) || gravityScale === 0) {
              return;
          }
          
          for (var i = 0; i < bodies.length; i++) {
              var body = bodies[i];

              if (body.isStatic || body.isSleeping)
                  continue;

              // apply gravity
              body.force.y += body.mass * gravity.y * gravityScale;
              body.force.x += body.mass * gravity.x * gravityScale;
          }
      };

      /**
       * Applys `Body.update` to all given `bodies`.
       * @method _bodiesUpdate
       * @private
       * @param {body[]} bodies
       * @param {number} deltaTime 
       * The amount of time elapsed between updates
       * @param {number} timeScale
       * @param {number} correction 
       * The Verlet correction factor (deltaTime / lastDeltaTime)
       * @param {bounds} worldBounds
       */
      Engine._bodiesUpdate = function(bodies, deltaTime, timeScale, correction, worldBounds) {
          for (var i = 0; i < bodies.length; i++) {
              var body = bodies[i];

              if (body.isStatic || body.isSleeping)
                  continue;

              Body.update(body, deltaTime, timeScale, correction);
          }
      };

      /**
       * A deprecated alias for `Runner.run`, use `Matter.Runner.run(engine)` instead and see `Matter.Runner` for more information.
       * @deprecated use Matter.Runner.run(engine) instead
       * @method run
       * @param {engine} engine
       */

      /**
      * Fired just before an update
      *
      * @event beforeUpdate
      * @param {object} event An event object
      * @param {number} event.timestamp The engine.timing.timestamp of the event
      * @param {engine} event.source The source object of the event
      * @param {string} event.name The name of the event
      */

      /**
      * Fired after engine update and all collision events
      *
      * @event afterUpdate
      * @param {object} event An event object
      * @param {number} event.timestamp The engine.timing.timestamp of the event
      * @param {engine} event.source The source object of the event
      * @param {string} event.name The name of the event
      */

      /**
      * Fired after engine update, provides a list of all pairs that have started to collide in the current tick (if any)
      *
      * @event collisionStart
      * @param {object} event An event object
      * @param {pair[]} event.pairs List of affected pairs
      * @param {number} event.timestamp The engine.timing.timestamp of the event
      * @param {engine} event.source The source object of the event
      * @param {string} event.name The name of the event
      */

      /**
      * Fired after engine update, provides a list of all pairs that are colliding in the current tick (if any)
      *
      * @event collisionActive
      * @param {object} event An event object
      * @param {pair[]} event.pairs List of affected pairs
      * @param {number} event.timestamp The engine.timing.timestamp of the event
      * @param {engine} event.source The source object of the event
      * @param {string} event.name The name of the event
      */

      /**
      * Fired after engine update, provides a list of all pairs that have ended collision in the current tick (if any)
      *
      * @event collisionEnd
      * @param {object} event An event object
      * @param {pair[]} event.pairs List of affected pairs
      * @param {number} event.timestamp The engine.timing.timestamp of the event
      * @param {engine} event.source The source object of the event
      * @param {string} event.name The name of the event
      */

      /*
      *
      *  Properties Documentation
      *
      */

      /**
       * An integer `Number` that specifies the number of position iterations to perform each update.
       * The higher the value, the higher quality the simulation will be at the expense of performance.
       *
       * @property positionIterations
       * @type number
       * @default 6
       */

      /**
       * An integer `Number` that specifies the number of velocity iterations to perform each update.
       * The higher the value, the higher quality the simulation will be at the expense of performance.
       *
       * @property velocityIterations
       * @type number
       * @default 4
       */

      /**
       * An integer `Number` that specifies the number of constraint iterations to perform each update.
       * The higher the value, the higher quality the simulation will be at the expense of performance.
       * The default value of `2` is usually very adequate.
       *
       * @property constraintIterations
       * @type number
       * @default 2
       */

      /**
       * A flag that specifies whether the engine should allow sleeping via the `Matter.Sleeping` module.
       * Sleeping can improve stability and performance, but often at the expense of accuracy.
       *
       * @property enableSleeping
       * @type boolean
       * @default false
       */

      /**
       * An `Object` containing properties regarding the timing systems of the engine. 
       *
       * @property timing
       * @type object
       */

      /**
       * A `Number` that specifies the global scaling factor of time for all bodies.
       * A value of `0` freezes the simulation.
       * A value of `0.1` gives a slow-motion effect.
       * A value of `1.2` gives a speed-up effect.
       *
       * @property timing.timeScale
       * @type number
       * @default 1
       */

      /**
       * A `Number` that specifies the current simulation-time in milliseconds starting from `0`. 
       * It is incremented on every `Engine.update` by the given `delta` argument. 
       *
       * @property timing.timestamp
       * @type number
       * @default 0
       */

      /**
       * A `Number` that represents the total execution time elapsed during the last `Engine.update` in milliseconds.
       * It is updated by timing from the start of the last `Engine.update` call until it ends.
       *
       * This value will also include the total execution time of all event handlers directly or indirectly triggered by the engine update.
       *
       * @property timing.lastElapsed
       * @type number
       * @default 0
       */

      /**
       * A `Number` that represents the `delta` value used in the last engine update.
       *
       * @property timing.lastDelta
       * @type number
       * @default 0
       */

      /**
       * A `Matter.Detector` instance.
       *
       * @property detector
       * @type detector
       * @default a Matter.Detector instance
       */

      /**
       * A `Matter.Grid` instance.
       *
       * @deprecated replaced by `engine.detector`
       * @property grid
       * @type grid
       * @default a Matter.Grid instance
       */

      /**
       * Replaced by and now alias for `engine.grid`.
       *
       * @deprecated replaced by `engine.detector`
       * @property broadphase
       * @type grid
       * @default a Matter.Grid instance
       */

      /**
       * The root `Matter.Composite` instance that will contain all bodies, constraints and other composites to be simulated by this engine.
       *
       * @property world
       * @type composite
       * @default a Matter.Composite instance
       */

      /**
       * An object reserved for storing plugin-specific properties.
       *
       * @property plugin
       * @type {}
       */

      /**
       * The gravity to apply on all bodies in `engine.world`.
       *
       * @property gravity
       * @type object
       */

      /**
       * The gravity x component.
       *
       * @property gravity.x
       * @type object
       * @default 0
       */

      /**
       * The gravity y component.
       *
       * @property gravity.y
       * @type object
       * @default 1
       */

      /**
       * The gravity scale factor.
       *
       * @property gravity.scale
       * @type object
       * @default 0.001
       */

  })();


  /***/ }),
  /* 19 */
  /***/ (function(module, exports, __webpack_require__) {

  /**
  * The `Matter.Resolver` module contains methods for resolving collision pairs.
  *
  * @class Resolver
  */

  var Resolver = {};

  module.exports = Resolver;

  var Vertices = __webpack_require__(3);
  var Bounds = __webpack_require__(1);

  (function() {

      Resolver._restingThresh = 4;
      Resolver._restingThreshTangent = 6;
      Resolver._positionDampen = 0.9;
      Resolver._positionWarming = 0.8;
      Resolver._frictionNormalMultiplier = 5;

      /**
       * Prepare pairs for position solving.
       * @method preSolvePosition
       * @param {pair[]} pairs
       */
      Resolver.preSolvePosition = function(pairs) {
          var i,
              pair,
              activeCount,
              pairsLength = pairs.length;

          // find total contacts on each body
          for (i = 0; i < pairsLength; i++) {
              pair = pairs[i];
              
              if (!pair.isActive)
                  continue;
              
              activeCount = pair.activeContacts.length;
              pair.collision.parentA.totalContacts += activeCount;
              pair.collision.parentB.totalContacts += activeCount;
          }
      };

      /**
       * Find a solution for pair positions.
       * @method solvePosition
       * @param {pair[]} pairs
       * @param {number} timeScale
       */
      Resolver.solvePosition = function(pairs, timeScale) {
          var i,
              pair,
              collision,
              bodyA,
              bodyB,
              normal,
              contactShare,
              positionImpulse,
              positionDampen = Resolver._positionDampen,
              pairsLength = pairs.length;

          // find impulses required to resolve penetration
          for (i = 0; i < pairsLength; i++) {
              pair = pairs[i];
              
              if (!pair.isActive || pair.isSensor)
                  continue;

              collision = pair.collision;
              bodyA = collision.parentA;
              bodyB = collision.parentB;
              normal = collision.normal;

              // get current separation between body edges involved in collision
              pair.separation = 
                  normal.x * (bodyB.positionImpulse.x + collision.penetration.x - bodyA.positionImpulse.x)
                  + normal.y * (bodyB.positionImpulse.y + collision.penetration.y - bodyA.positionImpulse.y);
          }
          
          for (i = 0; i < pairsLength; i++) {
              pair = pairs[i];

              if (!pair.isActive || pair.isSensor)
                  continue;
              
              collision = pair.collision;
              bodyA = collision.parentA;
              bodyB = collision.parentB;
              normal = collision.normal;
              positionImpulse = (pair.separation - pair.slop) * timeScale;

              if (bodyA.isStatic || bodyB.isStatic)
                  positionImpulse *= 2;
              
              if (!(bodyA.isStatic || bodyA.isSleeping)) {
                  contactShare = positionDampen / bodyA.totalContacts;
                  bodyA.positionImpulse.x += normal.x * positionImpulse * contactShare;
                  bodyA.positionImpulse.y += normal.y * positionImpulse * contactShare;
              }

              if (!(bodyB.isStatic || bodyB.isSleeping)) {
                  contactShare = positionDampen / bodyB.totalContacts;
                  bodyB.positionImpulse.x -= normal.x * positionImpulse * contactShare;
                  bodyB.positionImpulse.y -= normal.y * positionImpulse * contactShare;
              }
          }
      };

      /**
       * Apply position resolution.
       * @method postSolvePosition
       * @param {body[]} bodies
       */
      Resolver.postSolvePosition = function(bodies) {
          var positionWarming = Resolver._positionWarming,
              bodiesLength = bodies.length,
              verticesTranslate = Vertices.translate,
              boundsUpdate = Bounds.update;

          for (var i = 0; i < bodiesLength; i++) {
              var body = bodies[i],
                  positionImpulse = body.positionImpulse,
                  positionImpulseX = positionImpulse.x,
                  positionImpulseY = positionImpulse.y,
                  velocity = body.velocity;

              // reset contact count
              body.totalContacts = 0;

              if (positionImpulseX !== 0 || positionImpulseY !== 0) {
                  // update body geometry
                  for (var j = 0; j < body.parts.length; j++) {
                      var part = body.parts[j];
                      verticesTranslate(part.vertices, positionImpulse);
                      boundsUpdate(part.bounds, part.vertices, velocity);
                      part.position.x += positionImpulseX;
                      part.position.y += positionImpulseY;
                  }

                  // move the body without changing velocity
                  body.positionPrev.x += positionImpulseX;
                  body.positionPrev.y += positionImpulseY;

                  if (positionImpulseX * velocity.x + positionImpulseY * velocity.y < 0) {
                      // reset cached impulse if the body has velocity along it
                      positionImpulse.x = 0;
                      positionImpulse.y = 0;
                  } else {
                      // warm the next iteration
                      positionImpulse.x *= positionWarming;
                      positionImpulse.y *= positionWarming;
                  }
              }
          }
      };

      /**
       * Prepare pairs for velocity solving.
       * @method preSolveVelocity
       * @param {pair[]} pairs
       */
      Resolver.preSolveVelocity = function(pairs) {
          var pairsLength = pairs.length,
              i,
              j;
          
          for (i = 0; i < pairsLength; i++) {
              var pair = pairs[i];
              
              if (!pair.isActive || pair.isSensor)
                  continue;
              
              var contacts = pair.activeContacts,
                  contactsLength = contacts.length,
                  collision = pair.collision,
                  bodyA = collision.parentA,
                  bodyB = collision.parentB,
                  normal = collision.normal,
                  tangent = collision.tangent;
      
              // resolve each contact
              for (j = 0; j < contactsLength; j++) {
                  var contact = contacts[j],
                      contactVertex = contact.vertex,
                      normalImpulse = contact.normalImpulse,
                      tangentImpulse = contact.tangentImpulse;
      
                  if (normalImpulse !== 0 || tangentImpulse !== 0) {
                      // total impulse from contact
                      var impulseX = normal.x * normalImpulse + tangent.x * tangentImpulse,
                          impulseY = normal.y * normalImpulse + tangent.y * tangentImpulse;
                      
                      // apply impulse from contact
                      if (!(bodyA.isStatic || bodyA.isSleeping)) {
                          bodyA.positionPrev.x += impulseX * bodyA.inverseMass;
                          bodyA.positionPrev.y += impulseY * bodyA.inverseMass;
                          bodyA.anglePrev += bodyA.inverseInertia * (
                              (contactVertex.x - bodyA.position.x) * impulseY
                              - (contactVertex.y - bodyA.position.y) * impulseX
                          );
                      }
      
                      if (!(bodyB.isStatic || bodyB.isSleeping)) {
                          bodyB.positionPrev.x -= impulseX * bodyB.inverseMass;
                          bodyB.positionPrev.y -= impulseY * bodyB.inverseMass;
                          bodyB.anglePrev -= bodyB.inverseInertia * (
                              (contactVertex.x - bodyB.position.x) * impulseY 
                              - (contactVertex.y - bodyB.position.y) * impulseX
                          );
                      }
                  }
              }
          }
      };

      /**
       * Find a solution for pair velocities.
       * @method solveVelocity
       * @param {pair[]} pairs
       * @param {number} timeScale
       */
      Resolver.solveVelocity = function(pairs, timeScale) {
          var timeScaleSquared = timeScale * timeScale,
              restingThresh = Resolver._restingThresh * timeScaleSquared,
              frictionNormalMultiplier = Resolver._frictionNormalMultiplier,
              restingThreshTangent = Resolver._restingThreshTangent * timeScaleSquared,
              NumberMaxValue = Number.MAX_VALUE,
              pairsLength = pairs.length,
              tangentImpulse,
              maxFriction,
              i,
              j;

          for (i = 0; i < pairsLength; i++) {
              var pair = pairs[i];
              
              if (!pair.isActive || pair.isSensor)
                  continue;
              
              var collision = pair.collision,
                  bodyA = collision.parentA,
                  bodyB = collision.parentB,
                  bodyAVelocity = bodyA.velocity,
                  bodyBVelocity = bodyB.velocity,
                  normalX = collision.normal.x,
                  normalY = collision.normal.y,
                  tangentX = collision.tangent.x,
                  tangentY = collision.tangent.y,
                  contacts = pair.activeContacts,
                  contactsLength = contacts.length,
                  contactShare = 1 / contactsLength,
                  inverseMassTotal = bodyA.inverseMass + bodyB.inverseMass,
                  friction = pair.friction * pair.frictionStatic * frictionNormalMultiplier * timeScaleSquared;

              // update body velocities
              bodyAVelocity.x = bodyA.position.x - bodyA.positionPrev.x;
              bodyAVelocity.y = bodyA.position.y - bodyA.positionPrev.y;
              bodyBVelocity.x = bodyB.position.x - bodyB.positionPrev.x;
              bodyBVelocity.y = bodyB.position.y - bodyB.positionPrev.y;
              bodyA.angularVelocity = bodyA.angle - bodyA.anglePrev;
              bodyB.angularVelocity = bodyB.angle - bodyB.anglePrev;

              // resolve each contact
              for (j = 0; j < contactsLength; j++) {
                  var contact = contacts[j],
                      contactVertex = contact.vertex;

                  var offsetAX = contactVertex.x - bodyA.position.x,
                      offsetAY = contactVertex.y - bodyA.position.y,
                      offsetBX = contactVertex.x - bodyB.position.x,
                      offsetBY = contactVertex.y - bodyB.position.y;
   
                  var velocityPointAX = bodyAVelocity.x - offsetAY * bodyA.angularVelocity,
                      velocityPointAY = bodyAVelocity.y + offsetAX * bodyA.angularVelocity,
                      velocityPointBX = bodyBVelocity.x - offsetBY * bodyB.angularVelocity,
                      velocityPointBY = bodyBVelocity.y + offsetBX * bodyB.angularVelocity;

                  var relativeVelocityX = velocityPointAX - velocityPointBX,
                      relativeVelocityY = velocityPointAY - velocityPointBY;

                  var normalVelocity = normalX * relativeVelocityX + normalY * relativeVelocityY,
                      tangentVelocity = tangentX * relativeVelocityX + tangentY * relativeVelocityY;

                  // coulomb friction
                  var normalOverlap = pair.separation + normalVelocity;
                  var normalForce = Math.min(normalOverlap, 1);
                  normalForce = normalOverlap < 0 ? 0 : normalForce;
                  
                  var frictionLimit = normalForce * friction;

                  if (tangentVelocity > frictionLimit || -tangentVelocity > frictionLimit) {
                      maxFriction = tangentVelocity > 0 ? tangentVelocity : -tangentVelocity;
                      tangentImpulse = pair.friction * (tangentVelocity > 0 ? 1 : -1) * timeScaleSquared;
                      
                      if (tangentImpulse < -maxFriction) {
                          tangentImpulse = -maxFriction;
                      } else if (tangentImpulse > maxFriction) {
                          tangentImpulse = maxFriction;
                      }
                  } else {
                      tangentImpulse = tangentVelocity;
                      maxFriction = NumberMaxValue;
                  }

                  // account for mass, inertia and contact offset
                  var oAcN = offsetAX * normalY - offsetAY * normalX,
                      oBcN = offsetBX * normalY - offsetBY * normalX,
                      share = contactShare / (inverseMassTotal + bodyA.inverseInertia * oAcN * oAcN + bodyB.inverseInertia * oBcN * oBcN);

                  // raw impulses
                  var normalImpulse = (1 + pair.restitution) * normalVelocity * share;
                  tangentImpulse *= share;

                  // handle high velocity and resting collisions separately
                  if (normalVelocity * normalVelocity > restingThresh && normalVelocity < 0) {
                      // high normal velocity so clear cached contact normal impulse
                      contact.normalImpulse = 0;
                  } else {
                      // solve resting collision constraints using Erin Catto's method (GDC08)
                      // impulse constraint tends to 0
                      var contactNormalImpulse = contact.normalImpulse;
                      contact.normalImpulse += normalImpulse;
                      contact.normalImpulse = Math.min(contact.normalImpulse, 0);
                      normalImpulse = contact.normalImpulse - contactNormalImpulse;
                  }

                  // handle high velocity and resting collisions separately
                  if (tangentVelocity * tangentVelocity > restingThreshTangent) {
                      // high tangent velocity so clear cached contact tangent impulse
                      contact.tangentImpulse = 0;
                  } else {
                      // solve resting collision constraints using Erin Catto's method (GDC08)
                      // tangent impulse tends to -tangentSpeed or +tangentSpeed
                      var contactTangentImpulse = contact.tangentImpulse;
                      contact.tangentImpulse += tangentImpulse;
                      if (contact.tangentImpulse < -maxFriction) contact.tangentImpulse = -maxFriction;
                      if (contact.tangentImpulse > maxFriction) contact.tangentImpulse = maxFriction;
                      tangentImpulse = contact.tangentImpulse - contactTangentImpulse;
                  }

                  // total impulse from contact
                  var impulseX = normalX * normalImpulse + tangentX * tangentImpulse,
                      impulseY = normalY * normalImpulse + tangentY * tangentImpulse;
                  
                  // apply impulse from contact
                  if (!(bodyA.isStatic || bodyA.isSleeping)) {
                      bodyA.positionPrev.x += impulseX * bodyA.inverseMass;
                      bodyA.positionPrev.y += impulseY * bodyA.inverseMass;
                      bodyA.anglePrev += (offsetAX * impulseY - offsetAY * impulseX) * bodyA.inverseInertia;
                  }

                  if (!(bodyB.isStatic || bodyB.isSleeping)) {
                      bodyB.positionPrev.x -= impulseX * bodyB.inverseMass;
                      bodyB.positionPrev.y -= impulseY * bodyB.inverseMass;
                      bodyB.anglePrev -= (offsetBX * impulseY - offsetBY * impulseX) * bodyB.inverseInertia;
                  }
              }
          }
      };

  })();


  /***/ }),
  /* 20 */
  /***/ (function(module, exports, __webpack_require__) {

  /**
  * The `Matter.Pairs` module contains methods for creating and manipulating collision pair sets.
  *
  * @class Pairs
  */

  var Pairs = {};

  module.exports = Pairs;

  var Pair = __webpack_require__(9);
  var Common = __webpack_require__(0);

  (function() {

      /**
       * Creates a new pairs structure.
       * @method create
       * @param {object} options
       * @return {pairs} A new pairs structure
       */
      Pairs.create = function(options) {
          return Common.extend({ 
              table: {},
              list: [],
              collisionStart: [],
              collisionActive: [],
              collisionEnd: []
          }, options);
      };

      /**
       * Updates pairs given a list of collisions.
       * @method update
       * @param {object} pairs
       * @param {collision[]} collisions
       * @param {number} timestamp
       */
      Pairs.update = function(pairs, collisions, timestamp) {
          var pairsList = pairs.list,
              pairsListLength = pairsList.length,
              pairsTable = pairs.table,
              collisionsLength = collisions.length,
              collisionStart = pairs.collisionStart,
              collisionEnd = pairs.collisionEnd,
              collisionActive = pairs.collisionActive,
              collision,
              pairIndex,
              pair,
              i;

          // clear collision state arrays, but maintain old reference
          collisionStart.length = 0;
          collisionEnd.length = 0;
          collisionActive.length = 0;

          for (i = 0; i < pairsListLength; i++) {
              pairsList[i].confirmedActive = false;
          }

          for (i = 0; i < collisionsLength; i++) {
              collision = collisions[i];
              pair = collision.pair;

              if (pair) {
                  // pair already exists (but may or may not be active)
                  if (pair.isActive) {
                      // pair exists and is active
                      collisionActive.push(pair);
                  } else {
                      // pair exists but was inactive, so a collision has just started again
                      collisionStart.push(pair);
                  }

                  // update the pair
                  Pair.update(pair, collision, timestamp);
                  pair.confirmedActive = true;
              } else {
                  // pair did not exist, create a new pair
                  pair = Pair.create(collision, timestamp);
                  pairsTable[pair.id] = pair;

                  // push the new pair
                  collisionStart.push(pair);
                  pairsList.push(pair);
              }
          }

          // find pairs that are no longer active
          var removePairIndex = [];
          pairsListLength = pairsList.length;

          for (i = 0; i < pairsListLength; i++) {
              pair = pairsList[i];
              
              if (!pair.confirmedActive) {
                  Pair.setActive(pair, false, timestamp);
                  collisionEnd.push(pair);

                  if (!pair.collision.bodyA.isSleeping && !pair.collision.bodyB.isSleeping) {
                      removePairIndex.push(i);
                  }
              }
          }

          // remove inactive pairs
          for (i = 0; i < removePairIndex.length; i++) {
              pairIndex = removePairIndex[i] - i;
              pair = pairsList[pairIndex];
              pairsList.splice(pairIndex, 1);
              delete pairsTable[pair.id];
          }
      };

      /**
       * Clears the given pairs structure.
       * @method clear
       * @param {pairs} pairs
       * @return {pairs} pairs
       */
      Pairs.clear = function(pairs) {
          pairs.table = {};
          pairs.list.length = 0;
          pairs.collisionStart.length = 0;
          pairs.collisionActive.length = 0;
          pairs.collisionEnd.length = 0;
          return pairs;
      };

  })();


  /***/ }),
  /* 21 */
  /***/ (function(module, exports, __webpack_require__) {

  var Matter = module.exports = __webpack_require__(22);

  Matter.Axes = __webpack_require__(11);
  Matter.Bodies = __webpack_require__(12);
  Matter.Body = __webpack_require__(6);
  Matter.Bounds = __webpack_require__(1);
  Matter.Collision = __webpack_require__(8);
  Matter.Common = __webpack_require__(0);
  Matter.Composite = __webpack_require__(5);
  Matter.Composites = __webpack_require__(23);
  Matter.Constraint = __webpack_require__(10);
  Matter.Contact = __webpack_require__(17);
  Matter.Detector = __webpack_require__(14);
  Matter.Engine = __webpack_require__(18);
  Matter.Events = __webpack_require__(4);
  Matter.Grid = __webpack_require__(24);
  Matter.Mouse = __webpack_require__(13);
  Matter.MouseConstraint = __webpack_require__(25);
  Matter.Pair = __webpack_require__(9);
  Matter.Pairs = __webpack_require__(20);
  Matter.Plugin = __webpack_require__(15);
  Matter.Query = __webpack_require__(26);
  Matter.Render = __webpack_require__(16);
  Matter.Resolver = __webpack_require__(19);
  Matter.Runner = __webpack_require__(27);
  Matter.SAT = __webpack_require__(28);
  Matter.Sleeping = __webpack_require__(7);
  Matter.Svg = __webpack_require__(29);
  Matter.Vector = __webpack_require__(2);
  Matter.Vertices = __webpack_require__(3);
  Matter.World = __webpack_require__(30);

  // temporary back compatibility
  Matter.Engine.run = Matter.Runner.run;
  Matter.Common.deprecated(Matter.Engine, 'run', 'Engine.run ➤ use Matter.Runner.run(engine) instead');


  /***/ }),
  /* 22 */
  /***/ (function(module, exports, __webpack_require__) {

  /**
  * The `Matter` module is the top level namespace. It also includes a function for installing plugins on top of the library.
  *
  * @class Matter
  */

  var Matter = {};

  module.exports = Matter;

  var Plugin = __webpack_require__(15);
  var Common = __webpack_require__(0);

  (function() {

      /**
       * The library name.
       * @property name
       * @readOnly
       * @type {String}
       */
      Matter.name = 'matter-js';

      /**
       * The library version.
       * @property version
       * @readOnly
       * @type {String}
       */
      Matter.version =  "0.18.0" ;

      /**
       * A list of plugin dependencies to be installed. These are normally set and installed through `Matter.use`.
       * Alternatively you may set `Matter.uses` manually and install them by calling `Plugin.use(Matter)`.
       * @property uses
       * @type {Array}
       */
      Matter.uses = [];

      /**
       * The plugins that have been installed through `Matter.Plugin.install`. Read only.
       * @property used
       * @readOnly
       * @type {Array}
       */
      Matter.used = [];

      /**
       * Installs the given plugins on the `Matter` namespace.
       * This is a short-hand for `Plugin.use`, see it for more information.
       * Call this function once at the start of your code, with all of the plugins you wish to install as arguments.
       * Avoid calling this function multiple times unless you intend to manually control installation order.
       * @method use
       * @param ...plugin {Function} The plugin(s) to install on `base` (multi-argument).
       */
      Matter.use = function() {
          Plugin.use(Matter, Array.prototype.slice.call(arguments));
      };

      /**
       * Chains a function to excute before the original function on the given `path` relative to `Matter`.
       * See also docs for `Common.chain`.
       * @method before
       * @param {string} path The path relative to `Matter`
       * @param {function} func The function to chain before the original
       * @return {function} The chained function that replaced the original
       */
      Matter.before = function(path, func) {
          path = path.replace(/^Matter./, '');
          return Common.chainPathBefore(Matter, path, func);
      };

      /**
       * Chains a function to excute after the original function on the given `path` relative to `Matter`.
       * See also docs for `Common.chain`.
       * @method after
       * @param {string} path The path relative to `Matter`
       * @param {function} func The function to chain after the original
       * @return {function} The chained function that replaced the original
       */
      Matter.after = function(path, func) {
          path = path.replace(/^Matter./, '');
          return Common.chainPathAfter(Matter, path, func);
      };

  })();


  /***/ }),
  /* 23 */
  /***/ (function(module, exports, __webpack_require__) {

  /**
  * The `Matter.Composites` module contains factory methods for creating composite bodies
  * with commonly used configurations (such as stacks and chains).
  *
  * See the included usage [examples](https://github.com/liabru/matter-js/tree/master/examples).
  *
  * @class Composites
  */

  var Composites = {};

  module.exports = Composites;

  var Composite = __webpack_require__(5);
  var Constraint = __webpack_require__(10);
  var Common = __webpack_require__(0);
  var Body = __webpack_require__(6);
  var Bodies = __webpack_require__(12);
  var deprecated = Common.deprecated;

  (function() {

      /**
       * Create a new composite containing bodies created in the callback in a grid arrangement.
       * This function uses the body's bounds to prevent overlaps.
       * @method stack
       * @param {number} xx
       * @param {number} yy
       * @param {number} columns
       * @param {number} rows
       * @param {number} columnGap
       * @param {number} rowGap
       * @param {function} callback
       * @return {composite} A new composite containing objects created in the callback
       */
      Composites.stack = function(xx, yy, columns, rows, columnGap, rowGap, callback) {
          var stack = Composite.create({ label: 'Stack' }),
              x = xx,
              y = yy,
              lastBody,
              i = 0;

          for (var row = 0; row < rows; row++) {
              var maxHeight = 0;
              
              for (var column = 0; column < columns; column++) {
                  var body = callback(x, y, column, row, lastBody, i);
                      
                  if (body) {
                      var bodyHeight = body.bounds.max.y - body.bounds.min.y,
                          bodyWidth = body.bounds.max.x - body.bounds.min.x; 

                      if (bodyHeight > maxHeight)
                          maxHeight = bodyHeight;
                      
                      Body.translate(body, { x: bodyWidth * 0.5, y: bodyHeight * 0.5 });

                      x = body.bounds.max.x + columnGap;

                      Composite.addBody(stack, body);
                      
                      lastBody = body;
                      i += 1;
                  } else {
                      x += columnGap;
                  }
              }
              
              y += maxHeight + rowGap;
              x = xx;
          }

          return stack;
      };
      
      /**
       * Chains all bodies in the given composite together using constraints.
       * @method chain
       * @param {composite} composite
       * @param {number} xOffsetA
       * @param {number} yOffsetA
       * @param {number} xOffsetB
       * @param {number} yOffsetB
       * @param {object} options
       * @return {composite} A new composite containing objects chained together with constraints
       */
      Composites.chain = function(composite, xOffsetA, yOffsetA, xOffsetB, yOffsetB, options) {
          var bodies = composite.bodies;
          
          for (var i = 1; i < bodies.length; i++) {
              var bodyA = bodies[i - 1],
                  bodyB = bodies[i],
                  bodyAHeight = bodyA.bounds.max.y - bodyA.bounds.min.y,
                  bodyAWidth = bodyA.bounds.max.x - bodyA.bounds.min.x, 
                  bodyBHeight = bodyB.bounds.max.y - bodyB.bounds.min.y,
                  bodyBWidth = bodyB.bounds.max.x - bodyB.bounds.min.x;
          
              var defaults = {
                  bodyA: bodyA,
                  pointA: { x: bodyAWidth * xOffsetA, y: bodyAHeight * yOffsetA },
                  bodyB: bodyB,
                  pointB: { x: bodyBWidth * xOffsetB, y: bodyBHeight * yOffsetB }
              };
              
              var constraint = Common.extend(defaults, options);
          
              Composite.addConstraint(composite, Constraint.create(constraint));
          }

          composite.label += ' Chain';
          
          return composite;
      };

      /**
       * Connects bodies in the composite with constraints in a grid pattern, with optional cross braces.
       * @method mesh
       * @param {composite} composite
       * @param {number} columns
       * @param {number} rows
       * @param {boolean} crossBrace
       * @param {object} options
       * @return {composite} The composite containing objects meshed together with constraints
       */
      Composites.mesh = function(composite, columns, rows, crossBrace, options) {
          var bodies = composite.bodies,
              row,
              col,
              bodyA,
              bodyB,
              bodyC;
          
          for (row = 0; row < rows; row++) {
              for (col = 1; col < columns; col++) {
                  bodyA = bodies[(col - 1) + (row * columns)];
                  bodyB = bodies[col + (row * columns)];
                  Composite.addConstraint(composite, Constraint.create(Common.extend({ bodyA: bodyA, bodyB: bodyB }, options)));
              }

              if (row > 0) {
                  for (col = 0; col < columns; col++) {
                      bodyA = bodies[col + ((row - 1) * columns)];
                      bodyB = bodies[col + (row * columns)];
                      Composite.addConstraint(composite, Constraint.create(Common.extend({ bodyA: bodyA, bodyB: bodyB }, options)));

                      if (crossBrace && col > 0) {
                          bodyC = bodies[(col - 1) + ((row - 1) * columns)];
                          Composite.addConstraint(composite, Constraint.create(Common.extend({ bodyA: bodyC, bodyB: bodyB }, options)));
                      }

                      if (crossBrace && col < columns - 1) {
                          bodyC = bodies[(col + 1) + ((row - 1) * columns)];
                          Composite.addConstraint(composite, Constraint.create(Common.extend({ bodyA: bodyC, bodyB: bodyB }, options)));
                      }
                  }
              }
          }

          composite.label += ' Mesh';
          
          return composite;
      };
      
      /**
       * Create a new composite containing bodies created in the callback in a pyramid arrangement.
       * This function uses the body's bounds to prevent overlaps.
       * @method pyramid
       * @param {number} xx
       * @param {number} yy
       * @param {number} columns
       * @param {number} rows
       * @param {number} columnGap
       * @param {number} rowGap
       * @param {function} callback
       * @return {composite} A new composite containing objects created in the callback
       */
      Composites.pyramid = function(xx, yy, columns, rows, columnGap, rowGap, callback) {
          return Composites.stack(xx, yy, columns, rows, columnGap, rowGap, function(x, y, column, row, lastBody, i) {
              var actualRows = Math.min(rows, Math.ceil(columns / 2)),
                  lastBodyWidth = lastBody ? lastBody.bounds.max.x - lastBody.bounds.min.x : 0;
              
              if (row > actualRows)
                  return;
              
              // reverse row order
              row = actualRows - row;
              
              var start = row,
                  end = columns - 1 - row;

              if (column < start || column > end)
                  return;
              
              // retroactively fix the first body's position, since width was unknown
              if (i === 1) {
                  Body.translate(lastBody, { x: (column + (columns % 2 === 1 ? 1 : -1)) * lastBodyWidth, y: 0 });
              }

              var xOffset = lastBody ? column * lastBodyWidth : 0;
              
              return callback(xx + xOffset + column * columnGap, y, column, row, lastBody, i);
          });
      };

      /**
       * This has now moved to the [newtonsCradle example](https://github.com/liabru/matter-js/blob/master/examples/newtonsCradle.js), follow that instead as this function is deprecated here.
       * @deprecated moved to newtonsCradle example
       * @method newtonsCradle
       * @param {number} xx
       * @param {number} yy
       * @param {number} number
       * @param {number} size
       * @param {number} length
       * @return {composite} A new composite newtonsCradle body
       */
      Composites.newtonsCradle = function(xx, yy, number, size, length) {
          var newtonsCradle = Composite.create({ label: 'Newtons Cradle' });

          for (var i = 0; i < number; i++) {
              var separation = 1.9,
                  circle = Bodies.circle(xx + i * (size * separation), yy + length, size, 
                      { inertia: Infinity, restitution: 1, friction: 0, frictionAir: 0.0001, slop: 1 }),
                  constraint = Constraint.create({ pointA: { x: xx + i * (size * separation), y: yy }, bodyB: circle });

              Composite.addBody(newtonsCradle, circle);
              Composite.addConstraint(newtonsCradle, constraint);
          }

          return newtonsCradle;
      };

      deprecated(Composites, 'newtonsCradle', 'Composites.newtonsCradle ➤ moved to newtonsCradle example');
      
      /**
       * This has now moved to the [car example](https://github.com/liabru/matter-js/blob/master/examples/car.js), follow that instead as this function is deprecated here.
       * @deprecated moved to car example
       * @method car
       * @param {number} xx
       * @param {number} yy
       * @param {number} width
       * @param {number} height
       * @param {number} wheelSize
       * @return {composite} A new composite car body
       */
      Composites.car = function(xx, yy, width, height, wheelSize) {
          var group = Body.nextGroup(true),
              wheelBase = 20,
              wheelAOffset = -width * 0.5 + wheelBase,
              wheelBOffset = width * 0.5 - wheelBase,
              wheelYOffset = 0;
      
          var car = Composite.create({ label: 'Car' }),
              body = Bodies.rectangle(xx, yy, width, height, { 
                  collisionFilter: {
                      group: group
                  },
                  chamfer: {
                      radius: height * 0.5
                  },
                  density: 0.0002
              });
      
          var wheelA = Bodies.circle(xx + wheelAOffset, yy + wheelYOffset, wheelSize, { 
              collisionFilter: {
                  group: group
              },
              friction: 0.8
          });
                      
          var wheelB = Bodies.circle(xx + wheelBOffset, yy + wheelYOffset, wheelSize, { 
              collisionFilter: {
                  group: group
              },
              friction: 0.8
          });
                      
          var axelA = Constraint.create({
              bodyB: body,
              pointB: { x: wheelAOffset, y: wheelYOffset },
              bodyA: wheelA,
              stiffness: 1,
              length: 0
          });
                          
          var axelB = Constraint.create({
              bodyB: body,
              pointB: { x: wheelBOffset, y: wheelYOffset },
              bodyA: wheelB,
              stiffness: 1,
              length: 0
          });
          
          Composite.addBody(car, body);
          Composite.addBody(car, wheelA);
          Composite.addBody(car, wheelB);
          Composite.addConstraint(car, axelA);
          Composite.addConstraint(car, axelB);

          return car;
      };

      deprecated(Composites, 'car', 'Composites.car ➤ moved to car example');

      /**
       * This has now moved to the [softBody example](https://github.com/liabru/matter-js/blob/master/examples/softBody.js)
       * and the [cloth example](https://github.com/liabru/matter-js/blob/master/examples/cloth.js), follow those instead as this function is deprecated here.
       * @deprecated moved to softBody and cloth examples
       * @method softBody
       * @param {number} xx
       * @param {number} yy
       * @param {number} columns
       * @param {number} rows
       * @param {number} columnGap
       * @param {number} rowGap
       * @param {boolean} crossBrace
       * @param {number} particleRadius
       * @param {} particleOptions
       * @param {} constraintOptions
       * @return {composite} A new composite softBody
       */
      Composites.softBody = function(xx, yy, columns, rows, columnGap, rowGap, crossBrace, particleRadius, particleOptions, constraintOptions) {
          particleOptions = Common.extend({ inertia: Infinity }, particleOptions);
          constraintOptions = Common.extend({ stiffness: 0.2, render: { type: 'line', anchors: false } }, constraintOptions);

          var softBody = Composites.stack(xx, yy, columns, rows, columnGap, rowGap, function(x, y) {
              return Bodies.circle(x, y, particleRadius, particleOptions);
          });

          Composites.mesh(softBody, columns, rows, crossBrace, constraintOptions);

          softBody.label = 'Soft Body';

          return softBody;
      };

      deprecated(Composites, 'softBody', 'Composites.softBody ➤ moved to softBody and cloth examples');
  })();


  /***/ }),
  /* 24 */
  /***/ (function(module, exports, __webpack_require__) {

  /**
  * This module has now been replaced by `Matter.Detector`.
  *
  * All usage should be migrated to `Matter.Detector` or another alternative.
  * For back-compatibility purposes this module will remain for a short term and then later removed in a future release.
  *
  * The `Matter.Grid` module contains methods for creating and manipulating collision broadphase grid structures.
  *
  * @class Grid
  * @deprecated
  */

  var Grid = {};

  module.exports = Grid;

  var Pair = __webpack_require__(9);
  var Common = __webpack_require__(0);
  var deprecated = Common.deprecated;

  (function() {

      /**
       * Creates a new grid.
       * @deprecated replaced by Matter.Detector
       * @method create
       * @param {} options
       * @return {grid} A new grid
       */
      Grid.create = function(options) {
          var defaults = {
              buckets: {},
              pairs: {},
              pairsList: [],
              bucketWidth: 48,
              bucketHeight: 48
          };

          return Common.extend(defaults, options);
      };

      /**
       * The width of a single grid bucket.
       *
       * @property bucketWidth
       * @type number
       * @default 48
       */

      /**
       * The height of a single grid bucket.
       *
       * @property bucketHeight
       * @type number
       * @default 48
       */

      /**
       * Updates the grid.
       * @deprecated replaced by Matter.Detector
       * @method update
       * @param {grid} grid
       * @param {body[]} bodies
       * @param {engine} engine
       * @param {boolean} forceUpdate
       */
      Grid.update = function(grid, bodies, engine, forceUpdate) {
          var i, col, row,
              world = engine.world,
              buckets = grid.buckets,
              bucket,
              bucketId,
              gridChanged = false;

          for (i = 0; i < bodies.length; i++) {
              var body = bodies[i];

              if (body.isSleeping && !forceUpdate)
                  continue;

              // temporary back compatibility bounds check
              if (world.bounds && (body.bounds.max.x < world.bounds.min.x || body.bounds.min.x > world.bounds.max.x
                  || body.bounds.max.y < world.bounds.min.y || body.bounds.min.y > world.bounds.max.y))
                  continue;

              var newRegion = Grid._getRegion(grid, body);

              // if the body has changed grid region
              if (!body.region || newRegion.id !== body.region.id || forceUpdate) {

                  if (!body.region || forceUpdate)
                      body.region = newRegion;

                  var union = Grid._regionUnion(newRegion, body.region);

                  // update grid buckets affected by region change
                  // iterate over the union of both regions
                  for (col = union.startCol; col <= union.endCol; col++) {
                      for (row = union.startRow; row <= union.endRow; row++) {
                          bucketId = Grid._getBucketId(col, row);
                          bucket = buckets[bucketId];

                          var isInsideNewRegion = (col >= newRegion.startCol && col <= newRegion.endCol
                                                  && row >= newRegion.startRow && row <= newRegion.endRow);

                          var isInsideOldRegion = (col >= body.region.startCol && col <= body.region.endCol
                                                  && row >= body.region.startRow && row <= body.region.endRow);

                          // remove from old region buckets
                          if (!isInsideNewRegion && isInsideOldRegion) {
                              if (isInsideOldRegion) {
                                  if (bucket)
                                      Grid._bucketRemoveBody(grid, bucket, body);
                              }
                          }

                          // add to new region buckets
                          if (body.region === newRegion || (isInsideNewRegion && !isInsideOldRegion) || forceUpdate) {
                              if (!bucket)
                                  bucket = Grid._createBucket(buckets, bucketId);
                              Grid._bucketAddBody(grid, bucket, body);
                          }
                      }
                  }

                  // set the new region
                  body.region = newRegion;

                  // flag changes so we can update pairs
                  gridChanged = true;
              }
          }

          // update pairs list only if pairs changed (i.e. a body changed region)
          if (gridChanged)
              grid.pairsList = Grid._createActivePairsList(grid);
      };

      deprecated(Grid, 'update', 'Grid.update ➤ replaced by Matter.Detector');

      /**
       * Clears the grid.
       * @deprecated replaced by Matter.Detector
       * @method clear
       * @param {grid} grid
       */
      Grid.clear = function(grid) {
          grid.buckets = {};
          grid.pairs = {};
          grid.pairsList = [];
      };

      deprecated(Grid, 'clear', 'Grid.clear ➤ replaced by Matter.Detector');

      /**
       * Finds the union of two regions.
       * @method _regionUnion
       * @deprecated replaced by Matter.Detector
       * @private
       * @param {} regionA
       * @param {} regionB
       * @return {} region
       */
      Grid._regionUnion = function(regionA, regionB) {
          var startCol = Math.min(regionA.startCol, regionB.startCol),
              endCol = Math.max(regionA.endCol, regionB.endCol),
              startRow = Math.min(regionA.startRow, regionB.startRow),
              endRow = Math.max(regionA.endRow, regionB.endRow);

          return Grid._createRegion(startCol, endCol, startRow, endRow);
      };

      /**
       * Gets the region a given body falls in for a given grid.
       * @method _getRegion
       * @deprecated replaced by Matter.Detector
       * @private
       * @param {} grid
       * @param {} body
       * @return {} region
       */
      Grid._getRegion = function(grid, body) {
          var bounds = body.bounds,
              startCol = Math.floor(bounds.min.x / grid.bucketWidth),
              endCol = Math.floor(bounds.max.x / grid.bucketWidth),
              startRow = Math.floor(bounds.min.y / grid.bucketHeight),
              endRow = Math.floor(bounds.max.y / grid.bucketHeight);

          return Grid._createRegion(startCol, endCol, startRow, endRow);
      };

      /**
       * Creates a region.
       * @method _createRegion
       * @deprecated replaced by Matter.Detector
       * @private
       * @param {} startCol
       * @param {} endCol
       * @param {} startRow
       * @param {} endRow
       * @return {} region
       */
      Grid._createRegion = function(startCol, endCol, startRow, endRow) {
          return { 
              id: startCol + ',' + endCol + ',' + startRow + ',' + endRow,
              startCol: startCol, 
              endCol: endCol, 
              startRow: startRow, 
              endRow: endRow 
          };
      };

      /**
       * Gets the bucket id at the given position.
       * @method _getBucketId
       * @deprecated replaced by Matter.Detector
       * @private
       * @param {} column
       * @param {} row
       * @return {string} bucket id
       */
      Grid._getBucketId = function(column, row) {
          return 'C' + column + 'R' + row;
      };

      /**
       * Creates a bucket.
       * @method _createBucket
       * @deprecated replaced by Matter.Detector
       * @private
       * @param {} buckets
       * @param {} bucketId
       * @return {} bucket
       */
      Grid._createBucket = function(buckets, bucketId) {
          var bucket = buckets[bucketId] = [];
          return bucket;
      };

      /**
       * Adds a body to a bucket.
       * @method _bucketAddBody
       * @deprecated replaced by Matter.Detector
       * @private
       * @param {} grid
       * @param {} bucket
       * @param {} body
       */
      Grid._bucketAddBody = function(grid, bucket, body) {
          var gridPairs = grid.pairs,
              pairId = Pair.id,
              bucketLength = bucket.length,
              i;

          // add new pairs
          for (i = 0; i < bucketLength; i++) {
              var bodyB = bucket[i];

              if (body.id === bodyB.id || (body.isStatic && bodyB.isStatic))
                  continue;

              // keep track of the number of buckets the pair exists in
              // important for Grid.update to work
              var id = pairId(body, bodyB),
                  pair = gridPairs[id];

              if (pair) {
                  pair[2] += 1;
              } else {
                  gridPairs[id] = [body, bodyB, 1];
              }
          }

          // add to bodies (after pairs, otherwise pairs with self)
          bucket.push(body);
      };

      /**
       * Removes a body from a bucket.
       * @method _bucketRemoveBody
       * @deprecated replaced by Matter.Detector
       * @private
       * @param {} grid
       * @param {} bucket
       * @param {} body
       */
      Grid._bucketRemoveBody = function(grid, bucket, body) {
          var gridPairs = grid.pairs,
              pairId = Pair.id,
              i;

          // remove from bucket
          bucket.splice(Common.indexOf(bucket, body), 1);

          var bucketLength = bucket.length;

          // update pair counts
          for (i = 0; i < bucketLength; i++) {
              // keep track of the number of buckets the pair exists in
              // important for _createActivePairsList to work
              var pair = gridPairs[pairId(body, bucket[i])];

              if (pair)
                  pair[2] -= 1;
          }
      };

      /**
       * Generates a list of the active pairs in the grid.
       * @method _createActivePairsList
       * @deprecated replaced by Matter.Detector
       * @private
       * @param {} grid
       * @return [] pairs
       */
      Grid._createActivePairsList = function(grid) {
          var pair,
              gridPairs = grid.pairs,
              pairKeys = Common.keys(gridPairs),
              pairKeysLength = pairKeys.length,
              pairs = [],
              k;

          // iterate over grid.pairs
          for (k = 0; k < pairKeysLength; k++) {
              pair = gridPairs[pairKeys[k]];

              // if pair exists in at least one bucket
              // it is a pair that needs further collision testing so push it
              if (pair[2] > 0) {
                  pairs.push(pair);
              } else {
                  delete gridPairs[pairKeys[k]];
              }
          }

          return pairs;
      };
      
  })();


  /***/ }),
  /* 25 */
  /***/ (function(module, exports, __webpack_require__) {

  /**
  * The `Matter.MouseConstraint` module contains methods for creating mouse constraints.
  * Mouse constraints are used for allowing user interaction, providing the ability to move bodies via the mouse or touch.
  *
  * See the included usage [examples](https://github.com/liabru/matter-js/tree/master/examples).
  *
  * @class MouseConstraint
  */

  var MouseConstraint = {};

  module.exports = MouseConstraint;

  var Vertices = __webpack_require__(3);
  var Sleeping = __webpack_require__(7);
  var Mouse = __webpack_require__(13);
  var Events = __webpack_require__(4);
  var Detector = __webpack_require__(14);
  var Constraint = __webpack_require__(10);
  var Composite = __webpack_require__(5);
  var Common = __webpack_require__(0);
  var Bounds = __webpack_require__(1);

  (function() {

      /**
       * Creates a new mouse constraint.
       * All properties have default values, and many are pre-calculated automatically based on other properties.
       * See the properties section below for detailed information on what you can pass via the `options` object.
       * @method create
       * @param {engine} engine
       * @param {} options
       * @return {MouseConstraint} A new MouseConstraint
       */
      MouseConstraint.create = function(engine, options) {
          var mouse = (engine ? engine.mouse : null) || (options ? options.mouse : null);

          if (!mouse) {
              if (engine && engine.render && engine.render.canvas) {
                  mouse = Mouse.create(engine.render.canvas);
              } else if (options && options.element) {
                  mouse = Mouse.create(options.element);
              } else {
                  mouse = Mouse.create();
                  Common.warn('MouseConstraint.create: options.mouse was undefined, options.element was undefined, may not function as expected');
              }
          }

          var constraint = Constraint.create({ 
              label: 'Mouse Constraint',
              pointA: mouse.position,
              pointB: { x: 0, y: 0 },
              length: 0.01, 
              stiffness: 0.1,
              angularStiffness: 1,
              render: {
                  strokeStyle: '#90EE90',
                  lineWidth: 3
              }
          });

          var defaults = {
              type: 'mouseConstraint',
              mouse: mouse,
              element: null,
              body: null,
              constraint: constraint,
              collisionFilter: {
                  category: 0x0001,
                  mask: 0xFFFFFFFF,
                  group: 0
              }
          };

          var mouseConstraint = Common.extend(defaults, options);

          Events.on(engine, 'beforeUpdate', function() {
              var allBodies = Composite.allBodies(engine.world);
              MouseConstraint.update(mouseConstraint, allBodies);
              MouseConstraint._triggerEvents(mouseConstraint);
          });

          return mouseConstraint;
      };

      /**
       * Updates the given mouse constraint.
       * @private
       * @method update
       * @param {MouseConstraint} mouseConstraint
       * @param {body[]} bodies
       */
      MouseConstraint.update = function(mouseConstraint, bodies) {
          var mouse = mouseConstraint.mouse,
              constraint = mouseConstraint.constraint,
              body = mouseConstraint.body;

          if (mouse.button === 0) {
              if (!constraint.bodyB) {
                  for (var i = 0; i < bodies.length; i++) {
                      body = bodies[i];
                      if (Bounds.contains(body.bounds, mouse.position) 
                              && Detector.canCollide(body.collisionFilter, mouseConstraint.collisionFilter)) {
                          for (var j = body.parts.length > 1 ? 1 : 0; j < body.parts.length; j++) {
                              var part = body.parts[j];
                              if (Vertices.contains(part.vertices, mouse.position)) {
                                  constraint.pointA = mouse.position;
                                  constraint.bodyB = mouseConstraint.body = body;
                                  constraint.pointB = { x: mouse.position.x - body.position.x, y: mouse.position.y - body.position.y };
                                  constraint.angleB = body.angle;

                                  Sleeping.set(body, false);
                                  Events.trigger(mouseConstraint, 'startdrag', { mouse: mouse, body: body });

                                  break;
                              }
                          }
                      }
                  }
              } else {
                  Sleeping.set(constraint.bodyB, false);
                  constraint.pointA = mouse.position;
              }
          } else {
              constraint.bodyB = mouseConstraint.body = null;
              constraint.pointB = null;

              if (body)
                  Events.trigger(mouseConstraint, 'enddrag', { mouse: mouse, body: body });
          }
      };

      /**
       * Triggers mouse constraint events.
       * @method _triggerEvents
       * @private
       * @param {mouse} mouseConstraint
       */
      MouseConstraint._triggerEvents = function(mouseConstraint) {
          var mouse = mouseConstraint.mouse,
              mouseEvents = mouse.sourceEvents;

          if (mouseEvents.mousemove)
              Events.trigger(mouseConstraint, 'mousemove', { mouse: mouse });

          if (mouseEvents.mousedown)
              Events.trigger(mouseConstraint, 'mousedown', { mouse: mouse });

          if (mouseEvents.mouseup)
              Events.trigger(mouseConstraint, 'mouseup', { mouse: mouse });

          // reset the mouse state ready for the next step
          Mouse.clearSourceEvents(mouse);
      };

      /*
      *
      *  Events Documentation
      *
      */

      /**
      * Fired when the mouse has moved (or a touch moves) during the last step
      *
      * @event mousemove
      * @param {} event An event object
      * @param {mouse} event.mouse The engine's mouse instance
      * @param {} event.source The source object of the event
      * @param {} event.name The name of the event
      */

      /**
      * Fired when the mouse is down (or a touch has started) during the last step
      *
      * @event mousedown
      * @param {} event An event object
      * @param {mouse} event.mouse The engine's mouse instance
      * @param {} event.source The source object of the event
      * @param {} event.name The name of the event
      */

      /**
      * Fired when the mouse is up (or a touch has ended) during the last step
      *
      * @event mouseup
      * @param {} event An event object
      * @param {mouse} event.mouse The engine's mouse instance
      * @param {} event.source The source object of the event
      * @param {} event.name The name of the event
      */

      /**
      * Fired when the user starts dragging a body
      *
      * @event startdrag
      * @param {} event An event object
      * @param {mouse} event.mouse The engine's mouse instance
      * @param {body} event.body The body being dragged
      * @param {} event.source The source object of the event
      * @param {} event.name The name of the event
      */

      /**
      * Fired when the user ends dragging a body
      *
      * @event enddrag
      * @param {} event An event object
      * @param {mouse} event.mouse The engine's mouse instance
      * @param {body} event.body The body that has stopped being dragged
      * @param {} event.source The source object of the event
      * @param {} event.name The name of the event
      */

      /*
      *
      *  Properties Documentation
      *
      */

      /**
       * A `String` denoting the type of object.
       *
       * @property type
       * @type string
       * @default "constraint"
       * @readOnly
       */

      /**
       * The `Mouse` instance in use. If not supplied in `MouseConstraint.create`, one will be created.
       *
       * @property mouse
       * @type mouse
       * @default mouse
       */

      /**
       * The `Body` that is currently being moved by the user, or `null` if no body.
       *
       * @property body
       * @type body
       * @default null
       */

      /**
       * The `Constraint` object that is used to move the body during interaction.
       *
       * @property constraint
       * @type constraint
       */

      /**
       * An `Object` that specifies the collision filter properties.
       * The collision filter allows the user to define which types of body this mouse constraint can interact with.
       * See `body.collisionFilter` for more information.
       *
       * @property collisionFilter
       * @type object
       */

  })();


  /***/ }),
  /* 26 */
  /***/ (function(module, exports, __webpack_require__) {

  /**
  * The `Matter.Query` module contains methods for performing collision queries.
  *
  * See the included usage [examples](https://github.com/liabru/matter-js/tree/master/examples).
  *
  * @class Query
  */

  var Query = {};

  module.exports = Query;

  var Vector = __webpack_require__(2);
  var Collision = __webpack_require__(8);
  var Bounds = __webpack_require__(1);
  var Bodies = __webpack_require__(12);
  var Vertices = __webpack_require__(3);

  (function() {

      /**
       * Returns a list of collisions between `body` and `bodies`.
       * @method collides
       * @param {body} body
       * @param {body[]} bodies
       * @return {collision[]} Collisions
       */
      Query.collides = function(body, bodies) {
          var collisions = [],
              bodiesLength = bodies.length,
              bounds = body.bounds,
              collides = Collision.collides,
              overlaps = Bounds.overlaps;

          for (var i = 0; i < bodiesLength; i++) {
              var bodyA = bodies[i],
                  partsALength = bodyA.parts.length,
                  partsAStart = partsALength === 1 ? 0 : 1;
              
              if (overlaps(bodyA.bounds, bounds)) {
                  for (var j = partsAStart; j < partsALength; j++) {
                      var part = bodyA.parts[j];

                      if (overlaps(part.bounds, bounds)) {
                          var collision = collides(part, body);

                          if (collision) {
                              collisions.push(collision);
                              break;
                          }
                      }
                  }
              }
          }

          return collisions;
      };

      /**
       * Casts a ray segment against a set of bodies and returns all collisions, ray width is optional. Intersection points are not provided.
       * @method ray
       * @param {body[]} bodies
       * @param {vector} startPoint
       * @param {vector} endPoint
       * @param {number} [rayWidth]
       * @return {collision[]} Collisions
       */
      Query.ray = function(bodies, startPoint, endPoint, rayWidth) {
          rayWidth = rayWidth || 1e-100;

          var rayAngle = Vector.angle(startPoint, endPoint),
              rayLength = Vector.magnitude(Vector.sub(startPoint, endPoint)),
              rayX = (endPoint.x + startPoint.x) * 0.5,
              rayY = (endPoint.y + startPoint.y) * 0.5,
              ray = Bodies.rectangle(rayX, rayY, rayLength, rayWidth, { angle: rayAngle }),
              collisions = Query.collides(ray, bodies);

          for (var i = 0; i < collisions.length; i += 1) {
              var collision = collisions[i];
              collision.body = collision.bodyB = collision.bodyA;            
          }

          return collisions;
      };

      /**
       * Returns all bodies whose bounds are inside (or outside if set) the given set of bounds, from the given set of bodies.
       * @method region
       * @param {body[]} bodies
       * @param {bounds} bounds
       * @param {bool} [outside=false]
       * @return {body[]} The bodies matching the query
       */
      Query.region = function(bodies, bounds, outside) {
          var result = [];

          for (var i = 0; i < bodies.length; i++) {
              var body = bodies[i],
                  overlaps = Bounds.overlaps(body.bounds, bounds);
              if ((overlaps && !outside) || (!overlaps && outside))
                  result.push(body);
          }

          return result;
      };

      /**
       * Returns all bodies whose vertices contain the given point, from the given set of bodies.
       * @method point
       * @param {body[]} bodies
       * @param {vector} point
       * @return {body[]} The bodies matching the query
       */
      Query.point = function(bodies, point) {
          var result = [];

          for (var i = 0; i < bodies.length; i++) {
              var body = bodies[i];
              
              if (Bounds.contains(body.bounds, point)) {
                  for (var j = body.parts.length === 1 ? 0 : 1; j < body.parts.length; j++) {
                      var part = body.parts[j];

                      if (Bounds.contains(part.bounds, point)
                          && Vertices.contains(part.vertices, point)) {
                          result.push(body);
                          break;
                      }
                  }
              }
          }

          return result;
      };

  })();


  /***/ }),
  /* 27 */
  /***/ (function(module, exports, __webpack_require__) {

  /**
  * The `Matter.Runner` module is an optional utility which provides a game loop, 
  * that handles continuously updating a `Matter.Engine` for you within a browser.
  * It is intended for development and debugging purposes, but may also be suitable for simple games.
  * If you are using your own game loop instead, then you do not need the `Matter.Runner` module.
  * Instead just call `Engine.update(engine, delta)` in your own loop.
  *
  * See the included usage [examples](https://github.com/liabru/matter-js/tree/master/examples).
  *
  * @class Runner
  */

  var Runner = {};

  module.exports = Runner;

  var Events = __webpack_require__(4);
  var Engine = __webpack_require__(18);
  var Common = __webpack_require__(0);

  (function() {

      var _requestAnimationFrame,
          _cancelAnimationFrame;

      if (typeof window !== 'undefined') {
          _requestAnimationFrame = window.requestAnimationFrame || window.webkitRequestAnimationFrame
                                        || window.mozRequestAnimationFrame || window.msRequestAnimationFrame;
     
          _cancelAnimationFrame = window.cancelAnimationFrame || window.mozCancelAnimationFrame 
                                        || window.webkitCancelAnimationFrame || window.msCancelAnimationFrame;
      }

      if (!_requestAnimationFrame) {
          var _frameTimeout;

          _requestAnimationFrame = function(callback){ 
              _frameTimeout = setTimeout(function() { 
                  callback(Common.now()); 
              }, 1000 / 60);
          };

          _cancelAnimationFrame = function() {
              clearTimeout(_frameTimeout);
          };
      }

      /**
       * Creates a new Runner. The options parameter is an object that specifies any properties you wish to override the defaults.
       * @method create
       * @param {} options
       */
      Runner.create = function(options) {
          var defaults = {
              fps: 60,
              correction: 1,
              deltaSampleSize: 60,
              counterTimestamp: 0,
              frameCounter: 0,
              deltaHistory: [],
              timePrev: null,
              timeScalePrev: 1,
              frameRequestId: null,
              isFixed: false,
              enabled: true
          };

          var runner = Common.extend(defaults, options);

          runner.delta = runner.delta || 1000 / runner.fps;
          runner.deltaMin = runner.deltaMin || 1000 / runner.fps;
          runner.deltaMax = runner.deltaMax || 1000 / (runner.fps * 0.5);
          runner.fps = 1000 / runner.delta;

          return runner;
      };

      /**
       * Continuously ticks a `Matter.Engine` by calling `Runner.tick` on the `requestAnimationFrame` event.
       * @method run
       * @param {engine} engine
       */
      Runner.run = function(runner, engine) {
          // create runner if engine is first argument
          if (typeof runner.positionIterations !== 'undefined') {
              engine = runner;
              runner = Runner.create();
          }

          (function render(time){
              runner.frameRequestId = _requestAnimationFrame(render);

              if (time && runner.enabled) {
                  Runner.tick(runner, engine, time);
              }
          })();

          return runner;
      };

      /**
       * A game loop utility that updates the engine and renderer by one step (a 'tick').
       * Features delta smoothing, time correction and fixed or dynamic timing.
       * Consider just `Engine.update(engine, delta)` if you're using your own loop.
       * @method tick
       * @param {runner} runner
       * @param {engine} engine
       * @param {number} time
       */
      Runner.tick = function(runner, engine, time) {
          var timing = engine.timing,
              correction = 1,
              delta;

          // create an event object
          var event = {
              timestamp: timing.timestamp
          };

          Events.trigger(runner, 'beforeTick', event);

          if (runner.isFixed) {
              // fixed timestep
              delta = runner.delta;
          } else {
              // dynamic timestep based on wall clock between calls
              delta = (time - runner.timePrev) || runner.delta;
              runner.timePrev = time;

              // optimistically filter delta over a few frames, to improve stability
              runner.deltaHistory.push(delta);
              runner.deltaHistory = runner.deltaHistory.slice(-runner.deltaSampleSize);
              delta = Math.min.apply(null, runner.deltaHistory);
              
              // limit delta
              delta = delta < runner.deltaMin ? runner.deltaMin : delta;
              delta = delta > runner.deltaMax ? runner.deltaMax : delta;

              // correction for delta
              correction = delta / runner.delta;

              // update engine timing object
              runner.delta = delta;
          }

          // time correction for time scaling
          if (runner.timeScalePrev !== 0)
              correction *= timing.timeScale / runner.timeScalePrev;

          if (timing.timeScale === 0)
              correction = 0;

          runner.timeScalePrev = timing.timeScale;
          runner.correction = correction;

          // fps counter
          runner.frameCounter += 1;
          if (time - runner.counterTimestamp >= 1000) {
              runner.fps = runner.frameCounter * ((time - runner.counterTimestamp) / 1000);
              runner.counterTimestamp = time;
              runner.frameCounter = 0;
          }

          Events.trigger(runner, 'tick', event);

          // update
          Events.trigger(runner, 'beforeUpdate', event);
          Engine.update(engine, delta, correction);
          Events.trigger(runner, 'afterUpdate', event);

          Events.trigger(runner, 'afterTick', event);
      };

      /**
       * Ends execution of `Runner.run` on the given `runner`, by canceling the animation frame request event loop.
       * If you wish to only temporarily pause the engine, see `engine.enabled` instead.
       * @method stop
       * @param {runner} runner
       */
      Runner.stop = function(runner) {
          _cancelAnimationFrame(runner.frameRequestId);
      };

      /**
       * Alias for `Runner.run`.
       * @method start
       * @param {runner} runner
       * @param {engine} engine
       */
      Runner.start = function(runner, engine) {
          Runner.run(runner, engine);
      };

      /*
      *
      *  Events Documentation
      *
      */

      /**
      * Fired at the start of a tick, before any updates to the engine or timing
      *
      * @event beforeTick
      * @param {} event An event object
      * @param {number} event.timestamp The engine.timing.timestamp of the event
      * @param {} event.source The source object of the event
      * @param {} event.name The name of the event
      */

      /**
      * Fired after engine timing updated, but just before update
      *
      * @event tick
      * @param {} event An event object
      * @param {number} event.timestamp The engine.timing.timestamp of the event
      * @param {} event.source The source object of the event
      * @param {} event.name The name of the event
      */

      /**
      * Fired at the end of a tick, after engine update and after rendering
      *
      * @event afterTick
      * @param {} event An event object
      * @param {number} event.timestamp The engine.timing.timestamp of the event
      * @param {} event.source The source object of the event
      * @param {} event.name The name of the event
      */

      /**
      * Fired before update
      *
      * @event beforeUpdate
      * @param {} event An event object
      * @param {number} event.timestamp The engine.timing.timestamp of the event
      * @param {} event.source The source object of the event
      * @param {} event.name The name of the event
      */

      /**
      * Fired after update
      *
      * @event afterUpdate
      * @param {} event An event object
      * @param {number} event.timestamp The engine.timing.timestamp of the event
      * @param {} event.source The source object of the event
      * @param {} event.name The name of the event
      */

      /*
      *
      *  Properties Documentation
      *
      */

      /**
       * A flag that specifies whether the runner is running or not.
       *
       * @property enabled
       * @type boolean
       * @default true
       */

      /**
       * A `Boolean` that specifies if the runner should use a fixed timestep (otherwise it is variable).
       * If timing is fixed, then the apparent simulation speed will change depending on the frame rate (but behaviour will be deterministic).
       * If the timing is variable, then the apparent simulation speed will be constant (approximately, but at the cost of determininism).
       *
       * @property isFixed
       * @type boolean
       * @default false
       */

      /**
       * A `Number` that specifies the time step between updates in milliseconds.
       * If `engine.timing.isFixed` is set to `true`, then `delta` is fixed.
       * If it is `false`, then `delta` can dynamically change to maintain the correct apparent simulation speed.
       *
       * @property delta
       * @type number
       * @default 1000 / 60
       */

  })();


  /***/ }),
  /* 28 */
  /***/ (function(module, exports, __webpack_require__) {

  /**
  * This module has now been replaced by `Matter.Collision`.
  *
  * All usage should be migrated to `Matter.Collision`.
  * For back-compatibility purposes this module will remain for a short term and then later removed in a future release.
  *
  * The `Matter.SAT` module contains methods for detecting collisions using the Separating Axis Theorem.
  *
  * @class SAT
  * @deprecated
  */

  var SAT = {};

  module.exports = SAT;

  var Collision = __webpack_require__(8);
  var Common = __webpack_require__(0);
  var deprecated = Common.deprecated;

  (function() {

      /**
       * Detect collision between two bodies using the Separating Axis Theorem.
       * @deprecated replaced by Collision.collides
       * @method collides
       * @param {body} bodyA
       * @param {body} bodyB
       * @return {collision} collision
       */
      SAT.collides = function(bodyA, bodyB) {
          return Collision.collides(bodyA, bodyB);
      };

      deprecated(SAT, 'collides', 'SAT.collides ➤ replaced by Collision.collides');

  })();


  /***/ }),
  /* 29 */
  /***/ (function(module, exports, __webpack_require__) {

  /**
  * The `Matter.Svg` module contains methods for converting SVG images into an array of vector points.
  *
  * To use this module you also need the SVGPathSeg polyfill: https://github.com/progers/pathseg
  *
  * See the included usage [examples](https://github.com/liabru/matter-js/tree/master/examples).
  *
  * @class Svg
  */

  var Svg = {};

  module.exports = Svg;

  __webpack_require__(1);
  var Common = __webpack_require__(0);

  (function() {

      /**
       * Converts an SVG path into an array of vector points.
       * If the input path forms a concave shape, you must decompose the result into convex parts before use.
       * See `Bodies.fromVertices` which provides support for this.
       * Note that this function is not guaranteed to support complex paths (such as those with holes).
       * You must load the `pathseg.js` polyfill on newer browsers.
       * @method pathToVertices
       * @param {SVGPathElement} path
       * @param {Number} [sampleLength=15]
       * @return {Vector[]} points
       */
      Svg.pathToVertices = function(path, sampleLength) {
          if (typeof window !== 'undefined' && !('SVGPathSeg' in window)) {
              Common.warn('Svg.pathToVertices: SVGPathSeg not defined, a polyfill is required.');
          }

          // https://github.com/wout/svg.topoly.js/blob/master/svg.topoly.js
          var i, il, total, point, segment, segments, 
              segmentsQueue, lastSegment, 
              lastPoint, segmentIndex, points = [],
              lx, ly, length = 0, x = 0, y = 0;

          sampleLength = sampleLength || 15;

          var addPoint = function(px, py, pathSegType) {
              // all odd-numbered path types are relative except PATHSEG_CLOSEPATH (1)
              var isRelative = pathSegType % 2 === 1 && pathSegType > 1;

              // when the last point doesn't equal the current point add the current point
              if (!lastPoint || px != lastPoint.x || py != lastPoint.y) {
                  if (lastPoint && isRelative) {
                      lx = lastPoint.x;
                      ly = lastPoint.y;
                  } else {
                      lx = 0;
                      ly = 0;
                  }

                  var point = {
                      x: lx + px,
                      y: ly + py
                  };

                  // set last point
                  if (isRelative || !lastPoint) {
                      lastPoint = point;
                  }

                  points.push(point);

                  x = lx + px;
                  y = ly + py;
              }
          };

          var addSegmentPoint = function(segment) {
              var segType = segment.pathSegTypeAsLetter.toUpperCase();

              // skip path ends
              if (segType === 'Z') 
                  return;

              // map segment to x and y
              switch (segType) {

              case 'M':
              case 'L':
              case 'T':
              case 'C':
              case 'S':
              case 'Q':
                  x = segment.x;
                  y = segment.y;
                  break;
              case 'H':
                  x = segment.x;
                  break;
              case 'V':
                  y = segment.y;
                  break;
              }

              addPoint(x, y, segment.pathSegType);
          };

          // ensure path is absolute
          Svg._svgPathToAbsolute(path);

          // get total length
          total = path.getTotalLength();

          // queue segments
          segments = [];
          for (i = 0; i < path.pathSegList.numberOfItems; i += 1)
              segments.push(path.pathSegList.getItem(i));

          segmentsQueue = segments.concat();

          // sample through path
          while (length < total) {
              // get segment at position
              segmentIndex = path.getPathSegAtLength(length);
              segment = segments[segmentIndex];

              // new segment
              if (segment != lastSegment) {
                  while (segmentsQueue.length && segmentsQueue[0] != segment)
                      addSegmentPoint(segmentsQueue.shift());

                  lastSegment = segment;
              }

              // add points in between when curving
              // TODO: adaptive sampling
              switch (segment.pathSegTypeAsLetter.toUpperCase()) {

              case 'C':
              case 'T':
              case 'S':
              case 'Q':
              case 'A':
                  point = path.getPointAtLength(length);
                  addPoint(point.x, point.y, 0);
                  break;

              }

              // increment by sample value
              length += sampleLength;
          }

          // add remaining segments not passed by sampling
          for (i = 0, il = segmentsQueue.length; i < il; ++i)
              addSegmentPoint(segmentsQueue[i]);

          return points;
      };

      Svg._svgPathToAbsolute = function(path) {
          // http://phrogz.net/convert-svg-path-to-all-absolute-commands
          // Copyright (c) Gavin Kistner
          // http://phrogz.net/js/_ReuseLicense.txt
          // Modifications: tidy formatting and naming
          var x0, y0, x1, y1, x2, y2, segs = path.pathSegList,
              x = 0, y = 0, len = segs.numberOfItems;

          for (var i = 0; i < len; ++i) {
              var seg = segs.getItem(i),
                  segType = seg.pathSegTypeAsLetter;

              if (/[MLHVCSQTA]/.test(segType)) {
                  if ('x' in seg) x = seg.x;
                  if ('y' in seg) y = seg.y;
              } else {
                  if ('x1' in seg) x1 = x + seg.x1;
                  if ('x2' in seg) x2 = x + seg.x2;
                  if ('y1' in seg) y1 = y + seg.y1;
                  if ('y2' in seg) y2 = y + seg.y2;
                  if ('x' in seg) x += seg.x;
                  if ('y' in seg) y += seg.y;

                  switch (segType) {

                  case 'm':
                      segs.replaceItem(path.createSVGPathSegMovetoAbs(x, y), i);
                      break;
                  case 'l':
                      segs.replaceItem(path.createSVGPathSegLinetoAbs(x, y), i);
                      break;
                  case 'h':
                      segs.replaceItem(path.createSVGPathSegLinetoHorizontalAbs(x), i);
                      break;
                  case 'v':
                      segs.replaceItem(path.createSVGPathSegLinetoVerticalAbs(y), i);
                      break;
                  case 'c':
                      segs.replaceItem(path.createSVGPathSegCurvetoCubicAbs(x, y, x1, y1, x2, y2), i);
                      break;
                  case 's':
                      segs.replaceItem(path.createSVGPathSegCurvetoCubicSmoothAbs(x, y, x2, y2), i);
                      break;
                  case 'q':
                      segs.replaceItem(path.createSVGPathSegCurvetoQuadraticAbs(x, y, x1, y1), i);
                      break;
                  case 't':
                      segs.replaceItem(path.createSVGPathSegCurvetoQuadraticSmoothAbs(x, y), i);
                      break;
                  case 'a':
                      segs.replaceItem(path.createSVGPathSegArcAbs(x, y, seg.r1, seg.r2, seg.angle, seg.largeArcFlag, seg.sweepFlag), i);
                      break;
                  case 'z':
                  case 'Z':
                      x = x0;
                      y = y0;
                      break;

                  }
              }

              if (segType == 'M' || segType == 'm') {
                  x0 = x;
                  y0 = y;
              }
          }
      };

  })();

  /***/ }),
  /* 30 */
  /***/ (function(module, exports, __webpack_require__) {

  /**
  * This module has now been replaced by `Matter.Composite`.
  *
  * All usage should be migrated to the equivalent functions found on `Matter.Composite`.
  * For example `World.add(world, body)` now becomes `Composite.add(world, body)`.
  *
  * The property `world.gravity` has been moved to `engine.gravity`.
  *
  * For back-compatibility purposes this module will remain as a direct alias to `Matter.Composite` in the short term during migration.
  * Eventually this alias module will be marked as deprecated and then later removed in a future release.
  *
  * @class World
  */

  var World = {};

  module.exports = World;

  var Composite = __webpack_require__(5);
  __webpack_require__(0);

  (function() {

      /**
       * See above, aliases for back compatibility only
       */
      World.create = Composite.create;
      World.add = Composite.add;
      World.remove = Composite.remove;
      World.clear = Composite.clear;
      World.addComposite = Composite.addComposite;
      World.addBody = Composite.addBody;
      World.addConstraint = Composite.addConstraint;

  })();


  /***/ })
  /******/ ]);
  });
  }(matter));

  function PhysicalObject() {
      Object.defineProperty(this, 'body', {
          get() {
              return this._body;
          },
          set(value) {
              if(value instanceof Object) {
                  this._body = value;
              }
          },
      });

      Object.defineProperty(this, 'sprite', {
          get() {
              return this._sprite;
          },
          set(value) {
              this._sprite = value;
          },
      });
  }

  class Cell {
      constructor({
                      renderer,
                      leftCorner,
                      width,
                      height,
                      isMovable = false,
                      color = 0x00ff00,
                      lineStyle = {width: 2, color: 0xff0000, alpha: 1},
      }) {
          this.renderer = renderer;
          this.leftCorner = leftCorner;
          this.width = width;
          this.height = height;
          this.color = color;
          this.lineStyle = lineStyle;
          this.isMovable = isMovable;

          const sprite = this.drawSprite();
          const body = this.drawBody();

          return {sprite, body};

      }

      drawSprite() {
          const {width, color, alpha} = this.lineStyle;
          const graphics = new et();
          graphics.beginFill(this.color);
          graphics.lineStyle(width, color, alpha);
          graphics.drawRect(this.leftCorner.x, this.leftCorner.y, this.width, this.height);
          graphics.endFill();
          const texture = this.renderer.generateTexture(graphics);

          const sprite = new l$4(texture);
          sprite.width = this.width;
          sprite.height = this.height;
          sprite.anchor.set(0.5, 0.5);

          return sprite;
      }

      drawBody() {
          const options = {
              isMovable: false,
              isStatic: true,
              isSensor: true,
          };
          if(this.isMovable) {
              options.isMovable = true;
              options.isStatic = true;
          }
          return matter.exports.Bodies.rectangle(this.leftCorner.x, this.leftCorner.y, this.width, this.height, options);
      }
  }

  const field = [
      [1, 1, 1, 1,],
      [1, 1, 1, 1,],
      [1, 1, 1, 1,],
      [1, 1, 1, 1,],
  ];

  const app = new s$1({
      resizeTo: window,
  });

  const {renderer} = app;

  const engine = matter.exports.Engine.create();
  const {world} = engine;
  world.gravity.y = 0;

  const boxWidth = 50;
  const boxHeight = 50;
  const startingPoint = {
      x: 50,
      y: 50,
  };

  const fieldPhysicalBodies = [];
  const fieldSprites = {};

  for (let i = 0; i < field.length; i++) {
      for (let j = 0; j < field[i].length; j++) {
          const nextPosition = {
              x: startingPoint.x + j * boxWidth,
              y: startingPoint.y + i * boxHeight,
          };
          const lineStyle = {
              width: 2,
              color: 0xFEEB77,
              alpha: 1,
          };
          const cell = new Cell({
              renderer,
              lineStyle,
              leftCorner: startingPoint,
              width: boxWidth,
              height: boxHeight,
              isMovable: false,
              color: 0xDE3249,
          });

          matter.exports.Body.setPosition(cell.body, nextPosition);
          fieldPhysicalBodies.push(cell.body);
          matter.exports.World.addBody(world, cell.body);

          fieldSprites[cell.body.id] = cell.sprite;
          cell.sprite.position = nextPosition;
          app.stage.addChild(cell.sprite);

      }
  }

  const {body, sprite} = new Cell({
      renderer,
      leftCorner: startingPoint,
      width: boxWidth,
      height: boxHeight,
      isMovable: true,
  });


  const piece = new PhysicalObject();
  piece.body = body;
  piece.sprite = sprite;

  // World.addBody(world, piece.body);
  app.stage.addChild(piece.sprite);


  const newCellPoint = {
      x: startingPoint.x,
      y: startingPoint.y + boxHeight,
  };
  const newCell = new Cell({
      renderer,
      leftCorner: newCellPoint,
      width: boxWidth,
      height: boxHeight,
      isMovable: true,
  });

  const piece1 = new PhysicalObject();
  piece1.body = newCell.body;
  piece1.sprite = newCell.sprite;

  // World.addBody(world, piece1.body);
  app.stage.addChild(piece1.sprite);


  const newCellPoint1 = {
      x: startingPoint.x + boxWidth,
      y: startingPoint.y + boxHeight,
  };
  const newCell1 = new Cell({
      renderer,
      leftCorner: newCellPoint1,
      width: boxWidth,
      height: boxHeight,
      isMovable: true,
  });

  const piece2 = new PhysicalObject();
  piece2.body = newCell1.body;
  piece2.sprite = newCell1.sprite;

  // World.addBody(world, piece1.body);
  app.stage.addChild(piece2.sprite);

  const movableObjects = [];
  movableObjects.push(piece);
  movableObjects.push(piece1);
  movableObjects.push(piece2);

  const testBody = matter.exports.Body.create({
      isMovable: true,
      parts: [piece.body, piece1.body, piece2.body],
  });
  matter.exports.World.addBody(world, testBody);


  app.ticker.add(() => {
      movableObjects.forEach((object) => {
          // Make all pixi sprites follow the position and rotation of their body.
          object.sprite.position = object.body.position;
          object.sprite.rotation = object.body.angle;
      });
  });

  {
      document.querySelector(".scene").appendChild(app.view);
  }

  const mouse = matter.exports.Mouse.create(document.querySelector(".scene canvas"));
  const mouseConstraint = matter.exports.MouseConstraint.create(engine, {
      mouse,
  });

  const hoveredSpriteIdList = [];

  function onMouseMoveEvent(event) {
      const {body, constraint} = event.source;
      if (!body || !body.isMovable) {
          return;
      }
      const {parts} = body;
      if(parts.length > 0) {
          const hoveredList = [];
          parts.forEach((part, index) => {
              // skip the first part, it's the body itself.
              if(index === 0) return;
              const {position} = part;
              const queryPosition = matter.exports.Query.point(fieldPhysicalBodies, position);
              if(queryPosition.length > 0) {
                  part.hoveredBodyId = queryPosition[0].id;
                  hoveredList.push(queryPosition[0]);
              }
          });
          if (hoveredSpriteIdList.length) {
              hoveredSpriteIdList.forEach((id) => {
                  fieldSprites[id].alpha = 1;
              });
              hoveredSpriteIdList.length = 0;
          }
          if (hoveredList.length !== 0) {
              hoveredList.forEach((hovered) => {
                  hoveredSpriteIdList.push(hovered.id);
                  fieldSprites[hovered.id].alpha = 0.8;
              });
          }
      }
      const {mouse} = event;
      // use offset to prevent the mouse from being locked to the center of the body
      const offset = constraint.pointB;
      const newPosition = {
          x: mouse.position.x - offset.x,
          y: mouse.position.y - offset.y,
      };

      matter.exports.Body.setPosition(body, newPosition);
  }

  function moveToHoveredField(event) {
      const {body} = event;
      if (!body || !body.isMovable) {
          return;
      }

      const {parts} = body;

      if(parts.length === hoveredSpriteIdList.length + 1) {
          parts.forEach(part => {
              const {hoveredBodyId} = part;
              if (hoveredBodyId) {
                  const hoveredField = fieldPhysicalBodies.find((body) => body.id === hoveredBodyId);
                  matter.exports.Body.setPosition(part, hoveredField.position);
              }
          });
      }
  }

  matter.exports.Events.on(mouseConstraint, 'mousemove', onMouseMoveEvent);
  matter.exports.Events.on(mouseConstraint, 'enddrag', moveToHoveredField);

  matter.exports.World.add(world, mouseConstraint);


  matter.exports.Runner.run(engine);

})();
//# sourceMappingURL=bundle.js.map
