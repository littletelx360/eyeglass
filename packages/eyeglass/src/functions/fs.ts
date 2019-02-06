import * as fs from "fs";
import { existsSync } from "fs";
import * as path from "path";
import * as glob from "glob";
import { IEyeglass } from "../IEyeglass";
import { SassImplementation, SassValue, SassFunctionCallback, isSassString, typeError, FunctionDeclarations } from "../util/SassImplementation";
import { unreachable } from "../util/assertions";
import { EyeglassFunctions } from "./EyeglassFunctions";

function pathInSandboxDir(fsPath: string, sandboxDir: string): boolean {
  if (path.relative(sandboxDir, fsPath).match(/^\.\./)) {
    return false;
  } else {
    return true;
  }
}

const fsFunctions: EyeglassFunctions = function(eyeglass: IEyeglass, sass: SassImplementation): FunctionDeclarations {
  let sassUtils = require("node-sass-utils")(sass);

  function accessViolation(location: string) {
    return sass.types.Error("Security violation: Cannot access " + location);
  }

  function inSandbox(fsPath: string) {
    let sandbox = eyeglass.options.eyeglass.fsSandbox;
    // if there are no sandbox restrictions, return true
    if (!sandbox) {
      return true;
    } else if (Array.isArray(sandbox)) {
      // iterate over them and return true if we find one that is valid
      return sandbox.some(function(sb) {
        if (pathInSandboxDir(fsPath, sb)) {
          return true;
        } else {
          return false;
        }
      });
    } else {
      unreachable(sandbox, "sandbox");
    }
  }

  function globFiles(directory: string, globPattern: string, includeFiles: boolean, includeDirectories: boolean, done: SassFunctionCallback) {
    if (inSandbox(directory)) {
      let globOpts = {
        root: directory,
        cwd: directory,
        mark: true
      };
      glob(globPattern, globOpts, function(error, files) {
        /* istanbul ignore if - we do not need to simulate a glob error here */
        if (error) {
          done(sass.types.Error(error.message));
          return;
        }

        let filesToReturn = [];
        for (let i = 0; i < files.length; i++) {
          let endsWithSlash = /\/$/.test(files[i]);
          if (endsWithSlash && includeDirectories) {
            if (!inSandbox(path.join(directory, files[i]))) {
              done(accessViolation(files[i]));
              return;
            }
            filesToReturn[filesToReturn.length] = files[i].slice(-files[i].length, -1);
          }
          if (!endsWithSlash && includeFiles) {
            if (!inSandbox(path.join(directory, files[i]))) {
              done(accessViolation(files[i]));
              return;
            }
            filesToReturn[filesToReturn.length] = files[i];
          }
        }
        done(sassUtils.castToSass(filesToReturn));
      });
    } else {
      done(accessViolation(directory));
    }
  }

  return {
    "eyeglass-fs-absolute-path($fs-registered-pathnames, $path-id, $segments...)":
      function(fsRegisteredPathnames: SassValue, fsPathId: SassValue, fsSegments: Array<SassValue>, done: SassFunctionCallback) {
        let pathId = sassUtils.castToJs(fsPathId);
        let segments = sassUtils.castToJs(fsSegments);
        let registeredPathnames = sassUtils.castToJs(fsRegisteredPathnames);
        let expandedPath = registeredPathnames.coerce.get(pathId);
        if (expandedPath) {
          segments.unshift(expandedPath);
          let resolved = path.resolve.apply(null, segments);
          done(sass.types.String(resolved));
        } else {
          done(sass.types.Error("No path is registered for " + pathId));
        }
      },
    "eyeglass-fs-join($segments...)": function(segments: SassValue, done: SassFunctionCallback) {
      let jsSegments = sassUtils.castToJs(segments);
      let joined = path.join.apply(null, jsSegments);
      done(sass.types.String(joined));
    },
    "eyeglass-fs-exists($absolute-path)": function(fsAbsolutePath: SassValue, done: SassFunctionCallback) {
      if (!isSassString(sass, fsAbsolutePath)) {
        return done(typeError(sass, "string", fsAbsolutePath));
      }
      let absolutePath = fsAbsolutePath.getValue();
      if (inSandbox(absolutePath)) {
        if (existsSync(absolutePath)) {
          done(sass.TRUE);
        } else {
          done(sass.FALSE);
        }
      } else {
        done(accessViolation(absolutePath));
      }
    },
    "eyeglass-fs-path-separator()": function(done: SassFunctionCallback) {
      done(sass.types.String(path.sep));
    },
    "eyeglass-fs-list-files($directory, $glob: '*')": function($directory: SassValue, $globPattern: SassValue, done: SassFunctionCallback) {
      if (!isSassString(sass, $directory)) {
        return done(typeError(sass, "string", $directory));
      }
      if (!isSassString(sass, $globPattern)) {
        return done(typeError(sass, "string", $globPattern));
      }
      globFiles($directory.getValue(), $globPattern.getValue(), true, false, done);
    },
    "eyeglass-fs-list-directories($directory, $glob: '*')": function($directory: SassValue, $globPattern: SassValue, done: SassFunctionCallback) {
      if (!isSassString(sass, $directory)) {
        return done(typeError(sass, "string", $directory));
      }
      if (!isSassString(sass, $globPattern)) {
        return done(typeError(sass, "string", $globPattern));
      }
      globFiles($directory.getValue(), $globPattern.getValue(), false, true, done);
    },
    "eyeglass-fs-parse-filename($filename)": function($filename: SassValue, done: SassFunctionCallback) {
      if (!isSassString(sass, $filename)) {
        return done(typeError(sass, "string", $filename));
      }
      let parsedFilename = path.parse($filename.getValue());
      done(
        sassUtils.castToSass({
          base: parsedFilename.base,
          dir: parsedFilename.dir,
          name: parsedFilename.name,
          ext: parsedFilename.ext,
          "is-absolute": path.isAbsolute($filename.getValue())
        })
      );
    },
    "eyeglass-fs-info($filename)": function($filename: SassValue, done: SassFunctionCallback) {
      if (!isSassString(sass, $filename)) {
        return done(typeError(sass, "string", $filename));
      }
      let filename = $filename.getValue();

      if (inSandbox(filename)) {
        fs.stat(filename, function(err, stats) {
          /* istanbul ignore if - we do not need to simulate an fs error here */
          if (err) {
            done(sass.types.Error(err.message));
          } else {
            try {
              let realpath = fs.realpathSync(filename);

              done(
                sassUtils.castToSass({
                  "modification-time": stats.mtime.getTime(),
                  "creation-time": stats.birthtime.getTime(),
                  "is-file": stats.isFile(),
                  "is-directory": stats.isDirectory(),
                  "real-path": realpath,
                  "size": stats.size,
                })
              );
            } catch (e) {
              /* istanbul ignore next - we do not need to simulate an fs error here */
              done(sass.types.Error(e.message));
            }
          }
        });
      } else {
        done(accessViolation(filename));
      }
    },
    "eyeglass-fs-read-file($filename)": function($filename: SassValue, done: SassFunctionCallback) {
      if (!isSassString(sass, $filename)) {
        return done(typeError(sass, "string", $filename));
      }
      let filename = $filename.getValue();

      if (inSandbox(filename)) {
        fs.readFile(filename, function(err, contents) {
          /* istanbul ignore if - we do not need to simulate an fs error here */
          if (err) {
            done(sass.types.Error(err.message));
          } else {
            done(sass.types.String(contents.toString()));
          }
        });
      } else {
        done(accessViolation(filename));
      }
    }
  };
};

export default fsFunctions;