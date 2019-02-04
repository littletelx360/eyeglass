"use strict";
// TODO: Annotate Types

import * as path from "path";
import { existsSync } from "fs";
import ImportUtilities from "./ImportUtilities";

export default function FSImporter(eyeglass, sass, options, fallbackImporter) {
  let fsURI = /^fs\(([-_a-zA-Z][-_a-zA-Z0-9]+)\)$/;

  return ImportUtilities.createImporter(function(uri, prev, done) {
    let importUtils = new ImportUtilities(eyeglass, sass, options, fallbackImporter, this);
    let match = uri.match(fsURI);
    if (match) {
      let identifier = match[1];
      let absolutePath = null;
      if (identifier === "root") {
        absolutePath = options.eyeglass.root;
      } else if (!existsSync(prev)) {
        absolutePath = path.resolve(".");
      } else {
        absolutePath = path.resolve(path.dirname(prev));
      }
      /* istanbul ignore else - TODO: revisit this */
      if (absolutePath) {
        let sassContents = '@import "eyeglass/fs"; @include fs-register-path('
                         + identifier + ', "' + absolutePath + '");';
        let data = {
          contents: sassContents,
          file: "fs:" + identifier + ":" + absolutePath
        };
        importUtils.importOnce(data, done);
      } else {
        // TODO (test) - how do we get here? needs test case
        done(new Error("Cannot resolve filesystem location of " + prev));
      }
    } else {
      importUtils.fallback(uri, prev, done, function() {
        done(sass.NULL);
      });
    }
  });
}
