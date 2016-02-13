// striped down version of: https://dxr.mozilla.org/mozilla-central/source/devtools/server/actors/storage.js

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {async} = require("resource://gre/modules/devtools/async-utils");
const { setTimeout } = require("sdk/timers");
const promise = require("sdk/core/promise");

// A RegExp for characters that cannot appear in a file/directory name. This is
// used to sanitize the host name for indexed db to lookup whether the file is
// present in <profileDir>/storage/default/ location
const illegalFileNameCharacters = [
  "[",
  // Control characters \001 to \036
  "\\x00-\\x24",
  // Special characters
  "/:*?\\\"<>|\\\\",
  "]"
].join("");
const ILLEGAL_CHAR_REGEX = new RegExp(illegalFileNameCharacters, "g");

var OS = require("resource://gre/modules/osfile.jsm").OS;
var Sqlite = require("resource://gre/modules/Sqlite.jsm");

/**
 * An async method equivalent to setTimeout but using Promises
 *
 * @param {number} time
 *        The wait time in milliseconds.
 */
function sleep(time) {
  let deferred = promise.defer();

  setTimeout(() => {
    deferred.resolve(null);
  }, time);

  return deferred.promise;
}

var indexedDBHelpers = {
  
  /**
   * Fetches all the databases and their metadata for the given `host`.
   */
  getDBNamesForHost: async(function*(host) {
    let sanitizedHost = indexedDBHelpers.getSanitizedHost(host);
    let directory = OS.Path.join(OS.Constants.Path.profileDir, "storage",
                                 "default", sanitizedHost, "idb");

    let exists = yield OS.File.exists(directory);
    if (!exists && host.startsWith("about:")) {
      // try for moz-safe-about directory
      sanitizedHost = indexedDBHelpers.getSanitizedHost("moz-safe-" + host);
      directory = OS.Path.join(OS.Constants.Path.profileDir, "storage",
                               "permanent", sanitizedHost, "idb");
      exists = yield OS.File.exists(directory);
    }
    if (!exists) {
      return [];
    }

    let names = [];
    let dirIterator = new OS.File.DirectoryIterator(directory);
    try {
      yield dirIterator.forEach(file => {
        // Skip directories.
        if (file.isDir) {
          return null;
        }

        // Skip any non-sqlite files.
        if (!file.name.endsWith(".sqlite")) {
          return null;
        }

        return indexedDBHelpers.getNameFromDatabaseFile(file.path).then(name => {
          if (name) {
            names.push(name);
          }
          return null;
        });
      });
    } finally {
      dirIterator.close();
    }
    return names;
  }),

  /**
   * Removes any illegal characters from the host name to make it a valid file
   * name.
   */
  getSanitizedHost: function(host) {
    return host.replace(ILLEGAL_CHAR_REGEX, "+");
  },

  /**
   * Retrieves the proper indexed db database name from the provided .sqlite
   * file location.
   */
  getNameFromDatabaseFile: async(function*(path) {
    let connection = null;
    let retryCount = 0;

    // Content pages might be having an open transaction for the same indexed db
    // which this sqlite file belongs to. In that case, sqlite.openConnection
    // will throw. Thus we retey for some time to see if lock is removed.
    while (!connection && retryCount++ < 25) {
      try {
        connection = yield Sqlite.openConnection({ path: path });
      } catch (ex) {
        // Continuously retrying is overkill. Waiting for 100ms before next try
        yield sleep(100);
      }
    }

    if (!connection) {
      return null;
    }

    let rows = yield connection.execute("SELECT name FROM database");
    if (rows.length != 1) {
      return null;
    }

    let name = rows[0].getResultByName("name");

    yield connection.close();

    return name;
  })

};

module.exports = indexedDBHelpers.getDBNamesForHost;
