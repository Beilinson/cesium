import defined from "../Core/defined.js";
import destroyObject from "../Core/destroyObject.js";
import ShaderProgram from "./ShaderProgram.js";
import ShaderSource from "./ShaderSource.js";

/**
 * @private
 */
function ShaderCache(context) {
  this._context = context;
  this._shaders = new Map();
  this._numberOfShaders = 0;
  this._shadersToRelease = new Map();
}

Object.defineProperties(ShaderCache.prototype, {
  numberOfShaders: {
    get: function () {
      return this._numberOfShaders;
    },
  },
});

/**
     * Returns a shader program from the cache, or creates and caches a new shader program,
     * given the GLSL vertex and fragment shader source and attribute locations.
     * <p>
     * The difference between this and {@link ShaderCache#getShaderProgram}, is this is used to
     * replace an existing reference to a shader program, which is passed as the first argument.
     * </p>
     *
     * @param {object} options Object with the following properties:
     * @param {ShaderProgram} [options.shaderProgram] The shader program that is being reassigned.
     * @param {string|ShaderSource} options.vertexShaderSource The GLSL source for the vertex shader.
     * @param {string|ShaderSource} options.fragmentShaderSource The GLSL source for the fragment shader.
     * @param {object} options.attributeLocations Indices for the attribute inputs to the vertex shader.

     * @returns {ShaderProgram} The cached or newly created shader program.
     *
     *
     * @example
     * this._shaderProgram = context.shaderCache.replaceShaderProgram({
     *     shaderProgram : this._shaderProgram,
     *     vertexShaderSource : vs,
     *     fragmentShaderSource : fs,
     *     attributeLocations : attributeLocations
     * });
     *
     * @see ShaderCache#getShaderProgram
     */
ShaderCache.prototype.replaceShaderProgram = function (options) {
  if (defined(options.shaderProgram)) {
    options.shaderProgram.destroy();
  }

  return this.getShaderProgram(options);
};

function toSortedJson(dictionary) {
  const sortedKeys = Object.keys(dictionary).sort();
  return JSON.stringify(dictionary, sortedKeys);
}

/**
 * Returns a shader program from the cache, or creates and caches a new shader program,
 * given the GLSL vertex and fragment shader source and attribute locations.
 *
 * @param {object} options Object with the following properties:
 * @param {string|ShaderSource} options.vertexShaderSource The GLSL source for the vertex shader.
 * @param {string|ShaderSource} options.fragmentShaderSource The GLSL source for the fragment shader.
 * @param {object} options.attributeLocations Indices for the attribute inputs to the vertex shader.
 *
 * @returns {ShaderProgram} The cached or newly created shader program.
 */
ShaderCache.prototype.getShaderProgram = function (options) {
  // convert shaders which are provided as strings into ShaderSource objects
  // because ShaderSource handles all the automatic including of built-in functions, etc.

  let vertexShaderSource = options.vertexShaderSource;
  let fragmentShaderSource = options.fragmentShaderSource;
  const attributeLocations = options.attributeLocations;

  if (typeof vertexShaderSource === "string") {
    vertexShaderSource = new ShaderSource({
      sources: [vertexShaderSource],
    });
  }

  if (typeof fragmentShaderSource === "string") {
    fragmentShaderSource = new ShaderSource({
      sources: [fragmentShaderSource],
    });
  }

  // Since ShaderSource.createCombinedXxxShader() can be expensive, use a
  // simpler key for caching. This way, the function does not have to be called
  // for each cache lookup.
  const vertexShaderKey = vertexShaderSource.getCacheKey();
  const fragmentShaderKey = fragmentShaderSource.getCacheKey();
  // Sort the keys in the JSON to ensure a consistent order
  const attributeLocationKey = defined(attributeLocations)
    ? toSortedJson(attributeLocations)
    : "";
  const keyword = `${vertexShaderKey}:${fragmentShaderKey}:${attributeLocationKey}`;

  let cachedShader;
  if (defined(this._shaders.get(keyword))) {
    cachedShader = this._shaders.get(keyword);

    // No longer want to release this if it was previously released.
    this._shadersToRelease.delete(keyword);
  } else {
    const context = this._context;

    const vertexShaderText =
      vertexShaderSource.createCombinedVertexShader(context);
    const fragmentShaderText =
      fragmentShaderSource.createCombinedFragmentShader(context);

    const shaderProgram = new ShaderProgram({
      gl: context._gl,
      logShaderCompilation: context.logShaderCompilation,
      debugShaders: context.debugShaders,
      vertexShaderSource: vertexShaderSource,
      vertexShaderText: vertexShaderText,
      fragmentShaderSource: fragmentShaderSource,
      fragmentShaderText: fragmentShaderText,
      attributeLocations: attributeLocations,
    });

    cachedShader = {
      cache: this,
      shaderProgram: shaderProgram,
      keyword: keyword,
      derivedKeywords: [],
      count: 0,
    };

    // A shader can't be in more than one cache.
    shaderProgram._cachedShader = cachedShader;
    this._shaders.set(keyword, cachedShader);
    ++this._numberOfShaders;
  }

  ++cachedShader.count;
  return cachedShader.shaderProgram;
};

ShaderCache.prototype.replaceDerivedShaderProgram = function (
  shaderProgram,
  keyword,
  options,
) {
  const cachedShader = shaderProgram._cachedShader;
  const derivedKeyword = keyword + cachedShader.keyword;
  const cachedDerivedShader = this._shaders.get(derivedKeyword);
  if (defined(cachedDerivedShader)) {
    destroyShader(this, cachedDerivedShader);
    const index = cachedShader.derivedKeywords.indexOf(keyword);
    if (index > -1) {
      cachedShader.derivedKeywords.splice(index, 1);
    }
  }

  return this.createDerivedShaderProgram(shaderProgram, keyword, options);
};

ShaderCache.prototype.getDerivedShaderProgram = function (
  shaderProgram,
  keyword,
) {
  const cachedShader = shaderProgram._cachedShader;
  const derivedKeyword = keyword + cachedShader.keyword;
  const cachedDerivedShader = this._shaders.get(derivedKeyword);
  if (!defined(cachedDerivedShader)) {
    return undefined;
  }

  return cachedDerivedShader.shaderProgram;
};

ShaderCache.prototype.createDerivedShaderProgram = function (
  shaderProgram,
  keyword,
  options,
) {
  const cachedShader = shaderProgram._cachedShader;
  const derivedKeyword = keyword + cachedShader.keyword;

  let vertexShaderSource = options.vertexShaderSource;
  let fragmentShaderSource = options.fragmentShaderSource;
  const attributeLocations = options.attributeLocations;

  if (typeof vertexShaderSource === "string") {
    vertexShaderSource = new ShaderSource({
      sources: [vertexShaderSource],
    });
  }

  if (typeof fragmentShaderSource === "string") {
    fragmentShaderSource = new ShaderSource({
      sources: [fragmentShaderSource],
    });
  }

  const context = this._context;

  const vertexShaderText =
    vertexShaderSource.createCombinedVertexShader(context);
  const fragmentShaderText =
    fragmentShaderSource.createCombinedFragmentShader(context);

  const derivedShaderProgram = new ShaderProgram({
    gl: context._gl,
    logShaderCompilation: context.logShaderCompilation,
    debugShaders: context.debugShaders,
    vertexShaderSource: vertexShaderSource,
    vertexShaderText: vertexShaderText,
    fragmentShaderSource: fragmentShaderSource,
    fragmentShaderText: fragmentShaderText,
    attributeLocations: attributeLocations,
  });

  const derivedCachedShader = {
    cache: this,
    shaderProgram: derivedShaderProgram,
    keyword: derivedKeyword,
    derivedKeywords: [],
    count: 0,
  };

  cachedShader.derivedKeywords.push(keyword);
  derivedShaderProgram._cachedShader = derivedCachedShader;
  this._shaders.set(derivedKeyword, derivedCachedShader);
  return derivedShaderProgram;
};

function destroyShader(cache, cachedShader) {
  const derivedKeywords = cachedShader.derivedKeywords;
  const length = derivedKeywords.length;
  for (let i = 0; i < length; ++i) {
    const keyword = derivedKeywords[i] + cachedShader.keyword;
    const derivedCachedShader = cache._shaders.get(keyword);
    destroyShader(cache, derivedCachedShader);
  }

  cache._shaders.delete(cachedShader.keyword);
  cachedShader.shaderProgram.finalDestroy();
}

ShaderCache.prototype.destroyReleasedShaderPrograms = function () {
  const shadersToRelease = this._shadersToRelease;

  for (const cachedShader of shadersToRelease.values()) {
    destroyShader(this, cachedShader);
    --this._numberOfShaders;
  }

  this._shadersToRelease.clear();
};

ShaderCache.prototype.releaseShaderProgram = function (shaderProgram) {
  if (defined(shaderProgram)) {
    const cachedShader = shaderProgram._cachedShader;
    if (cachedShader && --cachedShader.count === 0) {
      this._shadersToRelease.set(cachedShader.keyword, cachedShader);
    }
  }
};

ShaderCache.prototype.isDestroyed = function () {
  return false;
};

ShaderCache.prototype.destroy = function () {
  const shaders = this._shaders;
  for (const cachedShader of shaders.values()) {
    cachedShader.shaderProgram.finalDestroy();
  }
  return destroyObject(this);
};
export default ShaderCache;
