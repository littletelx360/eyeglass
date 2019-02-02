import * as path from "path";
import * as stringUtils from "./strings";
import { SassImplementation } from "./SassImplementation";

var stdSep = "/";
var rAllPathSep = /[\/\\]+/g;
var rIsRelative = /^\.{1,2}/;
var rUriFragments =  /^([^\?#]+)(\?[^#]*)?(#.*)?/;
var rSearchDelim = /^[\?\&]*/;

function convertSeparator(uri: string, sep: string): string {
  return shouldNormalizePathSep() ? uri.replace(rAllPathSep, sep) : uri;
}

function shouldNormalizePathSep(): boolean {
  // normalize if the path separator is a backslash or we haven't explicitly disabled normalization
  return path.sep === "\\" || process.env.EYEGLASS_NORMALIZE_PATHS !== "false";
}

/**
  * Provides an interface for working with URIs
  *
  * @constructor
  * @param    {String} uri - the original URI
  * @param    {String} sep - the target separator to use when representing the pathname
  */
export class URI {
  sep: "/" | "\\";
  path: string;
  search: string;
  hash: string;
  constructor(uri, sep = null) {
    this.sep = sep || stdSep;
    this.path = "";
    this.search = "";
    this.hash = ""

    var uriFragments = rUriFragments.exec(uri);
    this.setPath(uriFragments[1]);
    this.setQuery(uriFragments[2]);
    this.setHash(uriFragments[3]);
  }

  /**
    * sets the new pathname for the URI
    * @param    {String} pathname - the new pathname to set
    */
  setPath(pathname: string): void {
    // convert the path separator to standard system paths
    pathname = convertSeparator(pathname, path.sep);
    // then normalize the path
    pathname = path.normalize(pathname);
    // then set it using the specified path
    this.path = convertSeparator(pathname, this.sep);
  };

  /**
    * gets the pathname of the URI
    * @param sep - the separator to use to represent the pathname
    * @param relativeTo - if set, returns the pathname relative to this base path
    */
  getPath(sep?: string, relativeTo?: string): string {
    var pathname = this.path;
    if (relativeTo) {
      pathname = convertSeparator(pathname, path.sep);
      relativeTo = convertSeparator(relativeTo, path.sep);
      if (pathname.indexOf(relativeTo) === 0) {
        pathname = path.relative(relativeTo, pathname);
      }
    }
    return convertSeparator(pathname, sep || this.sep);
  };

  /**
    * adds a query string to the URI
    * @param    {String} search - the query string to append
    */
  addQuery(search: string): void {
    if (!search) {
      return;
    }
    // append the new search string
    // ensuring the leading character is the appropriate delimiter
    this.search += search.replace(rSearchDelim, this.search ? "&" : "?");
  };

  /**
    * replaces the query string on the URI
    * @param    {String} search - the query string to set
    */
  setQuery(search: string): void {
    // reset the search
    this.search = "";
    // then add the new one
    this.addQuery(search);
  };

  /**
    * replaces the hash string on the URI
    * @param    {String} hash - the hash string to set
    */
  setHash(hash: string) {
    this.hash = hash === undefined ? "" : hash;
  };

  /**
    * returns the URI as a string
    * @returns  {String} the full URI
    */
  toString(): string {
    return this.path + this.search + this.hash;
  };

  /**
    * given any number of path fragments, joins the non-empty fragments
    * @returns  {String} the joined fragments
    */
  static join(...fragments: string[]): string {
    // join all the non-empty paths
    var uri = new URI(fragments.filter((fragment) => {
      if (fragment) {
        return fragment;
      }
    }).join(stdSep));
    return uri.getPath();
  };

  /**
    * whether or not a given URI is relative
    * @param    {String} uri - the URI to check
    * @returns  {Boolean} whether or not the URI is relative like
    */
  static isRelative(uri: string): boolean {
    return rIsRelative.test(uri);
  };

  /**
    * normalizes the URI for use as a web URI
    * @param    {String} uri - the URI to normalize
    * @returns  {String} the normalized URI
    */
  static web(uri: string): string {
    return (new URI(uri)).toString();
  };

  /**
    * normalizes the URI for use as a system path
    * @param    {String} uri - the URI to normalize
    * @returns  {String} the normalized URI
    */
  static system(uri: string): string {
    return (new URI(uri)).getPath(path.sep);
  };

  /**
    * ensures that the URI is able to be cleanly exported to a SassString
    * @param    {String} uri - the URI to normalize
    * @returns  {String} the normalized URI
    */
  static sass(sassImpl: SassImplementation, uri: string) {
    // escape all backslashes for Sass string and quote it
    //  "C:\foo\bar.png" -> "C:\\foo\\bar.png"
    // actual backslash, for real this time http://www.xkcd.com/1638/
    return stringUtils.quoteJS(sassImpl, uri.replace(/\\/g, "\\\\"));
  };

  /**
    * decorates a URI to preserve special characters
    * @param    {String} uri - the URI to decorate
    * @returns  {String} the decorated URI
    */
  static preserve(uri: string): string {
    return uri.replace(/\\/g, "<BACKSLASH>");
  };

  /**
    * restores a URI to restore special characters (oposite of URI.preserve)
    * @param    {String} uri - the URI to restore
    * @returns  {String} the restored URI
    */
  static restore(uri: string): string {
    return uri.replace(/<BACKSLASH>/g, "\\");
  };
}
