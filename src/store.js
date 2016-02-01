!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.Store=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var delimiters, part;

delimiters = {
  headers: ": ",
  lists: ", "
};

exports.serialize = function(tid) {
  var body, header, headers, key, title, value;
  headers = [];
  for (key in tid) {
    value = tid[key];
    if (key === "title") {
      title = value;
    } else if (key === "body") {
      body = value;
    } else {
      if (key.indexOf(delimiters.headers) !== -1) {
        throw "header keys must not contain colon delimiters";
      }
      if (value.join) {
        value = "[" + (value.join(delimiters.lists)) + "]";
      }
      header = [key, value].join(delimiters.headers);
      if (header.indexOf("\n") !== -1) {
        throw "headers must not contain line breaks";
      }
      headers.push(header);
    }
  }
  return headers.concat(["", body]).join("\n");
};

exports.deserialize = function(title, txt) {
  var body, headers, i, key, len, line, ref, ref1, tid, value;
  ref = part(txt, "\n\n"), headers = ref[0], body = ref[1];
  if (void 0 === headers || void 0 === body) {
    throw "invalid serialization";
  }
  headers = headers.split("\n");
  body = body.trim();
  tid = {};
  for (i = 0, len = headers.length; i < len; i++) {
    line = headers[i];
    ref1 = part(line, delimiters.headers), key = ref1[0], value = ref1[1];
    if (void 0 === key || void 0 === value) {
      throw "invalid serialization";
    }
    if (value[0] === "[" && value.slice(-1) === "]") {
      value = value.slice(1, -1).split(delimiters.lists);
    }
    tid[key] = value;
  }
  tid.title = title;
  tid.body = body;
  return tid;
};

part = function(str, delimiter) {
  var parts;
  parts = str.split(delimiter);
  if (parts.length < 2) {
    return [];
  }
  return [parts[0], parts.slice(1).join(delimiter)];
};



},{}],2:[function(require,module,exports){
var Store, serializer, util, xml;

serializer = require("./serializer");

xml = require("./xml");

util = require("./util");

module.exports = Store = (function() {
  function Store(root1, http) {
    this.root = root1;
    this.http = http;
    this._cache = null;
    if (this.root === void 0) {
      throw "missing root URL";
    }
  }

  Store.prototype.add = function(tid) {
    var put;
    put = this.http("PUT", this.uri(tid.title), {
      "Content-Type": "text/plain"
    }, serializer.serialize(tid));
    return Promise.all([put, this.all()]).then((function(_this) {
      return function() {
        _this._cache[tid.title] = util.clone(tid, true);
        return util.clone(_this._cache, true);
      };
    })(this));
  };

  Store.prototype.remove = function(title) {
    return this.http("DELETE", this.uri(title));
  };

  Store.prototype.move = function(title, targetStore) {
    return this.http("MOVE", this.uri(title), {
      Destination: targetStore.uri(title)
    });
  };

  Store.prototype.all = function(ignoreCache) {
    if (this._cache && !ignoreCache) {
      return Promise.resolve(this._cache);
    }
    return this.index().then((function(_this) {
      return function(arg) {
        var dirs, files, tids, title;
        dirs = arg[0], files = arg[1];
        tids = (function() {
          var i, len, results;
          results = [];
          for (i = 0, len = files.length; i < len; i++) {
            title = files[i];
            results.push(this.get(title));
          }
          return results;
        }).call(_this);
        return Promise.all(tids).then(function(tids) {
          _this._cache = util.indexBy("title", tids);
          return util.clone(_this._cache, true);
        });
      };
    })(this));
  };

  Store.prototype.get = function(title, ignoreCache) {
    var tid;
    if (this._cache && !ignoreCache) {
      tid = this._cache[title];
      if (tid) {
        return Promise.resolve(tid);
      }
    }
    return this.http("GET", this.uri(title)).then(function(res) {
      tid = serializer.deserialize(title, res.body);
      if (this._cache) {
        this._cache[tid.title] = tid;
      }
      return util.clone(tid, true);
    });
  };

  Store.prototype.index = function() {
    return this.http("PROPFIND", this.root, {
      Depth: 1
    }).then(function(res) {
      return xml.extractEntries(res.body);
    });
  };

  Store.prototype.uri = function(title) {
    var filename, root;
    root = this.root === "/" ? "" : this.root;
    filename = encodeURIComponent(title);
    return [root, filename].join("/");
  };

  return Store;

})();



},{"./serializer":1,"./util":3,"./xml":4}],3:[function(require,module,exports){
var hasProp = {}.hasOwnProperty;

exports.indexBy = function(prop, items) {
  var reducer;
  reducer = function(memo, item) {
    var key;
    key = item[prop];
    memo[key] = item;
    return memo;
  };
  return items.reduce(reducer, {});
};

exports.clone = function(obj, deep) {
  var clone, key, value;
  if (!((obj != null) || typeof obj !== "object")) {
    return obj;
  }
  clone = {};
  for (key in obj) {
    if (!hasProp.call(obj, key)) continue;
    value = obj[key];
    clone[key] = value;
  }
  return clone;
};



},{}],4:[function(require,module,exports){
var parseEntry, traverse,
  slice = [].slice;

exports.extractEntries = function(doc) {
  var dirs, entry, files, i, j, len, list, ref;
  dirs = [];
  files = [];
  ref = doc.getElementsByTagNameNS("DAV:", "response");
  for (i = j = 0, len = ref.length; j < len; i = ++j) {
    entry = ref[i];
    entry = parseEntry(entry);
    if (i === 0) {
      continue;
    }
    list = entry.dir ? dirs : files;
    list.push(entry.name);
  }
  return [dirs, files];
};

parseEntry = function(entry) {
  var name, uri;
  uri = entry.getElementsByTagNameNS("DAV:", "href")[0].textContent;
  uri = uri.replace(/\/$/, "");
  name = uri.split("/").pop();
  entry = {
    name: decodeURIComponent(name),
    dir: !!traverse(entry, "propstat", "prop", "resourcetype", "collection")
  };
  return entry;
};

traverse = function() {
  var node, part, path, root;
  root = arguments[0], path = 2 <= arguments.length ? slice.call(arguments, 1) : [];
  node = root;
  while (path.length) {
    part = path.shift();
    if (!node) {
      return null;
    }
    node = node.getElementsByTagNameNS("DAV:", part)[0];
  }
  return node;
};



},{}]},{},[2])(2)
});