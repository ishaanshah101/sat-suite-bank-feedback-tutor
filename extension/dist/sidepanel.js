// extension/src/api.ts
var DEFAULT_SERVER = "https://rulecard.vercel.app";
var ApiError = class extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "ApiError";
  }
};
async function loadSettings() {
  const stored = await chrome.storage.local.get("settings");
  return { server: DEFAULT_SERVER, token: null, ...stored.settings ?? {} };
}
async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
}
function normalizeServer(input) {
  const trimmed = input.trim();
  if (!trimmed) return DEFAULT_SERVER;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return new URL(withScheme).origin;
}
async function request(settings, path2, init = {}) {
  const headers = { accept: "application/json" };
  if (init.body !== void 0) headers["content-type"] = "application/json";
  if (init.auth !== false && settings.token) headers.authorization = `Bearer ${settings.token}`;
  let response;
  try {
    response = await fetch(settings.server + path2, {
      method: init.method ?? (init.body !== void 0 ? "POST" : "GET"),
      headers,
      body: init.body !== void 0 ? JSON.stringify(init.body) : void 0
    });
  } catch {
    throw new ApiError(0, `Could not reach ${settings.server}. Check the server address and your connection.`);
  }
  const text2 = await response.text();
  let data = null;
  try {
    data = text2 ? JSON.parse(text2) : null;
  } catch {
    throw new ApiError(response.status, text2.slice(0, 200) || response.statusText);
  }
  if (!response.ok) throw new ApiError(response.status, data?.error ?? response.statusText, data?.code);
  return data;
}
async function authenticate(server, mode, email, password) {
  return request({ server, token: null }, mode === "signup" ? "/api/auth/signup" : "/api/auth/signin", { body: { email, password }, auth: false });
}
async function webLink(settings, path2) {
  const { code } = await request(settings, "/api/auth/handoff", { method: "POST", body: {} });
  return `${settings.server}/api/auth/handoff?code=${encodeURIComponent(code)}&next=${encodeURIComponent(path2)}`;
}
async function streamChat(settings, attemptId, history, onDelta) {
  const messages = history.map((m) => ({ id: m.id, role: m.role, parts: [{ type: "text", text: m.text }] }));
  let response;
  try {
    response = await fetch(settings.server + "/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${settings.token ?? ""}` },
      body: JSON.stringify({ attemptId, messages })
    });
  } catch {
    throw new ApiError(0, `Could not reach ${settings.server}.`);
  }
  if (!response.ok || !response.body) {
    const text2 = await response.text();
    let message = response.statusText;
    let code;
    try {
      const parsed = JSON.parse(text2);
      message = parsed.error ?? message;
      code = parsed.code;
    } catch {
      if (text2) message = text2.slice(0, 200);
    }
    throw new ApiError(response.status, message, code);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  for (; ; ) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let part;
      try {
        part = JSON.parse(payload);
      } catch {
        continue;
      }
      if (part.type === "text-delta" && typeof part.delta === "string") {
        full += part.delta;
        onDelta(part.delta);
      } else if (part.type === "error") {
        throw new ApiError(502, part.errorText ?? "The tutor hit an error mid-reply.");
      }
    }
  }
  return full;
}

// extension/src/image.ts
var MAX_LONG_EDGE = 1568;
var PNG_BUDGET_BYTES = 26e5;
async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 32768;
  for (let i2 = 0; i2 < bytes.length; i2 += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i2, i2 + chunk));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}
async function downscale(dataUrl, maxEdge = MAX_LONG_EDGE) {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas not available");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    let out = await canvas.convertToBlob({ type: "image/png" });
    if (out.size > PNG_BUDGET_BYTES) out = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
    return blobToDataUrl(out);
  } finally {
    bitmap.close();
  }
}

// node_modules/.pnpm/katex@0.16.22/node_modules/katex/dist/katex.mjs
var SourceLocation = class _SourceLocation {
  // The + prefix indicates that these fields aren't writeable
  // Lexer holding the input string.
  // Start offset, zero-based inclusive.
  // End offset, zero-based exclusive.
  constructor(lexer, start, end) {
    this.lexer = void 0;
    this.start = void 0;
    this.end = void 0;
    this.lexer = lexer;
    this.start = start;
    this.end = end;
  }
  /**
   * Merges two `SourceLocation`s from location providers, given they are
   * provided in order of appearance.
   * - Returns the first one's location if only the first is provided.
   * - Returns a merged range of the first and the last if both are provided
   *   and their lexers match.
   * - Otherwise, returns null.
   */
  static range(first, second) {
    if (!second) {
      return first && first.loc;
    } else if (!first || !first.loc || !second.loc || first.loc.lexer !== second.loc.lexer) {
      return null;
    } else {
      return new _SourceLocation(first.loc.lexer, first.loc.start, second.loc.end);
    }
  }
};
var Token = class _Token {
  // don't expand the token
  // used in \noexpand
  constructor(text2, loc) {
    this.text = void 0;
    this.loc = void 0;
    this.noexpand = void 0;
    this.treatAsRelax = void 0;
    this.text = text2;
    this.loc = loc;
  }
  /**
   * Given a pair of tokens (this and endToken), compute a `Token` encompassing
   * the whole input range enclosed by these two.
   */
  range(endToken, text2) {
    return new _Token(text2, SourceLocation.range(this, endToken));
  }
};
var ParseError = class _ParseError {
  // Error start position based on passed-in Token or ParseNode.
  // Length of affected text based on passed-in Token or ParseNode.
  // The underlying error message without any context added.
  constructor(message, token) {
    this.name = void 0;
    this.position = void 0;
    this.length = void 0;
    this.rawMessage = void 0;
    var error = "KaTeX parse error: " + message;
    var start;
    var end;
    var loc = token && token.loc;
    if (loc && loc.start <= loc.end) {
      var input = loc.lexer.input;
      start = loc.start;
      end = loc.end;
      if (start === input.length) {
        error += " at end of input: ";
      } else {
        error += " at position " + (start + 1) + ": ";
      }
      var underlined = input.slice(start, end).replace(/[^]/g, "$&\u0332");
      var left;
      if (start > 15) {
        left = "\u2026" + input.slice(start - 15, start);
      } else {
        left = input.slice(0, start);
      }
      var right;
      if (end + 15 < input.length) {
        right = input.slice(end, end + 15) + "\u2026";
      } else {
        right = input.slice(end);
      }
      error += left + underlined + right;
    }
    var self = new Error(error);
    self.name = "ParseError";
    self.__proto__ = _ParseError.prototype;
    self.position = start;
    if (start != null && end != null) {
      self.length = end - start;
    }
    self.rawMessage = message;
    return self;
  }
};
ParseError.prototype.__proto__ = Error.prototype;
var contains = function contains2(list2, elem) {
  return list2.indexOf(elem) !== -1;
};
var deflt = function deflt2(setting, defaultIfUndefined) {
  return setting === void 0 ? defaultIfUndefined : setting;
};
var uppercase = /([A-Z])/g;
var hyphenate = function hyphenate2(str) {
  return str.replace(uppercase, "-$1").toLowerCase();
};
var ESCAPE_LOOKUP = {
  "&": "&amp;",
  ">": "&gt;",
  "<": "&lt;",
  '"': "&quot;",
  "'": "&#x27;"
};
var ESCAPE_REGEX = /[&><"']/g;
function escape(text2) {
  return String(text2).replace(ESCAPE_REGEX, (match) => ESCAPE_LOOKUP[match]);
}
var getBaseElem = function getBaseElem2(group2) {
  if (group2.type === "ordgroup") {
    if (group2.body.length === 1) {
      return getBaseElem2(group2.body[0]);
    } else {
      return group2;
    }
  } else if (group2.type === "color") {
    if (group2.body.length === 1) {
      return getBaseElem2(group2.body[0]);
    } else {
      return group2;
    }
  } else if (group2.type === "font") {
    return getBaseElem2(group2.body);
  } else {
    return group2;
  }
};
var isCharacterBox = function isCharacterBox2(group2) {
  var baseElem = getBaseElem(group2);
  return baseElem.type === "mathord" || baseElem.type === "textord" || baseElem.type === "atom";
};
var assert = function assert2(value) {
  if (!value) {
    throw new Error("Expected non-null, but got " + String(value));
  }
  return value;
};
var protocolFromUrl = function protocolFromUrl2(url) {
  var protocol = /^[\x00-\x20]*([^\\/#?]*?)(:|&#0*58|&#x0*3a|&colon)/i.exec(url);
  if (!protocol) {
    return "_relative";
  }
  if (protocol[2] !== ":") {
    return null;
  }
  if (!/^[a-zA-Z][a-zA-Z0-9+\-.]*$/.test(protocol[1])) {
    return null;
  }
  return protocol[1].toLowerCase();
};
var utils = {
  contains,
  deflt,
  escape,
  hyphenate,
  getBaseElem,
  isCharacterBox,
  protocolFromUrl
};
var SETTINGS_SCHEMA = {
  displayMode: {
    type: "boolean",
    description: "Render math in display mode, which puts the math in display style (so \\int and \\sum are large, for example), and centers the math on the page on its own line.",
    cli: "-d, --display-mode"
  },
  output: {
    type: {
      enum: ["htmlAndMathml", "html", "mathml"]
    },
    description: "Determines the markup language of the output.",
    cli: "-F, --format <type>"
  },
  leqno: {
    type: "boolean",
    description: "Render display math in leqno style (left-justified tags)."
  },
  fleqn: {
    type: "boolean",
    description: "Render display math flush left."
  },
  throwOnError: {
    type: "boolean",
    default: true,
    cli: "-t, --no-throw-on-error",
    cliDescription: "Render errors (in the color given by --error-color) instead of throwing a ParseError exception when encountering an error."
  },
  errorColor: {
    type: "string",
    default: "#cc0000",
    cli: "-c, --error-color <color>",
    cliDescription: "A color string given in the format 'rgb' or 'rrggbb' (no #). This option determines the color of errors rendered by the -t option.",
    cliProcessor: (color) => "#" + color
  },
  macros: {
    type: "object",
    cli: "-m, --macro <def>",
    cliDescription: "Define custom macro of the form '\\foo:expansion' (use multiple -m arguments for multiple macros).",
    cliDefault: [],
    cliProcessor: (def, defs) => {
      defs.push(def);
      return defs;
    }
  },
  minRuleThickness: {
    type: "number",
    description: "Specifies a minimum thickness, in ems, for fraction lines, `\\sqrt` top lines, `{array}` vertical lines, `\\hline`, `\\hdashline`, `\\underline`, `\\overline`, and the borders of `\\fbox`, `\\boxed`, and `\\fcolorbox`.",
    processor: (t) => Math.max(0, t),
    cli: "--min-rule-thickness <size>",
    cliProcessor: parseFloat
  },
  colorIsTextColor: {
    type: "boolean",
    description: "Makes \\color behave like LaTeX's 2-argument \\textcolor, instead of LaTeX's one-argument \\color mode change.",
    cli: "-b, --color-is-text-color"
  },
  strict: {
    type: [{
      enum: ["warn", "ignore", "error"]
    }, "boolean", "function"],
    description: "Turn on strict / LaTeX faithfulness mode, which throws an error if the input uses features that are not supported by LaTeX.",
    cli: "-S, --strict",
    cliDefault: false
  },
  trust: {
    type: ["boolean", "function"],
    description: "Trust the input, enabling all HTML features such as \\url.",
    cli: "-T, --trust"
  },
  maxSize: {
    type: "number",
    default: Infinity,
    description: "If non-zero, all user-specified sizes, e.g. in \\rule{500em}{500em}, will be capped to maxSize ems. Otherwise, elements and spaces can be arbitrarily large",
    processor: (s) => Math.max(0, s),
    cli: "-s, --max-size <n>",
    cliProcessor: parseInt
  },
  maxExpand: {
    type: "number",
    default: 1e3,
    description: "Limit the number of macro expansions to the specified number, to prevent e.g. infinite macro loops. If set to Infinity, the macro expander will try to fully expand as in LaTeX.",
    processor: (n) => Math.max(0, n),
    cli: "-e, --max-expand <n>",
    cliProcessor: (n) => n === "Infinity" ? Infinity : parseInt(n)
  },
  globalGroup: {
    type: "boolean",
    cli: false
  }
};
function getDefaultValue(schema) {
  if (schema.default) {
    return schema.default;
  }
  var type = schema.type;
  var defaultType = Array.isArray(type) ? type[0] : type;
  if (typeof defaultType !== "string") {
    return defaultType.enum[0];
  }
  switch (defaultType) {
    case "boolean":
      return false;
    case "string":
      return "";
    case "number":
      return 0;
    case "object":
      return {};
  }
}
var Settings = class {
  constructor(options) {
    this.displayMode = void 0;
    this.output = void 0;
    this.leqno = void 0;
    this.fleqn = void 0;
    this.throwOnError = void 0;
    this.errorColor = void 0;
    this.macros = void 0;
    this.minRuleThickness = void 0;
    this.colorIsTextColor = void 0;
    this.strict = void 0;
    this.trust = void 0;
    this.maxSize = void 0;
    this.maxExpand = void 0;
    this.globalGroup = void 0;
    options = options || {};
    for (var prop in SETTINGS_SCHEMA) {
      if (SETTINGS_SCHEMA.hasOwnProperty(prop)) {
        var schema = SETTINGS_SCHEMA[prop];
        this[prop] = options[prop] !== void 0 ? schema.processor ? schema.processor(options[prop]) : options[prop] : getDefaultValue(schema);
      }
    }
  }
  /**
   * Report nonstrict (non-LaTeX-compatible) input.
   * Can safely not be called if `this.strict` is false in JavaScript.
   */
  reportNonstrict(errorCode, errorMsg, token) {
    var strict = this.strict;
    if (typeof strict === "function") {
      strict = strict(errorCode, errorMsg, token);
    }
    if (!strict || strict === "ignore") {
      return;
    } else if (strict === true || strict === "error") {
      throw new ParseError("LaTeX-incompatible input and strict mode is set to 'error': " + (errorMsg + " [" + errorCode + "]"), token);
    } else if (strict === "warn") {
      typeof console !== "undefined" && console.warn("LaTeX-incompatible input and strict mode is set to 'warn': " + (errorMsg + " [" + errorCode + "]"));
    } else {
      typeof console !== "undefined" && console.warn("LaTeX-incompatible input and strict mode is set to " + ("unrecognized '" + strict + "': " + errorMsg + " [" + errorCode + "]"));
    }
  }
  /**
   * Check whether to apply strict (LaTeX-adhering) behavior for unusual
   * input (like `\\`).  Unlike `nonstrict`, will not throw an error;
   * instead, "error" translates to a return value of `true`, while "ignore"
   * translates to a return value of `false`.  May still print a warning:
   * "warn" prints a warning and returns `false`.
   * This is for the second category of `errorCode`s listed in the README.
   */
  useStrictBehavior(errorCode, errorMsg, token) {
    var strict = this.strict;
    if (typeof strict === "function") {
      try {
        strict = strict(errorCode, errorMsg, token);
      } catch (error) {
        strict = "error";
      }
    }
    if (!strict || strict === "ignore") {
      return false;
    } else if (strict === true || strict === "error") {
      return true;
    } else if (strict === "warn") {
      typeof console !== "undefined" && console.warn("LaTeX-incompatible input and strict mode is set to 'warn': " + (errorMsg + " [" + errorCode + "]"));
      return false;
    } else {
      typeof console !== "undefined" && console.warn("LaTeX-incompatible input and strict mode is set to " + ("unrecognized '" + strict + "': " + errorMsg + " [" + errorCode + "]"));
      return false;
    }
  }
  /**
   * Check whether to test potentially dangerous input, and return
   * `true` (trusted) or `false` (untrusted).  The sole argument `context`
   * should be an object with `command` field specifying the relevant LaTeX
   * command (as a string starting with `\`), and any other arguments, etc.
   * If `context` has a `url` field, a `protocol` field will automatically
   * get added by this function (changing the specified object).
   */
  isTrusted(context) {
    if (context.url && !context.protocol) {
      var protocol = utils.protocolFromUrl(context.url);
      if (protocol == null) {
        return false;
      }
      context.protocol = protocol;
    }
    var trust = typeof this.trust === "function" ? this.trust(context) : this.trust;
    return Boolean(trust);
  }
};
var Style = class {
  constructor(id, size, cramped) {
    this.id = void 0;
    this.size = void 0;
    this.cramped = void 0;
    this.id = id;
    this.size = size;
    this.cramped = cramped;
  }
  /**
   * Get the style of a superscript given a base in the current style.
   */
  sup() {
    return styles[sup[this.id]];
  }
  /**
   * Get the style of a subscript given a base in the current style.
   */
  sub() {
    return styles[sub[this.id]];
  }
  /**
   * Get the style of a fraction numerator given the fraction in the current
   * style.
   */
  fracNum() {
    return styles[fracNum[this.id]];
  }
  /**
   * Get the style of a fraction denominator given the fraction in the current
   * style.
   */
  fracDen() {
    return styles[fracDen[this.id]];
  }
  /**
   * Get the cramped version of a style (in particular, cramping a cramped style
   * doesn't change the style).
   */
  cramp() {
    return styles[cramp[this.id]];
  }
  /**
   * Get a text or display version of this style.
   */
  text() {
    return styles[text$1[this.id]];
  }
  /**
   * Return true if this style is tightly spaced (scriptstyle/scriptscriptstyle)
   */
  isTight() {
    return this.size >= 2;
  }
};
var D = 0;
var Dc = 1;
var T = 2;
var Tc = 3;
var S = 4;
var Sc = 5;
var SS = 6;
var SSc = 7;
var styles = [new Style(D, 0, false), new Style(Dc, 0, true), new Style(T, 1, false), new Style(Tc, 1, true), new Style(S, 2, false), new Style(Sc, 2, true), new Style(SS, 3, false), new Style(SSc, 3, true)];
var sup = [S, Sc, S, Sc, SS, SSc, SS, SSc];
var sub = [Sc, Sc, Sc, Sc, SSc, SSc, SSc, SSc];
var fracNum = [T, Tc, S, Sc, SS, SSc, SS, SSc];
var fracDen = [Tc, Tc, Sc, Sc, SSc, SSc, SSc, SSc];
var cramp = [Dc, Dc, Tc, Tc, Sc, Sc, SSc, SSc];
var text$1 = [D, Dc, T, Tc, T, Tc, T, Tc];
var Style$1 = {
  DISPLAY: styles[D],
  TEXT: styles[T],
  SCRIPT: styles[S],
  SCRIPTSCRIPT: styles[SS]
};
var scriptData = [{
  // Latin characters beyond the Latin-1 characters we have metrics for.
  // Needed for Czech, Hungarian and Turkish text, for example.
  name: "latin",
  blocks: [
    [256, 591],
    // Latin Extended-A and Latin Extended-B
    [768, 879]
    // Combining Diacritical marks
  ]
}, {
  // The Cyrillic script used by Russian and related languages.
  // A Cyrillic subset used to be supported as explicitly defined
  // symbols in symbols.js
  name: "cyrillic",
  blocks: [[1024, 1279]]
}, {
  // Armenian
  name: "armenian",
  blocks: [[1328, 1423]]
}, {
  // The Brahmic scripts of South and Southeast Asia
  // Devanagari (0900–097F)
  // Bengali (0980–09FF)
  // Gurmukhi (0A00–0A7F)
  // Gujarati (0A80–0AFF)
  // Oriya (0B00–0B7F)
  // Tamil (0B80–0BFF)
  // Telugu (0C00–0C7F)
  // Kannada (0C80–0CFF)
  // Malayalam (0D00–0D7F)
  // Sinhala (0D80–0DFF)
  // Thai (0E00–0E7F)
  // Lao (0E80–0EFF)
  // Tibetan (0F00–0FFF)
  // Myanmar (1000–109F)
  name: "brahmic",
  blocks: [[2304, 4255]]
}, {
  name: "georgian",
  blocks: [[4256, 4351]]
}, {
  // Chinese and Japanese.
  // The "k" in cjk is for Korean, but we've separated Korean out
  name: "cjk",
  blocks: [
    [12288, 12543],
    // CJK symbols and punctuation, Hiragana, Katakana
    [19968, 40879],
    // CJK ideograms
    [65280, 65376]
    // Fullwidth punctuation
    // TODO: add halfwidth Katakana and Romanji glyphs
  ]
}, {
  // Korean
  name: "hangul",
  blocks: [[44032, 55215]]
}];
function scriptFromCodepoint(codepoint) {
  for (var i2 = 0; i2 < scriptData.length; i2++) {
    var script = scriptData[i2];
    for (var _i6 = 0; _i6 < script.blocks.length; _i6++) {
      var block = script.blocks[_i6];
      if (codepoint >= block[0] && codepoint <= block[1]) {
        return script.name;
      }
    }
  }
  return null;
}
var allBlocks = [];
scriptData.forEach((s) => s.blocks.forEach((b) => allBlocks.push(...b)));
function supportedCodepoint(codepoint) {
  for (var i2 = 0; i2 < allBlocks.length; i2 += 2) {
    if (codepoint >= allBlocks[i2] && codepoint <= allBlocks[i2 + 1]) {
      return true;
    }
  }
  return false;
}
var hLinePad = 80;
var sqrtMain = function sqrtMain2(extraVinculum, hLinePad2) {
  return "M95," + (622 + extraVinculum + hLinePad2) + "\nc-2.7,0,-7.17,-2.7,-13.5,-8c-5.8,-5.3,-9.5,-10,-9.5,-14\nc0,-2,0.3,-3.3,1,-4c1.3,-2.7,23.83,-20.7,67.5,-54\nc44.2,-33.3,65.8,-50.3,66.5,-51c1.3,-1.3,3,-2,5,-2c4.7,0,8.7,3.3,12,10\ns173,378,173,378c0.7,0,35.3,-71,104,-213c68.7,-142,137.5,-285,206.5,-429\nc69,-144,104.5,-217.7,106.5,-221\nl" + extraVinculum / 2.075 + " -" + extraVinculum + "\nc5.3,-9.3,12,-14,20,-14\nH400000v" + (40 + extraVinculum) + "H845.2724\ns-225.272,467,-225.272,467s-235,486,-235,486c-2.7,4.7,-9,7,-19,7\nc-6,0,-10,-1,-12,-3s-194,-422,-194,-422s-65,47,-65,47z\nM" + (834 + extraVinculum) + " " + hLinePad2 + "h400000v" + (40 + extraVinculum) + "h-400000z";
};
var sqrtSize1 = function sqrtSize12(extraVinculum, hLinePad2) {
  return "M263," + (601 + extraVinculum + hLinePad2) + "c0.7,0,18,39.7,52,119\nc34,79.3,68.167,158.7,102.5,238c34.3,79.3,51.8,119.3,52.5,120\nc340,-704.7,510.7,-1060.3,512,-1067\nl" + extraVinculum / 2.084 + " -" + extraVinculum + "\nc4.7,-7.3,11,-11,19,-11\nH40000v" + (40 + extraVinculum) + "H1012.3\ns-271.3,567,-271.3,567c-38.7,80.7,-84,175,-136,283c-52,108,-89.167,185.3,-111.5,232\nc-22.3,46.7,-33.8,70.3,-34.5,71c-4.7,4.7,-12.3,7,-23,7s-12,-1,-12,-1\ns-109,-253,-109,-253c-72.7,-168,-109.3,-252,-110,-252c-10.7,8,-22,16.7,-34,26\nc-22,17.3,-33.3,26,-34,26s-26,-26,-26,-26s76,-59,76,-59s76,-60,76,-60z\nM" + (1001 + extraVinculum) + " " + hLinePad2 + "h400000v" + (40 + extraVinculum) + "h-400000z";
};
var sqrtSize2 = function sqrtSize22(extraVinculum, hLinePad2) {
  return "M983 " + (10 + extraVinculum + hLinePad2) + "\nl" + extraVinculum / 3.13 + " -" + extraVinculum + "\nc4,-6.7,10,-10,18,-10 H400000v" + (40 + extraVinculum) + "\nH1013.1s-83.4,268,-264.1,840c-180.7,572,-277,876.3,-289,913c-4.7,4.7,-12.7,7,-24,7\ns-12,0,-12,0c-1.3,-3.3,-3.7,-11.7,-7,-25c-35.3,-125.3,-106.7,-373.3,-214,-744\nc-10,12,-21,25,-33,39s-32,39,-32,39c-6,-5.3,-15,-14,-27,-26s25,-30,25,-30\nc26.7,-32.7,52,-63,76,-91s52,-60,52,-60s208,722,208,722\nc56,-175.3,126.3,-397.3,211,-666c84.7,-268.7,153.8,-488.2,207.5,-658.5\nc53.7,-170.3,84.5,-266.8,92.5,-289.5z\nM" + (1001 + extraVinculum) + " " + hLinePad2 + "h400000v" + (40 + extraVinculum) + "h-400000z";
};
var sqrtSize3 = function sqrtSize32(extraVinculum, hLinePad2) {
  return "M424," + (2398 + extraVinculum + hLinePad2) + "\nc-1.3,-0.7,-38.5,-172,-111.5,-514c-73,-342,-109.8,-513.3,-110.5,-514\nc0,-2,-10.7,14.3,-32,49c-4.7,7.3,-9.8,15.7,-15.5,25c-5.7,9.3,-9.8,16,-12.5,20\ns-5,7,-5,7c-4,-3.3,-8.3,-7.7,-13,-13s-13,-13,-13,-13s76,-122,76,-122s77,-121,77,-121\ns209,968,209,968c0,-2,84.7,-361.7,254,-1079c169.3,-717.3,254.7,-1077.7,256,-1081\nl" + extraVinculum / 4.223 + " -" + extraVinculum + "c4,-6.7,10,-10,18,-10 H400000\nv" + (40 + extraVinculum) + "H1014.6\ns-87.3,378.7,-272.6,1166c-185.3,787.3,-279.3,1182.3,-282,1185\nc-2,6,-10,9,-24,9\nc-8,0,-12,-0.7,-12,-2z M" + (1001 + extraVinculum) + " " + hLinePad2 + "\nh400000v" + (40 + extraVinculum) + "h-400000z";
};
var sqrtSize4 = function sqrtSize42(extraVinculum, hLinePad2) {
  return "M473," + (2713 + extraVinculum + hLinePad2) + "\nc339.3,-1799.3,509.3,-2700,510,-2702 l" + extraVinculum / 5.298 + " -" + extraVinculum + "\nc3.3,-7.3,9.3,-11,18,-11 H400000v" + (40 + extraVinculum) + "H1017.7\ns-90.5,478,-276.2,1466c-185.7,988,-279.5,1483,-281.5,1485c-2,6,-10,9,-24,9\nc-8,0,-12,-0.7,-12,-2c0,-1.3,-5.3,-32,-16,-92c-50.7,-293.3,-119.7,-693.3,-207,-1200\nc0,-1.3,-5.3,8.7,-16,30c-10.7,21.3,-21.3,42.7,-32,64s-16,33,-16,33s-26,-26,-26,-26\ns76,-153,76,-153s77,-151,77,-151c0.7,0.7,35.7,202,105,604c67.3,400.7,102,602.7,104,\n606zM" + (1001 + extraVinculum) + " " + hLinePad2 + "h400000v" + (40 + extraVinculum) + "H1017.7z";
};
var phasePath = function phasePath2(y) {
  var x = y / 2;
  return "M400000 " + y + " H0 L" + x + " 0 l65 45 L145 " + (y - 80) + " H400000z";
};
var sqrtTall = function sqrtTall2(extraVinculum, hLinePad2, viewBoxHeight) {
  var vertSegment = viewBoxHeight - 54 - hLinePad2 - extraVinculum;
  return "M702 " + (extraVinculum + hLinePad2) + "H400000" + (40 + extraVinculum) + "\nH742v" + vertSegment + "l-4 4-4 4c-.667.7 -2 1.5-4 2.5s-4.167 1.833-6.5 2.5-5.5 1-9.5 1\nh-12l-28-84c-16.667-52-96.667 -294.333-240-727l-212 -643 -85 170\nc-4-3.333-8.333-7.667-13 -13l-13-13l77-155 77-156c66 199.333 139 419.667\n219 661 l218 661zM702 " + hLinePad2 + "H400000v" + (40 + extraVinculum) + "H742z";
};
var sqrtPath = function sqrtPath2(size, extraVinculum, viewBoxHeight) {
  extraVinculum = 1e3 * extraVinculum;
  var path2 = "";
  switch (size) {
    case "sqrtMain":
      path2 = sqrtMain(extraVinculum, hLinePad);
      break;
    case "sqrtSize1":
      path2 = sqrtSize1(extraVinculum, hLinePad);
      break;
    case "sqrtSize2":
      path2 = sqrtSize2(extraVinculum, hLinePad);
      break;
    case "sqrtSize3":
      path2 = sqrtSize3(extraVinculum, hLinePad);
      break;
    case "sqrtSize4":
      path2 = sqrtSize4(extraVinculum, hLinePad);
      break;
    case "sqrtTall":
      path2 = sqrtTall(extraVinculum, hLinePad, viewBoxHeight);
  }
  return path2;
};
var innerPath = function innerPath2(name, height) {
  switch (name) {
    case "\u239C":
      return "M291 0 H417 V" + height + " H291z M291 0 H417 V" + height + " H291z";
    case "\u2223":
      return "M145 0 H188 V" + height + " H145z M145 0 H188 V" + height + " H145z";
    case "\u2225":
      return "M145 0 H188 V" + height + " H145z M145 0 H188 V" + height + " H145z" + ("M367 0 H410 V" + height + " H367z M367 0 H410 V" + height + " H367z");
    case "\u239F":
      return "M457 0 H583 V" + height + " H457z M457 0 H583 V" + height + " H457z";
    case "\u23A2":
      return "M319 0 H403 V" + height + " H319z M319 0 H403 V" + height + " H319z";
    case "\u23A5":
      return "M263 0 H347 V" + height + " H263z M263 0 H347 V" + height + " H263z";
    case "\u23AA":
      return "M384 0 H504 V" + height + " H384z M384 0 H504 V" + height + " H384z";
    case "\u23D0":
      return "M312 0 H355 V" + height + " H312z M312 0 H355 V" + height + " H312z";
    case "\u2016":
      return "M257 0 H300 V" + height + " H257z M257 0 H300 V" + height + " H257z" + ("M478 0 H521 V" + height + " H478z M478 0 H521 V" + height + " H478z");
    default:
      return "";
  }
};
var path = {
  // The doubleleftarrow geometry is from glyph U+21D0 in the font KaTeX Main
  doubleleftarrow: "M262 157\nl10-10c34-36 62.7-77 86-123 3.3-8 5-13.3 5-16 0-5.3-6.7-8-20-8-7.3\n 0-12.2.5-14.5 1.5-2.3 1-4.8 4.5-7.5 10.5-49.3 97.3-121.7 169.3-217 216-28\n 14-57.3 25-88 33-6.7 2-11 3.8-13 5.5-2 1.7-3 4.2-3 7.5s1 5.8 3 7.5\nc2 1.7 6.3 3.5 13 5.5 68 17.3 128.2 47.8 180.5 91.5 52.3 43.7 93.8 96.2 124.5\n 157.5 9.3 8 15.3 12.3 18 13h6c12-.7 18-4 18-10 0-2-1.7-7-5-15-23.3-46-52-87\n-86-123l-10-10h399738v-40H218c328 0 0 0 0 0l-10-8c-26.7-20-65.7-43-117-69 2.7\n-2 6-3.7 10-5 36.7-16 72.3-37.3 107-64l10-8h399782v-40z\nm8 0v40h399730v-40zm0 194v40h399730v-40z",
  // doublerightarrow is from glyph U+21D2 in font KaTeX Main
  doublerightarrow: "M399738 392l\n-10 10c-34 36-62.7 77-86 123-3.3 8-5 13.3-5 16 0 5.3 6.7 8 20 8 7.3 0 12.2-.5\n 14.5-1.5 2.3-1 4.8-4.5 7.5-10.5 49.3-97.3 121.7-169.3 217-216 28-14 57.3-25 88\n-33 6.7-2 11-3.8 13-5.5 2-1.7 3-4.2 3-7.5s-1-5.8-3-7.5c-2-1.7-6.3-3.5-13-5.5-68\n-17.3-128.2-47.8-180.5-91.5-52.3-43.7-93.8-96.2-124.5-157.5-9.3-8-15.3-12.3-18\n-13h-6c-12 .7-18 4-18 10 0 2 1.7 7 5 15 23.3 46 52 87 86 123l10 10H0v40h399782\nc-328 0 0 0 0 0l10 8c26.7 20 65.7 43 117 69-2.7 2-6 3.7-10 5-36.7 16-72.3 37.3\n-107 64l-10 8H0v40zM0 157v40h399730v-40zm0 194v40h399730v-40z",
  // leftarrow is from glyph U+2190 in font KaTeX Main
  leftarrow: "M400000 241H110l3-3c68.7-52.7 113.7-120\n 135-202 4-14.7 6-23 6-25 0-7.3-7-11-21-11-8 0-13.2.8-15.5 2.5-2.3 1.7-4.2 5.8\n-5.5 12.5-1.3 4.7-2.7 10.3-4 17-12 48.7-34.8 92-68.5 130S65.3 228.3 18 247\nc-10 4-16 7.7-18 11 0 8.7 6 14.3 18 17 47.3 18.7 87.8 47 121.5 85S196 441.3 208\n 490c.7 2 1.3 5 2 9s1.2 6.7 1.5 8c.3 1.3 1 3.3 2 6s2.2 4.5 3.5 5.5c1.3 1 3.3\n 1.8 6 2.5s6 1 10 1c14 0 21-3.7 21-11 0-2-2-10.3-6-25-20-79.3-65-146.7-135-202\n l-3-3h399890zM100 241v40h399900v-40z",
  // overbrace is from glyphs U+23A9/23A8/23A7 in font KaTeX_Size4-Regular
  leftbrace: "M6 548l-6-6v-35l6-11c56-104 135.3-181.3 238-232 57.3-28.7 117\n-45 179-50h399577v120H403c-43.3 7-81 15-113 26-100.7 33-179.7 91-237 174-2.7\n 5-6 9-10 13-.7 1-7.3 1-20 1H6z",
  leftbraceunder: "M0 6l6-6h17c12.688 0 19.313.3 20 1 4 4 7.313 8.3 10 13\n 35.313 51.3 80.813 93.8 136.5 127.5 55.688 33.7 117.188 55.8 184.5 66.5.688\n 0 2 .3 4 1 18.688 2.7 76 4.3 172 5h399450v120H429l-6-1c-124.688-8-235-61.7\n-331-161C60.687 138.7 32.312 99.3 7 54L0 41V6z",
  // overgroup is from the MnSymbol package (public domain)
  leftgroup: "M400000 80\nH435C64 80 168.3 229.4 21 260c-5.9 1.2-18 0-18 0-2 0-3-1-3-3v-38C76 61 257 0\n 435 0h399565z",
  leftgroupunder: "M400000 262\nH435C64 262 168.3 112.6 21 82c-5.9-1.2-18 0-18 0-2 0-3 1-3 3v38c76 158 257 219\n 435 219h399565z",
  // Harpoons are from glyph U+21BD in font KaTeX Main
  leftharpoon: "M0 267c.7 5.3 3 10 7 14h399993v-40H93c3.3\n-3.3 10.2-9.5 20.5-18.5s17.8-15.8 22.5-20.5c50.7-52 88-110.3 112-175 4-11.3 5\n-18.3 3-21-1.3-4-7.3-6-18-6-8 0-13 .7-15 2s-4.7 6.7-8 16c-42 98.7-107.3 174.7\n-196 228-6.7 4.7-10.7 8-12 10-1.3 2-2 5.7-2 11zm100-26v40h399900v-40z",
  leftharpoonplus: "M0 267c.7 5.3 3 10 7 14h399993v-40H93c3.3-3.3 10.2-9.5\n 20.5-18.5s17.8-15.8 22.5-20.5c50.7-52 88-110.3 112-175 4-11.3 5-18.3 3-21-1.3\n-4-7.3-6-18-6-8 0-13 .7-15 2s-4.7 6.7-8 16c-42 98.7-107.3 174.7-196 228-6.7 4.7\n-10.7 8-12 10-1.3 2-2 5.7-2 11zm100-26v40h399900v-40zM0 435v40h400000v-40z\nm0 0v40h400000v-40z",
  leftharpoondown: "M7 241c-4 4-6.333 8.667-7 14 0 5.333.667 9 2 11s5.333\n 5.333 12 10c90.667 54 156 130 196 228 3.333 10.667 6.333 16.333 9 17 2 .667 5\n 1 9 1h5c10.667 0 16.667-2 18-6 2-2.667 1-9.667-3-21-32-87.333-82.667-157.667\n-152-211l-3-3h399907v-40zM93 281 H400000 v-40L7 241z",
  leftharpoondownplus: "M7 435c-4 4-6.3 8.7-7 14 0 5.3.7 9 2 11s5.3 5.3 12\n 10c90.7 54 156 130 196 228 3.3 10.7 6.3 16.3 9 17 2 .7 5 1 9 1h5c10.7 0 16.7\n-2 18-6 2-2.7 1-9.7-3-21-32-87.3-82.7-157.7-152-211l-3-3h399907v-40H7zm93 0\nv40h399900v-40zM0 241v40h399900v-40zm0 0v40h399900v-40z",
  // hook is from glyph U+21A9 in font KaTeX Main
  lefthook: "M400000 281 H103s-33-11.2-61-33.5S0 197.3 0 164s14.2-61.2 42.5\n-83.5C70.8 58.2 104 47 142 47 c16.7 0 25 6.7 25 20 0 12-8.7 18.7-26 20-40 3.3\n-68.7 15.7-86 37-10 12-15 25.3-15 40 0 22.7 9.8 40.7 29.5 54 19.7 13.3 43.5 21\n 71.5 23h399859zM103 281v-40h399897v40z",
  leftlinesegment: "M40 281 V428 H0 V94 H40 V241 H400000 v40z\nM40 281 V428 H0 V94 H40 V241 H400000 v40z",
  leftmapsto: "M40 281 V448H0V74H40V241H400000v40z\nM40 281 V448H0V74H40V241H400000v40z",
  // tofrom is from glyph U+21C4 in font KaTeX AMS Regular
  leftToFrom: "M0 147h400000v40H0zm0 214c68 40 115.7 95.7 143 167h22c15.3 0 23\n-.3 23-1 0-1.3-5.3-13.7-16-37-18-35.3-41.3-69-70-101l-7-8h399905v-40H95l7-8\nc28.7-32 52-65.7 70-101 10.7-23.3 16-35.7 16-37 0-.7-7.7-1-23-1h-22C115.7 265.3\n 68 321 0 361zm0-174v-40h399900v40zm100 154v40h399900v-40z",
  longequal: "M0 50 h400000 v40H0z m0 194h40000v40H0z\nM0 50 h400000 v40H0z m0 194h40000v40H0z",
  midbrace: "M200428 334\nc-100.7-8.3-195.3-44-280-108-55.3-42-101.7-93-139-153l-9-14c-2.7 4-5.7 8.7-9 14\n-53.3 86.7-123.7 153-211 199-66.7 36-137.3 56.3-212 62H0V214h199568c178.3-11.7\n 311.7-78.3 403-201 6-8 9.7-12 11-12 .7-.7 6.7-1 18-1s17.3.3 18 1c1.3 0 5 4 11\n 12 44.7 59.3 101.3 106.3 170 141s145.3 54.3 229 60h199572v120z",
  midbraceunder: "M199572 214\nc100.7 8.3 195.3 44 280 108 55.3 42 101.7 93 139 153l9 14c2.7-4 5.7-8.7 9-14\n 53.3-86.7 123.7-153 211-199 66.7-36 137.3-56.3 212-62h199568v120H200432c-178.3\n 11.7-311.7 78.3-403 201-6 8-9.7 12-11 12-.7.7-6.7 1-18 1s-17.3-.3-18-1c-1.3 0\n-5-4-11-12-44.7-59.3-101.3-106.3-170-141s-145.3-54.3-229-60H0V214z",
  oiintSize1: "M512.6 71.6c272.6 0 320.3 106.8 320.3 178.2 0 70.8-47.7 177.6\n-320.3 177.6S193.1 320.6 193.1 249.8c0-71.4 46.9-178.2 319.5-178.2z\nm368.1 178.2c0-86.4-60.9-215.4-368.1-215.4-306.4 0-367.3 129-367.3 215.4 0 85.8\n60.9 214.8 367.3 214.8 307.2 0 368.1-129 368.1-214.8z",
  oiintSize2: "M757.8 100.1c384.7 0 451.1 137.6 451.1 230 0 91.3-66.4 228.8\n-451.1 228.8-386.3 0-452.7-137.5-452.7-228.8 0-92.4 66.4-230 452.7-230z\nm502.4 230c0-111.2-82.4-277.2-502.4-277.2s-504 166-504 277.2\nc0 110 84 276 504 276s502.4-166 502.4-276z",
  oiiintSize1: "M681.4 71.6c408.9 0 480.5 106.8 480.5 178.2 0 70.8-71.6 177.6\n-480.5 177.6S202.1 320.6 202.1 249.8c0-71.4 70.5-178.2 479.3-178.2z\nm525.8 178.2c0-86.4-86.8-215.4-525.7-215.4-437.9 0-524.7 129-524.7 215.4 0\n85.8 86.8 214.8 524.7 214.8 438.9 0 525.7-129 525.7-214.8z",
  oiiintSize2: "M1021.2 53c603.6 0 707.8 165.8 707.8 277.2 0 110-104.2 275.8\n-707.8 275.8-606 0-710.2-165.8-710.2-275.8C311 218.8 415.2 53 1021.2 53z\nm770.4 277.1c0-131.2-126.4-327.6-770.5-327.6S248.4 198.9 248.4 330.1\nc0 130 128.8 326.4 772.7 326.4s770.5-196.4 770.5-326.4z",
  rightarrow: "M0 241v40h399891c-47.3 35.3-84 78-110 128\n-16.7 32-27.7 63.7-33 95 0 1.3-.2 2.7-.5 4-.3 1.3-.5 2.3-.5 3 0 7.3 6.7 11 20\n 11 8 0 13.2-.8 15.5-2.5 2.3-1.7 4.2-5.5 5.5-11.5 2-13.3 5.7-27 11-41 14.7-44.7\n 39-84.5 73-119.5s73.7-60.2 119-75.5c6-2 9-5.7 9-11s-3-9-9-11c-45.3-15.3-85\n-40.5-119-75.5s-58.3-74.8-73-119.5c-4.7-14-8.3-27.3-11-40-1.3-6.7-3.2-10.8-5.5\n-12.5-2.3-1.7-7.5-2.5-15.5-2.5-14 0-21 3.7-21 11 0 2 2 10.3 6 25 20.7 83.3 67\n 151.7 139 205zm0 0v40h399900v-40z",
  rightbrace: "M400000 542l\n-6 6h-17c-12.7 0-19.3-.3-20-1-4-4-7.3-8.3-10-13-35.3-51.3-80.8-93.8-136.5-127.5\ns-117.2-55.8-184.5-66.5c-.7 0-2-.3-4-1-18.7-2.7-76-4.3-172-5H0V214h399571l6 1\nc124.7 8 235 61.7 331 161 31.3 33.3 59.7 72.7 85 118l7 13v35z",
  rightbraceunder: "M399994 0l6 6v35l-6 11c-56 104-135.3 181.3-238 232-57.3\n 28.7-117 45-179 50H-300V214h399897c43.3-7 81-15 113-26 100.7-33 179.7-91 237\n-174 2.7-5 6-9 10-13 .7-1 7.3-1 20-1h17z",
  rightgroup: "M0 80h399565c371 0 266.7 149.4 414 180 5.9 1.2 18 0 18 0 2 0\n 3-1 3-3v-38c-76-158-257-219-435-219H0z",
  rightgroupunder: "M0 262h399565c371 0 266.7-149.4 414-180 5.9-1.2 18 0 18\n 0 2 0 3 1 3 3v38c-76 158-257 219-435 219H0z",
  rightharpoon: "M0 241v40h399993c4.7-4.7 7-9.3 7-14 0-9.3\n-3.7-15.3-11-18-92.7-56.7-159-133.7-199-231-3.3-9.3-6-14.7-8-16-2-1.3-7-2-15-2\n-10.7 0-16.7 2-18 6-2 2.7-1 9.7 3 21 15.3 42 36.7 81.8 64 119.5 27.3 37.7 58\n 69.2 92 94.5zm0 0v40h399900v-40z",
  rightharpoonplus: "M0 241v40h399993c4.7-4.7 7-9.3 7-14 0-9.3-3.7-15.3-11\n-18-92.7-56.7-159-133.7-199-231-3.3-9.3-6-14.7-8-16-2-1.3-7-2-15-2-10.7 0-16.7\n 2-18 6-2 2.7-1 9.7 3 21 15.3 42 36.7 81.8 64 119.5 27.3 37.7 58 69.2 92 94.5z\nm0 0v40h399900v-40z m100 194v40h399900v-40zm0 0v40h399900v-40z",
  rightharpoondown: "M399747 511c0 7.3 6.7 11 20 11 8 0 13-.8 15-2.5s4.7-6.8\n 8-15.5c40-94 99.3-166.3 178-217 13.3-8 20.3-12.3 21-13 5.3-3.3 8.5-5.8 9.5\n-7.5 1-1.7 1.5-5.2 1.5-10.5s-2.3-10.3-7-15H0v40h399908c-34 25.3-64.7 57-92 95\n-27.3 38-48.7 77.7-64 119-3.3 8.7-5 14-5 16zM0 241v40h399900v-40z",
  rightharpoondownplus: "M399747 705c0 7.3 6.7 11 20 11 8 0 13-.8\n 15-2.5s4.7-6.8 8-15.5c40-94 99.3-166.3 178-217 13.3-8 20.3-12.3 21-13 5.3-3.3\n 8.5-5.8 9.5-7.5 1-1.7 1.5-5.2 1.5-10.5s-2.3-10.3-7-15H0v40h399908c-34 25.3\n-64.7 57-92 95-27.3 38-48.7 77.7-64 119-3.3 8.7-5 14-5 16zM0 435v40h399900v-40z\nm0-194v40h400000v-40zm0 0v40h400000v-40z",
  righthook: "M399859 241c-764 0 0 0 0 0 40-3.3 68.7-15.7 86-37 10-12 15-25.3\n 15-40 0-22.7-9.8-40.7-29.5-54-19.7-13.3-43.5-21-71.5-23-17.3-1.3-26-8-26-20 0\n-13.3 8.7-20 26-20 38 0 71 11.2 99 33.5 0 0 7 5.6 21 16.7 14 11.2 21 33.5 21\n 66.8s-14 61.2-42 83.5c-28 22.3-61 33.5-99 33.5L0 241z M0 281v-40h399859v40z",
  rightlinesegment: "M399960 241 V94 h40 V428 h-40 V281 H0 v-40z\nM399960 241 V94 h40 V428 h-40 V281 H0 v-40z",
  rightToFrom: "M400000 167c-70.7-42-118-97.7-142-167h-23c-15.3 0-23 .3-23\n 1 0 1.3 5.3 13.7 16 37 18 35.3 41.3 69 70 101l7 8H0v40h399905l-7 8c-28.7 32\n-52 65.7-70 101-10.7 23.3-16 35.7-16 37 0 .7 7.7 1 23 1h23c24-69.3 71.3-125 142\n-167z M100 147v40h399900v-40zM0 341v40h399900v-40z",
  // twoheadleftarrow is from glyph U+219E in font KaTeX AMS Regular
  twoheadleftarrow: "M0 167c68 40\n 115.7 95.7 143 167h22c15.3 0 23-.3 23-1 0-1.3-5.3-13.7-16-37-18-35.3-41.3-69\n-70-101l-7-8h125l9 7c50.7 39.3 85 86 103 140h46c0-4.7-6.3-18.7-19-42-18-35.3\n-40-67.3-66-96l-9-9h399716v-40H284l9-9c26-28.7 48-60.7 66-96 12.7-23.333 19\n-37.333 19-42h-46c-18 54-52.3 100.7-103 140l-9 7H95l7-8c28.7-32 52-65.7 70-101\n 10.7-23.333 16-35.7 16-37 0-.7-7.7-1-23-1h-22C115.7 71.3 68 127 0 167z",
  twoheadrightarrow: "M400000 167\nc-68-40-115.7-95.7-143-167h-22c-15.3 0-23 .3-23 1 0 1.3 5.3 13.7 16 37 18 35.3\n 41.3 69 70 101l7 8h-125l-9-7c-50.7-39.3-85-86-103-140h-46c0 4.7 6.3 18.7 19 42\n 18 35.3 40 67.3 66 96l9 9H0v40h399716l-9 9c-26 28.7-48 60.7-66 96-12.7 23.333\n-19 37.333-19 42h46c18-54 52.3-100.7 103-140l9-7h125l-7 8c-28.7 32-52 65.7-70\n 101-10.7 23.333-16 35.7-16 37 0 .7 7.7 1 23 1h22c27.3-71.3 75-127 143-167z",
  // tilde1 is a modified version of a glyph from the MnSymbol package
  tilde1: "M200 55.538c-77 0-168 73.953-177 73.953-3 0-7\n-2.175-9-5.437L2 97c-1-2-2-4-2-6 0-4 2-7 5-9l20-12C116 12 171 0 207 0c86 0\n 114 68 191 68 78 0 168-68 177-68 4 0 7 2 9 5l12 19c1 2.175 2 4.35 2 6.525 0\n 4.35-2 7.613-5 9.788l-19 13.05c-92 63.077-116.937 75.308-183 76.128\n-68.267.847-113-73.952-191-73.952z",
  // ditto tilde2, tilde3, & tilde4
  tilde2: "M344 55.266c-142 0-300.638 81.316-311.5 86.418\n-8.01 3.762-22.5 10.91-23.5 5.562L1 120c-1-2-1-3-1-4 0-5 3-9 8-10l18.4-9C160.9\n 31.9 283 0 358 0c148 0 188 122 331 122s314-97 326-97c4 0 8 2 10 7l7 21.114\nc1 2.14 1 3.21 1 4.28 0 5.347-3 9.626-7 10.696l-22.3 12.622C852.6 158.372 751\n 181.476 676 181.476c-149 0-189-126.21-332-126.21z",
  tilde3: "M786 59C457 59 32 175.242 13 175.242c-6 0-10-3.457\n-11-10.37L.15 138c-1-7 3-12 10-13l19.2-6.4C378.4 40.7 634.3 0 804.3 0c337 0\n 411.8 157 746.8 157 328 0 754-112 773-112 5 0 10 3 11 9l1 14.075c1 8.066-.697\n 16.595-6.697 17.492l-21.052 7.31c-367.9 98.146-609.15 122.696-778.15 122.696\n -338 0-409-156.573-744-156.573z",
  tilde4: "M786 58C457 58 32 177.487 13 177.487c-6 0-10-3.345\n-11-10.035L.15 143c-1-7 3-12 10-13l22-6.7C381.2 35 637.15 0 807.15 0c337 0 409\n 177 744 177 328 0 754-127 773-127 5 0 10 3 11 9l1 14.794c1 7.805-3 13.38-9\n 14.495l-20.7 5.574c-366.85 99.79-607.3 139.372-776.3 139.372-338 0-409\n -175.236-744-175.236z",
  // vec is from glyph U+20D7 in font KaTeX Main
  vec: "M377 20c0-5.333 1.833-10 5.5-14S391 0 397 0c4.667 0 8.667 1.667 12 5\n3.333 2.667 6.667 9 10 19 6.667 24.667 20.333 43.667 41 57 7.333 4.667 11\n10.667 11 18 0 6-1 10-3 12s-6.667 5-14 9c-28.667 14.667-53.667 35.667-75 63\n-1.333 1.333-3.167 3.5-5.5 6.5s-4 4.833-5 5.5c-1 .667-2.5 1.333-4.5 2s-4.333 1\n-7 1c-4.667 0-9.167-1.833-13.5-5.5S337 184 337 178c0-12.667 15.667-32.333 47-59\nH213l-171-1c-8.667-6-13-12.333-13-19 0-4.667 4.333-11.333 13-20h359\nc-16-25.333-24-45-24-59z",
  // widehat1 is a modified version of a glyph from the MnSymbol package
  widehat1: "M529 0h5l519 115c5 1 9 5 9 10 0 1-1 2-1 3l-4 22\nc-1 5-5 9-11 9h-2L532 67 19 159h-2c-5 0-9-4-11-9l-5-22c-1-6 2-12 8-13z",
  // ditto widehat2, widehat3, & widehat4
  widehat2: "M1181 0h2l1171 176c6 0 10 5 10 11l-2 23c-1 6-5 10\n-11 10h-1L1182 67 15 220h-1c-6 0-10-4-11-10l-2-23c-1-6 4-11 10-11z",
  widehat3: "M1181 0h2l1171 236c6 0 10 5 10 11l-2 23c-1 6-5 10\n-11 10h-1L1182 67 15 280h-1c-6 0-10-4-11-10l-2-23c-1-6 4-11 10-11z",
  widehat4: "M1181 0h2l1171 296c6 0 10 5 10 11l-2 23c-1 6-5 10\n-11 10h-1L1182 67 15 340h-1c-6 0-10-4-11-10l-2-23c-1-6 4-11 10-11z",
  // widecheck paths are all inverted versions of widehat
  widecheck1: "M529,159h5l519,-115c5,-1,9,-5,9,-10c0,-1,-1,-2,-1,-3l-4,-22c-1,\n-5,-5,-9,-11,-9h-2l-512,92l-513,-92h-2c-5,0,-9,4,-11,9l-5,22c-1,6,2,12,8,13z",
  widecheck2: "M1181,220h2l1171,-176c6,0,10,-5,10,-11l-2,-23c-1,-6,-5,-10,\n-11,-10h-1l-1168,153l-1167,-153h-1c-6,0,-10,4,-11,10l-2,23c-1,6,4,11,10,11z",
  widecheck3: "M1181,280h2l1171,-236c6,0,10,-5,10,-11l-2,-23c-1,-6,-5,-10,\n-11,-10h-1l-1168,213l-1167,-213h-1c-6,0,-10,4,-11,10l-2,23c-1,6,4,11,10,11z",
  widecheck4: "M1181,340h2l1171,-296c6,0,10,-5,10,-11l-2,-23c-1,-6,-5,-10,\n-11,-10h-1l-1168,273l-1167,-273h-1c-6,0,-10,4,-11,10l-2,23c-1,6,4,11,10,11z",
  // The next ten paths support reaction arrows from the mhchem package.
  // Arrows for \ce{<-->} are offset from xAxis by 0.22ex, per mhchem in LaTeX
  // baraboveleftarrow is mostly from glyph U+2190 in font KaTeX Main
  baraboveleftarrow: "M400000 620h-399890l3 -3c68.7 -52.7 113.7 -120 135 -202\nc4 -14.7 6 -23 6 -25c0 -7.3 -7 -11 -21 -11c-8 0 -13.2 0.8 -15.5 2.5\nc-2.3 1.7 -4.2 5.8 -5.5 12.5c-1.3 4.7 -2.7 10.3 -4 17c-12 48.7 -34.8 92 -68.5 130\ns-74.2 66.3 -121.5 85c-10 4 -16 7.7 -18 11c0 8.7 6 14.3 18 17c47.3 18.7 87.8 47\n121.5 85s56.5 81.3 68.5 130c0.7 2 1.3 5 2 9s1.2 6.7 1.5 8c0.3 1.3 1 3.3 2 6\ns2.2 4.5 3.5 5.5c1.3 1 3.3 1.8 6 2.5s6 1 10 1c14 0 21 -3.7 21 -11\nc0 -2 -2 -10.3 -6 -25c-20 -79.3 -65 -146.7 -135 -202l-3 -3h399890z\nM100 620v40h399900v-40z M0 241v40h399900v-40zM0 241v40h399900v-40z",
  // rightarrowabovebar is mostly from glyph U+2192, KaTeX Main
  rightarrowabovebar: "M0 241v40h399891c-47.3 35.3-84 78-110 128-16.7 32\n-27.7 63.7-33 95 0 1.3-.2 2.7-.5 4-.3 1.3-.5 2.3-.5 3 0 7.3 6.7 11 20 11 8 0\n13.2-.8 15.5-2.5 2.3-1.7 4.2-5.5 5.5-11.5 2-13.3 5.7-27 11-41 14.7-44.7 39\n-84.5 73-119.5s73.7-60.2 119-75.5c6-2 9-5.7 9-11s-3-9-9-11c-45.3-15.3-85-40.5\n-119-75.5s-58.3-74.8-73-119.5c-4.7-14-8.3-27.3-11-40-1.3-6.7-3.2-10.8-5.5\n-12.5-2.3-1.7-7.5-2.5-15.5-2.5-14 0-21 3.7-21 11 0 2 2 10.3 6 25 20.7 83.3 67\n151.7 139 205zm96 379h399894v40H0zm0 0h399904v40H0z",
  // The short left harpoon has 0.5em (i.e. 500 units) kern on the left end.
  // Ref from mhchem.sty: \rlap{\raisebox{-.22ex}{$\kern0.5em
  baraboveshortleftharpoon: "M507,435c-4,4,-6.3,8.7,-7,14c0,5.3,0.7,9,2,11\nc1.3,2,5.3,5.3,12,10c90.7,54,156,130,196,228c3.3,10.7,6.3,16.3,9,17\nc2,0.7,5,1,9,1c0,0,5,0,5,0c10.7,0,16.7,-2,18,-6c2,-2.7,1,-9.7,-3,-21\nc-32,-87.3,-82.7,-157.7,-152,-211c0,0,-3,-3,-3,-3l399351,0l0,-40\nc-398570,0,-399437,0,-399437,0z M593 435 v40 H399500 v-40z\nM0 281 v-40 H399908 v40z M0 281 v-40 H399908 v40z",
  rightharpoonaboveshortbar: "M0,241 l0,40c399126,0,399993,0,399993,0\nc4.7,-4.7,7,-9.3,7,-14c0,-9.3,-3.7,-15.3,-11,-18c-92.7,-56.7,-159,-133.7,-199,\n-231c-3.3,-9.3,-6,-14.7,-8,-16c-2,-1.3,-7,-2,-15,-2c-10.7,0,-16.7,2,-18,6\nc-2,2.7,-1,9.7,3,21c15.3,42,36.7,81.8,64,119.5c27.3,37.7,58,69.2,92,94.5z\nM0 241 v40 H399908 v-40z M0 475 v-40 H399500 v40z M0 475 v-40 H399500 v40z",
  shortbaraboveleftharpoon: "M7,435c-4,4,-6.3,8.7,-7,14c0,5.3,0.7,9,2,11\nc1.3,2,5.3,5.3,12,10c90.7,54,156,130,196,228c3.3,10.7,6.3,16.3,9,17c2,0.7,5,1,9,\n1c0,0,5,0,5,0c10.7,0,16.7,-2,18,-6c2,-2.7,1,-9.7,-3,-21c-32,-87.3,-82.7,-157.7,\n-152,-211c0,0,-3,-3,-3,-3l399907,0l0,-40c-399126,0,-399993,0,-399993,0z\nM93 435 v40 H400000 v-40z M500 241 v40 H400000 v-40z M500 241 v40 H400000 v-40z",
  shortrightharpoonabovebar: "M53,241l0,40c398570,0,399437,0,399437,0\nc4.7,-4.7,7,-9.3,7,-14c0,-9.3,-3.7,-15.3,-11,-18c-92.7,-56.7,-159,-133.7,-199,\n-231c-3.3,-9.3,-6,-14.7,-8,-16c-2,-1.3,-7,-2,-15,-2c-10.7,0,-16.7,2,-18,6\nc-2,2.7,-1,9.7,3,21c15.3,42,36.7,81.8,64,119.5c27.3,37.7,58,69.2,92,94.5z\nM500 241 v40 H399408 v-40z M500 435 v40 H400000 v-40z"
};
var tallDelim = function tallDelim2(label, midHeight) {
  switch (label) {
    case "lbrack":
      return "M403 1759 V84 H666 V0 H319 V1759 v" + midHeight + " v1759 h347 v-84\nH403z M403 1759 V0 H319 V1759 v" + midHeight + " v1759 h84z";
    case "rbrack":
      return "M347 1759 V0 H0 V84 H263 V1759 v" + midHeight + " v1759 H0 v84 H347z\nM347 1759 V0 H263 V1759 v" + midHeight + " v1759 h84z";
    case "vert":
      return "M145 15 v585 v" + midHeight + " v585 c2.667,10,9.667,15,21,15\nc10,0,16.667,-5,20,-15 v-585 v" + -midHeight + " v-585 c-2.667,-10,-9.667,-15,-21,-15\nc-10,0,-16.667,5,-20,15z M188 15 H145 v585 v" + midHeight + " v585 h43z";
    case "doublevert":
      return "M145 15 v585 v" + midHeight + " v585 c2.667,10,9.667,15,21,15\nc10,0,16.667,-5,20,-15 v-585 v" + -midHeight + " v-585 c-2.667,-10,-9.667,-15,-21,-15\nc-10,0,-16.667,5,-20,15z M188 15 H145 v585 v" + midHeight + " v585 h43z\nM367 15 v585 v" + midHeight + " v585 c2.667,10,9.667,15,21,15\nc10,0,16.667,-5,20,-15 v-585 v" + -midHeight + " v-585 c-2.667,-10,-9.667,-15,-21,-15\nc-10,0,-16.667,5,-20,15z M410 15 H367 v585 v" + midHeight + " v585 h43z";
    case "lfloor":
      return "M319 602 V0 H403 V602 v" + midHeight + " v1715 h263 v84 H319z\nMM319 602 V0 H403 V602 v" + midHeight + " v1715 H319z";
    case "rfloor":
      return "M319 602 V0 H403 V602 v" + midHeight + " v1799 H0 v-84 H319z\nMM319 602 V0 H403 V602 v" + midHeight + " v1715 H319z";
    case "lceil":
      return "M403 1759 V84 H666 V0 H319 V1759 v" + midHeight + " v602 h84z\nM403 1759 V0 H319 V1759 v" + midHeight + " v602 h84z";
    case "rceil":
      return "M347 1759 V0 H0 V84 H263 V1759 v" + midHeight + " v602 h84z\nM347 1759 V0 h-84 V1759 v" + midHeight + " v602 h84z";
    case "lparen":
      return "M863,9c0,-2,-2,-5,-6,-9c0,0,-17,0,-17,0c-12.7,0,-19.3,0.3,-20,1\nc-5.3,5.3,-10.3,11,-15,17c-242.7,294.7,-395.3,682,-458,1162c-21.3,163.3,-33.3,349,\n-36,557 l0," + (midHeight + 84) + "c0.2,6,0,26,0,60c2,159.3,10,310.7,24,454c53.3,528,210,\n949.7,470,1265c4.7,6,9.7,11.7,15,17c0.7,0.7,7,1,19,1c0,0,18,0,18,0c4,-4,6,-7,6,-9\nc0,-2.7,-3.3,-8.7,-10,-18c-135.3,-192.7,-235.5,-414.3,-300.5,-665c-65,-250.7,-102.5,\n-544.7,-112.5,-882c-2,-104,-3,-167,-3,-189\nl0,-" + (midHeight + 92) + "c0,-162.7,5.7,-314,17,-454c20.7,-272,63.7,-513,129,-723c65.3,\n-210,155.3,-396.3,270,-559c6.7,-9.3,10,-15.3,10,-18z";
    case "rparen":
      return "M76,0c-16.7,0,-25,3,-25,9c0,2,2,6.3,6,13c21.3,28.7,42.3,60.3,\n63,95c96.7,156.7,172.8,332.5,228.5,527.5c55.7,195,92.8,416.5,111.5,664.5\nc11.3,139.3,17,290.7,17,454c0,28,1.7,43,3.3,45l0," + (midHeight + 9) + "\nc-3,4,-3.3,16.7,-3.3,38c0,162,-5.7,313.7,-17,455c-18.7,248,-55.8,469.3,-111.5,664\nc-55.7,194.7,-131.8,370.3,-228.5,527c-20.7,34.7,-41.7,66.3,-63,95c-2,3.3,-4,7,-6,11\nc0,7.3,5.7,11,17,11c0,0,11,0,11,0c9.3,0,14.3,-0.3,15,-1c5.3,-5.3,10.3,-11,15,-17\nc242.7,-294.7,395.3,-681.7,458,-1161c21.3,-164.7,33.3,-350.7,36,-558\nl0,-" + (midHeight + 144) + "c-2,-159.3,-10,-310.7,-24,-454c-53.3,-528,-210,-949.7,\n-470,-1265c-4.7,-6,-9.7,-11.7,-15,-17c-0.7,-0.7,-6.7,-1,-18,-1z";
    default:
      throw new Error("Unknown stretchy delimiter.");
  }
};
var DocumentFragment = class {
  // HtmlDomNode
  // Never used; needed for satisfying interface.
  constructor(children) {
    this.children = void 0;
    this.classes = void 0;
    this.height = void 0;
    this.depth = void 0;
    this.maxFontSize = void 0;
    this.style = void 0;
    this.children = children;
    this.classes = [];
    this.height = 0;
    this.depth = 0;
    this.maxFontSize = 0;
    this.style = {};
  }
  hasClass(className) {
    return utils.contains(this.classes, className);
  }
  /** Convert the fragment into a node. */
  toNode() {
    var frag = document.createDocumentFragment();
    for (var i2 = 0; i2 < this.children.length; i2++) {
      frag.appendChild(this.children[i2].toNode());
    }
    return frag;
  }
  /** Convert the fragment into HTML markup. */
  toMarkup() {
    var markup = "";
    for (var i2 = 0; i2 < this.children.length; i2++) {
      markup += this.children[i2].toMarkup();
    }
    return markup;
  }
  /**
   * Converts the math node into a string, similar to innerText. Applies to
   * MathDomNode's only.
   */
  toText() {
    var toText = (child) => child.toText();
    return this.children.map(toText).join("");
  }
};
var fontMetricsData = {
  "AMS-Regular": {
    "32": [0, 0, 0, 0, 0.25],
    "65": [0, 0.68889, 0, 0, 0.72222],
    "66": [0, 0.68889, 0, 0, 0.66667],
    "67": [0, 0.68889, 0, 0, 0.72222],
    "68": [0, 0.68889, 0, 0, 0.72222],
    "69": [0, 0.68889, 0, 0, 0.66667],
    "70": [0, 0.68889, 0, 0, 0.61111],
    "71": [0, 0.68889, 0, 0, 0.77778],
    "72": [0, 0.68889, 0, 0, 0.77778],
    "73": [0, 0.68889, 0, 0, 0.38889],
    "74": [0.16667, 0.68889, 0, 0, 0.5],
    "75": [0, 0.68889, 0, 0, 0.77778],
    "76": [0, 0.68889, 0, 0, 0.66667],
    "77": [0, 0.68889, 0, 0, 0.94445],
    "78": [0, 0.68889, 0, 0, 0.72222],
    "79": [0.16667, 0.68889, 0, 0, 0.77778],
    "80": [0, 0.68889, 0, 0, 0.61111],
    "81": [0.16667, 0.68889, 0, 0, 0.77778],
    "82": [0, 0.68889, 0, 0, 0.72222],
    "83": [0, 0.68889, 0, 0, 0.55556],
    "84": [0, 0.68889, 0, 0, 0.66667],
    "85": [0, 0.68889, 0, 0, 0.72222],
    "86": [0, 0.68889, 0, 0, 0.72222],
    "87": [0, 0.68889, 0, 0, 1],
    "88": [0, 0.68889, 0, 0, 0.72222],
    "89": [0, 0.68889, 0, 0, 0.72222],
    "90": [0, 0.68889, 0, 0, 0.66667],
    "107": [0, 0.68889, 0, 0, 0.55556],
    "160": [0, 0, 0, 0, 0.25],
    "165": [0, 0.675, 0.025, 0, 0.75],
    "174": [0.15559, 0.69224, 0, 0, 0.94666],
    "240": [0, 0.68889, 0, 0, 0.55556],
    "295": [0, 0.68889, 0, 0, 0.54028],
    "710": [0, 0.825, 0, 0, 2.33334],
    "732": [0, 0.9, 0, 0, 2.33334],
    "770": [0, 0.825, 0, 0, 2.33334],
    "771": [0, 0.9, 0, 0, 2.33334],
    "989": [0.08167, 0.58167, 0, 0, 0.77778],
    "1008": [0, 0.43056, 0.04028, 0, 0.66667],
    "8245": [0, 0.54986, 0, 0, 0.275],
    "8463": [0, 0.68889, 0, 0, 0.54028],
    "8487": [0, 0.68889, 0, 0, 0.72222],
    "8498": [0, 0.68889, 0, 0, 0.55556],
    "8502": [0, 0.68889, 0, 0, 0.66667],
    "8503": [0, 0.68889, 0, 0, 0.44445],
    "8504": [0, 0.68889, 0, 0, 0.66667],
    "8513": [0, 0.68889, 0, 0, 0.63889],
    "8592": [-0.03598, 0.46402, 0, 0, 0.5],
    "8594": [-0.03598, 0.46402, 0, 0, 0.5],
    "8602": [-0.13313, 0.36687, 0, 0, 1],
    "8603": [-0.13313, 0.36687, 0, 0, 1],
    "8606": [0.01354, 0.52239, 0, 0, 1],
    "8608": [0.01354, 0.52239, 0, 0, 1],
    "8610": [0.01354, 0.52239, 0, 0, 1.11111],
    "8611": [0.01354, 0.52239, 0, 0, 1.11111],
    "8619": [0, 0.54986, 0, 0, 1],
    "8620": [0, 0.54986, 0, 0, 1],
    "8621": [-0.13313, 0.37788, 0, 0, 1.38889],
    "8622": [-0.13313, 0.36687, 0, 0, 1],
    "8624": [0, 0.69224, 0, 0, 0.5],
    "8625": [0, 0.69224, 0, 0, 0.5],
    "8630": [0, 0.43056, 0, 0, 1],
    "8631": [0, 0.43056, 0, 0, 1],
    "8634": [0.08198, 0.58198, 0, 0, 0.77778],
    "8635": [0.08198, 0.58198, 0, 0, 0.77778],
    "8638": [0.19444, 0.69224, 0, 0, 0.41667],
    "8639": [0.19444, 0.69224, 0, 0, 0.41667],
    "8642": [0.19444, 0.69224, 0, 0, 0.41667],
    "8643": [0.19444, 0.69224, 0, 0, 0.41667],
    "8644": [0.1808, 0.675, 0, 0, 1],
    "8646": [0.1808, 0.675, 0, 0, 1],
    "8647": [0.1808, 0.675, 0, 0, 1],
    "8648": [0.19444, 0.69224, 0, 0, 0.83334],
    "8649": [0.1808, 0.675, 0, 0, 1],
    "8650": [0.19444, 0.69224, 0, 0, 0.83334],
    "8651": [0.01354, 0.52239, 0, 0, 1],
    "8652": [0.01354, 0.52239, 0, 0, 1],
    "8653": [-0.13313, 0.36687, 0, 0, 1],
    "8654": [-0.13313, 0.36687, 0, 0, 1],
    "8655": [-0.13313, 0.36687, 0, 0, 1],
    "8666": [0.13667, 0.63667, 0, 0, 1],
    "8667": [0.13667, 0.63667, 0, 0, 1],
    "8669": [-0.13313, 0.37788, 0, 0, 1],
    "8672": [-0.064, 0.437, 0, 0, 1.334],
    "8674": [-0.064, 0.437, 0, 0, 1.334],
    "8705": [0, 0.825, 0, 0, 0.5],
    "8708": [0, 0.68889, 0, 0, 0.55556],
    "8709": [0.08167, 0.58167, 0, 0, 0.77778],
    "8717": [0, 0.43056, 0, 0, 0.42917],
    "8722": [-0.03598, 0.46402, 0, 0, 0.5],
    "8724": [0.08198, 0.69224, 0, 0, 0.77778],
    "8726": [0.08167, 0.58167, 0, 0, 0.77778],
    "8733": [0, 0.69224, 0, 0, 0.77778],
    "8736": [0, 0.69224, 0, 0, 0.72222],
    "8737": [0, 0.69224, 0, 0, 0.72222],
    "8738": [0.03517, 0.52239, 0, 0, 0.72222],
    "8739": [0.08167, 0.58167, 0, 0, 0.22222],
    "8740": [0.25142, 0.74111, 0, 0, 0.27778],
    "8741": [0.08167, 0.58167, 0, 0, 0.38889],
    "8742": [0.25142, 0.74111, 0, 0, 0.5],
    "8756": [0, 0.69224, 0, 0, 0.66667],
    "8757": [0, 0.69224, 0, 0, 0.66667],
    "8764": [-0.13313, 0.36687, 0, 0, 0.77778],
    "8765": [-0.13313, 0.37788, 0, 0, 0.77778],
    "8769": [-0.13313, 0.36687, 0, 0, 0.77778],
    "8770": [-0.03625, 0.46375, 0, 0, 0.77778],
    "8774": [0.30274, 0.79383, 0, 0, 0.77778],
    "8776": [-0.01688, 0.48312, 0, 0, 0.77778],
    "8778": [0.08167, 0.58167, 0, 0, 0.77778],
    "8782": [0.06062, 0.54986, 0, 0, 0.77778],
    "8783": [0.06062, 0.54986, 0, 0, 0.77778],
    "8785": [0.08198, 0.58198, 0, 0, 0.77778],
    "8786": [0.08198, 0.58198, 0, 0, 0.77778],
    "8787": [0.08198, 0.58198, 0, 0, 0.77778],
    "8790": [0, 0.69224, 0, 0, 0.77778],
    "8791": [0.22958, 0.72958, 0, 0, 0.77778],
    "8796": [0.08198, 0.91667, 0, 0, 0.77778],
    "8806": [0.25583, 0.75583, 0, 0, 0.77778],
    "8807": [0.25583, 0.75583, 0, 0, 0.77778],
    "8808": [0.25142, 0.75726, 0, 0, 0.77778],
    "8809": [0.25142, 0.75726, 0, 0, 0.77778],
    "8812": [0.25583, 0.75583, 0, 0, 0.5],
    "8814": [0.20576, 0.70576, 0, 0, 0.77778],
    "8815": [0.20576, 0.70576, 0, 0, 0.77778],
    "8816": [0.30274, 0.79383, 0, 0, 0.77778],
    "8817": [0.30274, 0.79383, 0, 0, 0.77778],
    "8818": [0.22958, 0.72958, 0, 0, 0.77778],
    "8819": [0.22958, 0.72958, 0, 0, 0.77778],
    "8822": [0.1808, 0.675, 0, 0, 0.77778],
    "8823": [0.1808, 0.675, 0, 0, 0.77778],
    "8828": [0.13667, 0.63667, 0, 0, 0.77778],
    "8829": [0.13667, 0.63667, 0, 0, 0.77778],
    "8830": [0.22958, 0.72958, 0, 0, 0.77778],
    "8831": [0.22958, 0.72958, 0, 0, 0.77778],
    "8832": [0.20576, 0.70576, 0, 0, 0.77778],
    "8833": [0.20576, 0.70576, 0, 0, 0.77778],
    "8840": [0.30274, 0.79383, 0, 0, 0.77778],
    "8841": [0.30274, 0.79383, 0, 0, 0.77778],
    "8842": [0.13597, 0.63597, 0, 0, 0.77778],
    "8843": [0.13597, 0.63597, 0, 0, 0.77778],
    "8847": [0.03517, 0.54986, 0, 0, 0.77778],
    "8848": [0.03517, 0.54986, 0, 0, 0.77778],
    "8858": [0.08198, 0.58198, 0, 0, 0.77778],
    "8859": [0.08198, 0.58198, 0, 0, 0.77778],
    "8861": [0.08198, 0.58198, 0, 0, 0.77778],
    "8862": [0, 0.675, 0, 0, 0.77778],
    "8863": [0, 0.675, 0, 0, 0.77778],
    "8864": [0, 0.675, 0, 0, 0.77778],
    "8865": [0, 0.675, 0, 0, 0.77778],
    "8872": [0, 0.69224, 0, 0, 0.61111],
    "8873": [0, 0.69224, 0, 0, 0.72222],
    "8874": [0, 0.69224, 0, 0, 0.88889],
    "8876": [0, 0.68889, 0, 0, 0.61111],
    "8877": [0, 0.68889, 0, 0, 0.61111],
    "8878": [0, 0.68889, 0, 0, 0.72222],
    "8879": [0, 0.68889, 0, 0, 0.72222],
    "8882": [0.03517, 0.54986, 0, 0, 0.77778],
    "8883": [0.03517, 0.54986, 0, 0, 0.77778],
    "8884": [0.13667, 0.63667, 0, 0, 0.77778],
    "8885": [0.13667, 0.63667, 0, 0, 0.77778],
    "8888": [0, 0.54986, 0, 0, 1.11111],
    "8890": [0.19444, 0.43056, 0, 0, 0.55556],
    "8891": [0.19444, 0.69224, 0, 0, 0.61111],
    "8892": [0.19444, 0.69224, 0, 0, 0.61111],
    "8901": [0, 0.54986, 0, 0, 0.27778],
    "8903": [0.08167, 0.58167, 0, 0, 0.77778],
    "8905": [0.08167, 0.58167, 0, 0, 0.77778],
    "8906": [0.08167, 0.58167, 0, 0, 0.77778],
    "8907": [0, 0.69224, 0, 0, 0.77778],
    "8908": [0, 0.69224, 0, 0, 0.77778],
    "8909": [-0.03598, 0.46402, 0, 0, 0.77778],
    "8910": [0, 0.54986, 0, 0, 0.76042],
    "8911": [0, 0.54986, 0, 0, 0.76042],
    "8912": [0.03517, 0.54986, 0, 0, 0.77778],
    "8913": [0.03517, 0.54986, 0, 0, 0.77778],
    "8914": [0, 0.54986, 0, 0, 0.66667],
    "8915": [0, 0.54986, 0, 0, 0.66667],
    "8916": [0, 0.69224, 0, 0, 0.66667],
    "8918": [0.0391, 0.5391, 0, 0, 0.77778],
    "8919": [0.0391, 0.5391, 0, 0, 0.77778],
    "8920": [0.03517, 0.54986, 0, 0, 1.33334],
    "8921": [0.03517, 0.54986, 0, 0, 1.33334],
    "8922": [0.38569, 0.88569, 0, 0, 0.77778],
    "8923": [0.38569, 0.88569, 0, 0, 0.77778],
    "8926": [0.13667, 0.63667, 0, 0, 0.77778],
    "8927": [0.13667, 0.63667, 0, 0, 0.77778],
    "8928": [0.30274, 0.79383, 0, 0, 0.77778],
    "8929": [0.30274, 0.79383, 0, 0, 0.77778],
    "8934": [0.23222, 0.74111, 0, 0, 0.77778],
    "8935": [0.23222, 0.74111, 0, 0, 0.77778],
    "8936": [0.23222, 0.74111, 0, 0, 0.77778],
    "8937": [0.23222, 0.74111, 0, 0, 0.77778],
    "8938": [0.20576, 0.70576, 0, 0, 0.77778],
    "8939": [0.20576, 0.70576, 0, 0, 0.77778],
    "8940": [0.30274, 0.79383, 0, 0, 0.77778],
    "8941": [0.30274, 0.79383, 0, 0, 0.77778],
    "8994": [0.19444, 0.69224, 0, 0, 0.77778],
    "8995": [0.19444, 0.69224, 0, 0, 0.77778],
    "9416": [0.15559, 0.69224, 0, 0, 0.90222],
    "9484": [0, 0.69224, 0, 0, 0.5],
    "9488": [0, 0.69224, 0, 0, 0.5],
    "9492": [0, 0.37788, 0, 0, 0.5],
    "9496": [0, 0.37788, 0, 0, 0.5],
    "9585": [0.19444, 0.68889, 0, 0, 0.88889],
    "9586": [0.19444, 0.74111, 0, 0, 0.88889],
    "9632": [0, 0.675, 0, 0, 0.77778],
    "9633": [0, 0.675, 0, 0, 0.77778],
    "9650": [0, 0.54986, 0, 0, 0.72222],
    "9651": [0, 0.54986, 0, 0, 0.72222],
    "9654": [0.03517, 0.54986, 0, 0, 0.77778],
    "9660": [0, 0.54986, 0, 0, 0.72222],
    "9661": [0, 0.54986, 0, 0, 0.72222],
    "9664": [0.03517, 0.54986, 0, 0, 0.77778],
    "9674": [0.11111, 0.69224, 0, 0, 0.66667],
    "9733": [0.19444, 0.69224, 0, 0, 0.94445],
    "10003": [0, 0.69224, 0, 0, 0.83334],
    "10016": [0, 0.69224, 0, 0, 0.83334],
    "10731": [0.11111, 0.69224, 0, 0, 0.66667],
    "10846": [0.19444, 0.75583, 0, 0, 0.61111],
    "10877": [0.13667, 0.63667, 0, 0, 0.77778],
    "10878": [0.13667, 0.63667, 0, 0, 0.77778],
    "10885": [0.25583, 0.75583, 0, 0, 0.77778],
    "10886": [0.25583, 0.75583, 0, 0, 0.77778],
    "10887": [0.13597, 0.63597, 0, 0, 0.77778],
    "10888": [0.13597, 0.63597, 0, 0, 0.77778],
    "10889": [0.26167, 0.75726, 0, 0, 0.77778],
    "10890": [0.26167, 0.75726, 0, 0, 0.77778],
    "10891": [0.48256, 0.98256, 0, 0, 0.77778],
    "10892": [0.48256, 0.98256, 0, 0, 0.77778],
    "10901": [0.13667, 0.63667, 0, 0, 0.77778],
    "10902": [0.13667, 0.63667, 0, 0, 0.77778],
    "10933": [0.25142, 0.75726, 0, 0, 0.77778],
    "10934": [0.25142, 0.75726, 0, 0, 0.77778],
    "10935": [0.26167, 0.75726, 0, 0, 0.77778],
    "10936": [0.26167, 0.75726, 0, 0, 0.77778],
    "10937": [0.26167, 0.75726, 0, 0, 0.77778],
    "10938": [0.26167, 0.75726, 0, 0, 0.77778],
    "10949": [0.25583, 0.75583, 0, 0, 0.77778],
    "10950": [0.25583, 0.75583, 0, 0, 0.77778],
    "10955": [0.28481, 0.79383, 0, 0, 0.77778],
    "10956": [0.28481, 0.79383, 0, 0, 0.77778],
    "57350": [0.08167, 0.58167, 0, 0, 0.22222],
    "57351": [0.08167, 0.58167, 0, 0, 0.38889],
    "57352": [0.08167, 0.58167, 0, 0, 0.77778],
    "57353": [0, 0.43056, 0.04028, 0, 0.66667],
    "57356": [0.25142, 0.75726, 0, 0, 0.77778],
    "57357": [0.25142, 0.75726, 0, 0, 0.77778],
    "57358": [0.41951, 0.91951, 0, 0, 0.77778],
    "57359": [0.30274, 0.79383, 0, 0, 0.77778],
    "57360": [0.30274, 0.79383, 0, 0, 0.77778],
    "57361": [0.41951, 0.91951, 0, 0, 0.77778],
    "57366": [0.25142, 0.75726, 0, 0, 0.77778],
    "57367": [0.25142, 0.75726, 0, 0, 0.77778],
    "57368": [0.25142, 0.75726, 0, 0, 0.77778],
    "57369": [0.25142, 0.75726, 0, 0, 0.77778],
    "57370": [0.13597, 0.63597, 0, 0, 0.77778],
    "57371": [0.13597, 0.63597, 0, 0, 0.77778]
  },
  "Caligraphic-Regular": {
    "32": [0, 0, 0, 0, 0.25],
    "65": [0, 0.68333, 0, 0.19445, 0.79847],
    "66": [0, 0.68333, 0.03041, 0.13889, 0.65681],
    "67": [0, 0.68333, 0.05834, 0.13889, 0.52653],
    "68": [0, 0.68333, 0.02778, 0.08334, 0.77139],
    "69": [0, 0.68333, 0.08944, 0.11111, 0.52778],
    "70": [0, 0.68333, 0.09931, 0.11111, 0.71875],
    "71": [0.09722, 0.68333, 0.0593, 0.11111, 0.59487],
    "72": [0, 0.68333, 965e-5, 0.11111, 0.84452],
    "73": [0, 0.68333, 0.07382, 0, 0.54452],
    "74": [0.09722, 0.68333, 0.18472, 0.16667, 0.67778],
    "75": [0, 0.68333, 0.01445, 0.05556, 0.76195],
    "76": [0, 0.68333, 0, 0.13889, 0.68972],
    "77": [0, 0.68333, 0, 0.13889, 1.2009],
    "78": [0, 0.68333, 0.14736, 0.08334, 0.82049],
    "79": [0, 0.68333, 0.02778, 0.11111, 0.79611],
    "80": [0, 0.68333, 0.08222, 0.08334, 0.69556],
    "81": [0.09722, 0.68333, 0, 0.11111, 0.81667],
    "82": [0, 0.68333, 0, 0.08334, 0.8475],
    "83": [0, 0.68333, 0.075, 0.13889, 0.60556],
    "84": [0, 0.68333, 0.25417, 0, 0.54464],
    "85": [0, 0.68333, 0.09931, 0.08334, 0.62583],
    "86": [0, 0.68333, 0.08222, 0, 0.61278],
    "87": [0, 0.68333, 0.08222, 0.08334, 0.98778],
    "88": [0, 0.68333, 0.14643, 0.13889, 0.7133],
    "89": [0.09722, 0.68333, 0.08222, 0.08334, 0.66834],
    "90": [0, 0.68333, 0.07944, 0.13889, 0.72473],
    "160": [0, 0, 0, 0, 0.25]
  },
  "Fraktur-Regular": {
    "32": [0, 0, 0, 0, 0.25],
    "33": [0, 0.69141, 0, 0, 0.29574],
    "34": [0, 0.69141, 0, 0, 0.21471],
    "38": [0, 0.69141, 0, 0, 0.73786],
    "39": [0, 0.69141, 0, 0, 0.21201],
    "40": [0.24982, 0.74947, 0, 0, 0.38865],
    "41": [0.24982, 0.74947, 0, 0, 0.38865],
    "42": [0, 0.62119, 0, 0, 0.27764],
    "43": [0.08319, 0.58283, 0, 0, 0.75623],
    "44": [0, 0.10803, 0, 0, 0.27764],
    "45": [0.08319, 0.58283, 0, 0, 0.75623],
    "46": [0, 0.10803, 0, 0, 0.27764],
    "47": [0.24982, 0.74947, 0, 0, 0.50181],
    "48": [0, 0.47534, 0, 0, 0.50181],
    "49": [0, 0.47534, 0, 0, 0.50181],
    "50": [0, 0.47534, 0, 0, 0.50181],
    "51": [0.18906, 0.47534, 0, 0, 0.50181],
    "52": [0.18906, 0.47534, 0, 0, 0.50181],
    "53": [0.18906, 0.47534, 0, 0, 0.50181],
    "54": [0, 0.69141, 0, 0, 0.50181],
    "55": [0.18906, 0.47534, 0, 0, 0.50181],
    "56": [0, 0.69141, 0, 0, 0.50181],
    "57": [0.18906, 0.47534, 0, 0, 0.50181],
    "58": [0, 0.47534, 0, 0, 0.21606],
    "59": [0.12604, 0.47534, 0, 0, 0.21606],
    "61": [-0.13099, 0.36866, 0, 0, 0.75623],
    "63": [0, 0.69141, 0, 0, 0.36245],
    "65": [0, 0.69141, 0, 0, 0.7176],
    "66": [0, 0.69141, 0, 0, 0.88397],
    "67": [0, 0.69141, 0, 0, 0.61254],
    "68": [0, 0.69141, 0, 0, 0.83158],
    "69": [0, 0.69141, 0, 0, 0.66278],
    "70": [0.12604, 0.69141, 0, 0, 0.61119],
    "71": [0, 0.69141, 0, 0, 0.78539],
    "72": [0.06302, 0.69141, 0, 0, 0.7203],
    "73": [0, 0.69141, 0, 0, 0.55448],
    "74": [0.12604, 0.69141, 0, 0, 0.55231],
    "75": [0, 0.69141, 0, 0, 0.66845],
    "76": [0, 0.69141, 0, 0, 0.66602],
    "77": [0, 0.69141, 0, 0, 1.04953],
    "78": [0, 0.69141, 0, 0, 0.83212],
    "79": [0, 0.69141, 0, 0, 0.82699],
    "80": [0.18906, 0.69141, 0, 0, 0.82753],
    "81": [0.03781, 0.69141, 0, 0, 0.82699],
    "82": [0, 0.69141, 0, 0, 0.82807],
    "83": [0, 0.69141, 0, 0, 0.82861],
    "84": [0, 0.69141, 0, 0, 0.66899],
    "85": [0, 0.69141, 0, 0, 0.64576],
    "86": [0, 0.69141, 0, 0, 0.83131],
    "87": [0, 0.69141, 0, 0, 1.04602],
    "88": [0, 0.69141, 0, 0, 0.71922],
    "89": [0.18906, 0.69141, 0, 0, 0.83293],
    "90": [0.12604, 0.69141, 0, 0, 0.60201],
    "91": [0.24982, 0.74947, 0, 0, 0.27764],
    "93": [0.24982, 0.74947, 0, 0, 0.27764],
    "94": [0, 0.69141, 0, 0, 0.49965],
    "97": [0, 0.47534, 0, 0, 0.50046],
    "98": [0, 0.69141, 0, 0, 0.51315],
    "99": [0, 0.47534, 0, 0, 0.38946],
    "100": [0, 0.62119, 0, 0, 0.49857],
    "101": [0, 0.47534, 0, 0, 0.40053],
    "102": [0.18906, 0.69141, 0, 0, 0.32626],
    "103": [0.18906, 0.47534, 0, 0, 0.5037],
    "104": [0.18906, 0.69141, 0, 0, 0.52126],
    "105": [0, 0.69141, 0, 0, 0.27899],
    "106": [0, 0.69141, 0, 0, 0.28088],
    "107": [0, 0.69141, 0, 0, 0.38946],
    "108": [0, 0.69141, 0, 0, 0.27953],
    "109": [0, 0.47534, 0, 0, 0.76676],
    "110": [0, 0.47534, 0, 0, 0.52666],
    "111": [0, 0.47534, 0, 0, 0.48885],
    "112": [0.18906, 0.52396, 0, 0, 0.50046],
    "113": [0.18906, 0.47534, 0, 0, 0.48912],
    "114": [0, 0.47534, 0, 0, 0.38919],
    "115": [0, 0.47534, 0, 0, 0.44266],
    "116": [0, 0.62119, 0, 0, 0.33301],
    "117": [0, 0.47534, 0, 0, 0.5172],
    "118": [0, 0.52396, 0, 0, 0.5118],
    "119": [0, 0.52396, 0, 0, 0.77351],
    "120": [0.18906, 0.47534, 0, 0, 0.38865],
    "121": [0.18906, 0.47534, 0, 0, 0.49884],
    "122": [0.18906, 0.47534, 0, 0, 0.39054],
    "160": [0, 0, 0, 0, 0.25],
    "8216": [0, 0.69141, 0, 0, 0.21471],
    "8217": [0, 0.69141, 0, 0, 0.21471],
    "58112": [0, 0.62119, 0, 0, 0.49749],
    "58113": [0, 0.62119, 0, 0, 0.4983],
    "58114": [0.18906, 0.69141, 0, 0, 0.33328],
    "58115": [0.18906, 0.69141, 0, 0, 0.32923],
    "58116": [0.18906, 0.47534, 0, 0, 0.50343],
    "58117": [0, 0.69141, 0, 0, 0.33301],
    "58118": [0, 0.62119, 0, 0, 0.33409],
    "58119": [0, 0.47534, 0, 0, 0.50073]
  },
  "Main-Bold": {
    "32": [0, 0, 0, 0, 0.25],
    "33": [0, 0.69444, 0, 0, 0.35],
    "34": [0, 0.69444, 0, 0, 0.60278],
    "35": [0.19444, 0.69444, 0, 0, 0.95833],
    "36": [0.05556, 0.75, 0, 0, 0.575],
    "37": [0.05556, 0.75, 0, 0, 0.95833],
    "38": [0, 0.69444, 0, 0, 0.89444],
    "39": [0, 0.69444, 0, 0, 0.31944],
    "40": [0.25, 0.75, 0, 0, 0.44722],
    "41": [0.25, 0.75, 0, 0, 0.44722],
    "42": [0, 0.75, 0, 0, 0.575],
    "43": [0.13333, 0.63333, 0, 0, 0.89444],
    "44": [0.19444, 0.15556, 0, 0, 0.31944],
    "45": [0, 0.44444, 0, 0, 0.38333],
    "46": [0, 0.15556, 0, 0, 0.31944],
    "47": [0.25, 0.75, 0, 0, 0.575],
    "48": [0, 0.64444, 0, 0, 0.575],
    "49": [0, 0.64444, 0, 0, 0.575],
    "50": [0, 0.64444, 0, 0, 0.575],
    "51": [0, 0.64444, 0, 0, 0.575],
    "52": [0, 0.64444, 0, 0, 0.575],
    "53": [0, 0.64444, 0, 0, 0.575],
    "54": [0, 0.64444, 0, 0, 0.575],
    "55": [0, 0.64444, 0, 0, 0.575],
    "56": [0, 0.64444, 0, 0, 0.575],
    "57": [0, 0.64444, 0, 0, 0.575],
    "58": [0, 0.44444, 0, 0, 0.31944],
    "59": [0.19444, 0.44444, 0, 0, 0.31944],
    "60": [0.08556, 0.58556, 0, 0, 0.89444],
    "61": [-0.10889, 0.39111, 0, 0, 0.89444],
    "62": [0.08556, 0.58556, 0, 0, 0.89444],
    "63": [0, 0.69444, 0, 0, 0.54305],
    "64": [0, 0.69444, 0, 0, 0.89444],
    "65": [0, 0.68611, 0, 0, 0.86944],
    "66": [0, 0.68611, 0, 0, 0.81805],
    "67": [0, 0.68611, 0, 0, 0.83055],
    "68": [0, 0.68611, 0, 0, 0.88194],
    "69": [0, 0.68611, 0, 0, 0.75555],
    "70": [0, 0.68611, 0, 0, 0.72361],
    "71": [0, 0.68611, 0, 0, 0.90416],
    "72": [0, 0.68611, 0, 0, 0.9],
    "73": [0, 0.68611, 0, 0, 0.43611],
    "74": [0, 0.68611, 0, 0, 0.59444],
    "75": [0, 0.68611, 0, 0, 0.90138],
    "76": [0, 0.68611, 0, 0, 0.69166],
    "77": [0, 0.68611, 0, 0, 1.09166],
    "78": [0, 0.68611, 0, 0, 0.9],
    "79": [0, 0.68611, 0, 0, 0.86388],
    "80": [0, 0.68611, 0, 0, 0.78611],
    "81": [0.19444, 0.68611, 0, 0, 0.86388],
    "82": [0, 0.68611, 0, 0, 0.8625],
    "83": [0, 0.68611, 0, 0, 0.63889],
    "84": [0, 0.68611, 0, 0, 0.8],
    "85": [0, 0.68611, 0, 0, 0.88472],
    "86": [0, 0.68611, 0.01597, 0, 0.86944],
    "87": [0, 0.68611, 0.01597, 0, 1.18888],
    "88": [0, 0.68611, 0, 0, 0.86944],
    "89": [0, 0.68611, 0.02875, 0, 0.86944],
    "90": [0, 0.68611, 0, 0, 0.70277],
    "91": [0.25, 0.75, 0, 0, 0.31944],
    "92": [0.25, 0.75, 0, 0, 0.575],
    "93": [0.25, 0.75, 0, 0, 0.31944],
    "94": [0, 0.69444, 0, 0, 0.575],
    "95": [0.31, 0.13444, 0.03194, 0, 0.575],
    "97": [0, 0.44444, 0, 0, 0.55902],
    "98": [0, 0.69444, 0, 0, 0.63889],
    "99": [0, 0.44444, 0, 0, 0.51111],
    "100": [0, 0.69444, 0, 0, 0.63889],
    "101": [0, 0.44444, 0, 0, 0.52708],
    "102": [0, 0.69444, 0.10903, 0, 0.35139],
    "103": [0.19444, 0.44444, 0.01597, 0, 0.575],
    "104": [0, 0.69444, 0, 0, 0.63889],
    "105": [0, 0.69444, 0, 0, 0.31944],
    "106": [0.19444, 0.69444, 0, 0, 0.35139],
    "107": [0, 0.69444, 0, 0, 0.60694],
    "108": [0, 0.69444, 0, 0, 0.31944],
    "109": [0, 0.44444, 0, 0, 0.95833],
    "110": [0, 0.44444, 0, 0, 0.63889],
    "111": [0, 0.44444, 0, 0, 0.575],
    "112": [0.19444, 0.44444, 0, 0, 0.63889],
    "113": [0.19444, 0.44444, 0, 0, 0.60694],
    "114": [0, 0.44444, 0, 0, 0.47361],
    "115": [0, 0.44444, 0, 0, 0.45361],
    "116": [0, 0.63492, 0, 0, 0.44722],
    "117": [0, 0.44444, 0, 0, 0.63889],
    "118": [0, 0.44444, 0.01597, 0, 0.60694],
    "119": [0, 0.44444, 0.01597, 0, 0.83055],
    "120": [0, 0.44444, 0, 0, 0.60694],
    "121": [0.19444, 0.44444, 0.01597, 0, 0.60694],
    "122": [0, 0.44444, 0, 0, 0.51111],
    "123": [0.25, 0.75, 0, 0, 0.575],
    "124": [0.25, 0.75, 0, 0, 0.31944],
    "125": [0.25, 0.75, 0, 0, 0.575],
    "126": [0.35, 0.34444, 0, 0, 0.575],
    "160": [0, 0, 0, 0, 0.25],
    "163": [0, 0.69444, 0, 0, 0.86853],
    "168": [0, 0.69444, 0, 0, 0.575],
    "172": [0, 0.44444, 0, 0, 0.76666],
    "176": [0, 0.69444, 0, 0, 0.86944],
    "177": [0.13333, 0.63333, 0, 0, 0.89444],
    "184": [0.17014, 0, 0, 0, 0.51111],
    "198": [0, 0.68611, 0, 0, 1.04166],
    "215": [0.13333, 0.63333, 0, 0, 0.89444],
    "216": [0.04861, 0.73472, 0, 0, 0.89444],
    "223": [0, 0.69444, 0, 0, 0.59722],
    "230": [0, 0.44444, 0, 0, 0.83055],
    "247": [0.13333, 0.63333, 0, 0, 0.89444],
    "248": [0.09722, 0.54167, 0, 0, 0.575],
    "305": [0, 0.44444, 0, 0, 0.31944],
    "338": [0, 0.68611, 0, 0, 1.16944],
    "339": [0, 0.44444, 0, 0, 0.89444],
    "567": [0.19444, 0.44444, 0, 0, 0.35139],
    "710": [0, 0.69444, 0, 0, 0.575],
    "711": [0, 0.63194, 0, 0, 0.575],
    "713": [0, 0.59611, 0, 0, 0.575],
    "714": [0, 0.69444, 0, 0, 0.575],
    "715": [0, 0.69444, 0, 0, 0.575],
    "728": [0, 0.69444, 0, 0, 0.575],
    "729": [0, 0.69444, 0, 0, 0.31944],
    "730": [0, 0.69444, 0, 0, 0.86944],
    "732": [0, 0.69444, 0, 0, 0.575],
    "733": [0, 0.69444, 0, 0, 0.575],
    "915": [0, 0.68611, 0, 0, 0.69166],
    "916": [0, 0.68611, 0, 0, 0.95833],
    "920": [0, 0.68611, 0, 0, 0.89444],
    "923": [0, 0.68611, 0, 0, 0.80555],
    "926": [0, 0.68611, 0, 0, 0.76666],
    "928": [0, 0.68611, 0, 0, 0.9],
    "931": [0, 0.68611, 0, 0, 0.83055],
    "933": [0, 0.68611, 0, 0, 0.89444],
    "934": [0, 0.68611, 0, 0, 0.83055],
    "936": [0, 0.68611, 0, 0, 0.89444],
    "937": [0, 0.68611, 0, 0, 0.83055],
    "8211": [0, 0.44444, 0.03194, 0, 0.575],
    "8212": [0, 0.44444, 0.03194, 0, 1.14999],
    "8216": [0, 0.69444, 0, 0, 0.31944],
    "8217": [0, 0.69444, 0, 0, 0.31944],
    "8220": [0, 0.69444, 0, 0, 0.60278],
    "8221": [0, 0.69444, 0, 0, 0.60278],
    "8224": [0.19444, 0.69444, 0, 0, 0.51111],
    "8225": [0.19444, 0.69444, 0, 0, 0.51111],
    "8242": [0, 0.55556, 0, 0, 0.34444],
    "8407": [0, 0.72444, 0.15486, 0, 0.575],
    "8463": [0, 0.69444, 0, 0, 0.66759],
    "8465": [0, 0.69444, 0, 0, 0.83055],
    "8467": [0, 0.69444, 0, 0, 0.47361],
    "8472": [0.19444, 0.44444, 0, 0, 0.74027],
    "8476": [0, 0.69444, 0, 0, 0.83055],
    "8501": [0, 0.69444, 0, 0, 0.70277],
    "8592": [-0.10889, 0.39111, 0, 0, 1.14999],
    "8593": [0.19444, 0.69444, 0, 0, 0.575],
    "8594": [-0.10889, 0.39111, 0, 0, 1.14999],
    "8595": [0.19444, 0.69444, 0, 0, 0.575],
    "8596": [-0.10889, 0.39111, 0, 0, 1.14999],
    "8597": [0.25, 0.75, 0, 0, 0.575],
    "8598": [0.19444, 0.69444, 0, 0, 1.14999],
    "8599": [0.19444, 0.69444, 0, 0, 1.14999],
    "8600": [0.19444, 0.69444, 0, 0, 1.14999],
    "8601": [0.19444, 0.69444, 0, 0, 1.14999],
    "8636": [-0.10889, 0.39111, 0, 0, 1.14999],
    "8637": [-0.10889, 0.39111, 0, 0, 1.14999],
    "8640": [-0.10889, 0.39111, 0, 0, 1.14999],
    "8641": [-0.10889, 0.39111, 0, 0, 1.14999],
    "8656": [-0.10889, 0.39111, 0, 0, 1.14999],
    "8657": [0.19444, 0.69444, 0, 0, 0.70277],
    "8658": [-0.10889, 0.39111, 0, 0, 1.14999],
    "8659": [0.19444, 0.69444, 0, 0, 0.70277],
    "8660": [-0.10889, 0.39111, 0, 0, 1.14999],
    "8661": [0.25, 0.75, 0, 0, 0.70277],
    "8704": [0, 0.69444, 0, 0, 0.63889],
    "8706": [0, 0.69444, 0.06389, 0, 0.62847],
    "8707": [0, 0.69444, 0, 0, 0.63889],
    "8709": [0.05556, 0.75, 0, 0, 0.575],
    "8711": [0, 0.68611, 0, 0, 0.95833],
    "8712": [0.08556, 0.58556, 0, 0, 0.76666],
    "8715": [0.08556, 0.58556, 0, 0, 0.76666],
    "8722": [0.13333, 0.63333, 0, 0, 0.89444],
    "8723": [0.13333, 0.63333, 0, 0, 0.89444],
    "8725": [0.25, 0.75, 0, 0, 0.575],
    "8726": [0.25, 0.75, 0, 0, 0.575],
    "8727": [-0.02778, 0.47222, 0, 0, 0.575],
    "8728": [-0.02639, 0.47361, 0, 0, 0.575],
    "8729": [-0.02639, 0.47361, 0, 0, 0.575],
    "8730": [0.18, 0.82, 0, 0, 0.95833],
    "8733": [0, 0.44444, 0, 0, 0.89444],
    "8734": [0, 0.44444, 0, 0, 1.14999],
    "8736": [0, 0.69224, 0, 0, 0.72222],
    "8739": [0.25, 0.75, 0, 0, 0.31944],
    "8741": [0.25, 0.75, 0, 0, 0.575],
    "8743": [0, 0.55556, 0, 0, 0.76666],
    "8744": [0, 0.55556, 0, 0, 0.76666],
    "8745": [0, 0.55556, 0, 0, 0.76666],
    "8746": [0, 0.55556, 0, 0, 0.76666],
    "8747": [0.19444, 0.69444, 0.12778, 0, 0.56875],
    "8764": [-0.10889, 0.39111, 0, 0, 0.89444],
    "8768": [0.19444, 0.69444, 0, 0, 0.31944],
    "8771": [222e-5, 0.50222, 0, 0, 0.89444],
    "8773": [0.027, 0.638, 0, 0, 0.894],
    "8776": [0.02444, 0.52444, 0, 0, 0.89444],
    "8781": [222e-5, 0.50222, 0, 0, 0.89444],
    "8801": [222e-5, 0.50222, 0, 0, 0.89444],
    "8804": [0.19667, 0.69667, 0, 0, 0.89444],
    "8805": [0.19667, 0.69667, 0, 0, 0.89444],
    "8810": [0.08556, 0.58556, 0, 0, 1.14999],
    "8811": [0.08556, 0.58556, 0, 0, 1.14999],
    "8826": [0.08556, 0.58556, 0, 0, 0.89444],
    "8827": [0.08556, 0.58556, 0, 0, 0.89444],
    "8834": [0.08556, 0.58556, 0, 0, 0.89444],
    "8835": [0.08556, 0.58556, 0, 0, 0.89444],
    "8838": [0.19667, 0.69667, 0, 0, 0.89444],
    "8839": [0.19667, 0.69667, 0, 0, 0.89444],
    "8846": [0, 0.55556, 0, 0, 0.76666],
    "8849": [0.19667, 0.69667, 0, 0, 0.89444],
    "8850": [0.19667, 0.69667, 0, 0, 0.89444],
    "8851": [0, 0.55556, 0, 0, 0.76666],
    "8852": [0, 0.55556, 0, 0, 0.76666],
    "8853": [0.13333, 0.63333, 0, 0, 0.89444],
    "8854": [0.13333, 0.63333, 0, 0, 0.89444],
    "8855": [0.13333, 0.63333, 0, 0, 0.89444],
    "8856": [0.13333, 0.63333, 0, 0, 0.89444],
    "8857": [0.13333, 0.63333, 0, 0, 0.89444],
    "8866": [0, 0.69444, 0, 0, 0.70277],
    "8867": [0, 0.69444, 0, 0, 0.70277],
    "8868": [0, 0.69444, 0, 0, 0.89444],
    "8869": [0, 0.69444, 0, 0, 0.89444],
    "8900": [-0.02639, 0.47361, 0, 0, 0.575],
    "8901": [-0.02639, 0.47361, 0, 0, 0.31944],
    "8902": [-0.02778, 0.47222, 0, 0, 0.575],
    "8968": [0.25, 0.75, 0, 0, 0.51111],
    "8969": [0.25, 0.75, 0, 0, 0.51111],
    "8970": [0.25, 0.75, 0, 0, 0.51111],
    "8971": [0.25, 0.75, 0, 0, 0.51111],
    "8994": [-0.13889, 0.36111, 0, 0, 1.14999],
    "8995": [-0.13889, 0.36111, 0, 0, 1.14999],
    "9651": [0.19444, 0.69444, 0, 0, 1.02222],
    "9657": [-0.02778, 0.47222, 0, 0, 0.575],
    "9661": [0.19444, 0.69444, 0, 0, 1.02222],
    "9667": [-0.02778, 0.47222, 0, 0, 0.575],
    "9711": [0.19444, 0.69444, 0, 0, 1.14999],
    "9824": [0.12963, 0.69444, 0, 0, 0.89444],
    "9825": [0.12963, 0.69444, 0, 0, 0.89444],
    "9826": [0.12963, 0.69444, 0, 0, 0.89444],
    "9827": [0.12963, 0.69444, 0, 0, 0.89444],
    "9837": [0, 0.75, 0, 0, 0.44722],
    "9838": [0.19444, 0.69444, 0, 0, 0.44722],
    "9839": [0.19444, 0.69444, 0, 0, 0.44722],
    "10216": [0.25, 0.75, 0, 0, 0.44722],
    "10217": [0.25, 0.75, 0, 0, 0.44722],
    "10815": [0, 0.68611, 0, 0, 0.9],
    "10927": [0.19667, 0.69667, 0, 0, 0.89444],
    "10928": [0.19667, 0.69667, 0, 0, 0.89444],
    "57376": [0.19444, 0.69444, 0, 0, 0]
  },
  "Main-BoldItalic": {
    "32": [0, 0, 0, 0, 0.25],
    "33": [0, 0.69444, 0.11417, 0, 0.38611],
    "34": [0, 0.69444, 0.07939, 0, 0.62055],
    "35": [0.19444, 0.69444, 0.06833, 0, 0.94444],
    "37": [0.05556, 0.75, 0.12861, 0, 0.94444],
    "38": [0, 0.69444, 0.08528, 0, 0.88555],
    "39": [0, 0.69444, 0.12945, 0, 0.35555],
    "40": [0.25, 0.75, 0.15806, 0, 0.47333],
    "41": [0.25, 0.75, 0.03306, 0, 0.47333],
    "42": [0, 0.75, 0.14333, 0, 0.59111],
    "43": [0.10333, 0.60333, 0.03306, 0, 0.88555],
    "44": [0.19444, 0.14722, 0, 0, 0.35555],
    "45": [0, 0.44444, 0.02611, 0, 0.41444],
    "46": [0, 0.14722, 0, 0, 0.35555],
    "47": [0.25, 0.75, 0.15806, 0, 0.59111],
    "48": [0, 0.64444, 0.13167, 0, 0.59111],
    "49": [0, 0.64444, 0.13167, 0, 0.59111],
    "50": [0, 0.64444, 0.13167, 0, 0.59111],
    "51": [0, 0.64444, 0.13167, 0, 0.59111],
    "52": [0.19444, 0.64444, 0.13167, 0, 0.59111],
    "53": [0, 0.64444, 0.13167, 0, 0.59111],
    "54": [0, 0.64444, 0.13167, 0, 0.59111],
    "55": [0.19444, 0.64444, 0.13167, 0, 0.59111],
    "56": [0, 0.64444, 0.13167, 0, 0.59111],
    "57": [0, 0.64444, 0.13167, 0, 0.59111],
    "58": [0, 0.44444, 0.06695, 0, 0.35555],
    "59": [0.19444, 0.44444, 0.06695, 0, 0.35555],
    "61": [-0.10889, 0.39111, 0.06833, 0, 0.88555],
    "63": [0, 0.69444, 0.11472, 0, 0.59111],
    "64": [0, 0.69444, 0.09208, 0, 0.88555],
    "65": [0, 0.68611, 0, 0, 0.86555],
    "66": [0, 0.68611, 0.0992, 0, 0.81666],
    "67": [0, 0.68611, 0.14208, 0, 0.82666],
    "68": [0, 0.68611, 0.09062, 0, 0.87555],
    "69": [0, 0.68611, 0.11431, 0, 0.75666],
    "70": [0, 0.68611, 0.12903, 0, 0.72722],
    "71": [0, 0.68611, 0.07347, 0, 0.89527],
    "72": [0, 0.68611, 0.17208, 0, 0.8961],
    "73": [0, 0.68611, 0.15681, 0, 0.47166],
    "74": [0, 0.68611, 0.145, 0, 0.61055],
    "75": [0, 0.68611, 0.14208, 0, 0.89499],
    "76": [0, 0.68611, 0, 0, 0.69777],
    "77": [0, 0.68611, 0.17208, 0, 1.07277],
    "78": [0, 0.68611, 0.17208, 0, 0.8961],
    "79": [0, 0.68611, 0.09062, 0, 0.85499],
    "80": [0, 0.68611, 0.0992, 0, 0.78721],
    "81": [0.19444, 0.68611, 0.09062, 0, 0.85499],
    "82": [0, 0.68611, 0.02559, 0, 0.85944],
    "83": [0, 0.68611, 0.11264, 0, 0.64999],
    "84": [0, 0.68611, 0.12903, 0, 0.7961],
    "85": [0, 0.68611, 0.17208, 0, 0.88083],
    "86": [0, 0.68611, 0.18625, 0, 0.86555],
    "87": [0, 0.68611, 0.18625, 0, 1.15999],
    "88": [0, 0.68611, 0.15681, 0, 0.86555],
    "89": [0, 0.68611, 0.19803, 0, 0.86555],
    "90": [0, 0.68611, 0.14208, 0, 0.70888],
    "91": [0.25, 0.75, 0.1875, 0, 0.35611],
    "93": [0.25, 0.75, 0.09972, 0, 0.35611],
    "94": [0, 0.69444, 0.06709, 0, 0.59111],
    "95": [0.31, 0.13444, 0.09811, 0, 0.59111],
    "97": [0, 0.44444, 0.09426, 0, 0.59111],
    "98": [0, 0.69444, 0.07861, 0, 0.53222],
    "99": [0, 0.44444, 0.05222, 0, 0.53222],
    "100": [0, 0.69444, 0.10861, 0, 0.59111],
    "101": [0, 0.44444, 0.085, 0, 0.53222],
    "102": [0.19444, 0.69444, 0.21778, 0, 0.4],
    "103": [0.19444, 0.44444, 0.105, 0, 0.53222],
    "104": [0, 0.69444, 0.09426, 0, 0.59111],
    "105": [0, 0.69326, 0.11387, 0, 0.35555],
    "106": [0.19444, 0.69326, 0.1672, 0, 0.35555],
    "107": [0, 0.69444, 0.11111, 0, 0.53222],
    "108": [0, 0.69444, 0.10861, 0, 0.29666],
    "109": [0, 0.44444, 0.09426, 0, 0.94444],
    "110": [0, 0.44444, 0.09426, 0, 0.64999],
    "111": [0, 0.44444, 0.07861, 0, 0.59111],
    "112": [0.19444, 0.44444, 0.07861, 0, 0.59111],
    "113": [0.19444, 0.44444, 0.105, 0, 0.53222],
    "114": [0, 0.44444, 0.11111, 0, 0.50167],
    "115": [0, 0.44444, 0.08167, 0, 0.48694],
    "116": [0, 0.63492, 0.09639, 0, 0.385],
    "117": [0, 0.44444, 0.09426, 0, 0.62055],
    "118": [0, 0.44444, 0.11111, 0, 0.53222],
    "119": [0, 0.44444, 0.11111, 0, 0.76777],
    "120": [0, 0.44444, 0.12583, 0, 0.56055],
    "121": [0.19444, 0.44444, 0.105, 0, 0.56166],
    "122": [0, 0.44444, 0.13889, 0, 0.49055],
    "126": [0.35, 0.34444, 0.11472, 0, 0.59111],
    "160": [0, 0, 0, 0, 0.25],
    "168": [0, 0.69444, 0.11473, 0, 0.59111],
    "176": [0, 0.69444, 0, 0, 0.94888],
    "184": [0.17014, 0, 0, 0, 0.53222],
    "198": [0, 0.68611, 0.11431, 0, 1.02277],
    "216": [0.04861, 0.73472, 0.09062, 0, 0.88555],
    "223": [0.19444, 0.69444, 0.09736, 0, 0.665],
    "230": [0, 0.44444, 0.085, 0, 0.82666],
    "248": [0.09722, 0.54167, 0.09458, 0, 0.59111],
    "305": [0, 0.44444, 0.09426, 0, 0.35555],
    "338": [0, 0.68611, 0.11431, 0, 1.14054],
    "339": [0, 0.44444, 0.085, 0, 0.82666],
    "567": [0.19444, 0.44444, 0.04611, 0, 0.385],
    "710": [0, 0.69444, 0.06709, 0, 0.59111],
    "711": [0, 0.63194, 0.08271, 0, 0.59111],
    "713": [0, 0.59444, 0.10444, 0, 0.59111],
    "714": [0, 0.69444, 0.08528, 0, 0.59111],
    "715": [0, 0.69444, 0, 0, 0.59111],
    "728": [0, 0.69444, 0.10333, 0, 0.59111],
    "729": [0, 0.69444, 0.12945, 0, 0.35555],
    "730": [0, 0.69444, 0, 0, 0.94888],
    "732": [0, 0.69444, 0.11472, 0, 0.59111],
    "733": [0, 0.69444, 0.11472, 0, 0.59111],
    "915": [0, 0.68611, 0.12903, 0, 0.69777],
    "916": [0, 0.68611, 0, 0, 0.94444],
    "920": [0, 0.68611, 0.09062, 0, 0.88555],
    "923": [0, 0.68611, 0, 0, 0.80666],
    "926": [0, 0.68611, 0.15092, 0, 0.76777],
    "928": [0, 0.68611, 0.17208, 0, 0.8961],
    "931": [0, 0.68611, 0.11431, 0, 0.82666],
    "933": [0, 0.68611, 0.10778, 0, 0.88555],
    "934": [0, 0.68611, 0.05632, 0, 0.82666],
    "936": [0, 0.68611, 0.10778, 0, 0.88555],
    "937": [0, 0.68611, 0.0992, 0, 0.82666],
    "8211": [0, 0.44444, 0.09811, 0, 0.59111],
    "8212": [0, 0.44444, 0.09811, 0, 1.18221],
    "8216": [0, 0.69444, 0.12945, 0, 0.35555],
    "8217": [0, 0.69444, 0.12945, 0, 0.35555],
    "8220": [0, 0.69444, 0.16772, 0, 0.62055],
    "8221": [0, 0.69444, 0.07939, 0, 0.62055]
  },
  "Main-Italic": {
    "32": [0, 0, 0, 0, 0.25],
    "33": [0, 0.69444, 0.12417, 0, 0.30667],
    "34": [0, 0.69444, 0.06961, 0, 0.51444],
    "35": [0.19444, 0.69444, 0.06616, 0, 0.81777],
    "37": [0.05556, 0.75, 0.13639, 0, 0.81777],
    "38": [0, 0.69444, 0.09694, 0, 0.76666],
    "39": [0, 0.69444, 0.12417, 0, 0.30667],
    "40": [0.25, 0.75, 0.16194, 0, 0.40889],
    "41": [0.25, 0.75, 0.03694, 0, 0.40889],
    "42": [0, 0.75, 0.14917, 0, 0.51111],
    "43": [0.05667, 0.56167, 0.03694, 0, 0.76666],
    "44": [0.19444, 0.10556, 0, 0, 0.30667],
    "45": [0, 0.43056, 0.02826, 0, 0.35778],
    "46": [0, 0.10556, 0, 0, 0.30667],
    "47": [0.25, 0.75, 0.16194, 0, 0.51111],
    "48": [0, 0.64444, 0.13556, 0, 0.51111],
    "49": [0, 0.64444, 0.13556, 0, 0.51111],
    "50": [0, 0.64444, 0.13556, 0, 0.51111],
    "51": [0, 0.64444, 0.13556, 0, 0.51111],
    "52": [0.19444, 0.64444, 0.13556, 0, 0.51111],
    "53": [0, 0.64444, 0.13556, 0, 0.51111],
    "54": [0, 0.64444, 0.13556, 0, 0.51111],
    "55": [0.19444, 0.64444, 0.13556, 0, 0.51111],
    "56": [0, 0.64444, 0.13556, 0, 0.51111],
    "57": [0, 0.64444, 0.13556, 0, 0.51111],
    "58": [0, 0.43056, 0.0582, 0, 0.30667],
    "59": [0.19444, 0.43056, 0.0582, 0, 0.30667],
    "61": [-0.13313, 0.36687, 0.06616, 0, 0.76666],
    "63": [0, 0.69444, 0.1225, 0, 0.51111],
    "64": [0, 0.69444, 0.09597, 0, 0.76666],
    "65": [0, 0.68333, 0, 0, 0.74333],
    "66": [0, 0.68333, 0.10257, 0, 0.70389],
    "67": [0, 0.68333, 0.14528, 0, 0.71555],
    "68": [0, 0.68333, 0.09403, 0, 0.755],
    "69": [0, 0.68333, 0.12028, 0, 0.67833],
    "70": [0, 0.68333, 0.13305, 0, 0.65277],
    "71": [0, 0.68333, 0.08722, 0, 0.77361],
    "72": [0, 0.68333, 0.16389, 0, 0.74333],
    "73": [0, 0.68333, 0.15806, 0, 0.38555],
    "74": [0, 0.68333, 0.14028, 0, 0.525],
    "75": [0, 0.68333, 0.14528, 0, 0.76888],
    "76": [0, 0.68333, 0, 0, 0.62722],
    "77": [0, 0.68333, 0.16389, 0, 0.89666],
    "78": [0, 0.68333, 0.16389, 0, 0.74333],
    "79": [0, 0.68333, 0.09403, 0, 0.76666],
    "80": [0, 0.68333, 0.10257, 0, 0.67833],
    "81": [0.19444, 0.68333, 0.09403, 0, 0.76666],
    "82": [0, 0.68333, 0.03868, 0, 0.72944],
    "83": [0, 0.68333, 0.11972, 0, 0.56222],
    "84": [0, 0.68333, 0.13305, 0, 0.71555],
    "85": [0, 0.68333, 0.16389, 0, 0.74333],
    "86": [0, 0.68333, 0.18361, 0, 0.74333],
    "87": [0, 0.68333, 0.18361, 0, 0.99888],
    "88": [0, 0.68333, 0.15806, 0, 0.74333],
    "89": [0, 0.68333, 0.19383, 0, 0.74333],
    "90": [0, 0.68333, 0.14528, 0, 0.61333],
    "91": [0.25, 0.75, 0.1875, 0, 0.30667],
    "93": [0.25, 0.75, 0.10528, 0, 0.30667],
    "94": [0, 0.69444, 0.06646, 0, 0.51111],
    "95": [0.31, 0.12056, 0.09208, 0, 0.51111],
    "97": [0, 0.43056, 0.07671, 0, 0.51111],
    "98": [0, 0.69444, 0.06312, 0, 0.46],
    "99": [0, 0.43056, 0.05653, 0, 0.46],
    "100": [0, 0.69444, 0.10333, 0, 0.51111],
    "101": [0, 0.43056, 0.07514, 0, 0.46],
    "102": [0.19444, 0.69444, 0.21194, 0, 0.30667],
    "103": [0.19444, 0.43056, 0.08847, 0, 0.46],
    "104": [0, 0.69444, 0.07671, 0, 0.51111],
    "105": [0, 0.65536, 0.1019, 0, 0.30667],
    "106": [0.19444, 0.65536, 0.14467, 0, 0.30667],
    "107": [0, 0.69444, 0.10764, 0, 0.46],
    "108": [0, 0.69444, 0.10333, 0, 0.25555],
    "109": [0, 0.43056, 0.07671, 0, 0.81777],
    "110": [0, 0.43056, 0.07671, 0, 0.56222],
    "111": [0, 0.43056, 0.06312, 0, 0.51111],
    "112": [0.19444, 0.43056, 0.06312, 0, 0.51111],
    "113": [0.19444, 0.43056, 0.08847, 0, 0.46],
    "114": [0, 0.43056, 0.10764, 0, 0.42166],
    "115": [0, 0.43056, 0.08208, 0, 0.40889],
    "116": [0, 0.61508, 0.09486, 0, 0.33222],
    "117": [0, 0.43056, 0.07671, 0, 0.53666],
    "118": [0, 0.43056, 0.10764, 0, 0.46],
    "119": [0, 0.43056, 0.10764, 0, 0.66444],
    "120": [0, 0.43056, 0.12042, 0, 0.46389],
    "121": [0.19444, 0.43056, 0.08847, 0, 0.48555],
    "122": [0, 0.43056, 0.12292, 0, 0.40889],
    "126": [0.35, 0.31786, 0.11585, 0, 0.51111],
    "160": [0, 0, 0, 0, 0.25],
    "168": [0, 0.66786, 0.10474, 0, 0.51111],
    "176": [0, 0.69444, 0, 0, 0.83129],
    "184": [0.17014, 0, 0, 0, 0.46],
    "198": [0, 0.68333, 0.12028, 0, 0.88277],
    "216": [0.04861, 0.73194, 0.09403, 0, 0.76666],
    "223": [0.19444, 0.69444, 0.10514, 0, 0.53666],
    "230": [0, 0.43056, 0.07514, 0, 0.71555],
    "248": [0.09722, 0.52778, 0.09194, 0, 0.51111],
    "338": [0, 0.68333, 0.12028, 0, 0.98499],
    "339": [0, 0.43056, 0.07514, 0, 0.71555],
    "710": [0, 0.69444, 0.06646, 0, 0.51111],
    "711": [0, 0.62847, 0.08295, 0, 0.51111],
    "713": [0, 0.56167, 0.10333, 0, 0.51111],
    "714": [0, 0.69444, 0.09694, 0, 0.51111],
    "715": [0, 0.69444, 0, 0, 0.51111],
    "728": [0, 0.69444, 0.10806, 0, 0.51111],
    "729": [0, 0.66786, 0.11752, 0, 0.30667],
    "730": [0, 0.69444, 0, 0, 0.83129],
    "732": [0, 0.66786, 0.11585, 0, 0.51111],
    "733": [0, 0.69444, 0.1225, 0, 0.51111],
    "915": [0, 0.68333, 0.13305, 0, 0.62722],
    "916": [0, 0.68333, 0, 0, 0.81777],
    "920": [0, 0.68333, 0.09403, 0, 0.76666],
    "923": [0, 0.68333, 0, 0, 0.69222],
    "926": [0, 0.68333, 0.15294, 0, 0.66444],
    "928": [0, 0.68333, 0.16389, 0, 0.74333],
    "931": [0, 0.68333, 0.12028, 0, 0.71555],
    "933": [0, 0.68333, 0.11111, 0, 0.76666],
    "934": [0, 0.68333, 0.05986, 0, 0.71555],
    "936": [0, 0.68333, 0.11111, 0, 0.76666],
    "937": [0, 0.68333, 0.10257, 0, 0.71555],
    "8211": [0, 0.43056, 0.09208, 0, 0.51111],
    "8212": [0, 0.43056, 0.09208, 0, 1.02222],
    "8216": [0, 0.69444, 0.12417, 0, 0.30667],
    "8217": [0, 0.69444, 0.12417, 0, 0.30667],
    "8220": [0, 0.69444, 0.1685, 0, 0.51444],
    "8221": [0, 0.69444, 0.06961, 0, 0.51444],
    "8463": [0, 0.68889, 0, 0, 0.54028]
  },
  "Main-Regular": {
    "32": [0, 0, 0, 0, 0.25],
    "33": [0, 0.69444, 0, 0, 0.27778],
    "34": [0, 0.69444, 0, 0, 0.5],
    "35": [0.19444, 0.69444, 0, 0, 0.83334],
    "36": [0.05556, 0.75, 0, 0, 0.5],
    "37": [0.05556, 0.75, 0, 0, 0.83334],
    "38": [0, 0.69444, 0, 0, 0.77778],
    "39": [0, 0.69444, 0, 0, 0.27778],
    "40": [0.25, 0.75, 0, 0, 0.38889],
    "41": [0.25, 0.75, 0, 0, 0.38889],
    "42": [0, 0.75, 0, 0, 0.5],
    "43": [0.08333, 0.58333, 0, 0, 0.77778],
    "44": [0.19444, 0.10556, 0, 0, 0.27778],
    "45": [0, 0.43056, 0, 0, 0.33333],
    "46": [0, 0.10556, 0, 0, 0.27778],
    "47": [0.25, 0.75, 0, 0, 0.5],
    "48": [0, 0.64444, 0, 0, 0.5],
    "49": [0, 0.64444, 0, 0, 0.5],
    "50": [0, 0.64444, 0, 0, 0.5],
    "51": [0, 0.64444, 0, 0, 0.5],
    "52": [0, 0.64444, 0, 0, 0.5],
    "53": [0, 0.64444, 0, 0, 0.5],
    "54": [0, 0.64444, 0, 0, 0.5],
    "55": [0, 0.64444, 0, 0, 0.5],
    "56": [0, 0.64444, 0, 0, 0.5],
    "57": [0, 0.64444, 0, 0, 0.5],
    "58": [0, 0.43056, 0, 0, 0.27778],
    "59": [0.19444, 0.43056, 0, 0, 0.27778],
    "60": [0.0391, 0.5391, 0, 0, 0.77778],
    "61": [-0.13313, 0.36687, 0, 0, 0.77778],
    "62": [0.0391, 0.5391, 0, 0, 0.77778],
    "63": [0, 0.69444, 0, 0, 0.47222],
    "64": [0, 0.69444, 0, 0, 0.77778],
    "65": [0, 0.68333, 0, 0, 0.75],
    "66": [0, 0.68333, 0, 0, 0.70834],
    "67": [0, 0.68333, 0, 0, 0.72222],
    "68": [0, 0.68333, 0, 0, 0.76389],
    "69": [0, 0.68333, 0, 0, 0.68056],
    "70": [0, 0.68333, 0, 0, 0.65278],
    "71": [0, 0.68333, 0, 0, 0.78472],
    "72": [0, 0.68333, 0, 0, 0.75],
    "73": [0, 0.68333, 0, 0, 0.36111],
    "74": [0, 0.68333, 0, 0, 0.51389],
    "75": [0, 0.68333, 0, 0, 0.77778],
    "76": [0, 0.68333, 0, 0, 0.625],
    "77": [0, 0.68333, 0, 0, 0.91667],
    "78": [0, 0.68333, 0, 0, 0.75],
    "79": [0, 0.68333, 0, 0, 0.77778],
    "80": [0, 0.68333, 0, 0, 0.68056],
    "81": [0.19444, 0.68333, 0, 0, 0.77778],
    "82": [0, 0.68333, 0, 0, 0.73611],
    "83": [0, 0.68333, 0, 0, 0.55556],
    "84": [0, 0.68333, 0, 0, 0.72222],
    "85": [0, 0.68333, 0, 0, 0.75],
    "86": [0, 0.68333, 0.01389, 0, 0.75],
    "87": [0, 0.68333, 0.01389, 0, 1.02778],
    "88": [0, 0.68333, 0, 0, 0.75],
    "89": [0, 0.68333, 0.025, 0, 0.75],
    "90": [0, 0.68333, 0, 0, 0.61111],
    "91": [0.25, 0.75, 0, 0, 0.27778],
    "92": [0.25, 0.75, 0, 0, 0.5],
    "93": [0.25, 0.75, 0, 0, 0.27778],
    "94": [0, 0.69444, 0, 0, 0.5],
    "95": [0.31, 0.12056, 0.02778, 0, 0.5],
    "97": [0, 0.43056, 0, 0, 0.5],
    "98": [0, 0.69444, 0, 0, 0.55556],
    "99": [0, 0.43056, 0, 0, 0.44445],
    "100": [0, 0.69444, 0, 0, 0.55556],
    "101": [0, 0.43056, 0, 0, 0.44445],
    "102": [0, 0.69444, 0.07778, 0, 0.30556],
    "103": [0.19444, 0.43056, 0.01389, 0, 0.5],
    "104": [0, 0.69444, 0, 0, 0.55556],
    "105": [0, 0.66786, 0, 0, 0.27778],
    "106": [0.19444, 0.66786, 0, 0, 0.30556],
    "107": [0, 0.69444, 0, 0, 0.52778],
    "108": [0, 0.69444, 0, 0, 0.27778],
    "109": [0, 0.43056, 0, 0, 0.83334],
    "110": [0, 0.43056, 0, 0, 0.55556],
    "111": [0, 0.43056, 0, 0, 0.5],
    "112": [0.19444, 0.43056, 0, 0, 0.55556],
    "113": [0.19444, 0.43056, 0, 0, 0.52778],
    "114": [0, 0.43056, 0, 0, 0.39167],
    "115": [0, 0.43056, 0, 0, 0.39445],
    "116": [0, 0.61508, 0, 0, 0.38889],
    "117": [0, 0.43056, 0, 0, 0.55556],
    "118": [0, 0.43056, 0.01389, 0, 0.52778],
    "119": [0, 0.43056, 0.01389, 0, 0.72222],
    "120": [0, 0.43056, 0, 0, 0.52778],
    "121": [0.19444, 0.43056, 0.01389, 0, 0.52778],
    "122": [0, 0.43056, 0, 0, 0.44445],
    "123": [0.25, 0.75, 0, 0, 0.5],
    "124": [0.25, 0.75, 0, 0, 0.27778],
    "125": [0.25, 0.75, 0, 0, 0.5],
    "126": [0.35, 0.31786, 0, 0, 0.5],
    "160": [0, 0, 0, 0, 0.25],
    "163": [0, 0.69444, 0, 0, 0.76909],
    "167": [0.19444, 0.69444, 0, 0, 0.44445],
    "168": [0, 0.66786, 0, 0, 0.5],
    "172": [0, 0.43056, 0, 0, 0.66667],
    "176": [0, 0.69444, 0, 0, 0.75],
    "177": [0.08333, 0.58333, 0, 0, 0.77778],
    "182": [0.19444, 0.69444, 0, 0, 0.61111],
    "184": [0.17014, 0, 0, 0, 0.44445],
    "198": [0, 0.68333, 0, 0, 0.90278],
    "215": [0.08333, 0.58333, 0, 0, 0.77778],
    "216": [0.04861, 0.73194, 0, 0, 0.77778],
    "223": [0, 0.69444, 0, 0, 0.5],
    "230": [0, 0.43056, 0, 0, 0.72222],
    "247": [0.08333, 0.58333, 0, 0, 0.77778],
    "248": [0.09722, 0.52778, 0, 0, 0.5],
    "305": [0, 0.43056, 0, 0, 0.27778],
    "338": [0, 0.68333, 0, 0, 1.01389],
    "339": [0, 0.43056, 0, 0, 0.77778],
    "567": [0.19444, 0.43056, 0, 0, 0.30556],
    "710": [0, 0.69444, 0, 0, 0.5],
    "711": [0, 0.62847, 0, 0, 0.5],
    "713": [0, 0.56778, 0, 0, 0.5],
    "714": [0, 0.69444, 0, 0, 0.5],
    "715": [0, 0.69444, 0, 0, 0.5],
    "728": [0, 0.69444, 0, 0, 0.5],
    "729": [0, 0.66786, 0, 0, 0.27778],
    "730": [0, 0.69444, 0, 0, 0.75],
    "732": [0, 0.66786, 0, 0, 0.5],
    "733": [0, 0.69444, 0, 0, 0.5],
    "915": [0, 0.68333, 0, 0, 0.625],
    "916": [0, 0.68333, 0, 0, 0.83334],
    "920": [0, 0.68333, 0, 0, 0.77778],
    "923": [0, 0.68333, 0, 0, 0.69445],
    "926": [0, 0.68333, 0, 0, 0.66667],
    "928": [0, 0.68333, 0, 0, 0.75],
    "931": [0, 0.68333, 0, 0, 0.72222],
    "933": [0, 0.68333, 0, 0, 0.77778],
    "934": [0, 0.68333, 0, 0, 0.72222],
    "936": [0, 0.68333, 0, 0, 0.77778],
    "937": [0, 0.68333, 0, 0, 0.72222],
    "8211": [0, 0.43056, 0.02778, 0, 0.5],
    "8212": [0, 0.43056, 0.02778, 0, 1],
    "8216": [0, 0.69444, 0, 0, 0.27778],
    "8217": [0, 0.69444, 0, 0, 0.27778],
    "8220": [0, 0.69444, 0, 0, 0.5],
    "8221": [0, 0.69444, 0, 0, 0.5],
    "8224": [0.19444, 0.69444, 0, 0, 0.44445],
    "8225": [0.19444, 0.69444, 0, 0, 0.44445],
    "8230": [0, 0.123, 0, 0, 1.172],
    "8242": [0, 0.55556, 0, 0, 0.275],
    "8407": [0, 0.71444, 0.15382, 0, 0.5],
    "8463": [0, 0.68889, 0, 0, 0.54028],
    "8465": [0, 0.69444, 0, 0, 0.72222],
    "8467": [0, 0.69444, 0, 0.11111, 0.41667],
    "8472": [0.19444, 0.43056, 0, 0.11111, 0.63646],
    "8476": [0, 0.69444, 0, 0, 0.72222],
    "8501": [0, 0.69444, 0, 0, 0.61111],
    "8592": [-0.13313, 0.36687, 0, 0, 1],
    "8593": [0.19444, 0.69444, 0, 0, 0.5],
    "8594": [-0.13313, 0.36687, 0, 0, 1],
    "8595": [0.19444, 0.69444, 0, 0, 0.5],
    "8596": [-0.13313, 0.36687, 0, 0, 1],
    "8597": [0.25, 0.75, 0, 0, 0.5],
    "8598": [0.19444, 0.69444, 0, 0, 1],
    "8599": [0.19444, 0.69444, 0, 0, 1],
    "8600": [0.19444, 0.69444, 0, 0, 1],
    "8601": [0.19444, 0.69444, 0, 0, 1],
    "8614": [0.011, 0.511, 0, 0, 1],
    "8617": [0.011, 0.511, 0, 0, 1.126],
    "8618": [0.011, 0.511, 0, 0, 1.126],
    "8636": [-0.13313, 0.36687, 0, 0, 1],
    "8637": [-0.13313, 0.36687, 0, 0, 1],
    "8640": [-0.13313, 0.36687, 0, 0, 1],
    "8641": [-0.13313, 0.36687, 0, 0, 1],
    "8652": [0.011, 0.671, 0, 0, 1],
    "8656": [-0.13313, 0.36687, 0, 0, 1],
    "8657": [0.19444, 0.69444, 0, 0, 0.61111],
    "8658": [-0.13313, 0.36687, 0, 0, 1],
    "8659": [0.19444, 0.69444, 0, 0, 0.61111],
    "8660": [-0.13313, 0.36687, 0, 0, 1],
    "8661": [0.25, 0.75, 0, 0, 0.61111],
    "8704": [0, 0.69444, 0, 0, 0.55556],
    "8706": [0, 0.69444, 0.05556, 0.08334, 0.5309],
    "8707": [0, 0.69444, 0, 0, 0.55556],
    "8709": [0.05556, 0.75, 0, 0, 0.5],
    "8711": [0, 0.68333, 0, 0, 0.83334],
    "8712": [0.0391, 0.5391, 0, 0, 0.66667],
    "8715": [0.0391, 0.5391, 0, 0, 0.66667],
    "8722": [0.08333, 0.58333, 0, 0, 0.77778],
    "8723": [0.08333, 0.58333, 0, 0, 0.77778],
    "8725": [0.25, 0.75, 0, 0, 0.5],
    "8726": [0.25, 0.75, 0, 0, 0.5],
    "8727": [-0.03472, 0.46528, 0, 0, 0.5],
    "8728": [-0.05555, 0.44445, 0, 0, 0.5],
    "8729": [-0.05555, 0.44445, 0, 0, 0.5],
    "8730": [0.2, 0.8, 0, 0, 0.83334],
    "8733": [0, 0.43056, 0, 0, 0.77778],
    "8734": [0, 0.43056, 0, 0, 1],
    "8736": [0, 0.69224, 0, 0, 0.72222],
    "8739": [0.25, 0.75, 0, 0, 0.27778],
    "8741": [0.25, 0.75, 0, 0, 0.5],
    "8743": [0, 0.55556, 0, 0, 0.66667],
    "8744": [0, 0.55556, 0, 0, 0.66667],
    "8745": [0, 0.55556, 0, 0, 0.66667],
    "8746": [0, 0.55556, 0, 0, 0.66667],
    "8747": [0.19444, 0.69444, 0.11111, 0, 0.41667],
    "8764": [-0.13313, 0.36687, 0, 0, 0.77778],
    "8768": [0.19444, 0.69444, 0, 0, 0.27778],
    "8771": [-0.03625, 0.46375, 0, 0, 0.77778],
    "8773": [-0.022, 0.589, 0, 0, 0.778],
    "8776": [-0.01688, 0.48312, 0, 0, 0.77778],
    "8781": [-0.03625, 0.46375, 0, 0, 0.77778],
    "8784": [-0.133, 0.673, 0, 0, 0.778],
    "8801": [-0.03625, 0.46375, 0, 0, 0.77778],
    "8804": [0.13597, 0.63597, 0, 0, 0.77778],
    "8805": [0.13597, 0.63597, 0, 0, 0.77778],
    "8810": [0.0391, 0.5391, 0, 0, 1],
    "8811": [0.0391, 0.5391, 0, 0, 1],
    "8826": [0.0391, 0.5391, 0, 0, 0.77778],
    "8827": [0.0391, 0.5391, 0, 0, 0.77778],
    "8834": [0.0391, 0.5391, 0, 0, 0.77778],
    "8835": [0.0391, 0.5391, 0, 0, 0.77778],
    "8838": [0.13597, 0.63597, 0, 0, 0.77778],
    "8839": [0.13597, 0.63597, 0, 0, 0.77778],
    "8846": [0, 0.55556, 0, 0, 0.66667],
    "8849": [0.13597, 0.63597, 0, 0, 0.77778],
    "8850": [0.13597, 0.63597, 0, 0, 0.77778],
    "8851": [0, 0.55556, 0, 0, 0.66667],
    "8852": [0, 0.55556, 0, 0, 0.66667],
    "8853": [0.08333, 0.58333, 0, 0, 0.77778],
    "8854": [0.08333, 0.58333, 0, 0, 0.77778],
    "8855": [0.08333, 0.58333, 0, 0, 0.77778],
    "8856": [0.08333, 0.58333, 0, 0, 0.77778],
    "8857": [0.08333, 0.58333, 0, 0, 0.77778],
    "8866": [0, 0.69444, 0, 0, 0.61111],
    "8867": [0, 0.69444, 0, 0, 0.61111],
    "8868": [0, 0.69444, 0, 0, 0.77778],
    "8869": [0, 0.69444, 0, 0, 0.77778],
    "8872": [0.249, 0.75, 0, 0, 0.867],
    "8900": [-0.05555, 0.44445, 0, 0, 0.5],
    "8901": [-0.05555, 0.44445, 0, 0, 0.27778],
    "8902": [-0.03472, 0.46528, 0, 0, 0.5],
    "8904": [5e-3, 0.505, 0, 0, 0.9],
    "8942": [0.03, 0.903, 0, 0, 0.278],
    "8943": [-0.19, 0.313, 0, 0, 1.172],
    "8945": [-0.1, 0.823, 0, 0, 1.282],
    "8968": [0.25, 0.75, 0, 0, 0.44445],
    "8969": [0.25, 0.75, 0, 0, 0.44445],
    "8970": [0.25, 0.75, 0, 0, 0.44445],
    "8971": [0.25, 0.75, 0, 0, 0.44445],
    "8994": [-0.14236, 0.35764, 0, 0, 1],
    "8995": [-0.14236, 0.35764, 0, 0, 1],
    "9136": [0.244, 0.744, 0, 0, 0.412],
    "9137": [0.244, 0.745, 0, 0, 0.412],
    "9651": [0.19444, 0.69444, 0, 0, 0.88889],
    "9657": [-0.03472, 0.46528, 0, 0, 0.5],
    "9661": [0.19444, 0.69444, 0, 0, 0.88889],
    "9667": [-0.03472, 0.46528, 0, 0, 0.5],
    "9711": [0.19444, 0.69444, 0, 0, 1],
    "9824": [0.12963, 0.69444, 0, 0, 0.77778],
    "9825": [0.12963, 0.69444, 0, 0, 0.77778],
    "9826": [0.12963, 0.69444, 0, 0, 0.77778],
    "9827": [0.12963, 0.69444, 0, 0, 0.77778],
    "9837": [0, 0.75, 0, 0, 0.38889],
    "9838": [0.19444, 0.69444, 0, 0, 0.38889],
    "9839": [0.19444, 0.69444, 0, 0, 0.38889],
    "10216": [0.25, 0.75, 0, 0, 0.38889],
    "10217": [0.25, 0.75, 0, 0, 0.38889],
    "10222": [0.244, 0.744, 0, 0, 0.412],
    "10223": [0.244, 0.745, 0, 0, 0.412],
    "10229": [0.011, 0.511, 0, 0, 1.609],
    "10230": [0.011, 0.511, 0, 0, 1.638],
    "10231": [0.011, 0.511, 0, 0, 1.859],
    "10232": [0.024, 0.525, 0, 0, 1.609],
    "10233": [0.024, 0.525, 0, 0, 1.638],
    "10234": [0.024, 0.525, 0, 0, 1.858],
    "10236": [0.011, 0.511, 0, 0, 1.638],
    "10815": [0, 0.68333, 0, 0, 0.75],
    "10927": [0.13597, 0.63597, 0, 0, 0.77778],
    "10928": [0.13597, 0.63597, 0, 0, 0.77778],
    "57376": [0.19444, 0.69444, 0, 0, 0]
  },
  "Math-BoldItalic": {
    "32": [0, 0, 0, 0, 0.25],
    "48": [0, 0.44444, 0, 0, 0.575],
    "49": [0, 0.44444, 0, 0, 0.575],
    "50": [0, 0.44444, 0, 0, 0.575],
    "51": [0.19444, 0.44444, 0, 0, 0.575],
    "52": [0.19444, 0.44444, 0, 0, 0.575],
    "53": [0.19444, 0.44444, 0, 0, 0.575],
    "54": [0, 0.64444, 0, 0, 0.575],
    "55": [0.19444, 0.44444, 0, 0, 0.575],
    "56": [0, 0.64444, 0, 0, 0.575],
    "57": [0.19444, 0.44444, 0, 0, 0.575],
    "65": [0, 0.68611, 0, 0, 0.86944],
    "66": [0, 0.68611, 0.04835, 0, 0.8664],
    "67": [0, 0.68611, 0.06979, 0, 0.81694],
    "68": [0, 0.68611, 0.03194, 0, 0.93812],
    "69": [0, 0.68611, 0.05451, 0, 0.81007],
    "70": [0, 0.68611, 0.15972, 0, 0.68889],
    "71": [0, 0.68611, 0, 0, 0.88673],
    "72": [0, 0.68611, 0.08229, 0, 0.98229],
    "73": [0, 0.68611, 0.07778, 0, 0.51111],
    "74": [0, 0.68611, 0.10069, 0, 0.63125],
    "75": [0, 0.68611, 0.06979, 0, 0.97118],
    "76": [0, 0.68611, 0, 0, 0.75555],
    "77": [0, 0.68611, 0.11424, 0, 1.14201],
    "78": [0, 0.68611, 0.11424, 0, 0.95034],
    "79": [0, 0.68611, 0.03194, 0, 0.83666],
    "80": [0, 0.68611, 0.15972, 0, 0.72309],
    "81": [0.19444, 0.68611, 0, 0, 0.86861],
    "82": [0, 0.68611, 421e-5, 0, 0.87235],
    "83": [0, 0.68611, 0.05382, 0, 0.69271],
    "84": [0, 0.68611, 0.15972, 0, 0.63663],
    "85": [0, 0.68611, 0.11424, 0, 0.80027],
    "86": [0, 0.68611, 0.25555, 0, 0.67778],
    "87": [0, 0.68611, 0.15972, 0, 1.09305],
    "88": [0, 0.68611, 0.07778, 0, 0.94722],
    "89": [0, 0.68611, 0.25555, 0, 0.67458],
    "90": [0, 0.68611, 0.06979, 0, 0.77257],
    "97": [0, 0.44444, 0, 0, 0.63287],
    "98": [0, 0.69444, 0, 0, 0.52083],
    "99": [0, 0.44444, 0, 0, 0.51342],
    "100": [0, 0.69444, 0, 0, 0.60972],
    "101": [0, 0.44444, 0, 0, 0.55361],
    "102": [0.19444, 0.69444, 0.11042, 0, 0.56806],
    "103": [0.19444, 0.44444, 0.03704, 0, 0.5449],
    "104": [0, 0.69444, 0, 0, 0.66759],
    "105": [0, 0.69326, 0, 0, 0.4048],
    "106": [0.19444, 0.69326, 0.0622, 0, 0.47083],
    "107": [0, 0.69444, 0.01852, 0, 0.6037],
    "108": [0, 0.69444, 88e-4, 0, 0.34815],
    "109": [0, 0.44444, 0, 0, 1.0324],
    "110": [0, 0.44444, 0, 0, 0.71296],
    "111": [0, 0.44444, 0, 0, 0.58472],
    "112": [0.19444, 0.44444, 0, 0, 0.60092],
    "113": [0.19444, 0.44444, 0.03704, 0, 0.54213],
    "114": [0, 0.44444, 0.03194, 0, 0.5287],
    "115": [0, 0.44444, 0, 0, 0.53125],
    "116": [0, 0.63492, 0, 0, 0.41528],
    "117": [0, 0.44444, 0, 0, 0.68102],
    "118": [0, 0.44444, 0.03704, 0, 0.56666],
    "119": [0, 0.44444, 0.02778, 0, 0.83148],
    "120": [0, 0.44444, 0, 0, 0.65903],
    "121": [0.19444, 0.44444, 0.03704, 0, 0.59028],
    "122": [0, 0.44444, 0.04213, 0, 0.55509],
    "160": [0, 0, 0, 0, 0.25],
    "915": [0, 0.68611, 0.15972, 0, 0.65694],
    "916": [0, 0.68611, 0, 0, 0.95833],
    "920": [0, 0.68611, 0.03194, 0, 0.86722],
    "923": [0, 0.68611, 0, 0, 0.80555],
    "926": [0, 0.68611, 0.07458, 0, 0.84125],
    "928": [0, 0.68611, 0.08229, 0, 0.98229],
    "931": [0, 0.68611, 0.05451, 0, 0.88507],
    "933": [0, 0.68611, 0.15972, 0, 0.67083],
    "934": [0, 0.68611, 0, 0, 0.76666],
    "936": [0, 0.68611, 0.11653, 0, 0.71402],
    "937": [0, 0.68611, 0.04835, 0, 0.8789],
    "945": [0, 0.44444, 0, 0, 0.76064],
    "946": [0.19444, 0.69444, 0.03403, 0, 0.65972],
    "947": [0.19444, 0.44444, 0.06389, 0, 0.59003],
    "948": [0, 0.69444, 0.03819, 0, 0.52222],
    "949": [0, 0.44444, 0, 0, 0.52882],
    "950": [0.19444, 0.69444, 0.06215, 0, 0.50833],
    "951": [0.19444, 0.44444, 0.03704, 0, 0.6],
    "952": [0, 0.69444, 0.03194, 0, 0.5618],
    "953": [0, 0.44444, 0, 0, 0.41204],
    "954": [0, 0.44444, 0, 0, 0.66759],
    "955": [0, 0.69444, 0, 0, 0.67083],
    "956": [0.19444, 0.44444, 0, 0, 0.70787],
    "957": [0, 0.44444, 0.06898, 0, 0.57685],
    "958": [0.19444, 0.69444, 0.03021, 0, 0.50833],
    "959": [0, 0.44444, 0, 0, 0.58472],
    "960": [0, 0.44444, 0.03704, 0, 0.68241],
    "961": [0.19444, 0.44444, 0, 0, 0.6118],
    "962": [0.09722, 0.44444, 0.07917, 0, 0.42361],
    "963": [0, 0.44444, 0.03704, 0, 0.68588],
    "964": [0, 0.44444, 0.13472, 0, 0.52083],
    "965": [0, 0.44444, 0.03704, 0, 0.63055],
    "966": [0.19444, 0.44444, 0, 0, 0.74722],
    "967": [0.19444, 0.44444, 0, 0, 0.71805],
    "968": [0.19444, 0.69444, 0.03704, 0, 0.75833],
    "969": [0, 0.44444, 0.03704, 0, 0.71782],
    "977": [0, 0.69444, 0, 0, 0.69155],
    "981": [0.19444, 0.69444, 0, 0, 0.7125],
    "982": [0, 0.44444, 0.03194, 0, 0.975],
    "1009": [0.19444, 0.44444, 0, 0, 0.6118],
    "1013": [0, 0.44444, 0, 0, 0.48333],
    "57649": [0, 0.44444, 0, 0, 0.39352],
    "57911": [0.19444, 0.44444, 0, 0, 0.43889]
  },
  "Math-Italic": {
    "32": [0, 0, 0, 0, 0.25],
    "48": [0, 0.43056, 0, 0, 0.5],
    "49": [0, 0.43056, 0, 0, 0.5],
    "50": [0, 0.43056, 0, 0, 0.5],
    "51": [0.19444, 0.43056, 0, 0, 0.5],
    "52": [0.19444, 0.43056, 0, 0, 0.5],
    "53": [0.19444, 0.43056, 0, 0, 0.5],
    "54": [0, 0.64444, 0, 0, 0.5],
    "55": [0.19444, 0.43056, 0, 0, 0.5],
    "56": [0, 0.64444, 0, 0, 0.5],
    "57": [0.19444, 0.43056, 0, 0, 0.5],
    "65": [0, 0.68333, 0, 0.13889, 0.75],
    "66": [0, 0.68333, 0.05017, 0.08334, 0.75851],
    "67": [0, 0.68333, 0.07153, 0.08334, 0.71472],
    "68": [0, 0.68333, 0.02778, 0.05556, 0.82792],
    "69": [0, 0.68333, 0.05764, 0.08334, 0.7382],
    "70": [0, 0.68333, 0.13889, 0.08334, 0.64306],
    "71": [0, 0.68333, 0, 0.08334, 0.78625],
    "72": [0, 0.68333, 0.08125, 0.05556, 0.83125],
    "73": [0, 0.68333, 0.07847, 0.11111, 0.43958],
    "74": [0, 0.68333, 0.09618, 0.16667, 0.55451],
    "75": [0, 0.68333, 0.07153, 0.05556, 0.84931],
    "76": [0, 0.68333, 0, 0.02778, 0.68056],
    "77": [0, 0.68333, 0.10903, 0.08334, 0.97014],
    "78": [0, 0.68333, 0.10903, 0.08334, 0.80347],
    "79": [0, 0.68333, 0.02778, 0.08334, 0.76278],
    "80": [0, 0.68333, 0.13889, 0.08334, 0.64201],
    "81": [0.19444, 0.68333, 0, 0.08334, 0.79056],
    "82": [0, 0.68333, 773e-5, 0.08334, 0.75929],
    "83": [0, 0.68333, 0.05764, 0.08334, 0.6132],
    "84": [0, 0.68333, 0.13889, 0.08334, 0.58438],
    "85": [0, 0.68333, 0.10903, 0.02778, 0.68278],
    "86": [0, 0.68333, 0.22222, 0, 0.58333],
    "87": [0, 0.68333, 0.13889, 0, 0.94445],
    "88": [0, 0.68333, 0.07847, 0.08334, 0.82847],
    "89": [0, 0.68333, 0.22222, 0, 0.58056],
    "90": [0, 0.68333, 0.07153, 0.08334, 0.68264],
    "97": [0, 0.43056, 0, 0, 0.52859],
    "98": [0, 0.69444, 0, 0, 0.42917],
    "99": [0, 0.43056, 0, 0.05556, 0.43276],
    "100": [0, 0.69444, 0, 0.16667, 0.52049],
    "101": [0, 0.43056, 0, 0.05556, 0.46563],
    "102": [0.19444, 0.69444, 0.10764, 0.16667, 0.48959],
    "103": [0.19444, 0.43056, 0.03588, 0.02778, 0.47697],
    "104": [0, 0.69444, 0, 0, 0.57616],
    "105": [0, 0.65952, 0, 0, 0.34451],
    "106": [0.19444, 0.65952, 0.05724, 0, 0.41181],
    "107": [0, 0.69444, 0.03148, 0, 0.5206],
    "108": [0, 0.69444, 0.01968, 0.08334, 0.29838],
    "109": [0, 0.43056, 0, 0, 0.87801],
    "110": [0, 0.43056, 0, 0, 0.60023],
    "111": [0, 0.43056, 0, 0.05556, 0.48472],
    "112": [0.19444, 0.43056, 0, 0.08334, 0.50313],
    "113": [0.19444, 0.43056, 0.03588, 0.08334, 0.44641],
    "114": [0, 0.43056, 0.02778, 0.05556, 0.45116],
    "115": [0, 0.43056, 0, 0.05556, 0.46875],
    "116": [0, 0.61508, 0, 0.08334, 0.36111],
    "117": [0, 0.43056, 0, 0.02778, 0.57246],
    "118": [0, 0.43056, 0.03588, 0.02778, 0.48472],
    "119": [0, 0.43056, 0.02691, 0.08334, 0.71592],
    "120": [0, 0.43056, 0, 0.02778, 0.57153],
    "121": [0.19444, 0.43056, 0.03588, 0.05556, 0.49028],
    "122": [0, 0.43056, 0.04398, 0.05556, 0.46505],
    "160": [0, 0, 0, 0, 0.25],
    "915": [0, 0.68333, 0.13889, 0.08334, 0.61528],
    "916": [0, 0.68333, 0, 0.16667, 0.83334],
    "920": [0, 0.68333, 0.02778, 0.08334, 0.76278],
    "923": [0, 0.68333, 0, 0.16667, 0.69445],
    "926": [0, 0.68333, 0.07569, 0.08334, 0.74236],
    "928": [0, 0.68333, 0.08125, 0.05556, 0.83125],
    "931": [0, 0.68333, 0.05764, 0.08334, 0.77986],
    "933": [0, 0.68333, 0.13889, 0.05556, 0.58333],
    "934": [0, 0.68333, 0, 0.08334, 0.66667],
    "936": [0, 0.68333, 0.11, 0.05556, 0.61222],
    "937": [0, 0.68333, 0.05017, 0.08334, 0.7724],
    "945": [0, 0.43056, 37e-4, 0.02778, 0.6397],
    "946": [0.19444, 0.69444, 0.05278, 0.08334, 0.56563],
    "947": [0.19444, 0.43056, 0.05556, 0, 0.51773],
    "948": [0, 0.69444, 0.03785, 0.05556, 0.44444],
    "949": [0, 0.43056, 0, 0.08334, 0.46632],
    "950": [0.19444, 0.69444, 0.07378, 0.08334, 0.4375],
    "951": [0.19444, 0.43056, 0.03588, 0.05556, 0.49653],
    "952": [0, 0.69444, 0.02778, 0.08334, 0.46944],
    "953": [0, 0.43056, 0, 0.05556, 0.35394],
    "954": [0, 0.43056, 0, 0, 0.57616],
    "955": [0, 0.69444, 0, 0, 0.58334],
    "956": [0.19444, 0.43056, 0, 0.02778, 0.60255],
    "957": [0, 0.43056, 0.06366, 0.02778, 0.49398],
    "958": [0.19444, 0.69444, 0.04601, 0.11111, 0.4375],
    "959": [0, 0.43056, 0, 0.05556, 0.48472],
    "960": [0, 0.43056, 0.03588, 0, 0.57003],
    "961": [0.19444, 0.43056, 0, 0.08334, 0.51702],
    "962": [0.09722, 0.43056, 0.07986, 0.08334, 0.36285],
    "963": [0, 0.43056, 0.03588, 0, 0.57141],
    "964": [0, 0.43056, 0.1132, 0.02778, 0.43715],
    "965": [0, 0.43056, 0.03588, 0.02778, 0.54028],
    "966": [0.19444, 0.43056, 0, 0.08334, 0.65417],
    "967": [0.19444, 0.43056, 0, 0.05556, 0.62569],
    "968": [0.19444, 0.69444, 0.03588, 0.11111, 0.65139],
    "969": [0, 0.43056, 0.03588, 0, 0.62245],
    "977": [0, 0.69444, 0, 0.08334, 0.59144],
    "981": [0.19444, 0.69444, 0, 0.08334, 0.59583],
    "982": [0, 0.43056, 0.02778, 0, 0.82813],
    "1009": [0.19444, 0.43056, 0, 0.08334, 0.51702],
    "1013": [0, 0.43056, 0, 0.05556, 0.4059],
    "57649": [0, 0.43056, 0, 0.02778, 0.32246],
    "57911": [0.19444, 0.43056, 0, 0.08334, 0.38403]
  },
  "SansSerif-Bold": {
    "32": [0, 0, 0, 0, 0.25],
    "33": [0, 0.69444, 0, 0, 0.36667],
    "34": [0, 0.69444, 0, 0, 0.55834],
    "35": [0.19444, 0.69444, 0, 0, 0.91667],
    "36": [0.05556, 0.75, 0, 0, 0.55],
    "37": [0.05556, 0.75, 0, 0, 1.02912],
    "38": [0, 0.69444, 0, 0, 0.83056],
    "39": [0, 0.69444, 0, 0, 0.30556],
    "40": [0.25, 0.75, 0, 0, 0.42778],
    "41": [0.25, 0.75, 0, 0, 0.42778],
    "42": [0, 0.75, 0, 0, 0.55],
    "43": [0.11667, 0.61667, 0, 0, 0.85556],
    "44": [0.10556, 0.13056, 0, 0, 0.30556],
    "45": [0, 0.45833, 0, 0, 0.36667],
    "46": [0, 0.13056, 0, 0, 0.30556],
    "47": [0.25, 0.75, 0, 0, 0.55],
    "48": [0, 0.69444, 0, 0, 0.55],
    "49": [0, 0.69444, 0, 0, 0.55],
    "50": [0, 0.69444, 0, 0, 0.55],
    "51": [0, 0.69444, 0, 0, 0.55],
    "52": [0, 0.69444, 0, 0, 0.55],
    "53": [0, 0.69444, 0, 0, 0.55],
    "54": [0, 0.69444, 0, 0, 0.55],
    "55": [0, 0.69444, 0, 0, 0.55],
    "56": [0, 0.69444, 0, 0, 0.55],
    "57": [0, 0.69444, 0, 0, 0.55],
    "58": [0, 0.45833, 0, 0, 0.30556],
    "59": [0.10556, 0.45833, 0, 0, 0.30556],
    "61": [-0.09375, 0.40625, 0, 0, 0.85556],
    "63": [0, 0.69444, 0, 0, 0.51945],
    "64": [0, 0.69444, 0, 0, 0.73334],
    "65": [0, 0.69444, 0, 0, 0.73334],
    "66": [0, 0.69444, 0, 0, 0.73334],
    "67": [0, 0.69444, 0, 0, 0.70278],
    "68": [0, 0.69444, 0, 0, 0.79445],
    "69": [0, 0.69444, 0, 0, 0.64167],
    "70": [0, 0.69444, 0, 0, 0.61111],
    "71": [0, 0.69444, 0, 0, 0.73334],
    "72": [0, 0.69444, 0, 0, 0.79445],
    "73": [0, 0.69444, 0, 0, 0.33056],
    "74": [0, 0.69444, 0, 0, 0.51945],
    "75": [0, 0.69444, 0, 0, 0.76389],
    "76": [0, 0.69444, 0, 0, 0.58056],
    "77": [0, 0.69444, 0, 0, 0.97778],
    "78": [0, 0.69444, 0, 0, 0.79445],
    "79": [0, 0.69444, 0, 0, 0.79445],
    "80": [0, 0.69444, 0, 0, 0.70278],
    "81": [0.10556, 0.69444, 0, 0, 0.79445],
    "82": [0, 0.69444, 0, 0, 0.70278],
    "83": [0, 0.69444, 0, 0, 0.61111],
    "84": [0, 0.69444, 0, 0, 0.73334],
    "85": [0, 0.69444, 0, 0, 0.76389],
    "86": [0, 0.69444, 0.01528, 0, 0.73334],
    "87": [0, 0.69444, 0.01528, 0, 1.03889],
    "88": [0, 0.69444, 0, 0, 0.73334],
    "89": [0, 0.69444, 0.0275, 0, 0.73334],
    "90": [0, 0.69444, 0, 0, 0.67223],
    "91": [0.25, 0.75, 0, 0, 0.34306],
    "93": [0.25, 0.75, 0, 0, 0.34306],
    "94": [0, 0.69444, 0, 0, 0.55],
    "95": [0.35, 0.10833, 0.03056, 0, 0.55],
    "97": [0, 0.45833, 0, 0, 0.525],
    "98": [0, 0.69444, 0, 0, 0.56111],
    "99": [0, 0.45833, 0, 0, 0.48889],
    "100": [0, 0.69444, 0, 0, 0.56111],
    "101": [0, 0.45833, 0, 0, 0.51111],
    "102": [0, 0.69444, 0.07639, 0, 0.33611],
    "103": [0.19444, 0.45833, 0.01528, 0, 0.55],
    "104": [0, 0.69444, 0, 0, 0.56111],
    "105": [0, 0.69444, 0, 0, 0.25556],
    "106": [0.19444, 0.69444, 0, 0, 0.28611],
    "107": [0, 0.69444, 0, 0, 0.53056],
    "108": [0, 0.69444, 0, 0, 0.25556],
    "109": [0, 0.45833, 0, 0, 0.86667],
    "110": [0, 0.45833, 0, 0, 0.56111],
    "111": [0, 0.45833, 0, 0, 0.55],
    "112": [0.19444, 0.45833, 0, 0, 0.56111],
    "113": [0.19444, 0.45833, 0, 0, 0.56111],
    "114": [0, 0.45833, 0.01528, 0, 0.37222],
    "115": [0, 0.45833, 0, 0, 0.42167],
    "116": [0, 0.58929, 0, 0, 0.40417],
    "117": [0, 0.45833, 0, 0, 0.56111],
    "118": [0, 0.45833, 0.01528, 0, 0.5],
    "119": [0, 0.45833, 0.01528, 0, 0.74445],
    "120": [0, 0.45833, 0, 0, 0.5],
    "121": [0.19444, 0.45833, 0.01528, 0, 0.5],
    "122": [0, 0.45833, 0, 0, 0.47639],
    "126": [0.35, 0.34444, 0, 0, 0.55],
    "160": [0, 0, 0, 0, 0.25],
    "168": [0, 0.69444, 0, 0, 0.55],
    "176": [0, 0.69444, 0, 0, 0.73334],
    "180": [0, 0.69444, 0, 0, 0.55],
    "184": [0.17014, 0, 0, 0, 0.48889],
    "305": [0, 0.45833, 0, 0, 0.25556],
    "567": [0.19444, 0.45833, 0, 0, 0.28611],
    "710": [0, 0.69444, 0, 0, 0.55],
    "711": [0, 0.63542, 0, 0, 0.55],
    "713": [0, 0.63778, 0, 0, 0.55],
    "728": [0, 0.69444, 0, 0, 0.55],
    "729": [0, 0.69444, 0, 0, 0.30556],
    "730": [0, 0.69444, 0, 0, 0.73334],
    "732": [0, 0.69444, 0, 0, 0.55],
    "733": [0, 0.69444, 0, 0, 0.55],
    "915": [0, 0.69444, 0, 0, 0.58056],
    "916": [0, 0.69444, 0, 0, 0.91667],
    "920": [0, 0.69444, 0, 0, 0.85556],
    "923": [0, 0.69444, 0, 0, 0.67223],
    "926": [0, 0.69444, 0, 0, 0.73334],
    "928": [0, 0.69444, 0, 0, 0.79445],
    "931": [0, 0.69444, 0, 0, 0.79445],
    "933": [0, 0.69444, 0, 0, 0.85556],
    "934": [0, 0.69444, 0, 0, 0.79445],
    "936": [0, 0.69444, 0, 0, 0.85556],
    "937": [0, 0.69444, 0, 0, 0.79445],
    "8211": [0, 0.45833, 0.03056, 0, 0.55],
    "8212": [0, 0.45833, 0.03056, 0, 1.10001],
    "8216": [0, 0.69444, 0, 0, 0.30556],
    "8217": [0, 0.69444, 0, 0, 0.30556],
    "8220": [0, 0.69444, 0, 0, 0.55834],
    "8221": [0, 0.69444, 0, 0, 0.55834]
  },
  "SansSerif-Italic": {
    "32": [0, 0, 0, 0, 0.25],
    "33": [0, 0.69444, 0.05733, 0, 0.31945],
    "34": [0, 0.69444, 316e-5, 0, 0.5],
    "35": [0.19444, 0.69444, 0.05087, 0, 0.83334],
    "36": [0.05556, 0.75, 0.11156, 0, 0.5],
    "37": [0.05556, 0.75, 0.03126, 0, 0.83334],
    "38": [0, 0.69444, 0.03058, 0, 0.75834],
    "39": [0, 0.69444, 0.07816, 0, 0.27778],
    "40": [0.25, 0.75, 0.13164, 0, 0.38889],
    "41": [0.25, 0.75, 0.02536, 0, 0.38889],
    "42": [0, 0.75, 0.11775, 0, 0.5],
    "43": [0.08333, 0.58333, 0.02536, 0, 0.77778],
    "44": [0.125, 0.08333, 0, 0, 0.27778],
    "45": [0, 0.44444, 0.01946, 0, 0.33333],
    "46": [0, 0.08333, 0, 0, 0.27778],
    "47": [0.25, 0.75, 0.13164, 0, 0.5],
    "48": [0, 0.65556, 0.11156, 0, 0.5],
    "49": [0, 0.65556, 0.11156, 0, 0.5],
    "50": [0, 0.65556, 0.11156, 0, 0.5],
    "51": [0, 0.65556, 0.11156, 0, 0.5],
    "52": [0, 0.65556, 0.11156, 0, 0.5],
    "53": [0, 0.65556, 0.11156, 0, 0.5],
    "54": [0, 0.65556, 0.11156, 0, 0.5],
    "55": [0, 0.65556, 0.11156, 0, 0.5],
    "56": [0, 0.65556, 0.11156, 0, 0.5],
    "57": [0, 0.65556, 0.11156, 0, 0.5],
    "58": [0, 0.44444, 0.02502, 0, 0.27778],
    "59": [0.125, 0.44444, 0.02502, 0, 0.27778],
    "61": [-0.13, 0.37, 0.05087, 0, 0.77778],
    "63": [0, 0.69444, 0.11809, 0, 0.47222],
    "64": [0, 0.69444, 0.07555, 0, 0.66667],
    "65": [0, 0.69444, 0, 0, 0.66667],
    "66": [0, 0.69444, 0.08293, 0, 0.66667],
    "67": [0, 0.69444, 0.11983, 0, 0.63889],
    "68": [0, 0.69444, 0.07555, 0, 0.72223],
    "69": [0, 0.69444, 0.11983, 0, 0.59722],
    "70": [0, 0.69444, 0.13372, 0, 0.56945],
    "71": [0, 0.69444, 0.11983, 0, 0.66667],
    "72": [0, 0.69444, 0.08094, 0, 0.70834],
    "73": [0, 0.69444, 0.13372, 0, 0.27778],
    "74": [0, 0.69444, 0.08094, 0, 0.47222],
    "75": [0, 0.69444, 0.11983, 0, 0.69445],
    "76": [0, 0.69444, 0, 0, 0.54167],
    "77": [0, 0.69444, 0.08094, 0, 0.875],
    "78": [0, 0.69444, 0.08094, 0, 0.70834],
    "79": [0, 0.69444, 0.07555, 0, 0.73611],
    "80": [0, 0.69444, 0.08293, 0, 0.63889],
    "81": [0.125, 0.69444, 0.07555, 0, 0.73611],
    "82": [0, 0.69444, 0.08293, 0, 0.64584],
    "83": [0, 0.69444, 0.09205, 0, 0.55556],
    "84": [0, 0.69444, 0.13372, 0, 0.68056],
    "85": [0, 0.69444, 0.08094, 0, 0.6875],
    "86": [0, 0.69444, 0.1615, 0, 0.66667],
    "87": [0, 0.69444, 0.1615, 0, 0.94445],
    "88": [0, 0.69444, 0.13372, 0, 0.66667],
    "89": [0, 0.69444, 0.17261, 0, 0.66667],
    "90": [0, 0.69444, 0.11983, 0, 0.61111],
    "91": [0.25, 0.75, 0.15942, 0, 0.28889],
    "93": [0.25, 0.75, 0.08719, 0, 0.28889],
    "94": [0, 0.69444, 0.0799, 0, 0.5],
    "95": [0.35, 0.09444, 0.08616, 0, 0.5],
    "97": [0, 0.44444, 981e-5, 0, 0.48056],
    "98": [0, 0.69444, 0.03057, 0, 0.51667],
    "99": [0, 0.44444, 0.08336, 0, 0.44445],
    "100": [0, 0.69444, 0.09483, 0, 0.51667],
    "101": [0, 0.44444, 0.06778, 0, 0.44445],
    "102": [0, 0.69444, 0.21705, 0, 0.30556],
    "103": [0.19444, 0.44444, 0.10836, 0, 0.5],
    "104": [0, 0.69444, 0.01778, 0, 0.51667],
    "105": [0, 0.67937, 0.09718, 0, 0.23889],
    "106": [0.19444, 0.67937, 0.09162, 0, 0.26667],
    "107": [0, 0.69444, 0.08336, 0, 0.48889],
    "108": [0, 0.69444, 0.09483, 0, 0.23889],
    "109": [0, 0.44444, 0.01778, 0, 0.79445],
    "110": [0, 0.44444, 0.01778, 0, 0.51667],
    "111": [0, 0.44444, 0.06613, 0, 0.5],
    "112": [0.19444, 0.44444, 0.0389, 0, 0.51667],
    "113": [0.19444, 0.44444, 0.04169, 0, 0.51667],
    "114": [0, 0.44444, 0.10836, 0, 0.34167],
    "115": [0, 0.44444, 0.0778, 0, 0.38333],
    "116": [0, 0.57143, 0.07225, 0, 0.36111],
    "117": [0, 0.44444, 0.04169, 0, 0.51667],
    "118": [0, 0.44444, 0.10836, 0, 0.46111],
    "119": [0, 0.44444, 0.10836, 0, 0.68334],
    "120": [0, 0.44444, 0.09169, 0, 0.46111],
    "121": [0.19444, 0.44444, 0.10836, 0, 0.46111],
    "122": [0, 0.44444, 0.08752, 0, 0.43472],
    "126": [0.35, 0.32659, 0.08826, 0, 0.5],
    "160": [0, 0, 0, 0, 0.25],
    "168": [0, 0.67937, 0.06385, 0, 0.5],
    "176": [0, 0.69444, 0, 0, 0.73752],
    "184": [0.17014, 0, 0, 0, 0.44445],
    "305": [0, 0.44444, 0.04169, 0, 0.23889],
    "567": [0.19444, 0.44444, 0.04169, 0, 0.26667],
    "710": [0, 0.69444, 0.0799, 0, 0.5],
    "711": [0, 0.63194, 0.08432, 0, 0.5],
    "713": [0, 0.60889, 0.08776, 0, 0.5],
    "714": [0, 0.69444, 0.09205, 0, 0.5],
    "715": [0, 0.69444, 0, 0, 0.5],
    "728": [0, 0.69444, 0.09483, 0, 0.5],
    "729": [0, 0.67937, 0.07774, 0, 0.27778],
    "730": [0, 0.69444, 0, 0, 0.73752],
    "732": [0, 0.67659, 0.08826, 0, 0.5],
    "733": [0, 0.69444, 0.09205, 0, 0.5],
    "915": [0, 0.69444, 0.13372, 0, 0.54167],
    "916": [0, 0.69444, 0, 0, 0.83334],
    "920": [0, 0.69444, 0.07555, 0, 0.77778],
    "923": [0, 0.69444, 0, 0, 0.61111],
    "926": [0, 0.69444, 0.12816, 0, 0.66667],
    "928": [0, 0.69444, 0.08094, 0, 0.70834],
    "931": [0, 0.69444, 0.11983, 0, 0.72222],
    "933": [0, 0.69444, 0.09031, 0, 0.77778],
    "934": [0, 0.69444, 0.04603, 0, 0.72222],
    "936": [0, 0.69444, 0.09031, 0, 0.77778],
    "937": [0, 0.69444, 0.08293, 0, 0.72222],
    "8211": [0, 0.44444, 0.08616, 0, 0.5],
    "8212": [0, 0.44444, 0.08616, 0, 1],
    "8216": [0, 0.69444, 0.07816, 0, 0.27778],
    "8217": [0, 0.69444, 0.07816, 0, 0.27778],
    "8220": [0, 0.69444, 0.14205, 0, 0.5],
    "8221": [0, 0.69444, 316e-5, 0, 0.5]
  },
  "SansSerif-Regular": {
    "32": [0, 0, 0, 0, 0.25],
    "33": [0, 0.69444, 0, 0, 0.31945],
    "34": [0, 0.69444, 0, 0, 0.5],
    "35": [0.19444, 0.69444, 0, 0, 0.83334],
    "36": [0.05556, 0.75, 0, 0, 0.5],
    "37": [0.05556, 0.75, 0, 0, 0.83334],
    "38": [0, 0.69444, 0, 0, 0.75834],
    "39": [0, 0.69444, 0, 0, 0.27778],
    "40": [0.25, 0.75, 0, 0, 0.38889],
    "41": [0.25, 0.75, 0, 0, 0.38889],
    "42": [0, 0.75, 0, 0, 0.5],
    "43": [0.08333, 0.58333, 0, 0, 0.77778],
    "44": [0.125, 0.08333, 0, 0, 0.27778],
    "45": [0, 0.44444, 0, 0, 0.33333],
    "46": [0, 0.08333, 0, 0, 0.27778],
    "47": [0.25, 0.75, 0, 0, 0.5],
    "48": [0, 0.65556, 0, 0, 0.5],
    "49": [0, 0.65556, 0, 0, 0.5],
    "50": [0, 0.65556, 0, 0, 0.5],
    "51": [0, 0.65556, 0, 0, 0.5],
    "52": [0, 0.65556, 0, 0, 0.5],
    "53": [0, 0.65556, 0, 0, 0.5],
    "54": [0, 0.65556, 0, 0, 0.5],
    "55": [0, 0.65556, 0, 0, 0.5],
    "56": [0, 0.65556, 0, 0, 0.5],
    "57": [0, 0.65556, 0, 0, 0.5],
    "58": [0, 0.44444, 0, 0, 0.27778],
    "59": [0.125, 0.44444, 0, 0, 0.27778],
    "61": [-0.13, 0.37, 0, 0, 0.77778],
    "63": [0, 0.69444, 0, 0, 0.47222],
    "64": [0, 0.69444, 0, 0, 0.66667],
    "65": [0, 0.69444, 0, 0, 0.66667],
    "66": [0, 0.69444, 0, 0, 0.66667],
    "67": [0, 0.69444, 0, 0, 0.63889],
    "68": [0, 0.69444, 0, 0, 0.72223],
    "69": [0, 0.69444, 0, 0, 0.59722],
    "70": [0, 0.69444, 0, 0, 0.56945],
    "71": [0, 0.69444, 0, 0, 0.66667],
    "72": [0, 0.69444, 0, 0, 0.70834],
    "73": [0, 0.69444, 0, 0, 0.27778],
    "74": [0, 0.69444, 0, 0, 0.47222],
    "75": [0, 0.69444, 0, 0, 0.69445],
    "76": [0, 0.69444, 0, 0, 0.54167],
    "77": [0, 0.69444, 0, 0, 0.875],
    "78": [0, 0.69444, 0, 0, 0.70834],
    "79": [0, 0.69444, 0, 0, 0.73611],
    "80": [0, 0.69444, 0, 0, 0.63889],
    "81": [0.125, 0.69444, 0, 0, 0.73611],
    "82": [0, 0.69444, 0, 0, 0.64584],
    "83": [0, 0.69444, 0, 0, 0.55556],
    "84": [0, 0.69444, 0, 0, 0.68056],
    "85": [0, 0.69444, 0, 0, 0.6875],
    "86": [0, 0.69444, 0.01389, 0, 0.66667],
    "87": [0, 0.69444, 0.01389, 0, 0.94445],
    "88": [0, 0.69444, 0, 0, 0.66667],
    "89": [0, 0.69444, 0.025, 0, 0.66667],
    "90": [0, 0.69444, 0, 0, 0.61111],
    "91": [0.25, 0.75, 0, 0, 0.28889],
    "93": [0.25, 0.75, 0, 0, 0.28889],
    "94": [0, 0.69444, 0, 0, 0.5],
    "95": [0.35, 0.09444, 0.02778, 0, 0.5],
    "97": [0, 0.44444, 0, 0, 0.48056],
    "98": [0, 0.69444, 0, 0, 0.51667],
    "99": [0, 0.44444, 0, 0, 0.44445],
    "100": [0, 0.69444, 0, 0, 0.51667],
    "101": [0, 0.44444, 0, 0, 0.44445],
    "102": [0, 0.69444, 0.06944, 0, 0.30556],
    "103": [0.19444, 0.44444, 0.01389, 0, 0.5],
    "104": [0, 0.69444, 0, 0, 0.51667],
    "105": [0, 0.67937, 0, 0, 0.23889],
    "106": [0.19444, 0.67937, 0, 0, 0.26667],
    "107": [0, 0.69444, 0, 0, 0.48889],
    "108": [0, 0.69444, 0, 0, 0.23889],
    "109": [0, 0.44444, 0, 0, 0.79445],
    "110": [0, 0.44444, 0, 0, 0.51667],
    "111": [0, 0.44444, 0, 0, 0.5],
    "112": [0.19444, 0.44444, 0, 0, 0.51667],
    "113": [0.19444, 0.44444, 0, 0, 0.51667],
    "114": [0, 0.44444, 0.01389, 0, 0.34167],
    "115": [0, 0.44444, 0, 0, 0.38333],
    "116": [0, 0.57143, 0, 0, 0.36111],
    "117": [0, 0.44444, 0, 0, 0.51667],
    "118": [0, 0.44444, 0.01389, 0, 0.46111],
    "119": [0, 0.44444, 0.01389, 0, 0.68334],
    "120": [0, 0.44444, 0, 0, 0.46111],
    "121": [0.19444, 0.44444, 0.01389, 0, 0.46111],
    "122": [0, 0.44444, 0, 0, 0.43472],
    "126": [0.35, 0.32659, 0, 0, 0.5],
    "160": [0, 0, 0, 0, 0.25],
    "168": [0, 0.67937, 0, 0, 0.5],
    "176": [0, 0.69444, 0, 0, 0.66667],
    "184": [0.17014, 0, 0, 0, 0.44445],
    "305": [0, 0.44444, 0, 0, 0.23889],
    "567": [0.19444, 0.44444, 0, 0, 0.26667],
    "710": [0, 0.69444, 0, 0, 0.5],
    "711": [0, 0.63194, 0, 0, 0.5],
    "713": [0, 0.60889, 0, 0, 0.5],
    "714": [0, 0.69444, 0, 0, 0.5],
    "715": [0, 0.69444, 0, 0, 0.5],
    "728": [0, 0.69444, 0, 0, 0.5],
    "729": [0, 0.67937, 0, 0, 0.27778],
    "730": [0, 0.69444, 0, 0, 0.66667],
    "732": [0, 0.67659, 0, 0, 0.5],
    "733": [0, 0.69444, 0, 0, 0.5],
    "915": [0, 0.69444, 0, 0, 0.54167],
    "916": [0, 0.69444, 0, 0, 0.83334],
    "920": [0, 0.69444, 0, 0, 0.77778],
    "923": [0, 0.69444, 0, 0, 0.61111],
    "926": [0, 0.69444, 0, 0, 0.66667],
    "928": [0, 0.69444, 0, 0, 0.70834],
    "931": [0, 0.69444, 0, 0, 0.72222],
    "933": [0, 0.69444, 0, 0, 0.77778],
    "934": [0, 0.69444, 0, 0, 0.72222],
    "936": [0, 0.69444, 0, 0, 0.77778],
    "937": [0, 0.69444, 0, 0, 0.72222],
    "8211": [0, 0.44444, 0.02778, 0, 0.5],
    "8212": [0, 0.44444, 0.02778, 0, 1],
    "8216": [0, 0.69444, 0, 0, 0.27778],
    "8217": [0, 0.69444, 0, 0, 0.27778],
    "8220": [0, 0.69444, 0, 0, 0.5],
    "8221": [0, 0.69444, 0, 0, 0.5]
  },
  "Script-Regular": {
    "32": [0, 0, 0, 0, 0.25],
    "65": [0, 0.7, 0.22925, 0, 0.80253],
    "66": [0, 0.7, 0.04087, 0, 0.90757],
    "67": [0, 0.7, 0.1689, 0, 0.66619],
    "68": [0, 0.7, 0.09371, 0, 0.77443],
    "69": [0, 0.7, 0.18583, 0, 0.56162],
    "70": [0, 0.7, 0.13634, 0, 0.89544],
    "71": [0, 0.7, 0.17322, 0, 0.60961],
    "72": [0, 0.7, 0.29694, 0, 0.96919],
    "73": [0, 0.7, 0.19189, 0, 0.80907],
    "74": [0.27778, 0.7, 0.19189, 0, 1.05159],
    "75": [0, 0.7, 0.31259, 0, 0.91364],
    "76": [0, 0.7, 0.19189, 0, 0.87373],
    "77": [0, 0.7, 0.15981, 0, 1.08031],
    "78": [0, 0.7, 0.3525, 0, 0.9015],
    "79": [0, 0.7, 0.08078, 0, 0.73787],
    "80": [0, 0.7, 0.08078, 0, 1.01262],
    "81": [0, 0.7, 0.03305, 0, 0.88282],
    "82": [0, 0.7, 0.06259, 0, 0.85],
    "83": [0, 0.7, 0.19189, 0, 0.86767],
    "84": [0, 0.7, 0.29087, 0, 0.74697],
    "85": [0, 0.7, 0.25815, 0, 0.79996],
    "86": [0, 0.7, 0.27523, 0, 0.62204],
    "87": [0, 0.7, 0.27523, 0, 0.80532],
    "88": [0, 0.7, 0.26006, 0, 0.94445],
    "89": [0, 0.7, 0.2939, 0, 0.70961],
    "90": [0, 0.7, 0.24037, 0, 0.8212],
    "160": [0, 0, 0, 0, 0.25]
  },
  "Size1-Regular": {
    "32": [0, 0, 0, 0, 0.25],
    "40": [0.35001, 0.85, 0, 0, 0.45834],
    "41": [0.35001, 0.85, 0, 0, 0.45834],
    "47": [0.35001, 0.85, 0, 0, 0.57778],
    "91": [0.35001, 0.85, 0, 0, 0.41667],
    "92": [0.35001, 0.85, 0, 0, 0.57778],
    "93": [0.35001, 0.85, 0, 0, 0.41667],
    "123": [0.35001, 0.85, 0, 0, 0.58334],
    "125": [0.35001, 0.85, 0, 0, 0.58334],
    "160": [0, 0, 0, 0, 0.25],
    "710": [0, 0.72222, 0, 0, 0.55556],
    "732": [0, 0.72222, 0, 0, 0.55556],
    "770": [0, 0.72222, 0, 0, 0.55556],
    "771": [0, 0.72222, 0, 0, 0.55556],
    "8214": [-99e-5, 0.601, 0, 0, 0.77778],
    "8593": [1e-5, 0.6, 0, 0, 0.66667],
    "8595": [1e-5, 0.6, 0, 0, 0.66667],
    "8657": [1e-5, 0.6, 0, 0, 0.77778],
    "8659": [1e-5, 0.6, 0, 0, 0.77778],
    "8719": [0.25001, 0.75, 0, 0, 0.94445],
    "8720": [0.25001, 0.75, 0, 0, 0.94445],
    "8721": [0.25001, 0.75, 0, 0, 1.05556],
    "8730": [0.35001, 0.85, 0, 0, 1],
    "8739": [-599e-5, 0.606, 0, 0, 0.33333],
    "8741": [-599e-5, 0.606, 0, 0, 0.55556],
    "8747": [0.30612, 0.805, 0.19445, 0, 0.47222],
    "8748": [0.306, 0.805, 0.19445, 0, 0.47222],
    "8749": [0.306, 0.805, 0.19445, 0, 0.47222],
    "8750": [0.30612, 0.805, 0.19445, 0, 0.47222],
    "8896": [0.25001, 0.75, 0, 0, 0.83334],
    "8897": [0.25001, 0.75, 0, 0, 0.83334],
    "8898": [0.25001, 0.75, 0, 0, 0.83334],
    "8899": [0.25001, 0.75, 0, 0, 0.83334],
    "8968": [0.35001, 0.85, 0, 0, 0.47222],
    "8969": [0.35001, 0.85, 0, 0, 0.47222],
    "8970": [0.35001, 0.85, 0, 0, 0.47222],
    "8971": [0.35001, 0.85, 0, 0, 0.47222],
    "9168": [-99e-5, 0.601, 0, 0, 0.66667],
    "10216": [0.35001, 0.85, 0, 0, 0.47222],
    "10217": [0.35001, 0.85, 0, 0, 0.47222],
    "10752": [0.25001, 0.75, 0, 0, 1.11111],
    "10753": [0.25001, 0.75, 0, 0, 1.11111],
    "10754": [0.25001, 0.75, 0, 0, 1.11111],
    "10756": [0.25001, 0.75, 0, 0, 0.83334],
    "10758": [0.25001, 0.75, 0, 0, 0.83334]
  },
  "Size2-Regular": {
    "32": [0, 0, 0, 0, 0.25],
    "40": [0.65002, 1.15, 0, 0, 0.59722],
    "41": [0.65002, 1.15, 0, 0, 0.59722],
    "47": [0.65002, 1.15, 0, 0, 0.81111],
    "91": [0.65002, 1.15, 0, 0, 0.47222],
    "92": [0.65002, 1.15, 0, 0, 0.81111],
    "93": [0.65002, 1.15, 0, 0, 0.47222],
    "123": [0.65002, 1.15, 0, 0, 0.66667],
    "125": [0.65002, 1.15, 0, 0, 0.66667],
    "160": [0, 0, 0, 0, 0.25],
    "710": [0, 0.75, 0, 0, 1],
    "732": [0, 0.75, 0, 0, 1],
    "770": [0, 0.75, 0, 0, 1],
    "771": [0, 0.75, 0, 0, 1],
    "8719": [0.55001, 1.05, 0, 0, 1.27778],
    "8720": [0.55001, 1.05, 0, 0, 1.27778],
    "8721": [0.55001, 1.05, 0, 0, 1.44445],
    "8730": [0.65002, 1.15, 0, 0, 1],
    "8747": [0.86225, 1.36, 0.44445, 0, 0.55556],
    "8748": [0.862, 1.36, 0.44445, 0, 0.55556],
    "8749": [0.862, 1.36, 0.44445, 0, 0.55556],
    "8750": [0.86225, 1.36, 0.44445, 0, 0.55556],
    "8896": [0.55001, 1.05, 0, 0, 1.11111],
    "8897": [0.55001, 1.05, 0, 0, 1.11111],
    "8898": [0.55001, 1.05, 0, 0, 1.11111],
    "8899": [0.55001, 1.05, 0, 0, 1.11111],
    "8968": [0.65002, 1.15, 0, 0, 0.52778],
    "8969": [0.65002, 1.15, 0, 0, 0.52778],
    "8970": [0.65002, 1.15, 0, 0, 0.52778],
    "8971": [0.65002, 1.15, 0, 0, 0.52778],
    "10216": [0.65002, 1.15, 0, 0, 0.61111],
    "10217": [0.65002, 1.15, 0, 0, 0.61111],
    "10752": [0.55001, 1.05, 0, 0, 1.51112],
    "10753": [0.55001, 1.05, 0, 0, 1.51112],
    "10754": [0.55001, 1.05, 0, 0, 1.51112],
    "10756": [0.55001, 1.05, 0, 0, 1.11111],
    "10758": [0.55001, 1.05, 0, 0, 1.11111]
  },
  "Size3-Regular": {
    "32": [0, 0, 0, 0, 0.25],
    "40": [0.95003, 1.45, 0, 0, 0.73611],
    "41": [0.95003, 1.45, 0, 0, 0.73611],
    "47": [0.95003, 1.45, 0, 0, 1.04445],
    "91": [0.95003, 1.45, 0, 0, 0.52778],
    "92": [0.95003, 1.45, 0, 0, 1.04445],
    "93": [0.95003, 1.45, 0, 0, 0.52778],
    "123": [0.95003, 1.45, 0, 0, 0.75],
    "125": [0.95003, 1.45, 0, 0, 0.75],
    "160": [0, 0, 0, 0, 0.25],
    "710": [0, 0.75, 0, 0, 1.44445],
    "732": [0, 0.75, 0, 0, 1.44445],
    "770": [0, 0.75, 0, 0, 1.44445],
    "771": [0, 0.75, 0, 0, 1.44445],
    "8730": [0.95003, 1.45, 0, 0, 1],
    "8968": [0.95003, 1.45, 0, 0, 0.58334],
    "8969": [0.95003, 1.45, 0, 0, 0.58334],
    "8970": [0.95003, 1.45, 0, 0, 0.58334],
    "8971": [0.95003, 1.45, 0, 0, 0.58334],
    "10216": [0.95003, 1.45, 0, 0, 0.75],
    "10217": [0.95003, 1.45, 0, 0, 0.75]
  },
  "Size4-Regular": {
    "32": [0, 0, 0, 0, 0.25],
    "40": [1.25003, 1.75, 0, 0, 0.79167],
    "41": [1.25003, 1.75, 0, 0, 0.79167],
    "47": [1.25003, 1.75, 0, 0, 1.27778],
    "91": [1.25003, 1.75, 0, 0, 0.58334],
    "92": [1.25003, 1.75, 0, 0, 1.27778],
    "93": [1.25003, 1.75, 0, 0, 0.58334],
    "123": [1.25003, 1.75, 0, 0, 0.80556],
    "125": [1.25003, 1.75, 0, 0, 0.80556],
    "160": [0, 0, 0, 0, 0.25],
    "710": [0, 0.825, 0, 0, 1.8889],
    "732": [0, 0.825, 0, 0, 1.8889],
    "770": [0, 0.825, 0, 0, 1.8889],
    "771": [0, 0.825, 0, 0, 1.8889],
    "8730": [1.25003, 1.75, 0, 0, 1],
    "8968": [1.25003, 1.75, 0, 0, 0.63889],
    "8969": [1.25003, 1.75, 0, 0, 0.63889],
    "8970": [1.25003, 1.75, 0, 0, 0.63889],
    "8971": [1.25003, 1.75, 0, 0, 0.63889],
    "9115": [0.64502, 1.155, 0, 0, 0.875],
    "9116": [1e-5, 0.6, 0, 0, 0.875],
    "9117": [0.64502, 1.155, 0, 0, 0.875],
    "9118": [0.64502, 1.155, 0, 0, 0.875],
    "9119": [1e-5, 0.6, 0, 0, 0.875],
    "9120": [0.64502, 1.155, 0, 0, 0.875],
    "9121": [0.64502, 1.155, 0, 0, 0.66667],
    "9122": [-99e-5, 0.601, 0, 0, 0.66667],
    "9123": [0.64502, 1.155, 0, 0, 0.66667],
    "9124": [0.64502, 1.155, 0, 0, 0.66667],
    "9125": [-99e-5, 0.601, 0, 0, 0.66667],
    "9126": [0.64502, 1.155, 0, 0, 0.66667],
    "9127": [1e-5, 0.9, 0, 0, 0.88889],
    "9128": [0.65002, 1.15, 0, 0, 0.88889],
    "9129": [0.90001, 0, 0, 0, 0.88889],
    "9130": [0, 0.3, 0, 0, 0.88889],
    "9131": [1e-5, 0.9, 0, 0, 0.88889],
    "9132": [0.65002, 1.15, 0, 0, 0.88889],
    "9133": [0.90001, 0, 0, 0, 0.88889],
    "9143": [0.88502, 0.915, 0, 0, 1.05556],
    "10216": [1.25003, 1.75, 0, 0, 0.80556],
    "10217": [1.25003, 1.75, 0, 0, 0.80556],
    "57344": [-499e-5, 0.605, 0, 0, 1.05556],
    "57345": [-499e-5, 0.605, 0, 0, 1.05556],
    "57680": [0, 0.12, 0, 0, 0.45],
    "57681": [0, 0.12, 0, 0, 0.45],
    "57682": [0, 0.12, 0, 0, 0.45],
    "57683": [0, 0.12, 0, 0, 0.45]
  },
  "Typewriter-Regular": {
    "32": [0, 0, 0, 0, 0.525],
    "33": [0, 0.61111, 0, 0, 0.525],
    "34": [0, 0.61111, 0, 0, 0.525],
    "35": [0, 0.61111, 0, 0, 0.525],
    "36": [0.08333, 0.69444, 0, 0, 0.525],
    "37": [0.08333, 0.69444, 0, 0, 0.525],
    "38": [0, 0.61111, 0, 0, 0.525],
    "39": [0, 0.61111, 0, 0, 0.525],
    "40": [0.08333, 0.69444, 0, 0, 0.525],
    "41": [0.08333, 0.69444, 0, 0, 0.525],
    "42": [0, 0.52083, 0, 0, 0.525],
    "43": [-0.08056, 0.53055, 0, 0, 0.525],
    "44": [0.13889, 0.125, 0, 0, 0.525],
    "45": [-0.08056, 0.53055, 0, 0, 0.525],
    "46": [0, 0.125, 0, 0, 0.525],
    "47": [0.08333, 0.69444, 0, 0, 0.525],
    "48": [0, 0.61111, 0, 0, 0.525],
    "49": [0, 0.61111, 0, 0, 0.525],
    "50": [0, 0.61111, 0, 0, 0.525],
    "51": [0, 0.61111, 0, 0, 0.525],
    "52": [0, 0.61111, 0, 0, 0.525],
    "53": [0, 0.61111, 0, 0, 0.525],
    "54": [0, 0.61111, 0, 0, 0.525],
    "55": [0, 0.61111, 0, 0, 0.525],
    "56": [0, 0.61111, 0, 0, 0.525],
    "57": [0, 0.61111, 0, 0, 0.525],
    "58": [0, 0.43056, 0, 0, 0.525],
    "59": [0.13889, 0.43056, 0, 0, 0.525],
    "60": [-0.05556, 0.55556, 0, 0, 0.525],
    "61": [-0.19549, 0.41562, 0, 0, 0.525],
    "62": [-0.05556, 0.55556, 0, 0, 0.525],
    "63": [0, 0.61111, 0, 0, 0.525],
    "64": [0, 0.61111, 0, 0, 0.525],
    "65": [0, 0.61111, 0, 0, 0.525],
    "66": [0, 0.61111, 0, 0, 0.525],
    "67": [0, 0.61111, 0, 0, 0.525],
    "68": [0, 0.61111, 0, 0, 0.525],
    "69": [0, 0.61111, 0, 0, 0.525],
    "70": [0, 0.61111, 0, 0, 0.525],
    "71": [0, 0.61111, 0, 0, 0.525],
    "72": [0, 0.61111, 0, 0, 0.525],
    "73": [0, 0.61111, 0, 0, 0.525],
    "74": [0, 0.61111, 0, 0, 0.525],
    "75": [0, 0.61111, 0, 0, 0.525],
    "76": [0, 0.61111, 0, 0, 0.525],
    "77": [0, 0.61111, 0, 0, 0.525],
    "78": [0, 0.61111, 0, 0, 0.525],
    "79": [0, 0.61111, 0, 0, 0.525],
    "80": [0, 0.61111, 0, 0, 0.525],
    "81": [0.13889, 0.61111, 0, 0, 0.525],
    "82": [0, 0.61111, 0, 0, 0.525],
    "83": [0, 0.61111, 0, 0, 0.525],
    "84": [0, 0.61111, 0, 0, 0.525],
    "85": [0, 0.61111, 0, 0, 0.525],
    "86": [0, 0.61111, 0, 0, 0.525],
    "87": [0, 0.61111, 0, 0, 0.525],
    "88": [0, 0.61111, 0, 0, 0.525],
    "89": [0, 0.61111, 0, 0, 0.525],
    "90": [0, 0.61111, 0, 0, 0.525],
    "91": [0.08333, 0.69444, 0, 0, 0.525],
    "92": [0.08333, 0.69444, 0, 0, 0.525],
    "93": [0.08333, 0.69444, 0, 0, 0.525],
    "94": [0, 0.61111, 0, 0, 0.525],
    "95": [0.09514, 0, 0, 0, 0.525],
    "96": [0, 0.61111, 0, 0, 0.525],
    "97": [0, 0.43056, 0, 0, 0.525],
    "98": [0, 0.61111, 0, 0, 0.525],
    "99": [0, 0.43056, 0, 0, 0.525],
    "100": [0, 0.61111, 0, 0, 0.525],
    "101": [0, 0.43056, 0, 0, 0.525],
    "102": [0, 0.61111, 0, 0, 0.525],
    "103": [0.22222, 0.43056, 0, 0, 0.525],
    "104": [0, 0.61111, 0, 0, 0.525],
    "105": [0, 0.61111, 0, 0, 0.525],
    "106": [0.22222, 0.61111, 0, 0, 0.525],
    "107": [0, 0.61111, 0, 0, 0.525],
    "108": [0, 0.61111, 0, 0, 0.525],
    "109": [0, 0.43056, 0, 0, 0.525],
    "110": [0, 0.43056, 0, 0, 0.525],
    "111": [0, 0.43056, 0, 0, 0.525],
    "112": [0.22222, 0.43056, 0, 0, 0.525],
    "113": [0.22222, 0.43056, 0, 0, 0.525],
    "114": [0, 0.43056, 0, 0, 0.525],
    "115": [0, 0.43056, 0, 0, 0.525],
    "116": [0, 0.55358, 0, 0, 0.525],
    "117": [0, 0.43056, 0, 0, 0.525],
    "118": [0, 0.43056, 0, 0, 0.525],
    "119": [0, 0.43056, 0, 0, 0.525],
    "120": [0, 0.43056, 0, 0, 0.525],
    "121": [0.22222, 0.43056, 0, 0, 0.525],
    "122": [0, 0.43056, 0, 0, 0.525],
    "123": [0.08333, 0.69444, 0, 0, 0.525],
    "124": [0.08333, 0.69444, 0, 0, 0.525],
    "125": [0.08333, 0.69444, 0, 0, 0.525],
    "126": [0, 0.61111, 0, 0, 0.525],
    "127": [0, 0.61111, 0, 0, 0.525],
    "160": [0, 0, 0, 0, 0.525],
    "176": [0, 0.61111, 0, 0, 0.525],
    "184": [0.19445, 0, 0, 0, 0.525],
    "305": [0, 0.43056, 0, 0, 0.525],
    "567": [0.22222, 0.43056, 0, 0, 0.525],
    "711": [0, 0.56597, 0, 0, 0.525],
    "713": [0, 0.56555, 0, 0, 0.525],
    "714": [0, 0.61111, 0, 0, 0.525],
    "715": [0, 0.61111, 0, 0, 0.525],
    "728": [0, 0.61111, 0, 0, 0.525],
    "730": [0, 0.61111, 0, 0, 0.525],
    "770": [0, 0.61111, 0, 0, 0.525],
    "771": [0, 0.61111, 0, 0, 0.525],
    "776": [0, 0.61111, 0, 0, 0.525],
    "915": [0, 0.61111, 0, 0, 0.525],
    "916": [0, 0.61111, 0, 0, 0.525],
    "920": [0, 0.61111, 0, 0, 0.525],
    "923": [0, 0.61111, 0, 0, 0.525],
    "926": [0, 0.61111, 0, 0, 0.525],
    "928": [0, 0.61111, 0, 0, 0.525],
    "931": [0, 0.61111, 0, 0, 0.525],
    "933": [0, 0.61111, 0, 0, 0.525],
    "934": [0, 0.61111, 0, 0, 0.525],
    "936": [0, 0.61111, 0, 0, 0.525],
    "937": [0, 0.61111, 0, 0, 0.525],
    "8216": [0, 0.61111, 0, 0, 0.525],
    "8217": [0, 0.61111, 0, 0, 0.525],
    "8242": [0, 0.61111, 0, 0, 0.525],
    "9251": [0.11111, 0.21944, 0, 0, 0.525]
  }
};
var sigmasAndXis = {
  slant: [0.25, 0.25, 0.25],
  // sigma1
  space: [0, 0, 0],
  // sigma2
  stretch: [0, 0, 0],
  // sigma3
  shrink: [0, 0, 0],
  // sigma4
  xHeight: [0.431, 0.431, 0.431],
  // sigma5
  quad: [1, 1.171, 1.472],
  // sigma6
  extraSpace: [0, 0, 0],
  // sigma7
  num1: [0.677, 0.732, 0.925],
  // sigma8
  num2: [0.394, 0.384, 0.387],
  // sigma9
  num3: [0.444, 0.471, 0.504],
  // sigma10
  denom1: [0.686, 0.752, 1.025],
  // sigma11
  denom2: [0.345, 0.344, 0.532],
  // sigma12
  sup1: [0.413, 0.503, 0.504],
  // sigma13
  sup2: [0.363, 0.431, 0.404],
  // sigma14
  sup3: [0.289, 0.286, 0.294],
  // sigma15
  sub1: [0.15, 0.143, 0.2],
  // sigma16
  sub2: [0.247, 0.286, 0.4],
  // sigma17
  supDrop: [0.386, 0.353, 0.494],
  // sigma18
  subDrop: [0.05, 0.071, 0.1],
  // sigma19
  delim1: [2.39, 1.7, 1.98],
  // sigma20
  delim2: [1.01, 1.157, 1.42],
  // sigma21
  axisHeight: [0.25, 0.25, 0.25],
  // sigma22
  // These font metrics are extracted from TeX by using tftopl on cmex10.tfm;
  // they correspond to the font parameters of the extension fonts (family 3).
  // See the TeXbook, page 441. In AMSTeX, the extension fonts scale; to
  // match cmex7, we'd use cmex7.tfm values for script and scriptscript
  // values.
  defaultRuleThickness: [0.04, 0.049, 0.049],
  // xi8; cmex7: 0.049
  bigOpSpacing1: [0.111, 0.111, 0.111],
  // xi9
  bigOpSpacing2: [0.166, 0.166, 0.166],
  // xi10
  bigOpSpacing3: [0.2, 0.2, 0.2],
  // xi11
  bigOpSpacing4: [0.6, 0.611, 0.611],
  // xi12; cmex7: 0.611
  bigOpSpacing5: [0.1, 0.143, 0.143],
  // xi13; cmex7: 0.143
  // The \sqrt rule width is taken from the height of the surd character.
  // Since we use the same font at all sizes, this thickness doesn't scale.
  sqrtRuleThickness: [0.04, 0.04, 0.04],
  // This value determines how large a pt is, for metrics which are defined
  // in terms of pts.
  // This value is also used in katex.scss; if you change it make sure the
  // values match.
  ptPerEm: [10, 10, 10],
  // The space between adjacent `|` columns in an array definition. From
  // `\showthe\doublerulesep` in LaTeX. Equals 2.0 / ptPerEm.
  doubleRuleSep: [0.2, 0.2, 0.2],
  // The width of separator lines in {array} environments. From
  // `\showthe\arrayrulewidth` in LaTeX. Equals 0.4 / ptPerEm.
  arrayRuleWidth: [0.04, 0.04, 0.04],
  // Two values from LaTeX source2e:
  fboxsep: [0.3, 0.3, 0.3],
  //        3 pt / ptPerEm
  fboxrule: [0.04, 0.04, 0.04]
  // 0.4 pt / ptPerEm
};
var extraCharacterMap = {
  // Latin-1
  "\xC5": "A",
  "\xD0": "D",
  "\xDE": "o",
  "\xE5": "a",
  "\xF0": "d",
  "\xFE": "o",
  // Cyrillic
  "\u0410": "A",
  "\u0411": "B",
  "\u0412": "B",
  "\u0413": "F",
  "\u0414": "A",
  "\u0415": "E",
  "\u0416": "K",
  "\u0417": "3",
  "\u0418": "N",
  "\u0419": "N",
  "\u041A": "K",
  "\u041B": "N",
  "\u041C": "M",
  "\u041D": "H",
  "\u041E": "O",
  "\u041F": "N",
  "\u0420": "P",
  "\u0421": "C",
  "\u0422": "T",
  "\u0423": "y",
  "\u0424": "O",
  "\u0425": "X",
  "\u0426": "U",
  "\u0427": "h",
  "\u0428": "W",
  "\u0429": "W",
  "\u042A": "B",
  "\u042B": "X",
  "\u042C": "B",
  "\u042D": "3",
  "\u042E": "X",
  "\u042F": "R",
  "\u0430": "a",
  "\u0431": "b",
  "\u0432": "a",
  "\u0433": "r",
  "\u0434": "y",
  "\u0435": "e",
  "\u0436": "m",
  "\u0437": "e",
  "\u0438": "n",
  "\u0439": "n",
  "\u043A": "n",
  "\u043B": "n",
  "\u043C": "m",
  "\u043D": "n",
  "\u043E": "o",
  "\u043F": "n",
  "\u0440": "p",
  "\u0441": "c",
  "\u0442": "o",
  "\u0443": "y",
  "\u0444": "b",
  "\u0445": "x",
  "\u0446": "n",
  "\u0447": "n",
  "\u0448": "w",
  "\u0449": "w",
  "\u044A": "a",
  "\u044B": "m",
  "\u044C": "a",
  "\u044D": "e",
  "\u044E": "m",
  "\u044F": "r"
};
function setFontMetrics(fontName, metrics) {
  fontMetricsData[fontName] = metrics;
}
function getCharacterMetrics(character, font, mode) {
  if (!fontMetricsData[font]) {
    throw new Error("Font metrics not found for font: " + font + ".");
  }
  var ch2 = character.charCodeAt(0);
  var metrics = fontMetricsData[font][ch2];
  if (!metrics && character[0] in extraCharacterMap) {
    ch2 = extraCharacterMap[character[0]].charCodeAt(0);
    metrics = fontMetricsData[font][ch2];
  }
  if (!metrics && mode === "text") {
    if (supportedCodepoint(ch2)) {
      metrics = fontMetricsData[font][77];
    }
  }
  if (metrics) {
    return {
      depth: metrics[0],
      height: metrics[1],
      italic: metrics[2],
      skew: metrics[3],
      width: metrics[4]
    };
  }
}
var fontMetricsBySizeIndex = {};
function getGlobalMetrics(size) {
  var sizeIndex;
  if (size >= 5) {
    sizeIndex = 0;
  } else if (size >= 3) {
    sizeIndex = 1;
  } else {
    sizeIndex = 2;
  }
  if (!fontMetricsBySizeIndex[sizeIndex]) {
    var metrics = fontMetricsBySizeIndex[sizeIndex] = {
      cssEmPerMu: sigmasAndXis.quad[sizeIndex] / 18
    };
    for (var key in sigmasAndXis) {
      if (sigmasAndXis.hasOwnProperty(key)) {
        metrics[key] = sigmasAndXis[key][sizeIndex];
      }
    }
  }
  return fontMetricsBySizeIndex[sizeIndex];
}
var sizeStyleMap = [
  // Each element contains [textsize, scriptsize, scriptscriptsize].
  // The size mappings are taken from TeX with \normalsize=10pt.
  [1, 1, 1],
  // size1: [5, 5, 5]              \tiny
  [2, 1, 1],
  // size2: [6, 5, 5]
  [3, 1, 1],
  // size3: [7, 5, 5]              \scriptsize
  [4, 2, 1],
  // size4: [8, 6, 5]              \footnotesize
  [5, 2, 1],
  // size5: [9, 6, 5]              \small
  [6, 3, 1],
  // size6: [10, 7, 5]             \normalsize
  [7, 4, 2],
  // size7: [12, 8, 6]             \large
  [8, 6, 3],
  // size8: [14.4, 10, 7]          \Large
  [9, 7, 6],
  // size9: [17.28, 12, 10]        \LARGE
  [10, 8, 7],
  // size10: [20.74, 14.4, 12]     \huge
  [11, 10, 9]
  // size11: [24.88, 20.74, 17.28] \HUGE
];
var sizeMultipliers = [
  // fontMetrics.js:getGlobalMetrics also uses size indexes, so if
  // you change size indexes, change that function.
  0.5,
  0.6,
  0.7,
  0.8,
  0.9,
  1,
  1.2,
  1.44,
  1.728,
  2.074,
  2.488
];
var sizeAtStyle = function sizeAtStyle2(size, style) {
  return style.size < 2 ? size : sizeStyleMap[size - 1][style.size - 1];
};
var Options = class _Options {
  // A font family applies to a group of fonts (i.e. SansSerif), while a font
  // represents a specific font (i.e. SansSerif Bold).
  // See: https://tex.stackexchange.com/questions/22350/difference-between-textrm-and-mathrm
  /**
   * The base size index.
   */
  constructor(data) {
    this.style = void 0;
    this.color = void 0;
    this.size = void 0;
    this.textSize = void 0;
    this.phantom = void 0;
    this.font = void 0;
    this.fontFamily = void 0;
    this.fontWeight = void 0;
    this.fontShape = void 0;
    this.sizeMultiplier = void 0;
    this.maxSize = void 0;
    this.minRuleThickness = void 0;
    this._fontMetrics = void 0;
    this.style = data.style;
    this.color = data.color;
    this.size = data.size || _Options.BASESIZE;
    this.textSize = data.textSize || this.size;
    this.phantom = !!data.phantom;
    this.font = data.font || "";
    this.fontFamily = data.fontFamily || "";
    this.fontWeight = data.fontWeight || "";
    this.fontShape = data.fontShape || "";
    this.sizeMultiplier = sizeMultipliers[this.size - 1];
    this.maxSize = data.maxSize;
    this.minRuleThickness = data.minRuleThickness;
    this._fontMetrics = void 0;
  }
  /**
   * Returns a new options object with the same properties as "this".  Properties
   * from "extension" will be copied to the new options object.
   */
  extend(extension) {
    var data = {
      style: this.style,
      size: this.size,
      textSize: this.textSize,
      color: this.color,
      phantom: this.phantom,
      font: this.font,
      fontFamily: this.fontFamily,
      fontWeight: this.fontWeight,
      fontShape: this.fontShape,
      maxSize: this.maxSize,
      minRuleThickness: this.minRuleThickness
    };
    for (var key in extension) {
      if (extension.hasOwnProperty(key)) {
        data[key] = extension[key];
      }
    }
    return new _Options(data);
  }
  /**
   * Return an options object with the given style. If `this.style === style`,
   * returns `this`.
   */
  havingStyle(style) {
    if (this.style === style) {
      return this;
    } else {
      return this.extend({
        style,
        size: sizeAtStyle(this.textSize, style)
      });
    }
  }
  /**
   * Return an options object with a cramped version of the current style. If
   * the current style is cramped, returns `this`.
   */
  havingCrampedStyle() {
    return this.havingStyle(this.style.cramp());
  }
  /**
   * Return an options object with the given size and in at least `\textstyle`.
   * Returns `this` if appropriate.
   */
  havingSize(size) {
    if (this.size === size && this.textSize === size) {
      return this;
    } else {
      return this.extend({
        style: this.style.text(),
        size,
        textSize: size,
        sizeMultiplier: sizeMultipliers[size - 1]
      });
    }
  }
  /**
   * Like `this.havingSize(BASESIZE).havingStyle(style)`. If `style` is omitted,
   * changes to at least `\textstyle`.
   */
  havingBaseStyle(style) {
    style = style || this.style.text();
    var wantSize = sizeAtStyle(_Options.BASESIZE, style);
    if (this.size === wantSize && this.textSize === _Options.BASESIZE && this.style === style) {
      return this;
    } else {
      return this.extend({
        style,
        size: wantSize
      });
    }
  }
  /**
   * Remove the effect of sizing changes such as \Huge.
   * Keep the effect of the current style, such as \scriptstyle.
   */
  havingBaseSizing() {
    var size;
    switch (this.style.id) {
      case 4:
      case 5:
        size = 3;
        break;
      case 6:
      case 7:
        size = 1;
        break;
      default:
        size = 6;
    }
    return this.extend({
      style: this.style.text(),
      size
    });
  }
  /**
   * Create a new options object with the given color.
   */
  withColor(color) {
    return this.extend({
      color
    });
  }
  /**
   * Create a new options object with "phantom" set to true.
   */
  withPhantom() {
    return this.extend({
      phantom: true
    });
  }
  /**
   * Creates a new options object with the given math font or old text font.
   * @type {[type]}
   */
  withFont(font) {
    return this.extend({
      font
    });
  }
  /**
   * Create a new options objects with the given fontFamily.
   */
  withTextFontFamily(fontFamily) {
    return this.extend({
      fontFamily,
      font: ""
    });
  }
  /**
   * Creates a new options object with the given font weight
   */
  withTextFontWeight(fontWeight) {
    return this.extend({
      fontWeight,
      font: ""
    });
  }
  /**
   * Creates a new options object with the given font weight
   */
  withTextFontShape(fontShape) {
    return this.extend({
      fontShape,
      font: ""
    });
  }
  /**
   * Return the CSS sizing classes required to switch from enclosing options
   * `oldOptions` to `this`. Returns an array of classes.
   */
  sizingClasses(oldOptions) {
    if (oldOptions.size !== this.size) {
      return ["sizing", "reset-size" + oldOptions.size, "size" + this.size];
    } else {
      return [];
    }
  }
  /**
   * Return the CSS sizing classes required to switch to the base size. Like
   * `this.havingSize(BASESIZE).sizingClasses(this)`.
   */
  baseSizingClasses() {
    if (this.size !== _Options.BASESIZE) {
      return ["sizing", "reset-size" + this.size, "size" + _Options.BASESIZE];
    } else {
      return [];
    }
  }
  /**
   * Return the font metrics for this size.
   */
  fontMetrics() {
    if (!this._fontMetrics) {
      this._fontMetrics = getGlobalMetrics(this.size);
    }
    return this._fontMetrics;
  }
  /**
   * Gets the CSS color of the current options object
   */
  getColor() {
    if (this.phantom) {
      return "transparent";
    } else {
      return this.color;
    }
  }
};
Options.BASESIZE = 6;
var ptPerUnit = {
  // https://en.wikibooks.org/wiki/LaTeX/Lengths and
  // https://tex.stackexchange.com/a/8263
  "pt": 1,
  // TeX point
  "mm": 7227 / 2540,
  // millimeter
  "cm": 7227 / 254,
  // centimeter
  "in": 72.27,
  // inch
  "bp": 803 / 800,
  // big (PostScript) points
  "pc": 12,
  // pica
  "dd": 1238 / 1157,
  // didot
  "cc": 14856 / 1157,
  // cicero (12 didot)
  "nd": 685 / 642,
  // new didot
  "nc": 1370 / 107,
  // new cicero (12 new didot)
  "sp": 1 / 65536,
  // scaled point (TeX's internal smallest unit)
  // https://tex.stackexchange.com/a/41371
  "px": 803 / 800
  // \pdfpxdimen defaults to 1 bp in pdfTeX and LuaTeX
};
var relativeUnit = {
  "ex": true,
  "em": true,
  "mu": true
};
var validUnit = function validUnit2(unit) {
  if (typeof unit !== "string") {
    unit = unit.unit;
  }
  return unit in ptPerUnit || unit in relativeUnit || unit === "ex";
};
var calculateSize = function calculateSize2(sizeValue, options) {
  var scale;
  if (sizeValue.unit in ptPerUnit) {
    scale = ptPerUnit[sizeValue.unit] / options.fontMetrics().ptPerEm / options.sizeMultiplier;
  } else if (sizeValue.unit === "mu") {
    scale = options.fontMetrics().cssEmPerMu;
  } else {
    var unitOptions;
    if (options.style.isTight()) {
      unitOptions = options.havingStyle(options.style.text());
    } else {
      unitOptions = options;
    }
    if (sizeValue.unit === "ex") {
      scale = unitOptions.fontMetrics().xHeight;
    } else if (sizeValue.unit === "em") {
      scale = unitOptions.fontMetrics().quad;
    } else {
      throw new ParseError("Invalid unit: '" + sizeValue.unit + "'");
    }
    if (unitOptions !== options) {
      scale *= unitOptions.sizeMultiplier / options.sizeMultiplier;
    }
  }
  return Math.min(sizeValue.number * scale, options.maxSize);
};
var makeEm = function makeEm2(n) {
  return +n.toFixed(4) + "em";
};
var createClass = function createClass2(classes) {
  return classes.filter((cls) => cls).join(" ");
};
var initNode = function initNode2(classes, options, style) {
  this.classes = classes || [];
  this.attributes = {};
  this.height = 0;
  this.depth = 0;
  this.maxFontSize = 0;
  this.style = style || {};
  if (options) {
    if (options.style.isTight()) {
      this.classes.push("mtight");
    }
    var color = options.getColor();
    if (color) {
      this.style.color = color;
    }
  }
};
var toNode = function toNode2(tagName) {
  var node = document.createElement(tagName);
  node.className = createClass(this.classes);
  for (var style in this.style) {
    if (this.style.hasOwnProperty(style)) {
      node.style[style] = this.style[style];
    }
  }
  for (var attr in this.attributes) {
    if (this.attributes.hasOwnProperty(attr)) {
      node.setAttribute(attr, this.attributes[attr]);
    }
  }
  for (var i2 = 0; i2 < this.children.length; i2++) {
    node.appendChild(this.children[i2].toNode());
  }
  return node;
};
var invalidAttributeNameRegex = /[\s"'>/=\x00-\x1f]/;
var toMarkup = function toMarkup2(tagName) {
  var markup = "<" + tagName;
  if (this.classes.length) {
    markup += ' class="' + utils.escape(createClass(this.classes)) + '"';
  }
  var styles2 = "";
  for (var style in this.style) {
    if (this.style.hasOwnProperty(style)) {
      styles2 += utils.hyphenate(style) + ":" + this.style[style] + ";";
    }
  }
  if (styles2) {
    markup += ' style="' + utils.escape(styles2) + '"';
  }
  for (var attr in this.attributes) {
    if (this.attributes.hasOwnProperty(attr)) {
      if (invalidAttributeNameRegex.test(attr)) {
        throw new ParseError("Invalid attribute name '" + attr + "'");
      }
      markup += " " + attr + '="' + utils.escape(this.attributes[attr]) + '"';
    }
  }
  markup += ">";
  for (var i2 = 0; i2 < this.children.length; i2++) {
    markup += this.children[i2].toMarkup();
  }
  markup += "</" + tagName + ">";
  return markup;
};
var Span = class {
  constructor(classes, children, options, style) {
    this.children = void 0;
    this.attributes = void 0;
    this.classes = void 0;
    this.height = void 0;
    this.depth = void 0;
    this.width = void 0;
    this.maxFontSize = void 0;
    this.style = void 0;
    initNode.call(this, classes, options, style);
    this.children = children || [];
  }
  /**
   * Sets an arbitrary attribute on the span. Warning: use this wisely. Not
   * all browsers support attributes the same, and having too many custom
   * attributes is probably bad.
   */
  setAttribute(attribute, value) {
    this.attributes[attribute] = value;
  }
  hasClass(className) {
    return utils.contains(this.classes, className);
  }
  toNode() {
    return toNode.call(this, "span");
  }
  toMarkup() {
    return toMarkup.call(this, "span");
  }
};
var Anchor = class {
  constructor(href, classes, children, options) {
    this.children = void 0;
    this.attributes = void 0;
    this.classes = void 0;
    this.height = void 0;
    this.depth = void 0;
    this.maxFontSize = void 0;
    this.style = void 0;
    initNode.call(this, classes, options);
    this.children = children || [];
    this.setAttribute("href", href);
  }
  setAttribute(attribute, value) {
    this.attributes[attribute] = value;
  }
  hasClass(className) {
    return utils.contains(this.classes, className);
  }
  toNode() {
    return toNode.call(this, "a");
  }
  toMarkup() {
    return toMarkup.call(this, "a");
  }
};
var Img = class {
  constructor(src, alt, style) {
    this.src = void 0;
    this.alt = void 0;
    this.classes = void 0;
    this.height = void 0;
    this.depth = void 0;
    this.maxFontSize = void 0;
    this.style = void 0;
    this.alt = alt;
    this.src = src;
    this.classes = ["mord"];
    this.style = style;
  }
  hasClass(className) {
    return utils.contains(this.classes, className);
  }
  toNode() {
    var node = document.createElement("img");
    node.src = this.src;
    node.alt = this.alt;
    node.className = "mord";
    for (var style in this.style) {
      if (this.style.hasOwnProperty(style)) {
        node.style[style] = this.style[style];
      }
    }
    return node;
  }
  toMarkup() {
    var markup = '<img src="' + utils.escape(this.src) + '"' + (' alt="' + utils.escape(this.alt) + '"');
    var styles2 = "";
    for (var style in this.style) {
      if (this.style.hasOwnProperty(style)) {
        styles2 += utils.hyphenate(style) + ":" + this.style[style] + ";";
      }
    }
    if (styles2) {
      markup += ' style="' + utils.escape(styles2) + '"';
    }
    markup += "'/>";
    return markup;
  }
};
var iCombinations = {
  "\xEE": "\u0131\u0302",
  "\xEF": "\u0131\u0308",
  "\xED": "\u0131\u0301",
  // 'ī': '\u0131\u0304', // enable when we add Extended Latin
  "\xEC": "\u0131\u0300"
};
var SymbolNode = class {
  constructor(text2, height, depth, italic, skew, width, classes, style) {
    this.text = void 0;
    this.height = void 0;
    this.depth = void 0;
    this.italic = void 0;
    this.skew = void 0;
    this.width = void 0;
    this.maxFontSize = void 0;
    this.classes = void 0;
    this.style = void 0;
    this.text = text2;
    this.height = height || 0;
    this.depth = depth || 0;
    this.italic = italic || 0;
    this.skew = skew || 0;
    this.width = width || 0;
    this.classes = classes || [];
    this.style = style || {};
    this.maxFontSize = 0;
    var script = scriptFromCodepoint(this.text.charCodeAt(0));
    if (script) {
      this.classes.push(script + "_fallback");
    }
    if (/[îïíì]/.test(this.text)) {
      this.text = iCombinations[this.text];
    }
  }
  hasClass(className) {
    return utils.contains(this.classes, className);
  }
  /**
   * Creates a text node or span from a symbol node. Note that a span is only
   * created if it is needed.
   */
  toNode() {
    var node = document.createTextNode(this.text);
    var span2 = null;
    if (this.italic > 0) {
      span2 = document.createElement("span");
      span2.style.marginRight = makeEm(this.italic);
    }
    if (this.classes.length > 0) {
      span2 = span2 || document.createElement("span");
      span2.className = createClass(this.classes);
    }
    for (var style in this.style) {
      if (this.style.hasOwnProperty(style)) {
        span2 = span2 || document.createElement("span");
        span2.style[style] = this.style[style];
      }
    }
    if (span2) {
      span2.appendChild(node);
      return span2;
    } else {
      return node;
    }
  }
  /**
   * Creates markup for a symbol node.
   */
  toMarkup() {
    var needsSpan = false;
    var markup = "<span";
    if (this.classes.length) {
      needsSpan = true;
      markup += ' class="';
      markup += utils.escape(createClass(this.classes));
      markup += '"';
    }
    var styles2 = "";
    if (this.italic > 0) {
      styles2 += "margin-right:" + this.italic + "em;";
    }
    for (var style in this.style) {
      if (this.style.hasOwnProperty(style)) {
        styles2 += utils.hyphenate(style) + ":" + this.style[style] + ";";
      }
    }
    if (styles2) {
      needsSpan = true;
      markup += ' style="' + utils.escape(styles2) + '"';
    }
    var escaped = utils.escape(this.text);
    if (needsSpan) {
      markup += ">";
      markup += escaped;
      markup += "</span>";
      return markup;
    } else {
      return escaped;
    }
  }
};
var SvgNode = class {
  constructor(children, attributes) {
    this.children = void 0;
    this.attributes = void 0;
    this.children = children || [];
    this.attributes = attributes || {};
  }
  toNode() {
    var svgNS = "http://www.w3.org/2000/svg";
    var node = document.createElementNS(svgNS, "svg");
    for (var attr in this.attributes) {
      if (Object.prototype.hasOwnProperty.call(this.attributes, attr)) {
        node.setAttribute(attr, this.attributes[attr]);
      }
    }
    for (var i2 = 0; i2 < this.children.length; i2++) {
      node.appendChild(this.children[i2].toNode());
    }
    return node;
  }
  toMarkup() {
    var markup = '<svg xmlns="http://www.w3.org/2000/svg"';
    for (var attr in this.attributes) {
      if (Object.prototype.hasOwnProperty.call(this.attributes, attr)) {
        markup += " " + attr + '="' + utils.escape(this.attributes[attr]) + '"';
      }
    }
    markup += ">";
    for (var i2 = 0; i2 < this.children.length; i2++) {
      markup += this.children[i2].toMarkup();
    }
    markup += "</svg>";
    return markup;
  }
};
var PathNode = class {
  constructor(pathName, alternate) {
    this.pathName = void 0;
    this.alternate = void 0;
    this.pathName = pathName;
    this.alternate = alternate;
  }
  toNode() {
    var svgNS = "http://www.w3.org/2000/svg";
    var node = document.createElementNS(svgNS, "path");
    if (this.alternate) {
      node.setAttribute("d", this.alternate);
    } else {
      node.setAttribute("d", path[this.pathName]);
    }
    return node;
  }
  toMarkup() {
    if (this.alternate) {
      return '<path d="' + utils.escape(this.alternate) + '"/>';
    } else {
      return '<path d="' + utils.escape(path[this.pathName]) + '"/>';
    }
  }
};
var LineNode = class {
  constructor(attributes) {
    this.attributes = void 0;
    this.attributes = attributes || {};
  }
  toNode() {
    var svgNS = "http://www.w3.org/2000/svg";
    var node = document.createElementNS(svgNS, "line");
    for (var attr in this.attributes) {
      if (Object.prototype.hasOwnProperty.call(this.attributes, attr)) {
        node.setAttribute(attr, this.attributes[attr]);
      }
    }
    return node;
  }
  toMarkup() {
    var markup = "<line";
    for (var attr in this.attributes) {
      if (Object.prototype.hasOwnProperty.call(this.attributes, attr)) {
        markup += " " + attr + '="' + utils.escape(this.attributes[attr]) + '"';
      }
    }
    markup += "/>";
    return markup;
  }
};
function assertSymbolDomNode(group2) {
  if (group2 instanceof SymbolNode) {
    return group2;
  } else {
    throw new Error("Expected symbolNode but got " + String(group2) + ".");
  }
}
function assertSpan(group2) {
  if (group2 instanceof Span) {
    return group2;
  } else {
    throw new Error("Expected span<HtmlDomNode> but got " + String(group2) + ".");
  }
}
var ATOMS = {
  "bin": 1,
  "close": 1,
  "inner": 1,
  "open": 1,
  "punct": 1,
  "rel": 1
};
var NON_ATOMS = {
  "accent-token": 1,
  "mathord": 1,
  "op-token": 1,
  "spacing": 1,
  "textord": 1
};
var symbols = {
  "math": {},
  "text": {}
};
function defineSymbol(mode, font, group2, replace, name, acceptUnicodeChar) {
  symbols[mode][name] = {
    font,
    group: group2,
    replace
  };
  if (acceptUnicodeChar && replace) {
    symbols[mode][replace] = symbols[mode][name];
  }
}
var math = "math";
var text = "text";
var main = "main";
var ams = "ams";
var accent = "accent-token";
var bin = "bin";
var close = "close";
var inner = "inner";
var mathord = "mathord";
var op = "op-token";
var open = "open";
var punct = "punct";
var rel = "rel";
var spacing = "spacing";
var textord = "textord";
defineSymbol(math, main, rel, "\u2261", "\\equiv", true);
defineSymbol(math, main, rel, "\u227A", "\\prec", true);
defineSymbol(math, main, rel, "\u227B", "\\succ", true);
defineSymbol(math, main, rel, "\u223C", "\\sim", true);
defineSymbol(math, main, rel, "\u22A5", "\\perp");
defineSymbol(math, main, rel, "\u2AAF", "\\preceq", true);
defineSymbol(math, main, rel, "\u2AB0", "\\succeq", true);
defineSymbol(math, main, rel, "\u2243", "\\simeq", true);
defineSymbol(math, main, rel, "\u2223", "\\mid", true);
defineSymbol(math, main, rel, "\u226A", "\\ll", true);
defineSymbol(math, main, rel, "\u226B", "\\gg", true);
defineSymbol(math, main, rel, "\u224D", "\\asymp", true);
defineSymbol(math, main, rel, "\u2225", "\\parallel");
defineSymbol(math, main, rel, "\u22C8", "\\bowtie", true);
defineSymbol(math, main, rel, "\u2323", "\\smile", true);
defineSymbol(math, main, rel, "\u2291", "\\sqsubseteq", true);
defineSymbol(math, main, rel, "\u2292", "\\sqsupseteq", true);
defineSymbol(math, main, rel, "\u2250", "\\doteq", true);
defineSymbol(math, main, rel, "\u2322", "\\frown", true);
defineSymbol(math, main, rel, "\u220B", "\\ni", true);
defineSymbol(math, main, rel, "\u221D", "\\propto", true);
defineSymbol(math, main, rel, "\u22A2", "\\vdash", true);
defineSymbol(math, main, rel, "\u22A3", "\\dashv", true);
defineSymbol(math, main, rel, "\u220B", "\\owns");
defineSymbol(math, main, punct, ".", "\\ldotp");
defineSymbol(math, main, punct, "\u22C5", "\\cdotp");
defineSymbol(math, main, textord, "#", "\\#");
defineSymbol(text, main, textord, "#", "\\#");
defineSymbol(math, main, textord, "&", "\\&");
defineSymbol(text, main, textord, "&", "\\&");
defineSymbol(math, main, textord, "\u2135", "\\aleph", true);
defineSymbol(math, main, textord, "\u2200", "\\forall", true);
defineSymbol(math, main, textord, "\u210F", "\\hbar", true);
defineSymbol(math, main, textord, "\u2203", "\\exists", true);
defineSymbol(math, main, textord, "\u2207", "\\nabla", true);
defineSymbol(math, main, textord, "\u266D", "\\flat", true);
defineSymbol(math, main, textord, "\u2113", "\\ell", true);
defineSymbol(math, main, textord, "\u266E", "\\natural", true);
defineSymbol(math, main, textord, "\u2663", "\\clubsuit", true);
defineSymbol(math, main, textord, "\u2118", "\\wp", true);
defineSymbol(math, main, textord, "\u266F", "\\sharp", true);
defineSymbol(math, main, textord, "\u2662", "\\diamondsuit", true);
defineSymbol(math, main, textord, "\u211C", "\\Re", true);
defineSymbol(math, main, textord, "\u2661", "\\heartsuit", true);
defineSymbol(math, main, textord, "\u2111", "\\Im", true);
defineSymbol(math, main, textord, "\u2660", "\\spadesuit", true);
defineSymbol(math, main, textord, "\xA7", "\\S", true);
defineSymbol(text, main, textord, "\xA7", "\\S");
defineSymbol(math, main, textord, "\xB6", "\\P", true);
defineSymbol(text, main, textord, "\xB6", "\\P");
defineSymbol(math, main, textord, "\u2020", "\\dag");
defineSymbol(text, main, textord, "\u2020", "\\dag");
defineSymbol(text, main, textord, "\u2020", "\\textdagger");
defineSymbol(math, main, textord, "\u2021", "\\ddag");
defineSymbol(text, main, textord, "\u2021", "\\ddag");
defineSymbol(text, main, textord, "\u2021", "\\textdaggerdbl");
defineSymbol(math, main, close, "\u23B1", "\\rmoustache", true);
defineSymbol(math, main, open, "\u23B0", "\\lmoustache", true);
defineSymbol(math, main, close, "\u27EF", "\\rgroup", true);
defineSymbol(math, main, open, "\u27EE", "\\lgroup", true);
defineSymbol(math, main, bin, "\u2213", "\\mp", true);
defineSymbol(math, main, bin, "\u2296", "\\ominus", true);
defineSymbol(math, main, bin, "\u228E", "\\uplus", true);
defineSymbol(math, main, bin, "\u2293", "\\sqcap", true);
defineSymbol(math, main, bin, "\u2217", "\\ast");
defineSymbol(math, main, bin, "\u2294", "\\sqcup", true);
defineSymbol(math, main, bin, "\u25EF", "\\bigcirc", true);
defineSymbol(math, main, bin, "\u2219", "\\bullet", true);
defineSymbol(math, main, bin, "\u2021", "\\ddagger");
defineSymbol(math, main, bin, "\u2240", "\\wr", true);
defineSymbol(math, main, bin, "\u2A3F", "\\amalg");
defineSymbol(math, main, bin, "&", "\\And");
defineSymbol(math, main, rel, "\u27F5", "\\longleftarrow", true);
defineSymbol(math, main, rel, "\u21D0", "\\Leftarrow", true);
defineSymbol(math, main, rel, "\u27F8", "\\Longleftarrow", true);
defineSymbol(math, main, rel, "\u27F6", "\\longrightarrow", true);
defineSymbol(math, main, rel, "\u21D2", "\\Rightarrow", true);
defineSymbol(math, main, rel, "\u27F9", "\\Longrightarrow", true);
defineSymbol(math, main, rel, "\u2194", "\\leftrightarrow", true);
defineSymbol(math, main, rel, "\u27F7", "\\longleftrightarrow", true);
defineSymbol(math, main, rel, "\u21D4", "\\Leftrightarrow", true);
defineSymbol(math, main, rel, "\u27FA", "\\Longleftrightarrow", true);
defineSymbol(math, main, rel, "\u21A6", "\\mapsto", true);
defineSymbol(math, main, rel, "\u27FC", "\\longmapsto", true);
defineSymbol(math, main, rel, "\u2197", "\\nearrow", true);
defineSymbol(math, main, rel, "\u21A9", "\\hookleftarrow", true);
defineSymbol(math, main, rel, "\u21AA", "\\hookrightarrow", true);
defineSymbol(math, main, rel, "\u2198", "\\searrow", true);
defineSymbol(math, main, rel, "\u21BC", "\\leftharpoonup", true);
defineSymbol(math, main, rel, "\u21C0", "\\rightharpoonup", true);
defineSymbol(math, main, rel, "\u2199", "\\swarrow", true);
defineSymbol(math, main, rel, "\u21BD", "\\leftharpoondown", true);
defineSymbol(math, main, rel, "\u21C1", "\\rightharpoondown", true);
defineSymbol(math, main, rel, "\u2196", "\\nwarrow", true);
defineSymbol(math, main, rel, "\u21CC", "\\rightleftharpoons", true);
defineSymbol(math, ams, rel, "\u226E", "\\nless", true);
defineSymbol(math, ams, rel, "\uE010", "\\@nleqslant");
defineSymbol(math, ams, rel, "\uE011", "\\@nleqq");
defineSymbol(math, ams, rel, "\u2A87", "\\lneq", true);
defineSymbol(math, ams, rel, "\u2268", "\\lneqq", true);
defineSymbol(math, ams, rel, "\uE00C", "\\@lvertneqq");
defineSymbol(math, ams, rel, "\u22E6", "\\lnsim", true);
defineSymbol(math, ams, rel, "\u2A89", "\\lnapprox", true);
defineSymbol(math, ams, rel, "\u2280", "\\nprec", true);
defineSymbol(math, ams, rel, "\u22E0", "\\npreceq", true);
defineSymbol(math, ams, rel, "\u22E8", "\\precnsim", true);
defineSymbol(math, ams, rel, "\u2AB9", "\\precnapprox", true);
defineSymbol(math, ams, rel, "\u2241", "\\nsim", true);
defineSymbol(math, ams, rel, "\uE006", "\\@nshortmid");
defineSymbol(math, ams, rel, "\u2224", "\\nmid", true);
defineSymbol(math, ams, rel, "\u22AC", "\\nvdash", true);
defineSymbol(math, ams, rel, "\u22AD", "\\nvDash", true);
defineSymbol(math, ams, rel, "\u22EA", "\\ntriangleleft");
defineSymbol(math, ams, rel, "\u22EC", "\\ntrianglelefteq", true);
defineSymbol(math, ams, rel, "\u228A", "\\subsetneq", true);
defineSymbol(math, ams, rel, "\uE01A", "\\@varsubsetneq");
defineSymbol(math, ams, rel, "\u2ACB", "\\subsetneqq", true);
defineSymbol(math, ams, rel, "\uE017", "\\@varsubsetneqq");
defineSymbol(math, ams, rel, "\u226F", "\\ngtr", true);
defineSymbol(math, ams, rel, "\uE00F", "\\@ngeqslant");
defineSymbol(math, ams, rel, "\uE00E", "\\@ngeqq");
defineSymbol(math, ams, rel, "\u2A88", "\\gneq", true);
defineSymbol(math, ams, rel, "\u2269", "\\gneqq", true);
defineSymbol(math, ams, rel, "\uE00D", "\\@gvertneqq");
defineSymbol(math, ams, rel, "\u22E7", "\\gnsim", true);
defineSymbol(math, ams, rel, "\u2A8A", "\\gnapprox", true);
defineSymbol(math, ams, rel, "\u2281", "\\nsucc", true);
defineSymbol(math, ams, rel, "\u22E1", "\\nsucceq", true);
defineSymbol(math, ams, rel, "\u22E9", "\\succnsim", true);
defineSymbol(math, ams, rel, "\u2ABA", "\\succnapprox", true);
defineSymbol(math, ams, rel, "\u2246", "\\ncong", true);
defineSymbol(math, ams, rel, "\uE007", "\\@nshortparallel");
defineSymbol(math, ams, rel, "\u2226", "\\nparallel", true);
defineSymbol(math, ams, rel, "\u22AF", "\\nVDash", true);
defineSymbol(math, ams, rel, "\u22EB", "\\ntriangleright");
defineSymbol(math, ams, rel, "\u22ED", "\\ntrianglerighteq", true);
defineSymbol(math, ams, rel, "\uE018", "\\@nsupseteqq");
defineSymbol(math, ams, rel, "\u228B", "\\supsetneq", true);
defineSymbol(math, ams, rel, "\uE01B", "\\@varsupsetneq");
defineSymbol(math, ams, rel, "\u2ACC", "\\supsetneqq", true);
defineSymbol(math, ams, rel, "\uE019", "\\@varsupsetneqq");
defineSymbol(math, ams, rel, "\u22AE", "\\nVdash", true);
defineSymbol(math, ams, rel, "\u2AB5", "\\precneqq", true);
defineSymbol(math, ams, rel, "\u2AB6", "\\succneqq", true);
defineSymbol(math, ams, rel, "\uE016", "\\@nsubseteqq");
defineSymbol(math, ams, bin, "\u22B4", "\\unlhd");
defineSymbol(math, ams, bin, "\u22B5", "\\unrhd");
defineSymbol(math, ams, rel, "\u219A", "\\nleftarrow", true);
defineSymbol(math, ams, rel, "\u219B", "\\nrightarrow", true);
defineSymbol(math, ams, rel, "\u21CD", "\\nLeftarrow", true);
defineSymbol(math, ams, rel, "\u21CF", "\\nRightarrow", true);
defineSymbol(math, ams, rel, "\u21AE", "\\nleftrightarrow", true);
defineSymbol(math, ams, rel, "\u21CE", "\\nLeftrightarrow", true);
defineSymbol(math, ams, rel, "\u25B3", "\\vartriangle");
defineSymbol(math, ams, textord, "\u210F", "\\hslash");
defineSymbol(math, ams, textord, "\u25BD", "\\triangledown");
defineSymbol(math, ams, textord, "\u25CA", "\\lozenge");
defineSymbol(math, ams, textord, "\u24C8", "\\circledS");
defineSymbol(math, ams, textord, "\xAE", "\\circledR");
defineSymbol(text, ams, textord, "\xAE", "\\circledR");
defineSymbol(math, ams, textord, "\u2221", "\\measuredangle", true);
defineSymbol(math, ams, textord, "\u2204", "\\nexists");
defineSymbol(math, ams, textord, "\u2127", "\\mho");
defineSymbol(math, ams, textord, "\u2132", "\\Finv", true);
defineSymbol(math, ams, textord, "\u2141", "\\Game", true);
defineSymbol(math, ams, textord, "\u2035", "\\backprime");
defineSymbol(math, ams, textord, "\u25B2", "\\blacktriangle");
defineSymbol(math, ams, textord, "\u25BC", "\\blacktriangledown");
defineSymbol(math, ams, textord, "\u25A0", "\\blacksquare");
defineSymbol(math, ams, textord, "\u29EB", "\\blacklozenge");
defineSymbol(math, ams, textord, "\u2605", "\\bigstar");
defineSymbol(math, ams, textord, "\u2222", "\\sphericalangle", true);
defineSymbol(math, ams, textord, "\u2201", "\\complement", true);
defineSymbol(math, ams, textord, "\xF0", "\\eth", true);
defineSymbol(text, main, textord, "\xF0", "\xF0");
defineSymbol(math, ams, textord, "\u2571", "\\diagup");
defineSymbol(math, ams, textord, "\u2572", "\\diagdown");
defineSymbol(math, ams, textord, "\u25A1", "\\square");
defineSymbol(math, ams, textord, "\u25A1", "\\Box");
defineSymbol(math, ams, textord, "\u25CA", "\\Diamond");
defineSymbol(math, ams, textord, "\xA5", "\\yen", true);
defineSymbol(text, ams, textord, "\xA5", "\\yen", true);
defineSymbol(math, ams, textord, "\u2713", "\\checkmark", true);
defineSymbol(text, ams, textord, "\u2713", "\\checkmark");
defineSymbol(math, ams, textord, "\u2136", "\\beth", true);
defineSymbol(math, ams, textord, "\u2138", "\\daleth", true);
defineSymbol(math, ams, textord, "\u2137", "\\gimel", true);
defineSymbol(math, ams, textord, "\u03DD", "\\digamma", true);
defineSymbol(math, ams, textord, "\u03F0", "\\varkappa");
defineSymbol(math, ams, open, "\u250C", "\\@ulcorner", true);
defineSymbol(math, ams, close, "\u2510", "\\@urcorner", true);
defineSymbol(math, ams, open, "\u2514", "\\@llcorner", true);
defineSymbol(math, ams, close, "\u2518", "\\@lrcorner", true);
defineSymbol(math, ams, rel, "\u2266", "\\leqq", true);
defineSymbol(math, ams, rel, "\u2A7D", "\\leqslant", true);
defineSymbol(math, ams, rel, "\u2A95", "\\eqslantless", true);
defineSymbol(math, ams, rel, "\u2272", "\\lesssim", true);
defineSymbol(math, ams, rel, "\u2A85", "\\lessapprox", true);
defineSymbol(math, ams, rel, "\u224A", "\\approxeq", true);
defineSymbol(math, ams, bin, "\u22D6", "\\lessdot");
defineSymbol(math, ams, rel, "\u22D8", "\\lll", true);
defineSymbol(math, ams, rel, "\u2276", "\\lessgtr", true);
defineSymbol(math, ams, rel, "\u22DA", "\\lesseqgtr", true);
defineSymbol(math, ams, rel, "\u2A8B", "\\lesseqqgtr", true);
defineSymbol(math, ams, rel, "\u2251", "\\doteqdot");
defineSymbol(math, ams, rel, "\u2253", "\\risingdotseq", true);
defineSymbol(math, ams, rel, "\u2252", "\\fallingdotseq", true);
defineSymbol(math, ams, rel, "\u223D", "\\backsim", true);
defineSymbol(math, ams, rel, "\u22CD", "\\backsimeq", true);
defineSymbol(math, ams, rel, "\u2AC5", "\\subseteqq", true);
defineSymbol(math, ams, rel, "\u22D0", "\\Subset", true);
defineSymbol(math, ams, rel, "\u228F", "\\sqsubset", true);
defineSymbol(math, ams, rel, "\u227C", "\\preccurlyeq", true);
defineSymbol(math, ams, rel, "\u22DE", "\\curlyeqprec", true);
defineSymbol(math, ams, rel, "\u227E", "\\precsim", true);
defineSymbol(math, ams, rel, "\u2AB7", "\\precapprox", true);
defineSymbol(math, ams, rel, "\u22B2", "\\vartriangleleft");
defineSymbol(math, ams, rel, "\u22B4", "\\trianglelefteq");
defineSymbol(math, ams, rel, "\u22A8", "\\vDash", true);
defineSymbol(math, ams, rel, "\u22AA", "\\Vvdash", true);
defineSymbol(math, ams, rel, "\u2323", "\\smallsmile");
defineSymbol(math, ams, rel, "\u2322", "\\smallfrown");
defineSymbol(math, ams, rel, "\u224F", "\\bumpeq", true);
defineSymbol(math, ams, rel, "\u224E", "\\Bumpeq", true);
defineSymbol(math, ams, rel, "\u2267", "\\geqq", true);
defineSymbol(math, ams, rel, "\u2A7E", "\\geqslant", true);
defineSymbol(math, ams, rel, "\u2A96", "\\eqslantgtr", true);
defineSymbol(math, ams, rel, "\u2273", "\\gtrsim", true);
defineSymbol(math, ams, rel, "\u2A86", "\\gtrapprox", true);
defineSymbol(math, ams, bin, "\u22D7", "\\gtrdot");
defineSymbol(math, ams, rel, "\u22D9", "\\ggg", true);
defineSymbol(math, ams, rel, "\u2277", "\\gtrless", true);
defineSymbol(math, ams, rel, "\u22DB", "\\gtreqless", true);
defineSymbol(math, ams, rel, "\u2A8C", "\\gtreqqless", true);
defineSymbol(math, ams, rel, "\u2256", "\\eqcirc", true);
defineSymbol(math, ams, rel, "\u2257", "\\circeq", true);
defineSymbol(math, ams, rel, "\u225C", "\\triangleq", true);
defineSymbol(math, ams, rel, "\u223C", "\\thicksim");
defineSymbol(math, ams, rel, "\u2248", "\\thickapprox");
defineSymbol(math, ams, rel, "\u2AC6", "\\supseteqq", true);
defineSymbol(math, ams, rel, "\u22D1", "\\Supset", true);
defineSymbol(math, ams, rel, "\u2290", "\\sqsupset", true);
defineSymbol(math, ams, rel, "\u227D", "\\succcurlyeq", true);
defineSymbol(math, ams, rel, "\u22DF", "\\curlyeqsucc", true);
defineSymbol(math, ams, rel, "\u227F", "\\succsim", true);
defineSymbol(math, ams, rel, "\u2AB8", "\\succapprox", true);
defineSymbol(math, ams, rel, "\u22B3", "\\vartriangleright");
defineSymbol(math, ams, rel, "\u22B5", "\\trianglerighteq");
defineSymbol(math, ams, rel, "\u22A9", "\\Vdash", true);
defineSymbol(math, ams, rel, "\u2223", "\\shortmid");
defineSymbol(math, ams, rel, "\u2225", "\\shortparallel");
defineSymbol(math, ams, rel, "\u226C", "\\between", true);
defineSymbol(math, ams, rel, "\u22D4", "\\pitchfork", true);
defineSymbol(math, ams, rel, "\u221D", "\\varpropto");
defineSymbol(math, ams, rel, "\u25C0", "\\blacktriangleleft");
defineSymbol(math, ams, rel, "\u2234", "\\therefore", true);
defineSymbol(math, ams, rel, "\u220D", "\\backepsilon");
defineSymbol(math, ams, rel, "\u25B6", "\\blacktriangleright");
defineSymbol(math, ams, rel, "\u2235", "\\because", true);
defineSymbol(math, ams, rel, "\u22D8", "\\llless");
defineSymbol(math, ams, rel, "\u22D9", "\\gggtr");
defineSymbol(math, ams, bin, "\u22B2", "\\lhd");
defineSymbol(math, ams, bin, "\u22B3", "\\rhd");
defineSymbol(math, ams, rel, "\u2242", "\\eqsim", true);
defineSymbol(math, main, rel, "\u22C8", "\\Join");
defineSymbol(math, ams, rel, "\u2251", "\\Doteq", true);
defineSymbol(math, ams, bin, "\u2214", "\\dotplus", true);
defineSymbol(math, ams, bin, "\u2216", "\\smallsetminus");
defineSymbol(math, ams, bin, "\u22D2", "\\Cap", true);
defineSymbol(math, ams, bin, "\u22D3", "\\Cup", true);
defineSymbol(math, ams, bin, "\u2A5E", "\\doublebarwedge", true);
defineSymbol(math, ams, bin, "\u229F", "\\boxminus", true);
defineSymbol(math, ams, bin, "\u229E", "\\boxplus", true);
defineSymbol(math, ams, bin, "\u22C7", "\\divideontimes", true);
defineSymbol(math, ams, bin, "\u22C9", "\\ltimes", true);
defineSymbol(math, ams, bin, "\u22CA", "\\rtimes", true);
defineSymbol(math, ams, bin, "\u22CB", "\\leftthreetimes", true);
defineSymbol(math, ams, bin, "\u22CC", "\\rightthreetimes", true);
defineSymbol(math, ams, bin, "\u22CF", "\\curlywedge", true);
defineSymbol(math, ams, bin, "\u22CE", "\\curlyvee", true);
defineSymbol(math, ams, bin, "\u229D", "\\circleddash", true);
defineSymbol(math, ams, bin, "\u229B", "\\circledast", true);
defineSymbol(math, ams, bin, "\u22C5", "\\centerdot");
defineSymbol(math, ams, bin, "\u22BA", "\\intercal", true);
defineSymbol(math, ams, bin, "\u22D2", "\\doublecap");
defineSymbol(math, ams, bin, "\u22D3", "\\doublecup");
defineSymbol(math, ams, bin, "\u22A0", "\\boxtimes", true);
defineSymbol(math, ams, rel, "\u21E2", "\\dashrightarrow", true);
defineSymbol(math, ams, rel, "\u21E0", "\\dashleftarrow", true);
defineSymbol(math, ams, rel, "\u21C7", "\\leftleftarrows", true);
defineSymbol(math, ams, rel, "\u21C6", "\\leftrightarrows", true);
defineSymbol(math, ams, rel, "\u21DA", "\\Lleftarrow", true);
defineSymbol(math, ams, rel, "\u219E", "\\twoheadleftarrow", true);
defineSymbol(math, ams, rel, "\u21A2", "\\leftarrowtail", true);
defineSymbol(math, ams, rel, "\u21AB", "\\looparrowleft", true);
defineSymbol(math, ams, rel, "\u21CB", "\\leftrightharpoons", true);
defineSymbol(math, ams, rel, "\u21B6", "\\curvearrowleft", true);
defineSymbol(math, ams, rel, "\u21BA", "\\circlearrowleft", true);
defineSymbol(math, ams, rel, "\u21B0", "\\Lsh", true);
defineSymbol(math, ams, rel, "\u21C8", "\\upuparrows", true);
defineSymbol(math, ams, rel, "\u21BF", "\\upharpoonleft", true);
defineSymbol(math, ams, rel, "\u21C3", "\\downharpoonleft", true);
defineSymbol(math, main, rel, "\u22B6", "\\origof", true);
defineSymbol(math, main, rel, "\u22B7", "\\imageof", true);
defineSymbol(math, ams, rel, "\u22B8", "\\multimap", true);
defineSymbol(math, ams, rel, "\u21AD", "\\leftrightsquigarrow", true);
defineSymbol(math, ams, rel, "\u21C9", "\\rightrightarrows", true);
defineSymbol(math, ams, rel, "\u21C4", "\\rightleftarrows", true);
defineSymbol(math, ams, rel, "\u21A0", "\\twoheadrightarrow", true);
defineSymbol(math, ams, rel, "\u21A3", "\\rightarrowtail", true);
defineSymbol(math, ams, rel, "\u21AC", "\\looparrowright", true);
defineSymbol(math, ams, rel, "\u21B7", "\\curvearrowright", true);
defineSymbol(math, ams, rel, "\u21BB", "\\circlearrowright", true);
defineSymbol(math, ams, rel, "\u21B1", "\\Rsh", true);
defineSymbol(math, ams, rel, "\u21CA", "\\downdownarrows", true);
defineSymbol(math, ams, rel, "\u21BE", "\\upharpoonright", true);
defineSymbol(math, ams, rel, "\u21C2", "\\downharpoonright", true);
defineSymbol(math, ams, rel, "\u21DD", "\\rightsquigarrow", true);
defineSymbol(math, ams, rel, "\u21DD", "\\leadsto");
defineSymbol(math, ams, rel, "\u21DB", "\\Rrightarrow", true);
defineSymbol(math, ams, rel, "\u21BE", "\\restriction");
defineSymbol(math, main, textord, "\u2018", "`");
defineSymbol(math, main, textord, "$", "\\$");
defineSymbol(text, main, textord, "$", "\\$");
defineSymbol(text, main, textord, "$", "\\textdollar");
defineSymbol(math, main, textord, "%", "\\%");
defineSymbol(text, main, textord, "%", "\\%");
defineSymbol(math, main, textord, "_", "\\_");
defineSymbol(text, main, textord, "_", "\\_");
defineSymbol(text, main, textord, "_", "\\textunderscore");
defineSymbol(math, main, textord, "\u2220", "\\angle", true);
defineSymbol(math, main, textord, "\u221E", "\\infty", true);
defineSymbol(math, main, textord, "\u2032", "\\prime");
defineSymbol(math, main, textord, "\u25B3", "\\triangle");
defineSymbol(math, main, textord, "\u0393", "\\Gamma", true);
defineSymbol(math, main, textord, "\u0394", "\\Delta", true);
defineSymbol(math, main, textord, "\u0398", "\\Theta", true);
defineSymbol(math, main, textord, "\u039B", "\\Lambda", true);
defineSymbol(math, main, textord, "\u039E", "\\Xi", true);
defineSymbol(math, main, textord, "\u03A0", "\\Pi", true);
defineSymbol(math, main, textord, "\u03A3", "\\Sigma", true);
defineSymbol(math, main, textord, "\u03A5", "\\Upsilon", true);
defineSymbol(math, main, textord, "\u03A6", "\\Phi", true);
defineSymbol(math, main, textord, "\u03A8", "\\Psi", true);
defineSymbol(math, main, textord, "\u03A9", "\\Omega", true);
defineSymbol(math, main, textord, "A", "\u0391");
defineSymbol(math, main, textord, "B", "\u0392");
defineSymbol(math, main, textord, "E", "\u0395");
defineSymbol(math, main, textord, "Z", "\u0396");
defineSymbol(math, main, textord, "H", "\u0397");
defineSymbol(math, main, textord, "I", "\u0399");
defineSymbol(math, main, textord, "K", "\u039A");
defineSymbol(math, main, textord, "M", "\u039C");
defineSymbol(math, main, textord, "N", "\u039D");
defineSymbol(math, main, textord, "O", "\u039F");
defineSymbol(math, main, textord, "P", "\u03A1");
defineSymbol(math, main, textord, "T", "\u03A4");
defineSymbol(math, main, textord, "X", "\u03A7");
defineSymbol(math, main, textord, "\xAC", "\\neg", true);
defineSymbol(math, main, textord, "\xAC", "\\lnot");
defineSymbol(math, main, textord, "\u22A4", "\\top");
defineSymbol(math, main, textord, "\u22A5", "\\bot");
defineSymbol(math, main, textord, "\u2205", "\\emptyset");
defineSymbol(math, ams, textord, "\u2205", "\\varnothing");
defineSymbol(math, main, mathord, "\u03B1", "\\alpha", true);
defineSymbol(math, main, mathord, "\u03B2", "\\beta", true);
defineSymbol(math, main, mathord, "\u03B3", "\\gamma", true);
defineSymbol(math, main, mathord, "\u03B4", "\\delta", true);
defineSymbol(math, main, mathord, "\u03F5", "\\epsilon", true);
defineSymbol(math, main, mathord, "\u03B6", "\\zeta", true);
defineSymbol(math, main, mathord, "\u03B7", "\\eta", true);
defineSymbol(math, main, mathord, "\u03B8", "\\theta", true);
defineSymbol(math, main, mathord, "\u03B9", "\\iota", true);
defineSymbol(math, main, mathord, "\u03BA", "\\kappa", true);
defineSymbol(math, main, mathord, "\u03BB", "\\lambda", true);
defineSymbol(math, main, mathord, "\u03BC", "\\mu", true);
defineSymbol(math, main, mathord, "\u03BD", "\\nu", true);
defineSymbol(math, main, mathord, "\u03BE", "\\xi", true);
defineSymbol(math, main, mathord, "\u03BF", "\\omicron", true);
defineSymbol(math, main, mathord, "\u03C0", "\\pi", true);
defineSymbol(math, main, mathord, "\u03C1", "\\rho", true);
defineSymbol(math, main, mathord, "\u03C3", "\\sigma", true);
defineSymbol(math, main, mathord, "\u03C4", "\\tau", true);
defineSymbol(math, main, mathord, "\u03C5", "\\upsilon", true);
defineSymbol(math, main, mathord, "\u03D5", "\\phi", true);
defineSymbol(math, main, mathord, "\u03C7", "\\chi", true);
defineSymbol(math, main, mathord, "\u03C8", "\\psi", true);
defineSymbol(math, main, mathord, "\u03C9", "\\omega", true);
defineSymbol(math, main, mathord, "\u03B5", "\\varepsilon", true);
defineSymbol(math, main, mathord, "\u03D1", "\\vartheta", true);
defineSymbol(math, main, mathord, "\u03D6", "\\varpi", true);
defineSymbol(math, main, mathord, "\u03F1", "\\varrho", true);
defineSymbol(math, main, mathord, "\u03C2", "\\varsigma", true);
defineSymbol(math, main, mathord, "\u03C6", "\\varphi", true);
defineSymbol(math, main, bin, "\u2217", "*", true);
defineSymbol(math, main, bin, "+", "+");
defineSymbol(math, main, bin, "\u2212", "-", true);
defineSymbol(math, main, bin, "\u22C5", "\\cdot", true);
defineSymbol(math, main, bin, "\u2218", "\\circ", true);
defineSymbol(math, main, bin, "\xF7", "\\div", true);
defineSymbol(math, main, bin, "\xB1", "\\pm", true);
defineSymbol(math, main, bin, "\xD7", "\\times", true);
defineSymbol(math, main, bin, "\u2229", "\\cap", true);
defineSymbol(math, main, bin, "\u222A", "\\cup", true);
defineSymbol(math, main, bin, "\u2216", "\\setminus", true);
defineSymbol(math, main, bin, "\u2227", "\\land");
defineSymbol(math, main, bin, "\u2228", "\\lor");
defineSymbol(math, main, bin, "\u2227", "\\wedge", true);
defineSymbol(math, main, bin, "\u2228", "\\vee", true);
defineSymbol(math, main, textord, "\u221A", "\\surd");
defineSymbol(math, main, open, "\u27E8", "\\langle", true);
defineSymbol(math, main, open, "\u2223", "\\lvert");
defineSymbol(math, main, open, "\u2225", "\\lVert");
defineSymbol(math, main, close, "?", "?");
defineSymbol(math, main, close, "!", "!");
defineSymbol(math, main, close, "\u27E9", "\\rangle", true);
defineSymbol(math, main, close, "\u2223", "\\rvert");
defineSymbol(math, main, close, "\u2225", "\\rVert");
defineSymbol(math, main, rel, "=", "=");
defineSymbol(math, main, rel, ":", ":");
defineSymbol(math, main, rel, "\u2248", "\\approx", true);
defineSymbol(math, main, rel, "\u2245", "\\cong", true);
defineSymbol(math, main, rel, "\u2265", "\\ge");
defineSymbol(math, main, rel, "\u2265", "\\geq", true);
defineSymbol(math, main, rel, "\u2190", "\\gets");
defineSymbol(math, main, rel, ">", "\\gt", true);
defineSymbol(math, main, rel, "\u2208", "\\in", true);
defineSymbol(math, main, rel, "\uE020", "\\@not");
defineSymbol(math, main, rel, "\u2282", "\\subset", true);
defineSymbol(math, main, rel, "\u2283", "\\supset", true);
defineSymbol(math, main, rel, "\u2286", "\\subseteq", true);
defineSymbol(math, main, rel, "\u2287", "\\supseteq", true);
defineSymbol(math, ams, rel, "\u2288", "\\nsubseteq", true);
defineSymbol(math, ams, rel, "\u2289", "\\nsupseteq", true);
defineSymbol(math, main, rel, "\u22A8", "\\models");
defineSymbol(math, main, rel, "\u2190", "\\leftarrow", true);
defineSymbol(math, main, rel, "\u2264", "\\le");
defineSymbol(math, main, rel, "\u2264", "\\leq", true);
defineSymbol(math, main, rel, "<", "\\lt", true);
defineSymbol(math, main, rel, "\u2192", "\\rightarrow", true);
defineSymbol(math, main, rel, "\u2192", "\\to");
defineSymbol(math, ams, rel, "\u2271", "\\ngeq", true);
defineSymbol(math, ams, rel, "\u2270", "\\nleq", true);
defineSymbol(math, main, spacing, "\xA0", "\\ ");
defineSymbol(math, main, spacing, "\xA0", "\\space");
defineSymbol(math, main, spacing, "\xA0", "\\nobreakspace");
defineSymbol(text, main, spacing, "\xA0", "\\ ");
defineSymbol(text, main, spacing, "\xA0", " ");
defineSymbol(text, main, spacing, "\xA0", "\\space");
defineSymbol(text, main, spacing, "\xA0", "\\nobreakspace");
defineSymbol(math, main, spacing, null, "\\nobreak");
defineSymbol(math, main, spacing, null, "\\allowbreak");
defineSymbol(math, main, punct, ",", ",");
defineSymbol(math, main, punct, ";", ";");
defineSymbol(math, ams, bin, "\u22BC", "\\barwedge", true);
defineSymbol(math, ams, bin, "\u22BB", "\\veebar", true);
defineSymbol(math, main, bin, "\u2299", "\\odot", true);
defineSymbol(math, main, bin, "\u2295", "\\oplus", true);
defineSymbol(math, main, bin, "\u2297", "\\otimes", true);
defineSymbol(math, main, textord, "\u2202", "\\partial", true);
defineSymbol(math, main, bin, "\u2298", "\\oslash", true);
defineSymbol(math, ams, bin, "\u229A", "\\circledcirc", true);
defineSymbol(math, ams, bin, "\u22A1", "\\boxdot", true);
defineSymbol(math, main, bin, "\u25B3", "\\bigtriangleup");
defineSymbol(math, main, bin, "\u25BD", "\\bigtriangledown");
defineSymbol(math, main, bin, "\u2020", "\\dagger");
defineSymbol(math, main, bin, "\u22C4", "\\diamond");
defineSymbol(math, main, bin, "\u22C6", "\\star");
defineSymbol(math, main, bin, "\u25C3", "\\triangleleft");
defineSymbol(math, main, bin, "\u25B9", "\\triangleright");
defineSymbol(math, main, open, "{", "\\{");
defineSymbol(text, main, textord, "{", "\\{");
defineSymbol(text, main, textord, "{", "\\textbraceleft");
defineSymbol(math, main, close, "}", "\\}");
defineSymbol(text, main, textord, "}", "\\}");
defineSymbol(text, main, textord, "}", "\\textbraceright");
defineSymbol(math, main, open, "{", "\\lbrace");
defineSymbol(math, main, close, "}", "\\rbrace");
defineSymbol(math, main, open, "[", "\\lbrack", true);
defineSymbol(text, main, textord, "[", "\\lbrack", true);
defineSymbol(math, main, close, "]", "\\rbrack", true);
defineSymbol(text, main, textord, "]", "\\rbrack", true);
defineSymbol(math, main, open, "(", "\\lparen", true);
defineSymbol(math, main, close, ")", "\\rparen", true);
defineSymbol(text, main, textord, "<", "\\textless", true);
defineSymbol(text, main, textord, ">", "\\textgreater", true);
defineSymbol(math, main, open, "\u230A", "\\lfloor", true);
defineSymbol(math, main, close, "\u230B", "\\rfloor", true);
defineSymbol(math, main, open, "\u2308", "\\lceil", true);
defineSymbol(math, main, close, "\u2309", "\\rceil", true);
defineSymbol(math, main, textord, "\\", "\\backslash");
defineSymbol(math, main, textord, "\u2223", "|");
defineSymbol(math, main, textord, "\u2223", "\\vert");
defineSymbol(text, main, textord, "|", "\\textbar", true);
defineSymbol(math, main, textord, "\u2225", "\\|");
defineSymbol(math, main, textord, "\u2225", "\\Vert");
defineSymbol(text, main, textord, "\u2225", "\\textbardbl");
defineSymbol(text, main, textord, "~", "\\textasciitilde");
defineSymbol(text, main, textord, "\\", "\\textbackslash");
defineSymbol(text, main, textord, "^", "\\textasciicircum");
defineSymbol(math, main, rel, "\u2191", "\\uparrow", true);
defineSymbol(math, main, rel, "\u21D1", "\\Uparrow", true);
defineSymbol(math, main, rel, "\u2193", "\\downarrow", true);
defineSymbol(math, main, rel, "\u21D3", "\\Downarrow", true);
defineSymbol(math, main, rel, "\u2195", "\\updownarrow", true);
defineSymbol(math, main, rel, "\u21D5", "\\Updownarrow", true);
defineSymbol(math, main, op, "\u2210", "\\coprod");
defineSymbol(math, main, op, "\u22C1", "\\bigvee");
defineSymbol(math, main, op, "\u22C0", "\\bigwedge");
defineSymbol(math, main, op, "\u2A04", "\\biguplus");
defineSymbol(math, main, op, "\u22C2", "\\bigcap");
defineSymbol(math, main, op, "\u22C3", "\\bigcup");
defineSymbol(math, main, op, "\u222B", "\\int");
defineSymbol(math, main, op, "\u222B", "\\intop");
defineSymbol(math, main, op, "\u222C", "\\iint");
defineSymbol(math, main, op, "\u222D", "\\iiint");
defineSymbol(math, main, op, "\u220F", "\\prod");
defineSymbol(math, main, op, "\u2211", "\\sum");
defineSymbol(math, main, op, "\u2A02", "\\bigotimes");
defineSymbol(math, main, op, "\u2A01", "\\bigoplus");
defineSymbol(math, main, op, "\u2A00", "\\bigodot");
defineSymbol(math, main, op, "\u222E", "\\oint");
defineSymbol(math, main, op, "\u222F", "\\oiint");
defineSymbol(math, main, op, "\u2230", "\\oiiint");
defineSymbol(math, main, op, "\u2A06", "\\bigsqcup");
defineSymbol(math, main, op, "\u222B", "\\smallint");
defineSymbol(text, main, inner, "\u2026", "\\textellipsis");
defineSymbol(math, main, inner, "\u2026", "\\mathellipsis");
defineSymbol(text, main, inner, "\u2026", "\\ldots", true);
defineSymbol(math, main, inner, "\u2026", "\\ldots", true);
defineSymbol(math, main, inner, "\u22EF", "\\@cdots", true);
defineSymbol(math, main, inner, "\u22F1", "\\ddots", true);
defineSymbol(math, main, textord, "\u22EE", "\\varvdots");
defineSymbol(text, main, textord, "\u22EE", "\\varvdots");
defineSymbol(math, main, accent, "\u02CA", "\\acute");
defineSymbol(math, main, accent, "\u02CB", "\\grave");
defineSymbol(math, main, accent, "\xA8", "\\ddot");
defineSymbol(math, main, accent, "~", "\\tilde");
defineSymbol(math, main, accent, "\u02C9", "\\bar");
defineSymbol(math, main, accent, "\u02D8", "\\breve");
defineSymbol(math, main, accent, "\u02C7", "\\check");
defineSymbol(math, main, accent, "^", "\\hat");
defineSymbol(math, main, accent, "\u20D7", "\\vec");
defineSymbol(math, main, accent, "\u02D9", "\\dot");
defineSymbol(math, main, accent, "\u02DA", "\\mathring");
defineSymbol(math, main, mathord, "\uE131", "\\@imath");
defineSymbol(math, main, mathord, "\uE237", "\\@jmath");
defineSymbol(math, main, textord, "\u0131", "\u0131");
defineSymbol(math, main, textord, "\u0237", "\u0237");
defineSymbol(text, main, textord, "\u0131", "\\i", true);
defineSymbol(text, main, textord, "\u0237", "\\j", true);
defineSymbol(text, main, textord, "\xDF", "\\ss", true);
defineSymbol(text, main, textord, "\xE6", "\\ae", true);
defineSymbol(text, main, textord, "\u0153", "\\oe", true);
defineSymbol(text, main, textord, "\xF8", "\\o", true);
defineSymbol(text, main, textord, "\xC6", "\\AE", true);
defineSymbol(text, main, textord, "\u0152", "\\OE", true);
defineSymbol(text, main, textord, "\xD8", "\\O", true);
defineSymbol(text, main, accent, "\u02CA", "\\'");
defineSymbol(text, main, accent, "\u02CB", "\\`");
defineSymbol(text, main, accent, "\u02C6", "\\^");
defineSymbol(text, main, accent, "\u02DC", "\\~");
defineSymbol(text, main, accent, "\u02C9", "\\=");
defineSymbol(text, main, accent, "\u02D8", "\\u");
defineSymbol(text, main, accent, "\u02D9", "\\.");
defineSymbol(text, main, accent, "\xB8", "\\c");
defineSymbol(text, main, accent, "\u02DA", "\\r");
defineSymbol(text, main, accent, "\u02C7", "\\v");
defineSymbol(text, main, accent, "\xA8", '\\"');
defineSymbol(text, main, accent, "\u02DD", "\\H");
defineSymbol(text, main, accent, "\u25EF", "\\textcircled");
var ligatures = {
  "--": true,
  "---": true,
  "``": true,
  "''": true
};
defineSymbol(text, main, textord, "\u2013", "--", true);
defineSymbol(text, main, textord, "\u2013", "\\textendash");
defineSymbol(text, main, textord, "\u2014", "---", true);
defineSymbol(text, main, textord, "\u2014", "\\textemdash");
defineSymbol(text, main, textord, "\u2018", "`", true);
defineSymbol(text, main, textord, "\u2018", "\\textquoteleft");
defineSymbol(text, main, textord, "\u2019", "'", true);
defineSymbol(text, main, textord, "\u2019", "\\textquoteright");
defineSymbol(text, main, textord, "\u201C", "``", true);
defineSymbol(text, main, textord, "\u201C", "\\textquotedblleft");
defineSymbol(text, main, textord, "\u201D", "''", true);
defineSymbol(text, main, textord, "\u201D", "\\textquotedblright");
defineSymbol(math, main, textord, "\xB0", "\\degree", true);
defineSymbol(text, main, textord, "\xB0", "\\degree");
defineSymbol(text, main, textord, "\xB0", "\\textdegree", true);
defineSymbol(math, main, textord, "\xA3", "\\pounds");
defineSymbol(math, main, textord, "\xA3", "\\mathsterling", true);
defineSymbol(text, main, textord, "\xA3", "\\pounds");
defineSymbol(text, main, textord, "\xA3", "\\textsterling", true);
defineSymbol(math, ams, textord, "\u2720", "\\maltese");
defineSymbol(text, ams, textord, "\u2720", "\\maltese");
var mathTextSymbols = '0123456789/@."';
for (i = 0; i < mathTextSymbols.length; i++) {
  ch = mathTextSymbols.charAt(i);
  defineSymbol(math, main, textord, ch, ch);
}
var ch;
var i;
var textSymbols = '0123456789!@*()-=+";:?/.,';
for (_i = 0; _i < textSymbols.length; _i++) {
  _ch = textSymbols.charAt(_i);
  defineSymbol(text, main, textord, _ch, _ch);
}
var _ch;
var _i;
var letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
for (_i2 = 0; _i2 < letters.length; _i2++) {
  _ch2 = letters.charAt(_i2);
  defineSymbol(math, main, mathord, _ch2, _ch2);
  defineSymbol(text, main, textord, _ch2, _ch2);
}
var _ch2;
var _i2;
defineSymbol(math, ams, textord, "C", "\u2102");
defineSymbol(text, ams, textord, "C", "\u2102");
defineSymbol(math, ams, textord, "H", "\u210D");
defineSymbol(text, ams, textord, "H", "\u210D");
defineSymbol(math, ams, textord, "N", "\u2115");
defineSymbol(text, ams, textord, "N", "\u2115");
defineSymbol(math, ams, textord, "P", "\u2119");
defineSymbol(text, ams, textord, "P", "\u2119");
defineSymbol(math, ams, textord, "Q", "\u211A");
defineSymbol(text, ams, textord, "Q", "\u211A");
defineSymbol(math, ams, textord, "R", "\u211D");
defineSymbol(text, ams, textord, "R", "\u211D");
defineSymbol(math, ams, textord, "Z", "\u2124");
defineSymbol(text, ams, textord, "Z", "\u2124");
defineSymbol(math, main, mathord, "h", "\u210E");
defineSymbol(text, main, mathord, "h", "\u210E");
var wideChar = "";
for (_i3 = 0; _i3 < letters.length; _i3++) {
  _ch3 = letters.charAt(_i3);
  wideChar = String.fromCharCode(55349, 56320 + _i3);
  defineSymbol(math, main, mathord, _ch3, wideChar);
  defineSymbol(text, main, textord, _ch3, wideChar);
  wideChar = String.fromCharCode(55349, 56372 + _i3);
  defineSymbol(math, main, mathord, _ch3, wideChar);
  defineSymbol(text, main, textord, _ch3, wideChar);
  wideChar = String.fromCharCode(55349, 56424 + _i3);
  defineSymbol(math, main, mathord, _ch3, wideChar);
  defineSymbol(text, main, textord, _ch3, wideChar);
  wideChar = String.fromCharCode(55349, 56580 + _i3);
  defineSymbol(math, main, mathord, _ch3, wideChar);
  defineSymbol(text, main, textord, _ch3, wideChar);
  wideChar = String.fromCharCode(55349, 56684 + _i3);
  defineSymbol(math, main, mathord, _ch3, wideChar);
  defineSymbol(text, main, textord, _ch3, wideChar);
  wideChar = String.fromCharCode(55349, 56736 + _i3);
  defineSymbol(math, main, mathord, _ch3, wideChar);
  defineSymbol(text, main, textord, _ch3, wideChar);
  wideChar = String.fromCharCode(55349, 56788 + _i3);
  defineSymbol(math, main, mathord, _ch3, wideChar);
  defineSymbol(text, main, textord, _ch3, wideChar);
  wideChar = String.fromCharCode(55349, 56840 + _i3);
  defineSymbol(math, main, mathord, _ch3, wideChar);
  defineSymbol(text, main, textord, _ch3, wideChar);
  wideChar = String.fromCharCode(55349, 56944 + _i3);
  defineSymbol(math, main, mathord, _ch3, wideChar);
  defineSymbol(text, main, textord, _ch3, wideChar);
  if (_i3 < 26) {
    wideChar = String.fromCharCode(55349, 56632 + _i3);
    defineSymbol(math, main, mathord, _ch3, wideChar);
    defineSymbol(text, main, textord, _ch3, wideChar);
    wideChar = String.fromCharCode(55349, 56476 + _i3);
    defineSymbol(math, main, mathord, _ch3, wideChar);
    defineSymbol(text, main, textord, _ch3, wideChar);
  }
}
var _ch3;
var _i3;
wideChar = String.fromCharCode(55349, 56668);
defineSymbol(math, main, mathord, "k", wideChar);
defineSymbol(text, main, textord, "k", wideChar);
for (_i4 = 0; _i4 < 10; _i4++) {
  _ch4 = _i4.toString();
  wideChar = String.fromCharCode(55349, 57294 + _i4);
  defineSymbol(math, main, mathord, _ch4, wideChar);
  defineSymbol(text, main, textord, _ch4, wideChar);
  wideChar = String.fromCharCode(55349, 57314 + _i4);
  defineSymbol(math, main, mathord, _ch4, wideChar);
  defineSymbol(text, main, textord, _ch4, wideChar);
  wideChar = String.fromCharCode(55349, 57324 + _i4);
  defineSymbol(math, main, mathord, _ch4, wideChar);
  defineSymbol(text, main, textord, _ch4, wideChar);
  wideChar = String.fromCharCode(55349, 57334 + _i4);
  defineSymbol(math, main, mathord, _ch4, wideChar);
  defineSymbol(text, main, textord, _ch4, wideChar);
}
var _ch4;
var _i4;
var extraLatin = "\xD0\xDE\xFE";
for (_i5 = 0; _i5 < extraLatin.length; _i5++) {
  _ch5 = extraLatin.charAt(_i5);
  defineSymbol(math, main, mathord, _ch5, _ch5);
  defineSymbol(text, main, textord, _ch5, _ch5);
}
var _ch5;
var _i5;
var wideLatinLetterData = [
  ["mathbf", "textbf", "Main-Bold"],
  // A-Z bold upright
  ["mathbf", "textbf", "Main-Bold"],
  // a-z bold upright
  ["mathnormal", "textit", "Math-Italic"],
  // A-Z italic
  ["mathnormal", "textit", "Math-Italic"],
  // a-z italic
  ["boldsymbol", "boldsymbol", "Main-BoldItalic"],
  // A-Z bold italic
  ["boldsymbol", "boldsymbol", "Main-BoldItalic"],
  // a-z bold italic
  // Map fancy A-Z letters to script, not calligraphic.
  // This aligns with unicode-math and math fonts (except Cambria Math).
  ["mathscr", "textscr", "Script-Regular"],
  // A-Z script
  ["", "", ""],
  // a-z script.  No font
  ["", "", ""],
  // A-Z bold script. No font
  ["", "", ""],
  // a-z bold script. No font
  ["mathfrak", "textfrak", "Fraktur-Regular"],
  // A-Z Fraktur
  ["mathfrak", "textfrak", "Fraktur-Regular"],
  // a-z Fraktur
  ["mathbb", "textbb", "AMS-Regular"],
  // A-Z double-struck
  ["mathbb", "textbb", "AMS-Regular"],
  // k double-struck
  // Note that we are using a bold font, but font metrics for regular Fraktur.
  ["mathboldfrak", "textboldfrak", "Fraktur-Regular"],
  // A-Z bold Fraktur
  ["mathboldfrak", "textboldfrak", "Fraktur-Regular"],
  // a-z bold Fraktur
  ["mathsf", "textsf", "SansSerif-Regular"],
  // A-Z sans-serif
  ["mathsf", "textsf", "SansSerif-Regular"],
  // a-z sans-serif
  ["mathboldsf", "textboldsf", "SansSerif-Bold"],
  // A-Z bold sans-serif
  ["mathboldsf", "textboldsf", "SansSerif-Bold"],
  // a-z bold sans-serif
  ["mathitsf", "textitsf", "SansSerif-Italic"],
  // A-Z italic sans-serif
  ["mathitsf", "textitsf", "SansSerif-Italic"],
  // a-z italic sans-serif
  ["", "", ""],
  // A-Z bold italic sans. No font
  ["", "", ""],
  // a-z bold italic sans. No font
  ["mathtt", "texttt", "Typewriter-Regular"],
  // A-Z monospace
  ["mathtt", "texttt", "Typewriter-Regular"]
  // a-z monospace
];
var wideNumeralData = [
  ["mathbf", "textbf", "Main-Bold"],
  // 0-9 bold
  ["", "", ""],
  // 0-9 double-struck. No KaTeX font.
  ["mathsf", "textsf", "SansSerif-Regular"],
  // 0-9 sans-serif
  ["mathboldsf", "textboldsf", "SansSerif-Bold"],
  // 0-9 bold sans-serif
  ["mathtt", "texttt", "Typewriter-Regular"]
  // 0-9 monospace
];
var wideCharacterFont = function wideCharacterFont2(wideChar2, mode) {
  var H = wideChar2.charCodeAt(0);
  var L = wideChar2.charCodeAt(1);
  var codePoint = (H - 55296) * 1024 + (L - 56320) + 65536;
  var j = mode === "math" ? 0 : 1;
  if (119808 <= codePoint && codePoint < 120484) {
    var i2 = Math.floor((codePoint - 119808) / 26);
    return [wideLatinLetterData[i2][2], wideLatinLetterData[i2][j]];
  } else if (120782 <= codePoint && codePoint <= 120831) {
    var _i6 = Math.floor((codePoint - 120782) / 10);
    return [wideNumeralData[_i6][2], wideNumeralData[_i6][j]];
  } else if (codePoint === 120485 || codePoint === 120486) {
    return [wideLatinLetterData[0][2], wideLatinLetterData[0][j]];
  } else if (120486 < codePoint && codePoint < 120782) {
    return ["", ""];
  } else {
    throw new ParseError("Unsupported character: " + wideChar2);
  }
};
var lookupSymbol = function lookupSymbol2(value, fontName, mode) {
  if (symbols[mode][value] && symbols[mode][value].replace) {
    value = symbols[mode][value].replace;
  }
  return {
    value,
    metrics: getCharacterMetrics(value, fontName, mode)
  };
};
var makeSymbol = function makeSymbol2(value, fontName, mode, options, classes) {
  var lookup = lookupSymbol(value, fontName, mode);
  var metrics = lookup.metrics;
  value = lookup.value;
  var symbolNode;
  if (metrics) {
    var italic = metrics.italic;
    if (mode === "text" || options && options.font === "mathit") {
      italic = 0;
    }
    symbolNode = new SymbolNode(value, metrics.height, metrics.depth, italic, metrics.skew, metrics.width, classes);
  } else {
    typeof console !== "undefined" && console.warn("No character metrics " + ("for '" + value + "' in style '" + fontName + "' and mode '" + mode + "'"));
    symbolNode = new SymbolNode(value, 0, 0, 0, 0, 0, classes);
  }
  if (options) {
    symbolNode.maxFontSize = options.sizeMultiplier;
    if (options.style.isTight()) {
      symbolNode.classes.push("mtight");
    }
    var color = options.getColor();
    if (color) {
      symbolNode.style.color = color;
    }
  }
  return symbolNode;
};
var mathsym = function mathsym2(value, mode, options, classes) {
  if (classes === void 0) {
    classes = [];
  }
  if (options.font === "boldsymbol" && lookupSymbol(value, "Main-Bold", mode).metrics) {
    return makeSymbol(value, "Main-Bold", mode, options, classes.concat(["mathbf"]));
  } else if (value === "\\" || symbols[mode][value].font === "main") {
    return makeSymbol(value, "Main-Regular", mode, options, classes);
  } else {
    return makeSymbol(value, "AMS-Regular", mode, options, classes.concat(["amsrm"]));
  }
};
var boldsymbol = function boldsymbol2(value, mode, options, classes, type) {
  if (type !== "textord" && lookupSymbol(value, "Math-BoldItalic", mode).metrics) {
    return {
      fontName: "Math-BoldItalic",
      fontClass: "boldsymbol"
    };
  } else {
    return {
      fontName: "Main-Bold",
      fontClass: "mathbf"
    };
  }
};
var makeOrd = function makeOrd2(group2, options, type) {
  var mode = group2.mode;
  var text2 = group2.text;
  var classes = ["mord"];
  var isFont = mode === "math" || mode === "text" && options.font;
  var fontOrFamily = isFont ? options.font : options.fontFamily;
  var wideFontName = "";
  var wideFontClass = "";
  if (text2.charCodeAt(0) === 55349) {
    [wideFontName, wideFontClass] = wideCharacterFont(text2, mode);
  }
  if (wideFontName.length > 0) {
    return makeSymbol(text2, wideFontName, mode, options, classes.concat(wideFontClass));
  } else if (fontOrFamily) {
    var fontName;
    var fontClasses;
    if (fontOrFamily === "boldsymbol") {
      var fontData = boldsymbol(text2, mode, options, classes, type);
      fontName = fontData.fontName;
      fontClasses = [fontData.fontClass];
    } else if (isFont) {
      fontName = fontMap[fontOrFamily].fontName;
      fontClasses = [fontOrFamily];
    } else {
      fontName = retrieveTextFontName(fontOrFamily, options.fontWeight, options.fontShape);
      fontClasses = [fontOrFamily, options.fontWeight, options.fontShape];
    }
    if (lookupSymbol(text2, fontName, mode).metrics) {
      return makeSymbol(text2, fontName, mode, options, classes.concat(fontClasses));
    } else if (ligatures.hasOwnProperty(text2) && fontName.slice(0, 10) === "Typewriter") {
      var parts = [];
      for (var i2 = 0; i2 < text2.length; i2++) {
        parts.push(makeSymbol(text2[i2], fontName, mode, options, classes.concat(fontClasses)));
      }
      return makeFragment(parts);
    }
  }
  if (type === "mathord") {
    return makeSymbol(text2, "Math-Italic", mode, options, classes.concat(["mathnormal"]));
  } else if (type === "textord") {
    var font = symbols[mode][text2] && symbols[mode][text2].font;
    if (font === "ams") {
      var _fontName = retrieveTextFontName("amsrm", options.fontWeight, options.fontShape);
      return makeSymbol(text2, _fontName, mode, options, classes.concat("amsrm", options.fontWeight, options.fontShape));
    } else if (font === "main" || !font) {
      var _fontName2 = retrieveTextFontName("textrm", options.fontWeight, options.fontShape);
      return makeSymbol(text2, _fontName2, mode, options, classes.concat(options.fontWeight, options.fontShape));
    } else {
      var _fontName3 = retrieveTextFontName(font, options.fontWeight, options.fontShape);
      return makeSymbol(text2, _fontName3, mode, options, classes.concat(_fontName3, options.fontWeight, options.fontShape));
    }
  } else {
    throw new Error("unexpected type: " + type + " in makeOrd");
  }
};
var canCombine = (prev, next) => {
  if (createClass(prev.classes) !== createClass(next.classes) || prev.skew !== next.skew || prev.maxFontSize !== next.maxFontSize) {
    return false;
  }
  if (prev.classes.length === 1) {
    var cls = prev.classes[0];
    if (cls === "mbin" || cls === "mord") {
      return false;
    }
  }
  for (var style in prev.style) {
    if (prev.style.hasOwnProperty(style) && prev.style[style] !== next.style[style]) {
      return false;
    }
  }
  for (var _style in next.style) {
    if (next.style.hasOwnProperty(_style) && prev.style[_style] !== next.style[_style]) {
      return false;
    }
  }
  return true;
};
var tryCombineChars = (chars) => {
  for (var i2 = 0; i2 < chars.length - 1; i2++) {
    var prev = chars[i2];
    var next = chars[i2 + 1];
    if (prev instanceof SymbolNode && next instanceof SymbolNode && canCombine(prev, next)) {
      prev.text += next.text;
      prev.height = Math.max(prev.height, next.height);
      prev.depth = Math.max(prev.depth, next.depth);
      prev.italic = next.italic;
      chars.splice(i2 + 1, 1);
      i2--;
    }
  }
  return chars;
};
var sizeElementFromChildren = function sizeElementFromChildren2(elem) {
  var height = 0;
  var depth = 0;
  var maxFontSize = 0;
  for (var i2 = 0; i2 < elem.children.length; i2++) {
    var child = elem.children[i2];
    if (child.height > height) {
      height = child.height;
    }
    if (child.depth > depth) {
      depth = child.depth;
    }
    if (child.maxFontSize > maxFontSize) {
      maxFontSize = child.maxFontSize;
    }
  }
  elem.height = height;
  elem.depth = depth;
  elem.maxFontSize = maxFontSize;
};
var makeSpan$2 = function makeSpan(classes, children, options, style) {
  var span2 = new Span(classes, children, options, style);
  sizeElementFromChildren(span2);
  return span2;
};
var makeSvgSpan = (classes, children, options, style) => new Span(classes, children, options, style);
var makeLineSpan = function makeLineSpan2(className, options, thickness) {
  var line = makeSpan$2([className], [], options);
  line.height = Math.max(thickness || options.fontMetrics().defaultRuleThickness, options.minRuleThickness);
  line.style.borderBottomWidth = makeEm(line.height);
  line.maxFontSize = 1;
  return line;
};
var makeAnchor = function makeAnchor2(href, classes, children, options) {
  var anchor = new Anchor(href, classes, children, options);
  sizeElementFromChildren(anchor);
  return anchor;
};
var makeFragment = function makeFragment2(children) {
  var fragment = new DocumentFragment(children);
  sizeElementFromChildren(fragment);
  return fragment;
};
var wrapFragment = function wrapFragment2(group2, options) {
  if (group2 instanceof DocumentFragment) {
    return makeSpan$2([], [group2], options);
  }
  return group2;
};
var getVListChildrenAndDepth = function getVListChildrenAndDepth2(params) {
  if (params.positionType === "individualShift") {
    var oldChildren = params.children;
    var children = [oldChildren[0]];
    var _depth = -oldChildren[0].shift - oldChildren[0].elem.depth;
    var currPos = _depth;
    for (var i2 = 1; i2 < oldChildren.length; i2++) {
      var diff = -oldChildren[i2].shift - currPos - oldChildren[i2].elem.depth;
      var size = diff - (oldChildren[i2 - 1].elem.height + oldChildren[i2 - 1].elem.depth);
      currPos = currPos + diff;
      children.push({
        type: "kern",
        size
      });
      children.push(oldChildren[i2]);
    }
    return {
      children,
      depth: _depth
    };
  }
  var depth;
  if (params.positionType === "top") {
    var bottom = params.positionData;
    for (var _i6 = 0; _i6 < params.children.length; _i6++) {
      var child = params.children[_i6];
      bottom -= child.type === "kern" ? child.size : child.elem.height + child.elem.depth;
    }
    depth = bottom;
  } else if (params.positionType === "bottom") {
    depth = -params.positionData;
  } else {
    var firstChild = params.children[0];
    if (firstChild.type !== "elem") {
      throw new Error('First child must have type "elem".');
    }
    if (params.positionType === "shift") {
      depth = -firstChild.elem.depth - params.positionData;
    } else if (params.positionType === "firstBaseline") {
      depth = -firstChild.elem.depth;
    } else {
      throw new Error("Invalid positionType " + params.positionType + ".");
    }
  }
  return {
    children: params.children,
    depth
  };
};
var makeVList = function makeVList2(params, options) {
  var {
    children,
    depth
  } = getVListChildrenAndDepth(params);
  var pstrutSize = 0;
  for (var i2 = 0; i2 < children.length; i2++) {
    var child = children[i2];
    if (child.type === "elem") {
      var elem = child.elem;
      pstrutSize = Math.max(pstrutSize, elem.maxFontSize, elem.height);
    }
  }
  pstrutSize += 2;
  var pstrut = makeSpan$2(["pstrut"], []);
  pstrut.style.height = makeEm(pstrutSize);
  var realChildren = [];
  var minPos = depth;
  var maxPos = depth;
  var currPos = depth;
  for (var _i22 = 0; _i22 < children.length; _i22++) {
    var _child = children[_i22];
    if (_child.type === "kern") {
      currPos += _child.size;
    } else {
      var _elem = _child.elem;
      var classes = _child.wrapperClasses || [];
      var style = _child.wrapperStyle || {};
      var childWrap = makeSpan$2(classes, [pstrut, _elem], void 0, style);
      childWrap.style.top = makeEm(-pstrutSize - currPos - _elem.depth);
      if (_child.marginLeft) {
        childWrap.style.marginLeft = _child.marginLeft;
      }
      if (_child.marginRight) {
        childWrap.style.marginRight = _child.marginRight;
      }
      realChildren.push(childWrap);
      currPos += _elem.height + _elem.depth;
    }
    minPos = Math.min(minPos, currPos);
    maxPos = Math.max(maxPos, currPos);
  }
  var vlist = makeSpan$2(["vlist"], realChildren);
  vlist.style.height = makeEm(maxPos);
  var rows;
  if (minPos < 0) {
    var emptySpan = makeSpan$2([], []);
    var depthStrut = makeSpan$2(["vlist"], [emptySpan]);
    depthStrut.style.height = makeEm(-minPos);
    var topStrut = makeSpan$2(["vlist-s"], [new SymbolNode("\u200B")]);
    rows = [makeSpan$2(["vlist-r"], [vlist, topStrut]), makeSpan$2(["vlist-r"], [depthStrut])];
  } else {
    rows = [makeSpan$2(["vlist-r"], [vlist])];
  }
  var vtable = makeSpan$2(["vlist-t"], rows);
  if (rows.length === 2) {
    vtable.classes.push("vlist-t2");
  }
  vtable.height = maxPos;
  vtable.depth = -minPos;
  return vtable;
};
var makeGlue = (measurement, options) => {
  var rule = makeSpan$2(["mspace"], [], options);
  var size = calculateSize(measurement, options);
  rule.style.marginRight = makeEm(size);
  return rule;
};
var retrieveTextFontName = function retrieveTextFontName2(fontFamily, fontWeight, fontShape) {
  var baseFontName = "";
  switch (fontFamily) {
    case "amsrm":
      baseFontName = "AMS";
      break;
    case "textrm":
      baseFontName = "Main";
      break;
    case "textsf":
      baseFontName = "SansSerif";
      break;
    case "texttt":
      baseFontName = "Typewriter";
      break;
    default:
      baseFontName = fontFamily;
  }
  var fontStylesName;
  if (fontWeight === "textbf" && fontShape === "textit") {
    fontStylesName = "BoldItalic";
  } else if (fontWeight === "textbf") {
    fontStylesName = "Bold";
  } else if (fontWeight === "textit") {
    fontStylesName = "Italic";
  } else {
    fontStylesName = "Regular";
  }
  return baseFontName + "-" + fontStylesName;
};
var fontMap = {
  // styles
  "mathbf": {
    variant: "bold",
    fontName: "Main-Bold"
  },
  "mathrm": {
    variant: "normal",
    fontName: "Main-Regular"
  },
  "textit": {
    variant: "italic",
    fontName: "Main-Italic"
  },
  "mathit": {
    variant: "italic",
    fontName: "Main-Italic"
  },
  "mathnormal": {
    variant: "italic",
    fontName: "Math-Italic"
  },
  "mathsfit": {
    variant: "sans-serif-italic",
    fontName: "SansSerif-Italic"
  },
  // "boldsymbol" is missing because they require the use of multiple fonts:
  // Math-BoldItalic and Main-Bold.  This is handled by a special case in
  // makeOrd which ends up calling boldsymbol.
  // families
  "mathbb": {
    variant: "double-struck",
    fontName: "AMS-Regular"
  },
  "mathcal": {
    variant: "script",
    fontName: "Caligraphic-Regular"
  },
  "mathfrak": {
    variant: "fraktur",
    fontName: "Fraktur-Regular"
  },
  "mathscr": {
    variant: "script",
    fontName: "Script-Regular"
  },
  "mathsf": {
    variant: "sans-serif",
    fontName: "SansSerif-Regular"
  },
  "mathtt": {
    variant: "monospace",
    fontName: "Typewriter-Regular"
  }
};
var svgData = {
  //   path, width, height
  vec: ["vec", 0.471, 0.714],
  // values from the font glyph
  oiintSize1: ["oiintSize1", 0.957, 0.499],
  // oval to overlay the integrand
  oiintSize2: ["oiintSize2", 1.472, 0.659],
  oiiintSize1: ["oiiintSize1", 1.304, 0.499],
  oiiintSize2: ["oiiintSize2", 1.98, 0.659]
};
var staticSvg = function staticSvg2(value, options) {
  var [pathName, width, height] = svgData[value];
  var path2 = new PathNode(pathName);
  var svgNode = new SvgNode([path2], {
    "width": makeEm(width),
    "height": makeEm(height),
    // Override CSS rule `.katex svg { width: 100% }`
    "style": "width:" + makeEm(width),
    "viewBox": "0 0 " + 1e3 * width + " " + 1e3 * height,
    "preserveAspectRatio": "xMinYMin"
  });
  var span2 = makeSvgSpan(["overlay"], [svgNode], options);
  span2.height = height;
  span2.style.height = makeEm(height);
  span2.style.width = makeEm(width);
  return span2;
};
var buildCommon = {
  fontMap,
  makeSymbol,
  mathsym,
  makeSpan: makeSpan$2,
  makeSvgSpan,
  makeLineSpan,
  makeAnchor,
  makeFragment,
  wrapFragment,
  makeVList,
  makeOrd,
  makeGlue,
  staticSvg,
  svgData,
  tryCombineChars
};
var thinspace = {
  number: 3,
  unit: "mu"
};
var mediumspace = {
  number: 4,
  unit: "mu"
};
var thickspace = {
  number: 5,
  unit: "mu"
};
var spacings = {
  mord: {
    mop: thinspace,
    mbin: mediumspace,
    mrel: thickspace,
    minner: thinspace
  },
  mop: {
    mord: thinspace,
    mop: thinspace,
    mrel: thickspace,
    minner: thinspace
  },
  mbin: {
    mord: mediumspace,
    mop: mediumspace,
    mopen: mediumspace,
    minner: mediumspace
  },
  mrel: {
    mord: thickspace,
    mop: thickspace,
    mopen: thickspace,
    minner: thickspace
  },
  mopen: {},
  mclose: {
    mop: thinspace,
    mbin: mediumspace,
    mrel: thickspace,
    minner: thinspace
  },
  mpunct: {
    mord: thinspace,
    mop: thinspace,
    mrel: thickspace,
    mopen: thinspace,
    mclose: thinspace,
    mpunct: thinspace,
    minner: thinspace
  },
  minner: {
    mord: thinspace,
    mop: thinspace,
    mbin: mediumspace,
    mrel: thickspace,
    mopen: thinspace,
    mpunct: thinspace,
    minner: thinspace
  }
};
var tightSpacings = {
  mord: {
    mop: thinspace
  },
  mop: {
    mord: thinspace,
    mop: thinspace
  },
  mbin: {},
  mrel: {},
  mopen: {},
  mclose: {
    mop: thinspace
  },
  mpunct: {},
  minner: {
    mop: thinspace
  }
};
var _functions = {};
var _htmlGroupBuilders = {};
var _mathmlGroupBuilders = {};
function defineFunction(_ref) {
  var {
    type,
    names,
    props,
    handler,
    htmlBuilder: htmlBuilder3,
    mathmlBuilder: mathmlBuilder3
  } = _ref;
  var data = {
    type,
    numArgs: props.numArgs,
    argTypes: props.argTypes,
    allowedInArgument: !!props.allowedInArgument,
    allowedInText: !!props.allowedInText,
    allowedInMath: props.allowedInMath === void 0 ? true : props.allowedInMath,
    numOptionalArgs: props.numOptionalArgs || 0,
    infix: !!props.infix,
    primitive: !!props.primitive,
    handler
  };
  for (var i2 = 0; i2 < names.length; ++i2) {
    _functions[names[i2]] = data;
  }
  if (type) {
    if (htmlBuilder3) {
      _htmlGroupBuilders[type] = htmlBuilder3;
    }
    if (mathmlBuilder3) {
      _mathmlGroupBuilders[type] = mathmlBuilder3;
    }
  }
}
function defineFunctionBuilders(_ref2) {
  var {
    type,
    htmlBuilder: htmlBuilder3,
    mathmlBuilder: mathmlBuilder3
  } = _ref2;
  defineFunction({
    type,
    names: [],
    props: {
      numArgs: 0
    },
    handler() {
      throw new Error("Should never be called.");
    },
    htmlBuilder: htmlBuilder3,
    mathmlBuilder: mathmlBuilder3
  });
}
var normalizeArgument = function normalizeArgument2(arg) {
  return arg.type === "ordgroup" && arg.body.length === 1 ? arg.body[0] : arg;
};
var ordargument = function ordargument2(arg) {
  return arg.type === "ordgroup" ? arg.body : [arg];
};
var makeSpan$1 = buildCommon.makeSpan;
var binLeftCanceller = ["leftmost", "mbin", "mopen", "mrel", "mop", "mpunct"];
var binRightCanceller = ["rightmost", "mrel", "mclose", "mpunct"];
var styleMap$1 = {
  "display": Style$1.DISPLAY,
  "text": Style$1.TEXT,
  "script": Style$1.SCRIPT,
  "scriptscript": Style$1.SCRIPTSCRIPT
};
var DomEnum = {
  mord: "mord",
  mop: "mop",
  mbin: "mbin",
  mrel: "mrel",
  mopen: "mopen",
  mclose: "mclose",
  mpunct: "mpunct",
  minner: "minner"
};
var buildExpression$1 = function buildExpression(expression, options, isRealGroup, surrounding) {
  if (surrounding === void 0) {
    surrounding = [null, null];
  }
  var groups = [];
  for (var i2 = 0; i2 < expression.length; i2++) {
    var output = buildGroup$1(expression[i2], options);
    if (output instanceof DocumentFragment) {
      var children = output.children;
      groups.push(...children);
    } else {
      groups.push(output);
    }
  }
  buildCommon.tryCombineChars(groups);
  if (!isRealGroup) {
    return groups;
  }
  var glueOptions = options;
  if (expression.length === 1) {
    var node = expression[0];
    if (node.type === "sizing") {
      glueOptions = options.havingSize(node.size);
    } else if (node.type === "styling") {
      glueOptions = options.havingStyle(styleMap$1[node.style]);
    }
  }
  var dummyPrev = makeSpan$1([surrounding[0] || "leftmost"], [], options);
  var dummyNext = makeSpan$1([surrounding[1] || "rightmost"], [], options);
  var isRoot = isRealGroup === "root";
  traverseNonSpaceNodes(groups, (node2, prev) => {
    var prevType = prev.classes[0];
    var type = node2.classes[0];
    if (prevType === "mbin" && utils.contains(binRightCanceller, type)) {
      prev.classes[0] = "mord";
    } else if (type === "mbin" && utils.contains(binLeftCanceller, prevType)) {
      node2.classes[0] = "mord";
    }
  }, {
    node: dummyPrev
  }, dummyNext, isRoot);
  traverseNonSpaceNodes(groups, (node2, prev) => {
    var prevType = getTypeOfDomTree(prev);
    var type = getTypeOfDomTree(node2);
    var space = prevType && type ? node2.hasClass("mtight") ? tightSpacings[prevType][type] : spacings[prevType][type] : null;
    if (space) {
      return buildCommon.makeGlue(space, glueOptions);
    }
  }, {
    node: dummyPrev
  }, dummyNext, isRoot);
  return groups;
};
var traverseNonSpaceNodes = function traverseNonSpaceNodes2(nodes, callback, prev, next, isRoot) {
  if (next) {
    nodes.push(next);
  }
  var i2 = 0;
  for (; i2 < nodes.length; i2++) {
    var node = nodes[i2];
    var partialGroup = checkPartialGroup(node);
    if (partialGroup) {
      traverseNonSpaceNodes2(partialGroup.children, callback, prev, null, isRoot);
      continue;
    }
    var nonspace = !node.hasClass("mspace");
    if (nonspace) {
      var result = callback(node, prev.node);
      if (result) {
        if (prev.insertAfter) {
          prev.insertAfter(result);
        } else {
          nodes.unshift(result);
          i2++;
        }
      }
    }
    if (nonspace) {
      prev.node = node;
    } else if (isRoot && node.hasClass("newline")) {
      prev.node = makeSpan$1(["leftmost"]);
    }
    prev.insertAfter = /* @__PURE__ */ ((index) => (n) => {
      nodes.splice(index + 1, 0, n);
      i2++;
    })(i2);
  }
  if (next) {
    nodes.pop();
  }
};
var checkPartialGroup = function checkPartialGroup2(node) {
  if (node instanceof DocumentFragment || node instanceof Anchor || node instanceof Span && node.hasClass("enclosing")) {
    return node;
  }
  return null;
};
var getOutermostNode = function getOutermostNode2(node, side) {
  var partialGroup = checkPartialGroup(node);
  if (partialGroup) {
    var children = partialGroup.children;
    if (children.length) {
      if (side === "right") {
        return getOutermostNode2(children[children.length - 1], "right");
      } else if (side === "left") {
        return getOutermostNode2(children[0], "left");
      }
    }
  }
  return node;
};
var getTypeOfDomTree = function getTypeOfDomTree2(node, side) {
  if (!node) {
    return null;
  }
  if (side) {
    node = getOutermostNode(node, side);
  }
  return DomEnum[node.classes[0]] || null;
};
var makeNullDelimiter = function makeNullDelimiter2(options, classes) {
  var moreClasses = ["nulldelimiter"].concat(options.baseSizingClasses());
  return makeSpan$1(classes.concat(moreClasses));
};
var buildGroup$1 = function buildGroup(group2, options, baseOptions) {
  if (!group2) {
    return makeSpan$1();
  }
  if (_htmlGroupBuilders[group2.type]) {
    var groupNode = _htmlGroupBuilders[group2.type](group2, options);
    if (baseOptions && options.size !== baseOptions.size) {
      groupNode = makeSpan$1(options.sizingClasses(baseOptions), [groupNode], options);
      var multiplier = options.sizeMultiplier / baseOptions.sizeMultiplier;
      groupNode.height *= multiplier;
      groupNode.depth *= multiplier;
    }
    return groupNode;
  } else {
    throw new ParseError("Got group of unknown type: '" + group2.type + "'");
  }
};
function buildHTMLUnbreakable(children, options) {
  var body = makeSpan$1(["base"], children, options);
  var strut = makeSpan$1(["strut"]);
  strut.style.height = makeEm(body.height + body.depth);
  if (body.depth) {
    strut.style.verticalAlign = makeEm(-body.depth);
  }
  body.children.unshift(strut);
  return body;
}
function buildHTML(tree, options) {
  var tag = null;
  if (tree.length === 1 && tree[0].type === "tag") {
    tag = tree[0].tag;
    tree = tree[0].body;
  }
  var expression = buildExpression$1(tree, options, "root");
  var eqnNum;
  if (expression.length === 2 && expression[1].hasClass("tag")) {
    eqnNum = expression.pop();
  }
  var children = [];
  var parts = [];
  for (var i2 = 0; i2 < expression.length; i2++) {
    parts.push(expression[i2]);
    if (expression[i2].hasClass("mbin") || expression[i2].hasClass("mrel") || expression[i2].hasClass("allowbreak")) {
      var nobreak = false;
      while (i2 < expression.length - 1 && expression[i2 + 1].hasClass("mspace") && !expression[i2 + 1].hasClass("newline")) {
        i2++;
        parts.push(expression[i2]);
        if (expression[i2].hasClass("nobreak")) {
          nobreak = true;
        }
      }
      if (!nobreak) {
        children.push(buildHTMLUnbreakable(parts, options));
        parts = [];
      }
    } else if (expression[i2].hasClass("newline")) {
      parts.pop();
      if (parts.length > 0) {
        children.push(buildHTMLUnbreakable(parts, options));
        parts = [];
      }
      children.push(expression[i2]);
    }
  }
  if (parts.length > 0) {
    children.push(buildHTMLUnbreakable(parts, options));
  }
  var tagChild;
  if (tag) {
    tagChild = buildHTMLUnbreakable(buildExpression$1(tag, options, true));
    tagChild.classes = ["tag"];
    children.push(tagChild);
  } else if (eqnNum) {
    children.push(eqnNum);
  }
  var htmlNode = makeSpan$1(["katex-html"], children);
  htmlNode.setAttribute("aria-hidden", "true");
  if (tagChild) {
    var strut = tagChild.children[0];
    strut.style.height = makeEm(htmlNode.height + htmlNode.depth);
    if (htmlNode.depth) {
      strut.style.verticalAlign = makeEm(-htmlNode.depth);
    }
  }
  return htmlNode;
}
function newDocumentFragment(children) {
  return new DocumentFragment(children);
}
var MathNode = class {
  constructor(type, children, classes) {
    this.type = void 0;
    this.attributes = void 0;
    this.children = void 0;
    this.classes = void 0;
    this.type = type;
    this.attributes = {};
    this.children = children || [];
    this.classes = classes || [];
  }
  /**
   * Sets an attribute on a MathML node. MathML depends on attributes to convey a
   * semantic content, so this is used heavily.
   */
  setAttribute(name, value) {
    this.attributes[name] = value;
  }
  /**
   * Gets an attribute on a MathML node.
   */
  getAttribute(name) {
    return this.attributes[name];
  }
  /**
   * Converts the math node into a MathML-namespaced DOM element.
   */
  toNode() {
    var node = document.createElementNS("http://www.w3.org/1998/Math/MathML", this.type);
    for (var attr in this.attributes) {
      if (Object.prototype.hasOwnProperty.call(this.attributes, attr)) {
        node.setAttribute(attr, this.attributes[attr]);
      }
    }
    if (this.classes.length > 0) {
      node.className = createClass(this.classes);
    }
    for (var i2 = 0; i2 < this.children.length; i2++) {
      if (this.children[i2] instanceof TextNode && this.children[i2 + 1] instanceof TextNode) {
        var text2 = this.children[i2].toText() + this.children[++i2].toText();
        while (this.children[i2 + 1] instanceof TextNode) {
          text2 += this.children[++i2].toText();
        }
        node.appendChild(new TextNode(text2).toNode());
      } else {
        node.appendChild(this.children[i2].toNode());
      }
    }
    return node;
  }
  /**
   * Converts the math node into an HTML markup string.
   */
  toMarkup() {
    var markup = "<" + this.type;
    for (var attr in this.attributes) {
      if (Object.prototype.hasOwnProperty.call(this.attributes, attr)) {
        markup += " " + attr + '="';
        markup += utils.escape(this.attributes[attr]);
        markup += '"';
      }
    }
    if (this.classes.length > 0) {
      markup += ' class ="' + utils.escape(createClass(this.classes)) + '"';
    }
    markup += ">";
    for (var i2 = 0; i2 < this.children.length; i2++) {
      markup += this.children[i2].toMarkup();
    }
    markup += "</" + this.type + ">";
    return markup;
  }
  /**
   * Converts the math node into a string, similar to innerText, but escaped.
   */
  toText() {
    return this.children.map((child) => child.toText()).join("");
  }
};
var TextNode = class {
  constructor(text2) {
    this.text = void 0;
    this.text = text2;
  }
  /**
   * Converts the text node into a DOM text node.
   */
  toNode() {
    return document.createTextNode(this.text);
  }
  /**
   * Converts the text node into escaped HTML markup
   * (representing the text itself).
   */
  toMarkup() {
    return utils.escape(this.toText());
  }
  /**
   * Converts the text node into a string
   * (representing the text itself).
   */
  toText() {
    return this.text;
  }
};
var SpaceNode = class {
  /**
   * Create a Space node with width given in CSS ems.
   */
  constructor(width) {
    this.width = void 0;
    this.character = void 0;
    this.width = width;
    if (width >= 0.05555 && width <= 0.05556) {
      this.character = "\u200A";
    } else if (width >= 0.1666 && width <= 0.1667) {
      this.character = "\u2009";
    } else if (width >= 0.2222 && width <= 0.2223) {
      this.character = "\u2005";
    } else if (width >= 0.2777 && width <= 0.2778) {
      this.character = "\u2005\u200A";
    } else if (width >= -0.05556 && width <= -0.05555) {
      this.character = "\u200A\u2063";
    } else if (width >= -0.1667 && width <= -0.1666) {
      this.character = "\u2009\u2063";
    } else if (width >= -0.2223 && width <= -0.2222) {
      this.character = "\u205F\u2063";
    } else if (width >= -0.2778 && width <= -0.2777) {
      this.character = "\u2005\u2063";
    } else {
      this.character = null;
    }
  }
  /**
   * Converts the math node into a MathML-namespaced DOM element.
   */
  toNode() {
    if (this.character) {
      return document.createTextNode(this.character);
    } else {
      var node = document.createElementNS("http://www.w3.org/1998/Math/MathML", "mspace");
      node.setAttribute("width", makeEm(this.width));
      return node;
    }
  }
  /**
   * Converts the math node into an HTML markup string.
   */
  toMarkup() {
    if (this.character) {
      return "<mtext>" + this.character + "</mtext>";
    } else {
      return '<mspace width="' + makeEm(this.width) + '"/>';
    }
  }
  /**
   * Converts the math node into a string, similar to innerText.
   */
  toText() {
    if (this.character) {
      return this.character;
    } else {
      return " ";
    }
  }
};
var mathMLTree = {
  MathNode,
  TextNode,
  SpaceNode,
  newDocumentFragment
};
var makeText = function makeText2(text2, mode, options) {
  if (symbols[mode][text2] && symbols[mode][text2].replace && text2.charCodeAt(0) !== 55349 && !(ligatures.hasOwnProperty(text2) && options && (options.fontFamily && options.fontFamily.slice(4, 6) === "tt" || options.font && options.font.slice(4, 6) === "tt"))) {
    text2 = symbols[mode][text2].replace;
  }
  return new mathMLTree.TextNode(text2);
};
var makeRow = function makeRow2(body) {
  if (body.length === 1) {
    return body[0];
  } else {
    return new mathMLTree.MathNode("mrow", body);
  }
};
var getVariant = function getVariant2(group2, options) {
  if (options.fontFamily === "texttt") {
    return "monospace";
  } else if (options.fontFamily === "textsf") {
    if (options.fontShape === "textit" && options.fontWeight === "textbf") {
      return "sans-serif-bold-italic";
    } else if (options.fontShape === "textit") {
      return "sans-serif-italic";
    } else if (options.fontWeight === "textbf") {
      return "bold-sans-serif";
    } else {
      return "sans-serif";
    }
  } else if (options.fontShape === "textit" && options.fontWeight === "textbf") {
    return "bold-italic";
  } else if (options.fontShape === "textit") {
    return "italic";
  } else if (options.fontWeight === "textbf") {
    return "bold";
  }
  var font = options.font;
  if (!font || font === "mathnormal") {
    return null;
  }
  var mode = group2.mode;
  if (font === "mathit") {
    return "italic";
  } else if (font === "boldsymbol") {
    return group2.type === "textord" ? "bold" : "bold-italic";
  } else if (font === "mathbf") {
    return "bold";
  } else if (font === "mathbb") {
    return "double-struck";
  } else if (font === "mathsfit") {
    return "sans-serif-italic";
  } else if (font === "mathfrak") {
    return "fraktur";
  } else if (font === "mathscr" || font === "mathcal") {
    return "script";
  } else if (font === "mathsf") {
    return "sans-serif";
  } else if (font === "mathtt") {
    return "monospace";
  }
  var text2 = group2.text;
  if (utils.contains(["\\imath", "\\jmath"], text2)) {
    return null;
  }
  if (symbols[mode][text2] && symbols[mode][text2].replace) {
    text2 = symbols[mode][text2].replace;
  }
  var fontName = buildCommon.fontMap[font].fontName;
  if (getCharacterMetrics(text2, fontName, mode)) {
    return buildCommon.fontMap[font].variant;
  }
  return null;
};
function isNumberPunctuation(group2) {
  if (!group2) {
    return false;
  }
  if (group2.type === "mi" && group2.children.length === 1) {
    var child = group2.children[0];
    return child instanceof TextNode && child.text === ".";
  } else if (group2.type === "mo" && group2.children.length === 1 && group2.getAttribute("separator") === "true" && group2.getAttribute("lspace") === "0em" && group2.getAttribute("rspace") === "0em") {
    var _child = group2.children[0];
    return _child instanceof TextNode && _child.text === ",";
  } else {
    return false;
  }
}
var buildExpression2 = function buildExpression3(expression, options, isOrdgroup) {
  if (expression.length === 1) {
    var group2 = buildGroup2(expression[0], options);
    if (isOrdgroup && group2 instanceof MathNode && group2.type === "mo") {
      group2.setAttribute("lspace", "0em");
      group2.setAttribute("rspace", "0em");
    }
    return [group2];
  }
  var groups = [];
  var lastGroup;
  for (var i2 = 0; i2 < expression.length; i2++) {
    var _group = buildGroup2(expression[i2], options);
    if (_group instanceof MathNode && lastGroup instanceof MathNode) {
      if (_group.type === "mtext" && lastGroup.type === "mtext" && _group.getAttribute("mathvariant") === lastGroup.getAttribute("mathvariant")) {
        lastGroup.children.push(..._group.children);
        continue;
      } else if (_group.type === "mn" && lastGroup.type === "mn") {
        lastGroup.children.push(..._group.children);
        continue;
      } else if (isNumberPunctuation(_group) && lastGroup.type === "mn") {
        lastGroup.children.push(..._group.children);
        continue;
      } else if (_group.type === "mn" && isNumberPunctuation(lastGroup)) {
        _group.children = [...lastGroup.children, ..._group.children];
        groups.pop();
      } else if ((_group.type === "msup" || _group.type === "msub") && _group.children.length >= 1 && (lastGroup.type === "mn" || isNumberPunctuation(lastGroup))) {
        var base = _group.children[0];
        if (base instanceof MathNode && base.type === "mn") {
          base.children = [...lastGroup.children, ...base.children];
          groups.pop();
        }
      } else if (lastGroup.type === "mi" && lastGroup.children.length === 1) {
        var lastChild = lastGroup.children[0];
        if (lastChild instanceof TextNode && lastChild.text === "\u0338" && (_group.type === "mo" || _group.type === "mi" || _group.type === "mn")) {
          var child = _group.children[0];
          if (child instanceof TextNode && child.text.length > 0) {
            child.text = child.text.slice(0, 1) + "\u0338" + child.text.slice(1);
            groups.pop();
          }
        }
      }
    }
    groups.push(_group);
    lastGroup = _group;
  }
  return groups;
};
var buildExpressionRow = function buildExpressionRow2(expression, options, isOrdgroup) {
  return makeRow(buildExpression2(expression, options, isOrdgroup));
};
var buildGroup2 = function buildGroup3(group2, options) {
  if (!group2) {
    return new mathMLTree.MathNode("mrow");
  }
  if (_mathmlGroupBuilders[group2.type]) {
    var result = _mathmlGroupBuilders[group2.type](group2, options);
    return result;
  } else {
    throw new ParseError("Got group of unknown type: '" + group2.type + "'");
  }
};
function buildMathML(tree, texExpression, options, isDisplayMode, forMathmlOnly) {
  var expression = buildExpression2(tree, options);
  var wrapper;
  if (expression.length === 1 && expression[0] instanceof MathNode && utils.contains(["mrow", "mtable"], expression[0].type)) {
    wrapper = expression[0];
  } else {
    wrapper = new mathMLTree.MathNode("mrow", expression);
  }
  var annotation = new mathMLTree.MathNode("annotation", [new mathMLTree.TextNode(texExpression)]);
  annotation.setAttribute("encoding", "application/x-tex");
  var semantics = new mathMLTree.MathNode("semantics", [wrapper, annotation]);
  var math2 = new mathMLTree.MathNode("math", [semantics]);
  math2.setAttribute("xmlns", "http://www.w3.org/1998/Math/MathML");
  if (isDisplayMode) {
    math2.setAttribute("display", "block");
  }
  var wrapperClass = forMathmlOnly ? "katex" : "katex-mathml";
  return buildCommon.makeSpan([wrapperClass], [math2]);
}
var optionsFromSettings = function optionsFromSettings2(settings) {
  return new Options({
    style: settings.displayMode ? Style$1.DISPLAY : Style$1.TEXT,
    maxSize: settings.maxSize,
    minRuleThickness: settings.minRuleThickness
  });
};
var displayWrap = function displayWrap2(node, settings) {
  if (settings.displayMode) {
    var classes = ["katex-display"];
    if (settings.leqno) {
      classes.push("leqno");
    }
    if (settings.fleqn) {
      classes.push("fleqn");
    }
    node = buildCommon.makeSpan(classes, [node]);
  }
  return node;
};
var buildTree = function buildTree2(tree, expression, settings) {
  var options = optionsFromSettings(settings);
  var katexNode;
  if (settings.output === "mathml") {
    return buildMathML(tree, expression, options, settings.displayMode, true);
  } else if (settings.output === "html") {
    var htmlNode = buildHTML(tree, options);
    katexNode = buildCommon.makeSpan(["katex"], [htmlNode]);
  } else {
    var mathMLNode = buildMathML(tree, expression, options, settings.displayMode, false);
    var _htmlNode = buildHTML(tree, options);
    katexNode = buildCommon.makeSpan(["katex"], [mathMLNode, _htmlNode]);
  }
  return displayWrap(katexNode, settings);
};
var buildHTMLTree = function buildHTMLTree2(tree, expression, settings) {
  var options = optionsFromSettings(settings);
  var htmlNode = buildHTML(tree, options);
  var katexNode = buildCommon.makeSpan(["katex"], [htmlNode]);
  return displayWrap(katexNode, settings);
};
var stretchyCodePoint = {
  widehat: "^",
  widecheck: "\u02C7",
  widetilde: "~",
  utilde: "~",
  overleftarrow: "\u2190",
  underleftarrow: "\u2190",
  xleftarrow: "\u2190",
  overrightarrow: "\u2192",
  underrightarrow: "\u2192",
  xrightarrow: "\u2192",
  underbrace: "\u23DF",
  overbrace: "\u23DE",
  overgroup: "\u23E0",
  undergroup: "\u23E1",
  overleftrightarrow: "\u2194",
  underleftrightarrow: "\u2194",
  xleftrightarrow: "\u2194",
  Overrightarrow: "\u21D2",
  xRightarrow: "\u21D2",
  overleftharpoon: "\u21BC",
  xleftharpoonup: "\u21BC",
  overrightharpoon: "\u21C0",
  xrightharpoonup: "\u21C0",
  xLeftarrow: "\u21D0",
  xLeftrightarrow: "\u21D4",
  xhookleftarrow: "\u21A9",
  xhookrightarrow: "\u21AA",
  xmapsto: "\u21A6",
  xrightharpoondown: "\u21C1",
  xleftharpoondown: "\u21BD",
  xrightleftharpoons: "\u21CC",
  xleftrightharpoons: "\u21CB",
  xtwoheadleftarrow: "\u219E",
  xtwoheadrightarrow: "\u21A0",
  xlongequal: "=",
  xtofrom: "\u21C4",
  xrightleftarrows: "\u21C4",
  xrightequilibrium: "\u21CC",
  // Not a perfect match.
  xleftequilibrium: "\u21CB",
  // None better available.
  "\\cdrightarrow": "\u2192",
  "\\cdleftarrow": "\u2190",
  "\\cdlongequal": "="
};
var mathMLnode = function mathMLnode2(label) {
  var node = new mathMLTree.MathNode("mo", [new mathMLTree.TextNode(stretchyCodePoint[label.replace(/^\\/, "")])]);
  node.setAttribute("stretchy", "true");
  return node;
};
var katexImagesData = {
  //   path(s), minWidth, height, align
  overrightarrow: [["rightarrow"], 0.888, 522, "xMaxYMin"],
  overleftarrow: [["leftarrow"], 0.888, 522, "xMinYMin"],
  underrightarrow: [["rightarrow"], 0.888, 522, "xMaxYMin"],
  underleftarrow: [["leftarrow"], 0.888, 522, "xMinYMin"],
  xrightarrow: [["rightarrow"], 1.469, 522, "xMaxYMin"],
  "\\cdrightarrow": [["rightarrow"], 3, 522, "xMaxYMin"],
  // CD minwwidth2.5pc
  xleftarrow: [["leftarrow"], 1.469, 522, "xMinYMin"],
  "\\cdleftarrow": [["leftarrow"], 3, 522, "xMinYMin"],
  Overrightarrow: [["doublerightarrow"], 0.888, 560, "xMaxYMin"],
  xRightarrow: [["doublerightarrow"], 1.526, 560, "xMaxYMin"],
  xLeftarrow: [["doubleleftarrow"], 1.526, 560, "xMinYMin"],
  overleftharpoon: [["leftharpoon"], 0.888, 522, "xMinYMin"],
  xleftharpoonup: [["leftharpoon"], 0.888, 522, "xMinYMin"],
  xleftharpoondown: [["leftharpoondown"], 0.888, 522, "xMinYMin"],
  overrightharpoon: [["rightharpoon"], 0.888, 522, "xMaxYMin"],
  xrightharpoonup: [["rightharpoon"], 0.888, 522, "xMaxYMin"],
  xrightharpoondown: [["rightharpoondown"], 0.888, 522, "xMaxYMin"],
  xlongequal: [["longequal"], 0.888, 334, "xMinYMin"],
  "\\cdlongequal": [["longequal"], 3, 334, "xMinYMin"],
  xtwoheadleftarrow: [["twoheadleftarrow"], 0.888, 334, "xMinYMin"],
  xtwoheadrightarrow: [["twoheadrightarrow"], 0.888, 334, "xMaxYMin"],
  overleftrightarrow: [["leftarrow", "rightarrow"], 0.888, 522],
  overbrace: [["leftbrace", "midbrace", "rightbrace"], 1.6, 548],
  underbrace: [["leftbraceunder", "midbraceunder", "rightbraceunder"], 1.6, 548],
  underleftrightarrow: [["leftarrow", "rightarrow"], 0.888, 522],
  xleftrightarrow: [["leftarrow", "rightarrow"], 1.75, 522],
  xLeftrightarrow: [["doubleleftarrow", "doublerightarrow"], 1.75, 560],
  xrightleftharpoons: [["leftharpoondownplus", "rightharpoonplus"], 1.75, 716],
  xleftrightharpoons: [["leftharpoonplus", "rightharpoondownplus"], 1.75, 716],
  xhookleftarrow: [["leftarrow", "righthook"], 1.08, 522],
  xhookrightarrow: [["lefthook", "rightarrow"], 1.08, 522],
  overlinesegment: [["leftlinesegment", "rightlinesegment"], 0.888, 522],
  underlinesegment: [["leftlinesegment", "rightlinesegment"], 0.888, 522],
  overgroup: [["leftgroup", "rightgroup"], 0.888, 342],
  undergroup: [["leftgroupunder", "rightgroupunder"], 0.888, 342],
  xmapsto: [["leftmapsto", "rightarrow"], 1.5, 522],
  xtofrom: [["leftToFrom", "rightToFrom"], 1.75, 528],
  // The next three arrows are from the mhchem package.
  // In mhchem.sty, min-length is 2.0em. But these arrows might appear in the
  // document as \xrightarrow or \xrightleftharpoons. Those have
  // min-length = 1.75em, so we set min-length on these next three to match.
  xrightleftarrows: [["baraboveleftarrow", "rightarrowabovebar"], 1.75, 901],
  xrightequilibrium: [["baraboveshortleftharpoon", "rightharpoonaboveshortbar"], 1.75, 716],
  xleftequilibrium: [["shortbaraboveleftharpoon", "shortrightharpoonabovebar"], 1.75, 716]
};
var groupLength = function groupLength2(arg) {
  if (arg.type === "ordgroup") {
    return arg.body.length;
  } else {
    return 1;
  }
};
var svgSpan = function svgSpan2(group2, options) {
  function buildSvgSpan_() {
    var viewBoxWidth = 4e5;
    var label = group2.label.slice(1);
    if (utils.contains(["widehat", "widecheck", "widetilde", "utilde"], label)) {
      var grp = group2;
      var numChars = groupLength(grp.base);
      var viewBoxHeight;
      var pathName;
      var _height;
      if (numChars > 5) {
        if (label === "widehat" || label === "widecheck") {
          viewBoxHeight = 420;
          viewBoxWidth = 2364;
          _height = 0.42;
          pathName = label + "4";
        } else {
          viewBoxHeight = 312;
          viewBoxWidth = 2340;
          _height = 0.34;
          pathName = "tilde4";
        }
      } else {
        var imgIndex = [1, 1, 2, 2, 3, 3][numChars];
        if (label === "widehat" || label === "widecheck") {
          viewBoxWidth = [0, 1062, 2364, 2364, 2364][imgIndex];
          viewBoxHeight = [0, 239, 300, 360, 420][imgIndex];
          _height = [0, 0.24, 0.3, 0.3, 0.36, 0.42][imgIndex];
          pathName = label + imgIndex;
        } else {
          viewBoxWidth = [0, 600, 1033, 2339, 2340][imgIndex];
          viewBoxHeight = [0, 260, 286, 306, 312][imgIndex];
          _height = [0, 0.26, 0.286, 0.3, 0.306, 0.34][imgIndex];
          pathName = "tilde" + imgIndex;
        }
      }
      var path2 = new PathNode(pathName);
      var svgNode = new SvgNode([path2], {
        "width": "100%",
        "height": makeEm(_height),
        "viewBox": "0 0 " + viewBoxWidth + " " + viewBoxHeight,
        "preserveAspectRatio": "none"
      });
      return {
        span: buildCommon.makeSvgSpan([], [svgNode], options),
        minWidth: 0,
        height: _height
      };
    } else {
      var spans = [];
      var data = katexImagesData[label];
      var [paths, _minWidth, _viewBoxHeight] = data;
      var _height2 = _viewBoxHeight / 1e3;
      var numSvgChildren = paths.length;
      var widthClasses;
      var aligns;
      if (numSvgChildren === 1) {
        var align1 = data[3];
        widthClasses = ["hide-tail"];
        aligns = [align1];
      } else if (numSvgChildren === 2) {
        widthClasses = ["halfarrow-left", "halfarrow-right"];
        aligns = ["xMinYMin", "xMaxYMin"];
      } else if (numSvgChildren === 3) {
        widthClasses = ["brace-left", "brace-center", "brace-right"];
        aligns = ["xMinYMin", "xMidYMin", "xMaxYMin"];
      } else {
        throw new Error("Correct katexImagesData or update code here to support\n                    " + numSvgChildren + " children.");
      }
      for (var i2 = 0; i2 < numSvgChildren; i2++) {
        var _path = new PathNode(paths[i2]);
        var _svgNode = new SvgNode([_path], {
          "width": "400em",
          "height": makeEm(_height2),
          "viewBox": "0 0 " + viewBoxWidth + " " + _viewBoxHeight,
          "preserveAspectRatio": aligns[i2] + " slice"
        });
        var _span = buildCommon.makeSvgSpan([widthClasses[i2]], [_svgNode], options);
        if (numSvgChildren === 1) {
          return {
            span: _span,
            minWidth: _minWidth,
            height: _height2
          };
        } else {
          _span.style.height = makeEm(_height2);
          spans.push(_span);
        }
      }
      return {
        span: buildCommon.makeSpan(["stretchy"], spans, options),
        minWidth: _minWidth,
        height: _height2
      };
    }
  }
  var {
    span: span2,
    minWidth,
    height
  } = buildSvgSpan_();
  span2.height = height;
  span2.style.height = makeEm(height);
  if (minWidth > 0) {
    span2.style.minWidth = makeEm(minWidth);
  }
  return span2;
};
var encloseSpan = function encloseSpan2(inner2, label, topPad, bottomPad, options) {
  var img;
  var totalHeight = inner2.height + inner2.depth + topPad + bottomPad;
  if (/fbox|color|angl/.test(label)) {
    img = buildCommon.makeSpan(["stretchy", label], [], options);
    if (label === "fbox") {
      var color = options.color && options.getColor();
      if (color) {
        img.style.borderColor = color;
      }
    }
  } else {
    var lines = [];
    if (/^[bx]cancel$/.test(label)) {
      lines.push(new LineNode({
        "x1": "0",
        "y1": "0",
        "x2": "100%",
        "y2": "100%",
        "stroke-width": "0.046em"
      }));
    }
    if (/^x?cancel$/.test(label)) {
      lines.push(new LineNode({
        "x1": "0",
        "y1": "100%",
        "x2": "100%",
        "y2": "0",
        "stroke-width": "0.046em"
      }));
    }
    var svgNode = new SvgNode(lines, {
      "width": "100%",
      "height": makeEm(totalHeight)
    });
    img = buildCommon.makeSvgSpan([], [svgNode], options);
  }
  img.height = totalHeight;
  img.style.height = makeEm(totalHeight);
  return img;
};
var stretchy = {
  encloseSpan,
  mathMLnode,
  svgSpan
};
function assertNodeType(node, type) {
  if (!node || node.type !== type) {
    throw new Error("Expected node of type " + type + ", but got " + (node ? "node of type " + node.type : String(node)));
  }
  return node;
}
function assertSymbolNodeType(node) {
  var typedNode = checkSymbolNodeType(node);
  if (!typedNode) {
    throw new Error("Expected node of symbol group type, but got " + (node ? "node of type " + node.type : String(node)));
  }
  return typedNode;
}
function checkSymbolNodeType(node) {
  if (node && (node.type === "atom" || NON_ATOMS.hasOwnProperty(node.type))) {
    return node;
  }
  return null;
}
var htmlBuilder$a = (grp, options) => {
  var base;
  var group2;
  var supSubGroup;
  if (grp && grp.type === "supsub") {
    group2 = assertNodeType(grp.base, "accent");
    base = group2.base;
    grp.base = base;
    supSubGroup = assertSpan(buildGroup$1(grp, options));
    grp.base = group2;
  } else {
    group2 = assertNodeType(grp, "accent");
    base = group2.base;
  }
  var body = buildGroup$1(base, options.havingCrampedStyle());
  var mustShift = group2.isShifty && utils.isCharacterBox(base);
  var skew = 0;
  if (mustShift) {
    var baseChar = utils.getBaseElem(base);
    var baseGroup = buildGroup$1(baseChar, options.havingCrampedStyle());
    skew = assertSymbolDomNode(baseGroup).skew;
  }
  var accentBelow = group2.label === "\\c";
  var clearance = accentBelow ? body.height + body.depth : Math.min(body.height, options.fontMetrics().xHeight);
  var accentBody;
  if (!group2.isStretchy) {
    var accent2;
    var width;
    if (group2.label === "\\vec") {
      accent2 = buildCommon.staticSvg("vec", options);
      width = buildCommon.svgData.vec[1];
    } else {
      accent2 = buildCommon.makeOrd({
        mode: group2.mode,
        text: group2.label
      }, options, "textord");
      accent2 = assertSymbolDomNode(accent2);
      accent2.italic = 0;
      width = accent2.width;
      if (accentBelow) {
        clearance += accent2.depth;
      }
    }
    accentBody = buildCommon.makeSpan(["accent-body"], [accent2]);
    var accentFull = group2.label === "\\textcircled";
    if (accentFull) {
      accentBody.classes.push("accent-full");
      clearance = body.height;
    }
    var left = skew;
    if (!accentFull) {
      left -= width / 2;
    }
    accentBody.style.left = makeEm(left);
    if (group2.label === "\\textcircled") {
      accentBody.style.top = ".2em";
    }
    accentBody = buildCommon.makeVList({
      positionType: "firstBaseline",
      children: [{
        type: "elem",
        elem: body
      }, {
        type: "kern",
        size: -clearance
      }, {
        type: "elem",
        elem: accentBody
      }]
    }, options);
  } else {
    accentBody = stretchy.svgSpan(group2, options);
    accentBody = buildCommon.makeVList({
      positionType: "firstBaseline",
      children: [{
        type: "elem",
        elem: body
      }, {
        type: "elem",
        elem: accentBody,
        wrapperClasses: ["svg-align"],
        wrapperStyle: skew > 0 ? {
          width: "calc(100% - " + makeEm(2 * skew) + ")",
          marginLeft: makeEm(2 * skew)
        } : void 0
      }]
    }, options);
  }
  var accentWrap = buildCommon.makeSpan(["mord", "accent"], [accentBody], options);
  if (supSubGroup) {
    supSubGroup.children[0] = accentWrap;
    supSubGroup.height = Math.max(accentWrap.height, supSubGroup.height);
    supSubGroup.classes[0] = "mord";
    return supSubGroup;
  } else {
    return accentWrap;
  }
};
var mathmlBuilder$9 = (group2, options) => {
  var accentNode = group2.isStretchy ? stretchy.mathMLnode(group2.label) : new mathMLTree.MathNode("mo", [makeText(group2.label, group2.mode)]);
  var node = new mathMLTree.MathNode("mover", [buildGroup2(group2.base, options), accentNode]);
  node.setAttribute("accent", "true");
  return node;
};
var NON_STRETCHY_ACCENT_REGEX = new RegExp(["\\acute", "\\grave", "\\ddot", "\\tilde", "\\bar", "\\breve", "\\check", "\\hat", "\\vec", "\\dot", "\\mathring"].map((accent2) => "\\" + accent2).join("|"));
defineFunction({
  type: "accent",
  names: ["\\acute", "\\grave", "\\ddot", "\\tilde", "\\bar", "\\breve", "\\check", "\\hat", "\\vec", "\\dot", "\\mathring", "\\widecheck", "\\widehat", "\\widetilde", "\\overrightarrow", "\\overleftarrow", "\\Overrightarrow", "\\overleftrightarrow", "\\overgroup", "\\overlinesegment", "\\overleftharpoon", "\\overrightharpoon"],
  props: {
    numArgs: 1
  },
  handler: (context, args) => {
    var base = normalizeArgument(args[0]);
    var isStretchy = !NON_STRETCHY_ACCENT_REGEX.test(context.funcName);
    var isShifty = !isStretchy || context.funcName === "\\widehat" || context.funcName === "\\widetilde" || context.funcName === "\\widecheck";
    return {
      type: "accent",
      mode: context.parser.mode,
      label: context.funcName,
      isStretchy,
      isShifty,
      base
    };
  },
  htmlBuilder: htmlBuilder$a,
  mathmlBuilder: mathmlBuilder$9
});
defineFunction({
  type: "accent",
  names: ["\\'", "\\`", "\\^", "\\~", "\\=", "\\u", "\\.", '\\"', "\\c", "\\r", "\\H", "\\v", "\\textcircled"],
  props: {
    numArgs: 1,
    allowedInText: true,
    allowedInMath: true,
    // unless in strict mode
    argTypes: ["primitive"]
  },
  handler: (context, args) => {
    var base = args[0];
    var mode = context.parser.mode;
    if (mode === "math") {
      context.parser.settings.reportNonstrict("mathVsTextAccents", "LaTeX's accent " + context.funcName + " works only in text mode");
      mode = "text";
    }
    return {
      type: "accent",
      mode,
      label: context.funcName,
      isStretchy: false,
      isShifty: true,
      base
    };
  },
  htmlBuilder: htmlBuilder$a,
  mathmlBuilder: mathmlBuilder$9
});
defineFunction({
  type: "accentUnder",
  names: ["\\underleftarrow", "\\underrightarrow", "\\underleftrightarrow", "\\undergroup", "\\underlinesegment", "\\utilde"],
  props: {
    numArgs: 1
  },
  handler: (_ref, args) => {
    var {
      parser,
      funcName
    } = _ref;
    var base = args[0];
    return {
      type: "accentUnder",
      mode: parser.mode,
      label: funcName,
      base
    };
  },
  htmlBuilder: (group2, options) => {
    var innerGroup = buildGroup$1(group2.base, options);
    var accentBody = stretchy.svgSpan(group2, options);
    var kern = group2.label === "\\utilde" ? 0.12 : 0;
    var vlist = buildCommon.makeVList({
      positionType: "top",
      positionData: innerGroup.height,
      children: [{
        type: "elem",
        elem: accentBody,
        wrapperClasses: ["svg-align"]
      }, {
        type: "kern",
        size: kern
      }, {
        type: "elem",
        elem: innerGroup
      }]
    }, options);
    return buildCommon.makeSpan(["mord", "accentunder"], [vlist], options);
  },
  mathmlBuilder: (group2, options) => {
    var accentNode = stretchy.mathMLnode(group2.label);
    var node = new mathMLTree.MathNode("munder", [buildGroup2(group2.base, options), accentNode]);
    node.setAttribute("accentunder", "true");
    return node;
  }
});
var paddedNode = (group2) => {
  var node = new mathMLTree.MathNode("mpadded", group2 ? [group2] : []);
  node.setAttribute("width", "+0.6em");
  node.setAttribute("lspace", "0.3em");
  return node;
};
defineFunction({
  type: "xArrow",
  names: [
    "\\xleftarrow",
    "\\xrightarrow",
    "\\xLeftarrow",
    "\\xRightarrow",
    "\\xleftrightarrow",
    "\\xLeftrightarrow",
    "\\xhookleftarrow",
    "\\xhookrightarrow",
    "\\xmapsto",
    "\\xrightharpoondown",
    "\\xrightharpoonup",
    "\\xleftharpoondown",
    "\\xleftharpoonup",
    "\\xrightleftharpoons",
    "\\xleftrightharpoons",
    "\\xlongequal",
    "\\xtwoheadrightarrow",
    "\\xtwoheadleftarrow",
    "\\xtofrom",
    // The next 3 functions are here to support the mhchem extension.
    // Direct use of these functions is discouraged and may break someday.
    "\\xrightleftarrows",
    "\\xrightequilibrium",
    "\\xleftequilibrium",
    // The next 3 functions are here only to support the {CD} environment.
    "\\\\cdrightarrow",
    "\\\\cdleftarrow",
    "\\\\cdlongequal"
  ],
  props: {
    numArgs: 1,
    numOptionalArgs: 1
  },
  handler(_ref, args, optArgs) {
    var {
      parser,
      funcName
    } = _ref;
    return {
      type: "xArrow",
      mode: parser.mode,
      label: funcName,
      body: args[0],
      below: optArgs[0]
    };
  },
  // Flow is unable to correctly infer the type of `group`, even though it's
  // unambiguously determined from the passed-in `type` above.
  htmlBuilder(group2, options) {
    var style = options.style;
    var newOptions = options.havingStyle(style.sup());
    var upperGroup = buildCommon.wrapFragment(buildGroup$1(group2.body, newOptions, options), options);
    var arrowPrefix = group2.label.slice(0, 2) === "\\x" ? "x" : "cd";
    upperGroup.classes.push(arrowPrefix + "-arrow-pad");
    var lowerGroup;
    if (group2.below) {
      newOptions = options.havingStyle(style.sub());
      lowerGroup = buildCommon.wrapFragment(buildGroup$1(group2.below, newOptions, options), options);
      lowerGroup.classes.push(arrowPrefix + "-arrow-pad");
    }
    var arrowBody = stretchy.svgSpan(group2, options);
    var arrowShift = -options.fontMetrics().axisHeight + 0.5 * arrowBody.height;
    var upperShift = -options.fontMetrics().axisHeight - 0.5 * arrowBody.height - 0.111;
    if (upperGroup.depth > 0.25 || group2.label === "\\xleftequilibrium") {
      upperShift -= upperGroup.depth;
    }
    var vlist;
    if (lowerGroup) {
      var lowerShift = -options.fontMetrics().axisHeight + lowerGroup.height + 0.5 * arrowBody.height + 0.111;
      vlist = buildCommon.makeVList({
        positionType: "individualShift",
        children: [{
          type: "elem",
          elem: upperGroup,
          shift: upperShift
        }, {
          type: "elem",
          elem: arrowBody,
          shift: arrowShift
        }, {
          type: "elem",
          elem: lowerGroup,
          shift: lowerShift
        }]
      }, options);
    } else {
      vlist = buildCommon.makeVList({
        positionType: "individualShift",
        children: [{
          type: "elem",
          elem: upperGroup,
          shift: upperShift
        }, {
          type: "elem",
          elem: arrowBody,
          shift: arrowShift
        }]
      }, options);
    }
    vlist.children[0].children[0].children[1].classes.push("svg-align");
    return buildCommon.makeSpan(["mrel", "x-arrow"], [vlist], options);
  },
  mathmlBuilder(group2, options) {
    var arrowNode = stretchy.mathMLnode(group2.label);
    arrowNode.setAttribute("minsize", group2.label.charAt(0) === "x" ? "1.75em" : "3.0em");
    var node;
    if (group2.body) {
      var upperNode = paddedNode(buildGroup2(group2.body, options));
      if (group2.below) {
        var lowerNode = paddedNode(buildGroup2(group2.below, options));
        node = new mathMLTree.MathNode("munderover", [arrowNode, lowerNode, upperNode]);
      } else {
        node = new mathMLTree.MathNode("mover", [arrowNode, upperNode]);
      }
    } else if (group2.below) {
      var _lowerNode = paddedNode(buildGroup2(group2.below, options));
      node = new mathMLTree.MathNode("munder", [arrowNode, _lowerNode]);
    } else {
      node = paddedNode();
      node = new mathMLTree.MathNode("mover", [arrowNode, node]);
    }
    return node;
  }
});
var makeSpan2 = buildCommon.makeSpan;
function htmlBuilder$9(group2, options) {
  var elements = buildExpression$1(group2.body, options, true);
  return makeSpan2([group2.mclass], elements, options);
}
function mathmlBuilder$8(group2, options) {
  var node;
  var inner2 = buildExpression2(group2.body, options);
  if (group2.mclass === "minner") {
    node = new mathMLTree.MathNode("mpadded", inner2);
  } else if (group2.mclass === "mord") {
    if (group2.isCharacterBox) {
      node = inner2[0];
      node.type = "mi";
    } else {
      node = new mathMLTree.MathNode("mi", inner2);
    }
  } else {
    if (group2.isCharacterBox) {
      node = inner2[0];
      node.type = "mo";
    } else {
      node = new mathMLTree.MathNode("mo", inner2);
    }
    if (group2.mclass === "mbin") {
      node.attributes.lspace = "0.22em";
      node.attributes.rspace = "0.22em";
    } else if (group2.mclass === "mpunct") {
      node.attributes.lspace = "0em";
      node.attributes.rspace = "0.17em";
    } else if (group2.mclass === "mopen" || group2.mclass === "mclose") {
      node.attributes.lspace = "0em";
      node.attributes.rspace = "0em";
    } else if (group2.mclass === "minner") {
      node.attributes.lspace = "0.0556em";
      node.attributes.width = "+0.1111em";
    }
  }
  return node;
}
defineFunction({
  type: "mclass",
  names: ["\\mathord", "\\mathbin", "\\mathrel", "\\mathopen", "\\mathclose", "\\mathpunct", "\\mathinner"],
  props: {
    numArgs: 1,
    primitive: true
  },
  handler(_ref, args) {
    var {
      parser,
      funcName
    } = _ref;
    var body = args[0];
    return {
      type: "mclass",
      mode: parser.mode,
      mclass: "m" + funcName.slice(5),
      // TODO(kevinb): don't prefix with 'm'
      body: ordargument(body),
      isCharacterBox: utils.isCharacterBox(body)
    };
  },
  htmlBuilder: htmlBuilder$9,
  mathmlBuilder: mathmlBuilder$8
});
var binrelClass = (arg) => {
  var atom = arg.type === "ordgroup" && arg.body.length ? arg.body[0] : arg;
  if (atom.type === "atom" && (atom.family === "bin" || atom.family === "rel")) {
    return "m" + atom.family;
  } else {
    return "mord";
  }
};
defineFunction({
  type: "mclass",
  names: ["\\@binrel"],
  props: {
    numArgs: 2
  },
  handler(_ref2, args) {
    var {
      parser
    } = _ref2;
    return {
      type: "mclass",
      mode: parser.mode,
      mclass: binrelClass(args[0]),
      body: ordargument(args[1]),
      isCharacterBox: utils.isCharacterBox(args[1])
    };
  }
});
defineFunction({
  type: "mclass",
  names: ["\\stackrel", "\\overset", "\\underset"],
  props: {
    numArgs: 2
  },
  handler(_ref3, args) {
    var {
      parser,
      funcName
    } = _ref3;
    var baseArg = args[1];
    var shiftedArg = args[0];
    var mclass;
    if (funcName !== "\\stackrel") {
      mclass = binrelClass(baseArg);
    } else {
      mclass = "mrel";
    }
    var baseOp = {
      type: "op",
      mode: baseArg.mode,
      limits: true,
      alwaysHandleSupSub: true,
      parentIsSupSub: false,
      symbol: false,
      suppressBaseShift: funcName !== "\\stackrel",
      body: ordargument(baseArg)
    };
    var supsub = {
      type: "supsub",
      mode: shiftedArg.mode,
      base: baseOp,
      sup: funcName === "\\underset" ? null : shiftedArg,
      sub: funcName === "\\underset" ? shiftedArg : null
    };
    return {
      type: "mclass",
      mode: parser.mode,
      mclass,
      body: [supsub],
      isCharacterBox: utils.isCharacterBox(supsub)
    };
  },
  htmlBuilder: htmlBuilder$9,
  mathmlBuilder: mathmlBuilder$8
});
defineFunction({
  type: "pmb",
  names: ["\\pmb"],
  props: {
    numArgs: 1,
    allowedInText: true
  },
  handler(_ref, args) {
    var {
      parser
    } = _ref;
    return {
      type: "pmb",
      mode: parser.mode,
      mclass: binrelClass(args[0]),
      body: ordargument(args[0])
    };
  },
  htmlBuilder(group2, options) {
    var elements = buildExpression$1(group2.body, options, true);
    var node = buildCommon.makeSpan([group2.mclass], elements, options);
    node.style.textShadow = "0.02em 0.01em 0.04px";
    return node;
  },
  mathmlBuilder(group2, style) {
    var inner2 = buildExpression2(group2.body, style);
    var node = new mathMLTree.MathNode("mstyle", inner2);
    node.setAttribute("style", "text-shadow: 0.02em 0.01em 0.04px");
    return node;
  }
});
var cdArrowFunctionName = {
  ">": "\\\\cdrightarrow",
  "<": "\\\\cdleftarrow",
  "=": "\\\\cdlongequal",
  "A": "\\uparrow",
  "V": "\\downarrow",
  "|": "\\Vert",
  ".": "no arrow"
};
var newCell = () => {
  return {
    type: "styling",
    body: [],
    mode: "math",
    style: "display"
  };
};
var isStartOfArrow = (node) => {
  return node.type === "textord" && node.text === "@";
};
var isLabelEnd = (node, endChar) => {
  return (node.type === "mathord" || node.type === "atom") && node.text === endChar;
};
function cdArrow(arrowChar, labels, parser) {
  var funcName = cdArrowFunctionName[arrowChar];
  switch (funcName) {
    case "\\\\cdrightarrow":
    case "\\\\cdleftarrow":
      return parser.callFunction(funcName, [labels[0]], [labels[1]]);
    case "\\uparrow":
    case "\\downarrow": {
      var leftLabel = parser.callFunction("\\\\cdleft", [labels[0]], []);
      var bareArrow = {
        type: "atom",
        text: funcName,
        mode: "math",
        family: "rel"
      };
      var sizedArrow = parser.callFunction("\\Big", [bareArrow], []);
      var rightLabel = parser.callFunction("\\\\cdright", [labels[1]], []);
      var arrowGroup = {
        type: "ordgroup",
        mode: "math",
        body: [leftLabel, sizedArrow, rightLabel]
      };
      return parser.callFunction("\\\\cdparent", [arrowGroup], []);
    }
    case "\\\\cdlongequal":
      return parser.callFunction("\\\\cdlongequal", [], []);
    case "\\Vert": {
      var arrow = {
        type: "textord",
        text: "\\Vert",
        mode: "math"
      };
      return parser.callFunction("\\Big", [arrow], []);
    }
    default:
      return {
        type: "textord",
        text: " ",
        mode: "math"
      };
  }
}
function parseCD(parser) {
  var parsedRows = [];
  parser.gullet.beginGroup();
  parser.gullet.macros.set("\\cr", "\\\\\\relax");
  parser.gullet.beginGroup();
  while (true) {
    parsedRows.push(parser.parseExpression(false, "\\\\"));
    parser.gullet.endGroup();
    parser.gullet.beginGroup();
    var next = parser.fetch().text;
    if (next === "&" || next === "\\\\") {
      parser.consume();
    } else if (next === "\\end") {
      if (parsedRows[parsedRows.length - 1].length === 0) {
        parsedRows.pop();
      }
      break;
    } else {
      throw new ParseError("Expected \\\\ or \\cr or \\end", parser.nextToken);
    }
  }
  var row = [];
  var body = [row];
  for (var i2 = 0; i2 < parsedRows.length; i2++) {
    var rowNodes = parsedRows[i2];
    var cell = newCell();
    for (var j = 0; j < rowNodes.length; j++) {
      if (!isStartOfArrow(rowNodes[j])) {
        cell.body.push(rowNodes[j]);
      } else {
        row.push(cell);
        j += 1;
        var arrowChar = assertSymbolNodeType(rowNodes[j]).text;
        var labels = new Array(2);
        labels[0] = {
          type: "ordgroup",
          mode: "math",
          body: []
        };
        labels[1] = {
          type: "ordgroup",
          mode: "math",
          body: []
        };
        if ("=|.".indexOf(arrowChar) > -1) ;
        else if ("<>AV".indexOf(arrowChar) > -1) {
          for (var labelNum = 0; labelNum < 2; labelNum++) {
            var inLabel = true;
            for (var k = j + 1; k < rowNodes.length; k++) {
              if (isLabelEnd(rowNodes[k], arrowChar)) {
                inLabel = false;
                j = k;
                break;
              }
              if (isStartOfArrow(rowNodes[k])) {
                throw new ParseError("Missing a " + arrowChar + " character to complete a CD arrow.", rowNodes[k]);
              }
              labels[labelNum].body.push(rowNodes[k]);
            }
            if (inLabel) {
              throw new ParseError("Missing a " + arrowChar + " character to complete a CD arrow.", rowNodes[j]);
            }
          }
        } else {
          throw new ParseError('Expected one of "<>AV=|." after @', rowNodes[j]);
        }
        var arrow = cdArrow(arrowChar, labels, parser);
        var wrappedArrow = {
          type: "styling",
          body: [arrow],
          mode: "math",
          style: "display"
          // CD is always displaystyle.
        };
        row.push(wrappedArrow);
        cell = newCell();
      }
    }
    if (i2 % 2 === 0) {
      row.push(cell);
    } else {
      row.shift();
    }
    row = [];
    body.push(row);
  }
  parser.gullet.endGroup();
  parser.gullet.endGroup();
  var cols = new Array(body[0].length).fill({
    type: "align",
    align: "c",
    pregap: 0.25,
    // CD package sets \enskip between columns.
    postgap: 0.25
    // So pre and post each get half an \enskip, i.e. 0.25em.
  });
  return {
    type: "array",
    mode: "math",
    body,
    arraystretch: 1,
    addJot: true,
    rowGaps: [null],
    cols,
    colSeparationType: "CD",
    hLinesBeforeRow: new Array(body.length + 1).fill([])
  };
}
defineFunction({
  type: "cdlabel",
  names: ["\\\\cdleft", "\\\\cdright"],
  props: {
    numArgs: 1
  },
  handler(_ref, args) {
    var {
      parser,
      funcName
    } = _ref;
    return {
      type: "cdlabel",
      mode: parser.mode,
      side: funcName.slice(4),
      label: args[0]
    };
  },
  htmlBuilder(group2, options) {
    var newOptions = options.havingStyle(options.style.sup());
    var label = buildCommon.wrapFragment(buildGroup$1(group2.label, newOptions, options), options);
    label.classes.push("cd-label-" + group2.side);
    label.style.bottom = makeEm(0.8 - label.depth);
    label.height = 0;
    label.depth = 0;
    return label;
  },
  mathmlBuilder(group2, options) {
    var label = new mathMLTree.MathNode("mrow", [buildGroup2(group2.label, options)]);
    label = new mathMLTree.MathNode("mpadded", [label]);
    label.setAttribute("width", "0");
    if (group2.side === "left") {
      label.setAttribute("lspace", "-1width");
    }
    label.setAttribute("voffset", "0.7em");
    label = new mathMLTree.MathNode("mstyle", [label]);
    label.setAttribute("displaystyle", "false");
    label.setAttribute("scriptlevel", "1");
    return label;
  }
});
defineFunction({
  type: "cdlabelparent",
  names: ["\\\\cdparent"],
  props: {
    numArgs: 1
  },
  handler(_ref2, args) {
    var {
      parser
    } = _ref2;
    return {
      type: "cdlabelparent",
      mode: parser.mode,
      fragment: args[0]
    };
  },
  htmlBuilder(group2, options) {
    var parent = buildCommon.wrapFragment(buildGroup$1(group2.fragment, options), options);
    parent.classes.push("cd-vert-arrow");
    return parent;
  },
  mathmlBuilder(group2, options) {
    return new mathMLTree.MathNode("mrow", [buildGroup2(group2.fragment, options)]);
  }
});
defineFunction({
  type: "textord",
  names: ["\\@char"],
  props: {
    numArgs: 1,
    allowedInText: true
  },
  handler(_ref, args) {
    var {
      parser
    } = _ref;
    var arg = assertNodeType(args[0], "ordgroup");
    var group2 = arg.body;
    var number = "";
    for (var i2 = 0; i2 < group2.length; i2++) {
      var node = assertNodeType(group2[i2], "textord");
      number += node.text;
    }
    var code = parseInt(number);
    var text2;
    if (isNaN(code)) {
      throw new ParseError("\\@char has non-numeric argument " + number);
    } else if (code < 0 || code >= 1114111) {
      throw new ParseError("\\@char with invalid code point " + number);
    } else if (code <= 65535) {
      text2 = String.fromCharCode(code);
    } else {
      code -= 65536;
      text2 = String.fromCharCode((code >> 10) + 55296, (code & 1023) + 56320);
    }
    return {
      type: "textord",
      mode: parser.mode,
      text: text2
    };
  }
});
var htmlBuilder$8 = (group2, options) => {
  var elements = buildExpression$1(group2.body, options.withColor(group2.color), false);
  return buildCommon.makeFragment(elements);
};
var mathmlBuilder$7 = (group2, options) => {
  var inner2 = buildExpression2(group2.body, options.withColor(group2.color));
  var node = new mathMLTree.MathNode("mstyle", inner2);
  node.setAttribute("mathcolor", group2.color);
  return node;
};
defineFunction({
  type: "color",
  names: ["\\textcolor"],
  props: {
    numArgs: 2,
    allowedInText: true,
    argTypes: ["color", "original"]
  },
  handler(_ref, args) {
    var {
      parser
    } = _ref;
    var color = assertNodeType(args[0], "color-token").color;
    var body = args[1];
    return {
      type: "color",
      mode: parser.mode,
      color,
      body: ordargument(body)
    };
  },
  htmlBuilder: htmlBuilder$8,
  mathmlBuilder: mathmlBuilder$7
});
defineFunction({
  type: "color",
  names: ["\\color"],
  props: {
    numArgs: 1,
    allowedInText: true,
    argTypes: ["color"]
  },
  handler(_ref2, args) {
    var {
      parser,
      breakOnTokenText
    } = _ref2;
    var color = assertNodeType(args[0], "color-token").color;
    parser.gullet.macros.set("\\current@color", color);
    var body = parser.parseExpression(true, breakOnTokenText);
    return {
      type: "color",
      mode: parser.mode,
      color,
      body
    };
  },
  htmlBuilder: htmlBuilder$8,
  mathmlBuilder: mathmlBuilder$7
});
defineFunction({
  type: "cr",
  names: ["\\\\"],
  props: {
    numArgs: 0,
    numOptionalArgs: 0,
    allowedInText: true
  },
  handler(_ref, args, optArgs) {
    var {
      parser
    } = _ref;
    var size = parser.gullet.future().text === "[" ? parser.parseSizeGroup(true) : null;
    var newLine = !parser.settings.displayMode || !parser.settings.useStrictBehavior("newLineInDisplayMode", "In LaTeX, \\\\ or \\newline does nothing in display mode");
    return {
      type: "cr",
      mode: parser.mode,
      newLine,
      size: size && assertNodeType(size, "size").value
    };
  },
  // The following builders are called only at the top level,
  // not within tabular/array environments.
  htmlBuilder(group2, options) {
    var span2 = buildCommon.makeSpan(["mspace"], [], options);
    if (group2.newLine) {
      span2.classes.push("newline");
      if (group2.size) {
        span2.style.marginTop = makeEm(calculateSize(group2.size, options));
      }
    }
    return span2;
  },
  mathmlBuilder(group2, options) {
    var node = new mathMLTree.MathNode("mspace");
    if (group2.newLine) {
      node.setAttribute("linebreak", "newline");
      if (group2.size) {
        node.setAttribute("height", makeEm(calculateSize(group2.size, options)));
      }
    }
    return node;
  }
});
var globalMap = {
  "\\global": "\\global",
  "\\long": "\\\\globallong",
  "\\\\globallong": "\\\\globallong",
  "\\def": "\\gdef",
  "\\gdef": "\\gdef",
  "\\edef": "\\xdef",
  "\\xdef": "\\xdef",
  "\\let": "\\\\globallet",
  "\\futurelet": "\\\\globalfuture"
};
var checkControlSequence = (tok) => {
  var name = tok.text;
  if (/^(?:[\\{}$&#^_]|EOF)$/.test(name)) {
    throw new ParseError("Expected a control sequence", tok);
  }
  return name;
};
var getRHS = (parser) => {
  var tok = parser.gullet.popToken();
  if (tok.text === "=") {
    tok = parser.gullet.popToken();
    if (tok.text === " ") {
      tok = parser.gullet.popToken();
    }
  }
  return tok;
};
var letCommand = (parser, name, tok, global) => {
  var macro = parser.gullet.macros.get(tok.text);
  if (macro == null) {
    tok.noexpand = true;
    macro = {
      tokens: [tok],
      numArgs: 0,
      // reproduce the same behavior in expansion
      unexpandable: !parser.gullet.isExpandable(tok.text)
    };
  }
  parser.gullet.macros.set(name, macro, global);
};
defineFunction({
  type: "internal",
  names: [
    "\\global",
    "\\long",
    "\\\\globallong"
    // can’t be entered directly
  ],
  props: {
    numArgs: 0,
    allowedInText: true
  },
  handler(_ref) {
    var {
      parser,
      funcName
    } = _ref;
    parser.consumeSpaces();
    var token = parser.fetch();
    if (globalMap[token.text]) {
      if (funcName === "\\global" || funcName === "\\\\globallong") {
        token.text = globalMap[token.text];
      }
      return assertNodeType(parser.parseFunction(), "internal");
    }
    throw new ParseError("Invalid token after macro prefix", token);
  }
});
defineFunction({
  type: "internal",
  names: ["\\def", "\\gdef", "\\edef", "\\xdef"],
  props: {
    numArgs: 0,
    allowedInText: true,
    primitive: true
  },
  handler(_ref2) {
    var {
      parser,
      funcName
    } = _ref2;
    var tok = parser.gullet.popToken();
    var name = tok.text;
    if (/^(?:[\\{}$&#^_]|EOF)$/.test(name)) {
      throw new ParseError("Expected a control sequence", tok);
    }
    var numArgs = 0;
    var insert;
    var delimiters2 = [[]];
    while (parser.gullet.future().text !== "{") {
      tok = parser.gullet.popToken();
      if (tok.text === "#") {
        if (parser.gullet.future().text === "{") {
          insert = parser.gullet.future();
          delimiters2[numArgs].push("{");
          break;
        }
        tok = parser.gullet.popToken();
        if (!/^[1-9]$/.test(tok.text)) {
          throw new ParseError('Invalid argument number "' + tok.text + '"');
        }
        if (parseInt(tok.text) !== numArgs + 1) {
          throw new ParseError('Argument number "' + tok.text + '" out of order');
        }
        numArgs++;
        delimiters2.push([]);
      } else if (tok.text === "EOF") {
        throw new ParseError("Expected a macro definition");
      } else {
        delimiters2[numArgs].push(tok.text);
      }
    }
    var {
      tokens
    } = parser.gullet.consumeArg();
    if (insert) {
      tokens.unshift(insert);
    }
    if (funcName === "\\edef" || funcName === "\\xdef") {
      tokens = parser.gullet.expandTokens(tokens);
      tokens.reverse();
    }
    parser.gullet.macros.set(name, {
      tokens,
      numArgs,
      delimiters: delimiters2
    }, funcName === globalMap[funcName]);
    return {
      type: "internal",
      mode: parser.mode
    };
  }
});
defineFunction({
  type: "internal",
  names: [
    "\\let",
    "\\\\globallet"
    // can’t be entered directly
  ],
  props: {
    numArgs: 0,
    allowedInText: true,
    primitive: true
  },
  handler(_ref3) {
    var {
      parser,
      funcName
    } = _ref3;
    var name = checkControlSequence(parser.gullet.popToken());
    parser.gullet.consumeSpaces();
    var tok = getRHS(parser);
    letCommand(parser, name, tok, funcName === "\\\\globallet");
    return {
      type: "internal",
      mode: parser.mode
    };
  }
});
defineFunction({
  type: "internal",
  names: [
    "\\futurelet",
    "\\\\globalfuture"
    // can’t be entered directly
  ],
  props: {
    numArgs: 0,
    allowedInText: true,
    primitive: true
  },
  handler(_ref4) {
    var {
      parser,
      funcName
    } = _ref4;
    var name = checkControlSequence(parser.gullet.popToken());
    var middle = parser.gullet.popToken();
    var tok = parser.gullet.popToken();
    letCommand(parser, name, tok, funcName === "\\\\globalfuture");
    parser.gullet.pushToken(tok);
    parser.gullet.pushToken(middle);
    return {
      type: "internal",
      mode: parser.mode
    };
  }
});
var getMetrics = function getMetrics2(symbol, font, mode) {
  var replace = symbols.math[symbol] && symbols.math[symbol].replace;
  var metrics = getCharacterMetrics(replace || symbol, font, mode);
  if (!metrics) {
    throw new Error("Unsupported symbol " + symbol + " and font size " + font + ".");
  }
  return metrics;
};
var styleWrap = function styleWrap2(delim, toStyle, options, classes) {
  var newOptions = options.havingBaseStyle(toStyle);
  var span2 = buildCommon.makeSpan(classes.concat(newOptions.sizingClasses(options)), [delim], options);
  var delimSizeMultiplier = newOptions.sizeMultiplier / options.sizeMultiplier;
  span2.height *= delimSizeMultiplier;
  span2.depth *= delimSizeMultiplier;
  span2.maxFontSize = newOptions.sizeMultiplier;
  return span2;
};
var centerSpan = function centerSpan2(span2, options, style) {
  var newOptions = options.havingBaseStyle(style);
  var shift = (1 - options.sizeMultiplier / newOptions.sizeMultiplier) * options.fontMetrics().axisHeight;
  span2.classes.push("delimcenter");
  span2.style.top = makeEm(shift);
  span2.height -= shift;
  span2.depth += shift;
};
var makeSmallDelim = function makeSmallDelim2(delim, style, center, options, mode, classes) {
  var text2 = buildCommon.makeSymbol(delim, "Main-Regular", mode, options);
  var span2 = styleWrap(text2, style, options, classes);
  if (center) {
    centerSpan(span2, options, style);
  }
  return span2;
};
var mathrmSize = function mathrmSize2(value, size, mode, options) {
  return buildCommon.makeSymbol(value, "Size" + size + "-Regular", mode, options);
};
var makeLargeDelim = function makeLargeDelim2(delim, size, center, options, mode, classes) {
  var inner2 = mathrmSize(delim, size, mode, options);
  var span2 = styleWrap(buildCommon.makeSpan(["delimsizing", "size" + size], [inner2], options), Style$1.TEXT, options, classes);
  if (center) {
    centerSpan(span2, options, Style$1.TEXT);
  }
  return span2;
};
var makeGlyphSpan = function makeGlyphSpan2(symbol, font, mode) {
  var sizeClass;
  if (font === "Size1-Regular") {
    sizeClass = "delim-size1";
  } else {
    sizeClass = "delim-size4";
  }
  var corner = buildCommon.makeSpan(["delimsizinginner", sizeClass], [buildCommon.makeSpan([], [buildCommon.makeSymbol(symbol, font, mode)])]);
  return {
    type: "elem",
    elem: corner
  };
};
var makeInner = function makeInner2(ch2, height, options) {
  var width = fontMetricsData["Size4-Regular"][ch2.charCodeAt(0)] ? fontMetricsData["Size4-Regular"][ch2.charCodeAt(0)][4] : fontMetricsData["Size1-Regular"][ch2.charCodeAt(0)][4];
  var path2 = new PathNode("inner", innerPath(ch2, Math.round(1e3 * height)));
  var svgNode = new SvgNode([path2], {
    "width": makeEm(width),
    "height": makeEm(height),
    // Override CSS rule `.katex svg { width: 100% }`
    "style": "width:" + makeEm(width),
    "viewBox": "0 0 " + 1e3 * width + " " + Math.round(1e3 * height),
    "preserveAspectRatio": "xMinYMin"
  });
  var span2 = buildCommon.makeSvgSpan([], [svgNode], options);
  span2.height = height;
  span2.style.height = makeEm(height);
  span2.style.width = makeEm(width);
  return {
    type: "elem",
    elem: span2
  };
};
var lapInEms = 8e-3;
var lap = {
  type: "kern",
  size: -1 * lapInEms
};
var verts = ["|", "\\lvert", "\\rvert", "\\vert"];
var doubleVerts = ["\\|", "\\lVert", "\\rVert", "\\Vert"];
var makeStackedDelim = function makeStackedDelim2(delim, heightTotal, center, options, mode, classes) {
  var top;
  var middle;
  var repeat;
  var bottom;
  var svgLabel = "";
  var viewBoxWidth = 0;
  top = repeat = bottom = delim;
  middle = null;
  var font = "Size1-Regular";
  if (delim === "\\uparrow") {
    repeat = bottom = "\u23D0";
  } else if (delim === "\\Uparrow") {
    repeat = bottom = "\u2016";
  } else if (delim === "\\downarrow") {
    top = repeat = "\u23D0";
  } else if (delim === "\\Downarrow") {
    top = repeat = "\u2016";
  } else if (delim === "\\updownarrow") {
    top = "\\uparrow";
    repeat = "\u23D0";
    bottom = "\\downarrow";
  } else if (delim === "\\Updownarrow") {
    top = "\\Uparrow";
    repeat = "\u2016";
    bottom = "\\Downarrow";
  } else if (utils.contains(verts, delim)) {
    repeat = "\u2223";
    svgLabel = "vert";
    viewBoxWidth = 333;
  } else if (utils.contains(doubleVerts, delim)) {
    repeat = "\u2225";
    svgLabel = "doublevert";
    viewBoxWidth = 556;
  } else if (delim === "[" || delim === "\\lbrack") {
    top = "\u23A1";
    repeat = "\u23A2";
    bottom = "\u23A3";
    font = "Size4-Regular";
    svgLabel = "lbrack";
    viewBoxWidth = 667;
  } else if (delim === "]" || delim === "\\rbrack") {
    top = "\u23A4";
    repeat = "\u23A5";
    bottom = "\u23A6";
    font = "Size4-Regular";
    svgLabel = "rbrack";
    viewBoxWidth = 667;
  } else if (delim === "\\lfloor" || delim === "\u230A") {
    repeat = top = "\u23A2";
    bottom = "\u23A3";
    font = "Size4-Regular";
    svgLabel = "lfloor";
    viewBoxWidth = 667;
  } else if (delim === "\\lceil" || delim === "\u2308") {
    top = "\u23A1";
    repeat = bottom = "\u23A2";
    font = "Size4-Regular";
    svgLabel = "lceil";
    viewBoxWidth = 667;
  } else if (delim === "\\rfloor" || delim === "\u230B") {
    repeat = top = "\u23A5";
    bottom = "\u23A6";
    font = "Size4-Regular";
    svgLabel = "rfloor";
    viewBoxWidth = 667;
  } else if (delim === "\\rceil" || delim === "\u2309") {
    top = "\u23A4";
    repeat = bottom = "\u23A5";
    font = "Size4-Regular";
    svgLabel = "rceil";
    viewBoxWidth = 667;
  } else if (delim === "(" || delim === "\\lparen") {
    top = "\u239B";
    repeat = "\u239C";
    bottom = "\u239D";
    font = "Size4-Regular";
    svgLabel = "lparen";
    viewBoxWidth = 875;
  } else if (delim === ")" || delim === "\\rparen") {
    top = "\u239E";
    repeat = "\u239F";
    bottom = "\u23A0";
    font = "Size4-Regular";
    svgLabel = "rparen";
    viewBoxWidth = 875;
  } else if (delim === "\\{" || delim === "\\lbrace") {
    top = "\u23A7";
    middle = "\u23A8";
    bottom = "\u23A9";
    repeat = "\u23AA";
    font = "Size4-Regular";
  } else if (delim === "\\}" || delim === "\\rbrace") {
    top = "\u23AB";
    middle = "\u23AC";
    bottom = "\u23AD";
    repeat = "\u23AA";
    font = "Size4-Regular";
  } else if (delim === "\\lgroup" || delim === "\u27EE") {
    top = "\u23A7";
    bottom = "\u23A9";
    repeat = "\u23AA";
    font = "Size4-Regular";
  } else if (delim === "\\rgroup" || delim === "\u27EF") {
    top = "\u23AB";
    bottom = "\u23AD";
    repeat = "\u23AA";
    font = "Size4-Regular";
  } else if (delim === "\\lmoustache" || delim === "\u23B0") {
    top = "\u23A7";
    bottom = "\u23AD";
    repeat = "\u23AA";
    font = "Size4-Regular";
  } else if (delim === "\\rmoustache" || delim === "\u23B1") {
    top = "\u23AB";
    bottom = "\u23A9";
    repeat = "\u23AA";
    font = "Size4-Regular";
  }
  var topMetrics = getMetrics(top, font, mode);
  var topHeightTotal = topMetrics.height + topMetrics.depth;
  var repeatMetrics = getMetrics(repeat, font, mode);
  var repeatHeightTotal = repeatMetrics.height + repeatMetrics.depth;
  var bottomMetrics = getMetrics(bottom, font, mode);
  var bottomHeightTotal = bottomMetrics.height + bottomMetrics.depth;
  var middleHeightTotal = 0;
  var middleFactor = 1;
  if (middle !== null) {
    var middleMetrics = getMetrics(middle, font, mode);
    middleHeightTotal = middleMetrics.height + middleMetrics.depth;
    middleFactor = 2;
  }
  var minHeight = topHeightTotal + bottomHeightTotal + middleHeightTotal;
  var repeatCount = Math.max(0, Math.ceil((heightTotal - minHeight) / (middleFactor * repeatHeightTotal)));
  var realHeightTotal = minHeight + repeatCount * middleFactor * repeatHeightTotal;
  var axisHeight = options.fontMetrics().axisHeight;
  if (center) {
    axisHeight *= options.sizeMultiplier;
  }
  var depth = realHeightTotal / 2 - axisHeight;
  var stack = [];
  if (svgLabel.length > 0) {
    var midHeight = realHeightTotal - topHeightTotal - bottomHeightTotal;
    var viewBoxHeight = Math.round(realHeightTotal * 1e3);
    var pathStr = tallDelim(svgLabel, Math.round(midHeight * 1e3));
    var path2 = new PathNode(svgLabel, pathStr);
    var width = (viewBoxWidth / 1e3).toFixed(3) + "em";
    var height = (viewBoxHeight / 1e3).toFixed(3) + "em";
    var svg2 = new SvgNode([path2], {
      "width": width,
      "height": height,
      "viewBox": "0 0 " + viewBoxWidth + " " + viewBoxHeight
    });
    var wrapper = buildCommon.makeSvgSpan([], [svg2], options);
    wrapper.height = viewBoxHeight / 1e3;
    wrapper.style.width = width;
    wrapper.style.height = height;
    stack.push({
      type: "elem",
      elem: wrapper
    });
  } else {
    stack.push(makeGlyphSpan(bottom, font, mode));
    stack.push(lap);
    if (middle === null) {
      var innerHeight = realHeightTotal - topHeightTotal - bottomHeightTotal + 2 * lapInEms;
      stack.push(makeInner(repeat, innerHeight, options));
    } else {
      var _innerHeight = (realHeightTotal - topHeightTotal - bottomHeightTotal - middleHeightTotal) / 2 + 2 * lapInEms;
      stack.push(makeInner(repeat, _innerHeight, options));
      stack.push(lap);
      stack.push(makeGlyphSpan(middle, font, mode));
      stack.push(lap);
      stack.push(makeInner(repeat, _innerHeight, options));
    }
    stack.push(lap);
    stack.push(makeGlyphSpan(top, font, mode));
  }
  var newOptions = options.havingBaseStyle(Style$1.TEXT);
  var inner2 = buildCommon.makeVList({
    positionType: "bottom",
    positionData: depth,
    children: stack
  }, newOptions);
  return styleWrap(buildCommon.makeSpan(["delimsizing", "mult"], [inner2], newOptions), Style$1.TEXT, options, classes);
};
var vbPad = 80;
var emPad = 0.08;
var sqrtSvg = function sqrtSvg2(sqrtName, height, viewBoxHeight, extraVinculum, options) {
  var path2 = sqrtPath(sqrtName, extraVinculum, viewBoxHeight);
  var pathNode = new PathNode(sqrtName, path2);
  var svg2 = new SvgNode([pathNode], {
    // Note: 1000:1 ratio of viewBox to document em width.
    "width": "400em",
    "height": makeEm(height),
    "viewBox": "0 0 400000 " + viewBoxHeight,
    "preserveAspectRatio": "xMinYMin slice"
  });
  return buildCommon.makeSvgSpan(["hide-tail"], [svg2], options);
};
var makeSqrtImage = function makeSqrtImage2(height, options) {
  var newOptions = options.havingBaseSizing();
  var delim = traverseSequence("\\surd", height * newOptions.sizeMultiplier, stackLargeDelimiterSequence, newOptions);
  var sizeMultiplier = newOptions.sizeMultiplier;
  var extraVinculum = Math.max(0, options.minRuleThickness - options.fontMetrics().sqrtRuleThickness);
  var span2;
  var spanHeight = 0;
  var texHeight = 0;
  var viewBoxHeight = 0;
  var advanceWidth;
  if (delim.type === "small") {
    viewBoxHeight = 1e3 + 1e3 * extraVinculum + vbPad;
    if (height < 1) {
      sizeMultiplier = 1;
    } else if (height < 1.4) {
      sizeMultiplier = 0.7;
    }
    spanHeight = (1 + extraVinculum + emPad) / sizeMultiplier;
    texHeight = (1 + extraVinculum) / sizeMultiplier;
    span2 = sqrtSvg("sqrtMain", spanHeight, viewBoxHeight, extraVinculum, options);
    span2.style.minWidth = "0.853em";
    advanceWidth = 0.833 / sizeMultiplier;
  } else if (delim.type === "large") {
    viewBoxHeight = (1e3 + vbPad) * sizeToMaxHeight[delim.size];
    texHeight = (sizeToMaxHeight[delim.size] + extraVinculum) / sizeMultiplier;
    spanHeight = (sizeToMaxHeight[delim.size] + extraVinculum + emPad) / sizeMultiplier;
    span2 = sqrtSvg("sqrtSize" + delim.size, spanHeight, viewBoxHeight, extraVinculum, options);
    span2.style.minWidth = "1.02em";
    advanceWidth = 1 / sizeMultiplier;
  } else {
    spanHeight = height + extraVinculum + emPad;
    texHeight = height + extraVinculum;
    viewBoxHeight = Math.floor(1e3 * height + extraVinculum) + vbPad;
    span2 = sqrtSvg("sqrtTall", spanHeight, viewBoxHeight, extraVinculum, options);
    span2.style.minWidth = "0.742em";
    advanceWidth = 1.056;
  }
  span2.height = texHeight;
  span2.style.height = makeEm(spanHeight);
  return {
    span: span2,
    advanceWidth,
    // Calculate the actual line width.
    // This actually should depend on the chosen font -- e.g. \boldmath
    // should use the thicker surd symbols from e.g. KaTeX_Main-Bold, and
    // have thicker rules.
    ruleWidth: (options.fontMetrics().sqrtRuleThickness + extraVinculum) * sizeMultiplier
  };
};
var stackLargeDelimiters = ["(", "\\lparen", ")", "\\rparen", "[", "\\lbrack", "]", "\\rbrack", "\\{", "\\lbrace", "\\}", "\\rbrace", "\\lfloor", "\\rfloor", "\u230A", "\u230B", "\\lceil", "\\rceil", "\u2308", "\u2309", "\\surd"];
var stackAlwaysDelimiters = ["\\uparrow", "\\downarrow", "\\updownarrow", "\\Uparrow", "\\Downarrow", "\\Updownarrow", "|", "\\|", "\\vert", "\\Vert", "\\lvert", "\\rvert", "\\lVert", "\\rVert", "\\lgroup", "\\rgroup", "\u27EE", "\u27EF", "\\lmoustache", "\\rmoustache", "\u23B0", "\u23B1"];
var stackNeverDelimiters = ["<", ">", "\\langle", "\\rangle", "/", "\\backslash", "\\lt", "\\gt"];
var sizeToMaxHeight = [0, 1.2, 1.8, 2.4, 3];
var makeSizedDelim = function makeSizedDelim2(delim, size, options, mode, classes) {
  if (delim === "<" || delim === "\\lt" || delim === "\u27E8") {
    delim = "\\langle";
  } else if (delim === ">" || delim === "\\gt" || delim === "\u27E9") {
    delim = "\\rangle";
  }
  if (utils.contains(stackLargeDelimiters, delim) || utils.contains(stackNeverDelimiters, delim)) {
    return makeLargeDelim(delim, size, false, options, mode, classes);
  } else if (utils.contains(stackAlwaysDelimiters, delim)) {
    return makeStackedDelim(delim, sizeToMaxHeight[size], false, options, mode, classes);
  } else {
    throw new ParseError("Illegal delimiter: '" + delim + "'");
  }
};
var stackNeverDelimiterSequence = [{
  type: "small",
  style: Style$1.SCRIPTSCRIPT
}, {
  type: "small",
  style: Style$1.SCRIPT
}, {
  type: "small",
  style: Style$1.TEXT
}, {
  type: "large",
  size: 1
}, {
  type: "large",
  size: 2
}, {
  type: "large",
  size: 3
}, {
  type: "large",
  size: 4
}];
var stackAlwaysDelimiterSequence = [{
  type: "small",
  style: Style$1.SCRIPTSCRIPT
}, {
  type: "small",
  style: Style$1.SCRIPT
}, {
  type: "small",
  style: Style$1.TEXT
}, {
  type: "stack"
}];
var stackLargeDelimiterSequence = [{
  type: "small",
  style: Style$1.SCRIPTSCRIPT
}, {
  type: "small",
  style: Style$1.SCRIPT
}, {
  type: "small",
  style: Style$1.TEXT
}, {
  type: "large",
  size: 1
}, {
  type: "large",
  size: 2
}, {
  type: "large",
  size: 3
}, {
  type: "large",
  size: 4
}, {
  type: "stack"
}];
var delimTypeToFont = function delimTypeToFont2(type) {
  if (type.type === "small") {
    return "Main-Regular";
  } else if (type.type === "large") {
    return "Size" + type.size + "-Regular";
  } else if (type.type === "stack") {
    return "Size4-Regular";
  } else {
    throw new Error("Add support for delim type '" + type.type + "' here.");
  }
};
var traverseSequence = function traverseSequence2(delim, height, sequence, options) {
  var start = Math.min(2, 3 - options.style.size);
  for (var i2 = start; i2 < sequence.length; i2++) {
    if (sequence[i2].type === "stack") {
      break;
    }
    var metrics = getMetrics(delim, delimTypeToFont(sequence[i2]), "math");
    var heightDepth = metrics.height + metrics.depth;
    if (sequence[i2].type === "small") {
      var newOptions = options.havingBaseStyle(sequence[i2].style);
      heightDepth *= newOptions.sizeMultiplier;
    }
    if (heightDepth > height) {
      return sequence[i2];
    }
  }
  return sequence[sequence.length - 1];
};
var makeCustomSizedDelim = function makeCustomSizedDelim2(delim, height, center, options, mode, classes) {
  if (delim === "<" || delim === "\\lt" || delim === "\u27E8") {
    delim = "\\langle";
  } else if (delim === ">" || delim === "\\gt" || delim === "\u27E9") {
    delim = "\\rangle";
  }
  var sequence;
  if (utils.contains(stackNeverDelimiters, delim)) {
    sequence = stackNeverDelimiterSequence;
  } else if (utils.contains(stackLargeDelimiters, delim)) {
    sequence = stackLargeDelimiterSequence;
  } else {
    sequence = stackAlwaysDelimiterSequence;
  }
  var delimType = traverseSequence(delim, height, sequence, options);
  if (delimType.type === "small") {
    return makeSmallDelim(delim, delimType.style, center, options, mode, classes);
  } else if (delimType.type === "large") {
    return makeLargeDelim(delim, delimType.size, center, options, mode, classes);
  } else {
    return makeStackedDelim(delim, height, center, options, mode, classes);
  }
};
var makeLeftRightDelim = function makeLeftRightDelim2(delim, height, depth, options, mode, classes) {
  var axisHeight = options.fontMetrics().axisHeight * options.sizeMultiplier;
  var delimiterFactor = 901;
  var delimiterExtend = 5 / options.fontMetrics().ptPerEm;
  var maxDistFromAxis = Math.max(height - axisHeight, depth + axisHeight);
  var totalHeight = Math.max(
    // In real TeX, calculations are done using integral values which are
    // 65536 per pt, or 655360 per em. So, the division here truncates in
    // TeX but doesn't here, producing different results. If we wanted to
    // exactly match TeX's calculation, we could do
    //   Math.floor(655360 * maxDistFromAxis / 500) *
    //    delimiterFactor / 655360
    // (To see the difference, compare
    //    x^{x^{\left(\rule{0.1em}{0.68em}\right)}}
    // in TeX and KaTeX)
    maxDistFromAxis / 500 * delimiterFactor,
    2 * maxDistFromAxis - delimiterExtend
  );
  return makeCustomSizedDelim(delim, totalHeight, true, options, mode, classes);
};
var delimiter = {
  sqrtImage: makeSqrtImage,
  sizedDelim: makeSizedDelim,
  sizeToMaxHeight,
  customSizedDelim: makeCustomSizedDelim,
  leftRightDelim: makeLeftRightDelim
};
var delimiterSizes = {
  "\\bigl": {
    mclass: "mopen",
    size: 1
  },
  "\\Bigl": {
    mclass: "mopen",
    size: 2
  },
  "\\biggl": {
    mclass: "mopen",
    size: 3
  },
  "\\Biggl": {
    mclass: "mopen",
    size: 4
  },
  "\\bigr": {
    mclass: "mclose",
    size: 1
  },
  "\\Bigr": {
    mclass: "mclose",
    size: 2
  },
  "\\biggr": {
    mclass: "mclose",
    size: 3
  },
  "\\Biggr": {
    mclass: "mclose",
    size: 4
  },
  "\\bigm": {
    mclass: "mrel",
    size: 1
  },
  "\\Bigm": {
    mclass: "mrel",
    size: 2
  },
  "\\biggm": {
    mclass: "mrel",
    size: 3
  },
  "\\Biggm": {
    mclass: "mrel",
    size: 4
  },
  "\\big": {
    mclass: "mord",
    size: 1
  },
  "\\Big": {
    mclass: "mord",
    size: 2
  },
  "\\bigg": {
    mclass: "mord",
    size: 3
  },
  "\\Bigg": {
    mclass: "mord",
    size: 4
  }
};
var delimiters = ["(", "\\lparen", ")", "\\rparen", "[", "\\lbrack", "]", "\\rbrack", "\\{", "\\lbrace", "\\}", "\\rbrace", "\\lfloor", "\\rfloor", "\u230A", "\u230B", "\\lceil", "\\rceil", "\u2308", "\u2309", "<", ">", "\\langle", "\u27E8", "\\rangle", "\u27E9", "\\lt", "\\gt", "\\lvert", "\\rvert", "\\lVert", "\\rVert", "\\lgroup", "\\rgroup", "\u27EE", "\u27EF", "\\lmoustache", "\\rmoustache", "\u23B0", "\u23B1", "/", "\\backslash", "|", "\\vert", "\\|", "\\Vert", "\\uparrow", "\\Uparrow", "\\downarrow", "\\Downarrow", "\\updownarrow", "\\Updownarrow", "."];
function checkDelimiter(delim, context) {
  var symDelim = checkSymbolNodeType(delim);
  if (symDelim && utils.contains(delimiters, symDelim.text)) {
    return symDelim;
  } else if (symDelim) {
    throw new ParseError("Invalid delimiter '" + symDelim.text + "' after '" + context.funcName + "'", delim);
  } else {
    throw new ParseError("Invalid delimiter type '" + delim.type + "'", delim);
  }
}
defineFunction({
  type: "delimsizing",
  names: ["\\bigl", "\\Bigl", "\\biggl", "\\Biggl", "\\bigr", "\\Bigr", "\\biggr", "\\Biggr", "\\bigm", "\\Bigm", "\\biggm", "\\Biggm", "\\big", "\\Big", "\\bigg", "\\Bigg"],
  props: {
    numArgs: 1,
    argTypes: ["primitive"]
  },
  handler: (context, args) => {
    var delim = checkDelimiter(args[0], context);
    return {
      type: "delimsizing",
      mode: context.parser.mode,
      size: delimiterSizes[context.funcName].size,
      mclass: delimiterSizes[context.funcName].mclass,
      delim: delim.text
    };
  },
  htmlBuilder: (group2, options) => {
    if (group2.delim === ".") {
      return buildCommon.makeSpan([group2.mclass]);
    }
    return delimiter.sizedDelim(group2.delim, group2.size, options, group2.mode, [group2.mclass]);
  },
  mathmlBuilder: (group2) => {
    var children = [];
    if (group2.delim !== ".") {
      children.push(makeText(group2.delim, group2.mode));
    }
    var node = new mathMLTree.MathNode("mo", children);
    if (group2.mclass === "mopen" || group2.mclass === "mclose") {
      node.setAttribute("fence", "true");
    } else {
      node.setAttribute("fence", "false");
    }
    node.setAttribute("stretchy", "true");
    var size = makeEm(delimiter.sizeToMaxHeight[group2.size]);
    node.setAttribute("minsize", size);
    node.setAttribute("maxsize", size);
    return node;
  }
});
function assertParsed(group2) {
  if (!group2.body) {
    throw new Error("Bug: The leftright ParseNode wasn't fully parsed.");
  }
}
defineFunction({
  type: "leftright-right",
  names: ["\\right"],
  props: {
    numArgs: 1,
    primitive: true
  },
  handler: (context, args) => {
    var color = context.parser.gullet.macros.get("\\current@color");
    if (color && typeof color !== "string") {
      throw new ParseError("\\current@color set to non-string in \\right");
    }
    return {
      type: "leftright-right",
      mode: context.parser.mode,
      delim: checkDelimiter(args[0], context).text,
      color
      // undefined if not set via \color
    };
  }
});
defineFunction({
  type: "leftright",
  names: ["\\left"],
  props: {
    numArgs: 1,
    primitive: true
  },
  handler: (context, args) => {
    var delim = checkDelimiter(args[0], context);
    var parser = context.parser;
    ++parser.leftrightDepth;
    var body = parser.parseExpression(false);
    --parser.leftrightDepth;
    parser.expect("\\right", false);
    var right = assertNodeType(parser.parseFunction(), "leftright-right");
    return {
      type: "leftright",
      mode: parser.mode,
      body,
      left: delim.text,
      right: right.delim,
      rightColor: right.color
    };
  },
  htmlBuilder: (group2, options) => {
    assertParsed(group2);
    var inner2 = buildExpression$1(group2.body, options, true, ["mopen", "mclose"]);
    var innerHeight = 0;
    var innerDepth = 0;
    var hadMiddle = false;
    for (var i2 = 0; i2 < inner2.length; i2++) {
      if (inner2[i2].isMiddle) {
        hadMiddle = true;
      } else {
        innerHeight = Math.max(inner2[i2].height, innerHeight);
        innerDepth = Math.max(inner2[i2].depth, innerDepth);
      }
    }
    innerHeight *= options.sizeMultiplier;
    innerDepth *= options.sizeMultiplier;
    var leftDelim;
    if (group2.left === ".") {
      leftDelim = makeNullDelimiter(options, ["mopen"]);
    } else {
      leftDelim = delimiter.leftRightDelim(group2.left, innerHeight, innerDepth, options, group2.mode, ["mopen"]);
    }
    inner2.unshift(leftDelim);
    if (hadMiddle) {
      for (var _i6 = 1; _i6 < inner2.length; _i6++) {
        var middleDelim = inner2[_i6];
        var isMiddle = middleDelim.isMiddle;
        if (isMiddle) {
          inner2[_i6] = delimiter.leftRightDelim(isMiddle.delim, innerHeight, innerDepth, isMiddle.options, group2.mode, []);
        }
      }
    }
    var rightDelim;
    if (group2.right === ".") {
      rightDelim = makeNullDelimiter(options, ["mclose"]);
    } else {
      var colorOptions = group2.rightColor ? options.withColor(group2.rightColor) : options;
      rightDelim = delimiter.leftRightDelim(group2.right, innerHeight, innerDepth, colorOptions, group2.mode, ["mclose"]);
    }
    inner2.push(rightDelim);
    return buildCommon.makeSpan(["minner"], inner2, options);
  },
  mathmlBuilder: (group2, options) => {
    assertParsed(group2);
    var inner2 = buildExpression2(group2.body, options);
    if (group2.left !== ".") {
      var leftNode = new mathMLTree.MathNode("mo", [makeText(group2.left, group2.mode)]);
      leftNode.setAttribute("fence", "true");
      inner2.unshift(leftNode);
    }
    if (group2.right !== ".") {
      var rightNode = new mathMLTree.MathNode("mo", [makeText(group2.right, group2.mode)]);
      rightNode.setAttribute("fence", "true");
      if (group2.rightColor) {
        rightNode.setAttribute("mathcolor", group2.rightColor);
      }
      inner2.push(rightNode);
    }
    return makeRow(inner2);
  }
});
defineFunction({
  type: "middle",
  names: ["\\middle"],
  props: {
    numArgs: 1,
    primitive: true
  },
  handler: (context, args) => {
    var delim = checkDelimiter(args[0], context);
    if (!context.parser.leftrightDepth) {
      throw new ParseError("\\middle without preceding \\left", delim);
    }
    return {
      type: "middle",
      mode: context.parser.mode,
      delim: delim.text
    };
  },
  htmlBuilder: (group2, options) => {
    var middleDelim;
    if (group2.delim === ".") {
      middleDelim = makeNullDelimiter(options, []);
    } else {
      middleDelim = delimiter.sizedDelim(group2.delim, 1, options, group2.mode, []);
      var isMiddle = {
        delim: group2.delim,
        options
      };
      middleDelim.isMiddle = isMiddle;
    }
    return middleDelim;
  },
  mathmlBuilder: (group2, options) => {
    var textNode = group2.delim === "\\vert" || group2.delim === "|" ? makeText("|", "text") : makeText(group2.delim, group2.mode);
    var middleNode = new mathMLTree.MathNode("mo", [textNode]);
    middleNode.setAttribute("fence", "true");
    middleNode.setAttribute("lspace", "0.05em");
    middleNode.setAttribute("rspace", "0.05em");
    return middleNode;
  }
});
var htmlBuilder$7 = (group2, options) => {
  var inner2 = buildCommon.wrapFragment(buildGroup$1(group2.body, options), options);
  var label = group2.label.slice(1);
  var scale = options.sizeMultiplier;
  var img;
  var imgShift = 0;
  var isSingleChar = utils.isCharacterBox(group2.body);
  if (label === "sout") {
    img = buildCommon.makeSpan(["stretchy", "sout"]);
    img.height = options.fontMetrics().defaultRuleThickness / scale;
    imgShift = -0.5 * options.fontMetrics().xHeight;
  } else if (label === "phase") {
    var lineWeight = calculateSize({
      number: 0.6,
      unit: "pt"
    }, options);
    var clearance = calculateSize({
      number: 0.35,
      unit: "ex"
    }, options);
    var newOptions = options.havingBaseSizing();
    scale = scale / newOptions.sizeMultiplier;
    var angleHeight = inner2.height + inner2.depth + lineWeight + clearance;
    inner2.style.paddingLeft = makeEm(angleHeight / 2 + lineWeight);
    var viewBoxHeight = Math.floor(1e3 * angleHeight * scale);
    var path2 = phasePath(viewBoxHeight);
    var svgNode = new SvgNode([new PathNode("phase", path2)], {
      "width": "400em",
      "height": makeEm(viewBoxHeight / 1e3),
      "viewBox": "0 0 400000 " + viewBoxHeight,
      "preserveAspectRatio": "xMinYMin slice"
    });
    img = buildCommon.makeSvgSpan(["hide-tail"], [svgNode], options);
    img.style.height = makeEm(angleHeight);
    imgShift = inner2.depth + lineWeight + clearance;
  } else {
    if (/cancel/.test(label)) {
      if (!isSingleChar) {
        inner2.classes.push("cancel-pad");
      }
    } else if (label === "angl") {
      inner2.classes.push("anglpad");
    } else {
      inner2.classes.push("boxpad");
    }
    var topPad = 0;
    var bottomPad = 0;
    var ruleThickness = 0;
    if (/box/.test(label)) {
      ruleThickness = Math.max(
        options.fontMetrics().fboxrule,
        // default
        options.minRuleThickness
        // User override.
      );
      topPad = options.fontMetrics().fboxsep + (label === "colorbox" ? 0 : ruleThickness);
      bottomPad = topPad;
    } else if (label === "angl") {
      ruleThickness = Math.max(options.fontMetrics().defaultRuleThickness, options.minRuleThickness);
      topPad = 4 * ruleThickness;
      bottomPad = Math.max(0, 0.25 - inner2.depth);
    } else {
      topPad = isSingleChar ? 0.2 : 0;
      bottomPad = topPad;
    }
    img = stretchy.encloseSpan(inner2, label, topPad, bottomPad, options);
    if (/fbox|boxed|fcolorbox/.test(label)) {
      img.style.borderStyle = "solid";
      img.style.borderWidth = makeEm(ruleThickness);
    } else if (label === "angl" && ruleThickness !== 0.049) {
      img.style.borderTopWidth = makeEm(ruleThickness);
      img.style.borderRightWidth = makeEm(ruleThickness);
    }
    imgShift = inner2.depth + bottomPad;
    if (group2.backgroundColor) {
      img.style.backgroundColor = group2.backgroundColor;
      if (group2.borderColor) {
        img.style.borderColor = group2.borderColor;
      }
    }
  }
  var vlist;
  if (group2.backgroundColor) {
    vlist = buildCommon.makeVList({
      positionType: "individualShift",
      children: [
        // Put the color background behind inner;
        {
          type: "elem",
          elem: img,
          shift: imgShift
        },
        {
          type: "elem",
          elem: inner2,
          shift: 0
        }
      ]
    }, options);
  } else {
    var classes = /cancel|phase/.test(label) ? ["svg-align"] : [];
    vlist = buildCommon.makeVList({
      positionType: "individualShift",
      children: [
        // Write the \cancel stroke on top of inner.
        {
          type: "elem",
          elem: inner2,
          shift: 0
        },
        {
          type: "elem",
          elem: img,
          shift: imgShift,
          wrapperClasses: classes
        }
      ]
    }, options);
  }
  if (/cancel/.test(label)) {
    vlist.height = inner2.height;
    vlist.depth = inner2.depth;
  }
  if (/cancel/.test(label) && !isSingleChar) {
    return buildCommon.makeSpan(["mord", "cancel-lap"], [vlist], options);
  } else {
    return buildCommon.makeSpan(["mord"], [vlist], options);
  }
};
var mathmlBuilder$6 = (group2, options) => {
  var fboxsep = 0;
  var node = new mathMLTree.MathNode(group2.label.indexOf("colorbox") > -1 ? "mpadded" : "menclose", [buildGroup2(group2.body, options)]);
  switch (group2.label) {
    case "\\cancel":
      node.setAttribute("notation", "updiagonalstrike");
      break;
    case "\\bcancel":
      node.setAttribute("notation", "downdiagonalstrike");
      break;
    case "\\phase":
      node.setAttribute("notation", "phasorangle");
      break;
    case "\\sout":
      node.setAttribute("notation", "horizontalstrike");
      break;
    case "\\fbox":
      node.setAttribute("notation", "box");
      break;
    case "\\angl":
      node.setAttribute("notation", "actuarial");
      break;
    case "\\fcolorbox":
    case "\\colorbox":
      fboxsep = options.fontMetrics().fboxsep * options.fontMetrics().ptPerEm;
      node.setAttribute("width", "+" + 2 * fboxsep + "pt");
      node.setAttribute("height", "+" + 2 * fboxsep + "pt");
      node.setAttribute("lspace", fboxsep + "pt");
      node.setAttribute("voffset", fboxsep + "pt");
      if (group2.label === "\\fcolorbox") {
        var thk = Math.max(
          options.fontMetrics().fboxrule,
          // default
          options.minRuleThickness
          // user override
        );
        node.setAttribute("style", "border: " + thk + "em solid " + String(group2.borderColor));
      }
      break;
    case "\\xcancel":
      node.setAttribute("notation", "updiagonalstrike downdiagonalstrike");
      break;
  }
  if (group2.backgroundColor) {
    node.setAttribute("mathbackground", group2.backgroundColor);
  }
  return node;
};
defineFunction({
  type: "enclose",
  names: ["\\colorbox"],
  props: {
    numArgs: 2,
    allowedInText: true,
    argTypes: ["color", "text"]
  },
  handler(_ref, args, optArgs) {
    var {
      parser,
      funcName
    } = _ref;
    var color = assertNodeType(args[0], "color-token").color;
    var body = args[1];
    return {
      type: "enclose",
      mode: parser.mode,
      label: funcName,
      backgroundColor: color,
      body
    };
  },
  htmlBuilder: htmlBuilder$7,
  mathmlBuilder: mathmlBuilder$6
});
defineFunction({
  type: "enclose",
  names: ["\\fcolorbox"],
  props: {
    numArgs: 3,
    allowedInText: true,
    argTypes: ["color", "color", "text"]
  },
  handler(_ref2, args, optArgs) {
    var {
      parser,
      funcName
    } = _ref2;
    var borderColor = assertNodeType(args[0], "color-token").color;
    var backgroundColor = assertNodeType(args[1], "color-token").color;
    var body = args[2];
    return {
      type: "enclose",
      mode: parser.mode,
      label: funcName,
      backgroundColor,
      borderColor,
      body
    };
  },
  htmlBuilder: htmlBuilder$7,
  mathmlBuilder: mathmlBuilder$6
});
defineFunction({
  type: "enclose",
  names: ["\\fbox"],
  props: {
    numArgs: 1,
    argTypes: ["hbox"],
    allowedInText: true
  },
  handler(_ref3, args) {
    var {
      parser
    } = _ref3;
    return {
      type: "enclose",
      mode: parser.mode,
      label: "\\fbox",
      body: args[0]
    };
  }
});
defineFunction({
  type: "enclose",
  names: ["\\cancel", "\\bcancel", "\\xcancel", "\\sout", "\\phase"],
  props: {
    numArgs: 1
  },
  handler(_ref4, args) {
    var {
      parser,
      funcName
    } = _ref4;
    var body = args[0];
    return {
      type: "enclose",
      mode: parser.mode,
      label: funcName,
      body
    };
  },
  htmlBuilder: htmlBuilder$7,
  mathmlBuilder: mathmlBuilder$6
});
defineFunction({
  type: "enclose",
  names: ["\\angl"],
  props: {
    numArgs: 1,
    argTypes: ["hbox"],
    allowedInText: false
  },
  handler(_ref5, args) {
    var {
      parser
    } = _ref5;
    return {
      type: "enclose",
      mode: parser.mode,
      label: "\\angl",
      body: args[0]
    };
  }
});
var _environments = {};
function defineEnvironment(_ref) {
  var {
    type,
    names,
    props,
    handler,
    htmlBuilder: htmlBuilder3,
    mathmlBuilder: mathmlBuilder3
  } = _ref;
  var data = {
    type,
    numArgs: props.numArgs || 0,
    allowedInText: false,
    numOptionalArgs: 0,
    handler
  };
  for (var i2 = 0; i2 < names.length; ++i2) {
    _environments[names[i2]] = data;
  }
  if (htmlBuilder3) {
    _htmlGroupBuilders[type] = htmlBuilder3;
  }
  if (mathmlBuilder3) {
    _mathmlGroupBuilders[type] = mathmlBuilder3;
  }
}
var _macros = {};
function defineMacro(name, body) {
  _macros[name] = body;
}
function getHLines(parser) {
  var hlineInfo = [];
  parser.consumeSpaces();
  var nxt = parser.fetch().text;
  if (nxt === "\\relax") {
    parser.consume();
    parser.consumeSpaces();
    nxt = parser.fetch().text;
  }
  while (nxt === "\\hline" || nxt === "\\hdashline") {
    parser.consume();
    hlineInfo.push(nxt === "\\hdashline");
    parser.consumeSpaces();
    nxt = parser.fetch().text;
  }
  return hlineInfo;
}
var validateAmsEnvironmentContext = (context) => {
  var settings = context.parser.settings;
  if (!settings.displayMode) {
    throw new ParseError("{" + context.envName + "} can be used only in display mode.");
  }
};
function getAutoTag(name) {
  if (name.indexOf("ed") === -1) {
    return name.indexOf("*") === -1;
  }
}
function parseArray(parser, _ref, style) {
  var {
    hskipBeforeAndAfter,
    addJot,
    cols,
    arraystretch,
    colSeparationType,
    autoTag,
    singleRow,
    emptySingleRow,
    maxNumCols,
    leqno
  } = _ref;
  parser.gullet.beginGroup();
  if (!singleRow) {
    parser.gullet.macros.set("\\cr", "\\\\\\relax");
  }
  if (!arraystretch) {
    var stretch = parser.gullet.expandMacroAsText("\\arraystretch");
    if (stretch == null) {
      arraystretch = 1;
    } else {
      arraystretch = parseFloat(stretch);
      if (!arraystretch || arraystretch < 0) {
        throw new ParseError("Invalid \\arraystretch: " + stretch);
      }
    }
  }
  parser.gullet.beginGroup();
  var row = [];
  var body = [row];
  var rowGaps = [];
  var hLinesBeforeRow = [];
  var tags = autoTag != null ? [] : void 0;
  function beginRow() {
    if (autoTag) {
      parser.gullet.macros.set("\\@eqnsw", "1", true);
    }
  }
  function endRow() {
    if (tags) {
      if (parser.gullet.macros.get("\\df@tag")) {
        tags.push(parser.subparse([new Token("\\df@tag")]));
        parser.gullet.macros.set("\\df@tag", void 0, true);
      } else {
        tags.push(Boolean(autoTag) && parser.gullet.macros.get("\\@eqnsw") === "1");
      }
    }
  }
  beginRow();
  hLinesBeforeRow.push(getHLines(parser));
  while (true) {
    var cell = parser.parseExpression(false, singleRow ? "\\end" : "\\\\");
    parser.gullet.endGroup();
    parser.gullet.beginGroup();
    cell = {
      type: "ordgroup",
      mode: parser.mode,
      body: cell
    };
    if (style) {
      cell = {
        type: "styling",
        mode: parser.mode,
        style,
        body: [cell]
      };
    }
    row.push(cell);
    var next = parser.fetch().text;
    if (next === "&") {
      if (maxNumCols && row.length === maxNumCols) {
        if (singleRow || colSeparationType) {
          throw new ParseError("Too many tab characters: &", parser.nextToken);
        } else {
          parser.settings.reportNonstrict("textEnv", "Too few columns specified in the {array} column argument.");
        }
      }
      parser.consume();
    } else if (next === "\\end") {
      endRow();
      if (row.length === 1 && cell.type === "styling" && cell.body[0].body.length === 0 && (body.length > 1 || !emptySingleRow)) {
        body.pop();
      }
      if (hLinesBeforeRow.length < body.length + 1) {
        hLinesBeforeRow.push([]);
      }
      break;
    } else if (next === "\\\\") {
      parser.consume();
      var size = void 0;
      if (parser.gullet.future().text !== " ") {
        size = parser.parseSizeGroup(true);
      }
      rowGaps.push(size ? size.value : null);
      endRow();
      hLinesBeforeRow.push(getHLines(parser));
      row = [];
      body.push(row);
      beginRow();
    } else {
      throw new ParseError("Expected & or \\\\ or \\cr or \\end", parser.nextToken);
    }
  }
  parser.gullet.endGroup();
  parser.gullet.endGroup();
  return {
    type: "array",
    mode: parser.mode,
    addJot,
    arraystretch,
    body,
    cols,
    rowGaps,
    hskipBeforeAndAfter,
    hLinesBeforeRow,
    colSeparationType,
    tags,
    leqno
  };
}
function dCellStyle(envName) {
  if (envName.slice(0, 1) === "d") {
    return "display";
  } else {
    return "text";
  }
}
var htmlBuilder$6 = function htmlBuilder(group2, options) {
  var r;
  var c;
  var nr = group2.body.length;
  var hLinesBeforeRow = group2.hLinesBeforeRow;
  var nc = 0;
  var body = new Array(nr);
  var hlines = [];
  var ruleThickness = Math.max(
    // From LaTeX \showthe\arrayrulewidth. Equals 0.04 em.
    options.fontMetrics().arrayRuleWidth,
    options.minRuleThickness
    // User override.
  );
  var pt = 1 / options.fontMetrics().ptPerEm;
  var arraycolsep = 5 * pt;
  if (group2.colSeparationType && group2.colSeparationType === "small") {
    var localMultiplier = options.havingStyle(Style$1.SCRIPT).sizeMultiplier;
    arraycolsep = 0.2778 * (localMultiplier / options.sizeMultiplier);
  }
  var baselineskip = group2.colSeparationType === "CD" ? calculateSize({
    number: 3,
    unit: "ex"
  }, options) : 12 * pt;
  var jot = 3 * pt;
  var arrayskip = group2.arraystretch * baselineskip;
  var arstrutHeight = 0.7 * arrayskip;
  var arstrutDepth = 0.3 * arrayskip;
  var totalHeight = 0;
  function setHLinePos(hlinesInGap) {
    for (var i2 = 0; i2 < hlinesInGap.length; ++i2) {
      if (i2 > 0) {
        totalHeight += 0.25;
      }
      hlines.push({
        pos: totalHeight,
        isDashed: hlinesInGap[i2]
      });
    }
  }
  setHLinePos(hLinesBeforeRow[0]);
  for (r = 0; r < group2.body.length; ++r) {
    var inrow = group2.body[r];
    var height = arstrutHeight;
    var depth = arstrutDepth;
    if (nc < inrow.length) {
      nc = inrow.length;
    }
    var outrow = new Array(inrow.length);
    for (c = 0; c < inrow.length; ++c) {
      var elt = buildGroup$1(inrow[c], options);
      if (depth < elt.depth) {
        depth = elt.depth;
      }
      if (height < elt.height) {
        height = elt.height;
      }
      outrow[c] = elt;
    }
    var rowGap = group2.rowGaps[r];
    var gap = 0;
    if (rowGap) {
      gap = calculateSize(rowGap, options);
      if (gap > 0) {
        gap += arstrutDepth;
        if (depth < gap) {
          depth = gap;
        }
        gap = 0;
      }
    }
    if (group2.addJot) {
      depth += jot;
    }
    outrow.height = height;
    outrow.depth = depth;
    totalHeight += height;
    outrow.pos = totalHeight;
    totalHeight += depth + gap;
    body[r] = outrow;
    setHLinePos(hLinesBeforeRow[r + 1]);
  }
  var offset = totalHeight / 2 + options.fontMetrics().axisHeight;
  var colDescriptions = group2.cols || [];
  var cols = [];
  var colSep;
  var colDescrNum;
  var tagSpans = [];
  if (group2.tags && group2.tags.some((tag2) => tag2)) {
    for (r = 0; r < nr; ++r) {
      var rw = body[r];
      var shift = rw.pos - offset;
      var tag = group2.tags[r];
      var tagSpan = void 0;
      if (tag === true) {
        tagSpan = buildCommon.makeSpan(["eqn-num"], [], options);
      } else if (tag === false) {
        tagSpan = buildCommon.makeSpan([], [], options);
      } else {
        tagSpan = buildCommon.makeSpan([], buildExpression$1(tag, options, true), options);
      }
      tagSpan.depth = rw.depth;
      tagSpan.height = rw.height;
      tagSpans.push({
        type: "elem",
        elem: tagSpan,
        shift
      });
    }
  }
  for (
    c = 0, colDescrNum = 0;
    // Continue while either there are more columns or more column
    // descriptions, so trailing separators don't get lost.
    c < nc || colDescrNum < colDescriptions.length;
    ++c, ++colDescrNum
  ) {
    var colDescr = colDescriptions[colDescrNum] || {};
    var firstSeparator = true;
    while (colDescr.type === "separator") {
      if (!firstSeparator) {
        colSep = buildCommon.makeSpan(["arraycolsep"], []);
        colSep.style.width = makeEm(options.fontMetrics().doubleRuleSep);
        cols.push(colSep);
      }
      if (colDescr.separator === "|" || colDescr.separator === ":") {
        var lineType = colDescr.separator === "|" ? "solid" : "dashed";
        var separator = buildCommon.makeSpan(["vertical-separator"], [], options);
        separator.style.height = makeEm(totalHeight);
        separator.style.borderRightWidth = makeEm(ruleThickness);
        separator.style.borderRightStyle = lineType;
        separator.style.margin = "0 " + makeEm(-ruleThickness / 2);
        var _shift = totalHeight - offset;
        if (_shift) {
          separator.style.verticalAlign = makeEm(-_shift);
        }
        cols.push(separator);
      } else {
        throw new ParseError("Invalid separator type: " + colDescr.separator);
      }
      colDescrNum++;
      colDescr = colDescriptions[colDescrNum] || {};
      firstSeparator = false;
    }
    if (c >= nc) {
      continue;
    }
    var sepwidth = void 0;
    if (c > 0 || group2.hskipBeforeAndAfter) {
      sepwidth = utils.deflt(colDescr.pregap, arraycolsep);
      if (sepwidth !== 0) {
        colSep = buildCommon.makeSpan(["arraycolsep"], []);
        colSep.style.width = makeEm(sepwidth);
        cols.push(colSep);
      }
    }
    var col = [];
    for (r = 0; r < nr; ++r) {
      var row = body[r];
      var elem = row[c];
      if (!elem) {
        continue;
      }
      var _shift2 = row.pos - offset;
      elem.depth = row.depth;
      elem.height = row.height;
      col.push({
        type: "elem",
        elem,
        shift: _shift2
      });
    }
    col = buildCommon.makeVList({
      positionType: "individualShift",
      children: col
    }, options);
    col = buildCommon.makeSpan(["col-align-" + (colDescr.align || "c")], [col]);
    cols.push(col);
    if (c < nc - 1 || group2.hskipBeforeAndAfter) {
      sepwidth = utils.deflt(colDescr.postgap, arraycolsep);
      if (sepwidth !== 0) {
        colSep = buildCommon.makeSpan(["arraycolsep"], []);
        colSep.style.width = makeEm(sepwidth);
        cols.push(colSep);
      }
    }
  }
  body = buildCommon.makeSpan(["mtable"], cols);
  if (hlines.length > 0) {
    var line = buildCommon.makeLineSpan("hline", options, ruleThickness);
    var dashes = buildCommon.makeLineSpan("hdashline", options, ruleThickness);
    var vListElems = [{
      type: "elem",
      elem: body,
      shift: 0
    }];
    while (hlines.length > 0) {
      var hline = hlines.pop();
      var lineShift = hline.pos - offset;
      if (hline.isDashed) {
        vListElems.push({
          type: "elem",
          elem: dashes,
          shift: lineShift
        });
      } else {
        vListElems.push({
          type: "elem",
          elem: line,
          shift: lineShift
        });
      }
    }
    body = buildCommon.makeVList({
      positionType: "individualShift",
      children: vListElems
    }, options);
  }
  if (tagSpans.length === 0) {
    return buildCommon.makeSpan(["mord"], [body], options);
  } else {
    var eqnNumCol = buildCommon.makeVList({
      positionType: "individualShift",
      children: tagSpans
    }, options);
    eqnNumCol = buildCommon.makeSpan(["tag"], [eqnNumCol], options);
    return buildCommon.makeFragment([body, eqnNumCol]);
  }
};
var alignMap = {
  c: "center ",
  l: "left ",
  r: "right "
};
var mathmlBuilder$5 = function mathmlBuilder(group2, options) {
  var tbl = [];
  var glue = new mathMLTree.MathNode("mtd", [], ["mtr-glue"]);
  var tag = new mathMLTree.MathNode("mtd", [], ["mml-eqn-num"]);
  for (var i2 = 0; i2 < group2.body.length; i2++) {
    var rw = group2.body[i2];
    var row = [];
    for (var j = 0; j < rw.length; j++) {
      row.push(new mathMLTree.MathNode("mtd", [buildGroup2(rw[j], options)]));
    }
    if (group2.tags && group2.tags[i2]) {
      row.unshift(glue);
      row.push(glue);
      if (group2.leqno) {
        row.unshift(tag);
      } else {
        row.push(tag);
      }
    }
    tbl.push(new mathMLTree.MathNode("mtr", row));
  }
  var table = new mathMLTree.MathNode("mtable", tbl);
  var gap = group2.arraystretch === 0.5 ? 0.1 : 0.16 + group2.arraystretch - 1 + (group2.addJot ? 0.09 : 0);
  table.setAttribute("rowspacing", makeEm(gap));
  var menclose = "";
  var align = "";
  if (group2.cols && group2.cols.length > 0) {
    var cols = group2.cols;
    var columnLines = "";
    var prevTypeWasAlign = false;
    var iStart = 0;
    var iEnd = cols.length;
    if (cols[0].type === "separator") {
      menclose += "top ";
      iStart = 1;
    }
    if (cols[cols.length - 1].type === "separator") {
      menclose += "bottom ";
      iEnd -= 1;
    }
    for (var _i6 = iStart; _i6 < iEnd; _i6++) {
      if (cols[_i6].type === "align") {
        align += alignMap[cols[_i6].align];
        if (prevTypeWasAlign) {
          columnLines += "none ";
        }
        prevTypeWasAlign = true;
      } else if (cols[_i6].type === "separator") {
        if (prevTypeWasAlign) {
          columnLines += cols[_i6].separator === "|" ? "solid " : "dashed ";
          prevTypeWasAlign = false;
        }
      }
    }
    table.setAttribute("columnalign", align.trim());
    if (/[sd]/.test(columnLines)) {
      table.setAttribute("columnlines", columnLines.trim());
    }
  }
  if (group2.colSeparationType === "align") {
    var _cols = group2.cols || [];
    var spacing2 = "";
    for (var _i22 = 1; _i22 < _cols.length; _i22++) {
      spacing2 += _i22 % 2 ? "0em " : "1em ";
    }
    table.setAttribute("columnspacing", spacing2.trim());
  } else if (group2.colSeparationType === "alignat" || group2.colSeparationType === "gather") {
    table.setAttribute("columnspacing", "0em");
  } else if (group2.colSeparationType === "small") {
    table.setAttribute("columnspacing", "0.2778em");
  } else if (group2.colSeparationType === "CD") {
    table.setAttribute("columnspacing", "0.5em");
  } else {
    table.setAttribute("columnspacing", "1em");
  }
  var rowLines = "";
  var hlines = group2.hLinesBeforeRow;
  menclose += hlines[0].length > 0 ? "left " : "";
  menclose += hlines[hlines.length - 1].length > 0 ? "right " : "";
  for (var _i32 = 1; _i32 < hlines.length - 1; _i32++) {
    rowLines += hlines[_i32].length === 0 ? "none " : hlines[_i32][0] ? "dashed " : "solid ";
  }
  if (/[sd]/.test(rowLines)) {
    table.setAttribute("rowlines", rowLines.trim());
  }
  if (menclose !== "") {
    table = new mathMLTree.MathNode("menclose", [table]);
    table.setAttribute("notation", menclose.trim());
  }
  if (group2.arraystretch && group2.arraystretch < 1) {
    table = new mathMLTree.MathNode("mstyle", [table]);
    table.setAttribute("scriptlevel", "1");
  }
  return table;
};
var alignedHandler = function alignedHandler2(context, args) {
  if (context.envName.indexOf("ed") === -1) {
    validateAmsEnvironmentContext(context);
  }
  var cols = [];
  var separationType = context.envName.indexOf("at") > -1 ? "alignat" : "align";
  var isSplit = context.envName === "split";
  var res = parseArray(context.parser, {
    cols,
    addJot: true,
    autoTag: isSplit ? void 0 : getAutoTag(context.envName),
    emptySingleRow: true,
    colSeparationType: separationType,
    maxNumCols: isSplit ? 2 : void 0,
    leqno: context.parser.settings.leqno
  }, "display");
  var numMaths;
  var numCols = 0;
  var emptyGroup = {
    type: "ordgroup",
    mode: context.mode,
    body: []
  };
  if (args[0] && args[0].type === "ordgroup") {
    var arg0 = "";
    for (var i2 = 0; i2 < args[0].body.length; i2++) {
      var textord2 = assertNodeType(args[0].body[i2], "textord");
      arg0 += textord2.text;
    }
    numMaths = Number(arg0);
    numCols = numMaths * 2;
  }
  var isAligned = !numCols;
  res.body.forEach(function(row) {
    for (var _i42 = 1; _i42 < row.length; _i42 += 2) {
      var styling = assertNodeType(row[_i42], "styling");
      var ordgroup = assertNodeType(styling.body[0], "ordgroup");
      ordgroup.body.unshift(emptyGroup);
    }
    if (!isAligned) {
      var curMaths = row.length / 2;
      if (numMaths < curMaths) {
        throw new ParseError("Too many math in a row: " + ("expected " + numMaths + ", but got " + curMaths), row[0]);
      }
    } else if (numCols < row.length) {
      numCols = row.length;
    }
  });
  for (var _i52 = 0; _i52 < numCols; ++_i52) {
    var align = "r";
    var pregap = 0;
    if (_i52 % 2 === 1) {
      align = "l";
    } else if (_i52 > 0 && isAligned) {
      pregap = 1;
    }
    cols[_i52] = {
      type: "align",
      align,
      pregap,
      postgap: 0
    };
  }
  res.colSeparationType = isAligned ? "align" : "alignat";
  return res;
};
defineEnvironment({
  type: "array",
  names: ["array", "darray"],
  props: {
    numArgs: 1
  },
  handler(context, args) {
    var symNode = checkSymbolNodeType(args[0]);
    var colalign = symNode ? [args[0]] : assertNodeType(args[0], "ordgroup").body;
    var cols = colalign.map(function(nde) {
      var node = assertSymbolNodeType(nde);
      var ca = node.text;
      if ("lcr".indexOf(ca) !== -1) {
        return {
          type: "align",
          align: ca
        };
      } else if (ca === "|") {
        return {
          type: "separator",
          separator: "|"
        };
      } else if (ca === ":") {
        return {
          type: "separator",
          separator: ":"
        };
      }
      throw new ParseError("Unknown column alignment: " + ca, nde);
    });
    var res = {
      cols,
      hskipBeforeAndAfter: true,
      // \@preamble in lttab.dtx
      maxNumCols: cols.length
    };
    return parseArray(context.parser, res, dCellStyle(context.envName));
  },
  htmlBuilder: htmlBuilder$6,
  mathmlBuilder: mathmlBuilder$5
});
defineEnvironment({
  type: "array",
  names: ["matrix", "pmatrix", "bmatrix", "Bmatrix", "vmatrix", "Vmatrix", "matrix*", "pmatrix*", "bmatrix*", "Bmatrix*", "vmatrix*", "Vmatrix*"],
  props: {
    numArgs: 0
  },
  handler(context) {
    var delimiters2 = {
      "matrix": null,
      "pmatrix": ["(", ")"],
      "bmatrix": ["[", "]"],
      "Bmatrix": ["\\{", "\\}"],
      "vmatrix": ["|", "|"],
      "Vmatrix": ["\\Vert", "\\Vert"]
    }[context.envName.replace("*", "")];
    var colAlign = "c";
    var payload = {
      hskipBeforeAndAfter: false,
      cols: [{
        type: "align",
        align: colAlign
      }]
    };
    if (context.envName.charAt(context.envName.length - 1) === "*") {
      var parser = context.parser;
      parser.consumeSpaces();
      if (parser.fetch().text === "[") {
        parser.consume();
        parser.consumeSpaces();
        colAlign = parser.fetch().text;
        if ("lcr".indexOf(colAlign) === -1) {
          throw new ParseError("Expected l or c or r", parser.nextToken);
        }
        parser.consume();
        parser.consumeSpaces();
        parser.expect("]");
        parser.consume();
        payload.cols = [{
          type: "align",
          align: colAlign
        }];
      }
    }
    var res = parseArray(context.parser, payload, dCellStyle(context.envName));
    var numCols = Math.max(0, ...res.body.map((row) => row.length));
    res.cols = new Array(numCols).fill({
      type: "align",
      align: colAlign
    });
    return delimiters2 ? {
      type: "leftright",
      mode: context.mode,
      body: [res],
      left: delimiters2[0],
      right: delimiters2[1],
      rightColor: void 0
      // \right uninfluenced by \color in array
    } : res;
  },
  htmlBuilder: htmlBuilder$6,
  mathmlBuilder: mathmlBuilder$5
});
defineEnvironment({
  type: "array",
  names: ["smallmatrix"],
  props: {
    numArgs: 0
  },
  handler(context) {
    var payload = {
      arraystretch: 0.5
    };
    var res = parseArray(context.parser, payload, "script");
    res.colSeparationType = "small";
    return res;
  },
  htmlBuilder: htmlBuilder$6,
  mathmlBuilder: mathmlBuilder$5
});
defineEnvironment({
  type: "array",
  names: ["subarray"],
  props: {
    numArgs: 1
  },
  handler(context, args) {
    var symNode = checkSymbolNodeType(args[0]);
    var colalign = symNode ? [args[0]] : assertNodeType(args[0], "ordgroup").body;
    var cols = colalign.map(function(nde) {
      var node = assertSymbolNodeType(nde);
      var ca = node.text;
      if ("lc".indexOf(ca) !== -1) {
        return {
          type: "align",
          align: ca
        };
      }
      throw new ParseError("Unknown column alignment: " + ca, nde);
    });
    if (cols.length > 1) {
      throw new ParseError("{subarray} can contain only one column");
    }
    var res = {
      cols,
      hskipBeforeAndAfter: false,
      arraystretch: 0.5
    };
    res = parseArray(context.parser, res, "script");
    if (res.body.length > 0 && res.body[0].length > 1) {
      throw new ParseError("{subarray} can contain only one column");
    }
    return res;
  },
  htmlBuilder: htmlBuilder$6,
  mathmlBuilder: mathmlBuilder$5
});
defineEnvironment({
  type: "array",
  names: ["cases", "dcases", "rcases", "drcases"],
  props: {
    numArgs: 0
  },
  handler(context) {
    var payload = {
      arraystretch: 1.2,
      cols: [{
        type: "align",
        align: "l",
        pregap: 0,
        // TODO(kevinb) get the current style.
        // For now we use the metrics for TEXT style which is what we were
        // doing before.  Before attempting to get the current style we
        // should look at TeX's behavior especially for \over and matrices.
        postgap: 1
        /* 1em quad */
      }, {
        type: "align",
        align: "l",
        pregap: 0,
        postgap: 0
      }]
    };
    var res = parseArray(context.parser, payload, dCellStyle(context.envName));
    return {
      type: "leftright",
      mode: context.mode,
      body: [res],
      left: context.envName.indexOf("r") > -1 ? "." : "\\{",
      right: context.envName.indexOf("r") > -1 ? "\\}" : ".",
      rightColor: void 0
    };
  },
  htmlBuilder: htmlBuilder$6,
  mathmlBuilder: mathmlBuilder$5
});
defineEnvironment({
  type: "array",
  names: ["align", "align*", "aligned", "split"],
  props: {
    numArgs: 0
  },
  handler: alignedHandler,
  htmlBuilder: htmlBuilder$6,
  mathmlBuilder: mathmlBuilder$5
});
defineEnvironment({
  type: "array",
  names: ["gathered", "gather", "gather*"],
  props: {
    numArgs: 0
  },
  handler(context) {
    if (utils.contains(["gather", "gather*"], context.envName)) {
      validateAmsEnvironmentContext(context);
    }
    var res = {
      cols: [{
        type: "align",
        align: "c"
      }],
      addJot: true,
      colSeparationType: "gather",
      autoTag: getAutoTag(context.envName),
      emptySingleRow: true,
      leqno: context.parser.settings.leqno
    };
    return parseArray(context.parser, res, "display");
  },
  htmlBuilder: htmlBuilder$6,
  mathmlBuilder: mathmlBuilder$5
});
defineEnvironment({
  type: "array",
  names: ["alignat", "alignat*", "alignedat"],
  props: {
    numArgs: 1
  },
  handler: alignedHandler,
  htmlBuilder: htmlBuilder$6,
  mathmlBuilder: mathmlBuilder$5
});
defineEnvironment({
  type: "array",
  names: ["equation", "equation*"],
  props: {
    numArgs: 0
  },
  handler(context) {
    validateAmsEnvironmentContext(context);
    var res = {
      autoTag: getAutoTag(context.envName),
      emptySingleRow: true,
      singleRow: true,
      maxNumCols: 1,
      leqno: context.parser.settings.leqno
    };
    return parseArray(context.parser, res, "display");
  },
  htmlBuilder: htmlBuilder$6,
  mathmlBuilder: mathmlBuilder$5
});
defineEnvironment({
  type: "array",
  names: ["CD"],
  props: {
    numArgs: 0
  },
  handler(context) {
    validateAmsEnvironmentContext(context);
    return parseCD(context.parser);
  },
  htmlBuilder: htmlBuilder$6,
  mathmlBuilder: mathmlBuilder$5
});
defineMacro("\\nonumber", "\\gdef\\@eqnsw{0}");
defineMacro("\\notag", "\\nonumber");
defineFunction({
  type: "text",
  // Doesn't matter what this is.
  names: ["\\hline", "\\hdashline"],
  props: {
    numArgs: 0,
    allowedInText: true,
    allowedInMath: true
  },
  handler(context, args) {
    throw new ParseError(context.funcName + " valid only within array environment");
  }
});
var environments = _environments;
defineFunction({
  type: "environment",
  names: ["\\begin", "\\end"],
  props: {
    numArgs: 1,
    argTypes: ["text"]
  },
  handler(_ref, args) {
    var {
      parser,
      funcName
    } = _ref;
    var nameGroup = args[0];
    if (nameGroup.type !== "ordgroup") {
      throw new ParseError("Invalid environment name", nameGroup);
    }
    var envName = "";
    for (var i2 = 0; i2 < nameGroup.body.length; ++i2) {
      envName += assertNodeType(nameGroup.body[i2], "textord").text;
    }
    if (funcName === "\\begin") {
      if (!environments.hasOwnProperty(envName)) {
        throw new ParseError("No such environment: " + envName, nameGroup);
      }
      var env = environments[envName];
      var {
        args: _args,
        optArgs
      } = parser.parseArguments("\\begin{" + envName + "}", env);
      var context = {
        mode: parser.mode,
        envName,
        parser
      };
      var result = env.handler(context, _args, optArgs);
      parser.expect("\\end", false);
      var endNameToken = parser.nextToken;
      var end = assertNodeType(parser.parseFunction(), "environment");
      if (end.name !== envName) {
        throw new ParseError("Mismatch: \\begin{" + envName + "} matched by \\end{" + end.name + "}", endNameToken);
      }
      return result;
    }
    return {
      type: "environment",
      mode: parser.mode,
      name: envName,
      nameGroup
    };
  }
});
var htmlBuilder$5 = (group2, options) => {
  var font = group2.font;
  var newOptions = options.withFont(font);
  return buildGroup$1(group2.body, newOptions);
};
var mathmlBuilder$4 = (group2, options) => {
  var font = group2.font;
  var newOptions = options.withFont(font);
  return buildGroup2(group2.body, newOptions);
};
var fontAliases = {
  "\\Bbb": "\\mathbb",
  "\\bold": "\\mathbf",
  "\\frak": "\\mathfrak",
  "\\bm": "\\boldsymbol"
};
defineFunction({
  type: "font",
  names: [
    // styles, except \boldsymbol defined below
    "\\mathrm",
    "\\mathit",
    "\\mathbf",
    "\\mathnormal",
    "\\mathsfit",
    // families
    "\\mathbb",
    "\\mathcal",
    "\\mathfrak",
    "\\mathscr",
    "\\mathsf",
    "\\mathtt",
    // aliases, except \bm defined below
    "\\Bbb",
    "\\bold",
    "\\frak"
  ],
  props: {
    numArgs: 1,
    allowedInArgument: true
  },
  handler: (_ref, args) => {
    var {
      parser,
      funcName
    } = _ref;
    var body = normalizeArgument(args[0]);
    var func = funcName;
    if (func in fontAliases) {
      func = fontAliases[func];
    }
    return {
      type: "font",
      mode: parser.mode,
      font: func.slice(1),
      body
    };
  },
  htmlBuilder: htmlBuilder$5,
  mathmlBuilder: mathmlBuilder$4
});
defineFunction({
  type: "mclass",
  names: ["\\boldsymbol", "\\bm"],
  props: {
    numArgs: 1
  },
  handler: (_ref2, args) => {
    var {
      parser
    } = _ref2;
    var body = args[0];
    var isCharacterBox3 = utils.isCharacterBox(body);
    return {
      type: "mclass",
      mode: parser.mode,
      mclass: binrelClass(body),
      body: [{
        type: "font",
        mode: parser.mode,
        font: "boldsymbol",
        body
      }],
      isCharacterBox: isCharacterBox3
    };
  }
});
defineFunction({
  type: "font",
  names: ["\\rm", "\\sf", "\\tt", "\\bf", "\\it", "\\cal"],
  props: {
    numArgs: 0,
    allowedInText: true
  },
  handler: (_ref3, args) => {
    var {
      parser,
      funcName,
      breakOnTokenText
    } = _ref3;
    var {
      mode
    } = parser;
    var body = parser.parseExpression(true, breakOnTokenText);
    var style = "math" + funcName.slice(1);
    return {
      type: "font",
      mode,
      font: style,
      body: {
        type: "ordgroup",
        mode: parser.mode,
        body
      }
    };
  },
  htmlBuilder: htmlBuilder$5,
  mathmlBuilder: mathmlBuilder$4
});
var adjustStyle = (size, originalStyle) => {
  var style = originalStyle;
  if (size === "display") {
    style = style.id >= Style$1.SCRIPT.id ? style.text() : Style$1.DISPLAY;
  } else if (size === "text" && style.size === Style$1.DISPLAY.size) {
    style = Style$1.TEXT;
  } else if (size === "script") {
    style = Style$1.SCRIPT;
  } else if (size === "scriptscript") {
    style = Style$1.SCRIPTSCRIPT;
  }
  return style;
};
var htmlBuilder$4 = (group2, options) => {
  var style = adjustStyle(group2.size, options.style);
  var nstyle = style.fracNum();
  var dstyle = style.fracDen();
  var newOptions;
  newOptions = options.havingStyle(nstyle);
  var numerm = buildGroup$1(group2.numer, newOptions, options);
  if (group2.continued) {
    var hStrut = 8.5 / options.fontMetrics().ptPerEm;
    var dStrut = 3.5 / options.fontMetrics().ptPerEm;
    numerm.height = numerm.height < hStrut ? hStrut : numerm.height;
    numerm.depth = numerm.depth < dStrut ? dStrut : numerm.depth;
  }
  newOptions = options.havingStyle(dstyle);
  var denomm = buildGroup$1(group2.denom, newOptions, options);
  var rule;
  var ruleWidth;
  var ruleSpacing;
  if (group2.hasBarLine) {
    if (group2.barSize) {
      ruleWidth = calculateSize(group2.barSize, options);
      rule = buildCommon.makeLineSpan("frac-line", options, ruleWidth);
    } else {
      rule = buildCommon.makeLineSpan("frac-line", options);
    }
    ruleWidth = rule.height;
    ruleSpacing = rule.height;
  } else {
    rule = null;
    ruleWidth = 0;
    ruleSpacing = options.fontMetrics().defaultRuleThickness;
  }
  var numShift;
  var clearance;
  var denomShift;
  if (style.size === Style$1.DISPLAY.size || group2.size === "display") {
    numShift = options.fontMetrics().num1;
    if (ruleWidth > 0) {
      clearance = 3 * ruleSpacing;
    } else {
      clearance = 7 * ruleSpacing;
    }
    denomShift = options.fontMetrics().denom1;
  } else {
    if (ruleWidth > 0) {
      numShift = options.fontMetrics().num2;
      clearance = ruleSpacing;
    } else {
      numShift = options.fontMetrics().num3;
      clearance = 3 * ruleSpacing;
    }
    denomShift = options.fontMetrics().denom2;
  }
  var frac;
  if (!rule) {
    var candidateClearance = numShift - numerm.depth - (denomm.height - denomShift);
    if (candidateClearance < clearance) {
      numShift += 0.5 * (clearance - candidateClearance);
      denomShift += 0.5 * (clearance - candidateClearance);
    }
    frac = buildCommon.makeVList({
      positionType: "individualShift",
      children: [{
        type: "elem",
        elem: denomm,
        shift: denomShift
      }, {
        type: "elem",
        elem: numerm,
        shift: -numShift
      }]
    }, options);
  } else {
    var axisHeight = options.fontMetrics().axisHeight;
    if (numShift - numerm.depth - (axisHeight + 0.5 * ruleWidth) < clearance) {
      numShift += clearance - (numShift - numerm.depth - (axisHeight + 0.5 * ruleWidth));
    }
    if (axisHeight - 0.5 * ruleWidth - (denomm.height - denomShift) < clearance) {
      denomShift += clearance - (axisHeight - 0.5 * ruleWidth - (denomm.height - denomShift));
    }
    var midShift = -(axisHeight - 0.5 * ruleWidth);
    frac = buildCommon.makeVList({
      positionType: "individualShift",
      children: [{
        type: "elem",
        elem: denomm,
        shift: denomShift
      }, {
        type: "elem",
        elem: rule,
        shift: midShift
      }, {
        type: "elem",
        elem: numerm,
        shift: -numShift
      }]
    }, options);
  }
  newOptions = options.havingStyle(style);
  frac.height *= newOptions.sizeMultiplier / options.sizeMultiplier;
  frac.depth *= newOptions.sizeMultiplier / options.sizeMultiplier;
  var delimSize;
  if (style.size === Style$1.DISPLAY.size) {
    delimSize = options.fontMetrics().delim1;
  } else if (style.size === Style$1.SCRIPTSCRIPT.size) {
    delimSize = options.havingStyle(Style$1.SCRIPT).fontMetrics().delim2;
  } else {
    delimSize = options.fontMetrics().delim2;
  }
  var leftDelim;
  var rightDelim;
  if (group2.leftDelim == null) {
    leftDelim = makeNullDelimiter(options, ["mopen"]);
  } else {
    leftDelim = delimiter.customSizedDelim(group2.leftDelim, delimSize, true, options.havingStyle(style), group2.mode, ["mopen"]);
  }
  if (group2.continued) {
    rightDelim = buildCommon.makeSpan([]);
  } else if (group2.rightDelim == null) {
    rightDelim = makeNullDelimiter(options, ["mclose"]);
  } else {
    rightDelim = delimiter.customSizedDelim(group2.rightDelim, delimSize, true, options.havingStyle(style), group2.mode, ["mclose"]);
  }
  return buildCommon.makeSpan(["mord"].concat(newOptions.sizingClasses(options)), [leftDelim, buildCommon.makeSpan(["mfrac"], [frac]), rightDelim], options);
};
var mathmlBuilder$3 = (group2, options) => {
  var node = new mathMLTree.MathNode("mfrac", [buildGroup2(group2.numer, options), buildGroup2(group2.denom, options)]);
  if (!group2.hasBarLine) {
    node.setAttribute("linethickness", "0px");
  } else if (group2.barSize) {
    var ruleWidth = calculateSize(group2.barSize, options);
    node.setAttribute("linethickness", makeEm(ruleWidth));
  }
  var style = adjustStyle(group2.size, options.style);
  if (style.size !== options.style.size) {
    node = new mathMLTree.MathNode("mstyle", [node]);
    var isDisplay = style.size === Style$1.DISPLAY.size ? "true" : "false";
    node.setAttribute("displaystyle", isDisplay);
    node.setAttribute("scriptlevel", "0");
  }
  if (group2.leftDelim != null || group2.rightDelim != null) {
    var withDelims = [];
    if (group2.leftDelim != null) {
      var leftOp = new mathMLTree.MathNode("mo", [new mathMLTree.TextNode(group2.leftDelim.replace("\\", ""))]);
      leftOp.setAttribute("fence", "true");
      withDelims.push(leftOp);
    }
    withDelims.push(node);
    if (group2.rightDelim != null) {
      var rightOp = new mathMLTree.MathNode("mo", [new mathMLTree.TextNode(group2.rightDelim.replace("\\", ""))]);
      rightOp.setAttribute("fence", "true");
      withDelims.push(rightOp);
    }
    return makeRow(withDelims);
  }
  return node;
};
defineFunction({
  type: "genfrac",
  names: [
    "\\dfrac",
    "\\frac",
    "\\tfrac",
    "\\dbinom",
    "\\binom",
    "\\tbinom",
    "\\\\atopfrac",
    // can’t be entered directly
    "\\\\bracefrac",
    "\\\\brackfrac"
    // ditto
  ],
  props: {
    numArgs: 2,
    allowedInArgument: true
  },
  handler: (_ref, args) => {
    var {
      parser,
      funcName
    } = _ref;
    var numer = args[0];
    var denom = args[1];
    var hasBarLine;
    var leftDelim = null;
    var rightDelim = null;
    var size = "auto";
    switch (funcName) {
      case "\\dfrac":
      case "\\frac":
      case "\\tfrac":
        hasBarLine = true;
        break;
      case "\\\\atopfrac":
        hasBarLine = false;
        break;
      case "\\dbinom":
      case "\\binom":
      case "\\tbinom":
        hasBarLine = false;
        leftDelim = "(";
        rightDelim = ")";
        break;
      case "\\\\bracefrac":
        hasBarLine = false;
        leftDelim = "\\{";
        rightDelim = "\\}";
        break;
      case "\\\\brackfrac":
        hasBarLine = false;
        leftDelim = "[";
        rightDelim = "]";
        break;
      default:
        throw new Error("Unrecognized genfrac command");
    }
    switch (funcName) {
      case "\\dfrac":
      case "\\dbinom":
        size = "display";
        break;
      case "\\tfrac":
      case "\\tbinom":
        size = "text";
        break;
    }
    return {
      type: "genfrac",
      mode: parser.mode,
      continued: false,
      numer,
      denom,
      hasBarLine,
      leftDelim,
      rightDelim,
      size,
      barSize: null
    };
  },
  htmlBuilder: htmlBuilder$4,
  mathmlBuilder: mathmlBuilder$3
});
defineFunction({
  type: "genfrac",
  names: ["\\cfrac"],
  props: {
    numArgs: 2
  },
  handler: (_ref2, args) => {
    var {
      parser,
      funcName
    } = _ref2;
    var numer = args[0];
    var denom = args[1];
    return {
      type: "genfrac",
      mode: parser.mode,
      continued: true,
      numer,
      denom,
      hasBarLine: true,
      leftDelim: null,
      rightDelim: null,
      size: "display",
      barSize: null
    };
  }
});
defineFunction({
  type: "infix",
  names: ["\\over", "\\choose", "\\atop", "\\brace", "\\brack"],
  props: {
    numArgs: 0,
    infix: true
  },
  handler(_ref3) {
    var {
      parser,
      funcName,
      token
    } = _ref3;
    var replaceWith;
    switch (funcName) {
      case "\\over":
        replaceWith = "\\frac";
        break;
      case "\\choose":
        replaceWith = "\\binom";
        break;
      case "\\atop":
        replaceWith = "\\\\atopfrac";
        break;
      case "\\brace":
        replaceWith = "\\\\bracefrac";
        break;
      case "\\brack":
        replaceWith = "\\\\brackfrac";
        break;
      default:
        throw new Error("Unrecognized infix genfrac command");
    }
    return {
      type: "infix",
      mode: parser.mode,
      replaceWith,
      token
    };
  }
});
var stylArray = ["display", "text", "script", "scriptscript"];
var delimFromValue = function delimFromValue2(delimString) {
  var delim = null;
  if (delimString.length > 0) {
    delim = delimString;
    delim = delim === "." ? null : delim;
  }
  return delim;
};
defineFunction({
  type: "genfrac",
  names: ["\\genfrac"],
  props: {
    numArgs: 6,
    allowedInArgument: true,
    argTypes: ["math", "math", "size", "text", "math", "math"]
  },
  handler(_ref4, args) {
    var {
      parser
    } = _ref4;
    var numer = args[4];
    var denom = args[5];
    var leftNode = normalizeArgument(args[0]);
    var leftDelim = leftNode.type === "atom" && leftNode.family === "open" ? delimFromValue(leftNode.text) : null;
    var rightNode = normalizeArgument(args[1]);
    var rightDelim = rightNode.type === "atom" && rightNode.family === "close" ? delimFromValue(rightNode.text) : null;
    var barNode = assertNodeType(args[2], "size");
    var hasBarLine;
    var barSize = null;
    if (barNode.isBlank) {
      hasBarLine = true;
    } else {
      barSize = barNode.value;
      hasBarLine = barSize.number > 0;
    }
    var size = "auto";
    var styl = args[3];
    if (styl.type === "ordgroup") {
      if (styl.body.length > 0) {
        var textOrd = assertNodeType(styl.body[0], "textord");
        size = stylArray[Number(textOrd.text)];
      }
    } else {
      styl = assertNodeType(styl, "textord");
      size = stylArray[Number(styl.text)];
    }
    return {
      type: "genfrac",
      mode: parser.mode,
      numer,
      denom,
      continued: false,
      hasBarLine,
      barSize,
      leftDelim,
      rightDelim,
      size
    };
  },
  htmlBuilder: htmlBuilder$4,
  mathmlBuilder: mathmlBuilder$3
});
defineFunction({
  type: "infix",
  names: ["\\above"],
  props: {
    numArgs: 1,
    argTypes: ["size"],
    infix: true
  },
  handler(_ref5, args) {
    var {
      parser,
      funcName,
      token
    } = _ref5;
    return {
      type: "infix",
      mode: parser.mode,
      replaceWith: "\\\\abovefrac",
      size: assertNodeType(args[0], "size").value,
      token
    };
  }
});
defineFunction({
  type: "genfrac",
  names: ["\\\\abovefrac"],
  props: {
    numArgs: 3,
    argTypes: ["math", "size", "math"]
  },
  handler: (_ref6, args) => {
    var {
      parser,
      funcName
    } = _ref6;
    var numer = args[0];
    var barSize = assert(assertNodeType(args[1], "infix").size);
    var denom = args[2];
    var hasBarLine = barSize.number > 0;
    return {
      type: "genfrac",
      mode: parser.mode,
      numer,
      denom,
      continued: false,
      hasBarLine,
      barSize,
      leftDelim: null,
      rightDelim: null,
      size: "auto"
    };
  },
  htmlBuilder: htmlBuilder$4,
  mathmlBuilder: mathmlBuilder$3
});
var htmlBuilder$3 = (grp, options) => {
  var style = options.style;
  var supSubGroup;
  var group2;
  if (grp.type === "supsub") {
    supSubGroup = grp.sup ? buildGroup$1(grp.sup, options.havingStyle(style.sup()), options) : buildGroup$1(grp.sub, options.havingStyle(style.sub()), options);
    group2 = assertNodeType(grp.base, "horizBrace");
  } else {
    group2 = assertNodeType(grp, "horizBrace");
  }
  var body = buildGroup$1(group2.base, options.havingBaseStyle(Style$1.DISPLAY));
  var braceBody = stretchy.svgSpan(group2, options);
  var vlist;
  if (group2.isOver) {
    vlist = buildCommon.makeVList({
      positionType: "firstBaseline",
      children: [{
        type: "elem",
        elem: body
      }, {
        type: "kern",
        size: 0.1
      }, {
        type: "elem",
        elem: braceBody
      }]
    }, options);
    vlist.children[0].children[0].children[1].classes.push("svg-align");
  } else {
    vlist = buildCommon.makeVList({
      positionType: "bottom",
      positionData: body.depth + 0.1 + braceBody.height,
      children: [{
        type: "elem",
        elem: braceBody
      }, {
        type: "kern",
        size: 0.1
      }, {
        type: "elem",
        elem: body
      }]
    }, options);
    vlist.children[0].children[0].children[0].classes.push("svg-align");
  }
  if (supSubGroup) {
    var vSpan = buildCommon.makeSpan(["mord", group2.isOver ? "mover" : "munder"], [vlist], options);
    if (group2.isOver) {
      vlist = buildCommon.makeVList({
        positionType: "firstBaseline",
        children: [{
          type: "elem",
          elem: vSpan
        }, {
          type: "kern",
          size: 0.2
        }, {
          type: "elem",
          elem: supSubGroup
        }]
      }, options);
    } else {
      vlist = buildCommon.makeVList({
        positionType: "bottom",
        positionData: vSpan.depth + 0.2 + supSubGroup.height + supSubGroup.depth,
        children: [{
          type: "elem",
          elem: supSubGroup
        }, {
          type: "kern",
          size: 0.2
        }, {
          type: "elem",
          elem: vSpan
        }]
      }, options);
    }
  }
  return buildCommon.makeSpan(["mord", group2.isOver ? "mover" : "munder"], [vlist], options);
};
var mathmlBuilder$2 = (group2, options) => {
  var accentNode = stretchy.mathMLnode(group2.label);
  return new mathMLTree.MathNode(group2.isOver ? "mover" : "munder", [buildGroup2(group2.base, options), accentNode]);
};
defineFunction({
  type: "horizBrace",
  names: ["\\overbrace", "\\underbrace"],
  props: {
    numArgs: 1
  },
  handler(_ref, args) {
    var {
      parser,
      funcName
    } = _ref;
    return {
      type: "horizBrace",
      mode: parser.mode,
      label: funcName,
      isOver: /^\\over/.test(funcName),
      base: args[0]
    };
  },
  htmlBuilder: htmlBuilder$3,
  mathmlBuilder: mathmlBuilder$2
});
defineFunction({
  type: "href",
  names: ["\\href"],
  props: {
    numArgs: 2,
    argTypes: ["url", "original"],
    allowedInText: true
  },
  handler: (_ref, args) => {
    var {
      parser
    } = _ref;
    var body = args[1];
    var href = assertNodeType(args[0], "url").url;
    if (!parser.settings.isTrusted({
      command: "\\href",
      url: href
    })) {
      return parser.formatUnsupportedCmd("\\href");
    }
    return {
      type: "href",
      mode: parser.mode,
      href,
      body: ordargument(body)
    };
  },
  htmlBuilder: (group2, options) => {
    var elements = buildExpression$1(group2.body, options, false);
    return buildCommon.makeAnchor(group2.href, [], elements, options);
  },
  mathmlBuilder: (group2, options) => {
    var math2 = buildExpressionRow(group2.body, options);
    if (!(math2 instanceof MathNode)) {
      math2 = new MathNode("mrow", [math2]);
    }
    math2.setAttribute("href", group2.href);
    return math2;
  }
});
defineFunction({
  type: "href",
  names: ["\\url"],
  props: {
    numArgs: 1,
    argTypes: ["url"],
    allowedInText: true
  },
  handler: (_ref2, args) => {
    var {
      parser
    } = _ref2;
    var href = assertNodeType(args[0], "url").url;
    if (!parser.settings.isTrusted({
      command: "\\url",
      url: href
    })) {
      return parser.formatUnsupportedCmd("\\url");
    }
    var chars = [];
    for (var i2 = 0; i2 < href.length; i2++) {
      var c = href[i2];
      if (c === "~") {
        c = "\\textasciitilde";
      }
      chars.push({
        type: "textord",
        mode: "text",
        text: c
      });
    }
    var body = {
      type: "text",
      mode: parser.mode,
      font: "\\texttt",
      body: chars
    };
    return {
      type: "href",
      mode: parser.mode,
      href,
      body: ordargument(body)
    };
  }
});
defineFunction({
  type: "hbox",
  names: ["\\hbox"],
  props: {
    numArgs: 1,
    argTypes: ["text"],
    allowedInText: true,
    primitive: true
  },
  handler(_ref, args) {
    var {
      parser
    } = _ref;
    return {
      type: "hbox",
      mode: parser.mode,
      body: ordargument(args[0])
    };
  },
  htmlBuilder(group2, options) {
    var elements = buildExpression$1(group2.body, options, false);
    return buildCommon.makeFragment(elements);
  },
  mathmlBuilder(group2, options) {
    return new mathMLTree.MathNode("mrow", buildExpression2(group2.body, options));
  }
});
defineFunction({
  type: "html",
  names: ["\\htmlClass", "\\htmlId", "\\htmlStyle", "\\htmlData"],
  props: {
    numArgs: 2,
    argTypes: ["raw", "original"],
    allowedInText: true
  },
  handler: (_ref, args) => {
    var {
      parser,
      funcName,
      token
    } = _ref;
    var value = assertNodeType(args[0], "raw").string;
    var body = args[1];
    if (parser.settings.strict) {
      parser.settings.reportNonstrict("htmlExtension", "HTML extension is disabled on strict mode");
    }
    var trustContext;
    var attributes = {};
    switch (funcName) {
      case "\\htmlClass":
        attributes.class = value;
        trustContext = {
          command: "\\htmlClass",
          class: value
        };
        break;
      case "\\htmlId":
        attributes.id = value;
        trustContext = {
          command: "\\htmlId",
          id: value
        };
        break;
      case "\\htmlStyle":
        attributes.style = value;
        trustContext = {
          command: "\\htmlStyle",
          style: value
        };
        break;
      case "\\htmlData": {
        var data = value.split(",");
        for (var i2 = 0; i2 < data.length; i2++) {
          var keyVal = data[i2].split("=");
          if (keyVal.length !== 2) {
            throw new ParseError("Error parsing key-value for \\htmlData");
          }
          attributes["data-" + keyVal[0].trim()] = keyVal[1].trim();
        }
        trustContext = {
          command: "\\htmlData",
          attributes
        };
        break;
      }
      default:
        throw new Error("Unrecognized html command");
    }
    if (!parser.settings.isTrusted(trustContext)) {
      return parser.formatUnsupportedCmd(funcName);
    }
    return {
      type: "html",
      mode: parser.mode,
      attributes,
      body: ordargument(body)
    };
  },
  htmlBuilder: (group2, options) => {
    var elements = buildExpression$1(group2.body, options, false);
    var classes = ["enclosing"];
    if (group2.attributes.class) {
      classes.push(...group2.attributes.class.trim().split(/\s+/));
    }
    var span2 = buildCommon.makeSpan(classes, elements, options);
    for (var attr in group2.attributes) {
      if (attr !== "class" && group2.attributes.hasOwnProperty(attr)) {
        span2.setAttribute(attr, group2.attributes[attr]);
      }
    }
    return span2;
  },
  mathmlBuilder: (group2, options) => {
    return buildExpressionRow(group2.body, options);
  }
});
defineFunction({
  type: "htmlmathml",
  names: ["\\html@mathml"],
  props: {
    numArgs: 2,
    allowedInText: true
  },
  handler: (_ref, args) => {
    var {
      parser
    } = _ref;
    return {
      type: "htmlmathml",
      mode: parser.mode,
      html: ordargument(args[0]),
      mathml: ordargument(args[1])
    };
  },
  htmlBuilder: (group2, options) => {
    var elements = buildExpression$1(group2.html, options, false);
    return buildCommon.makeFragment(elements);
  },
  mathmlBuilder: (group2, options) => {
    return buildExpressionRow(group2.mathml, options);
  }
});
var sizeData = function sizeData2(str) {
  if (/^[-+]? *(\d+(\.\d*)?|\.\d+)$/.test(str)) {
    return {
      number: +str,
      unit: "bp"
    };
  } else {
    var match = /([-+]?) *(\d+(?:\.\d*)?|\.\d+) *([a-z]{2})/.exec(str);
    if (!match) {
      throw new ParseError("Invalid size: '" + str + "' in \\includegraphics");
    }
    var data = {
      number: +(match[1] + match[2]),
      // sign + magnitude, cast to number
      unit: match[3]
    };
    if (!validUnit(data)) {
      throw new ParseError("Invalid unit: '" + data.unit + "' in \\includegraphics.");
    }
    return data;
  }
};
defineFunction({
  type: "includegraphics",
  names: ["\\includegraphics"],
  props: {
    numArgs: 1,
    numOptionalArgs: 1,
    argTypes: ["raw", "url"],
    allowedInText: false
  },
  handler: (_ref, args, optArgs) => {
    var {
      parser
    } = _ref;
    var width = {
      number: 0,
      unit: "em"
    };
    var height = {
      number: 0.9,
      unit: "em"
    };
    var totalheight = {
      number: 0,
      unit: "em"
    };
    var alt = "";
    if (optArgs[0]) {
      var attributeStr = assertNodeType(optArgs[0], "raw").string;
      var attributes = attributeStr.split(",");
      for (var i2 = 0; i2 < attributes.length; i2++) {
        var keyVal = attributes[i2].split("=");
        if (keyVal.length === 2) {
          var str = keyVal[1].trim();
          switch (keyVal[0].trim()) {
            case "alt":
              alt = str;
              break;
            case "width":
              width = sizeData(str);
              break;
            case "height":
              height = sizeData(str);
              break;
            case "totalheight":
              totalheight = sizeData(str);
              break;
            default:
              throw new ParseError("Invalid key: '" + keyVal[0] + "' in \\includegraphics.");
          }
        }
      }
    }
    var src = assertNodeType(args[0], "url").url;
    if (alt === "") {
      alt = src;
      alt = alt.replace(/^.*[\\/]/, "");
      alt = alt.substring(0, alt.lastIndexOf("."));
    }
    if (!parser.settings.isTrusted({
      command: "\\includegraphics",
      url: src
    })) {
      return parser.formatUnsupportedCmd("\\includegraphics");
    }
    return {
      type: "includegraphics",
      mode: parser.mode,
      alt,
      width,
      height,
      totalheight,
      src
    };
  },
  htmlBuilder: (group2, options) => {
    var height = calculateSize(group2.height, options);
    var depth = 0;
    if (group2.totalheight.number > 0) {
      depth = calculateSize(group2.totalheight, options) - height;
    }
    var width = 0;
    if (group2.width.number > 0) {
      width = calculateSize(group2.width, options);
    }
    var style = {
      height: makeEm(height + depth)
    };
    if (width > 0) {
      style.width = makeEm(width);
    }
    if (depth > 0) {
      style.verticalAlign = makeEm(-depth);
    }
    var node = new Img(group2.src, group2.alt, style);
    node.height = height;
    node.depth = depth;
    return node;
  },
  mathmlBuilder: (group2, options) => {
    var node = new mathMLTree.MathNode("mglyph", []);
    node.setAttribute("alt", group2.alt);
    var height = calculateSize(group2.height, options);
    var depth = 0;
    if (group2.totalheight.number > 0) {
      depth = calculateSize(group2.totalheight, options) - height;
      node.setAttribute("valign", makeEm(-depth));
    }
    node.setAttribute("height", makeEm(height + depth));
    if (group2.width.number > 0) {
      var width = calculateSize(group2.width, options);
      node.setAttribute("width", makeEm(width));
    }
    node.setAttribute("src", group2.src);
    return node;
  }
});
defineFunction({
  type: "kern",
  names: ["\\kern", "\\mkern", "\\hskip", "\\mskip"],
  props: {
    numArgs: 1,
    argTypes: ["size"],
    primitive: true,
    allowedInText: true
  },
  handler(_ref, args) {
    var {
      parser,
      funcName
    } = _ref;
    var size = assertNodeType(args[0], "size");
    if (parser.settings.strict) {
      var mathFunction = funcName[1] === "m";
      var muUnit = size.value.unit === "mu";
      if (mathFunction) {
        if (!muUnit) {
          parser.settings.reportNonstrict("mathVsTextUnits", "LaTeX's " + funcName + " supports only mu units, " + ("not " + size.value.unit + " units"));
        }
        if (parser.mode !== "math") {
          parser.settings.reportNonstrict("mathVsTextUnits", "LaTeX's " + funcName + " works only in math mode");
        }
      } else {
        if (muUnit) {
          parser.settings.reportNonstrict("mathVsTextUnits", "LaTeX's " + funcName + " doesn't support mu units");
        }
      }
    }
    return {
      type: "kern",
      mode: parser.mode,
      dimension: size.value
    };
  },
  htmlBuilder(group2, options) {
    return buildCommon.makeGlue(group2.dimension, options);
  },
  mathmlBuilder(group2, options) {
    var dimension = calculateSize(group2.dimension, options);
    return new mathMLTree.SpaceNode(dimension);
  }
});
defineFunction({
  type: "lap",
  names: ["\\mathllap", "\\mathrlap", "\\mathclap"],
  props: {
    numArgs: 1,
    allowedInText: true
  },
  handler: (_ref, args) => {
    var {
      parser,
      funcName
    } = _ref;
    var body = args[0];
    return {
      type: "lap",
      mode: parser.mode,
      alignment: funcName.slice(5),
      body
    };
  },
  htmlBuilder: (group2, options) => {
    var inner2;
    if (group2.alignment === "clap") {
      inner2 = buildCommon.makeSpan([], [buildGroup$1(group2.body, options)]);
      inner2 = buildCommon.makeSpan(["inner"], [inner2], options);
    } else {
      inner2 = buildCommon.makeSpan(["inner"], [buildGroup$1(group2.body, options)]);
    }
    var fix = buildCommon.makeSpan(["fix"], []);
    var node = buildCommon.makeSpan([group2.alignment], [inner2, fix], options);
    var strut = buildCommon.makeSpan(["strut"]);
    strut.style.height = makeEm(node.height + node.depth);
    if (node.depth) {
      strut.style.verticalAlign = makeEm(-node.depth);
    }
    node.children.unshift(strut);
    node = buildCommon.makeSpan(["thinbox"], [node], options);
    return buildCommon.makeSpan(["mord", "vbox"], [node], options);
  },
  mathmlBuilder: (group2, options) => {
    var node = new mathMLTree.MathNode("mpadded", [buildGroup2(group2.body, options)]);
    if (group2.alignment !== "rlap") {
      var offset = group2.alignment === "llap" ? "-1" : "-0.5";
      node.setAttribute("lspace", offset + "width");
    }
    node.setAttribute("width", "0px");
    return node;
  }
});
defineFunction({
  type: "styling",
  names: ["\\(", "$"],
  props: {
    numArgs: 0,
    allowedInText: true,
    allowedInMath: false
  },
  handler(_ref, args) {
    var {
      funcName,
      parser
    } = _ref;
    var outerMode = parser.mode;
    parser.switchMode("math");
    var close2 = funcName === "\\(" ? "\\)" : "$";
    var body = parser.parseExpression(false, close2);
    parser.expect(close2);
    parser.switchMode(outerMode);
    return {
      type: "styling",
      mode: parser.mode,
      style: "text",
      body
    };
  }
});
defineFunction({
  type: "text",
  // Doesn't matter what this is.
  names: ["\\)", "\\]"],
  props: {
    numArgs: 0,
    allowedInText: true,
    allowedInMath: false
  },
  handler(context, args) {
    throw new ParseError("Mismatched " + context.funcName);
  }
});
var chooseMathStyle = (group2, options) => {
  switch (options.style.size) {
    case Style$1.DISPLAY.size:
      return group2.display;
    case Style$1.TEXT.size:
      return group2.text;
    case Style$1.SCRIPT.size:
      return group2.script;
    case Style$1.SCRIPTSCRIPT.size:
      return group2.scriptscript;
    default:
      return group2.text;
  }
};
defineFunction({
  type: "mathchoice",
  names: ["\\mathchoice"],
  props: {
    numArgs: 4,
    primitive: true
  },
  handler: (_ref, args) => {
    var {
      parser
    } = _ref;
    return {
      type: "mathchoice",
      mode: parser.mode,
      display: ordargument(args[0]),
      text: ordargument(args[1]),
      script: ordargument(args[2]),
      scriptscript: ordargument(args[3])
    };
  },
  htmlBuilder: (group2, options) => {
    var body = chooseMathStyle(group2, options);
    var elements = buildExpression$1(body, options, false);
    return buildCommon.makeFragment(elements);
  },
  mathmlBuilder: (group2, options) => {
    var body = chooseMathStyle(group2, options);
    return buildExpressionRow(body, options);
  }
});
var assembleSupSub = (base, supGroup, subGroup, options, style, slant, baseShift) => {
  base = buildCommon.makeSpan([], [base]);
  var subIsSingleCharacter = subGroup && utils.isCharacterBox(subGroup);
  var sub2;
  var sup2;
  if (supGroup) {
    var elem = buildGroup$1(supGroup, options.havingStyle(style.sup()), options);
    sup2 = {
      elem,
      kern: Math.max(options.fontMetrics().bigOpSpacing1, options.fontMetrics().bigOpSpacing3 - elem.depth)
    };
  }
  if (subGroup) {
    var _elem = buildGroup$1(subGroup, options.havingStyle(style.sub()), options);
    sub2 = {
      elem: _elem,
      kern: Math.max(options.fontMetrics().bigOpSpacing2, options.fontMetrics().bigOpSpacing4 - _elem.height)
    };
  }
  var finalGroup;
  if (sup2 && sub2) {
    var bottom = options.fontMetrics().bigOpSpacing5 + sub2.elem.height + sub2.elem.depth + sub2.kern + base.depth + baseShift;
    finalGroup = buildCommon.makeVList({
      positionType: "bottom",
      positionData: bottom,
      children: [{
        type: "kern",
        size: options.fontMetrics().bigOpSpacing5
      }, {
        type: "elem",
        elem: sub2.elem,
        marginLeft: makeEm(-slant)
      }, {
        type: "kern",
        size: sub2.kern
      }, {
        type: "elem",
        elem: base
      }, {
        type: "kern",
        size: sup2.kern
      }, {
        type: "elem",
        elem: sup2.elem,
        marginLeft: makeEm(slant)
      }, {
        type: "kern",
        size: options.fontMetrics().bigOpSpacing5
      }]
    }, options);
  } else if (sub2) {
    var top = base.height - baseShift;
    finalGroup = buildCommon.makeVList({
      positionType: "top",
      positionData: top,
      children: [{
        type: "kern",
        size: options.fontMetrics().bigOpSpacing5
      }, {
        type: "elem",
        elem: sub2.elem,
        marginLeft: makeEm(-slant)
      }, {
        type: "kern",
        size: sub2.kern
      }, {
        type: "elem",
        elem: base
      }]
    }, options);
  } else if (sup2) {
    var _bottom = base.depth + baseShift;
    finalGroup = buildCommon.makeVList({
      positionType: "bottom",
      positionData: _bottom,
      children: [{
        type: "elem",
        elem: base
      }, {
        type: "kern",
        size: sup2.kern
      }, {
        type: "elem",
        elem: sup2.elem,
        marginLeft: makeEm(slant)
      }, {
        type: "kern",
        size: options.fontMetrics().bigOpSpacing5
      }]
    }, options);
  } else {
    return base;
  }
  var parts = [finalGroup];
  if (sub2 && slant !== 0 && !subIsSingleCharacter) {
    var spacer = buildCommon.makeSpan(["mspace"], [], options);
    spacer.style.marginRight = makeEm(slant);
    parts.unshift(spacer);
  }
  return buildCommon.makeSpan(["mop", "op-limits"], parts, options);
};
var noSuccessor = ["\\smallint"];
var htmlBuilder$2 = (grp, options) => {
  var supGroup;
  var subGroup;
  var hasLimits = false;
  var group2;
  if (grp.type === "supsub") {
    supGroup = grp.sup;
    subGroup = grp.sub;
    group2 = assertNodeType(grp.base, "op");
    hasLimits = true;
  } else {
    group2 = assertNodeType(grp, "op");
  }
  var style = options.style;
  var large = false;
  if (style.size === Style$1.DISPLAY.size && group2.symbol && !utils.contains(noSuccessor, group2.name)) {
    large = true;
  }
  var base;
  if (group2.symbol) {
    var fontName = large ? "Size2-Regular" : "Size1-Regular";
    var stash = "";
    if (group2.name === "\\oiint" || group2.name === "\\oiiint") {
      stash = group2.name.slice(1);
      group2.name = stash === "oiint" ? "\\iint" : "\\iiint";
    }
    base = buildCommon.makeSymbol(group2.name, fontName, "math", options, ["mop", "op-symbol", large ? "large-op" : "small-op"]);
    if (stash.length > 0) {
      var italic = base.italic;
      var oval = buildCommon.staticSvg(stash + "Size" + (large ? "2" : "1"), options);
      base = buildCommon.makeVList({
        positionType: "individualShift",
        children: [{
          type: "elem",
          elem: base,
          shift: 0
        }, {
          type: "elem",
          elem: oval,
          shift: large ? 0.08 : 0
        }]
      }, options);
      group2.name = "\\" + stash;
      base.classes.unshift("mop");
      base.italic = italic;
    }
  } else if (group2.body) {
    var inner2 = buildExpression$1(group2.body, options, true);
    if (inner2.length === 1 && inner2[0] instanceof SymbolNode) {
      base = inner2[0];
      base.classes[0] = "mop";
    } else {
      base = buildCommon.makeSpan(["mop"], inner2, options);
    }
  } else {
    var output = [];
    for (var i2 = 1; i2 < group2.name.length; i2++) {
      output.push(buildCommon.mathsym(group2.name[i2], group2.mode, options));
    }
    base = buildCommon.makeSpan(["mop"], output, options);
  }
  var baseShift = 0;
  var slant = 0;
  if ((base instanceof SymbolNode || group2.name === "\\oiint" || group2.name === "\\oiiint") && !group2.suppressBaseShift) {
    baseShift = (base.height - base.depth) / 2 - options.fontMetrics().axisHeight;
    slant = base.italic;
  }
  if (hasLimits) {
    return assembleSupSub(base, supGroup, subGroup, options, style, slant, baseShift);
  } else {
    if (baseShift) {
      base.style.position = "relative";
      base.style.top = makeEm(baseShift);
    }
    return base;
  }
};
var mathmlBuilder$1 = (group2, options) => {
  var node;
  if (group2.symbol) {
    node = new MathNode("mo", [makeText(group2.name, group2.mode)]);
    if (utils.contains(noSuccessor, group2.name)) {
      node.setAttribute("largeop", "false");
    }
  } else if (group2.body) {
    node = new MathNode("mo", buildExpression2(group2.body, options));
  } else {
    node = new MathNode("mi", [new TextNode(group2.name.slice(1))]);
    var operator = new MathNode("mo", [makeText("\u2061", "text")]);
    if (group2.parentIsSupSub) {
      node = new MathNode("mrow", [node, operator]);
    } else {
      node = newDocumentFragment([node, operator]);
    }
  }
  return node;
};
var singleCharBigOps = {
  "\u220F": "\\prod",
  "\u2210": "\\coprod",
  "\u2211": "\\sum",
  "\u22C0": "\\bigwedge",
  "\u22C1": "\\bigvee",
  "\u22C2": "\\bigcap",
  "\u22C3": "\\bigcup",
  "\u2A00": "\\bigodot",
  "\u2A01": "\\bigoplus",
  "\u2A02": "\\bigotimes",
  "\u2A04": "\\biguplus",
  "\u2A06": "\\bigsqcup"
};
defineFunction({
  type: "op",
  names: ["\\coprod", "\\bigvee", "\\bigwedge", "\\biguplus", "\\bigcap", "\\bigcup", "\\intop", "\\prod", "\\sum", "\\bigotimes", "\\bigoplus", "\\bigodot", "\\bigsqcup", "\\smallint", "\u220F", "\u2210", "\u2211", "\u22C0", "\u22C1", "\u22C2", "\u22C3", "\u2A00", "\u2A01", "\u2A02", "\u2A04", "\u2A06"],
  props: {
    numArgs: 0
  },
  handler: (_ref, args) => {
    var {
      parser,
      funcName
    } = _ref;
    var fName = funcName;
    if (fName.length === 1) {
      fName = singleCharBigOps[fName];
    }
    return {
      type: "op",
      mode: parser.mode,
      limits: true,
      parentIsSupSub: false,
      symbol: true,
      name: fName
    };
  },
  htmlBuilder: htmlBuilder$2,
  mathmlBuilder: mathmlBuilder$1
});
defineFunction({
  type: "op",
  names: ["\\mathop"],
  props: {
    numArgs: 1,
    primitive: true
  },
  handler: (_ref2, args) => {
    var {
      parser
    } = _ref2;
    var body = args[0];
    return {
      type: "op",
      mode: parser.mode,
      limits: false,
      parentIsSupSub: false,
      symbol: false,
      body: ordargument(body)
    };
  },
  htmlBuilder: htmlBuilder$2,
  mathmlBuilder: mathmlBuilder$1
});
var singleCharIntegrals = {
  "\u222B": "\\int",
  "\u222C": "\\iint",
  "\u222D": "\\iiint",
  "\u222E": "\\oint",
  "\u222F": "\\oiint",
  "\u2230": "\\oiiint"
};
defineFunction({
  type: "op",
  names: ["\\arcsin", "\\arccos", "\\arctan", "\\arctg", "\\arcctg", "\\arg", "\\ch", "\\cos", "\\cosec", "\\cosh", "\\cot", "\\cotg", "\\coth", "\\csc", "\\ctg", "\\cth", "\\deg", "\\dim", "\\exp", "\\hom", "\\ker", "\\lg", "\\ln", "\\log", "\\sec", "\\sin", "\\sinh", "\\sh", "\\tan", "\\tanh", "\\tg", "\\th"],
  props: {
    numArgs: 0
  },
  handler(_ref3) {
    var {
      parser,
      funcName
    } = _ref3;
    return {
      type: "op",
      mode: parser.mode,
      limits: false,
      parentIsSupSub: false,
      symbol: false,
      name: funcName
    };
  },
  htmlBuilder: htmlBuilder$2,
  mathmlBuilder: mathmlBuilder$1
});
defineFunction({
  type: "op",
  names: ["\\det", "\\gcd", "\\inf", "\\lim", "\\max", "\\min", "\\Pr", "\\sup"],
  props: {
    numArgs: 0
  },
  handler(_ref4) {
    var {
      parser,
      funcName
    } = _ref4;
    return {
      type: "op",
      mode: parser.mode,
      limits: true,
      parentIsSupSub: false,
      symbol: false,
      name: funcName
    };
  },
  htmlBuilder: htmlBuilder$2,
  mathmlBuilder: mathmlBuilder$1
});
defineFunction({
  type: "op",
  names: ["\\int", "\\iint", "\\iiint", "\\oint", "\\oiint", "\\oiiint", "\u222B", "\u222C", "\u222D", "\u222E", "\u222F", "\u2230"],
  props: {
    numArgs: 0
  },
  handler(_ref5) {
    var {
      parser,
      funcName
    } = _ref5;
    var fName = funcName;
    if (fName.length === 1) {
      fName = singleCharIntegrals[fName];
    }
    return {
      type: "op",
      mode: parser.mode,
      limits: false,
      parentIsSupSub: false,
      symbol: true,
      name: fName
    };
  },
  htmlBuilder: htmlBuilder$2,
  mathmlBuilder: mathmlBuilder$1
});
var htmlBuilder$1 = (grp, options) => {
  var supGroup;
  var subGroup;
  var hasLimits = false;
  var group2;
  if (grp.type === "supsub") {
    supGroup = grp.sup;
    subGroup = grp.sub;
    group2 = assertNodeType(grp.base, "operatorname");
    hasLimits = true;
  } else {
    group2 = assertNodeType(grp, "operatorname");
  }
  var base;
  if (group2.body.length > 0) {
    var body = group2.body.map((child2) => {
      var childText = child2.text;
      if (typeof childText === "string") {
        return {
          type: "textord",
          mode: child2.mode,
          text: childText
        };
      } else {
        return child2;
      }
    });
    var expression = buildExpression$1(body, options.withFont("mathrm"), true);
    for (var i2 = 0; i2 < expression.length; i2++) {
      var child = expression[i2];
      if (child instanceof SymbolNode) {
        child.text = child.text.replace(/\u2212/, "-").replace(/\u2217/, "*");
      }
    }
    base = buildCommon.makeSpan(["mop"], expression, options);
  } else {
    base = buildCommon.makeSpan(["mop"], [], options);
  }
  if (hasLimits) {
    return assembleSupSub(base, supGroup, subGroup, options, options.style, 0, 0);
  } else {
    return base;
  }
};
var mathmlBuilder2 = (group2, options) => {
  var expression = buildExpression2(group2.body, options.withFont("mathrm"));
  var isAllString = true;
  for (var i2 = 0; i2 < expression.length; i2++) {
    var node = expression[i2];
    if (node instanceof mathMLTree.SpaceNode) ;
    else if (node instanceof mathMLTree.MathNode) {
      switch (node.type) {
        case "mi":
        case "mn":
        case "ms":
        case "mspace":
        case "mtext":
          break;
        // Do nothing yet.
        case "mo": {
          var child = node.children[0];
          if (node.children.length === 1 && child instanceof mathMLTree.TextNode) {
            child.text = child.text.replace(/\u2212/, "-").replace(/\u2217/, "*");
          } else {
            isAllString = false;
          }
          break;
        }
        default:
          isAllString = false;
      }
    } else {
      isAllString = false;
    }
  }
  if (isAllString) {
    var word = expression.map((node2) => node2.toText()).join("");
    expression = [new mathMLTree.TextNode(word)];
  }
  var identifier = new mathMLTree.MathNode("mi", expression);
  identifier.setAttribute("mathvariant", "normal");
  var operator = new mathMLTree.MathNode("mo", [makeText("\u2061", "text")]);
  if (group2.parentIsSupSub) {
    return new mathMLTree.MathNode("mrow", [identifier, operator]);
  } else {
    return mathMLTree.newDocumentFragment([identifier, operator]);
  }
};
defineFunction({
  type: "operatorname",
  names: ["\\operatorname@", "\\operatornamewithlimits"],
  props: {
    numArgs: 1
  },
  handler: (_ref, args) => {
    var {
      parser,
      funcName
    } = _ref;
    var body = args[0];
    return {
      type: "operatorname",
      mode: parser.mode,
      body: ordargument(body),
      alwaysHandleSupSub: funcName === "\\operatornamewithlimits",
      limits: false,
      parentIsSupSub: false
    };
  },
  htmlBuilder: htmlBuilder$1,
  mathmlBuilder: mathmlBuilder2
});
defineMacro("\\operatorname", "\\@ifstar\\operatornamewithlimits\\operatorname@");
defineFunctionBuilders({
  type: "ordgroup",
  htmlBuilder(group2, options) {
    if (group2.semisimple) {
      return buildCommon.makeFragment(buildExpression$1(group2.body, options, false));
    }
    return buildCommon.makeSpan(["mord"], buildExpression$1(group2.body, options, true), options);
  },
  mathmlBuilder(group2, options) {
    return buildExpressionRow(group2.body, options, true);
  }
});
defineFunction({
  type: "overline",
  names: ["\\overline"],
  props: {
    numArgs: 1
  },
  handler(_ref, args) {
    var {
      parser
    } = _ref;
    var body = args[0];
    return {
      type: "overline",
      mode: parser.mode,
      body
    };
  },
  htmlBuilder(group2, options) {
    var innerGroup = buildGroup$1(group2.body, options.havingCrampedStyle());
    var line = buildCommon.makeLineSpan("overline-line", options);
    var defaultRuleThickness = options.fontMetrics().defaultRuleThickness;
    var vlist = buildCommon.makeVList({
      positionType: "firstBaseline",
      children: [{
        type: "elem",
        elem: innerGroup
      }, {
        type: "kern",
        size: 3 * defaultRuleThickness
      }, {
        type: "elem",
        elem: line
      }, {
        type: "kern",
        size: defaultRuleThickness
      }]
    }, options);
    return buildCommon.makeSpan(["mord", "overline"], [vlist], options);
  },
  mathmlBuilder(group2, options) {
    var operator = new mathMLTree.MathNode("mo", [new mathMLTree.TextNode("\u203E")]);
    operator.setAttribute("stretchy", "true");
    var node = new mathMLTree.MathNode("mover", [buildGroup2(group2.body, options), operator]);
    node.setAttribute("accent", "true");
    return node;
  }
});
defineFunction({
  type: "phantom",
  names: ["\\phantom"],
  props: {
    numArgs: 1,
    allowedInText: true
  },
  handler: (_ref, args) => {
    var {
      parser
    } = _ref;
    var body = args[0];
    return {
      type: "phantom",
      mode: parser.mode,
      body: ordargument(body)
    };
  },
  htmlBuilder: (group2, options) => {
    var elements = buildExpression$1(group2.body, options.withPhantom(), false);
    return buildCommon.makeFragment(elements);
  },
  mathmlBuilder: (group2, options) => {
    var inner2 = buildExpression2(group2.body, options);
    return new mathMLTree.MathNode("mphantom", inner2);
  }
});
defineFunction({
  type: "hphantom",
  names: ["\\hphantom"],
  props: {
    numArgs: 1,
    allowedInText: true
  },
  handler: (_ref2, args) => {
    var {
      parser
    } = _ref2;
    var body = args[0];
    return {
      type: "hphantom",
      mode: parser.mode,
      body
    };
  },
  htmlBuilder: (group2, options) => {
    var node = buildCommon.makeSpan([], [buildGroup$1(group2.body, options.withPhantom())]);
    node.height = 0;
    node.depth = 0;
    if (node.children) {
      for (var i2 = 0; i2 < node.children.length; i2++) {
        node.children[i2].height = 0;
        node.children[i2].depth = 0;
      }
    }
    node = buildCommon.makeVList({
      positionType: "firstBaseline",
      children: [{
        type: "elem",
        elem: node
      }]
    }, options);
    return buildCommon.makeSpan(["mord"], [node], options);
  },
  mathmlBuilder: (group2, options) => {
    var inner2 = buildExpression2(ordargument(group2.body), options);
    var phantom = new mathMLTree.MathNode("mphantom", inner2);
    var node = new mathMLTree.MathNode("mpadded", [phantom]);
    node.setAttribute("height", "0px");
    node.setAttribute("depth", "0px");
    return node;
  }
});
defineFunction({
  type: "vphantom",
  names: ["\\vphantom"],
  props: {
    numArgs: 1,
    allowedInText: true
  },
  handler: (_ref3, args) => {
    var {
      parser
    } = _ref3;
    var body = args[0];
    return {
      type: "vphantom",
      mode: parser.mode,
      body
    };
  },
  htmlBuilder: (group2, options) => {
    var inner2 = buildCommon.makeSpan(["inner"], [buildGroup$1(group2.body, options.withPhantom())]);
    var fix = buildCommon.makeSpan(["fix"], []);
    return buildCommon.makeSpan(["mord", "rlap"], [inner2, fix], options);
  },
  mathmlBuilder: (group2, options) => {
    var inner2 = buildExpression2(ordargument(group2.body), options);
    var phantom = new mathMLTree.MathNode("mphantom", inner2);
    var node = new mathMLTree.MathNode("mpadded", [phantom]);
    node.setAttribute("width", "0px");
    return node;
  }
});
defineFunction({
  type: "raisebox",
  names: ["\\raisebox"],
  props: {
    numArgs: 2,
    argTypes: ["size", "hbox"],
    allowedInText: true
  },
  handler(_ref, args) {
    var {
      parser
    } = _ref;
    var amount = assertNodeType(args[0], "size").value;
    var body = args[1];
    return {
      type: "raisebox",
      mode: parser.mode,
      dy: amount,
      body
    };
  },
  htmlBuilder(group2, options) {
    var body = buildGroup$1(group2.body, options);
    var dy = calculateSize(group2.dy, options);
    return buildCommon.makeVList({
      positionType: "shift",
      positionData: -dy,
      children: [{
        type: "elem",
        elem: body
      }]
    }, options);
  },
  mathmlBuilder(group2, options) {
    var node = new mathMLTree.MathNode("mpadded", [buildGroup2(group2.body, options)]);
    var dy = group2.dy.number + group2.dy.unit;
    node.setAttribute("voffset", dy);
    return node;
  }
});
defineFunction({
  type: "internal",
  names: ["\\relax"],
  props: {
    numArgs: 0,
    allowedInText: true,
    allowedInArgument: true
  },
  handler(_ref) {
    var {
      parser
    } = _ref;
    return {
      type: "internal",
      mode: parser.mode
    };
  }
});
defineFunction({
  type: "rule",
  names: ["\\rule"],
  props: {
    numArgs: 2,
    numOptionalArgs: 1,
    allowedInText: true,
    allowedInMath: true,
    argTypes: ["size", "size", "size"]
  },
  handler(_ref, args, optArgs) {
    var {
      parser
    } = _ref;
    var shift = optArgs[0];
    var width = assertNodeType(args[0], "size");
    var height = assertNodeType(args[1], "size");
    return {
      type: "rule",
      mode: parser.mode,
      shift: shift && assertNodeType(shift, "size").value,
      width: width.value,
      height: height.value
    };
  },
  htmlBuilder(group2, options) {
    var rule = buildCommon.makeSpan(["mord", "rule"], [], options);
    var width = calculateSize(group2.width, options);
    var height = calculateSize(group2.height, options);
    var shift = group2.shift ? calculateSize(group2.shift, options) : 0;
    rule.style.borderRightWidth = makeEm(width);
    rule.style.borderTopWidth = makeEm(height);
    rule.style.bottom = makeEm(shift);
    rule.width = width;
    rule.height = height + shift;
    rule.depth = -shift;
    rule.maxFontSize = height * 1.125 * options.sizeMultiplier;
    return rule;
  },
  mathmlBuilder(group2, options) {
    var width = calculateSize(group2.width, options);
    var height = calculateSize(group2.height, options);
    var shift = group2.shift ? calculateSize(group2.shift, options) : 0;
    var color = options.color && options.getColor() || "black";
    var rule = new mathMLTree.MathNode("mspace");
    rule.setAttribute("mathbackground", color);
    rule.setAttribute("width", makeEm(width));
    rule.setAttribute("height", makeEm(height));
    var wrapper = new mathMLTree.MathNode("mpadded", [rule]);
    if (shift >= 0) {
      wrapper.setAttribute("height", makeEm(shift));
    } else {
      wrapper.setAttribute("height", makeEm(shift));
      wrapper.setAttribute("depth", makeEm(-shift));
    }
    wrapper.setAttribute("voffset", makeEm(shift));
    return wrapper;
  }
});
function sizingGroup(value, options, baseOptions) {
  var inner2 = buildExpression$1(value, options, false);
  var multiplier = options.sizeMultiplier / baseOptions.sizeMultiplier;
  for (var i2 = 0; i2 < inner2.length; i2++) {
    var pos = inner2[i2].classes.indexOf("sizing");
    if (pos < 0) {
      Array.prototype.push.apply(inner2[i2].classes, options.sizingClasses(baseOptions));
    } else if (inner2[i2].classes[pos + 1] === "reset-size" + options.size) {
      inner2[i2].classes[pos + 1] = "reset-size" + baseOptions.size;
    }
    inner2[i2].height *= multiplier;
    inner2[i2].depth *= multiplier;
  }
  return buildCommon.makeFragment(inner2);
}
var sizeFuncs = ["\\tiny", "\\sixptsize", "\\scriptsize", "\\footnotesize", "\\small", "\\normalsize", "\\large", "\\Large", "\\LARGE", "\\huge", "\\Huge"];
var htmlBuilder2 = (group2, options) => {
  var newOptions = options.havingSize(group2.size);
  return sizingGroup(group2.body, newOptions, options);
};
defineFunction({
  type: "sizing",
  names: sizeFuncs,
  props: {
    numArgs: 0,
    allowedInText: true
  },
  handler: (_ref, args) => {
    var {
      breakOnTokenText,
      funcName,
      parser
    } = _ref;
    var body = parser.parseExpression(false, breakOnTokenText);
    return {
      type: "sizing",
      mode: parser.mode,
      // Figure out what size to use based on the list of functions above
      size: sizeFuncs.indexOf(funcName) + 1,
      body
    };
  },
  htmlBuilder: htmlBuilder2,
  mathmlBuilder: (group2, options) => {
    var newOptions = options.havingSize(group2.size);
    var inner2 = buildExpression2(group2.body, newOptions);
    var node = new mathMLTree.MathNode("mstyle", inner2);
    node.setAttribute("mathsize", makeEm(newOptions.sizeMultiplier));
    return node;
  }
});
defineFunction({
  type: "smash",
  names: ["\\smash"],
  props: {
    numArgs: 1,
    numOptionalArgs: 1,
    allowedInText: true
  },
  handler: (_ref, args, optArgs) => {
    var {
      parser
    } = _ref;
    var smashHeight = false;
    var smashDepth = false;
    var tbArg = optArgs[0] && assertNodeType(optArgs[0], "ordgroup");
    if (tbArg) {
      var letter = "";
      for (var i2 = 0; i2 < tbArg.body.length; ++i2) {
        var node = tbArg.body[i2];
        letter = node.text;
        if (letter === "t") {
          smashHeight = true;
        } else if (letter === "b") {
          smashDepth = true;
        } else {
          smashHeight = false;
          smashDepth = false;
          break;
        }
      }
    } else {
      smashHeight = true;
      smashDepth = true;
    }
    var body = args[0];
    return {
      type: "smash",
      mode: parser.mode,
      body,
      smashHeight,
      smashDepth
    };
  },
  htmlBuilder: (group2, options) => {
    var node = buildCommon.makeSpan([], [buildGroup$1(group2.body, options)]);
    if (!group2.smashHeight && !group2.smashDepth) {
      return node;
    }
    if (group2.smashHeight) {
      node.height = 0;
      if (node.children) {
        for (var i2 = 0; i2 < node.children.length; i2++) {
          node.children[i2].height = 0;
        }
      }
    }
    if (group2.smashDepth) {
      node.depth = 0;
      if (node.children) {
        for (var _i6 = 0; _i6 < node.children.length; _i6++) {
          node.children[_i6].depth = 0;
        }
      }
    }
    var smashedNode = buildCommon.makeVList({
      positionType: "firstBaseline",
      children: [{
        type: "elem",
        elem: node
      }]
    }, options);
    return buildCommon.makeSpan(["mord"], [smashedNode], options);
  },
  mathmlBuilder: (group2, options) => {
    var node = new mathMLTree.MathNode("mpadded", [buildGroup2(group2.body, options)]);
    if (group2.smashHeight) {
      node.setAttribute("height", "0px");
    }
    if (group2.smashDepth) {
      node.setAttribute("depth", "0px");
    }
    return node;
  }
});
defineFunction({
  type: "sqrt",
  names: ["\\sqrt"],
  props: {
    numArgs: 1,
    numOptionalArgs: 1
  },
  handler(_ref, args, optArgs) {
    var {
      parser
    } = _ref;
    var index = optArgs[0];
    var body = args[0];
    return {
      type: "sqrt",
      mode: parser.mode,
      body,
      index
    };
  },
  htmlBuilder(group2, options) {
    var inner2 = buildGroup$1(group2.body, options.havingCrampedStyle());
    if (inner2.height === 0) {
      inner2.height = options.fontMetrics().xHeight;
    }
    inner2 = buildCommon.wrapFragment(inner2, options);
    var metrics = options.fontMetrics();
    var theta = metrics.defaultRuleThickness;
    var phi = theta;
    if (options.style.id < Style$1.TEXT.id) {
      phi = options.fontMetrics().xHeight;
    }
    var lineClearance = theta + phi / 4;
    var minDelimiterHeight = inner2.height + inner2.depth + lineClearance + theta;
    var {
      span: img,
      ruleWidth,
      advanceWidth
    } = delimiter.sqrtImage(minDelimiterHeight, options);
    var delimDepth = img.height - ruleWidth;
    if (delimDepth > inner2.height + inner2.depth + lineClearance) {
      lineClearance = (lineClearance + delimDepth - inner2.height - inner2.depth) / 2;
    }
    var imgShift = img.height - inner2.height - lineClearance - ruleWidth;
    inner2.style.paddingLeft = makeEm(advanceWidth);
    var body = buildCommon.makeVList({
      positionType: "firstBaseline",
      children: [{
        type: "elem",
        elem: inner2,
        wrapperClasses: ["svg-align"]
      }, {
        type: "kern",
        size: -(inner2.height + imgShift)
      }, {
        type: "elem",
        elem: img
      }, {
        type: "kern",
        size: ruleWidth
      }]
    }, options);
    if (!group2.index) {
      return buildCommon.makeSpan(["mord", "sqrt"], [body], options);
    } else {
      var newOptions = options.havingStyle(Style$1.SCRIPTSCRIPT);
      var rootm = buildGroup$1(group2.index, newOptions, options);
      var toShift = 0.6 * (body.height - body.depth);
      var rootVList = buildCommon.makeVList({
        positionType: "shift",
        positionData: -toShift,
        children: [{
          type: "elem",
          elem: rootm
        }]
      }, options);
      var rootVListWrap = buildCommon.makeSpan(["root"], [rootVList]);
      return buildCommon.makeSpan(["mord", "sqrt"], [rootVListWrap, body], options);
    }
  },
  mathmlBuilder(group2, options) {
    var {
      body,
      index
    } = group2;
    return index ? new mathMLTree.MathNode("mroot", [buildGroup2(body, options), buildGroup2(index, options)]) : new mathMLTree.MathNode("msqrt", [buildGroup2(body, options)]);
  }
});
var styleMap = {
  "display": Style$1.DISPLAY,
  "text": Style$1.TEXT,
  "script": Style$1.SCRIPT,
  "scriptscript": Style$1.SCRIPTSCRIPT
};
defineFunction({
  type: "styling",
  names: ["\\displaystyle", "\\textstyle", "\\scriptstyle", "\\scriptscriptstyle"],
  props: {
    numArgs: 0,
    allowedInText: true,
    primitive: true
  },
  handler(_ref, args) {
    var {
      breakOnTokenText,
      funcName,
      parser
    } = _ref;
    var body = parser.parseExpression(true, breakOnTokenText);
    var style = funcName.slice(1, funcName.length - 5);
    return {
      type: "styling",
      mode: parser.mode,
      // Figure out what style to use by pulling out the style from
      // the function name
      style,
      body
    };
  },
  htmlBuilder(group2, options) {
    var newStyle = styleMap[group2.style];
    var newOptions = options.havingStyle(newStyle).withFont("");
    return sizingGroup(group2.body, newOptions, options);
  },
  mathmlBuilder(group2, options) {
    var newStyle = styleMap[group2.style];
    var newOptions = options.havingStyle(newStyle);
    var inner2 = buildExpression2(group2.body, newOptions);
    var node = new mathMLTree.MathNode("mstyle", inner2);
    var styleAttributes = {
      "display": ["0", "true"],
      "text": ["0", "false"],
      "script": ["1", "false"],
      "scriptscript": ["2", "false"]
    };
    var attr = styleAttributes[group2.style];
    node.setAttribute("scriptlevel", attr[0]);
    node.setAttribute("displaystyle", attr[1]);
    return node;
  }
});
var htmlBuilderDelegate = function htmlBuilderDelegate2(group2, options) {
  var base = group2.base;
  if (!base) {
    return null;
  } else if (base.type === "op") {
    var delegate = base.limits && (options.style.size === Style$1.DISPLAY.size || base.alwaysHandleSupSub);
    return delegate ? htmlBuilder$2 : null;
  } else if (base.type === "operatorname") {
    var _delegate = base.alwaysHandleSupSub && (options.style.size === Style$1.DISPLAY.size || base.limits);
    return _delegate ? htmlBuilder$1 : null;
  } else if (base.type === "accent") {
    return utils.isCharacterBox(base.base) ? htmlBuilder$a : null;
  } else if (base.type === "horizBrace") {
    var isSup = !group2.sub;
    return isSup === base.isOver ? htmlBuilder$3 : null;
  } else {
    return null;
  }
};
defineFunctionBuilders({
  type: "supsub",
  htmlBuilder(group2, options) {
    var builderDelegate = htmlBuilderDelegate(group2, options);
    if (builderDelegate) {
      return builderDelegate(group2, options);
    }
    var {
      base: valueBase,
      sup: valueSup,
      sub: valueSub
    } = group2;
    var base = buildGroup$1(valueBase, options);
    var supm;
    var subm;
    var metrics = options.fontMetrics();
    var supShift = 0;
    var subShift = 0;
    var isCharacterBox3 = valueBase && utils.isCharacterBox(valueBase);
    if (valueSup) {
      var newOptions = options.havingStyle(options.style.sup());
      supm = buildGroup$1(valueSup, newOptions, options);
      if (!isCharacterBox3) {
        supShift = base.height - newOptions.fontMetrics().supDrop * newOptions.sizeMultiplier / options.sizeMultiplier;
      }
    }
    if (valueSub) {
      var _newOptions = options.havingStyle(options.style.sub());
      subm = buildGroup$1(valueSub, _newOptions, options);
      if (!isCharacterBox3) {
        subShift = base.depth + _newOptions.fontMetrics().subDrop * _newOptions.sizeMultiplier / options.sizeMultiplier;
      }
    }
    var minSupShift;
    if (options.style === Style$1.DISPLAY) {
      minSupShift = metrics.sup1;
    } else if (options.style.cramped) {
      minSupShift = metrics.sup3;
    } else {
      minSupShift = metrics.sup2;
    }
    var multiplier = options.sizeMultiplier;
    var marginRight = makeEm(0.5 / metrics.ptPerEm / multiplier);
    var marginLeft = null;
    if (subm) {
      var isOiint = group2.base && group2.base.type === "op" && group2.base.name && (group2.base.name === "\\oiint" || group2.base.name === "\\oiiint");
      if (base instanceof SymbolNode || isOiint) {
        marginLeft = makeEm(-base.italic);
      }
    }
    var supsub;
    if (supm && subm) {
      supShift = Math.max(supShift, minSupShift, supm.depth + 0.25 * metrics.xHeight);
      subShift = Math.max(subShift, metrics.sub2);
      var ruleWidth = metrics.defaultRuleThickness;
      var maxWidth = 4 * ruleWidth;
      if (supShift - supm.depth - (subm.height - subShift) < maxWidth) {
        subShift = maxWidth - (supShift - supm.depth) + subm.height;
        var psi = 0.8 * metrics.xHeight - (supShift - supm.depth);
        if (psi > 0) {
          supShift += psi;
          subShift -= psi;
        }
      }
      var vlistElem = [{
        type: "elem",
        elem: subm,
        shift: subShift,
        marginRight,
        marginLeft
      }, {
        type: "elem",
        elem: supm,
        shift: -supShift,
        marginRight
      }];
      supsub = buildCommon.makeVList({
        positionType: "individualShift",
        children: vlistElem
      }, options);
    } else if (subm) {
      subShift = Math.max(subShift, metrics.sub1, subm.height - 0.8 * metrics.xHeight);
      var _vlistElem = [{
        type: "elem",
        elem: subm,
        marginLeft,
        marginRight
      }];
      supsub = buildCommon.makeVList({
        positionType: "shift",
        positionData: subShift,
        children: _vlistElem
      }, options);
    } else if (supm) {
      supShift = Math.max(supShift, minSupShift, supm.depth + 0.25 * metrics.xHeight);
      supsub = buildCommon.makeVList({
        positionType: "shift",
        positionData: -supShift,
        children: [{
          type: "elem",
          elem: supm,
          marginRight
        }]
      }, options);
    } else {
      throw new Error("supsub must have either sup or sub.");
    }
    var mclass = getTypeOfDomTree(base, "right") || "mord";
    return buildCommon.makeSpan([mclass], [base, buildCommon.makeSpan(["msupsub"], [supsub])], options);
  },
  mathmlBuilder(group2, options) {
    var isBrace = false;
    var isOver;
    var isSup;
    if (group2.base && group2.base.type === "horizBrace") {
      isSup = !!group2.sup;
      if (isSup === group2.base.isOver) {
        isBrace = true;
        isOver = group2.base.isOver;
      }
    }
    if (group2.base && (group2.base.type === "op" || group2.base.type === "operatorname")) {
      group2.base.parentIsSupSub = true;
    }
    var children = [buildGroup2(group2.base, options)];
    if (group2.sub) {
      children.push(buildGroup2(group2.sub, options));
    }
    if (group2.sup) {
      children.push(buildGroup2(group2.sup, options));
    }
    var nodeType;
    if (isBrace) {
      nodeType = isOver ? "mover" : "munder";
    } else if (!group2.sub) {
      var base = group2.base;
      if (base && base.type === "op" && base.limits && (options.style === Style$1.DISPLAY || base.alwaysHandleSupSub)) {
        nodeType = "mover";
      } else if (base && base.type === "operatorname" && base.alwaysHandleSupSub && (base.limits || options.style === Style$1.DISPLAY)) {
        nodeType = "mover";
      } else {
        nodeType = "msup";
      }
    } else if (!group2.sup) {
      var _base = group2.base;
      if (_base && _base.type === "op" && _base.limits && (options.style === Style$1.DISPLAY || _base.alwaysHandleSupSub)) {
        nodeType = "munder";
      } else if (_base && _base.type === "operatorname" && _base.alwaysHandleSupSub && (_base.limits || options.style === Style$1.DISPLAY)) {
        nodeType = "munder";
      } else {
        nodeType = "msub";
      }
    } else {
      var _base2 = group2.base;
      if (_base2 && _base2.type === "op" && _base2.limits && options.style === Style$1.DISPLAY) {
        nodeType = "munderover";
      } else if (_base2 && _base2.type === "operatorname" && _base2.alwaysHandleSupSub && (options.style === Style$1.DISPLAY || _base2.limits)) {
        nodeType = "munderover";
      } else {
        nodeType = "msubsup";
      }
    }
    return new mathMLTree.MathNode(nodeType, children);
  }
});
defineFunctionBuilders({
  type: "atom",
  htmlBuilder(group2, options) {
    return buildCommon.mathsym(group2.text, group2.mode, options, ["m" + group2.family]);
  },
  mathmlBuilder(group2, options) {
    var node = new mathMLTree.MathNode("mo", [makeText(group2.text, group2.mode)]);
    if (group2.family === "bin") {
      var variant = getVariant(group2, options);
      if (variant === "bold-italic") {
        node.setAttribute("mathvariant", variant);
      }
    } else if (group2.family === "punct") {
      node.setAttribute("separator", "true");
    } else if (group2.family === "open" || group2.family === "close") {
      node.setAttribute("stretchy", "false");
    }
    return node;
  }
});
var defaultVariant = {
  "mi": "italic",
  "mn": "normal",
  "mtext": "normal"
};
defineFunctionBuilders({
  type: "mathord",
  htmlBuilder(group2, options) {
    return buildCommon.makeOrd(group2, options, "mathord");
  },
  mathmlBuilder(group2, options) {
    var node = new mathMLTree.MathNode("mi", [makeText(group2.text, group2.mode, options)]);
    var variant = getVariant(group2, options) || "italic";
    if (variant !== defaultVariant[node.type]) {
      node.setAttribute("mathvariant", variant);
    }
    return node;
  }
});
defineFunctionBuilders({
  type: "textord",
  htmlBuilder(group2, options) {
    return buildCommon.makeOrd(group2, options, "textord");
  },
  mathmlBuilder(group2, options) {
    var text2 = makeText(group2.text, group2.mode, options);
    var variant = getVariant(group2, options) || "normal";
    var node;
    if (group2.mode === "text") {
      node = new mathMLTree.MathNode("mtext", [text2]);
    } else if (/[0-9]/.test(group2.text)) {
      node = new mathMLTree.MathNode("mn", [text2]);
    } else if (group2.text === "\\prime") {
      node = new mathMLTree.MathNode("mo", [text2]);
    } else {
      node = new mathMLTree.MathNode("mi", [text2]);
    }
    if (variant !== defaultVariant[node.type]) {
      node.setAttribute("mathvariant", variant);
    }
    return node;
  }
});
var cssSpace = {
  "\\nobreak": "nobreak",
  "\\allowbreak": "allowbreak"
};
var regularSpace = {
  " ": {},
  "\\ ": {},
  "~": {
    className: "nobreak"
  },
  "\\space": {},
  "\\nobreakspace": {
    className: "nobreak"
  }
};
defineFunctionBuilders({
  type: "spacing",
  htmlBuilder(group2, options) {
    if (regularSpace.hasOwnProperty(group2.text)) {
      var className = regularSpace[group2.text].className || "";
      if (group2.mode === "text") {
        var ord = buildCommon.makeOrd(group2, options, "textord");
        ord.classes.push(className);
        return ord;
      } else {
        return buildCommon.makeSpan(["mspace", className], [buildCommon.mathsym(group2.text, group2.mode, options)], options);
      }
    } else if (cssSpace.hasOwnProperty(group2.text)) {
      return buildCommon.makeSpan(["mspace", cssSpace[group2.text]], [], options);
    } else {
      throw new ParseError('Unknown type of space "' + group2.text + '"');
    }
  },
  mathmlBuilder(group2, options) {
    var node;
    if (regularSpace.hasOwnProperty(group2.text)) {
      node = new mathMLTree.MathNode("mtext", [new mathMLTree.TextNode("\xA0")]);
    } else if (cssSpace.hasOwnProperty(group2.text)) {
      return new mathMLTree.MathNode("mspace");
    } else {
      throw new ParseError('Unknown type of space "' + group2.text + '"');
    }
    return node;
  }
});
var pad = () => {
  var padNode = new mathMLTree.MathNode("mtd", []);
  padNode.setAttribute("width", "50%");
  return padNode;
};
defineFunctionBuilders({
  type: "tag",
  mathmlBuilder(group2, options) {
    var table = new mathMLTree.MathNode("mtable", [new mathMLTree.MathNode("mtr", [pad(), new mathMLTree.MathNode("mtd", [buildExpressionRow(group2.body, options)]), pad(), new mathMLTree.MathNode("mtd", [buildExpressionRow(group2.tag, options)])])]);
    table.setAttribute("width", "100%");
    return table;
  }
});
var textFontFamilies = {
  "\\text": void 0,
  "\\textrm": "textrm",
  "\\textsf": "textsf",
  "\\texttt": "texttt",
  "\\textnormal": "textrm"
};
var textFontWeights = {
  "\\textbf": "textbf",
  "\\textmd": "textmd"
};
var textFontShapes = {
  "\\textit": "textit",
  "\\textup": "textup"
};
var optionsWithFont = (group2, options) => {
  var font = group2.font;
  if (!font) {
    return options;
  } else if (textFontFamilies[font]) {
    return options.withTextFontFamily(textFontFamilies[font]);
  } else if (textFontWeights[font]) {
    return options.withTextFontWeight(textFontWeights[font]);
  } else if (font === "\\emph") {
    return options.fontShape === "textit" ? options.withTextFontShape("textup") : options.withTextFontShape("textit");
  }
  return options.withTextFontShape(textFontShapes[font]);
};
defineFunction({
  type: "text",
  names: [
    // Font families
    "\\text",
    "\\textrm",
    "\\textsf",
    "\\texttt",
    "\\textnormal",
    // Font weights
    "\\textbf",
    "\\textmd",
    // Font Shapes
    "\\textit",
    "\\textup",
    "\\emph"
  ],
  props: {
    numArgs: 1,
    argTypes: ["text"],
    allowedInArgument: true,
    allowedInText: true
  },
  handler(_ref, args) {
    var {
      parser,
      funcName
    } = _ref;
    var body = args[0];
    return {
      type: "text",
      mode: parser.mode,
      body: ordargument(body),
      font: funcName
    };
  },
  htmlBuilder(group2, options) {
    var newOptions = optionsWithFont(group2, options);
    var inner2 = buildExpression$1(group2.body, newOptions, true);
    return buildCommon.makeSpan(["mord", "text"], inner2, newOptions);
  },
  mathmlBuilder(group2, options) {
    var newOptions = optionsWithFont(group2, options);
    return buildExpressionRow(group2.body, newOptions);
  }
});
defineFunction({
  type: "underline",
  names: ["\\underline"],
  props: {
    numArgs: 1,
    allowedInText: true
  },
  handler(_ref, args) {
    var {
      parser
    } = _ref;
    return {
      type: "underline",
      mode: parser.mode,
      body: args[0]
    };
  },
  htmlBuilder(group2, options) {
    var innerGroup = buildGroup$1(group2.body, options);
    var line = buildCommon.makeLineSpan("underline-line", options);
    var defaultRuleThickness = options.fontMetrics().defaultRuleThickness;
    var vlist = buildCommon.makeVList({
      positionType: "top",
      positionData: innerGroup.height,
      children: [{
        type: "kern",
        size: defaultRuleThickness
      }, {
        type: "elem",
        elem: line
      }, {
        type: "kern",
        size: 3 * defaultRuleThickness
      }, {
        type: "elem",
        elem: innerGroup
      }]
    }, options);
    return buildCommon.makeSpan(["mord", "underline"], [vlist], options);
  },
  mathmlBuilder(group2, options) {
    var operator = new mathMLTree.MathNode("mo", [new mathMLTree.TextNode("\u203E")]);
    operator.setAttribute("stretchy", "true");
    var node = new mathMLTree.MathNode("munder", [buildGroup2(group2.body, options), operator]);
    node.setAttribute("accentunder", "true");
    return node;
  }
});
defineFunction({
  type: "vcenter",
  names: ["\\vcenter"],
  props: {
    numArgs: 1,
    argTypes: ["original"],
    // In LaTeX, \vcenter can act only on a box.
    allowedInText: false
  },
  handler(_ref, args) {
    var {
      parser
    } = _ref;
    return {
      type: "vcenter",
      mode: parser.mode,
      body: args[0]
    };
  },
  htmlBuilder(group2, options) {
    var body = buildGroup$1(group2.body, options);
    var axisHeight = options.fontMetrics().axisHeight;
    var dy = 0.5 * (body.height - axisHeight - (body.depth + axisHeight));
    return buildCommon.makeVList({
      positionType: "shift",
      positionData: dy,
      children: [{
        type: "elem",
        elem: body
      }]
    }, options);
  },
  mathmlBuilder(group2, options) {
    return new mathMLTree.MathNode("mpadded", [buildGroup2(group2.body, options)], ["vcenter"]);
  }
});
defineFunction({
  type: "verb",
  names: ["\\verb"],
  props: {
    numArgs: 0,
    allowedInText: true
  },
  handler(context, args, optArgs) {
    throw new ParseError("\\verb ended by end of line instead of matching delimiter");
  },
  htmlBuilder(group2, options) {
    var text2 = makeVerb(group2);
    var body = [];
    var newOptions = options.havingStyle(options.style.text());
    for (var i2 = 0; i2 < text2.length; i2++) {
      var c = text2[i2];
      if (c === "~") {
        c = "\\textasciitilde";
      }
      body.push(buildCommon.makeSymbol(c, "Typewriter-Regular", group2.mode, newOptions, ["mord", "texttt"]));
    }
    return buildCommon.makeSpan(["mord", "text"].concat(newOptions.sizingClasses(options)), buildCommon.tryCombineChars(body), newOptions);
  },
  mathmlBuilder(group2, options) {
    var text2 = new mathMLTree.TextNode(makeVerb(group2));
    var node = new mathMLTree.MathNode("mtext", [text2]);
    node.setAttribute("mathvariant", "monospace");
    return node;
  }
});
var makeVerb = (group2) => group2.body.replace(/ /g, group2.star ? "\u2423" : "\xA0");
var functions = _functions;
var spaceRegexString = "[ \r\n	]";
var controlWordRegexString = "\\\\[a-zA-Z@]+";
var controlSymbolRegexString = "\\\\[^\uD800-\uDFFF]";
var controlWordWhitespaceRegexString = "(" + controlWordRegexString + ")" + spaceRegexString + "*";
var controlSpaceRegexString = "\\\\(\n|[ \r	]+\n?)[ \r	]*";
var combiningDiacriticalMarkString = "[\u0300-\u036F]";
var combiningDiacriticalMarksEndRegex = new RegExp(combiningDiacriticalMarkString + "+$");
var tokenRegexString = "(" + spaceRegexString + "+)|" + // whitespace
(controlSpaceRegexString + "|") + // \whitespace
"([!-\\[\\]-\u2027\u202A-\uD7FF\uF900-\uFFFF]" + // single codepoint
(combiningDiacriticalMarkString + "*") + // ...plus accents
"|[\uD800-\uDBFF][\uDC00-\uDFFF]" + // surrogate pair
(combiningDiacriticalMarkString + "*") + // ...plus accents
"|\\\\verb\\*([^]).*?\\4|\\\\verb([^*a-zA-Z]).*?\\5" + // \verb unstarred
("|" + controlWordWhitespaceRegexString) + // \macroName + spaces
("|" + controlSymbolRegexString + ")");
var Lexer = class {
  // Category codes. The lexer only supports comment characters (14) for now.
  // MacroExpander additionally distinguishes active (13).
  constructor(input, settings) {
    this.input = void 0;
    this.settings = void 0;
    this.tokenRegex = void 0;
    this.catcodes = void 0;
    this.input = input;
    this.settings = settings;
    this.tokenRegex = new RegExp(tokenRegexString, "g");
    this.catcodes = {
      "%": 14,
      // comment character
      "~": 13
      // active character
    };
  }
  setCatcode(char, code) {
    this.catcodes[char] = code;
  }
  /**
   * This function lexes a single token.
   */
  lex() {
    var input = this.input;
    var pos = this.tokenRegex.lastIndex;
    if (pos === input.length) {
      return new Token("EOF", new SourceLocation(this, pos, pos));
    }
    var match = this.tokenRegex.exec(input);
    if (match === null || match.index !== pos) {
      throw new ParseError("Unexpected character: '" + input[pos] + "'", new Token(input[pos], new SourceLocation(this, pos, pos + 1)));
    }
    var text2 = match[6] || match[3] || (match[2] ? "\\ " : " ");
    if (this.catcodes[text2] === 14) {
      var nlIndex = input.indexOf("\n", this.tokenRegex.lastIndex);
      if (nlIndex === -1) {
        this.tokenRegex.lastIndex = input.length;
        this.settings.reportNonstrict("commentAtEnd", "% comment has no terminating newline; LaTeX would fail because of commenting the end of math mode (e.g. $)");
      } else {
        this.tokenRegex.lastIndex = nlIndex + 1;
      }
      return this.lex();
    }
    return new Token(text2, new SourceLocation(this, pos, this.tokenRegex.lastIndex));
  }
};
var Namespace = class {
  /**
   * Both arguments are optional.  The first argument is an object of
   * built-in mappings which never change.  The second argument is an object
   * of initial (global-level) mappings, which will constantly change
   * according to any global/top-level `set`s done.
   */
  constructor(builtins, globalMacros) {
    if (builtins === void 0) {
      builtins = {};
    }
    if (globalMacros === void 0) {
      globalMacros = {};
    }
    this.current = void 0;
    this.builtins = void 0;
    this.undefStack = void 0;
    this.current = globalMacros;
    this.builtins = builtins;
    this.undefStack = [];
  }
  /**
   * Start a new nested group, affecting future local `set`s.
   */
  beginGroup() {
    this.undefStack.push({});
  }
  /**
   * End current nested group, restoring values before the group began.
   */
  endGroup() {
    if (this.undefStack.length === 0) {
      throw new ParseError("Unbalanced namespace destruction: attempt to pop global namespace; please report this as a bug");
    }
    var undefs = this.undefStack.pop();
    for (var undef in undefs) {
      if (undefs.hasOwnProperty(undef)) {
        if (undefs[undef] == null) {
          delete this.current[undef];
        } else {
          this.current[undef] = undefs[undef];
        }
      }
    }
  }
  /**
   * Ends all currently nested groups (if any), restoring values before the
   * groups began.  Useful in case of an error in the middle of parsing.
   */
  endGroups() {
    while (this.undefStack.length > 0) {
      this.endGroup();
    }
  }
  /**
   * Detect whether `name` has a definition.  Equivalent to
   * `get(name) != null`.
   */
  has(name) {
    return this.current.hasOwnProperty(name) || this.builtins.hasOwnProperty(name);
  }
  /**
   * Get the current value of a name, or `undefined` if there is no value.
   *
   * Note: Do not use `if (namespace.get(...))` to detect whether a macro
   * is defined, as the definition may be the empty string which evaluates
   * to `false` in JavaScript.  Use `if (namespace.get(...) != null)` or
   * `if (namespace.has(...))`.
   */
  get(name) {
    if (this.current.hasOwnProperty(name)) {
      return this.current[name];
    } else {
      return this.builtins[name];
    }
  }
  /**
   * Set the current value of a name, and optionally set it globally too.
   * Local set() sets the current value and (when appropriate) adds an undo
   * operation to the undo stack.  Global set() may change the undo
   * operation at every level, so takes time linear in their number.
   * A value of undefined means to delete existing definitions.
   */
  set(name, value, global) {
    if (global === void 0) {
      global = false;
    }
    if (global) {
      for (var i2 = 0; i2 < this.undefStack.length; i2++) {
        delete this.undefStack[i2][name];
      }
      if (this.undefStack.length > 0) {
        this.undefStack[this.undefStack.length - 1][name] = value;
      }
    } else {
      var top = this.undefStack[this.undefStack.length - 1];
      if (top && !top.hasOwnProperty(name)) {
        top[name] = this.current[name];
      }
    }
    if (value == null) {
      delete this.current[name];
    } else {
      this.current[name] = value;
    }
  }
};
var macros = _macros;
defineMacro("\\noexpand", function(context) {
  var t = context.popToken();
  if (context.isExpandable(t.text)) {
    t.noexpand = true;
    t.treatAsRelax = true;
  }
  return {
    tokens: [t],
    numArgs: 0
  };
});
defineMacro("\\expandafter", function(context) {
  var t = context.popToken();
  context.expandOnce(true);
  return {
    tokens: [t],
    numArgs: 0
  };
});
defineMacro("\\@firstoftwo", function(context) {
  var args = context.consumeArgs(2);
  return {
    tokens: args[0],
    numArgs: 0
  };
});
defineMacro("\\@secondoftwo", function(context) {
  var args = context.consumeArgs(2);
  return {
    tokens: args[1],
    numArgs: 0
  };
});
defineMacro("\\@ifnextchar", function(context) {
  var args = context.consumeArgs(3);
  context.consumeSpaces();
  var nextToken = context.future();
  if (args[0].length === 1 && args[0][0].text === nextToken.text) {
    return {
      tokens: args[1],
      numArgs: 0
    };
  } else {
    return {
      tokens: args[2],
      numArgs: 0
    };
  }
});
defineMacro("\\@ifstar", "\\@ifnextchar *{\\@firstoftwo{#1}}");
defineMacro("\\TextOrMath", function(context) {
  var args = context.consumeArgs(2);
  if (context.mode === "text") {
    return {
      tokens: args[0],
      numArgs: 0
    };
  } else {
    return {
      tokens: args[1],
      numArgs: 0
    };
  }
});
var digitToNumber = {
  "0": 0,
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "a": 10,
  "A": 10,
  "b": 11,
  "B": 11,
  "c": 12,
  "C": 12,
  "d": 13,
  "D": 13,
  "e": 14,
  "E": 14,
  "f": 15,
  "F": 15
};
defineMacro("\\char", function(context) {
  var token = context.popToken();
  var base;
  var number = "";
  if (token.text === "'") {
    base = 8;
    token = context.popToken();
  } else if (token.text === '"') {
    base = 16;
    token = context.popToken();
  } else if (token.text === "`") {
    token = context.popToken();
    if (token.text[0] === "\\") {
      number = token.text.charCodeAt(1);
    } else if (token.text === "EOF") {
      throw new ParseError("\\char` missing argument");
    } else {
      number = token.text.charCodeAt(0);
    }
  } else {
    base = 10;
  }
  if (base) {
    number = digitToNumber[token.text];
    if (number == null || number >= base) {
      throw new ParseError("Invalid base-" + base + " digit " + token.text);
    }
    var digit;
    while ((digit = digitToNumber[context.future().text]) != null && digit < base) {
      number *= base;
      number += digit;
      context.popToken();
    }
  }
  return "\\@char{" + number + "}";
});
var newcommand = (context, existsOK, nonexistsOK, skipIfExists) => {
  var arg = context.consumeArg().tokens;
  if (arg.length !== 1) {
    throw new ParseError("\\newcommand's first argument must be a macro name");
  }
  var name = arg[0].text;
  var exists = context.isDefined(name);
  if (exists && !existsOK) {
    throw new ParseError("\\newcommand{" + name + "} attempting to redefine " + (name + "; use \\renewcommand"));
  }
  if (!exists && !nonexistsOK) {
    throw new ParseError("\\renewcommand{" + name + "} when command " + name + " does not yet exist; use \\newcommand");
  }
  var numArgs = 0;
  arg = context.consumeArg().tokens;
  if (arg.length === 1 && arg[0].text === "[") {
    var argText = "";
    var token = context.expandNextToken();
    while (token.text !== "]" && token.text !== "EOF") {
      argText += token.text;
      token = context.expandNextToken();
    }
    if (!argText.match(/^\s*[0-9]+\s*$/)) {
      throw new ParseError("Invalid number of arguments: " + argText);
    }
    numArgs = parseInt(argText);
    arg = context.consumeArg().tokens;
  }
  if (!(exists && skipIfExists)) {
    context.macros.set(name, {
      tokens: arg,
      numArgs
    });
  }
  return "";
};
defineMacro("\\newcommand", (context) => newcommand(context, false, true, false));
defineMacro("\\renewcommand", (context) => newcommand(context, true, false, false));
defineMacro("\\providecommand", (context) => newcommand(context, true, true, true));
defineMacro("\\message", (context) => {
  var arg = context.consumeArgs(1)[0];
  console.log(arg.reverse().map((token) => token.text).join(""));
  return "";
});
defineMacro("\\errmessage", (context) => {
  var arg = context.consumeArgs(1)[0];
  console.error(arg.reverse().map((token) => token.text).join(""));
  return "";
});
defineMacro("\\show", (context) => {
  var tok = context.popToken();
  var name = tok.text;
  console.log(tok, context.macros.get(name), functions[name], symbols.math[name], symbols.text[name]);
  return "";
});
defineMacro("\\bgroup", "{");
defineMacro("\\egroup", "}");
defineMacro("~", "\\nobreakspace");
defineMacro("\\lq", "`");
defineMacro("\\rq", "'");
defineMacro("\\aa", "\\r a");
defineMacro("\\AA", "\\r A");
defineMacro("\\textcopyright", "\\html@mathml{\\textcircled{c}}{\\char`\xA9}");
defineMacro("\\copyright", "\\TextOrMath{\\textcopyright}{\\text{\\textcopyright}}");
defineMacro("\\textregistered", "\\html@mathml{\\textcircled{\\scriptsize R}}{\\char`\xAE}");
defineMacro("\u212C", "\\mathscr{B}");
defineMacro("\u2130", "\\mathscr{E}");
defineMacro("\u2131", "\\mathscr{F}");
defineMacro("\u210B", "\\mathscr{H}");
defineMacro("\u2110", "\\mathscr{I}");
defineMacro("\u2112", "\\mathscr{L}");
defineMacro("\u2133", "\\mathscr{M}");
defineMacro("\u211B", "\\mathscr{R}");
defineMacro("\u212D", "\\mathfrak{C}");
defineMacro("\u210C", "\\mathfrak{H}");
defineMacro("\u2128", "\\mathfrak{Z}");
defineMacro("\\Bbbk", "\\Bbb{k}");
defineMacro("\xB7", "\\cdotp");
defineMacro("\\llap", "\\mathllap{\\textrm{#1}}");
defineMacro("\\rlap", "\\mathrlap{\\textrm{#1}}");
defineMacro("\\clap", "\\mathclap{\\textrm{#1}}");
defineMacro("\\mathstrut", "\\vphantom{(}");
defineMacro("\\underbar", "\\underline{\\text{#1}}");
defineMacro("\\not", '\\html@mathml{\\mathrel{\\mathrlap\\@not}}{\\char"338}');
defineMacro("\\neq", "\\html@mathml{\\mathrel{\\not=}}{\\mathrel{\\char`\u2260}}");
defineMacro("\\ne", "\\neq");
defineMacro("\u2260", "\\neq");
defineMacro("\\notin", "\\html@mathml{\\mathrel{{\\in}\\mathllap{/\\mskip1mu}}}{\\mathrel{\\char`\u2209}}");
defineMacro("\u2209", "\\notin");
defineMacro("\u2258", "\\html@mathml{\\mathrel{=\\kern{-1em}\\raisebox{0.4em}{$\\scriptsize\\frown$}}}{\\mathrel{\\char`\u2258}}");
defineMacro("\u2259", "\\html@mathml{\\stackrel{\\tiny\\wedge}{=}}{\\mathrel{\\char`\u2258}}");
defineMacro("\u225A", "\\html@mathml{\\stackrel{\\tiny\\vee}{=}}{\\mathrel{\\char`\u225A}}");
defineMacro("\u225B", "\\html@mathml{\\stackrel{\\scriptsize\\star}{=}}{\\mathrel{\\char`\u225B}}");
defineMacro("\u225D", "\\html@mathml{\\stackrel{\\tiny\\mathrm{def}}{=}}{\\mathrel{\\char`\u225D}}");
defineMacro("\u225E", "\\html@mathml{\\stackrel{\\tiny\\mathrm{m}}{=}}{\\mathrel{\\char`\u225E}}");
defineMacro("\u225F", "\\html@mathml{\\stackrel{\\tiny?}{=}}{\\mathrel{\\char`\u225F}}");
defineMacro("\u27C2", "\\perp");
defineMacro("\u203C", "\\mathclose{!\\mkern-0.8mu!}");
defineMacro("\u220C", "\\notni");
defineMacro("\u231C", "\\ulcorner");
defineMacro("\u231D", "\\urcorner");
defineMacro("\u231E", "\\llcorner");
defineMacro("\u231F", "\\lrcorner");
defineMacro("\xA9", "\\copyright");
defineMacro("\xAE", "\\textregistered");
defineMacro("\uFE0F", "\\textregistered");
defineMacro("\\ulcorner", '\\html@mathml{\\@ulcorner}{\\mathop{\\char"231c}}');
defineMacro("\\urcorner", '\\html@mathml{\\@urcorner}{\\mathop{\\char"231d}}');
defineMacro("\\llcorner", '\\html@mathml{\\@llcorner}{\\mathop{\\char"231e}}');
defineMacro("\\lrcorner", '\\html@mathml{\\@lrcorner}{\\mathop{\\char"231f}}');
defineMacro("\\vdots", "{\\varvdots\\rule{0pt}{15pt}}");
defineMacro("\u22EE", "\\vdots");
defineMacro("\\varGamma", "\\mathit{\\Gamma}");
defineMacro("\\varDelta", "\\mathit{\\Delta}");
defineMacro("\\varTheta", "\\mathit{\\Theta}");
defineMacro("\\varLambda", "\\mathit{\\Lambda}");
defineMacro("\\varXi", "\\mathit{\\Xi}");
defineMacro("\\varPi", "\\mathit{\\Pi}");
defineMacro("\\varSigma", "\\mathit{\\Sigma}");
defineMacro("\\varUpsilon", "\\mathit{\\Upsilon}");
defineMacro("\\varPhi", "\\mathit{\\Phi}");
defineMacro("\\varPsi", "\\mathit{\\Psi}");
defineMacro("\\varOmega", "\\mathit{\\Omega}");
defineMacro("\\substack", "\\begin{subarray}{c}#1\\end{subarray}");
defineMacro("\\colon", "\\nobreak\\mskip2mu\\mathpunct{}\\mathchoice{\\mkern-3mu}{\\mkern-3mu}{}{}{:}\\mskip6mu\\relax");
defineMacro("\\boxed", "\\fbox{$\\displaystyle{#1}$}");
defineMacro("\\iff", "\\DOTSB\\;\\Longleftrightarrow\\;");
defineMacro("\\implies", "\\DOTSB\\;\\Longrightarrow\\;");
defineMacro("\\impliedby", "\\DOTSB\\;\\Longleftarrow\\;");
defineMacro("\\dddot", "{\\overset{\\raisebox{-0.1ex}{\\normalsize ...}}{#1}}");
defineMacro("\\ddddot", "{\\overset{\\raisebox{-0.1ex}{\\normalsize ....}}{#1}}");
var dotsByToken = {
  ",": "\\dotsc",
  "\\not": "\\dotsb",
  // \keybin@ checks for the following:
  "+": "\\dotsb",
  "=": "\\dotsb",
  "<": "\\dotsb",
  ">": "\\dotsb",
  "-": "\\dotsb",
  "*": "\\dotsb",
  ":": "\\dotsb",
  // Symbols whose definition starts with \DOTSB:
  "\\DOTSB": "\\dotsb",
  "\\coprod": "\\dotsb",
  "\\bigvee": "\\dotsb",
  "\\bigwedge": "\\dotsb",
  "\\biguplus": "\\dotsb",
  "\\bigcap": "\\dotsb",
  "\\bigcup": "\\dotsb",
  "\\prod": "\\dotsb",
  "\\sum": "\\dotsb",
  "\\bigotimes": "\\dotsb",
  "\\bigoplus": "\\dotsb",
  "\\bigodot": "\\dotsb",
  "\\bigsqcup": "\\dotsb",
  "\\And": "\\dotsb",
  "\\longrightarrow": "\\dotsb",
  "\\Longrightarrow": "\\dotsb",
  "\\longleftarrow": "\\dotsb",
  "\\Longleftarrow": "\\dotsb",
  "\\longleftrightarrow": "\\dotsb",
  "\\Longleftrightarrow": "\\dotsb",
  "\\mapsto": "\\dotsb",
  "\\longmapsto": "\\dotsb",
  "\\hookrightarrow": "\\dotsb",
  "\\doteq": "\\dotsb",
  // Symbols whose definition starts with \mathbin:
  "\\mathbin": "\\dotsb",
  // Symbols whose definition starts with \mathrel:
  "\\mathrel": "\\dotsb",
  "\\relbar": "\\dotsb",
  "\\Relbar": "\\dotsb",
  "\\xrightarrow": "\\dotsb",
  "\\xleftarrow": "\\dotsb",
  // Symbols whose definition starts with \DOTSI:
  "\\DOTSI": "\\dotsi",
  "\\int": "\\dotsi",
  "\\oint": "\\dotsi",
  "\\iint": "\\dotsi",
  "\\iiint": "\\dotsi",
  "\\iiiint": "\\dotsi",
  "\\idotsint": "\\dotsi",
  // Symbols whose definition starts with \DOTSX:
  "\\DOTSX": "\\dotsx"
};
defineMacro("\\dots", function(context) {
  var thedots = "\\dotso";
  var next = context.expandAfterFuture().text;
  if (next in dotsByToken) {
    thedots = dotsByToken[next];
  } else if (next.slice(0, 4) === "\\not") {
    thedots = "\\dotsb";
  } else if (next in symbols.math) {
    if (utils.contains(["bin", "rel"], symbols.math[next].group)) {
      thedots = "\\dotsb";
    }
  }
  return thedots;
});
var spaceAfterDots = {
  // \rightdelim@ checks for the following:
  ")": true,
  "]": true,
  "\\rbrack": true,
  "\\}": true,
  "\\rbrace": true,
  "\\rangle": true,
  "\\rceil": true,
  "\\rfloor": true,
  "\\rgroup": true,
  "\\rmoustache": true,
  "\\right": true,
  "\\bigr": true,
  "\\biggr": true,
  "\\Bigr": true,
  "\\Biggr": true,
  // \extra@ also tests for the following:
  "$": true,
  // \extrap@ checks for the following:
  ";": true,
  ".": true,
  ",": true
};
defineMacro("\\dotso", function(context) {
  var next = context.future().text;
  if (next in spaceAfterDots) {
    return "\\ldots\\,";
  } else {
    return "\\ldots";
  }
});
defineMacro("\\dotsc", function(context) {
  var next = context.future().text;
  if (next in spaceAfterDots && next !== ",") {
    return "\\ldots\\,";
  } else {
    return "\\ldots";
  }
});
defineMacro("\\cdots", function(context) {
  var next = context.future().text;
  if (next in spaceAfterDots) {
    return "\\@cdots\\,";
  } else {
    return "\\@cdots";
  }
});
defineMacro("\\dotsb", "\\cdots");
defineMacro("\\dotsm", "\\cdots");
defineMacro("\\dotsi", "\\!\\cdots");
defineMacro("\\dotsx", "\\ldots\\,");
defineMacro("\\DOTSI", "\\relax");
defineMacro("\\DOTSB", "\\relax");
defineMacro("\\DOTSX", "\\relax");
defineMacro("\\tmspace", "\\TextOrMath{\\kern#1#3}{\\mskip#1#2}\\relax");
defineMacro("\\,", "\\tmspace+{3mu}{.1667em}");
defineMacro("\\thinspace", "\\,");
defineMacro("\\>", "\\mskip{4mu}");
defineMacro("\\:", "\\tmspace+{4mu}{.2222em}");
defineMacro("\\medspace", "\\:");
defineMacro("\\;", "\\tmspace+{5mu}{.2777em}");
defineMacro("\\thickspace", "\\;");
defineMacro("\\!", "\\tmspace-{3mu}{.1667em}");
defineMacro("\\negthinspace", "\\!");
defineMacro("\\negmedspace", "\\tmspace-{4mu}{.2222em}");
defineMacro("\\negthickspace", "\\tmspace-{5mu}{.277em}");
defineMacro("\\enspace", "\\kern.5em ");
defineMacro("\\enskip", "\\hskip.5em\\relax");
defineMacro("\\quad", "\\hskip1em\\relax");
defineMacro("\\qquad", "\\hskip2em\\relax");
defineMacro("\\tag", "\\@ifstar\\tag@literal\\tag@paren");
defineMacro("\\tag@paren", "\\tag@literal{({#1})}");
defineMacro("\\tag@literal", (context) => {
  if (context.macros.get("\\df@tag")) {
    throw new ParseError("Multiple \\tag");
  }
  return "\\gdef\\df@tag{\\text{#1}}";
});
defineMacro("\\bmod", "\\mathchoice{\\mskip1mu}{\\mskip1mu}{\\mskip5mu}{\\mskip5mu}\\mathbin{\\rm mod}\\mathchoice{\\mskip1mu}{\\mskip1mu}{\\mskip5mu}{\\mskip5mu}");
defineMacro("\\pod", "\\allowbreak\\mathchoice{\\mkern18mu}{\\mkern8mu}{\\mkern8mu}{\\mkern8mu}(#1)");
defineMacro("\\pmod", "\\pod{{\\rm mod}\\mkern6mu#1}");
defineMacro("\\mod", "\\allowbreak\\mathchoice{\\mkern18mu}{\\mkern12mu}{\\mkern12mu}{\\mkern12mu}{\\rm mod}\\,\\,#1");
defineMacro("\\newline", "\\\\\\relax");
defineMacro("\\TeX", "\\textrm{\\html@mathml{T\\kern-.1667em\\raisebox{-.5ex}{E}\\kern-.125emX}{TeX}}");
var latexRaiseA = makeEm(fontMetricsData["Main-Regular"]["T".charCodeAt(0)][1] - 0.7 * fontMetricsData["Main-Regular"]["A".charCodeAt(0)][1]);
defineMacro("\\LaTeX", "\\textrm{\\html@mathml{" + ("L\\kern-.36em\\raisebox{" + latexRaiseA + "}{\\scriptstyle A}") + "\\kern-.15em\\TeX}{LaTeX}}");
defineMacro("\\KaTeX", "\\textrm{\\html@mathml{" + ("K\\kern-.17em\\raisebox{" + latexRaiseA + "}{\\scriptstyle A}") + "\\kern-.15em\\TeX}{KaTeX}}");
defineMacro("\\hspace", "\\@ifstar\\@hspacer\\@hspace");
defineMacro("\\@hspace", "\\hskip #1\\relax");
defineMacro("\\@hspacer", "\\rule{0pt}{0pt}\\hskip #1\\relax");
defineMacro("\\ordinarycolon", ":");
defineMacro("\\vcentcolon", "\\mathrel{\\mathop\\ordinarycolon}");
defineMacro("\\dblcolon", '\\html@mathml{\\mathrel{\\vcentcolon\\mathrel{\\mkern-.9mu}\\vcentcolon}}{\\mathop{\\char"2237}}');
defineMacro("\\coloneqq", '\\html@mathml{\\mathrel{\\vcentcolon\\mathrel{\\mkern-1.2mu}=}}{\\mathop{\\char"2254}}');
defineMacro("\\Coloneqq", '\\html@mathml{\\mathrel{\\dblcolon\\mathrel{\\mkern-1.2mu}=}}{\\mathop{\\char"2237\\char"3d}}');
defineMacro("\\coloneq", '\\html@mathml{\\mathrel{\\vcentcolon\\mathrel{\\mkern-1.2mu}\\mathrel{-}}}{\\mathop{\\char"3a\\char"2212}}');
defineMacro("\\Coloneq", '\\html@mathml{\\mathrel{\\dblcolon\\mathrel{\\mkern-1.2mu}\\mathrel{-}}}{\\mathop{\\char"2237\\char"2212}}');
defineMacro("\\eqqcolon", '\\html@mathml{\\mathrel{=\\mathrel{\\mkern-1.2mu}\\vcentcolon}}{\\mathop{\\char"2255}}');
defineMacro("\\Eqqcolon", '\\html@mathml{\\mathrel{=\\mathrel{\\mkern-1.2mu}\\dblcolon}}{\\mathop{\\char"3d\\char"2237}}');
defineMacro("\\eqcolon", '\\html@mathml{\\mathrel{\\mathrel{-}\\mathrel{\\mkern-1.2mu}\\vcentcolon}}{\\mathop{\\char"2239}}');
defineMacro("\\Eqcolon", '\\html@mathml{\\mathrel{\\mathrel{-}\\mathrel{\\mkern-1.2mu}\\dblcolon}}{\\mathop{\\char"2212\\char"2237}}');
defineMacro("\\colonapprox", '\\html@mathml{\\mathrel{\\vcentcolon\\mathrel{\\mkern-1.2mu}\\approx}}{\\mathop{\\char"3a\\char"2248}}');
defineMacro("\\Colonapprox", '\\html@mathml{\\mathrel{\\dblcolon\\mathrel{\\mkern-1.2mu}\\approx}}{\\mathop{\\char"2237\\char"2248}}');
defineMacro("\\colonsim", '\\html@mathml{\\mathrel{\\vcentcolon\\mathrel{\\mkern-1.2mu}\\sim}}{\\mathop{\\char"3a\\char"223c}}');
defineMacro("\\Colonsim", '\\html@mathml{\\mathrel{\\dblcolon\\mathrel{\\mkern-1.2mu}\\sim}}{\\mathop{\\char"2237\\char"223c}}');
defineMacro("\u2237", "\\dblcolon");
defineMacro("\u2239", "\\eqcolon");
defineMacro("\u2254", "\\coloneqq");
defineMacro("\u2255", "\\eqqcolon");
defineMacro("\u2A74", "\\Coloneqq");
defineMacro("\\ratio", "\\vcentcolon");
defineMacro("\\coloncolon", "\\dblcolon");
defineMacro("\\colonequals", "\\coloneqq");
defineMacro("\\coloncolonequals", "\\Coloneqq");
defineMacro("\\equalscolon", "\\eqqcolon");
defineMacro("\\equalscoloncolon", "\\Eqqcolon");
defineMacro("\\colonminus", "\\coloneq");
defineMacro("\\coloncolonminus", "\\Coloneq");
defineMacro("\\minuscolon", "\\eqcolon");
defineMacro("\\minuscoloncolon", "\\Eqcolon");
defineMacro("\\coloncolonapprox", "\\Colonapprox");
defineMacro("\\coloncolonsim", "\\Colonsim");
defineMacro("\\simcolon", "\\mathrel{\\sim\\mathrel{\\mkern-1.2mu}\\vcentcolon}");
defineMacro("\\simcoloncolon", "\\mathrel{\\sim\\mathrel{\\mkern-1.2mu}\\dblcolon}");
defineMacro("\\approxcolon", "\\mathrel{\\approx\\mathrel{\\mkern-1.2mu}\\vcentcolon}");
defineMacro("\\approxcoloncolon", "\\mathrel{\\approx\\mathrel{\\mkern-1.2mu}\\dblcolon}");
defineMacro("\\notni", "\\html@mathml{\\not\\ni}{\\mathrel{\\char`\u220C}}");
defineMacro("\\limsup", "\\DOTSB\\operatorname*{lim\\,sup}");
defineMacro("\\liminf", "\\DOTSB\\operatorname*{lim\\,inf}");
defineMacro("\\injlim", "\\DOTSB\\operatorname*{inj\\,lim}");
defineMacro("\\projlim", "\\DOTSB\\operatorname*{proj\\,lim}");
defineMacro("\\varlimsup", "\\DOTSB\\operatorname*{\\overline{lim}}");
defineMacro("\\varliminf", "\\DOTSB\\operatorname*{\\underline{lim}}");
defineMacro("\\varinjlim", "\\DOTSB\\operatorname*{\\underrightarrow{lim}}");
defineMacro("\\varprojlim", "\\DOTSB\\operatorname*{\\underleftarrow{lim}}");
defineMacro("\\gvertneqq", "\\html@mathml{\\@gvertneqq}{\u2269}");
defineMacro("\\lvertneqq", "\\html@mathml{\\@lvertneqq}{\u2268}");
defineMacro("\\ngeqq", "\\html@mathml{\\@ngeqq}{\u2271}");
defineMacro("\\ngeqslant", "\\html@mathml{\\@ngeqslant}{\u2271}");
defineMacro("\\nleqq", "\\html@mathml{\\@nleqq}{\u2270}");
defineMacro("\\nleqslant", "\\html@mathml{\\@nleqslant}{\u2270}");
defineMacro("\\nshortmid", "\\html@mathml{\\@nshortmid}{\u2224}");
defineMacro("\\nshortparallel", "\\html@mathml{\\@nshortparallel}{\u2226}");
defineMacro("\\nsubseteqq", "\\html@mathml{\\@nsubseteqq}{\u2288}");
defineMacro("\\nsupseteqq", "\\html@mathml{\\@nsupseteqq}{\u2289}");
defineMacro("\\varsubsetneq", "\\html@mathml{\\@varsubsetneq}{\u228A}");
defineMacro("\\varsubsetneqq", "\\html@mathml{\\@varsubsetneqq}{\u2ACB}");
defineMacro("\\varsupsetneq", "\\html@mathml{\\@varsupsetneq}{\u228B}");
defineMacro("\\varsupsetneqq", "\\html@mathml{\\@varsupsetneqq}{\u2ACC}");
defineMacro("\\imath", "\\html@mathml{\\@imath}{\u0131}");
defineMacro("\\jmath", "\\html@mathml{\\@jmath}{\u0237}");
defineMacro("\\llbracket", "\\html@mathml{\\mathopen{[\\mkern-3.2mu[}}{\\mathopen{\\char`\u27E6}}");
defineMacro("\\rrbracket", "\\html@mathml{\\mathclose{]\\mkern-3.2mu]}}{\\mathclose{\\char`\u27E7}}");
defineMacro("\u27E6", "\\llbracket");
defineMacro("\u27E7", "\\rrbracket");
defineMacro("\\lBrace", "\\html@mathml{\\mathopen{\\{\\mkern-3.2mu[}}{\\mathopen{\\char`\u2983}}");
defineMacro("\\rBrace", "\\html@mathml{\\mathclose{]\\mkern-3.2mu\\}}}{\\mathclose{\\char`\u2984}}");
defineMacro("\u2983", "\\lBrace");
defineMacro("\u2984", "\\rBrace");
defineMacro("\\minuso", "\\mathbin{\\html@mathml{{\\mathrlap{\\mathchoice{\\kern{0.145em}}{\\kern{0.145em}}{\\kern{0.1015em}}{\\kern{0.0725em}}\\circ}{-}}}{\\char`\u29B5}}");
defineMacro("\u29B5", "\\minuso");
defineMacro("\\darr", "\\downarrow");
defineMacro("\\dArr", "\\Downarrow");
defineMacro("\\Darr", "\\Downarrow");
defineMacro("\\lang", "\\langle");
defineMacro("\\rang", "\\rangle");
defineMacro("\\uarr", "\\uparrow");
defineMacro("\\uArr", "\\Uparrow");
defineMacro("\\Uarr", "\\Uparrow");
defineMacro("\\N", "\\mathbb{N}");
defineMacro("\\R", "\\mathbb{R}");
defineMacro("\\Z", "\\mathbb{Z}");
defineMacro("\\alef", "\\aleph");
defineMacro("\\alefsym", "\\aleph");
defineMacro("\\Alpha", "\\mathrm{A}");
defineMacro("\\Beta", "\\mathrm{B}");
defineMacro("\\bull", "\\bullet");
defineMacro("\\Chi", "\\mathrm{X}");
defineMacro("\\clubs", "\\clubsuit");
defineMacro("\\cnums", "\\mathbb{C}");
defineMacro("\\Complex", "\\mathbb{C}");
defineMacro("\\Dagger", "\\ddagger");
defineMacro("\\diamonds", "\\diamondsuit");
defineMacro("\\empty", "\\emptyset");
defineMacro("\\Epsilon", "\\mathrm{E}");
defineMacro("\\Eta", "\\mathrm{H}");
defineMacro("\\exist", "\\exists");
defineMacro("\\harr", "\\leftrightarrow");
defineMacro("\\hArr", "\\Leftrightarrow");
defineMacro("\\Harr", "\\Leftrightarrow");
defineMacro("\\hearts", "\\heartsuit");
defineMacro("\\image", "\\Im");
defineMacro("\\infin", "\\infty");
defineMacro("\\Iota", "\\mathrm{I}");
defineMacro("\\isin", "\\in");
defineMacro("\\Kappa", "\\mathrm{K}");
defineMacro("\\larr", "\\leftarrow");
defineMacro("\\lArr", "\\Leftarrow");
defineMacro("\\Larr", "\\Leftarrow");
defineMacro("\\lrarr", "\\leftrightarrow");
defineMacro("\\lrArr", "\\Leftrightarrow");
defineMacro("\\Lrarr", "\\Leftrightarrow");
defineMacro("\\Mu", "\\mathrm{M}");
defineMacro("\\natnums", "\\mathbb{N}");
defineMacro("\\Nu", "\\mathrm{N}");
defineMacro("\\Omicron", "\\mathrm{O}");
defineMacro("\\plusmn", "\\pm");
defineMacro("\\rarr", "\\rightarrow");
defineMacro("\\rArr", "\\Rightarrow");
defineMacro("\\Rarr", "\\Rightarrow");
defineMacro("\\real", "\\Re");
defineMacro("\\reals", "\\mathbb{R}");
defineMacro("\\Reals", "\\mathbb{R}");
defineMacro("\\Rho", "\\mathrm{P}");
defineMacro("\\sdot", "\\cdot");
defineMacro("\\sect", "\\S");
defineMacro("\\spades", "\\spadesuit");
defineMacro("\\sub", "\\subset");
defineMacro("\\sube", "\\subseteq");
defineMacro("\\supe", "\\supseteq");
defineMacro("\\Tau", "\\mathrm{T}");
defineMacro("\\thetasym", "\\vartheta");
defineMacro("\\weierp", "\\wp");
defineMacro("\\Zeta", "\\mathrm{Z}");
defineMacro("\\argmin", "\\DOTSB\\operatorname*{arg\\,min}");
defineMacro("\\argmax", "\\DOTSB\\operatorname*{arg\\,max}");
defineMacro("\\plim", "\\DOTSB\\mathop{\\operatorname{plim}}\\limits");
defineMacro("\\bra", "\\mathinner{\\langle{#1}|}");
defineMacro("\\ket", "\\mathinner{|{#1}\\rangle}");
defineMacro("\\braket", "\\mathinner{\\langle{#1}\\rangle}");
defineMacro("\\Bra", "\\left\\langle#1\\right|");
defineMacro("\\Ket", "\\left|#1\\right\\rangle");
var braketHelper = (one) => (context) => {
  var left = context.consumeArg().tokens;
  var middle = context.consumeArg().tokens;
  var middleDouble = context.consumeArg().tokens;
  var right = context.consumeArg().tokens;
  var oldMiddle = context.macros.get("|");
  var oldMiddleDouble = context.macros.get("\\|");
  context.macros.beginGroup();
  var midMacro = (double) => (context2) => {
    if (one) {
      context2.macros.set("|", oldMiddle);
      if (middleDouble.length) {
        context2.macros.set("\\|", oldMiddleDouble);
      }
    }
    var doubled = double;
    if (!double && middleDouble.length) {
      var nextToken = context2.future();
      if (nextToken.text === "|") {
        context2.popToken();
        doubled = true;
      }
    }
    return {
      tokens: doubled ? middleDouble : middle,
      numArgs: 0
    };
  };
  context.macros.set("|", midMacro(false));
  if (middleDouble.length) {
    context.macros.set("\\|", midMacro(true));
  }
  var arg = context.consumeArg().tokens;
  var expanded2 = context.expandTokens([
    ...right,
    ...arg,
    ...left
    // reversed
  ]);
  context.macros.endGroup();
  return {
    tokens: expanded2.reverse(),
    numArgs: 0
  };
};
defineMacro("\\bra@ket", braketHelper(false));
defineMacro("\\bra@set", braketHelper(true));
defineMacro("\\Braket", "\\bra@ket{\\left\\langle}{\\,\\middle\\vert\\,}{\\,\\middle\\vert\\,}{\\right\\rangle}");
defineMacro("\\Set", "\\bra@set{\\left\\{\\:}{\\;\\middle\\vert\\;}{\\;\\middle\\Vert\\;}{\\:\\right\\}}");
defineMacro("\\set", "\\bra@set{\\{\\,}{\\mid}{}{\\,\\}}");
defineMacro("\\angln", "{\\angl n}");
defineMacro("\\blue", "\\textcolor{##6495ed}{#1}");
defineMacro("\\orange", "\\textcolor{##ffa500}{#1}");
defineMacro("\\pink", "\\textcolor{##ff00af}{#1}");
defineMacro("\\red", "\\textcolor{##df0030}{#1}");
defineMacro("\\green", "\\textcolor{##28ae7b}{#1}");
defineMacro("\\gray", "\\textcolor{gray}{#1}");
defineMacro("\\purple", "\\textcolor{##9d38bd}{#1}");
defineMacro("\\blueA", "\\textcolor{##ccfaff}{#1}");
defineMacro("\\blueB", "\\textcolor{##80f6ff}{#1}");
defineMacro("\\blueC", "\\textcolor{##63d9ea}{#1}");
defineMacro("\\blueD", "\\textcolor{##11accd}{#1}");
defineMacro("\\blueE", "\\textcolor{##0c7f99}{#1}");
defineMacro("\\tealA", "\\textcolor{##94fff5}{#1}");
defineMacro("\\tealB", "\\textcolor{##26edd5}{#1}");
defineMacro("\\tealC", "\\textcolor{##01d1c1}{#1}");
defineMacro("\\tealD", "\\textcolor{##01a995}{#1}");
defineMacro("\\tealE", "\\textcolor{##208170}{#1}");
defineMacro("\\greenA", "\\textcolor{##b6ffb0}{#1}");
defineMacro("\\greenB", "\\textcolor{##8af281}{#1}");
defineMacro("\\greenC", "\\textcolor{##74cf70}{#1}");
defineMacro("\\greenD", "\\textcolor{##1fab54}{#1}");
defineMacro("\\greenE", "\\textcolor{##0d923f}{#1}");
defineMacro("\\goldA", "\\textcolor{##ffd0a9}{#1}");
defineMacro("\\goldB", "\\textcolor{##ffbb71}{#1}");
defineMacro("\\goldC", "\\textcolor{##ff9c39}{#1}");
defineMacro("\\goldD", "\\textcolor{##e07d10}{#1}");
defineMacro("\\goldE", "\\textcolor{##a75a05}{#1}");
defineMacro("\\redA", "\\textcolor{##fca9a9}{#1}");
defineMacro("\\redB", "\\textcolor{##ff8482}{#1}");
defineMacro("\\redC", "\\textcolor{##f9685d}{#1}");
defineMacro("\\redD", "\\textcolor{##e84d39}{#1}");
defineMacro("\\redE", "\\textcolor{##bc2612}{#1}");
defineMacro("\\maroonA", "\\textcolor{##ffbde0}{#1}");
defineMacro("\\maroonB", "\\textcolor{##ff92c6}{#1}");
defineMacro("\\maroonC", "\\textcolor{##ed5fa6}{#1}");
defineMacro("\\maroonD", "\\textcolor{##ca337c}{#1}");
defineMacro("\\maroonE", "\\textcolor{##9e034e}{#1}");
defineMacro("\\purpleA", "\\textcolor{##ddd7ff}{#1}");
defineMacro("\\purpleB", "\\textcolor{##c6b9fc}{#1}");
defineMacro("\\purpleC", "\\textcolor{##aa87ff}{#1}");
defineMacro("\\purpleD", "\\textcolor{##7854ab}{#1}");
defineMacro("\\purpleE", "\\textcolor{##543b78}{#1}");
defineMacro("\\mintA", "\\textcolor{##f5f9e8}{#1}");
defineMacro("\\mintB", "\\textcolor{##edf2df}{#1}");
defineMacro("\\mintC", "\\textcolor{##e0e5cc}{#1}");
defineMacro("\\grayA", "\\textcolor{##f6f7f7}{#1}");
defineMacro("\\grayB", "\\textcolor{##f0f1f2}{#1}");
defineMacro("\\grayC", "\\textcolor{##e3e5e6}{#1}");
defineMacro("\\grayD", "\\textcolor{##d6d8da}{#1}");
defineMacro("\\grayE", "\\textcolor{##babec2}{#1}");
defineMacro("\\grayF", "\\textcolor{##888d93}{#1}");
defineMacro("\\grayG", "\\textcolor{##626569}{#1}");
defineMacro("\\grayH", "\\textcolor{##3b3e40}{#1}");
defineMacro("\\grayI", "\\textcolor{##21242c}{#1}");
defineMacro("\\kaBlue", "\\textcolor{##314453}{#1}");
defineMacro("\\kaGreen", "\\textcolor{##71B307}{#1}");
var implicitCommands = {
  "^": true,
  // Parser.js
  "_": true,
  // Parser.js
  "\\limits": true,
  // Parser.js
  "\\nolimits": true
  // Parser.js
};
var MacroExpander = class {
  constructor(input, settings, mode) {
    this.settings = void 0;
    this.expansionCount = void 0;
    this.lexer = void 0;
    this.macros = void 0;
    this.stack = void 0;
    this.mode = void 0;
    this.settings = settings;
    this.expansionCount = 0;
    this.feed(input);
    this.macros = new Namespace(macros, settings.macros);
    this.mode = mode;
    this.stack = [];
  }
  /**
   * Feed a new input string to the same MacroExpander
   * (with existing macros etc.).
   */
  feed(input) {
    this.lexer = new Lexer(input, this.settings);
  }
  /**
   * Switches between "text" and "math" modes.
   */
  switchMode(newMode) {
    this.mode = newMode;
  }
  /**
   * Start a new group nesting within all namespaces.
   */
  beginGroup() {
    this.macros.beginGroup();
  }
  /**
   * End current group nesting within all namespaces.
   */
  endGroup() {
    this.macros.endGroup();
  }
  /**
   * Ends all currently nested groups (if any), restoring values before the
   * groups began.  Useful in case of an error in the middle of parsing.
   */
  endGroups() {
    this.macros.endGroups();
  }
  /**
   * Returns the topmost token on the stack, without expanding it.
   * Similar in behavior to TeX's `\futurelet`.
   */
  future() {
    if (this.stack.length === 0) {
      this.pushToken(this.lexer.lex());
    }
    return this.stack[this.stack.length - 1];
  }
  /**
   * Remove and return the next unexpanded token.
   */
  popToken() {
    this.future();
    return this.stack.pop();
  }
  /**
   * Add a given token to the token stack.  In particular, this get be used
   * to put back a token returned from one of the other methods.
   */
  pushToken(token) {
    this.stack.push(token);
  }
  /**
   * Append an array of tokens to the token stack.
   */
  pushTokens(tokens) {
    this.stack.push(...tokens);
  }
  /**
   * Find an macro argument without expanding tokens and append the array of
   * tokens to the token stack. Uses Token as a container for the result.
   */
  scanArgument(isOptional) {
    var start;
    var end;
    var tokens;
    if (isOptional) {
      this.consumeSpaces();
      if (this.future().text !== "[") {
        return null;
      }
      start = this.popToken();
      ({
        tokens,
        end
      } = this.consumeArg(["]"]));
    } else {
      ({
        tokens,
        start,
        end
      } = this.consumeArg());
    }
    this.pushToken(new Token("EOF", end.loc));
    this.pushTokens(tokens);
    return start.range(end, "");
  }
  /**
   * Consume all following space tokens, without expansion.
   */
  consumeSpaces() {
    for (; ; ) {
      var token = this.future();
      if (token.text === " ") {
        this.stack.pop();
      } else {
        break;
      }
    }
  }
  /**
   * Consume an argument from the token stream, and return the resulting array
   * of tokens and start/end token.
   */
  consumeArg(delims) {
    var tokens = [];
    var isDelimited = delims && delims.length > 0;
    if (!isDelimited) {
      this.consumeSpaces();
    }
    var start = this.future();
    var tok;
    var depth = 0;
    var match = 0;
    do {
      tok = this.popToken();
      tokens.push(tok);
      if (tok.text === "{") {
        ++depth;
      } else if (tok.text === "}") {
        --depth;
        if (depth === -1) {
          throw new ParseError("Extra }", tok);
        }
      } else if (tok.text === "EOF") {
        throw new ParseError("Unexpected end of input in a macro argument, expected '" + (delims && isDelimited ? delims[match] : "}") + "'", tok);
      }
      if (delims && isDelimited) {
        if ((depth === 0 || depth === 1 && delims[match] === "{") && tok.text === delims[match]) {
          ++match;
          if (match === delims.length) {
            tokens.splice(-match, match);
            break;
          }
        } else {
          match = 0;
        }
      }
    } while (depth !== 0 || isDelimited);
    if (start.text === "{" && tokens[tokens.length - 1].text === "}") {
      tokens.pop();
      tokens.shift();
    }
    tokens.reverse();
    return {
      tokens,
      start,
      end: tok
    };
  }
  /**
   * Consume the specified number of (delimited) arguments from the token
   * stream and return the resulting array of arguments.
   */
  consumeArgs(numArgs, delimiters2) {
    if (delimiters2) {
      if (delimiters2.length !== numArgs + 1) {
        throw new ParseError("The length of delimiters doesn't match the number of args!");
      }
      var delims = delimiters2[0];
      for (var i2 = 0; i2 < delims.length; i2++) {
        var tok = this.popToken();
        if (delims[i2] !== tok.text) {
          throw new ParseError("Use of the macro doesn't match its definition", tok);
        }
      }
    }
    var args = [];
    for (var _i6 = 0; _i6 < numArgs; _i6++) {
      args.push(this.consumeArg(delimiters2 && delimiters2[_i6 + 1]).tokens);
    }
    return args;
  }
  /**
   * Increment `expansionCount` by the specified amount.
   * Throw an error if it exceeds `maxExpand`.
   */
  countExpansion(amount) {
    this.expansionCount += amount;
    if (this.expansionCount > this.settings.maxExpand) {
      throw new ParseError("Too many expansions: infinite loop or need to increase maxExpand setting");
    }
  }
  /**
   * Expand the next token only once if possible.
   *
   * If the token is expanded, the resulting tokens will be pushed onto
   * the stack in reverse order, and the number of such tokens will be
   * returned.  This number might be zero or positive.
   *
   * If not, the return value is `false`, and the next token remains at the
   * top of the stack.
   *
   * In either case, the next token will be on the top of the stack,
   * or the stack will be empty (in case of empty expansion
   * and no other tokens).
   *
   * Used to implement `expandAfterFuture` and `expandNextToken`.
   *
   * If expandableOnly, only expandable tokens are expanded and
   * an undefined control sequence results in an error.
   */
  expandOnce(expandableOnly) {
    var topToken = this.popToken();
    var name = topToken.text;
    var expansion = !topToken.noexpand ? this._getExpansion(name) : null;
    if (expansion == null || expandableOnly && expansion.unexpandable) {
      if (expandableOnly && expansion == null && name[0] === "\\" && !this.isDefined(name)) {
        throw new ParseError("Undefined control sequence: " + name);
      }
      this.pushToken(topToken);
      return false;
    }
    this.countExpansion(1);
    var tokens = expansion.tokens;
    var args = this.consumeArgs(expansion.numArgs, expansion.delimiters);
    if (expansion.numArgs) {
      tokens = tokens.slice();
      for (var i2 = tokens.length - 1; i2 >= 0; --i2) {
        var tok = tokens[i2];
        if (tok.text === "#") {
          if (i2 === 0) {
            throw new ParseError("Incomplete placeholder at end of macro body", tok);
          }
          tok = tokens[--i2];
          if (tok.text === "#") {
            tokens.splice(i2 + 1, 1);
          } else if (/^[1-9]$/.test(tok.text)) {
            tokens.splice(i2, 2, ...args[+tok.text - 1]);
          } else {
            throw new ParseError("Not a valid argument number", tok);
          }
        }
      }
    }
    this.pushTokens(tokens);
    return tokens.length;
  }
  /**
   * Expand the next token only once (if possible), and return the resulting
   * top token on the stack (without removing anything from the stack).
   * Similar in behavior to TeX's `\expandafter\futurelet`.
   * Equivalent to expandOnce() followed by future().
   */
  expandAfterFuture() {
    this.expandOnce();
    return this.future();
  }
  /**
   * Recursively expand first token, then return first non-expandable token.
   */
  expandNextToken() {
    for (; ; ) {
      if (this.expandOnce() === false) {
        var token = this.stack.pop();
        if (token.treatAsRelax) {
          token.text = "\\relax";
        }
        return token;
      }
    }
    throw new Error();
  }
  /**
   * Fully expand the given macro name and return the resulting list of
   * tokens, or return `undefined` if no such macro is defined.
   */
  expandMacro(name) {
    return this.macros.has(name) ? this.expandTokens([new Token(name)]) : void 0;
  }
  /**
   * Fully expand the given token stream and return the resulting list of
   * tokens.  Note that the input tokens are in reverse order, but the
   * output tokens are in forward order.
   */
  expandTokens(tokens) {
    var output = [];
    var oldStackLength = this.stack.length;
    this.pushTokens(tokens);
    while (this.stack.length > oldStackLength) {
      if (this.expandOnce(true) === false) {
        var token = this.stack.pop();
        if (token.treatAsRelax) {
          token.noexpand = false;
          token.treatAsRelax = false;
        }
        output.push(token);
      }
    }
    this.countExpansion(output.length);
    return output;
  }
  /**
   * Fully expand the given macro name and return the result as a string,
   * or return `undefined` if no such macro is defined.
   */
  expandMacroAsText(name) {
    var tokens = this.expandMacro(name);
    if (tokens) {
      return tokens.map((token) => token.text).join("");
    } else {
      return tokens;
    }
  }
  /**
   * Returns the expanded macro as a reversed array of tokens and a macro
   * argument count.  Or returns `null` if no such macro.
   */
  _getExpansion(name) {
    var definition = this.macros.get(name);
    if (definition == null) {
      return definition;
    }
    if (name.length === 1) {
      var catcode = this.lexer.catcodes[name];
      if (catcode != null && catcode !== 13) {
        return;
      }
    }
    var expansion = typeof definition === "function" ? definition(this) : definition;
    if (typeof expansion === "string") {
      var numArgs = 0;
      if (expansion.indexOf("#") !== -1) {
        var stripped = expansion.replace(/##/g, "");
        while (stripped.indexOf("#" + (numArgs + 1)) !== -1) {
          ++numArgs;
        }
      }
      var bodyLexer = new Lexer(expansion, this.settings);
      var tokens = [];
      var tok = bodyLexer.lex();
      while (tok.text !== "EOF") {
        tokens.push(tok);
        tok = bodyLexer.lex();
      }
      tokens.reverse();
      var expanded2 = {
        tokens,
        numArgs
      };
      return expanded2;
    }
    return expansion;
  }
  /**
   * Determine whether a command is currently "defined" (has some
   * functionality), meaning that it's a macro (in the current group),
   * a function, a symbol, or one of the special commands listed in
   * `implicitCommands`.
   */
  isDefined(name) {
    return this.macros.has(name) || functions.hasOwnProperty(name) || symbols.math.hasOwnProperty(name) || symbols.text.hasOwnProperty(name) || implicitCommands.hasOwnProperty(name);
  }
  /**
   * Determine whether a command is expandable.
   */
  isExpandable(name) {
    var macro = this.macros.get(name);
    return macro != null ? typeof macro === "string" || typeof macro === "function" || !macro.unexpandable : functions.hasOwnProperty(name) && !functions[name].primitive;
  }
};
var unicodeSubRegEx = /^[₊₋₌₍₎₀₁₂₃₄₅₆₇₈₉ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓᵦᵧᵨᵩᵪ]/;
var uSubsAndSups = Object.freeze({
  "\u208A": "+",
  "\u208B": "-",
  "\u208C": "=",
  "\u208D": "(",
  "\u208E": ")",
  "\u2080": "0",
  "\u2081": "1",
  "\u2082": "2",
  "\u2083": "3",
  "\u2084": "4",
  "\u2085": "5",
  "\u2086": "6",
  "\u2087": "7",
  "\u2088": "8",
  "\u2089": "9",
  "\u2090": "a",
  "\u2091": "e",
  "\u2095": "h",
  "\u1D62": "i",
  "\u2C7C": "j",
  "\u2096": "k",
  "\u2097": "l",
  "\u2098": "m",
  "\u2099": "n",
  "\u2092": "o",
  "\u209A": "p",
  "\u1D63": "r",
  "\u209B": "s",
  "\u209C": "t",
  "\u1D64": "u",
  "\u1D65": "v",
  "\u2093": "x",
  "\u1D66": "\u03B2",
  "\u1D67": "\u03B3",
  "\u1D68": "\u03C1",
  "\u1D69": "\u03D5",
  "\u1D6A": "\u03C7",
  "\u207A": "+",
  "\u207B": "-",
  "\u207C": "=",
  "\u207D": "(",
  "\u207E": ")",
  "\u2070": "0",
  "\xB9": "1",
  "\xB2": "2",
  "\xB3": "3",
  "\u2074": "4",
  "\u2075": "5",
  "\u2076": "6",
  "\u2077": "7",
  "\u2078": "8",
  "\u2079": "9",
  "\u1D2C": "A",
  "\u1D2E": "B",
  "\u1D30": "D",
  "\u1D31": "E",
  "\u1D33": "G",
  "\u1D34": "H",
  "\u1D35": "I",
  "\u1D36": "J",
  "\u1D37": "K",
  "\u1D38": "L",
  "\u1D39": "M",
  "\u1D3A": "N",
  "\u1D3C": "O",
  "\u1D3E": "P",
  "\u1D3F": "R",
  "\u1D40": "T",
  "\u1D41": "U",
  "\u2C7D": "V",
  "\u1D42": "W",
  "\u1D43": "a",
  "\u1D47": "b",
  "\u1D9C": "c",
  "\u1D48": "d",
  "\u1D49": "e",
  "\u1DA0": "f",
  "\u1D4D": "g",
  "\u02B0": "h",
  "\u2071": "i",
  "\u02B2": "j",
  "\u1D4F": "k",
  "\u02E1": "l",
  "\u1D50": "m",
  "\u207F": "n",
  "\u1D52": "o",
  "\u1D56": "p",
  "\u02B3": "r",
  "\u02E2": "s",
  "\u1D57": "t",
  "\u1D58": "u",
  "\u1D5B": "v",
  "\u02B7": "w",
  "\u02E3": "x",
  "\u02B8": "y",
  "\u1DBB": "z",
  "\u1D5D": "\u03B2",
  "\u1D5E": "\u03B3",
  "\u1D5F": "\u03B4",
  "\u1D60": "\u03D5",
  "\u1D61": "\u03C7",
  "\u1DBF": "\u03B8"
});
var unicodeAccents = {
  "\u0301": {
    "text": "\\'",
    "math": "\\acute"
  },
  "\u0300": {
    "text": "\\`",
    "math": "\\grave"
  },
  "\u0308": {
    "text": '\\"',
    "math": "\\ddot"
  },
  "\u0303": {
    "text": "\\~",
    "math": "\\tilde"
  },
  "\u0304": {
    "text": "\\=",
    "math": "\\bar"
  },
  "\u0306": {
    "text": "\\u",
    "math": "\\breve"
  },
  "\u030C": {
    "text": "\\v",
    "math": "\\check"
  },
  "\u0302": {
    "text": "\\^",
    "math": "\\hat"
  },
  "\u0307": {
    "text": "\\.",
    "math": "\\dot"
  },
  "\u030A": {
    "text": "\\r",
    "math": "\\mathring"
  },
  "\u030B": {
    "text": "\\H"
  },
  "\u0327": {
    "text": "\\c"
  }
};
var unicodeSymbols = {
  "\xE1": "a\u0301",
  "\xE0": "a\u0300",
  "\xE4": "a\u0308",
  "\u01DF": "a\u0308\u0304",
  "\xE3": "a\u0303",
  "\u0101": "a\u0304",
  "\u0103": "a\u0306",
  "\u1EAF": "a\u0306\u0301",
  "\u1EB1": "a\u0306\u0300",
  "\u1EB5": "a\u0306\u0303",
  "\u01CE": "a\u030C",
  "\xE2": "a\u0302",
  "\u1EA5": "a\u0302\u0301",
  "\u1EA7": "a\u0302\u0300",
  "\u1EAB": "a\u0302\u0303",
  "\u0227": "a\u0307",
  "\u01E1": "a\u0307\u0304",
  "\xE5": "a\u030A",
  "\u01FB": "a\u030A\u0301",
  "\u1E03": "b\u0307",
  "\u0107": "c\u0301",
  "\u1E09": "c\u0327\u0301",
  "\u010D": "c\u030C",
  "\u0109": "c\u0302",
  "\u010B": "c\u0307",
  "\xE7": "c\u0327",
  "\u010F": "d\u030C",
  "\u1E0B": "d\u0307",
  "\u1E11": "d\u0327",
  "\xE9": "e\u0301",
  "\xE8": "e\u0300",
  "\xEB": "e\u0308",
  "\u1EBD": "e\u0303",
  "\u0113": "e\u0304",
  "\u1E17": "e\u0304\u0301",
  "\u1E15": "e\u0304\u0300",
  "\u0115": "e\u0306",
  "\u1E1D": "e\u0327\u0306",
  "\u011B": "e\u030C",
  "\xEA": "e\u0302",
  "\u1EBF": "e\u0302\u0301",
  "\u1EC1": "e\u0302\u0300",
  "\u1EC5": "e\u0302\u0303",
  "\u0117": "e\u0307",
  "\u0229": "e\u0327",
  "\u1E1F": "f\u0307",
  "\u01F5": "g\u0301",
  "\u1E21": "g\u0304",
  "\u011F": "g\u0306",
  "\u01E7": "g\u030C",
  "\u011D": "g\u0302",
  "\u0121": "g\u0307",
  "\u0123": "g\u0327",
  "\u1E27": "h\u0308",
  "\u021F": "h\u030C",
  "\u0125": "h\u0302",
  "\u1E23": "h\u0307",
  "\u1E29": "h\u0327",
  "\xED": "i\u0301",
  "\xEC": "i\u0300",
  "\xEF": "i\u0308",
  "\u1E2F": "i\u0308\u0301",
  "\u0129": "i\u0303",
  "\u012B": "i\u0304",
  "\u012D": "i\u0306",
  "\u01D0": "i\u030C",
  "\xEE": "i\u0302",
  "\u01F0": "j\u030C",
  "\u0135": "j\u0302",
  "\u1E31": "k\u0301",
  "\u01E9": "k\u030C",
  "\u0137": "k\u0327",
  "\u013A": "l\u0301",
  "\u013E": "l\u030C",
  "\u013C": "l\u0327",
  "\u1E3F": "m\u0301",
  "\u1E41": "m\u0307",
  "\u0144": "n\u0301",
  "\u01F9": "n\u0300",
  "\xF1": "n\u0303",
  "\u0148": "n\u030C",
  "\u1E45": "n\u0307",
  "\u0146": "n\u0327",
  "\xF3": "o\u0301",
  "\xF2": "o\u0300",
  "\xF6": "o\u0308",
  "\u022B": "o\u0308\u0304",
  "\xF5": "o\u0303",
  "\u1E4D": "o\u0303\u0301",
  "\u1E4F": "o\u0303\u0308",
  "\u022D": "o\u0303\u0304",
  "\u014D": "o\u0304",
  "\u1E53": "o\u0304\u0301",
  "\u1E51": "o\u0304\u0300",
  "\u014F": "o\u0306",
  "\u01D2": "o\u030C",
  "\xF4": "o\u0302",
  "\u1ED1": "o\u0302\u0301",
  "\u1ED3": "o\u0302\u0300",
  "\u1ED7": "o\u0302\u0303",
  "\u022F": "o\u0307",
  "\u0231": "o\u0307\u0304",
  "\u0151": "o\u030B",
  "\u1E55": "p\u0301",
  "\u1E57": "p\u0307",
  "\u0155": "r\u0301",
  "\u0159": "r\u030C",
  "\u1E59": "r\u0307",
  "\u0157": "r\u0327",
  "\u015B": "s\u0301",
  "\u1E65": "s\u0301\u0307",
  "\u0161": "s\u030C",
  "\u1E67": "s\u030C\u0307",
  "\u015D": "s\u0302",
  "\u1E61": "s\u0307",
  "\u015F": "s\u0327",
  "\u1E97": "t\u0308",
  "\u0165": "t\u030C",
  "\u1E6B": "t\u0307",
  "\u0163": "t\u0327",
  "\xFA": "u\u0301",
  "\xF9": "u\u0300",
  "\xFC": "u\u0308",
  "\u01D8": "u\u0308\u0301",
  "\u01DC": "u\u0308\u0300",
  "\u01D6": "u\u0308\u0304",
  "\u01DA": "u\u0308\u030C",
  "\u0169": "u\u0303",
  "\u1E79": "u\u0303\u0301",
  "\u016B": "u\u0304",
  "\u1E7B": "u\u0304\u0308",
  "\u016D": "u\u0306",
  "\u01D4": "u\u030C",
  "\xFB": "u\u0302",
  "\u016F": "u\u030A",
  "\u0171": "u\u030B",
  "\u1E7D": "v\u0303",
  "\u1E83": "w\u0301",
  "\u1E81": "w\u0300",
  "\u1E85": "w\u0308",
  "\u0175": "w\u0302",
  "\u1E87": "w\u0307",
  "\u1E98": "w\u030A",
  "\u1E8D": "x\u0308",
  "\u1E8B": "x\u0307",
  "\xFD": "y\u0301",
  "\u1EF3": "y\u0300",
  "\xFF": "y\u0308",
  "\u1EF9": "y\u0303",
  "\u0233": "y\u0304",
  "\u0177": "y\u0302",
  "\u1E8F": "y\u0307",
  "\u1E99": "y\u030A",
  "\u017A": "z\u0301",
  "\u017E": "z\u030C",
  "\u1E91": "z\u0302",
  "\u017C": "z\u0307",
  "\xC1": "A\u0301",
  "\xC0": "A\u0300",
  "\xC4": "A\u0308",
  "\u01DE": "A\u0308\u0304",
  "\xC3": "A\u0303",
  "\u0100": "A\u0304",
  "\u0102": "A\u0306",
  "\u1EAE": "A\u0306\u0301",
  "\u1EB0": "A\u0306\u0300",
  "\u1EB4": "A\u0306\u0303",
  "\u01CD": "A\u030C",
  "\xC2": "A\u0302",
  "\u1EA4": "A\u0302\u0301",
  "\u1EA6": "A\u0302\u0300",
  "\u1EAA": "A\u0302\u0303",
  "\u0226": "A\u0307",
  "\u01E0": "A\u0307\u0304",
  "\xC5": "A\u030A",
  "\u01FA": "A\u030A\u0301",
  "\u1E02": "B\u0307",
  "\u0106": "C\u0301",
  "\u1E08": "C\u0327\u0301",
  "\u010C": "C\u030C",
  "\u0108": "C\u0302",
  "\u010A": "C\u0307",
  "\xC7": "C\u0327",
  "\u010E": "D\u030C",
  "\u1E0A": "D\u0307",
  "\u1E10": "D\u0327",
  "\xC9": "E\u0301",
  "\xC8": "E\u0300",
  "\xCB": "E\u0308",
  "\u1EBC": "E\u0303",
  "\u0112": "E\u0304",
  "\u1E16": "E\u0304\u0301",
  "\u1E14": "E\u0304\u0300",
  "\u0114": "E\u0306",
  "\u1E1C": "E\u0327\u0306",
  "\u011A": "E\u030C",
  "\xCA": "E\u0302",
  "\u1EBE": "E\u0302\u0301",
  "\u1EC0": "E\u0302\u0300",
  "\u1EC4": "E\u0302\u0303",
  "\u0116": "E\u0307",
  "\u0228": "E\u0327",
  "\u1E1E": "F\u0307",
  "\u01F4": "G\u0301",
  "\u1E20": "G\u0304",
  "\u011E": "G\u0306",
  "\u01E6": "G\u030C",
  "\u011C": "G\u0302",
  "\u0120": "G\u0307",
  "\u0122": "G\u0327",
  "\u1E26": "H\u0308",
  "\u021E": "H\u030C",
  "\u0124": "H\u0302",
  "\u1E22": "H\u0307",
  "\u1E28": "H\u0327",
  "\xCD": "I\u0301",
  "\xCC": "I\u0300",
  "\xCF": "I\u0308",
  "\u1E2E": "I\u0308\u0301",
  "\u0128": "I\u0303",
  "\u012A": "I\u0304",
  "\u012C": "I\u0306",
  "\u01CF": "I\u030C",
  "\xCE": "I\u0302",
  "\u0130": "I\u0307",
  "\u0134": "J\u0302",
  "\u1E30": "K\u0301",
  "\u01E8": "K\u030C",
  "\u0136": "K\u0327",
  "\u0139": "L\u0301",
  "\u013D": "L\u030C",
  "\u013B": "L\u0327",
  "\u1E3E": "M\u0301",
  "\u1E40": "M\u0307",
  "\u0143": "N\u0301",
  "\u01F8": "N\u0300",
  "\xD1": "N\u0303",
  "\u0147": "N\u030C",
  "\u1E44": "N\u0307",
  "\u0145": "N\u0327",
  "\xD3": "O\u0301",
  "\xD2": "O\u0300",
  "\xD6": "O\u0308",
  "\u022A": "O\u0308\u0304",
  "\xD5": "O\u0303",
  "\u1E4C": "O\u0303\u0301",
  "\u1E4E": "O\u0303\u0308",
  "\u022C": "O\u0303\u0304",
  "\u014C": "O\u0304",
  "\u1E52": "O\u0304\u0301",
  "\u1E50": "O\u0304\u0300",
  "\u014E": "O\u0306",
  "\u01D1": "O\u030C",
  "\xD4": "O\u0302",
  "\u1ED0": "O\u0302\u0301",
  "\u1ED2": "O\u0302\u0300",
  "\u1ED6": "O\u0302\u0303",
  "\u022E": "O\u0307",
  "\u0230": "O\u0307\u0304",
  "\u0150": "O\u030B",
  "\u1E54": "P\u0301",
  "\u1E56": "P\u0307",
  "\u0154": "R\u0301",
  "\u0158": "R\u030C",
  "\u1E58": "R\u0307",
  "\u0156": "R\u0327",
  "\u015A": "S\u0301",
  "\u1E64": "S\u0301\u0307",
  "\u0160": "S\u030C",
  "\u1E66": "S\u030C\u0307",
  "\u015C": "S\u0302",
  "\u1E60": "S\u0307",
  "\u015E": "S\u0327",
  "\u0164": "T\u030C",
  "\u1E6A": "T\u0307",
  "\u0162": "T\u0327",
  "\xDA": "U\u0301",
  "\xD9": "U\u0300",
  "\xDC": "U\u0308",
  "\u01D7": "U\u0308\u0301",
  "\u01DB": "U\u0308\u0300",
  "\u01D5": "U\u0308\u0304",
  "\u01D9": "U\u0308\u030C",
  "\u0168": "U\u0303",
  "\u1E78": "U\u0303\u0301",
  "\u016A": "U\u0304",
  "\u1E7A": "U\u0304\u0308",
  "\u016C": "U\u0306",
  "\u01D3": "U\u030C",
  "\xDB": "U\u0302",
  "\u016E": "U\u030A",
  "\u0170": "U\u030B",
  "\u1E7C": "V\u0303",
  "\u1E82": "W\u0301",
  "\u1E80": "W\u0300",
  "\u1E84": "W\u0308",
  "\u0174": "W\u0302",
  "\u1E86": "W\u0307",
  "\u1E8C": "X\u0308",
  "\u1E8A": "X\u0307",
  "\xDD": "Y\u0301",
  "\u1EF2": "Y\u0300",
  "\u0178": "Y\u0308",
  "\u1EF8": "Y\u0303",
  "\u0232": "Y\u0304",
  "\u0176": "Y\u0302",
  "\u1E8E": "Y\u0307",
  "\u0179": "Z\u0301",
  "\u017D": "Z\u030C",
  "\u1E90": "Z\u0302",
  "\u017B": "Z\u0307",
  "\u03AC": "\u03B1\u0301",
  "\u1F70": "\u03B1\u0300",
  "\u1FB1": "\u03B1\u0304",
  "\u1FB0": "\u03B1\u0306",
  "\u03AD": "\u03B5\u0301",
  "\u1F72": "\u03B5\u0300",
  "\u03AE": "\u03B7\u0301",
  "\u1F74": "\u03B7\u0300",
  "\u03AF": "\u03B9\u0301",
  "\u1F76": "\u03B9\u0300",
  "\u03CA": "\u03B9\u0308",
  "\u0390": "\u03B9\u0308\u0301",
  "\u1FD2": "\u03B9\u0308\u0300",
  "\u1FD1": "\u03B9\u0304",
  "\u1FD0": "\u03B9\u0306",
  "\u03CC": "\u03BF\u0301",
  "\u1F78": "\u03BF\u0300",
  "\u03CD": "\u03C5\u0301",
  "\u1F7A": "\u03C5\u0300",
  "\u03CB": "\u03C5\u0308",
  "\u03B0": "\u03C5\u0308\u0301",
  "\u1FE2": "\u03C5\u0308\u0300",
  "\u1FE1": "\u03C5\u0304",
  "\u1FE0": "\u03C5\u0306",
  "\u03CE": "\u03C9\u0301",
  "\u1F7C": "\u03C9\u0300",
  "\u038E": "\u03A5\u0301",
  "\u1FEA": "\u03A5\u0300",
  "\u03AB": "\u03A5\u0308",
  "\u1FE9": "\u03A5\u0304",
  "\u1FE8": "\u03A5\u0306",
  "\u038F": "\u03A9\u0301",
  "\u1FFA": "\u03A9\u0300"
};
var Parser = class _Parser {
  constructor(input, settings) {
    this.mode = void 0;
    this.gullet = void 0;
    this.settings = void 0;
    this.leftrightDepth = void 0;
    this.nextToken = void 0;
    this.mode = "math";
    this.gullet = new MacroExpander(input, settings, this.mode);
    this.settings = settings;
    this.leftrightDepth = 0;
  }
  /**
   * Checks a result to make sure it has the right type, and throws an
   * appropriate error otherwise.
   */
  expect(text2, consume) {
    if (consume === void 0) {
      consume = true;
    }
    if (this.fetch().text !== text2) {
      throw new ParseError("Expected '" + text2 + "', got '" + this.fetch().text + "'", this.fetch());
    }
    if (consume) {
      this.consume();
    }
  }
  /**
   * Discards the current lookahead token, considering it consumed.
   */
  consume() {
    this.nextToken = null;
  }
  /**
   * Return the current lookahead token, or if there isn't one (at the
   * beginning, or if the previous lookahead token was consume()d),
   * fetch the next token as the new lookahead token and return it.
   */
  fetch() {
    if (this.nextToken == null) {
      this.nextToken = this.gullet.expandNextToken();
    }
    return this.nextToken;
  }
  /**
   * Switches between "text" and "math" modes.
   */
  switchMode(newMode) {
    this.mode = newMode;
    this.gullet.switchMode(newMode);
  }
  /**
   * Main parsing function, which parses an entire input.
   */
  parse() {
    if (!this.settings.globalGroup) {
      this.gullet.beginGroup();
    }
    if (this.settings.colorIsTextColor) {
      this.gullet.macros.set("\\color", "\\textcolor");
    }
    try {
      var parse = this.parseExpression(false);
      this.expect("EOF");
      if (!this.settings.globalGroup) {
        this.gullet.endGroup();
      }
      return parse;
    } finally {
      this.gullet.endGroups();
    }
  }
  /**
   * Fully parse a separate sequence of tokens as a separate job.
   * Tokens should be specified in reverse order, as in a MacroDefinition.
   */
  subparse(tokens) {
    var oldToken = this.nextToken;
    this.consume();
    this.gullet.pushToken(new Token("}"));
    this.gullet.pushTokens(tokens);
    var parse = this.parseExpression(false);
    this.expect("}");
    this.nextToken = oldToken;
    return parse;
  }
  /**
   * Parses an "expression", which is a list of atoms.
   *
   * `breakOnInfix`: Should the parsing stop when we hit infix nodes? This
   *                 happens when functions have higher precedence han infix
   *                 nodes in implicit parses.
   *
   * `breakOnTokenText`: The text of the token that the expression should end
   *                     with, or `null` if something else should end the
   *                     expression.
   */
  parseExpression(breakOnInfix, breakOnTokenText) {
    var body = [];
    while (true) {
      if (this.mode === "math") {
        this.consumeSpaces();
      }
      var lex = this.fetch();
      if (_Parser.endOfExpression.indexOf(lex.text) !== -1) {
        break;
      }
      if (breakOnTokenText && lex.text === breakOnTokenText) {
        break;
      }
      if (breakOnInfix && functions[lex.text] && functions[lex.text].infix) {
        break;
      }
      var atom = this.parseAtom(breakOnTokenText);
      if (!atom) {
        break;
      } else if (atom.type === "internal") {
        continue;
      }
      body.push(atom);
    }
    if (this.mode === "text") {
      this.formLigatures(body);
    }
    return this.handleInfixNodes(body);
  }
  /**
   * Rewrites infix operators such as \over with corresponding commands such
   * as \frac.
   *
   * There can only be one infix operator per group.  If there's more than one
   * then the expression is ambiguous.  This can be resolved by adding {}.
   */
  handleInfixNodes(body) {
    var overIndex = -1;
    var funcName;
    for (var i2 = 0; i2 < body.length; i2++) {
      if (body[i2].type === "infix") {
        if (overIndex !== -1) {
          throw new ParseError("only one infix operator per group", body[i2].token);
        }
        overIndex = i2;
        funcName = body[i2].replaceWith;
      }
    }
    if (overIndex !== -1 && funcName) {
      var numerNode;
      var denomNode;
      var numerBody = body.slice(0, overIndex);
      var denomBody = body.slice(overIndex + 1);
      if (numerBody.length === 1 && numerBody[0].type === "ordgroup") {
        numerNode = numerBody[0];
      } else {
        numerNode = {
          type: "ordgroup",
          mode: this.mode,
          body: numerBody
        };
      }
      if (denomBody.length === 1 && denomBody[0].type === "ordgroup") {
        denomNode = denomBody[0];
      } else {
        denomNode = {
          type: "ordgroup",
          mode: this.mode,
          body: denomBody
        };
      }
      var node;
      if (funcName === "\\\\abovefrac") {
        node = this.callFunction(funcName, [numerNode, body[overIndex], denomNode], []);
      } else {
        node = this.callFunction(funcName, [numerNode, denomNode], []);
      }
      return [node];
    } else {
      return body;
    }
  }
  /**
   * Handle a subscript or superscript with nice errors.
   */
  handleSupSubscript(name) {
    var symbolToken = this.fetch();
    var symbol = symbolToken.text;
    this.consume();
    this.consumeSpaces();
    var group2;
    do {
      var _group;
      group2 = this.parseGroup(name);
    } while (((_group = group2) == null ? void 0 : _group.type) === "internal");
    if (!group2) {
      throw new ParseError("Expected group after '" + symbol + "'", symbolToken);
    }
    return group2;
  }
  /**
   * Converts the textual input of an unsupported command into a text node
   * contained within a color node whose color is determined by errorColor
   */
  formatUnsupportedCmd(text2) {
    var textordArray = [];
    for (var i2 = 0; i2 < text2.length; i2++) {
      textordArray.push({
        type: "textord",
        mode: "text",
        text: text2[i2]
      });
    }
    var textNode = {
      type: "text",
      mode: this.mode,
      body: textordArray
    };
    var colorNode = {
      type: "color",
      mode: this.mode,
      color: this.settings.errorColor,
      body: [textNode]
    };
    return colorNode;
  }
  /**
   * Parses a group with optional super/subscripts.
   */
  parseAtom(breakOnTokenText) {
    var base = this.parseGroup("atom", breakOnTokenText);
    if ((base == null ? void 0 : base.type) === "internal") {
      return base;
    }
    if (this.mode === "text") {
      return base;
    }
    var superscript;
    var subscript;
    while (true) {
      this.consumeSpaces();
      var lex = this.fetch();
      if (lex.text === "\\limits" || lex.text === "\\nolimits") {
        if (base && base.type === "op") {
          var limits = lex.text === "\\limits";
          base.limits = limits;
          base.alwaysHandleSupSub = true;
        } else if (base && base.type === "operatorname") {
          if (base.alwaysHandleSupSub) {
            base.limits = lex.text === "\\limits";
          }
        } else {
          throw new ParseError("Limit controls must follow a math operator", lex);
        }
        this.consume();
      } else if (lex.text === "^") {
        if (superscript) {
          throw new ParseError("Double superscript", lex);
        }
        superscript = this.handleSupSubscript("superscript");
      } else if (lex.text === "_") {
        if (subscript) {
          throw new ParseError("Double subscript", lex);
        }
        subscript = this.handleSupSubscript("subscript");
      } else if (lex.text === "'") {
        if (superscript) {
          throw new ParseError("Double superscript", lex);
        }
        var prime = {
          type: "textord",
          mode: this.mode,
          text: "\\prime"
        };
        var primes = [prime];
        this.consume();
        while (this.fetch().text === "'") {
          primes.push(prime);
          this.consume();
        }
        if (this.fetch().text === "^") {
          primes.push(this.handleSupSubscript("superscript"));
        }
        superscript = {
          type: "ordgroup",
          mode: this.mode,
          body: primes
        };
      } else if (uSubsAndSups[lex.text]) {
        var isSub = unicodeSubRegEx.test(lex.text);
        var subsupTokens = [];
        subsupTokens.push(new Token(uSubsAndSups[lex.text]));
        this.consume();
        while (true) {
          var token = this.fetch().text;
          if (!uSubsAndSups[token]) {
            break;
          }
          if (unicodeSubRegEx.test(token) !== isSub) {
            break;
          }
          subsupTokens.unshift(new Token(uSubsAndSups[token]));
          this.consume();
        }
        var body = this.subparse(subsupTokens);
        if (isSub) {
          subscript = {
            type: "ordgroup",
            mode: "math",
            body
          };
        } else {
          superscript = {
            type: "ordgroup",
            mode: "math",
            body
          };
        }
      } else {
        break;
      }
    }
    if (superscript || subscript) {
      return {
        type: "supsub",
        mode: this.mode,
        base,
        sup: superscript,
        sub: subscript
      };
    } else {
      return base;
    }
  }
  /**
   * Parses an entire function, including its base and all of its arguments.
   */
  parseFunction(breakOnTokenText, name) {
    var token = this.fetch();
    var func = token.text;
    var funcData = functions[func];
    if (!funcData) {
      return null;
    }
    this.consume();
    if (name && name !== "atom" && !funcData.allowedInArgument) {
      throw new ParseError("Got function '" + func + "' with no arguments" + (name ? " as " + name : ""), token);
    } else if (this.mode === "text" && !funcData.allowedInText) {
      throw new ParseError("Can't use function '" + func + "' in text mode", token);
    } else if (this.mode === "math" && funcData.allowedInMath === false) {
      throw new ParseError("Can't use function '" + func + "' in math mode", token);
    }
    var {
      args,
      optArgs
    } = this.parseArguments(func, funcData);
    return this.callFunction(func, args, optArgs, token, breakOnTokenText);
  }
  /**
   * Call a function handler with a suitable context and arguments.
   */
  callFunction(name, args, optArgs, token, breakOnTokenText) {
    var context = {
      funcName: name,
      parser: this,
      token,
      breakOnTokenText
    };
    var func = functions[name];
    if (func && func.handler) {
      return func.handler(context, args, optArgs);
    } else {
      throw new ParseError("No function handler for " + name);
    }
  }
  /**
   * Parses the arguments of a function or environment
   */
  parseArguments(func, funcData) {
    var totalArgs = funcData.numArgs + funcData.numOptionalArgs;
    if (totalArgs === 0) {
      return {
        args: [],
        optArgs: []
      };
    }
    var args = [];
    var optArgs = [];
    for (var i2 = 0; i2 < totalArgs; i2++) {
      var argType = funcData.argTypes && funcData.argTypes[i2];
      var isOptional = i2 < funcData.numOptionalArgs;
      if (funcData.primitive && argType == null || // \sqrt expands into primitive if optional argument doesn't exist
      funcData.type === "sqrt" && i2 === 1 && optArgs[0] == null) {
        argType = "primitive";
      }
      var arg = this.parseGroupOfType("argument to '" + func + "'", argType, isOptional);
      if (isOptional) {
        optArgs.push(arg);
      } else if (arg != null) {
        args.push(arg);
      } else {
        throw new ParseError("Null argument, please report this as a bug");
      }
    }
    return {
      args,
      optArgs
    };
  }
  /**
   * Parses a group when the mode is changing.
   */
  parseGroupOfType(name, type, optional) {
    switch (type) {
      case "color":
        return this.parseColorGroup(optional);
      case "size":
        return this.parseSizeGroup(optional);
      case "url":
        return this.parseUrlGroup(optional);
      case "math":
      case "text":
        return this.parseArgumentGroup(optional, type);
      case "hbox": {
        var group2 = this.parseArgumentGroup(optional, "text");
        return group2 != null ? {
          type: "styling",
          mode: group2.mode,
          body: [group2],
          style: "text"
          // simulate \textstyle
        } : null;
      }
      case "raw": {
        var token = this.parseStringGroup("raw", optional);
        return token != null ? {
          type: "raw",
          mode: "text",
          string: token.text
        } : null;
      }
      case "primitive": {
        if (optional) {
          throw new ParseError("A primitive argument cannot be optional");
        }
        var _group2 = this.parseGroup(name);
        if (_group2 == null) {
          throw new ParseError("Expected group as " + name, this.fetch());
        }
        return _group2;
      }
      case "original":
      case null:
      case void 0:
        return this.parseArgumentGroup(optional);
      default:
        throw new ParseError("Unknown group type as " + name, this.fetch());
    }
  }
  /**
   * Discard any space tokens, fetching the next non-space token.
   */
  consumeSpaces() {
    while (this.fetch().text === " ") {
      this.consume();
    }
  }
  /**
   * Parses a group, essentially returning the string formed by the
   * brace-enclosed tokens plus some position information.
   */
  parseStringGroup(modeName, optional) {
    var argToken = this.gullet.scanArgument(optional);
    if (argToken == null) {
      return null;
    }
    var str = "";
    var nextToken;
    while ((nextToken = this.fetch()).text !== "EOF") {
      str += nextToken.text;
      this.consume();
    }
    this.consume();
    argToken.text = str;
    return argToken;
  }
  /**
   * Parses a regex-delimited group: the largest sequence of tokens
   * whose concatenated strings match `regex`. Returns the string
   * formed by the tokens plus some position information.
   */
  parseRegexGroup(regex, modeName) {
    var firstToken = this.fetch();
    var lastToken = firstToken;
    var str = "";
    var nextToken;
    while ((nextToken = this.fetch()).text !== "EOF" && regex.test(str + nextToken.text)) {
      lastToken = nextToken;
      str += lastToken.text;
      this.consume();
    }
    if (str === "") {
      throw new ParseError("Invalid " + modeName + ": '" + firstToken.text + "'", firstToken);
    }
    return firstToken.range(lastToken, str);
  }
  /**
   * Parses a color description.
   */
  parseColorGroup(optional) {
    var res = this.parseStringGroup("color", optional);
    if (res == null) {
      return null;
    }
    var match = /^(#[a-f0-9]{3}|#?[a-f0-9]{6}|[a-z]+)$/i.exec(res.text);
    if (!match) {
      throw new ParseError("Invalid color: '" + res.text + "'", res);
    }
    var color = match[0];
    if (/^[0-9a-f]{6}$/i.test(color)) {
      color = "#" + color;
    }
    return {
      type: "color-token",
      mode: this.mode,
      color
    };
  }
  /**
   * Parses a size specification, consisting of magnitude and unit.
   */
  parseSizeGroup(optional) {
    var res;
    var isBlank = false;
    this.gullet.consumeSpaces();
    if (!optional && this.gullet.future().text !== "{") {
      res = this.parseRegexGroup(/^[-+]? *(?:$|\d+|\d+\.\d*|\.\d*) *[a-z]{0,2} *$/, "size");
    } else {
      res = this.parseStringGroup("size", optional);
    }
    if (!res) {
      return null;
    }
    if (!optional && res.text.length === 0) {
      res.text = "0pt";
      isBlank = true;
    }
    var match = /([-+]?) *(\d+(?:\.\d*)?|\.\d+) *([a-z]{2})/.exec(res.text);
    if (!match) {
      throw new ParseError("Invalid size: '" + res.text + "'", res);
    }
    var data = {
      number: +(match[1] + match[2]),
      // sign + magnitude, cast to number
      unit: match[3]
    };
    if (!validUnit(data)) {
      throw new ParseError("Invalid unit: '" + data.unit + "'", res);
    }
    return {
      type: "size",
      mode: this.mode,
      value: data,
      isBlank
    };
  }
  /**
   * Parses an URL, checking escaped letters and allowed protocols,
   * and setting the catcode of % as an active character (as in \hyperref).
   */
  parseUrlGroup(optional) {
    this.gullet.lexer.setCatcode("%", 13);
    this.gullet.lexer.setCatcode("~", 12);
    var res = this.parseStringGroup("url", optional);
    this.gullet.lexer.setCatcode("%", 14);
    this.gullet.lexer.setCatcode("~", 13);
    if (res == null) {
      return null;
    }
    var url = res.text.replace(/\\([#$%&~_^{}])/g, "$1");
    return {
      type: "url",
      mode: this.mode,
      url
    };
  }
  /**
   * Parses an argument with the mode specified.
   */
  parseArgumentGroup(optional, mode) {
    var argToken = this.gullet.scanArgument(optional);
    if (argToken == null) {
      return null;
    }
    var outerMode = this.mode;
    if (mode) {
      this.switchMode(mode);
    }
    this.gullet.beginGroup();
    var expression = this.parseExpression(false, "EOF");
    this.expect("EOF");
    this.gullet.endGroup();
    var result = {
      type: "ordgroup",
      mode: this.mode,
      loc: argToken.loc,
      body: expression
    };
    if (mode) {
      this.switchMode(outerMode);
    }
    return result;
  }
  /**
   * Parses an ordinary group, which is either a single nucleus (like "x")
   * or an expression in braces (like "{x+y}") or an implicit group, a group
   * that starts at the current position, and ends right before a higher explicit
   * group ends, or at EOF.
   */
  parseGroup(name, breakOnTokenText) {
    var firstToken = this.fetch();
    var text2 = firstToken.text;
    var result;
    if (text2 === "{" || text2 === "\\begingroup") {
      this.consume();
      var groupEnd = text2 === "{" ? "}" : "\\endgroup";
      this.gullet.beginGroup();
      var expression = this.parseExpression(false, groupEnd);
      var lastToken = this.fetch();
      this.expect(groupEnd);
      this.gullet.endGroup();
      result = {
        type: "ordgroup",
        mode: this.mode,
        loc: SourceLocation.range(firstToken, lastToken),
        body: expression,
        // A group formed by \begingroup...\endgroup is a semi-simple group
        // which doesn't affect spacing in math mode, i.e., is transparent.
        // https://tex.stackexchange.com/questions/1930/when-should-one-
        // use-begingroup-instead-of-bgroup
        semisimple: text2 === "\\begingroup" || void 0
      };
    } else {
      result = this.parseFunction(breakOnTokenText, name) || this.parseSymbol();
      if (result == null && text2[0] === "\\" && !implicitCommands.hasOwnProperty(text2)) {
        if (this.settings.throwOnError) {
          throw new ParseError("Undefined control sequence: " + text2, firstToken);
        }
        result = this.formatUnsupportedCmd(text2);
        this.consume();
      }
    }
    return result;
  }
  /**
   * Form ligature-like combinations of characters for text mode.
   * This includes inputs like "--", "---", "``" and "''".
   * The result will simply replace multiple textord nodes with a single
   * character in each value by a single textord node having multiple
   * characters in its value.  The representation is still ASCII source.
   * The group will be modified in place.
   */
  formLigatures(group2) {
    var n = group2.length - 1;
    for (var i2 = 0; i2 < n; ++i2) {
      var a = group2[i2];
      var v = a.text;
      if (v === "-" && group2[i2 + 1].text === "-") {
        if (i2 + 1 < n && group2[i2 + 2].text === "-") {
          group2.splice(i2, 3, {
            type: "textord",
            mode: "text",
            loc: SourceLocation.range(a, group2[i2 + 2]),
            text: "---"
          });
          n -= 2;
        } else {
          group2.splice(i2, 2, {
            type: "textord",
            mode: "text",
            loc: SourceLocation.range(a, group2[i2 + 1]),
            text: "--"
          });
          n -= 1;
        }
      }
      if ((v === "'" || v === "`") && group2[i2 + 1].text === v) {
        group2.splice(i2, 2, {
          type: "textord",
          mode: "text",
          loc: SourceLocation.range(a, group2[i2 + 1]),
          text: v + v
        });
        n -= 1;
      }
    }
  }
  /**
   * Parse a single symbol out of the string. Here, we handle single character
   * symbols and special functions like \verb.
   */
  parseSymbol() {
    var nucleus = this.fetch();
    var text2 = nucleus.text;
    if (/^\\verb[^a-zA-Z]/.test(text2)) {
      this.consume();
      var arg = text2.slice(5);
      var star = arg.charAt(0) === "*";
      if (star) {
        arg = arg.slice(1);
      }
      if (arg.length < 2 || arg.charAt(0) !== arg.slice(-1)) {
        throw new ParseError("\\verb assertion failed --\n                    please report what input caused this bug");
      }
      arg = arg.slice(1, -1);
      return {
        type: "verb",
        mode: "text",
        body: arg,
        star
      };
    }
    if (unicodeSymbols.hasOwnProperty(text2[0]) && !symbols[this.mode][text2[0]]) {
      if (this.settings.strict && this.mode === "math") {
        this.settings.reportNonstrict("unicodeTextInMathMode", 'Accented Unicode text character "' + text2[0] + '" used in math mode', nucleus);
      }
      text2 = unicodeSymbols[text2[0]] + text2.slice(1);
    }
    var match = combiningDiacriticalMarksEndRegex.exec(text2);
    if (match) {
      text2 = text2.substring(0, match.index);
      if (text2 === "i") {
        text2 = "\u0131";
      } else if (text2 === "j") {
        text2 = "\u0237";
      }
    }
    var symbol;
    if (symbols[this.mode][text2]) {
      if (this.settings.strict && this.mode === "math" && extraLatin.indexOf(text2) >= 0) {
        this.settings.reportNonstrict("unicodeTextInMathMode", 'Latin-1/Unicode text character "' + text2[0] + '" used in math mode', nucleus);
      }
      var group2 = symbols[this.mode][text2].group;
      var loc = SourceLocation.range(nucleus);
      var s;
      if (ATOMS.hasOwnProperty(group2)) {
        var family = group2;
        s = {
          type: "atom",
          mode: this.mode,
          family,
          loc,
          text: text2
        };
      } else {
        s = {
          type: group2,
          mode: this.mode,
          loc,
          text: text2
        };
      }
      symbol = s;
    } else if (text2.charCodeAt(0) >= 128) {
      if (this.settings.strict) {
        if (!supportedCodepoint(text2.charCodeAt(0))) {
          this.settings.reportNonstrict("unknownSymbol", 'Unrecognized Unicode character "' + text2[0] + '"' + (" (" + text2.charCodeAt(0) + ")"), nucleus);
        } else if (this.mode === "math") {
          this.settings.reportNonstrict("unicodeTextInMathMode", 'Unicode text character "' + text2[0] + '" used in math mode', nucleus);
        }
      }
      symbol = {
        type: "textord",
        mode: "text",
        loc: SourceLocation.range(nucleus),
        text: text2
      };
    } else {
      return null;
    }
    this.consume();
    if (match) {
      for (var i2 = 0; i2 < match[0].length; i2++) {
        var accent2 = match[0][i2];
        if (!unicodeAccents[accent2]) {
          throw new ParseError("Unknown accent ' " + accent2 + "'", nucleus);
        }
        var command = unicodeAccents[accent2][this.mode] || unicodeAccents[accent2].text;
        if (!command) {
          throw new ParseError("Accent " + accent2 + " unsupported in " + this.mode + " mode", nucleus);
        }
        symbol = {
          type: "accent",
          mode: this.mode,
          loc: SourceLocation.range(nucleus),
          label: command,
          isStretchy: false,
          isShifty: true,
          // $FlowFixMe
          base: symbol
        };
      }
    }
    return symbol;
  }
};
Parser.endOfExpression = ["}", "\\endgroup", "\\end", "\\right", "&"];
var parseTree = function parseTree2(toParse, settings) {
  if (!(typeof toParse === "string" || toParse instanceof String)) {
    throw new TypeError("KaTeX can only parse string typed expression");
  }
  var parser = new Parser(toParse, settings);
  delete parser.gullet.macros.current["\\df@tag"];
  var tree = parser.parse();
  delete parser.gullet.macros.current["\\current@color"];
  delete parser.gullet.macros.current["\\color"];
  if (parser.gullet.macros.get("\\df@tag")) {
    if (!settings.displayMode) {
      throw new ParseError("\\tag works only in display equations");
    }
    tree = [{
      type: "tag",
      mode: "text",
      body: tree,
      tag: parser.subparse([new Token("\\df@tag")])
    }];
  }
  return tree;
};
var render = function render2(expression, baseNode, options) {
  baseNode.textContent = "";
  var node = renderToDomTree(expression, options).toNode();
  baseNode.appendChild(node);
};
if (typeof document !== "undefined") {
  if (document.compatMode !== "CSS1Compat") {
    typeof console !== "undefined" && console.warn("Warning: KaTeX doesn't work in quirks mode. Make sure your website has a suitable doctype.");
    render = function render4() {
      throw new ParseError("KaTeX doesn't work in quirks mode.");
    };
  }
}
var renderToString = function renderToString2(expression, options) {
  var markup = renderToDomTree(expression, options).toMarkup();
  return markup;
};
var generateParseTree = function generateParseTree2(expression, options) {
  var settings = new Settings(options);
  return parseTree(expression, settings);
};
var renderError = function renderError2(error, expression, options) {
  if (options.throwOnError || !(error instanceof ParseError)) {
    throw error;
  }
  var node = buildCommon.makeSpan(["katex-error"], [new SymbolNode(expression)]);
  node.setAttribute("title", error.toString());
  node.setAttribute("style", "color:" + options.errorColor);
  return node;
};
var renderToDomTree = function renderToDomTree2(expression, options) {
  var settings = new Settings(options);
  try {
    var tree = parseTree(expression, settings);
    return buildTree(tree, expression, settings);
  } catch (error) {
    return renderError(error, expression, settings);
  }
};
var renderToHTMLTree = function renderToHTMLTree2(expression, options) {
  var settings = new Settings(options);
  try {
    var tree = parseTree(expression, settings);
    return buildHTMLTree(tree, expression, settings);
  } catch (error) {
    return renderError(error, expression, settings);
  }
};
var version = "0.16.22";
var __domTree = {
  Span,
  Anchor,
  SymbolNode,
  SvgNode,
  PathNode,
  LineNode
};
var katex = {
  /**
   * Current KaTeX version
   */
  version,
  /**
   * Renders the given LaTeX into an HTML+MathML combination, and adds
   * it as a child to the specified DOM node.
   */
  render,
  /**
   * Renders the given LaTeX into an HTML+MathML combination string,
   * for sending to the client.
   */
  renderToString,
  /**
   * KaTeX error, usually during parsing.
   */
  ParseError,
  /**
   * The schema of Settings
   */
  SETTINGS_SCHEMA,
  /**
   * Parses the given LaTeX into KaTeX's internal parse tree structure,
   * without rendering to HTML or MathML.
   *
   * NOTE: This method is not currently recommended for public use.
   * The internal tree representation is unstable and is very likely
   * to change. Use at your own risk.
   */
  __parse: generateParseTree,
  /**
   * Renders the given LaTeX into an HTML+MathML internal DOM tree
   * representation, without flattening that representation to a string.
   *
   * NOTE: This method is not currently recommended for public use.
   * The internal tree representation is unstable and is very likely
   * to change. Use at your own risk.
   */
  __renderToDomTree: renderToDomTree,
  /**
   * Renders the given LaTeX into an HTML internal DOM tree representation,
   * without MathML and without flattening that representation to a string.
   *
   * NOTE: This method is not currently recommended for public use.
   * The internal tree representation is unstable and is very likely
   * to change. Use at your own risk.
   */
  __renderToHTMLTree: renderToHTMLTree,
  /**
   * extends internal font metrics object with a new object
   * each key in the new object represents a font name
  */
  __setFontMetrics: setFontMetrics,
  /**
   * adds a new symbol to builtin symbols table
   */
  __defineSymbol: defineSymbol,
  /**
   * adds a new function to builtin function list,
   * which directly produce parse tree elements
   * and have their own html/mathml builders
   */
  __defineFunction: defineFunction,
  /**
   * adds a new macro to builtin macro list
   */
  __defineMacro: defineMacro,
  /**
   * Expose the dom tree node types, which can be useful for type checking nodes.
   *
   * NOTE: These methods are not currently recommended for public use.
   * The internal tree representation is unstable and is very likely
   * to change. Use at your own risk.
   */
  __domTree
};

// src/lib/math/render.ts
var DELIMITERS = /\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]/g;
function splitMath(text2) {
  const out = [];
  let last = 0;
  for (const m of text2.matchAll(DELIMITERS)) {
    const index = m.index ?? 0;
    if (index > last) out.push({ kind: "text", value: text2.slice(last, index), display: false });
    out.push({ kind: "math", value: (m[1] ?? m[2] ?? "").trim(), display: m[2] !== void 0 });
    last = index + m[0].length;
  }
  if (last < text2.length) out.push({ kind: "text", value: text2.slice(last), display: false });
  return out;
}
function escapeHtml(text2) {
  return text2.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}
function renderTex(tex, display = false) {
  try {
    const html = katex.renderToString(tex, { output: "mathml", displayMode: display, throwOnError: false, strict: "ignore", trust: false });
    return markUnaryMinus(html);
  } catch {
    return `<code>${escapeHtml(tex)}</code>`;
  }
}
function markUnaryMinus(html) {
  return html.replace(/(<mo[^>]*>[^<]*<\/mo>)<mo>([−+])<\/mo>/g, '$1<mo form="prefix">$2</mo>');
}
function renderMathHtml(text2) {
  return splitMath(text2).map((s) => s.kind === "math" ? renderTex(s.value, s.display) : escapeHtml(s.value)).join("");
}

// src/lib/questions/spr.ts
var MAX_POSITIVE = 5;
var MAX_NEGATIVE = 6;
function gcd(a, b) {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
}
function rational(num, den) {
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const g = gcd(num, den) || 1n;
  return { num: num / g, den: den / g };
}
function parseNumber(raw) {
  const text2 = raw.trim().replace(/−/g, "-");
  let m = /^(-?)(\d+)$/.exec(text2);
  if (m) return { value: rational(BigInt(m[1] + m[2]), 1n), kind: "integer" };
  m = /^(-?)(\d*)\.(\d+)$/.exec(text2);
  if (m) {
    const digits = m[3];
    const whole = m[2] || "0";
    return { value: rational(BigInt(`${m[1]}${whole}${digits}`), 10n ** BigInt(digits.length)), kind: "decimal" };
  }
  m = /^(-?)(\d+)\s*\/\s*(-?\d+)$/.exec(text2);
  if (m) {
    const den = BigInt(m[3]);
    if (den === 0n) return null;
    return { value: rational(BigInt(m[1] + m[2]), den), kind: "fraction" };
  }
  return null;
}
function parseSprEntry(raw) {
  const text2 = raw.trim().replace(/−/g, "-").replace(/\s*\/\s*/g, "/");
  if (!text2) return { ok: false, error: "Type your answer." };
  if (/\d\s+\d+\/\d/.test(text2)) return { ok: false, error: "Mixed numbers are not allowed: enter 3 1/2 as 7/2 or 3.5." };
  if (/[%$,]/.test(text2)) return { ok: false, error: "Leave out symbols such as %, $ and commas." };
  const parsed = parseNumber(text2);
  if (!parsed) return { ok: false, error: "Enter a number, a decimal or a fraction such as 7/2." };
  const limit = text2.startsWith("-") ? MAX_NEGATIVE : MAX_POSITIVE;
  if (text2.length > limit) {
    return {
      ok: false,
      error: text2.startsWith("-") ? "A negative answer fits in 6 characters, including the minus sign." : "An answer fits in 5 characters. Round or shorten the decimal, or use a fraction."
    };
  }
  return { ok: true, text: text2, value: parsed.value, kind: parsed.kind };
}

// extension/src/types.ts
var LETTERS = ["A", "B", "C", "D"];

// extension/src/addons/dom.ts
function h(tag, props = null, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === void 0 || value === null || value === false) continue;
      if (key === "class") el.className = String(value);
      else if (key === "text") el.textContent = String(value);
      else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === "checked" || key === "disabled" || key === "value") el[key] = value;
      else el.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === void 0 || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return el;
}
var chip = (text2, tone = "") => h("span", { class: `chip ${tone}`.trim(), text: text2 });
var spinner = () => h("span", { class: "spinner", "aria-label": "working" });
function svg(tag, attrs, ...children) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) el.append(typeof c === "string" ? document.createTextNode(c) : c);
  return el;
}

// extension/src/addons/types.ts
var LETTERS2 = ["A", "B", "C", "D"];
function hasChoices(c) {
  return !!c && LETTERS2.every((l) => typeof c[l] === "string" && c[l].trim() !== "");
}
function choicesOf(c) {
  return { A: c?.A ?? "", B: c?.B ?? "", C: c?.C ?? "", D: c?.D ?? "" };
}
function normalizeQuestion(q) {
  return { ...q, choices: choicesOf(q.choices), format: q.format ?? (hasChoices(q.choices) ? "mcq" : "spr") };
}
var MATH_DOMAINS = ["Algebra", "Advanced Math", "Problem-Solving and Data Analysis", "Geometry and Trigonometry"];
var MATH_SKILLS = [
  "Linear equations in one variable",
  "Linear functions",
  "Linear equations in two variables",
  "Systems of two linear equations in two variables",
  "Linear inequalities in one or two variables",
  "Nonlinear functions",
  "Nonlinear equations in one variable and systems of equations in two variables",
  "Equivalent expressions",
  "Ratios, rates, proportional relationships, and units",
  "Percentages",
  "One-variable data: Distributions and measures of center and spread",
  "Two-variable data: Models and scatterplots",
  "Probability and conditional probability",
  "Inference from sample statistics and margin of error",
  "Evaluating statistical claims: Observational studies and experiments",
  "Area and volume",
  "Lines, angles, and triangles",
  "Right triangles and trigonometry",
  "Circles"
];
var fold = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
var MATH_NAMES = new Set([...MATH_DOMAINS, ...MATH_SKILLS].map(fold));
function isMathTaxonomy(domain, skill) {
  return [domain, skill].some((x) => !!x && MATH_NAMES.has(fold(x)));
}

// extension/src/addons/store.ts
var chromeKV = {
  async get(key) {
    const out = await chrome.storage.local.get(key);
    return out[key];
  },
  async set(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },
  async remove(key) {
    await chrome.storage.local.remove(key);
  }
};
function memoryKV(seed = {}) {
  const data = structuredClone(seed);
  return {
    async get(key) {
      return structuredClone(data[key]);
    },
    async set(key, value) {
      data[key] = structuredClone(value);
    },
    async remove(key) {
      delete data[key];
    },
    dump: () => structuredClone(data)
  };
}
var current = null;
function kv() {
  if (!current) current = typeof chrome !== "undefined" && chrome?.storage?.local ? chromeKV : memoryKV();
  return current;
}
var KEYS = {
  log: "rc.addons.log.v1",
  srs: "rc.addons.srs.v1",
  prefs: "rc.addons.prefs.v1",
  timer: "rc.addons.timer.v1",
  sets: "rc.addons.sets.v1",
  /** achievements.ts: { [badgeId]: earnedAt } */
  badges: "rc.addons.badges.v1"
};

// extension/src/addons/log.ts
var MAX_ENTRIES = 1500;
var STEM_MAX = 500;
var PASSAGE_MAX = 1200;
var FIGURE_MAX = 800;
var STEP_MAX = 300;
var STEPS_MAX = 8;
var TYPED_MAX = 20;
var NO_LETTER = "A";
var clip = (s, n) => s ? s.length > n ? `${s.slice(0, n - 1)}\u2026` : s : null;
function uniq(xs) {
  const out = [];
  for (const x of xs) {
    const t = typeof x === "string" ? x.trim() : "";
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}
function isGridIn(e) {
  return e.format === "spr";
}
function hasChoiceList(e) {
  return !isGridIn(e) && hasChoices(e.choices);
}
function sectionOf(e) {
  if (e.section === "math" || e.section === "rw") return e.section;
  return isMathTaxonomy(e.domain, e.skill) ? "math" : "rw";
}
function answerText(e) {
  if (!isGridIn(e)) return e.correct;
  return e.accepted?.[0] ?? "?";
}
function otherAnswers(e) {
  return isGridIn(e) ? (e.accepted ?? []).slice(1) : [];
}
function responseText(e) {
  if (isGridIn(e)) return e.typed ?? null;
  return e.picked === "correct" ? null : e.picked;
}
function entryFromExplain(data, picked, extras = {}) {
  const { card, question } = data;
  const gridIn = question.format === "spr" || picked === "spr";
  const letter = picked === "correct" || picked === "spr" ? null : picked;
  const graded = typeof data.isCorrect === "boolean" ? data.isCorrect : null;
  const right = graded ?? (picked === "correct" || letter !== null && letter === card.correct_letter || card.diagnosis === "got_it_right");
  const domain = question.domain ?? null;
  const skill = question.skill ?? null;
  const steps = uniq(card.steps ?? []).slice(0, STEPS_MAX).map((s) => clip(s, STEP_MAX) ?? "");
  const entry = {
    attemptId: data.attemptId,
    at: extras.now ?? Date.now(),
    ruleId: card.rule_id,
    ruleName: data.rule?.name ?? null,
    ruleStatement: card.rule_statement,
    takeaway: card.takeaway,
    whyCorrect: card.why_correct,
    whyPickFails: card.why_pick_fails ?? null,
    diagnosis: card.diagnosis,
    confidence: card.confidence,
    picked: letter ?? "correct",
    correct: gridIn ? NO_LETTER : card.correct_letter ?? question.correct ?? NO_LETTER,
    result: right ? "right" : "missed",
    qbId: question.qbId ?? null,
    domain,
    skill,
    difficulty: question.difficulty ?? null,
    stem: clip(question.stem, STEM_MAX) ?? "",
    passage: clip(question.passage, PASSAGE_MAX),
    choices: gridIn ? choicesOf(null) : choicesOf(question.choices),
    solvedByModel: Boolean(card.solved_by_model),
    seconds: extras.seconds ?? null,
    note: "",
    starred: false,
    drills: [],
    selfConfidence: extras.selfConfidence ?? null,
    section: sectionOf({ section: question.section, domain, skill }),
    format: gridIn ? "spr" : "mcq"
  };
  if (gridIn) {
    entry.typed = picked === "spr" ? extras.typed?.trim().slice(0, TYPED_MAX) || null : null;
    entry.accepted = uniq([card.correct_answer, ...question.answers ?? []]);
  }
  if (question.figure) entry.figure = clip(question.figure, FIGURE_MAX);
  if (steps.length) entry.steps = steps;
  if (card.shortcut) entry.shortcut = clip(card.shortcut, STEP_MAX);
  return entry;
}
var queue = Promise.resolve();
function serial(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => void 0);
  return run;
}
async function readLog() {
  const raw = await kv().get(KEYS.log);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((e) => {
    const ok = sanitizeEntry(e);
    return ok ? [ok] : [];
  });
}
async function writeLog(entries) {
  entries.sort((a, b) => b.at - a.at);
  await kv().set(KEYS.log, entries.slice(0, MAX_ENTRIES));
}
function recordAttempt(entry) {
  return serial(async () => {
    const entries = (await readLog()).filter((e) => e.attemptId !== entry.attemptId);
    entries.push(entry);
    await writeLog(entries);
    return entries;
  });
}
function updateEntry(attemptId, patch) {
  return serial(async () => {
    const entries = await readLog();
    const hit = entries.find((e) => e.attemptId === attemptId);
    if (!hit) return null;
    Object.assign(hit, patch);
    await writeLog(entries);
    return hit;
  });
}
function recordDrill(attemptId, correct, review2 = false, now = Date.now()) {
  return serial(async () => {
    const entries = await readLog();
    const hit = entries.find((e) => e.attemptId === attemptId);
    if (!hit) return;
    hit.drills.push({ at: now, correct, review: review2 });
    await writeLog(entries);
  });
}
function clearLog() {
  return serial(() => kv().remove(KEYS.log));
}
var isStrings = (x) => Array.isArray(x) && x.every((s) => typeof s === "string");
var isStr = (x) => typeof x === "string";
var isNum = (x) => typeof x === "number" && Number.isFinite(x);
var LETTER_SET = /* @__PURE__ */ new Set(["A", "B", "C", "D"]);
function sanitizeEntry(x) {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const e = x;
  if (!isStr(e.attemptId) || !e.attemptId || !isNum(e.at) || !isStr(e.ruleId) || !isStr(e.stem)) return null;
  if (!isStr(e.correct) || !LETTER_SET.has(e.correct)) return null;
  if (e.picked !== "correct" && !(isStr(e.picked) && LETTER_SET.has(e.picked))) return null;
  if (e.result !== "right" && e.result !== "missed") return null;
  const drills = Array.isArray(e.drills) ? e.drills.filter((d) => !!d && typeof d === "object" && isNum(d.at) && typeof d.correct === "boolean") : [];
  const text2 = (v, fallback = "") => isStr(v) ? v : fallback;
  const entry = repairEntry({
    ...e,
    drills,
    ruleName: isStr(e.ruleName) ? e.ruleName : null,
    ruleStatement: text2(e.ruleStatement),
    takeaway: text2(e.takeaway),
    whyCorrect: text2(e.whyCorrect),
    whyPickFails: isStr(e.whyPickFails) ? e.whyPickFails : null,
    confidence: isNum(e.confidence) ? e.confidence : 0,
    note: text2(e.note)
  });
  if (!entry.diagnosis || !["misread", "rule_gap", "careless", "got_it_right", "unknown"].includes(entry.diagnosis)) entry.diagnosis = "unknown";
  return entry;
}
function repairEntry(e) {
  const out = {
    ...e,
    choices: choicesOf(e.choices && typeof e.choices === "object" ? e.choices : null),
    drills: Array.isArray(e.drills) ? e.drills : [],
    note: e.note ?? "",
    starred: Boolean(e.starred)
  };
  if (out.section !== void 0 && out.section !== null && out.section !== "rw" && out.section !== "math") delete out.section;
  if (out.format !== void 0 && out.format !== null && out.format !== "mcq" && out.format !== "spr") delete out.format;
  if (out.typed !== void 0 && out.typed !== null && typeof out.typed !== "string") delete out.typed;
  if (out.accepted !== void 0 && !isStrings(out.accepted)) delete out.accepted;
  if (out.steps !== void 0 && !isStrings(out.steps)) delete out.steps;
  return out;
}
function importEntries(incoming) {
  return serial(async () => {
    const entries = await readLog();
    const seen = new Set(entries.map((e) => e.attemptId));
    let added = 0;
    for (const raw of Array.isArray(incoming) ? incoming : []) {
      const e = sanitizeEntry(raw);
      if (!e || seen.has(e.attemptId)) continue;
      entries.push(e);
      seen.add(e.attemptId);
      added++;
    }
    await writeLog(entries);
    return added;
  });
}

// extension/src/addons/srs.ts
var DAY = 864e5;
var INTERVAL_DAYS = [0, 1, 2, 4, 8, 16, 32];
var MAX_BOX = INTERVAL_DAYS.length - 1;
var MASTERED_BOX = 5;
var intervalFor = (box) => (INTERVAL_DAYS[Math.min(Math.max(box, 1), MAX_BOX)] ?? 1) * DAY;
function applyAttempt(state2, entry, now) {
  const next = { ...state2 };
  const prev = state2[entry.ruleId];
  if (entry.result === "missed") {
    next[entry.ruleId] = {
      ruleId: entry.ruleId,
      ruleName: entry.ruleName ?? prev?.ruleName ?? null,
      box: 1,
      due: now + intervalFor(1),
      attemptId: entry.attemptId,
      reps: prev?.reps ?? 0,
      lapses: (prev?.lapses ?? 0) + (prev ? 1 : 0),
      lastReviewed: prev?.lastReviewed ?? null
    };
  } else if (!prev) {
    next[entry.ruleId] = {
      ruleId: entry.ruleId,
      ruleName: entry.ruleName ?? null,
      box: 3,
      due: now + intervalFor(3),
      attemptId: entry.attemptId,
      reps: 0,
      lapses: 0,
      lastReviewed: null
    };
  } else {
    const promoted = now >= prev.due ? Math.min(prev.box + 1, MAX_BOX) : prev.box;
    next[entry.ruleId] = {
      ...prev,
      ruleName: entry.ruleName ?? prev.ruleName,
      attemptId: entry.attemptId,
      box: promoted,
      due: promoted !== prev.box ? now + intervalFor(promoted) : prev.due
    };
  }
  return next;
}
function applyReview(state2, ruleId, correct, now) {
  const prev = state2[ruleId];
  if (!prev) return state2;
  const box = correct ? Math.min(prev.box + 1, MAX_BOX) : 1;
  return {
    ...state2,
    [ruleId]: {
      ...prev,
      box,
      due: now + intervalFor(box),
      reps: prev.reps + 1,
      lapses: prev.lapses + (correct ? 0 : 1),
      lastReviewed: now
    }
  };
}
function dueRules(state2, now) {
  return Object.values(state2).filter((r) => r.due <= now).sort((a, b) => a.due - b.due || b.lapses - a.lapses || a.box - b.box);
}
function nextDue(state2, now) {
  const upcoming = Object.values(state2).filter((r) => r.due > now).sort((a, b) => a.due - b.due);
  return upcoming[0] ?? null;
}
function masteryCounts(state2) {
  let learning = 0, reviewing = 0, mastered2 = 0;
  for (const r of Object.values(state2)) {
    if (r.box >= MASTERED_BOX) mastered2++;
    else if (r.box <= 2) learning++;
    else reviewing++;
  }
  return { learning, reviewing, mastered: mastered2 };
}
function rebuildFromLog(entries) {
  let state2 = {};
  const chronological = [...entries].sort((a, b) => a.at - b.at);
  for (const e of chronological) {
    state2 = applyAttempt(state2, e, e.at);
    for (const d of e.drills) if (d.review) state2 = applyReview(state2, e.ruleId, d.correct, d.at);
  }
  return state2;
}
async function readSrs() {
  return await kv().get(KEYS.srs) ?? {};
}
async function writeSrs(state2) {
  await kv().set(KEYS.srs, state2);
}
function describeDue(ms, now) {
  const diff = ms - now;
  if (diff <= 0) return "due now";
  const hours = Math.round(diff / 36e5);
  if (hours < 24) return `in ${Math.max(1, hours)}h`;
  const days = Math.round(diff / DAY);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

// extension/src/addons/stats.ts
var TARGET_SECONDS = 71;
var MATH_TARGET_SECONDS = 95;
var SECTION_LABEL = { rw: "Reading and Writing", math: "Math" };
function targetSecondsFor(e) {
  if (!e) return TARGET_SECONDS;
  return sectionOf({ section: e.section, domain: e.domain ?? null, skill: e.skill ?? null }) === "math" ? MATH_TARGET_SECONDS : TARGET_SECONDS;
}
function dayKey(ts) {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function shiftDays(ts, days) {
  const d = new Date(ts);
  d.setDate(d.getDate() + days);
  return d.getTime();
}
function group(entries, keyOf, labelOf) {
  const map = /* @__PURE__ */ new Map();
  for (const e of entries) {
    const key = keyOf(e);
    if (!key) continue;
    const g = map.get(key) ?? { key, label: labelOf(e), attempts: 0, misses: 0, missRate: 0, lastAt: 0 };
    g.attempts++;
    if (e.result === "missed") g.misses++;
    if (e.at > g.lastAt) {
      g.lastAt = e.at;
      g.label = labelOf(e);
    }
    map.set(key, g);
  }
  for (const g of map.values()) g.missRate = g.attempts ? g.misses / g.attempts : 0;
  return [...map.values()].sort((a, b) => b.misses - a.misses || b.missRate - a.missRate || b.lastAt - a.lastAt);
}
var acc = (right, total) => total ? right / total : null;
function summarize(entries, srs, now = Date.now()) {
  const right = entries.filter((e) => e.result === "right").length;
  const missed = entries.length - right;
  const missesByDiagnosis = { misread: 0, rule_gap: 0, careless: 0, got_it_right: 0, unknown: 0 };
  for (const e of entries) if (e.result === "missed") missesByDiagnosis[e.diagnosis] = (missesByDiagnosis[e.diagnosis] ?? 0) + 1;
  const days = new Set(entries.map((e) => dayKey(e.at)));
  const today = startOfDay(now);
  const practicedToday = days.has(dayKey(today));
  let cursor = practicedToday ? today : shiftDays(today, -1);
  let streakDays = 0;
  while (days.has(dayKey(cursor))) {
    streakDays++;
    cursor = shiftDays(cursor, -1);
  }
  const daily = [];
  for (let i2 = 13; i2 >= 0; i2--) {
    const day = dayKey(shiftDays(today, -i2));
    const onDay = entries.filter((e) => dayKey(e.at) === day);
    daily.push({ day, attempts: onDay.length, misses: onDay.filter((e) => e.result === "missed").length });
  }
  const drills = entries.flatMap((e) => e.drills);
  const drillsCorrect = drills.filter((d) => d.correct).length;
  const timed = entries.filter((e) => typeof e.seconds === "number" && e.seconds > 0 && e.seconds < 1800);
  const totalSec = timed.reduce((s, e) => s + (e.seconds ?? 0), 0);
  const targetSum = timed.reduce((s, e) => s + targetSecondsFor(e), 0);
  const weekStart = shiftDays(today, -6);
  const prevStart = shiftDays(today, -13);
  const thisWeekE = entries.filter((e) => e.at >= weekStart);
  const lastWeekE = entries.filter((e) => e.at >= prevStart && e.at < weekStart);
  const calibration = { sure: { attempts: 0, right: 0, accuracy: null }, unsure: { attempts: 0, right: 0, accuracy: null }, guess: { attempts: 0, right: 0, accuracy: null } };
  for (const e of entries) {
    if (!e.selfConfidence) continue;
    const c = calibration[e.selfConfidence];
    c.attempts++;
    if (e.result === "right") c.right++;
  }
  for (const c of Object.values(calibration)) c.accuracy = acc(c.right, c.attempts);
  const confidentlyWrong = entries.filter((e) => e.selfConfidence === "sure" && e.result === "missed").length;
  return {
    calibration,
    confidentlyWrong,
    attempts: entries.length,
    right,
    missed,
    accuracy: acc(right, entries.length),
    missesByDiagnosis,
    byRule: group(entries, (e) => e.ruleId, (e) => e.ruleName ? `${e.ruleId} \xB7 ${e.ruleName}` : e.ruleId),
    bySkill: group(entries, (e) => e.skill, (e) => e.skill ?? ""),
    byDifficulty: group(entries, (e) => e.difficulty, (e) => e.difficulty ?? ""),
    bySection: group(entries, (e) => sectionOf(e), (e) => SECTION_LABEL[sectionOf(e)]),
    streakDays,
    practicedToday,
    daily,
    drills: { total: drills.length, correct: drillsCorrect, accuracy: acc(drillsCorrect, drills.length) },
    pacing: {
      timed: timed.length,
      avgSeconds: timed.length ? Math.round(totalSec / timed.length) : null,
      slow: timed.filter((e) => (e.seconds ?? 0) > targetSecondsFor(e)).length,
      target: timed.length ? Math.round(targetSum / timed.length) : TARGET_SECONDS
    },
    mastery: masteryCounts(srs),
    thisWeek: { attempts: thisWeekE.length, accuracy: acc(thisWeekE.filter((e) => e.result === "right").length, thisWeekE.length) },
    lastWeek: { attempts: lastWeekE.length, accuracy: acc(lastWeekE.filter((e) => e.result === "right").length, lastWeekE.length) }
  };
}
var pct = (x) => `${Math.round(x * 100)}%`;
function insights(s, dueCount = 0) {
  const out = [];
  if (s.attempts === 0) {
    return [{ tone: "accent", text: "Capture and explain a few questions and your patterns will show up here." }];
  }
  if (dueCount > 0) out.push({ tone: "accent", text: `${dueCount} rule${dueCount === 1 ? " is" : "s are"} due for review. A quick round now locks them in.` });
  const realMisses = s.missed;
  const mathMisses = s.bySection.find((g) => g.key === "math")?.misses ?? 0;
  if (realMisses >= 4) {
    const careless = s.missesByDiagnosis.careless / realMisses;
    const misread = s.missesByDiagnosis.misread / realMisses;
    const gap = s.missesByDiagnosis.rule_gap / realMisses;
    if (careless >= 0.4)
      out.push({
        tone: "warn",
        text: mathMisses > realMisses / 2 ? `${pct(careless)} of your misses are careless slips, not missing rules. Before you lock an answer, reread what the question asks for (x or 2x, the units) and plug your answer back in.` : `${pct(careless)} of your misses are careless slips, not missing rules. Before you lock an answer, plug it into the blank and read the whole sentence once.`
      });
    if (misread >= 0.35)
      out.push({ tone: "warn", text: `${pct(misread)} of your misses come from misreading. Say what the question asks in your own words before you look at the choices.` });
    if (gap >= 0.5) out.push({ tone: "danger", text: `${pct(gap)} of your misses are rule gaps. Review the rules more and do fewer new questions until those cards stick.` });
  }
  const worst = s.byRule.find((r) => r.misses >= 2);
  if (worst) out.push({ tone: "danger", text: `Your most-missed rule is ${worst.label} (${worst.misses} of ${worst.attempts}). Start your next review there.` });
  const [rw, math2] = ["rw", "math"].map((k) => s.bySection.find((g) => g.key === k));
  if (rw && math2 && rw.attempts >= 5 && math2.attempts >= 5 && Math.abs(rw.missRate - math2.missRate) >= 0.2) {
    const [weak, strong] = rw.missRate > math2.missRate ? [rw, math2] : [math2, rw];
    out.push({ tone: "warn", text: `You miss ${pct(weak.missRate)} in ${weak.label} and ${pct(strong.missRate)} in ${strong.label}. Give ${weak.label} more of your next sessions.` });
  }
  const weakSkill = s.bySkill.find((g) => g.attempts >= 3 && g.missRate >= 0.5);
  if (weakSkill) out.push({ tone: "warn", text: `${weakSkill.label} is your weakest skill (${pct(weakSkill.missRate)} missed). Filter the Question Bank to it for one focused set.` });
  const target = s.pacing.target ?? TARGET_SECONDS;
  if (s.pacing.avgSeconds !== null && s.pacing.timed >= 5 && s.pacing.avgSeconds > target)
    out.push({ tone: "warn", text: `You average ${s.pacing.avgSeconds}s a question. Test pace is about ${target}s, so ${s.pacing.slow} of ${s.pacing.timed} timed questions ran long.` });
  if (s.drills.total >= 5 && s.drills.accuracy !== null && s.drills.accuracy < 0.6)
    out.push({ tone: "warn", text: `Test me accuracy is ${pct(s.drills.accuracy)}. Re-read the rule statement before each drill and say why each wrong choice breaks it.` });
  if (s.thisWeek.accuracy !== null && s.lastWeek.accuracy !== null && s.thisWeek.attempts >= 5 && s.lastWeek.attempts >= 5) {
    const delta = s.thisWeek.accuracy - s.lastWeek.accuracy;
    if (delta >= 0.05) out.push({ tone: "good", text: `Accuracy is up ${pct(delta)} on last week. Keep the same routine.` });
    else if (delta <= -0.05) out.push({ tone: "warn", text: `Accuracy is down ${pct(-delta)} on last week. You may be taking on harder sets; check the difficulty mix below.` });
  }
  if (s.streakDays >= 3) out.push({ tone: "good", text: `${s.streakDays}-day streak.${s.practicedToday ? "" : " Do one question today to keep it going."}` });
  else if (!s.practicedToday && s.streakDays > 0) out.push({ tone: "accent", text: `Do one question today to keep your ${s.streakDays}-day streak.` });
  if (s.confidentlyWrong >= 2)
    out.push({ tone: "danger", text: `You were sure on ${s.confidentlyWrong} questions you missed. Those are misunderstood rules, not slips, so they're worth the most review time.` });
  const sure = s.calibration.sure;
  if (sure.attempts >= 5 && sure.accuracy !== null && sure.accuracy < 0.75)
    out.push({ tone: "warn", text: `When you feel sure, you're right only ${pct(sure.accuracy)} of the time. On easy-looking questions, check every choice before you lock in.` });
  const guess = s.calibration.guess;
  if (guess.attempts >= 5 && guess.accuracy !== null && guess.accuracy >= 0.6)
    out.push({ tone: "good", text: `Your "guesses" are right ${pct(guess.accuracy)} of the time. Your instincts are better than you think.` });
  if (s.mastery.mastered > 0) out.push({ tone: "good", text: `${s.mastery.mastered} rule${s.mastery.mastered === 1 ? "" : "s"} mastered (passed reviews spaced 8+ days apart).` });
  return out;
}
function countdown(testDate, s, now = Date.now()) {
  const m = testDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const days = Math.round((date.getTime() - startOfDay(now)) / 864e5);
  if (days < 0) return null;
  const perDay = Math.round(s.thisWeek.attempts / 7 * 10) / 10;
  return {
    days,
    label: date.toLocaleDateString(void 0, { month: "short", day: "numeric" }),
    perDay,
    projected: Math.round(perDay * days)
  };
}

// extension/src/addons/taxonomy.ts
var RW_DOMAIN_OF = {
  "Central Ideas and Details": "Information and Ideas",
  "Command of Evidence": "Information and Ideas",
  Inferences: "Information and Ideas",
  "Words in Context": "Craft and Structure",
  "Text Structure and Purpose": "Craft and Structure",
  "Cross-Text Connections": "Craft and Structure",
  "Rhetorical Synthesis": "Expression of Ideas",
  Transitions: "Expression of Ideas",
  Boundaries: "Standard English Conventions",
  "Form, Structure, and Sense": "Standard English Conventions"
};
var MATH_DOMAIN_OF = {
  "Linear equations in one variable": "Algebra",
  "Linear functions": "Algebra",
  "Linear equations in two variables": "Algebra",
  "Systems of two linear equations in two variables": "Algebra",
  "Linear inequalities in one or two variables": "Algebra",
  "Nonlinear functions": "Advanced Math",
  "Nonlinear equations in one variable and systems of equations in two variables": "Advanced Math",
  "Equivalent expressions": "Advanced Math",
  "Ratios, rates, proportional relationships, and units": "Problem-Solving and Data Analysis",
  Percentages: "Problem-Solving and Data Analysis",
  "One-variable data: Distributions and measures of center and spread": "Problem-Solving and Data Analysis",
  "Two-variable data: Models and scatterplots": "Problem-Solving and Data Analysis",
  "Probability and conditional probability": "Problem-Solving and Data Analysis",
  "Inference from sample statistics and margin of error": "Problem-Solving and Data Analysis",
  "Evaluating statistical claims: Observational studies and experiments": "Problem-Solving and Data Analysis",
  "Area and volume": "Geometry and Trigonometry",
  "Lines, angles, and triangles": "Geometry and Trigonometry",
  "Right triangles and trigonometry": "Geometry and Trigonometry",
  Circles: "Geometry and Trigonometry"
};
var SKILLS = [
  ...Object.entries(RW_DOMAIN_OF).map(([skill, domain]) => ({ skill, domain, section: "rw" })),
  // Keep upstream's MATH_SKILLS order; fall back to the map if a name ever drifts.
  ...MATH_SKILLS.filter((s) => s in MATH_DOMAIN_OF).map((skill) => ({ skill, domain: MATH_DOMAIN_OF[skill], section: "math" }))
];
var fold2 = (s) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\band\b/g, " ").replace(/\s+/g, " ").trim();
var BY_FOLD = new Map(SKILLS.map((s) => [fold2(s.skill), s]));
var DOMAIN_FOLDS = new Set(SKILLS.map((s) => fold2(s.domain)));
var ALIASES = {
  "central ideas": "Central Ideas and Details",
  "main idea": "Central Ideas and Details",
  evidence: "Command of Evidence",
  inference: "Inferences",
  "words in context": "Words in Context",
  vocab: "Words in Context",
  vocabulary: "Words in Context",
  "text structure": "Text Structure and Purpose",
  purpose: "Text Structure and Purpose",
  "cross text": "Cross-Text Connections",
  synthesis: "Rhetorical Synthesis",
  "rhetorical synthesis": "Rhetorical Synthesis",
  punctuation: "Boundaries",
  grammar: "Form, Structure, and Sense",
  fss: "Form, Structure, and Sense",
  "systems of equations": "Systems of two linear equations in two variables",
  systems: "Systems of two linear equations in two variables",
  ratios: "Ratios, rates, proportional relationships, and units",
  percent: "Percentages",
  percents: "Percentages",
  probability: "Probability and conditional probability",
  trig: "Right triangles and trigonometry",
  trigonometry: "Right triangles and trigonometry",
  scatterplots: "Two-variable data: Models and scatterplots",
  "margin of error": "Inference from sample statistics and margin of error",
  quadratics: "Nonlinear equations in one variable and systems of equations in two variables"
};
function skillInfo(text2) {
  if (!text2) return null;
  const f = fold2(text2);
  if (!f) return null;
  const direct = BY_FOLD.get(f);
  if (direct) return direct;
  const colon = text2.indexOf(":");
  if (colon > 0 && DOMAIN_FOLDS.has(fold2(text2.slice(0, colon)))) {
    const hit = skillInfo(text2.slice(colon + 1));
    if (hit) return hit;
  }
  const alias = ALIASES[f];
  if (alias) return BY_FOLD.get(fold2(alias)) ?? null;
  const hits = SKILLS.filter((s) => {
    const k = fold2(s.skill);
    return k.startsWith(f) || f.length >= 6 && k.includes(f);
  });
  if (hits.length) return hits.length === 1 ? hits[0] : null;
  const words = f.split(" ");
  if (words.length < 2) return null;
  const byWords = SKILLS.filter((s) => {
    const k = new Set(fold2(s.skill).split(" "));
    return words.every((w) => k.has(w));
  });
  return byWords.length === 1 ? byWords[0] : null;
}
var normalizeSkill = (text2) => skillInfo(text2)?.skill ?? null;
var domainOfSkill = (text2) => skillInfo(text2)?.domain ?? null;
var skillsFor = (section) => SKILLS.filter((s) => s.section === section);
function qbFilterSteps(info, difficulty) {
  const test = info.section === "math" ? "Math" : "Reading and Writing";
  return `In the Question Bank pick Assessment: SAT, Test: ${test}, Domain: ${info.domain}, Skill: ${info.skill}${difficulty ? `, Difficulty: ${difficulty}` : ""}.`;
}

// extension/src/addons/achievements.ts
var count = (value, goal) => ({ value, goal });
var volume = (n) => ({
  id: `questions-${n}`,
  group: "volume",
  mark: String(n),
  label: `${n} questions`,
  detail: `Explain ${n} questions with Rulecard.`,
  progress: (m) => count(m.questions, n)
});
var streak = (n) => ({
  id: `streak-${n}`,
  group: "streak",
  mark: `${n}d`,
  label: `${n}-day streak`,
  detail: `Practice ${n} days in a row. Your longest streak counts, so a missed day later won't take it back.`,
  progress: (m) => count(m.longestStreak, n)
});
var mastered = (n) => ({
  id: `mastered-${n}`,
  group: "mastery",
  mark: `M${n}`,
  label: n === 1 ? "First mastered rule" : `${n} rules mastered`,
  detail: n === 1 ? "Get a rule to the mastered box by reviewing it on schedule." : `Get ${n} rules to the mastered box.`,
  progress: (m) => count(m.mastered, n)
});
var reviews = (n) => ({
  id: `reviews-${n}`,
  group: "review",
  mark: `R${n}`,
  label: `${n} review drills right`,
  detail: `Answer ${n} review drills correctly from the Review queue.`,
  progress: (m) => count(m.reviewRight, n)
});
var BADGES = [
  { id: "first-card", group: "start", mark: "1", label: "First rule card", detail: "Explain your first question.", progress: (m) => count(m.questions, 1) },
  { id: "both-sections", group: "start", mark: "RW+M", label: "Both sections", detail: "Practice at least one Reading and Writing and one Math question.", progress: (m) => count(m.sections, 2) },
  ...[10, 50, 100, 250, 500].map(volume),
  ...[3, 7, 14, 30].map(streak),
  ...[1, 5, 10, 25].map(mastered),
  {
    id: "comeback",
    group: "mastery",
    mark: "UP",
    label: "Comeback",
    detail: "Master a rule you had missed at least twice.",
    progress: (m) => count(m.comebacks, 1)
  },
  ...[5, 25].map(reviews),
  {
    id: "perfect-set",
    group: "habits",
    mark: "5/5",
    label: "Perfect set",
    detail: "Get every question right in a practice set of 5 or more.",
    progress: (m) => ({ value: m.perfectSet ? 1 : 0, goal: 1, hint: m.bestSet ? `best ${m.bestSet.right}/${m.bestSet.count}` : "start a set" })
  },
  {
    id: "calibrated",
    group: "habits",
    mark: "SURE",
    label: "Sure means sure",
    detail: "Mark 10 answers as Sure, and be right on at least 80% of them. Knowing when you know is a test skill.",
    progress: (m) => {
      if (m.sureAnswers < 10) return { value: m.sureAnswers, goal: 10, hint: `${m.sureAnswers}/10 sure answers` };
      const pct8 = Math.round(m.sureRight / m.sureAnswers * 100);
      return { value: pct8 >= 80 ? 10 : 9, goal: 10, hint: `${pct8}% right when sure, need 80%` };
    }
  },
  { id: "hard-10", group: "habits", mark: "H10", label: "Hard hitter", detail: "Get 10 Hard questions right.", progress: (m) => count(m.hardRight, 10) },
  {
    id: "on-pace-25",
    group: "habits",
    mark: "71s",
    label: "On the clock",
    detail: "Finish 25 timed questions at or under test pace (71 s Reading and Writing, 95 s Math).",
    progress: (m) => count(m.onPace, 25)
  },
  {
    id: "goal-day",
    group: "habits",
    mark: "GOAL",
    label: "Daily goal met",
    detail: "Hit your daily question goal in a single day.",
    progress: (m) => ({ value: Math.min(m.bestDay, m.dailyGoal), goal: m.dailyGoal, hint: `best day ${m.bestDay}/${m.dailyGoal}` })
  },
  {
    id: "rw-tour",
    group: "habits",
    mark: "R&W",
    label: "Every R&W skill",
    detail: "Practice all 10 Reading and Writing skills at least once.",
    progress: (m) => count(m.rwSkills, skillsFor("rw").length)
  },
  {
    id: "math-tour",
    group: "habits",
    mark: "MATH",
    label: "Every Math skill",
    detail: "Practice all 19 Math skills at least once.",
    progress: (m) => count(m.mathSkills, skillsFor("math").length)
  }
];
var BY_ID = new Map(BADGES.map((b) => [b.id, b]));
function shiftKey(key, days) {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days, 12).getTime());
}
function longestStreak(log) {
  const days = new Set(log.map((e) => dayKey(e.at)));
  let best = 0;
  for (const d of days) {
    if (days.has(shiftKey(d, -1))) continue;
    let run = 1;
    let cursor = shiftKey(d, 1);
    while (days.has(cursor)) {
      run++;
      cursor = shiftKey(cursor, 1);
    }
    best = Math.max(best, run);
  }
  return best;
}
function badgeMetrics(input) {
  const { log, srs } = input;
  const rules = Object.values(srs);
  const missesByRule = /* @__PURE__ */ new Map();
  for (const e of log) if (e.result === "missed") missesByRule.set(e.ruleId, (missesByRule.get(e.ruleId) ?? 0) + 1);
  const sets = (input.recaps ?? []).filter((r) => r.count > 0);
  const bestSet = sets.length ? [...sets].sort((a, b) => b.right / b.count - a.right / a.count || b.count - a.count)[0] : null;
  const sure = log.filter((e) => e.selfConfidence === "sure");
  const skills = new Set(log.map((e) => normalizeSkill(e.skill)).filter((s) => Boolean(s)));
  const perDay = /* @__PURE__ */ new Map();
  for (const e of log) perDay.set(dayKey(e.at), (perDay.get(dayKey(e.at)) ?? 0) + 1);
  return {
    questions: log.length,
    longestStreak: longestStreak(log),
    mastered: rules.filter((r) => r.box >= MASTERED_BOX).length,
    comebacks: rules.filter((r) => r.box >= MASTERED_BOX && (missesByRule.get(r.ruleId) ?? 0) >= 2).length,
    reviewRight: log.reduce((n, e) => n + e.drills.filter((d) => d.review && d.correct).length, 0),
    perfectSet: sets.some((r) => r.count >= 5 && r.right === r.count),
    bestSet: bestSet ? { count: bestSet.count, right: bestSet.right } : null,
    sections: new Set(log.map((e) => sectionOf(e))).size,
    sureAnswers: sure.length,
    sureRight: sure.filter((e) => e.result === "right").length,
    hardRight: log.filter((e) => e.result === "right" && (e.difficulty ?? "").toLowerCase() === "hard").length,
    onPace: log.filter((e) => typeof e.seconds === "number" && e.seconds > 0 && e.seconds <= targetSecondsFor(e)).length,
    rwSkills: skillsFor("rw").filter((s) => skills.has(s.skill)).length,
    mathSkills: skillsFor("math").filter((s) => skills.has(s.skill)).length,
    bestDay: Math.max(0, ...perDay.values()),
    dailyGoal: Math.max(1, Math.round(input.dailyGoal ?? 10))
  };
}
var earnedBy = (def, m) => {
  const p = def.progress(m);
  return p.value >= p.goal;
};
function evaluateBadges(input) {
  const m = badgeMetrics(input);
  return BADGES.filter((b) => earnedBy(b, m)).map((b) => b.id);
}
function awardBadges(prev, qualified, now) {
  const badges = { ...prev };
  const fresh = [];
  for (const id of qualified) {
    if (badges[id] !== void 0 || !BY_ID.has(id)) continue;
    badges[id] = now;
    fresh.push(id);
  }
  return { badges, fresh };
}
function badgeToast(ids) {
  const labels = ids.map((id) => BY_ID.get(id)?.label ?? id);
  if (!labels.length) return "";
  if (labels.length === 1) return `Badge earned: ${labels[0]}`;
  const shown = labels.slice(0, 3).join(", ");
  return `${labels.length} badges earned: ${shown}${labels.length > 3 ? ", and more" : ""}`;
}
async function readBadges() {
  return kv().get(KEYS.badges);
}
async function writeBadges(b) {
  await kv().set(KEYS.badges, b);
}
async function syncBadges(input, now = Date.now()) {
  const saved = await readBadges();
  const { badges, fresh } = awardBadges(saved ?? {}, evaluateBadges(input), now);
  if (!saved || fresh.length) await writeBadges(badges);
  return { badges, fresh: saved ? fresh : [] };
}
function badgeProgress(input, earned) {
  const m = badgeMetrics(input);
  const views = BADGES.map((b, i2) => {
    const p = b.progress(m);
    const earnedAt = earned[b.id] ?? null;
    return { ...b, earnedAt, value: Math.min(p.value, p.goal), goal: p.goal, hint: p.hint ?? `${Math.min(p.value, p.goal)}/${p.goal}`, i: i2 };
  });
  const done = views.filter((v) => v.earnedAt !== null).sort((a, b) => (a.earnedAt ?? 0) - (b.earnedAt ?? 0) || a.i - b.i);
  const locked = views.filter((v) => v.earnedAt === null).sort((a, b) => b.value / b.goal - a.value / a.goal || a.i - b.i);
  return [...done, ...locked].map(({ i: _i6, ...v }) => v);
}
var open2 = false;
function renderBadges(views) {
  const earned = views.filter((v) => v.earnedAt !== null);
  const next = views.find((v) => v.earnedAt === null);
  const medal = (v) => {
    const locked = v.earnedAt === null;
    const pct8 = Math.round(v.value / v.goal * 100);
    return h(
      "li",
      { class: `rc-badge${locked ? " locked" : ""}`, title: `${v.label}. ${v.detail}${locked ? ` (${v.hint})` : ""}` },
      h("span", { class: "rc-medal", "aria-hidden": "true", text: v.mark }),
      h("span", { class: "rc-badge-label", text: v.label }),
      locked ? h("span", { class: "rc-badge-hint" }, h("span", { class: "rc-meter good" }, h("span", { style: `width:${pct8}%` })), h("span", { class: "small muted", text: v.hint })) : h("span", { class: "small muted", text: new Date(v.earnedAt ?? 0).toLocaleDateString(void 0, { month: "short", day: "numeric" }) })
    );
  };
  return h(
    "details",
    { class: "card rc-badges", open: open2 ? "" : null, ontoggle: (ev) => {
      open2 = ev.target.open;
    } },
    h(
      "summary",
      null,
      h("span", { class: "rc-badges-title", text: "Badges" }),
      h("span", { class: "small muted", text: ` ${earned.length} of ${views.length} earned` }),
      next ? h("span", { class: "small muted rc-badges-next", text: `Next: ${next.label} (${next.hint})` }) : null
    ),
    h("ul", { class: "rc-badge-grid" }, ...views.map(medal))
  );
}

// extension/src/addons/crop.ts
function toNaturalRect(a, b, display, natural) {
  const clamp = (v, max) => Math.min(Math.max(v, 0), max);
  const x1 = clamp(Math.min(a.x, b.x), display.w), x2 = clamp(Math.max(a.x, b.x), display.w);
  const y1 = clamp(Math.min(a.y, b.y), display.h), y2 = clamp(Math.max(a.y, b.y), display.h);
  if (x2 - x1 < 8 || y2 - y1 < 8) return null;
  const sx = natural.w / display.w, sy = natural.h / display.h;
  return { x: Math.round(x1 * sx), y: Math.round(y1 * sy), w: Math.round((x2 - x1) * sx), h: Math.round((y2 - y1) * sy) };
}
async function cropDataUrl(dataUrl, r) {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob, r.x, r.y, r.w, r.h);
  try {
    const canvas = new OffscreenCanvas(r.w, r.h);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available");
    ctx.drawImage(bitmap, 0, 0);
    const out = await canvas.convertToBlob({ type: "image/png" });
    const bytes = new Uint8Array(await out.arrayBuffer());
    let bin2 = "";
    for (let i2 = 0; i2 < bytes.length; i2 += 32768) bin2 += String.fromCharCode(...bytes.subarray(i2, i2 + 32768));
    return `data:image/png;base64,${btoa(bin2)}`;
  } finally {
    bitmap.close();
  }
}
function renderCropper(dataUrl, onDone) {
  let start = null;
  let rect = null;
  const box = h("div", { class: "rc-crop-box", hidden: "" });
  const img = h("img", { src: dataUrl, alt: "Captured tab", draggable: "false" });
  const stage = h("div", { class: "rc-crop-stage" }, img, box);
  const sendSel = h("button", { class: "btn primary", disabled: true, text: "Send selection" });
  const point = (ev) => {
    const r = img.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };
  const paint = (a, b) => {
    box.hidden = false;
    box.style.left = `${Math.min(a.x, b.x)}px`;
    box.style.top = `${Math.min(a.y, b.y)}px`;
    box.style.width = `${Math.abs(a.x - b.x)}px`;
    box.style.height = `${Math.abs(a.y - b.y)}px`;
  };
  stage.addEventListener("pointerdown", (ev) => {
    start = point(ev);
    stage.setPointerCapture(ev.pointerId);
  });
  stage.addEventListener("pointermove", (ev) => {
    if (start) paint(start, point(ev));
  });
  stage.addEventListener("pointerup", (ev) => {
    if (!start) return;
    const end = point(ev);
    rect = toNaturalRect(start, end, { w: img.clientWidth, h: img.clientHeight }, { w: img.naturalWidth, h: img.naturalHeight });
    start = null;
    if (!rect) box.hidden = true;
    sendSel.disabled = !rect;
  });
  sendSel.addEventListener("click", async () => {
    if (!rect) return;
    sendSel.disabled = true;
    try {
      onDone(await cropDataUrl(dataUrl, rect));
    } catch {
      onDone(dataUrl);
    }
  });
  return h(
    "div",
    { class: "card" },
    h("h2", { text: "Crop to the question" }),
    h("p", { class: "muted small", text: "Drag a box around the passage, question and choices (and the answer, if it's showing). Cropping makes the read more accurate." }),
    stage,
    h(
      "div",
      { class: "row" },
      sendSel,
      h("button", { class: "btn", text: "Send whole tab", onclick: () => onDone(dataUrl) }),
      h("button", { class: "btn link small", text: "Cancel", onclick: () => onDone(null) })
    )
  );
}

// extension/src/addons/export.ts
var esc = (s) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
var csvCell = (s) => `"${s.replace(/"/g, '""')}"`;
var MATH_SYMBOLS = {
  cdot: "\xB7",
  times: "\xD7",
  div: "\xF7",
  pm: "\xB1",
  le: "\u2264",
  leq: "\u2264",
  ge: "\u2265",
  geq: "\u2265",
  ne: "\u2260",
  neq: "\u2260",
  approx: "\u2248",
  pi: "\u03C0",
  theta: "\u03B8",
  alpha: "\u03B1",
  beta: "\u03B2",
  infty: "\u221E",
  circ: "\xB0",
  degree: "\xB0",
  angle: "\u2220",
  triangle: "\u25B3",
  parallel: "\u2225",
  perp: "\u22A5",
  left: "",
  right: "",
  quad: " ",
  qquad: " "
};
var wrapMath = (s) => /^√?[\w.]+$/.test(s.trim()) ? s.trim() : `(${s.trim()})`;
function latexToText(src) {
  let t = src;
  for (let i2 = 0; i2 < 6; i2++) {
    const before = t;
    t = t.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_m, a, b) => `${wrapMath(a)}/${wrapMath(b)}`).replace(/\\sqrt\s*\{([^{}]*)\}/g, (_m, a) => `\u221A${wrapMath(a)}`).replace(/\\(?:text|textbf|mathrm|mathbf|mathit|operatorname|overline)\s*\{([^{}]*)\}/g, "$1").replace(/\^\s*\{\s*\\circ\s*\}|\^\s*\\circ/g, "\xB0").replace(/([\^_])\s*\{([^{}]*)\}/g, (_m, op2, a) => `${op2}${wrapMath(a)}`);
    if (t === before) break;
  }
  return t.replace(/\\([a-zA-Z]+)/g, (_m, name) => MATH_SYMBOLS[name] ?? name).replace(/\\([%$#&_,;:! ])/g, (_m, c) => ",;:! ".includes(c) ? " " : c).replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
}
function plainMath(s) {
  if (!s.includes("\\")) return s;
  return s.replace(/\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g, (_m, a, b) => latexToText(a ?? b ?? ""));
}
function answerLine(e, mark = (s) => s) {
  const others = otherAnswers(e);
  const answer = `Answer ${mark(answerText(e))}${others.length ? ` (also accepted: ${others.join(", ")})` : ""}`;
  const said = responseText(e);
  if (e.result !== "missed" || !said) return `${answer}.`;
  return `${answer}, you ${isGridIn(e) ? "entered" : "picked"} ${mark(said)}.`;
}
function whyFailsLabel(e) {
  if (e.result !== "missed" || !e.whyPickFails) return null;
  const said = responseText(e);
  return said ? `Why ${said} fails` : "Why your answer fails";
}
function filterScope(entries, scope) {
  if (scope === "missed") return entries.filter((e) => e.result === "missed");
  if (scope === "starred") return entries.filter((e) => e.starred);
  return entries;
}
function toAnkiCsv(entries) {
  const rows = ["#separator:comma", "#html:true", "#columns:Front,Back,Tags"];
  for (const e of entries) {
    const gridIn = isGridIn(e);
    const choices = hasChoiceList(e) ? LETTERS2.map((l) => `${l}. ${esc(e.choices[l])}`).join("<br>") : gridIn ? "<i>Grid-in: type your answer.</i>" : "";
    const front = [
      e.passage ? `<div>${esc(e.passage)}</div><br>` : "",
      e.figure ? `<div><i>Figure:</i> ${esc(e.figure)}</div><br>` : "",
      `<b>${esc(e.stem)}</b><br><br>`,
      choices
    ].join("");
    const others = otherAnswers(e);
    const fails = whyFailsLabel(e);
    const back = [
      `<b>Answer: ${esc(answerText(e))}</b>`,
      others.length ? `<br>Also accepted: ${esc(others.join(", "))}` : "",
      `<br><br><i>Rule ${esc(e.ruleId)}${e.ruleName ? ` \xB7 ${esc(e.ruleName)}` : ""}</i><br>${esc(e.ruleStatement)}`,
      `<br><br>${esc(e.whyCorrect)}`,
      e.steps?.length ? `<br><br><b>Steps:</b><ol>${e.steps.map((st) => `<li>${esc(st)}</li>`).join("")}</ol>` : "",
      e.shortcut ? `<br><b>Shortcut:</b> ${esc(e.shortcut)}` : "",
      fails ? `<br><br><b>${esc(fails)}:</b> ${esc(e.whyPickFails)}` : "",
      gridIn && !fails && e.result === "missed" && e.typed ? `<br><br><b>You entered:</b> ${esc(e.typed)}` : "",
      `<br><br><b>Takeaway:</b> ${esc(e.takeaway)}`,
      e.note ? `<br><br><b>My note:</b> ${esc(e.note)}` : ""
    ].join("");
    const tag = (s) => s ? s.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "") : "";
    const tags = [
      "rulecard",
      `rule::${tag(e.ruleId)}`,
      e.skill ? `skill::${tag(e.skill)}` : "",
      sectionOf(e) === "math" ? "section::math" : "",
      gridIn ? "grid_in" : "",
      e.result === "missed" ? "missed" : ""
    ].filter(Boolean).join(" ");
    rows.push([csvCell(front), csvCell(back), csvCell(tags)].join(","));
  }
  return rows.join("\n") + "\n";
}
function groupByRule(entries) {
  const map = /* @__PURE__ */ new Map();
  for (const e of [...entries].sort((a, b) => a.at - b.at)) {
    const g = map.get(e.ruleId) ?? { ruleId: e.ruleId, ruleName: e.ruleName, statement: e.ruleStatement, takeaways: [], items: [] };
    g.ruleName = e.ruleName ?? g.ruleName;
    g.statement = e.ruleStatement || g.statement;
    if (e.takeaway && !g.takeaways.includes(e.takeaway)) g.takeaways.push(e.takeaway);
    g.items.push(e);
    map.set(e.ruleId, g);
  }
  return [...map.values()].sort((a, b) => b.items.filter((i2) => i2.result === "missed").length - a.items.filter((i2) => i2.result === "missed").length);
}
function toMarkdown(entries, title = "Rulecard study notes") {
  const lines = [`# ${title}`, "", `_${entries.length} questions \xB7 exported ${(/* @__PURE__ */ new Date()).toLocaleDateString()}_`, ""];
  for (const g of groupByRule(entries)) {
    const missed = g.items.filter((i2) => i2.result === "missed").length;
    lines.push(`## ${g.ruleId}${g.ruleName ? ` \xB7 ${g.ruleName}` : ""}  (${missed} missed / ${g.items.length})`, "", `> ${g.statement}`, "");
    if (g.takeaways.length) {
      lines.push("**Takeaways**", "", ...g.takeaways.map((t) => `- ${t}`), "");
    }
    for (const e of g.items) {
      lines.push(`- ${e.result === "missed" ? "\u274C" : "\u2705"} ${e.qbId ? `\`${e.qbId}\` ` : ""}${plainMath(e.stem)}`);
      lines.push(`  - ${answerLine(e, (s) => `**${s}**`)} ${plainMath(e.whyCorrect)}`);
      if (e.steps?.length) lines.push("  - Steps:", ...e.steps.map((st, i2) => `    ${i2 + 1}. ${plainMath(st)}`));
      if (e.shortcut) lines.push(`  - Shortcut: ${plainMath(e.shortcut)}`);
      if (e.note) lines.push(`  - Note: ${e.note}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
function toPrintableHtml(entries, title = "Rulecard study sheet") {
  const groups = groupByRule(entries);
  const body = groups.map((g) => {
    const missed = g.items.filter((i2) => i2.result === "missed");
    return `<section>
  <h2>${esc(g.ruleId)}${g.ruleName ? ` \xB7 ${esc(g.ruleName)}` : ""}</h2>
  <p class="rule">${esc(g.statement)}</p>
  ${g.takeaways.length ? `<ul class="take">${g.takeaways.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
  ${missed.length ? `<h3>Questions you missed</h3><ol>${missed.map((e) => `<li><p>${esc(plainMath(e.stem))}</p><p class="ans">${esc(answerLine(e))} ${esc(plainMath(e.whyPickFails ?? e.whyCorrect))}</p>${e.steps?.length ? `<ol class="steps">${e.steps.map((st) => `<li>${esc(plainMath(st))}</li>`).join("")}</ol>` : ""}${e.shortcut ? `<p class="small">Shortcut: ${esc(plainMath(e.shortcut))}</p>` : ""}${e.note ? `<p class="note">Note: ${esc(e.note)}</p>` : ""}</li>`).join("")}</ol>` : ""}
</section>`;
  }).join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body{font:13px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#16161a}
  h1{font-size:20px;margin:0 0 4px} .meta{color:#6b6b70;margin:0 0 20px}
  section{border:1px solid #e4e4e0;border-radius:10px;padding:12px 14px;margin:0 0 12px;break-inside:avoid}
  h2{font-size:14px;margin:0 0 6px;color:#2f5bea} h3{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b6b70;margin:10px 0 4px}
  .rule{font-weight:600;margin:0 0 6px} .take{margin:0;padding-left:18px} .ans{color:#15803d;margin:2px 0} .note{color:#b45309;margin:2px 0}
  ol{padding-left:18px;margin:0} li p{margin:0} .steps{color:#3f3f46;font-size:12px;margin:2px 0} .small{font-size:12px;color:#3f3f46}
  .hint{background:#e8eefc;color:#2f5bea;border-radius:8px;padding:8px 12px;margin:0 0 16px}
  @media print{body{margin:0} section{border-color:#bbb} .hint{display:none}}
</style></head><body>
<p class="hint">To save as PDF: press \u2318P (Mac) or Ctrl+P, then choose "Save as PDF".</p>
<h1>${esc(title)}</h1><p class="meta">${groups.length} rules \xB7 ${entries.length} questions \xB7 ${esc((/* @__PURE__ */ new Date()).toLocaleDateString())}</p>
${body || "<p>No questions yet.</p>"}
</body></html>`;
}
function toBackup(entries) {
  const b = { kind: "rulecard-addons-backup", version: 1, exportedAt: (/* @__PURE__ */ new Date()).toISOString(), entries };
  return JSON.stringify(b, null, 2);
}
function parseBackup(text2) {
  const data = JSON.parse(text2);
  if (data.kind !== "rulecard-addons-backup" || !Array.isArray(data.entries)) throw new Error("That file is not a Rulecard backup.");
  return data.entries;
}
function cardAsText(e) {
  const others = otherAnswers(e);
  const fails = whyFailsLabel(e);
  return [
    `Rule ${e.ruleId}${e.ruleName ? ` \xB7 ${e.ruleName}` : ""}`,
    plainMath(e.ruleStatement),
    "",
    `Why ${answerText(e)} is right: ${plainMath(e.whyCorrect)}`,
    others.length ? `Also accepted: ${others.join(", ")}` : "",
    ...e.steps?.length ? ["Steps:", ...e.steps.map((st, i2) => `${i2 + 1}. ${plainMath(st)}`)] : [],
    e.shortcut ? `Shortcut: ${plainMath(e.shortcut)}` : "",
    fails ? `${fails}: ${plainMath(e.whyPickFails ?? "")}` : "",
    !fails && isGridIn(e) && e.result === "missed" && e.typed ? `You entered ${e.typed}.` : "",
    `Takeaway: ${plainMath(e.takeaway)}`
  ].filter((l, i2, a) => l !== "" || a[i2 - 1] !== "").join("\n").trim();
}
function downloadText(filename, text2, mime = "text/plain") {
  const url = URL.createObjectURL(new Blob([text2], { type: `${mime};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5e3);
}
function openPrintable(html) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  void chrome.tabs.create({ url });
  setTimeout(() => URL.revokeObjectURL(url), 6e4);
}
var stamp = (d = /* @__PURE__ */ new Date()) => d.toISOString().slice(0, 10);

// extension/src/addons/flashcards.ts
var FLASH_GRADES = ["again", "hard", "good"];
var newestFirst = (a, b) => b.at - a.at;
var clean = (s) => typeof s === "string" ? s.trim() : "";
var norm = (s) => s.trim().replace(/\s+/g, " ").replace(/[\s.!?;:,]+$/, "").toLowerCase();
function byRule(log) {
  const map = /* @__PURE__ */ new Map();
  for (const e of [...log].sort(newestFirst)) {
    if (!e || typeof e.ruleId !== "string" || !e.ruleId) continue;
    const list2 = map.get(e.ruleId);
    if (list2) list2.push(e);
    else map.set(e.ruleId, [e]);
  }
  return map;
}
function distinct(items, textOf) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const item of items) {
    const text2 = clean(textOf(item));
    const key = norm(text2);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ item, text: text2 });
  }
  return out;
}
function buildCard(ruleId, entries, srs, reason) {
  const withStem = entries.filter((e) => clean(e.stem));
  const cueEntry = withStem.find((e) => e.result === "missed") ?? withStem[0];
  const misses = entries.filter((e) => e.result === "missed").length;
  return {
    ruleId,
    ruleName: entries.find((e) => e.ruleName)?.ruleName ?? srs[ruleId]?.ruleName ?? null,
    reason,
    cue: cueEntry ? { attemptId: cueEntry.attemptId, at: cueEntry.at, stem: clean(cueEntry.stem), passage: clean(cueEntry.passage) || null, missed: cueEntry.result === "missed" } : null,
    statement: entries.map((e) => clean(e.ruleStatement)).find(Boolean) ?? "",
    takeaways: distinct(entries, (e) => e.takeaway).map((d) => d.text),
    notes: distinct(entries, (e) => e.note).map(({ item, text: text2 }) => ({ attemptId: item.attemptId, at: item.at, text: text2 })),
    attempts: entries.length,
    misses,
    missRate: entries.length ? misses / entries.length : 0,
    box: srs[ruleId]?.box ?? null
  };
}
function weakestRules(log, srs, now, limit = Infinity) {
  const due = new Set(dueRules(srs, now).map((r) => r.ruleId));
  const rows = [];
  for (const [ruleId, entries] of byRule(log)) {
    if (due.has(ruleId)) continue;
    const missed = entries.filter((e) => e.result === "missed");
    if (!missed.length) continue;
    rows.push({ ruleId, rate: missed.length / entries.length, misses: missed.length, lastMiss: missed[0]?.at ?? 0 });
  }
  rows.sort((a, b) => b.rate - a.rate || b.misses - a.misses || b.lastMiss - a.lastMiss || (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0));
  return rows.slice(0, Math.max(0, limit)).map((r) => r.ruleId);
}
function createDeck(log, srs, now, opts = {}) {
  const groups = byRule(log);
  const cards = dueRules(srs, now).map((r) => buildCard(r.ruleId, groups.get(r.ruleId) ?? [], srs, "due"));
  const extra = Math.max(0, Math.floor(opts.extra ?? 0)) || 0;
  if (extra) for (const ruleId of weakestRules(log, srs, now, extra)) cards.push(buildCard(ruleId, groups.get(ruleId) ?? [], srs, "weak"));
  return { cards, index: 0, flipped: false, results: [], srs, startedAt: now };
}
function currentCard(state2) {
  return state2.cards[state2.index] ?? null;
}
function isDone(state2) {
  return state2.index >= state2.cards.length;
}
function flip(state2) {
  return isDone(state2) ? state2 : { ...state2, flipped: !state2.flipped };
}
function grade(state2, g, now, latest = state2.srs) {
  const card = currentCard(state2);
  if (!card || !state2.flipped || !FLASH_GRADES.includes(g)) return { state: state2, srs: latest };
  const srs = applyReview(latest, card.ruleId, g !== "again", now);
  const result = {
    ruleId: card.ruleId,
    grade: g,
    at: now,
    boxBefore: latest[card.ruleId]?.box ?? null,
    boxAfter: srs[card.ruleId]?.box ?? null
  };
  return { state: { ...state2, index: state2.index + 1, flipped: false, results: [...state2.results, result], srs }, srs };
}
function nextDueIf(state2, g, now, latest = state2.srs) {
  const card = currentCard(state2);
  if (!card || !latest[card.ruleId]) return null;
  return applyReview(latest, card.ruleId, g !== "again", now)[card.ruleId]?.due ?? null;
}
function deckSummary(state2) {
  const count2 = (g) => state2.results.filter((r) => r.grade === g).length;
  const again = count2("again");
  const hard = count2("hard");
  const good = count2("good");
  const graded = state2.results.length;
  const names = new Map(state2.cards.map((c) => [c.ruleId, c.ruleName]));
  return {
    total: state2.cards.length,
    graded,
    remaining: Math.max(0, state2.cards.length - state2.index),
    again,
    hard,
    good,
    recalled: graded ? (hard + good) / graded : null,
    againRules: state2.results.filter((r) => r.grade === "again").map((r) => ({ ruleId: r.ruleId, ruleName: names.get(r.ruleId) ?? null }))
  };
}
function deckCounts(log, srs, now, extra = 5) {
  return { due: dueRules(srs, now).length, weak: weakestRules(log, srs, now, extra).length };
}

// extension/src/addons/hotkeys.ts
var HOTKEY_HELP = [
  ["1\u20134", "pick answer A\u2013D (A, B, D keys work too)"],
  ["G", "I got it right, explain anyway"],
  ["Enter", "explain"],
  ["C", "capture this tab (so use 3 for choice C)"],
  ["T", "Test me (new question on the rule)"],
  ["R", "start a review"],
  ["/", "ask a follow-up"],
  ["Y", "copy the rule card"],
  ["?", "show these shortcuts"],
  ["Esc", "leave a text box, or quit practice"],
  ["Space", "practice: flip the card, or go to the next question"],
  ["1\u20133", "flashcards: Again, Hard, Good"],
  ["S", "redo my misses: skip this question"]
];
var typing = (el) => el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
function actionFor(key) {
  const k = key.length === 1 ? key.toLowerCase() : key;
  const letters2 = { a: "A", b: "B", c: null, d: "D", "1": "A", "2": "B", "3": "C", "4": "D" };
  if (k in letters2 && letters2[k]) return { name: "pick", arg: letters2[k] };
  switch (k) {
    case "c":
      return { name: "capture" };
    case "g":
      return { name: "pickCorrect" };
    case "Enter":
      return { name: "explain" };
    case "t":
      return { name: "testMe" };
    case "r":
      return { name: "review" };
    case "/":
      return { name: "focusChat" };
    case "y":
      return { name: "copyCard" };
    case "?":
      return { name: "help" };
    default:
      return null;
  }
}
function installHotkeys(getActions, target = document) {
  const onKey = (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === "Escape" && typing(ev.target)) {
      ev.target.blur();
      return;
    }
    if (typing(ev.target)) return;
    if ((ev.key === "Enter" || ev.key === " ") && ev.target instanceof HTMLElement && ev.target.closest("button, a, summary, [role=button]")) return;
    const actions = getActions();
    if (actions.raw?.(ev.key)) {
      ev.preventDefault();
      return;
    }
    const hit = actionFor(ev.key);
    if (!hit) return;
    const fn = actions[hit.name];
    if (!fn) return;
    ev.preventDefault();
    fn(hit.arg);
  };
  target.addEventListener("keydown", onKey);
  return () => target.removeEventListener("keydown", onKey);
}

// extension/src/addons/journal.ts
var defaultFilter = () => ({ q: "", result: "missed", skill: "", diagnosis: "", limit: 20 });
var hay = (e) => [e.ruleId, e.ruleName, e.ruleStatement, e.takeaway, e.stem, e.passage, e.note, e.skill, e.qbId, ...Object.values(e.choices ?? {}), e.typed, ...e.accepted ?? []].filter(Boolean).join(" ").toLowerCase();
function filterJournal(entries, f) {
  const terms = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((e) => {
    if (f.result === "missed" && e.result !== "missed") return false;
    if (f.result === "starred" && !e.starred) return false;
    if (f.result === "noted" && !e.note) return false;
    if (f.skill && e.skill !== f.skill) return false;
    if (f.section && sectionOf(e) !== f.section) return false;
    if (f.diagnosis && e.diagnosis !== f.diagnosis) return false;
    if (terms.length) {
      const text2 = hay(e);
      if (!terms.every((t) => text2.includes(t))) return false;
    }
    return true;
  });
}
var DIAG_LABEL = { rule_gap: "rule gap", careless: "careless", misread: "misread", got_it_right: "got it", unknown: "no reason" };
var openState = false;
var expanded = /* @__PURE__ */ new Set();
function renderJournal(entries, f, actions, rerender) {
  const sections = new Set(entries.map((e) => sectionOf(e)));
  const bothSections = sections.size > 1 || Boolean(f.section);
  const inSection = f.section ? entries.filter((e) => sectionOf(e) === f.section) : entries;
  const skills = [...new Set(inSection.map((e) => e.skill).filter((s) => !!s))].sort();
  const hits = filterJournal(entries, f);
  const select = (id, value, options, onChange) => {
    const el = h(
      "select",
      { id, class: "input rc-select", onchange: (ev) => onChange(ev.target.value) },
      ...options.map(([v, label]) => h("option", { value: v, text: label }))
    );
    el.value = value;
    return el;
  };
  const search = h("input", { id: "rc-journal-q", class: "input", type: "search", placeholder: "Search rules, questions, notes\u2026", value: f.q });
  let t = null;
  search.addEventListener("input", () => {
    if (t) clearTimeout(t);
    t = setTimeout(() => actions.change({ ...f, q: search.value, limit: 20 }), 250);
  });
  const list2 = h("ul", { class: "rc-journal" }, ...hits.slice(0, f.limit).map((e) => {
    const isOpen = expanded.has(e.attemptId);
    const head3 = h(
      "button",
      {
        class: "rc-journal-head",
        "aria-expanded": String(isOpen),
        onclick: () => {
          if (isOpen) expanded.delete(e.attemptId);
          else expanded.add(e.attemptId);
          rerender();
        }
      },
      h(
        "span",
        { class: "row rc-wrap" },
        chip(e.result === "right" ? "right" : "missed", e.result === "right" ? "good" : "danger"),
        h("span", { class: "small", text: e.ruleName ? `${e.ruleId} \xB7 ${e.ruleName}` : e.ruleId }),
        e.starred ? h("span", { class: "small", text: "\u2605" }) : null,
        h("span", { class: "small muted", text: new Date(e.at).toLocaleDateString(void 0, { month: "short", day: "numeric" }) })
      ),
      h("span", { class: "rc-journal-stem", text: plainMath(e.stem) }),
      e.note ? h("span", { class: "rc-journal-note", text: `\u201C${e.note}\u201D` }) : null
    );
    const body = isOpen ? h(
      "div",
      { class: "rc-journal-body" },
      h("p", { class: "rule-statement", text: e.ruleStatement }),
      h("p", { class: "small", text: `${answerLine(e)} ${plainMath(e.result === "missed" && e.whyPickFails ? e.whyPickFails : e.whyCorrect)}` }),
      e.steps?.length ? h("ol", { class: "steps small" }, ...e.steps.map((st) => h("li", { text: plainMath(st) }))) : null,
      e.shortcut ? h("p", { class: "small" }, h("b", { text: "Shortcut: " }), plainMath(e.shortcut)) : null,
      h("p", { class: "small" }, h("b", { text: "Takeaway: " }), plainMath(e.takeaway)),
      h(
        "div",
        { class: "row rc-wrap small muted" },
        sectionOf(e) === "math" ? chip("Math") : null,
        isGridIn(e) ? chip("grid-in") : null,
        e.skill ? chip(e.skill) : null,
        e.difficulty ? chip(e.difficulty) : null,
        chip(DIAG_LABEL[e.diagnosis] ?? e.diagnosis),
        e.selfConfidence ? chip(`felt ${e.selfConfidence}`) : null,
        e.seconds !== null ? chip(`${e.seconds}s`) : null
      ),
      h(
        "div",
        { class: "row rc-wrap" },
        h("button", { class: "btn small", text: "Open in web app", onclick: () => actions.openWeb(`/history/${encodeURIComponent(e.attemptId)}`) }),
        h("button", { class: "btn small", text: "Review this rule now", onclick: () => actions.reviewRule(e.ruleId) }),
        h("button", { class: "btn small", text: e.starred ? "\u2605 Unstar" : "\u2606 Star", onclick: () => actions.toggleStar(e) })
      )
    ) : null;
    return h("li", null, head3, body);
  }));
  const details = h(
    "details",
    { class: "card rc-journal-card", open: openState ? "" : null, ontoggle: (ev) => {
      openState = ev.target.open;
    } },
    h("summary", null, h("h2", { text: "Journal" }), h("span", { class: "small muted", text: `${entries.length} saved` })),
    search,
    h(
      "div",
      { class: "row rc-wrap" },
      select("rc-journal-result", f.result, [["missed", "Missed"], ["starred", "Starred"], ["noted", "With notes"], ["all", "All"]], (v) => actions.change({ ...f, result: v, limit: 20 })),
      select("rc-journal-skill", f.skill, [["", "All skills"], ...skills.map((s) => [s, s])], (v) => actions.change({ ...f, skill: v, limit: 20 })),
      select("rc-journal-diag", f.diagnosis, [["", "Any reason"], ["rule_gap", "Rule gap"], ["careless", "Careless"], ["misread", "Misread"]], (v) => actions.change({ ...f, diagnosis: v, limit: 20 })),
      bothSections ? select("rc-journal-section", f.section ?? "", [["", "Both sections"], ["rw", "Reading and Writing"], ["math", "Math"]], (v) => actions.change({ ...f, section: v === "rw" || v === "math" ? v : "", limit: 20 })) : null
    ),
    hits.length ? list2 : h("p", { class: "muted small", text: entries.length ? "Nothing matches." : "Explained questions show up here." }),
    hits.length > f.limit ? h("button", { class: "btn small", text: `Show more (${hits.length - f.limit})`, onclick: () => actions.change({ ...f, limit: f.limit + 20 }) }) : null
  );
  return details;
}

// extension/src/addons/selection-bg.ts
var PENDING_SELECTION_KEY = "rc.addons.pendingSelection.v1";

// extension/src/addons/textcapture.ts
function canTextCapture(parsed, media) {
  return Boolean(parsed && parsed.qbId && parsed.stem && LETTERS2.every((l) => parsed.choices[l]) && media === 0);
}
function wrapText(text2, maxWidth, measure) {
  const out = [];
  for (const para of text2.split(/\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= maxWidth || !line) {
        if (!line && measure(candidate) > maxWidth) {
          let chunk = "";
          for (const ch2 of word) {
            if (measure(chunk + ch2) > maxWidth && chunk) {
              out.push(chunk);
              chunk = "";
            }
            chunk += ch2;
          }
          line = chunk;
        } else line = candidate;
      } else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}
var SERIF = 'Georgia, "Times New Roman", serif';
var SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
function blocksFor(p) {
  const meta2 = [p.domain, p.skill, p.difficulty].filter(Boolean).join(" \xB7 ");
  const blocks = [
    { text: `Question ID ${p.qbId}${meta2 ? `   \xB7   ${meta2}` : ""}`, font: `600 18px ${SANS}`, color: "#4b5563", gapBefore: 0, lineHeight: 26 }
  ];
  if (p.passage) blocks.push({ text: p.passage, font: `22px ${SERIF}`, color: "#111827", gapBefore: 22, lineHeight: 34 });
  blocks.push({ text: p.stem ?? "", font: `600 21px ${SANS}`, color: "#111827", gapBefore: 22, lineHeight: 31 });
  for (const l of LETTERS2) blocks.push({ text: `${l}.  ${p.choices[l] ?? ""}`, font: `21px ${SERIF}`, color: "#111827", gapBefore: l === "A" ? 18 : 10, lineHeight: 31, indent: 12 });
  if (p.correct) blocks.push({ text: `Correct Answer: ${p.correct}`, font: `700 21px ${SANS}`, color: "#166534", gapBefore: 24, lineHeight: 30 });
  return blocks;
}
async function renderQuestionImage(p, width = 1100) {
  const pad2 = 40;
  const measureCanvas = new OffscreenCanvas(10, 10);
  const mctx = measureCanvas.getContext("2d");
  if (!mctx) throw new Error("Canvas not available");
  const blocks = blocksFor(p);
  const laid = blocks.map((b) => {
    mctx.font = b.font;
    const lines = wrapText(b.text, width - pad2 * 2 - (b.indent ?? 0), (s) => mctx.measureText(s).width);
    return { b, lines };
  });
  const height = Math.ceil(pad2 * 2 + laid.reduce((h3, { b, lines }) => h3 + b.gapBefore + lines.length * b.lineHeight, 0));
  const canvas = new OffscreenCanvas(width, Math.min(height, 6e3));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = "top";
  let y = pad2;
  for (const { b, lines } of laid) {
    y += b.gapBefore;
    ctx.font = b.font;
    ctx.fillStyle = b.color;
    for (const line of lines) {
      ctx.fillText(line, pad2 + (b.indent ?? 0), y + (b.lineHeight - parseInt(b.font.match(/(\d+)px/)?.[1] ?? "20", 10)) / 2);
      y += b.lineHeight;
    }
  }
  const blob = await canvas.convertToBlob({ type: "image/png" });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin2 = "";
  for (let i2 = 0; i2 < bytes.length; i2 += 32768) bin2 += String.fromCharCode(...bytes.subarray(i2, i2 + 32768));
  return `data:image/png;base64,${btoa(bin2)}`;
}

// extension/src/addons/selection.ts
var MIN_QUESTION_CHARS = 40;
var MAX_QUESTION_CHARS = 6e3;
var PENDING_MAX_AGE_MS = 10 * 6e4;
var IMAGE_WIDTH = 1100;
var MAX_IMAGE_HEIGHT = 6e3;
var CIRCLED = {
  "\u24B6": "(A)",
  "\u24B7": "(B)",
  "\u24B8": "(C)",
  "\u24B9": "(D)",
  "\u24D0": "(A)",
  "\u24D1": "(B)",
  "\u24D2": "(C)",
  "\u24D3": "(D)"
};
function normalizeQuestionText(raw) {
  return (raw ?? "").replace(/\r\n?|[\f\v\u2028\u2029]/g, "\n").replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, "").replace(/[\t\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ").replace(/[\u24B6-\u24B9\u24D0-\u24D3]/g, (c) => CIRCLED[c] ?? c).split("\n").map((line) => line.replace(/ {2,}/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\(?(?:Choice|Option) ([A-D])\)?:?\n+\1$/gm, "$1").replace(/^\(?(?:Choice|Option) ([A-D])\)?:?$/gm, "$1").trim();
}
function checkQuestionText(raw, from = "selection") {
  const text2 = normalizeQuestionText(raw);
  const n = text2.replace(/\s+/g, " ").length;
  if (n === 0) {
    return { ok: false, message: from === "paste" ? "Paste a question first." : "No text came through. Select the question on the page, then try again." };
  }
  if (n < MIN_QUESTION_CHARS) {
    const verb = from === "paste" ? "Paste" : "Select";
    return {
      ok: false,
      message: `That's only ${n} character${n === 1 ? "" : "s"}, which is too short to be a question. ${verb} the whole question, including any answer choices, then try again.`
    };
  }
  return { ok: true, text: text2.length > MAX_QUESTION_CHARS ? text2.slice(0, MAX_QUESTION_CHARS) : text2 };
}
var MARKER_RE = /(?<![^\s])(?:\(([A-D])\)|([A-D])([.)]))(?=\s|$)|(?<=^|\n)(?:Choice\s+)?([A-D])(?=\n|$)/g;
var TRAILER_RE = /(^|\s)(?:Correct Answer:|Rationale(?=\s|$)|Question Difficulty:)/;
function findMarkers(text2) {
  const out = [];
  for (const m of text2.matchAll(MARKER_RE)) {
    const letter = m[1] ?? m[2] ?? m[4];
    if (!letter || m.index === void 0) continue;
    const style = m[1] ? "paren" : m[2] ? m[3] === ")" ? "close" : "dot" : "alone";
    out.push({ letter, start: m.index, end: m.index + m[0].length, lineStart: m.index === 0 || text2[m.index - 1] === "\n", style });
  }
  return out;
}
function lastRun(markers) {
  const run = [];
  let want = LETTERS2.length - 1;
  for (let i2 = markers.length - 1; i2 >= 0 && want >= 0; i2--) {
    const m = markers[i2];
    if (m.letter === LETTERS2[want]) {
      run.unshift(m);
      want--;
    }
  }
  return want < 0 ? run : null;
}
function findChoiceRun(text2) {
  const all = findMarkers(text2);
  const atLineStart = lastRun(all.filter((m) => m.lineStart));
  if (atLineStart) return atLineStart;
  for (const style of ["close", "paren", "dot"]) {
    const run = lastRun(all.filter((m) => m.style === style));
    if (run) return run;
  }
  return null;
}
var lineEnd = (text2, from) => {
  const i2 = text2.indexOf("\n", from);
  return i2 < 0 ? text2.length : i2;
};
var oneLine = (s) => s.replace(/\s*\n\s*/g, " ").trim();
function splitQuestion(raw) {
  const text2 = normalizeQuestionText(raw);
  const trailer = TRAILER_RE.exec(text2);
  const cut = trailer ? trailer.index + (trailer[1]?.length ?? 0) : text2.length;
  const main2 = text2.slice(0, cut);
  const run = findChoiceRun(main2);
  if (!run) return { body: text2, choices: [], after: "" };
  const choices = [];
  let afterStart = main2.length;
  run.forEach((m, k) => {
    const next = run[k + 1];
    let end;
    if (next) end = next.start;
    else if (main2.slice(m.end, lineEnd(main2, m.end)).trim()) end = lineEnd(main2, m.end);
    else {
      let p = lineEnd(main2, m.end) + 1;
      while (p < main2.length && main2[p] === "\n") p++;
      end = p >= main2.length ? main2.length : lineEnd(main2, p);
    }
    if (!next) afterStart = end;
    choices.push({ letter: m.letter, text: oneLine(main2.slice(m.end, end)) });
  });
  const after = [main2.slice(afterStart).trim(), text2.slice(cut).trim()].filter(Boolean).join("\n");
  return { body: main2.slice(0, run[0].start).trim(), choices, after };
}
var SERIF2 = 'Georgia, "Times New Roman", serif';
var SANS2 = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
var HEADER = { font: `600 18px ${SANS2}`, size: 18, color: "#4b5563", lineHeight: 26 };
var BODY = { font: `22px ${SERIF2}`, size: 22, color: "#111827", lineHeight: 34 };
var CHOICE = { font: `21px ${SERIF2}`, size: 21, color: "#111827", lineHeight: 31 };
var AFTER = { font: `20px ${SANS2}`, size: 20, color: "#374151", lineHeight: 30 };
var LAYOUT = {
  pad: 40,
  choiceIndent: 12,
  /** Space between "A)" and the choice text. Wrapped choice lines hang under the text. */
  labelGap: 14,
  gapAfterHeader: 22,
  gapBeforeChoices: 20,
  gapBetweenChoices: 10,
  gapBeforeAfter: 24
};
function layoutQuestion(q, header2, measure, width = IMAGE_WIDTH) {
  const { pad: pad2 } = LAYOUT;
  const inner2 = width - pad2 * 2;
  const lines = [];
  let y = pad2;
  let first = true;
  const gap = (px) => {
    if (!first) y += px;
    first = false;
  };
  const place = (text2, style, x) => {
    if (text2) lines.push({ text: text2, x, y: y + (style.lineHeight - style.size) / 2, font: style.font, color: style.color });
    y += style.lineHeight;
  };
  const block = (text2, style, before) => {
    gap(before);
    for (const line of wrapText(text2, inner2, (s) => measure(s, style.font))) place(line, style, pad2);
  };
  if (header2) block(header2, HEADER, 0);
  if (q.body) block(q.body, BODY, LAYOUT.gapAfterHeader);
  if (q.choices.length) {
    const labelWidth = Math.max(...q.choices.map((c) => measure(`${c.letter})`, CHOICE.font))) + LAYOUT.labelGap;
    const x0 = pad2 + LAYOUT.choiceIndent;
    const textWidth = inner2 - LAYOUT.choiceIndent - labelWidth;
    q.choices.forEach((c, i2) => {
      gap(i2 === 0 ? LAYOUT.gapBeforeChoices : LAYOUT.gapBetweenChoices);
      lines.push({ text: `${c.letter})`, x: x0, y: y + (CHOICE.lineHeight - CHOICE.size) / 2, font: CHOICE.font, color: CHOICE.color });
      for (const line of wrapText(c.text, textWidth, (s) => measure(s, CHOICE.font))) place(line, CHOICE, x0 + labelWidth);
    });
  }
  if (q.after) block(q.after, AFTER, LAYOUT.gapBeforeAfter);
  return { width, height: Math.ceil(y + pad2), lines };
}
function sourceLabel(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol === "file:") return "a local file";
    return u.hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}
function imageHeader(meta2) {
  const where = sourceLabel(meta2.url);
  if (!where) return null;
  return `Selected from ${where}`;
}
async function blobToDataUrl2(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin2 = "";
  for (let i2 = 0; i2 < bytes.length; i2 += 32768) bin2 += String.fromCharCode(...bytes.subarray(i2, i2 + 32768));
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(bin2)}`;
}
async function questionTextToImage(text2, meta2 = {}, width = IMAGE_WIDTH) {
  const probe = new OffscreenCanvas(10, 10).getContext("2d");
  if (!probe) throw new Error("Canvas not available");
  let font = "";
  const measure = (s, f) => {
    if (f !== font) probe.font = font = f;
    return probe.measureText(s).width;
  };
  const layout = layoutQuestion(splitQuestion(text2), imageHeader(meta2), measure, width);
  const height = Math.min(layout.height, MAX_IMAGE_HEIGHT);
  const canvas = new OffscreenCanvas(layout.width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, layout.width, height);
  ctx.textBaseline = "top";
  for (const line of layout.lines) {
    if (line.y >= height) break;
    ctx.font = line.font;
    ctx.fillStyle = line.color;
    ctx.fillText(line.text, line.x, line.y);
  }
  return blobToDataUrl2(await canvas.convertToBlob({ type: "image/png" }));
}
function isPendingSelection(value) {
  if (!value || typeof value !== "object") return false;
  const o = value;
  return typeof o.text === "string" && typeof o.at === "number";
}
function isFreshSelection(sel, now) {
  return now - sel.at <= PENDING_MAX_AGE_MS && sel.at - now <= 6e4;
}
var forWindow = (sel, windowId) => windowId == null || sel.windowId == null || sel.windowId === windowId;
var delivered = /* @__PURE__ */ new Set();
function claim(sel) {
  const id = `${sel.at}|${sel.text.length}|${sel.text.slice(0, 64)}`;
  if (delivered.has(id)) return false;
  delivered.add(id);
  return true;
}
var sessionArea = () => typeof chrome !== "undefined" ? chrome.storage?.session : void 0;
async function consumePendingSelection(opts = {}) {
  const area = sessionArea();
  if (!area) return null;
  const value = (await area.get(PENDING_SELECTION_KEY))[PENDING_SELECTION_KEY];
  if (value === void 0) return null;
  if (isPendingSelection(value) && !forWindow(value, opts.windowId)) return null;
  await area.remove(PENDING_SELECTION_KEY);
  if (!isPendingSelection(value) || !isFreshSelection(value, opts.now ?? Date.now()) || !claim(value)) return null;
  return value;
}
function watchSelections(cb, opts = {}) {
  if (typeof chrome === "undefined" || !chrome.storage?.onChanged) return () => void 0;
  const listener = (changes, area) => {
    if (area !== "session") return;
    const value = changes[PENDING_SELECTION_KEY]?.newValue;
    if (!isPendingSelection(value) || !forWindow(value, opts.windowId)) return;
    void sessionArea()?.remove(PENDING_SELECTION_KEY);
    if (isFreshSelection(value, Date.now()) && claim(value)) cb(value);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
async function currentWindowId() {
  try {
    const win = await chrome.windows.getCurrent();
    return typeof win.id === "number" ? win.id : null;
  } catch {
    return null;
  }
}
function describeError(host, error) {
  if (host.describe) return host.describe(error);
  return error instanceof Error && error.message ? error.message : "Something went wrong. Try again.";
}
function renderSelectionStatus(status, dismiss) {
  if (status.kind === "idle") return null;
  if (status.kind === "working") {
    return h(
      "div",
      { class: "banner accent rc-selection", role: "status" },
      spinner(),
      h("span", { text: status.from ? `Reading the text you selected on ${status.from}...` : "Reading the text you selected..." })
    );
  }
  return h(
    "div",
    { class: `banner ${status.tone} rc-selection`, role: "alert" },
    h("span", { text: status.text }),
    h("button", { class: "btn link small", text: "Dismiss", onclick: dismiss })
  );
}
function createSelectionCapture(host) {
  let status = { kind: "idle" };
  let unwatch = null;
  let queue2 = Promise.resolve();
  const set = (next) => {
    status = next;
    host.rerender();
  };
  async function run(sel) {
    const check = checkQuestionText(sel.text, "selection");
    if (!check.ok) return set({ kind: "notice", tone: "warn", text: check.message });
    set({ kind: "working", from: sourceLabel(sel.url) });
    try {
      const image = await questionTextToImage(check.text, { url: sel.url, title: sel.title });
      await host.processImage(image);
      set({ kind: "idle" });
    } catch (error) {
      set({ kind: "notice", tone: "danger", text: describeError(host, error) });
    }
  }
  const explain2 = (sel) => queue2 = queue2.then(() => run(sel));
  return {
    /** Start listening, then take a selection saved before the panel opened. */
    async start() {
      if (unwatch) return;
      const windowId = await currentWindowId();
      unwatch = watchSelections((sel) => void explain2(sel), { windowId });
      const first = await consumePendingSelection({ windowId });
      if (first) await explain2(first);
    },
    stop() {
      unwatch?.();
      unwatch = null;
    },
    /** Explain text directly (same checks and rendering as a right-click selection). */
    explain: explain2,
    status: () => status,
    render: () => renderSelectionStatus(status, () => set({ kind: "idle" }))
  };
}

// extension/src/addons/paste.ts
var PASTE_MAX_EDGE = 1600;
var PASTE_MAX_BYTES = 20 * 1024 * 1024;
var PASTE_TEXTAREA_ID = "rc-paste-text";
var ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg"];
var BULLET_RE = /^[ \t]*[\u2022\u25E6\u25AA\u25AB\u2023\u25CF\u25CB\u25A0\u25A1][ \t]*/gm;
function normalizePastedText(raw) {
  return normalizeQuestionText((raw ?? "").replace(BULLET_RE, ""));
}
var PROMPT_RE = /\?|\b(?:which choice|which of the following|which (?:quotation|finding|statement|word|option)|what is|what are|what was|how many|how much|according to|based on the|most logically|most nearly|best (?:describes|states|supports|completes|illustrates|explains)|conforms to the conventions|completes the text|main (?:idea|purpose)|solve for|value of)\b/i;
var BLANK_RE = /_{3,}|\[\s*blank\s*\]/i;
var MATH_RE = /\d\s*[=<>\u2264\u2265]|[=<>\u2264\u2265]\s*-?\d|\b[a-z]\s*=\s*[a-z\d(]/i;
function questionSignals(raw) {
  const text2 = normalizePastedText(raw);
  return {
    chars: text2.replace(/\s+/g, " ").length,
    choices: splitQuestion(text2).choices.length === 4,
    prompt: PROMPT_RE.test(text2),
    blank: BLANK_RE.test(text2),
    math: MATH_RE.test(text2)
  };
}
function looksLikeQuestion(raw) {
  const s = questionSignals(raw);
  return s.chars >= MIN_QUESTION_CHARS && (s.choices || s.prompt || s.blank || s.math);
}
function scaleToFit(w, h3, max) {
  if (!Number.isFinite(w) || !Number.isFinite(h3) || w <= 0 || h3 <= 0) return { width: 0, height: 0, scale: 0 };
  const scale = max > 0 ? Math.min(1, max / Math.max(w, h3)) : 1;
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h3 * scale)), scale };
}
function isAcceptedImage(file) {
  const type = (file.type ?? "").toLowerCase();
  if (type) return ACCEPTED_IMAGE_TYPES.includes(type) || type === "image/jpg" || type === "image/pjpeg";
  return /\.(?:png|jpe?g)$/i.test(file.name ?? "");
}
function checkImageFile(file) {
  if (!isAcceptedImage(file)) return "That file isn't a PNG or JPEG. Use a screenshot saved as PNG or JPEG.";
  if (file.size <= 0) return "That file is empty. Choose another screenshot.";
  if (file.size > PASTE_MAX_BYTES) return "That file is over 20 MB. Use a smaller screenshot.";
  return null;
}
async function imageFileToDataUrl(file, max = PASTE_MAX_EDGE) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That file couldn't be opened as an image. Try a PNG or JPEG screenshot.");
  }
  try {
    const fit = scaleToFit(bitmap.width, bitmap.height, max);
    if (!fit.width) throw new Error("That image is empty. Choose another screenshot.");
    const type = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
    if (fit.scale === 1 && file.type === type) return await blobToDataUrl2(file);
    const canvas = new OffscreenCanvas(fit.width, fit.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, fit.width, fit.height);
    ctx.drawImage(bitmap, 0, 0, fit.width, fit.height);
    return await blobToDataUrl2(await canvas.convertToBlob({ type, quality: 0.92 }));
  } finally {
    bitmap.close();
  }
}
function renderPasteStatus(status, act) {
  switch (status.kind) {
    case "idle":
      return null;
    case "working":
      return h(
        "div",
        { class: "banner accent rc-paste-status", role: "status" },
        spinner(),
        h("span", { text: status.what === "image" ? "Reading your screenshot..." : "Reading your pasted text..." })
      );
    case "confirm":
      return h(
        "div",
        { class: "banner warn rc-paste-status", role: "alert" },
        h("span", { text: "This doesn't look like a test question. Rulecard works best with the passage, the question and all four answer choices." }),
        h(
          "div",
          { class: "row rc-wrap" },
          h("button", { class: "btn small primary", text: "Explain anyway", onclick: act.explainAnyway }),
          h("button", { class: "btn small link", text: "Edit the text", onclick: act.dismiss })
        )
      );
    case "notice":
      return h(
        "div",
        { class: `banner ${status.tone} rc-paste-status`, role: "alert" },
        h("span", { text: status.text }),
        h("button", { class: "btn link small", text: "Dismiss", onclick: act.dismiss })
      );
  }
}
function renderPastePanel(view, act) {
  if (!view.open) {
    return h(
      "div",
      { class: "rc-paste rc-paste-closed" },
      h("button", { class: "btn small", text: "Paste a question", title: "Paste question text or a screenshot", "aria-expanded": "false", onclick: act.toggle }),
      renderPasteStatus(view.status, act)
    );
  }
  const busy = view.status.kind === "working";
  const hover = (e) => {
    e.preventDefault();
    e.currentTarget?.classList.add("rc-paste-drop-over");
  };
  const leave = (e) => {
    const el = e.currentTarget;
    const to = e.relatedTarget;
    if (el && to && el.contains(to)) return;
    el?.classList.remove("rc-paste-drop-over");
  };
  return h(
    "section",
    { class: "card rc-paste", "aria-label": "Paste a question" },
    h(
      "div",
      { class: "row between" },
      h("strong", { text: "Paste a question" }),
      h("button", { class: "btn link small", text: "Close", "aria-expanded": "true", onclick: act.toggle })
    ),
    h("textarea", {
      id: PASTE_TEXTAREA_ID,
      class: "input rc-paste-text",
      rows: "7",
      placeholder: "Paste the passage, the question and the answer choices.",
      "aria-label": "Question text",
      value: view.draft,
      disabled: busy,
      oninput: (e) => act.draft(e.target.value),
      onkeydown: (e) => {
        const k = e;
        if (k.key === "Enter" && (k.metaKey || k.ctrlKey)) {
          k.preventDefault();
          act.explainText();
        }
      },
      onpaste: (e) => {
        const data = e.clipboardData;
        if (!data || data.getData("text/plain").trim()) return;
        const files = Array.from(data.files);
        if (files.some((f) => isAcceptedImage(f))) {
          e.preventDefault();
          act.files(files);
        }
      }
    }),
    h(
      "div",
      { class: "row rc-wrap" },
      h("button", { class: "btn primary small", text: "Explain pasted text", disabled: busy, onclick: act.explainText }),
      h("span", { class: "small muted", text: "Include all four answer choices." })
    ),
    h(
      "div",
      {
        class: "rc-paste-drop",
        ondragenter: hover,
        ondragover: hover,
        ondragleave: leave,
        ondrop: (e) => {
          e.preventDefault();
          e.currentTarget?.classList.remove("rc-paste-drop-over");
          if (!busy) act.files(e.dataTransfer?.files);
        }
      },
      h("span", { class: "small", text: "Or drop a screenshot here (PNG or JPEG)." }),
      h(
        "label",
        { class: "btn small rc-paste-pick" },
        h("span", { text: "Choose a file" }),
        // No id on purpose: render() copies values of inputs with ids, and a file input can't take one.
        h("input", {
          type: "file",
          accept: "image/png,image/jpeg",
          class: "rc-visually-hidden",
          disabled: busy,
          onchange: (e) => {
            const input = e.target;
            const files = input.files ? Array.from(input.files) : [];
            input.value = "";
            act.files(files);
          }
        })
      )
    ),
    renderPasteStatus(view.status, act)
  );
}
function createPastePanel(host) {
  let open5 = false;
  let draft = "";
  let status = { kind: "idle" };
  const set = (next) => {
    status = next;
    host.rerender();
  };
  const liveDraft = () => {
    const el = typeof document !== "undefined" ? document.getElementById(PASTE_TEXTAREA_ID) : null;
    if (el && "value" in el) draft = String(el.value);
    return draft;
  };
  async function send(what, make) {
    if (status.kind === "working") return;
    set({ kind: "working", what });
    try {
      await host.processImage(await make());
      draft = "";
      open5 = false;
      set({ kind: "idle" });
    } catch (error) {
      set({ kind: "notice", tone: "danger", text: describeError(host, error) });
    }
  }
  function explainText(force = false) {
    if (status.kind === "working") return Promise.resolve();
    const check = checkQuestionText(normalizePastedText(liveDraft()), "paste");
    if (!check.ok) {
      set({ kind: "notice", tone: "warn", text: check.message });
      return Promise.resolve();
    }
    if (!force && !looksLikeQuestion(check.text)) {
      set({ kind: "confirm", text: check.text });
      return Promise.resolve();
    }
    const text2 = check.text;
    return send("text", () => questionTextToImage(text2));
  }
  function explainFiles(files) {
    if (status.kind === "working") return Promise.resolve();
    const list2 = files ? Array.from(files) : [];
    const file = list2.find((f) => isAcceptedImage(f)) ?? list2[0];
    if (!file) return Promise.resolve();
    const problem = checkImageFile(file);
    if (problem) {
      set({ kind: "notice", tone: "warn", text: problem });
      return Promise.resolve();
    }
    return send("image", () => imageFileToDataUrl(file));
  }
  const actions = {
    toggle: () => {
      liveDraft();
      open5 = !open5;
      if (!open5 && status.kind !== "working") status = { kind: "idle" };
      host.rerender();
      if (open5 && typeof document !== "undefined") document.getElementById(PASTE_TEXTAREA_ID)?.focus();
    },
    draft: (text2) => {
      draft = text2;
    },
    explainText: () => void explainText(),
    explainAnyway: () => {
      if (status.kind !== "confirm") return;
      const text2 = status.text;
      void send("text", () => questionTextToImage(text2));
    },
    dismiss: () => set({ kind: "idle" }),
    files: (files) => void explainFiles(files)
  };
  return {
    render: () => renderPastePanel({ open: open5, draft, status }, actions),
    open: () => {
      if (!open5) actions.toggle();
    },
    close: () => {
      if (open5) actions.toggle();
    },
    isOpen: () => open5,
    status: () => status,
    /** Explain the current draft. force skips the "doesn't look like a question" check. */
    explainText,
    explainFiles
  };
}

// extension/src/addons/qbtext.ts
var RW_DOMAINS = ["Information and Ideas", "Craft and Structure", "Expression of Ideas", "Standard English Conventions"];
var RW_SKILLS = [
  "Central Ideas and Details",
  "Command of Evidence",
  "Inferences",
  "Words in Context",
  "Text Structure and Purpose",
  "Cross-Text Connections",
  "Rhetorical Synthesis",
  "Transitions",
  "Boundaries",
  "Form, Structure, and Sense"
];
function loose(phrase) {
  return phrase.split("").map((c) => c === " " ? "\\s*" : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*").join("");
}
var squash = (s) => s.replace(/\s+/g, "").toLowerCase();
var tidy = (s) => s.replace(/[ \t\u00a0]+/g, " ").trim();
var RE_QID = new RegExp(`${loose("Question ID")}\\s*:?\\s*((?:[0-9a-fA-F] ?){7}[0-9a-fA-F])(?![0-9A-Za-z])`, "i");
var RE_QID_ANY = new RegExp(`${loose("Question ID")}\\s*:?\\s*([A-Za-z0-9-]{6,})`, "i");
var RE_CORRECT = new RegExp(`${loose("Correct Answer")}\\s*:?\\s*\\(?([A-D])\\)?(?![A-Za-z])`, "i");
var RE_RATIONALE = new RegExp(`^\\s*${loose("Rationale")}\\s*$`, "im");
var RE_CHOICE_INLINE = /^\(?([A-D])\s*[.)]\s*(.*)$/;
var RE_CHOICE_ALONE = /^\(?([A-D])\)?\s*\.?$/;
var RE_STOP = new RegExp(`^(${loose("Correct Answer")}|${loose("Rationale")}|${loose("Question Difficulty")})`, "i");
var RE_ANSWER_LABEL = new RegExp(`^${loose("Answer")}$`, "i");
var RE_QUESTION_LABEL = new RegExp(`^${loose("Question")}$`, "i");
function parseQuestionBankText(text2) {
  const out = {
    qbId: null,
    domain: null,
    skill: null,
    difficulty: null,
    passage: null,
    stem: null,
    choices: {},
    correct: null,
    rationale: null,
    answerRevealed: false
  };
  if (!text2) return out;
  out.qbId = (text2.match(RE_QID)?.[1] ?? text2.match(RE_QID_ANY)?.[1])?.replace(/\s+/g, "").toLowerCase() ?? null;
  const correct = text2.match(RE_CORRECT)?.[1]?.toUpperCase();
  out.correct = correct && LETTERS2.includes(correct) ? correct : null;
  out.answerRevealed = out.correct !== null;
  const ratIdx = text2.search(RE_RATIONALE);
  if (ratIdx >= 0) {
    const after = text2.slice(ratIdx).replace(RE_RATIONALE, "");
    const rationale = after.split(/\n\s*Question\s*ID/i)[0]?.trim();
    out.rationale = rationale ? tidy(rationale.replace(/\s*\n\s*/g, " ")) : null;
  }
  const headEnd = (() => {
    const m = text2.search(/\n\s*Q\s*u\s*e\s*s\s*t\s*i\s*o\s*n\s*\n/i);
    return m > 0 ? m : Math.min(text2.length, 600);
  })();
  const head3 = squash(text2.slice(0, headEnd));
  out.domain = RW_DOMAINS.find((d) => head3.includes(squash(d))) ?? null;
  out.skill = [...RW_SKILLS].sort((a, b) => b.length - a.length).find((s) => head3.includes(squash(s))) ?? null;
  const rawHead = text2.slice(0, headEnd);
  out.difficulty = ["Easy", "Medium", "Hard"].find((d) => new RegExp(`(^|[^A-Za-z])${loose(d)}(?![a-z])`, "i").test(rawHead)) ?? null;
  const body = ratIdx >= 0 ? text2.slice(0, ratIdx) : text2;
  const lines = body.split(/\r?\n/).map(tidy).filter(Boolean);
  const starters = [];
  lines.forEach((line, idx) => {
    if (RE_STOP.test(line)) return;
    const alone = line.match(RE_CHOICE_ALONE);
    const inline = line.match(RE_CHOICE_INLINE);
    const m = alone ?? inline;
    if (m?.[1]) starters.push({ idx, letter: m[1], rest: alone ? "" : (m[2] ?? "").trim() });
  });
  let run = null;
  for (let i2 = starters.length - 4; i2 >= 0; i2--) {
    const seq = starters.slice(i2, i2 + 4);
    if (seq.map((s) => s.letter).join("") === "ABCD" && seq.every((s, k) => k === 0 || s.idx > seq[k - 1].idx)) {
      run = seq;
      break;
    }
  }
  if (run) {
    const endIdx = (() => {
      for (let j = run[3].idx + 1; j < lines.length; j++) if (RE_STOP.test(lines[j])) return j;
      return lines.length;
    })();
    run.forEach((s, k) => {
      const until = k < 3 ? run[k + 1].idx : Math.min(endIdx, s.idx + (s.rest ? 1 : 2));
      const parts = [s.rest, ...lines.slice(s.idx + 1, until)].filter(Boolean);
      out.choices[s.letter] = tidy(parts.join(" "));
    });
    const before = lines.slice(0, run[0].idx).filter((l) => !RE_ANSWER_LABEL.test(l));
    let stemIdx = -1;
    for (let j = before.length - 1; j >= 0; j--) {
      if (/\?\s*$/.test(before[j]) || /^Which\s*choice/i.test(before[j])) {
        stemIdx = j;
        break;
      }
    }
    if (stemIdx >= 0) {
      out.stem = before[stemIdx];
      const qLabel = before.findIndex((l) => RE_QUESTION_LABEL.test(l));
      const passageLines = before.slice(qLabel >= 0 ? qLabel + 1 : 0, stemIdx);
      out.passage = passageLines.length ? tidy(passageLines.join(" ")) : null;
    }
  }
  return out;
}
function splitExport(text2) {
  const re = new RegExp(loose("Question ID"), "gi");
  const starts = [];
  for (let m = re.exec(text2); m; m = re.exec(text2)) starts.push(m.index);
  return starts.map((s, i2) => text2.slice(s, starts[i2 + 1] ?? text2.length));
}
var norm2 = (s) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function similarity(a, b) {
  const ta = norm2(a).split(" ").filter(Boolean);
  const tb = norm2(b).split(" ").filter(Boolean);
  if (!ta.length && !tb.length) return 1;
  if (!ta.length || !tb.length) return 0;
  const counts = /* @__PURE__ */ new Map();
  for (const t of ta) counts.set(t, (counts.get(t) ?? 0) + 1);
  let shared = 0;
  for (const t of tb) {
    const c = counts.get(t) ?? 0;
    if (c > 0) {
      shared++;
      counts.set(t, c - 1);
    }
  }
  return 2 * shared / (ta.length + tb.length);
}
function crossCheck(model, page) {
  const warnings = [];
  if (page.qbId && model.qbId && page.qbId.toLowerCase() !== model.qbId.toLowerCase())
    warnings.push(`The page shows question ${page.qbId}, but the capture read ${model.qbId}. You may have captured a different question.`);
  if (page.correct && model.correct && page.correct !== model.correct)
    warnings.push(`The page says the answer is ${page.correct}, but the capture read ${model.correct}. Capture again before you trust this card.`);
  if (page.correct && !model.correct)
    warnings.push(`The page shows the answer is ${page.correct}. The capture missed it, so try capturing again with the answer in view.`);
  const mismatched = LETTERS2.filter((l) => page.choices[l] && model.choices[l] && similarity(page.choices[l], model.choices[l]) < 0.6);
  if (mismatched.length >= 2) warnings.push(`Choices ${mismatched.join(", ")} don't match the page text. The capture may have misread them.`);
  return { ok: warnings.length === 0, warnings, pageCorrect: page.correct };
}
var QB_HOSTS = ["satsuitequestionbank.collegeboard.org", "satsuiteeducatorquestionbank.collegeboard.org"];
var isQuestionBankUrl = (url) => {
  try {
    return !!url && QB_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
};
async function readQuestionBankPage(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => {
        const root = document.querySelector("[role=dialog], .modal, .cb-modal") ?? document.body;
        if (!root) return { text: "", media: 0 };
        const media = [...root.querySelectorAll("img, svg, table, canvas, math, mjx-container, .MathJax, figure")].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 60 && r.height > 40;
        }).length;
        return { text: (root.innerText || "").slice(0, 6e4), media };
      }
    });
    const reads = results.map((r) => r.result).filter((r) => !!r && typeof r.text === "string" && r.text.length > 0);
    const best = reads.map((r) => ({ r, score: (RE_QID_ANY.test(r.text) ? 2 : 0) + (/\bA[.)]/.test(r.text) ? 1 : 0) + r.text.length / 1e6 })).sort((a, b) => b.score - a.score)[0];
    return best ? { parsed: parseQuestionBankText(best.r.text), media: best.r.media } : null;
  } catch {
    return null;
  }
}

// extension/src/addons/qbquiz.ts
var QUIZ_KEY = "rc.addons.qbquiz.v1";
var HISTORY_MAX = 20;
var MAX_SECONDS = 1800;
var NO_SKILL = "No skill listed";
var loose2 = (phrase) => phrase.split("").map((c) => c === " " ? "\\s*" : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*").join("");
var squash2 = (s) => s.replace(/\s+/g, "").toLowerCase();
var tidy2 = (s) => s.replace(/\s+/g, " ").trim();
var RE_HEAD_END = /\n\s*Q\s*u\s*e\s*s\s*t\s*i\s*o\s*n\s*\n/i;
var RE_QDIFF = new RegExp(loose2("Question Difficulty"), "gi");
var RE_STOP_LINE = new RegExp(`^(?:${loose2("Correct Answer")}|${loose2("Rationale")}|${loose2("Question Difficulty")})`, "i");
var RE_QUESTION_LINE = new RegExp(`^${loose2("Question")}$`, "i");
var RE_ANSWER_LINE = new RegExp(`^(?:ID\\s*:?\\s*\\S+\\s+)?${loose2("Answer")}$`, "i");
var RE_ID_LINE = /^ID\s*:/i;
var RE_CHOICE_A = /^\(?A(?:\s*[.)]|\)?\s*\.?$)/;
var MATH_SKILLS_LONGEST = [...MATH_SKILLS].sort((a, b) => b.length - a.length);
function mathTaxonomy(block) {
  const end = block.search(RE_HEAD_END);
  const head3 = squash2(block.slice(0, end > 0 ? end : Math.min(block.length, 600)));
  const skill = MATH_SKILLS_LONGEST.find((s) => head3.includes(squash2(s))) ?? null;
  const domain = MATH_DOMAINS.find((d) => head3.includes(squash2(d))) ?? (skill ? domainOfSkill(skill) : null);
  return { domain, skill };
}
function fallbackStem(block) {
  const lines = block.split(/\r?\n/).map(tidy2).filter(Boolean);
  const stop = lines.findIndex((l) => RE_STOP_LINE.test(l));
  const body = stop >= 0 ? lines.slice(0, stop) : lines;
  const label = body.findIndex((l) => RE_QUESTION_LINE.test(l));
  if (label < 0) return null;
  let a = -1;
  for (let j = body.length - 1; j > label; j--) {
    if (RE_CHOICE_A.test(body[j])) {
      a = j;
      break;
    }
  }
  if (a < 0) return null;
  return tidy2(body.slice(label + 1, a).filter((l) => !RE_ANSWER_LINE.test(l) && !RE_ID_LINE.test(l)).join(" ")) || null;
}
function cleanRationale(r) {
  if (!r) return null;
  let cut = -1;
  for (const m of r.matchAll(RE_QDIFF)) cut = m.index ?? cut;
  return tidy2(cut >= 0 && r.length - cut < 48 ? r.slice(0, cut) : r) || null;
}
function toQuizQuestion(block) {
  const p = parseQuestionBankText(block);
  const texts = LETTERS2.map((l) => tidy2(p.choices[l] ?? ""));
  if (!texts.every(Boolean)) return { question: null, noAnswer: false };
  if (!p.correct) return { question: null, noAnswer: true };
  const stem = p.stem ? tidy2(p.stem) : fallbackStem(block);
  if (!stem) return { question: null, noAnswer: false };
  const math2 = !p.domain && !p.skill ? mathTaxonomy(block) : null;
  return {
    question: {
      qbId: p.qbId,
      domain: p.domain ?? math2?.domain ?? null,
      skill: p.skill ?? math2?.skill ?? null,
      difficulty: p.difficulty,
      passage: p.stem && p.passage ? tidy2(p.passage) || null : null,
      stem,
      choices: { A: texts[0], B: texts[1], C: texts[2], D: texts[3] },
      correct: p.correct,
      rationale: cleanRationale(p.rationale)
    },
    noAnswer: false
  };
}
var fingerprint = (q) => squash2([q.passage ?? "", q.stem, ...LETTERS2.map((l) => q.choices[l])].join("|"));
function parseExport(text2) {
  const out = { questions: [], skipped: 0, noAnswer: 0, duplicates: 0 };
  const src = typeof text2 === "string" ? text2.replace(/\r\n?/g, "\n") : "";
  if (!src.trim()) return out;
  const blocks = splitExport(src);
  if (!blocks.length) {
    const r = toQuizQuestion(src);
    if (r.question) out.questions.push(r.question);
    else if (r.noAnswer) {
      out.skipped++;
      out.noAnswer++;
    }
    return out;
  }
  const seen = /* @__PURE__ */ new Set();
  for (const block of blocks) {
    const r = toQuizQuestion(block);
    if (!r.question) {
      out.skipped++;
      if (r.noAnswer) out.noAnswer++;
      continue;
    }
    const key = r.question.qbId ? `id:${r.question.qbId}` : `text:${fingerprint(r.question)}`;
    if (seen.has(key)) {
      out.duplicates++;
      continue;
    }
    seen.add(key);
    out.questions.push(r.question);
  }
  return out;
}
var previewOf = (p) => ({
  found: p.questions.length,
  skipped: p.skipped,
  noAnswer: p.noAnswer,
  duplicates: p.duplicates
});
function toParsedQB(q) {
  return {
    qbId: q.qbId,
    domain: q.domain,
    skill: q.skill,
    difficulty: q.difficulty,
    passage: q.passage,
    stem: q.stem,
    choices: { ...q.choices },
    correct: q.correct,
    rationale: q.rationale,
    answerRevealed: true
  };
}
var questionTarget = (q) => targetSecondsFor(q);
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function shuffled(items, seed) {
  const out = items.slice();
  const rand = mulberry32(seed);
  for (let i2 = out.length - 1; i2 > 0; i2--) {
    const j = Math.floor(rand() * (i2 + 1));
    const tmp = out[i2];
    out[i2] = out[j];
    out[j] = tmp;
  }
  return out;
}
var copyQuestion = (q) => ({ ...q, choices: { ...q.choices } });
var toSeconds = (ms) => Number.isFinite(ms) ? Math.min(MAX_SECONDS, Math.max(0, Math.round(ms / 1e3))) : 0;
function createQuiz(questions, opts) {
  const now = opts.now;
  const seed = (opts.seed ?? now) >>> 0;
  const all = questions.map((_, i2) => i2);
  let pick = opts.shuffle ? shuffled(all, seed) : all;
  const limit = opts.limit && opts.limit > 0 ? Math.floor(opts.limit) : null;
  if (limit !== null) pick = pick.slice(0, limit);
  const kept = [...pick].sort((a, b) => a - b);
  const pos = new Map(kept.map((orig, k) => [orig, k]));
  return {
    id: `quiz-${Math.round(now).toString(36)}-${seed.toString(36)}`,
    questions: kept.map((i2) => copyQuestion(questions[i2])),
    order: pick.map((i2) => pos.get(i2)),
    index: 0,
    answers: {},
    shownAt: now,
    startedAt: now,
    finishedAt: kept.length ? null : now,
    timed: opts.timed ?? true
  };
}
var isFinished = (s) => s.finishedAt !== null;
function onScreen(s) {
  if (isFinished(s)) return null;
  const qi = s.order[s.index];
  return qi === void 0 || !s.questions[qi] ? null : qi;
}
function currentQuestion(s) {
  const qi = onScreen(s);
  return qi === null ? null : s.questions[qi];
}
function currentAnswer(s) {
  const qi = onScreen(s);
  return qi === null ? null : s.answers[qi] ?? null;
}
function quizProgress(s) {
  const total = s.order.length;
  return {
    number: Math.min(s.index + 1, total),
    total,
    answered: s.order.filter((i2) => s.answers[i2]).length,
    left: Math.max(0, total - s.index - 1)
  };
}
function answerQuiz(s, letter, now) {
  const qi = onScreen(s);
  if (qi === null || s.answers[qi] || !LETTERS2.includes(letter)) return s;
  const q = s.questions[qi];
  return { ...s, answers: { ...s.answers, [qi]: { picked: letter, correct: letter === q.correct, seconds: toSeconds(now - s.shownAt) } } };
}
function advance(s, now) {
  if (s.index >= s.order.length - 1) return { ...s, index: s.order.length, finishedAt: now };
  return { ...s, index: s.index + 1, shownAt: now };
}
function nextQuiz(s, now) {
  const qi = onScreen(s);
  return qi === null || !s.answers[qi] ? s : advance(s, now);
}
function skipQuiz(s, now) {
  return onScreen(s) === null ? s : advance(s, now);
}
function finishQuiz(s, now) {
  return isFinished(s) ? s : { ...s, finishedAt: now };
}
function resumeQuiz(s, now) {
  const qi = onScreen(s);
  return qi === null || s.answers[qi] ? s : { ...s, shownAt: now };
}
function quizSummary(s) {
  const asked = s.order.filter((i2) => s.questions[i2]);
  const skills = /* @__PURE__ */ new Map();
  const misses = [];
  let answered = 0;
  let right = 0;
  let totalSeconds = 0;
  let slow = 0;
  for (const qi of asked) {
    const a = s.answers[qi];
    if (!a) continue;
    const q = s.questions[qi];
    answered++;
    totalSeconds += a.seconds;
    if (a.seconds > questionTarget(q)) slow++;
    const key = q.skill ?? q.domain ?? NO_SKILL;
    const g = skills.get(key) ?? { skill: key, right: 0, total: 0 };
    g.total++;
    if (a.correct) {
      right++;
      g.right++;
    } else misses.push({ question: q, picked: a.picked, seconds: a.seconds });
    skills.set(key, g);
  }
  const bySkill = [...skills.values()].sort((a, b) => a.right / a.total - b.right / b.total || b.total - b.right - (a.total - a.right) || b.total - a.total || a.skill.localeCompare(b.skill));
  const allMath = asked.length > 0 && asked.every((i2) => questionTarget(s.questions[i2]) === MATH_TARGET_SECONDS);
  return {
    total: asked.length,
    answered,
    right,
    wrong: answered - right,
    unanswered: asked.length - answered,
    accuracy: answered ? right / answered : null,
    avgSeconds: answered ? Math.round(totalSeconds / answered) : null,
    totalSeconds,
    minutes: Math.round(totalSeconds / 60),
    target: allMath ? MATH_TARGET_SECONDS : TARGET_SECONDS,
    slow,
    bySkill,
    misses,
    startedAt: s.startedAt,
    finishedAt: s.finishedAt
  };
}
function retryMisses(s, now) {
  const missed = s.order.filter((i2) => s.answers[i2] && !s.answers[i2].correct && s.questions[i2]).map((i2) => s.questions[i2]);
  return createQuiz(missed, { now, timed: s.timed });
}
var KEY_LETTERS = { a: "A", b: "B", c: "C", d: "D", "1": "A", "2": "B", "3": "C", "4": "D" };
function quizKey(key) {
  if (key === "Enter" || key === " ") return "next";
  return key.length === 1 ? KEY_LETTERS[key.toLowerCase()] ?? null : null;
}
function toResult(s) {
  const m = quizSummary(s);
  return {
    id: s.id,
    startedAt: s.startedAt,
    finishedAt: s.finishedAt ?? s.shownAt,
    total: m.total,
    answered: m.answered,
    right: m.right,
    accuracy: m.accuracy,
    avgSeconds: m.avgSeconds,
    slow: m.slow,
    minutes: m.minutes,
    target: m.target,
    bySkill: m.bySkill
  };
}
var isObj = (x) => typeof x === "object" && x !== null && !Array.isArray(x);
var isNum2 = (x) => typeof x === "number" && Number.isFinite(x);
function cleanActive(x) {
  if (!isObj(x)) return null;
  const ok = typeof x.id === "string" && Array.isArray(x.questions) && Array.isArray(x.order) && isNum2(x.index) && isObj(x.answers) && isNum2(x.shownAt) && isNum2(x.startedAt) && (x.finishedAt === null || isNum2(x.finishedAt));
  return ok ? { ...x, timed: typeof x.timed === "boolean" ? x.timed : true } : null;
}
function cleanStore(raw) {
  if (!isObj(raw)) return { active: null, history: [] };
  const history = Array.isArray(raw.history) ? raw.history.filter((r) => isObj(r) && typeof r.id === "string" && isNum2(r.finishedAt)).slice(0, HISTORY_MAX) : [];
  return { active: cleanActive(raw.active), history };
}
var tail = Promise.resolve();
function queued(fn) {
  const run = tail.then(fn, fn);
  tail = run.catch(() => void 0);
  return run;
}
var rawRead = async () => cleanStore(await kv().get(QUIZ_KEY));
async function rawWrite(s) {
  const clean2 = { active: s.active ?? null, history: (s.history ?? []).slice(0, HISTORY_MAX) };
  await kv().set(QUIZ_KEY, clean2);
  return clean2;
}
var readQuizStore = () => queued(rawRead);
var writeQuizStore = (s) => queued(() => rawWrite(s));
var saveActive = (state2) => queued(async () => rawWrite({ ...await rawRead(), active: state2 }));
var recordResult = (state2) => queued(async () => {
  const store = await rawRead();
  const r = toResult(state2);
  if (!isFinished(state2) || !r.answered) return store;
  return rawWrite({ ...store, history: [r, ...store.history.filter((x) => x.id !== r.id)] });
});

// extension/src/addons/qbquiz-ui.ts
var LIMIT_CHOICES = [
  { value: 10, label: "10" },
  { value: 20, label: "20" },
  { value: null, label: "All" }
];
var plain = (text2) => text2;
var plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
var secs = (n) => `${n} s`;
var pct2 = (x) => x === null ? "0%" : `${Math.round(x * 100)}%`;
var clip2 = (s, n) => s.length > n ? `${s.slice(0, n - 1).trimEnd()}\u2026` : s;
function header(title, count2, extra, close2, closeLabel = "Quit") {
  return h(
    "div",
    { class: "row between rc-quiz-head" },
    h("h2", { text: title }),
    h(
      "div",
      { class: "row rc-quiz-head-right" },
      count2 ? h("span", { class: "small muted rc-quiz-count", text: count2 }) : null,
      extra,
      h("button", { class: "btn link small", title: "Esc", onclick: () => close2() }, closeLabel)
    )
  );
}
function bar(done, total) {
  const n = Math.max(0, Math.min(done, total));
  const fill = h("span");
  fill.style.width = `${total ? Math.round(n / total * 100) : 100}%`;
  return h("div", { class: "rc-quiz-bar", role: "progressbar", "aria-label": "Progress", "aria-valuemin": 0, "aria-valuemax": total, "aria-valuenow": n }, fill);
}
function clock(shownAt, ans, target, now) {
  const el = h("span", { class: "rc-quiz-clock", title: `Time on this question. Test pace is ${target} s.` });
  const show = (s) => {
    el.textContent = secs(s);
    el.classList.toggle("rc-quiz-over", s > target);
  };
  if (ans) {
    show(ans.seconds);
    return el;
  }
  const elapsed = () => Math.min(MAX_SECONDS, Math.max(0, Math.round((now() - shownAt) / 1e3)));
  show(elapsed());
  const timer = setInterval(() => {
    if (!el.isConnected) return clearInterval(timer);
    show(elapsed());
  }, 1e3);
  return el;
}
function meta(q) {
  const label = q.skill ?? q.domain;
  if (!label && !q.difficulty && !q.qbId) return null;
  return h(
    "div",
    { class: "row rc-quiz-meta" },
    label ? chip(label, "accent") : null,
    q.difficulty ? chip(q.difficulty) : null,
    q.qbId ? h("span", { class: "small muted", text: `ID ${q.qbId}` }) : null
  );
}
function choiceList(q, ans, pick, t) {
  return h("ol", { class: "choices" }, ...LETTERS2.map((letter, i2) => {
    const live = !ans && pick !== null;
    const choose = () => {
      if (live && pick) pick(letter);
    };
    const state2 = ans ? letter === q.correct ? "correct" : letter === ans.picked ? "picked" : "" : live ? "selectable" : "";
    return h(
      "li",
      {
        class: `choice ${state2}`.trim(),
        role: live ? "button" : null,
        tabindex: live ? 0 : null,
        title: live ? `${letter} or ${i2 + 1}` : null,
        onclick: live ? choose : null,
        onkeydown: live ? (ev) => {
          if (ev.key !== "Enter" && ev.key !== " ") return;
          ev.preventDefault();
          ev.stopPropagation();
          choose();
        } : null
      },
      h("span", { class: "letter", text: `${letter}.` }),
      h("span", null, t(q.choices[letter])),
      ans && letter === ans.picked ? h("span", { class: "rc-quiz-tag", text: "your pick" }) : null
    );
  }));
}
var stat = (value, label) => h("div", { class: "rc-quiz-stat" }, h("b", { text: value }), h("span", { text: label }));
function previewLines(p) {
  if (!p) return [h("p", { class: "small muted", text: "Paste an export to see how many questions it has." })];
  if (!p.found && !p.skipped) {
    return [h("p", { class: "small", text: "No questions found yet. Paste the whole export, from the first Question ID to the end." })];
  }
  const out = [h("p", { class: "rc-quiz-found", text: `Found ${plural(p.found, "question")}` })];
  if (p.skipped) out.push(h("p", { class: "small muted", text: `${p.skipped} skipped (grid-in or no answer key)` }));
  if (p.duplicates) out.push(h("p", { class: "small muted", text: `${plural(p.duplicates, "repeat")} left out` }));
  if (!p.found && p.noAnswer) {
    out.push(h("p", { class: "small rc-quiz-hint", text: "This export has no answer key. Include the answers when you export, then paste again." }));
  }
  return out;
}
function renderQuizEntry(state2, handlers) {
  let preview = state2.preview;
  let shuffle = state2.shuffle ?? true;
  let limit = state2.limit === void 0 ? 20 : state2.limit;
  const found = () => Math.max(0, preview?.found ?? 0);
  const status = h("div", { class: "rc-quiz-preview", "aria-live": "polite" });
  const start = h("button", { class: "btn primary", onclick: () => {
    if (found()) handlers.start({ shuffle, limit });
  } });
  const paint = () => {
    status.replaceChildren(...previewLines(preview));
    const n = found();
    start.disabled = n === 0;
    start.textContent = n ? `Start ${plural(limit ? Math.min(limit, n) : n, "question")}` : "Start";
  };
  const area = h("textarea", {
    id: "rc-quiz-text",
    class: "input rc-quiz-text",
    rows: 7,
    spellcheck: "false",
    placeholder: "Paste the whole export here",
    "aria-label": "Question Bank export text",
    oninput: (ev) => {
      const r = handlers.input(ev.target.value);
      if (r === void 0) return;
      preview = r;
      paint();
    }
  });
  area.value = state2.text ?? "";
  const shuffleBox = h("input", {
    type: "checkbox",
    id: "rc-quiz-shuffle",
    checked: shuffle,
    onchange: (ev) => {
      shuffle = ev.target.checked;
    }
  });
  const limits = h(
    "fieldset",
    { class: "rc-quiz-limits" },
    h("legend", { class: "small muted", text: "Questions" }),
    ...LIMIT_CHOICES.map(({ value, label }) => h(
      "label",
      { class: "rc-quiz-limit" },
      h("input", {
        type: "radio",
        name: "rc-quiz-limit",
        value: value === null ? "all" : String(value),
        checked: limit === value,
        onchange: () => {
          limit = value;
          paint();
        }
      }),
      h("span", { text: label })
    ))
  );
  paint();
  const last = state2.last;
  return h(
    "div",
    { class: "card rc-quiz rc-quiz-entry" },
    h("h2", { text: "Practice a Question Bank export" }),
    h("p", { class: "small muted", text: "Export questions from the Question Bank as a PDF, open it, select all, copy, and paste here." }),
    area,
    status,
    h(
      "div",
      { class: "row rc-quiz-options" },
      h("label", { class: "rc-quiz-check" }, shuffleBox, h("span", { text: "Shuffle the order" })),
      limits
    ),
    h("p", { class: "small muted", text: "You're graded with the export's answer key, and each question is timed. Nothing leaves this device until you ask for an explanation." }),
    h("div", { class: "row" }, start),
    last ? h("p", { class: "small muted rc-quiz-last", text: `Last quiz: ${last.right} of ${last.total} right.` }) : null
  );
}
function renderQuiz(state2, handlers, opts = {}) {
  const t = opts.renderText ?? plain;
  const q = currentQuestion(state2);
  const p = quizProgress(state2);
  if (!q) {
    return h(
      "div",
      { class: "card rc-quiz rc-quiz-run" },
      header("Question Bank practice", null, null, handlers.quit),
      h("p", { class: "small muted", text: "You've reached the end of this quiz." }),
      h("button", { class: "btn primary", title: "Enter", onclick: () => handlers.next() }, "See results")
    );
  }
  const ans = currentAnswer(state2);
  const target = questionTarget(q);
  const kids = [
    header("Question Bank practice", `${p.number} of ${p.total}`, state2.timed ? clock(state2.shownAt, ans, target, opts.now ?? Date.now) : null, handlers.quit),
    bar(state2.index + (ans ? 1 : 0), p.total),
    meta(q),
    q.passage ? h("div", { class: "passage" }, t(q.passage)) : null,
    h("p", { class: "stem" }, t(q.stem)),
    choiceList(q, ans, (l) => handlers.pick(l), t)
  ];
  if (!ans) {
    kids.push(h(
      "div",
      { class: "row between rc-quiz-hintrow" },
      h("p", { class: "small muted", text: "Pick an answer. Keys 1 to 4 or A to D work too." }),
      handlers.skip ? h("button", { class: "btn link small", onclick: () => handlers.skip?.() }, "Skip") : null
    ));
  } else {
    const right = ans.correct;
    const pace = ans.seconds > target ? `over the ${target} s pace` : `within the ${target} s pace`;
    kids.push(
      h(
        "div",
        { class: `banner ${right ? "good" : "danger"}`, role: "status" },
        h("p", { class: "stem", text: right ? `Right. The answer is ${q.correct}.` : `Not quite. You picked ${ans.picked}. The answer is ${q.correct}.` }),
        state2.timed ? h("p", { class: "small", text: `You took ${secs(ans.seconds)}, ${pace}.` }) : null
      ),
      h(
        "details",
        { class: "rc-quiz-rationale" },
        h("summary", { text: "Official explanation" }),
        q.rationale ? h("div", { class: "rc-quiz-rationale-text" }, t(q.rationale)) : h("p", { class: "small muted", text: "This export has no explanation for this question." })
      ),
      h(
        "div",
        { class: "row rc-quiz-actions" },
        right ? null : h("button", { class: "btn", onclick: () => handlers.explain(q, ans.picked) }, "Explain with Rulecard"),
        h("button", { class: "btn primary", title: "Enter", onclick: () => handlers.next() }, p.left > 0 ? `Next question (${p.left} left)` : "See results")
      )
    );
  }
  return h("div", { class: "card rc-quiz rc-quiz-run" }, ...kids);
}
function skillTable(s) {
  return h(
    "div",
    null,
    h("h3", { text: "By skill" }),
    h(
      "table",
      { class: "rc-quiz-skills" },
      h("thead", null, h("tr", null, h("th", { text: "Skill" }), h("th", { text: "Right" }), h("th", { text: "Accuracy" }))),
      h("tbody", null, ...s.bySkill.map((g) => {
        const rate = g.total ? g.right / g.total : 0;
        const fill = h("span");
        fill.style.width = `${Math.round(rate * 100)}%`;
        const tone = rate < 0.5 ? "rc-quiz-weak" : rate < 0.8 ? "rc-quiz-mid" : "";
        return h(
          "tr",
          null,
          h("td", { text: g.skill }),
          h("td", { class: "rc-quiz-num", text: `${g.right} of ${g.total}` }),
          h("td", null, h(
            "div",
            { class: "rc-quiz-acc" },
            h("div", { class: `rc-quiz-skill-bar ${tone}`.trim(), "aria-hidden": "true" }, fill),
            h("span", { class: "small muted rc-quiz-num", text: pct2(rate) })
          ))
        );
      }))
    )
  );
}
function review(q, picked, t) {
  return h(
    "details",
    { class: "rc-quiz-review" },
    h("summary", { text: "Show the question" }),
    q.passage ? h("div", { class: "passage" }, t(q.passage)) : null,
    h("p", { class: "stem" }, t(q.stem)),
    choiceList(q, { picked, correct: picked === q.correct, seconds: 0 }, null, t),
    q.rationale ? h("div", { class: "rc-quiz-rationale-text" }, h("b", { text: "Official explanation: " }), t(q.rationale)) : null
  );
}
function missItem(m, handlers, t) {
  const q = m.question;
  return h(
    "li",
    { class: "rc-quiz-miss" },
    h("p", { class: "rc-quiz-miss-text", text: clip2(q.passage ?? q.stem, 140) }),
    h(
      "div",
      { class: "row rc-quiz-miss-meta" },
      h("span", { class: "small", text: `You picked ${m.picked}. The answer is ${q.correct}.` }),
      q.skill ? chip(q.skill) : null,
      h("span", { class: "small muted", text: secs(m.seconds) })
    ),
    review(q, m.picked, t),
    h("button", { class: "btn small", onclick: () => handlers.explain(q, m.picked) }, "Explain with Rulecard")
  );
}
function renderQuizResult(summary, handlers, opts = {}) {
  const s = summary;
  const t = opts.renderText ?? plain;
  const top = header("Your results", null, null, handlers.done, "Close");
  if (!s.answered) {
    return h(
      "div",
      { class: "card rc-quiz rc-quiz-result" },
      top,
      h(
        "div",
        { class: "banner warn" },
        h("p", { class: "stem", text: "You didn't answer any questions." }),
        h("p", { class: "small", text: "Paste the export again when you're ready to practice." })
      ),
      h("button", { class: "btn primary", title: "Enter", onclick: () => handlers.done() }, "Done")
    );
  }
  const avg = s.avgSeconds ?? 0;
  const misses = s.misses.length;
  const paceLine = avg > s.target ? `On average you took ${avg - s.target} s longer than the ${s.target} s test pace.` : `On average you kept within the ${s.target} s test pace.`;
  return h(
    "div",
    { class: "card rc-quiz rc-quiz-result" },
    top,
    h(
      "div",
      { class: `banner ${(s.accuracy ?? 0) >= 0.8 ? "good" : "warn"}`, role: "status" },
      h("p", { class: "stem", text: `You got ${s.right} of ${s.total} right.` }),
      h("p", { class: "small", text: s.unanswered ? `That's ${pct2(s.accuracy)} of the ${s.answered} you answered. ${s.unanswered} left unanswered.` : `That's ${pct2(s.accuracy)}.` })
    ),
    h(
      "div",
      { class: "rc-quiz-stats" },
      stat(pct2(s.accuracy), "Accuracy"),
      stat(secs(avg), `Average time (pace ${s.target} s)`),
      stat(String(s.slow), s.slow === 1 ? "Question over pace" : "Questions over pace"),
      stat(s.minutes < 1 ? "<1" : String(s.minutes), "Minutes answering")
    ),
    h("p", { class: "small muted", text: paceLine }),
    s.bySkill.length ? skillTable(s) : null,
    misses ? h(
      "div",
      null,
      h("h3", { text: `Your misses (${misses})` }),
      h("ol", { class: "rc-quiz-misses" }, ...s.misses.map((m) => missItem(m, handlers, t)))
    ) : h("p", { class: "small", text: "No misses this time." }),
    h(
      "div",
      { class: "row rc-quiz-actions" },
      h("button", { class: misses ? "btn primary" : "btn", disabled: !misses, onclick: () => handlers.retry() }, "Retry my misses"),
      h("button", { class: misses ? "btn" : "btn primary", title: "Enter", onclick: () => handlers.done() }, "Done")
    )
  );
}

// extension/src/addons/plan.ts
var DAY2 = 864e5;
var EXPLORE_SCORE = 0.45;
var RECENCY_WEIGHT = 0.3;
var PHASE_LABEL = {
  steady: "Daily practice",
  build: "Build",
  strengthen: "Strengthen",
  sharpen: "Sharpen",
  final: "Final week",
  eve: "Day before",
  test: "Test day",
  past: "Daily practice"
};
var MIX = {
  steady: [0.6, 0.4, 0],
  past: [0.6, 0.4, 0],
  build: [0.6, 0.4, 0],
  strengthen: [0.5, 0.3, 0.2],
  sharpen: [0.4, 0.2, 0.4],
  final: [0.4, 0, 0.6],
  eve: [0, 0, 1],
  test: [0, 0, 0]
};
function startOfDay2(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function daysUntil(testDate, now) {
  const m = testDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return Math.round((new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() - startOfDay2(now)) / DAY2);
}
function phaseFor(days) {
  if (days === null) return "steady";
  if (days < 0) return "past";
  if (days === 0) return "test";
  if (days === 1) return "eve";
  if (days <= 7) return "final";
  if (days <= 14) return "sharpen";
  if (days <= 30) return "strengthen";
  return "build";
}
function splitGoal(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => total * w / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i2) => ({ i: i2, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i: i2 } of order) {
    if (left <= 0) break;
    out[i2] = (out[i2] ?? 0) + 1;
    left--;
  }
  return out;
}
var pct3 = (n) => `${Math.round(n * 100)}%`;
function suggestDifficulty(mine) {
  if (mine.length < 3) return { difficulty: "Medium", why: "" };
  const at = (level) => {
    const xs = mine.filter((e) => (e.difficulty ?? "").toLowerCase() === level);
    return { n: xs.length, acc: xs.length ? xs.filter((e) => e.result === "right").length / xs.length : 0 };
  };
  const hard = at("hard"), medium = at("medium");
  const overall = mine.filter((e) => e.result === "right").length / mine.length;
  if (hard.n >= 3 && hard.acc >= 0.7) return { difficulty: "Hard", why: `You get ${pct3(hard.acc)} of Hard right here. Stay on Hard.` };
  if (medium.n >= 3 && medium.acc >= 0.8) return { difficulty: "Hard", why: `You get ${pct3(medium.acc)} of Medium right, so step up to Hard.` };
  if (overall < 0.5) return { difficulty: "Easy, Medium", why: `You're under 50% here, so lock in the rule on Easy and Medium first.` };
  return { difficulty: "Medium", why: "" };
}
function reasonFor(attempts, misses, daysSince) {
  if (!attempts) return "You haven't practiced this skill yet.";
  const when = daysSince === null ? "" : daysSince <= 1 ? ", last practiced yesterday" : `, last practiced ${daysSince} days ago`;
  return `Missed ${misses} of ${attempts}${when}.`;
}
function rankSkills(before, sections, today) {
  const bySkill = /* @__PURE__ */ new Map();
  for (const e of before) {
    const info = skillInfo(e.skill);
    if (!info) continue;
    const xs = bySkill.get(info.skill) ?? [];
    xs.push(e);
    bySkill.set(info.skill, xs);
  }
  return SKILLS.map((info, index) => ({ info, index })).filter(({ info }) => sections.includes(info.section)).map(({ info, index }) => {
    const mine = bySkill.get(info.skill) ?? [];
    const attempts = mine.length;
    const misses = mine.filter((e) => e.result === "missed").length;
    const lastAt = attempts ? Math.max(...mine.map((e) => e.at)) : null;
    const daysSince = lastAt === null ? null : Math.round((today - startOfDay2(lastAt)) / DAY2);
    const score = attempts ? (misses + 1) / (attempts + 2) + RECENCY_WEIGHT * (Math.min(daysSince ?? 0, 14) / 14) : EXPLORE_SCORE;
    const { difficulty, why } = suggestDifficulty(mine);
    return { stat: { ...info, attempts, misses, lastAt, daysSince, score, difficulty, reason: reasonFor(attempts, misses, daysSince), difficultyReason: why }, index };
  }).sort((a, b) => b.stat.score - a.stat.score || b.stat.attempts - a.stat.attempts || a.index - b.index).map(({ stat: stat2 }) => stat2);
}
function pickFocus(ranked, fresh) {
  const first = ranked[0];
  if (!first) return [];
  const otherSection = fresh ? ranked.find((s) => s.section !== first.section) : void 0;
  const second = otherSection ?? ranked.find((s) => s !== first && s.domain !== first.domain) ?? ranked[1];
  return second ? [first, second] : [first];
}
var sectionTest = (sections) => sections.length === 2 ? "Reading and Writing, then Math" : sections[0] === "math" ? "Math" : "Reading and Writing";
var paceText = (sections) => sections.length === 2 ? `${TARGET_SECONDS} s per Reading and Writing question, ${MATH_TARGET_SECONDS} s per Math question` : sections[0] === "math" ? `${MATH_TARGET_SECONDS} s per question` : `${TARGET_SECONDS} s per question`;
function buildPlan(input) {
  const { log, srs, now } = input;
  const today = startOfDay2(now);
  const tomorrow = today + DAY2;
  const before = log.filter((e) => e.at < today);
  const todays = log.filter((e) => e.at >= today && e.at < tomorrow);
  const fresh = before.length === 0;
  const daysToTest = daysUntil(input.testDate, now);
  const phase = phaseFor(daysToTest);
  const seen = [...new Set(log.map((e) => sectionOf(e)))].sort();
  const sections = input.sections?.length ? input.sections : seen.length ? seen : ["rw", "math"];
  const ranked = rankSkills(before, sections, today);
  const focus = pickFocus(ranked, fresh);
  const baseGoal = Math.max(1, Math.round(input.dailyGoal ?? 10));
  const goalTotal = phase === "test" ? 0 : phase === "eve" ? Math.min(baseGoal, 5) : baseGoal;
  const [w1, w2, w3] = MIX[phase];
  const [n1 = 0, n2 = 0, n3 = 0] = splitGoal(goalTotal, [focus[0] ? w1 : 0, focus[1] ? w2 : 0, w3 || (focus.length ? 0 : w1 + w2)]);
  const items = [];
  const item = (p) => {
    const full = { steps: null, skill: null, section: null, difficulty: null, ...p, complete: false };
    full.complete = full.target !== null && full.target > 0 && full.done >= full.target;
    return full;
  };
  const rules = Object.values(srs);
  const reviewedToday = rules.filter((r) => r.lastReviewed !== null && r.lastReviewed >= today && r.lastReviewed < tomorrow);
  const dueNow = rules.filter((r) => r.due <= now && !reviewedToday.includes(r));
  const reviewTarget = dueNow.length + reviewedToday.length;
  if (reviewTarget > 0 && phase !== "test") {
    items.push(item({
      id: "review",
      kind: "review",
      title: `Review ${reviewTarget} due rule${reviewTarget === 1 ? "" : "s"}`,
      detail: "One fresh question per rule. Rules you get right move to a longer gap; misses come back tomorrow.",
      target: reviewTarget,
      done: reviewedToday.length
    }));
  }
  const focusSkills = /* @__PURE__ */ new Set();
  [n1, n2].forEach((n, i2) => {
    const s = focus[i2];
    if (!s || n <= 0) return;
    focusSkills.add(s.skill);
    const done = todays.filter((e) => skillInfo(e.skill)?.skill === s.skill).length;
    items.push(item({
      id: `focus-${i2 + 1}`,
      kind: "focus",
      title: `${n} ${s.skill} question${n === 1 ? "" : "s"} (${s.difficulty})`,
      detail: fresh ? `${s.domain}. A starting sample so Rulecard can find your weak spots.` : [s.reason, s.difficultyReason].filter(Boolean).join(" "),
      steps: qbFilterSteps(s, s.difficulty),
      skill: s.skill,
      section: s.section,
      difficulty: s.difficulty,
      target: n,
      done
    }));
  });
  if (n3 > 0) {
    const difficulty = phase === "eve" ? "Easy, Medium" : "Medium, Hard";
    const done = todays.filter((e) => !focusSkills.has(skillInfo(e.skill)?.skill ?? "")).length;
    const test = sectionTest(sections);
    items.push(item({
      id: "mixed",
      kind: "mixed",
      title: phase === "eve" ? `${n3}-question warm-up (${difficulty})` : `Timed mixed set: ${n3} question${n3 === 1 ? "" : "s"}`,
      detail: phase === "eve" ? "Easy wins only. Stop as soon as you feel warmed up." : `Mixed skills at test pace: ${paceText(sections)}. Turn on the timer or start a practice set.`,
      steps: `In the Question Bank pick Assessment: SAT, Test: ${test}, check every domain, Difficulty: ${difficulty}. Work through them in order and skip any you've seen.`,
      section: sections.length === 1 ? sections[0] : null,
      difficulty,
      target: n3,
      done
    }));
  }
  if (rules.length && (phase === "final" || phase === "eve" || phase === "test")) {
    const n = phase === "test" ? 5 : 10;
    items.push(item({
      id: "flashcards",
      kind: "flashcards",
      title: `Flip your ${n} weakest rule cards`,
      detail: phase === "test" ? "Read each rule once. No new questions today." : "Practice offline, then Rule flashcards. A few minutes is enough.",
      target: null,
      done: 0
    }));
  }
  if (phase === "eve") {
    items.push(item({ id: "rest", kind: "checklist", title: "Stop early and sleep", detail: "Cramming the night before costs more than it adds. Pack your bag and charge your device tonight.", target: null, done: 0 }));
  }
  if (phase === "test") {
    items.push(
      item({ id: "device", kind: "checklist", title: "Device charged, Bluebook up to date", detail: "Open Bluebook before you leave so any update is already done.", target: null, done: 0 }),
      item({ id: "bag", kind: "checklist", title: "Photo ID, admission ticket, pencils", detail: "Pencils or pens are for scratch paper. Bluebook has the Desmos calculator built in.", target: null, done: 0 })
    );
  }
  const goal = items.filter((i2) => i2.kind === "focus" || i2.kind === "mixed").reduce((a, i2) => a + (i2.target ?? 0), 0);
  const countable = items.filter((i2) => i2.target !== null && i2.target > 0);
  const d = daysToTest ?? 0;
  const headline = phase === "test" ? "Test day. No new questions: read your weakest rules once and go." : phase === "eve" ? "Test tomorrow. A light warm-up, your weakest rules, then rest." : fresh ? "Start with a few questions from different skills so Rulecard can find your weak spots." : phase === "final" ? `${d} days left. Mostly timed mixed sets at test pace, plus quick rule reviews.` : phase === "sharpen" ? `${d} days out. Half skill work, half timed mixed sets.` : phase === "strengthen" ? `${d} days out. Keep fixing weak skills and start timing some questions.` : phase === "build" ? `${d} days out. Build the rules: work your weakest skills, no timer needed.` : phase === "past" ? "Your test date has passed. Set the next one under Export & settings." : "Clear your reviews, then work your weakest skills.";
  return {
    day: dayKey(now),
    phase,
    phaseLabel: PHASE_LABEL[phase],
    headline,
    daysToTest,
    fresh,
    goal,
    doneToday: todays.length,
    items,
    complete: countable.length > 0 && countable.every((i2) => i2.complete),
    skills: ranked
  };
}
function planText(plan) {
  const lines = [`Rulecard plan for ${plan.day} (${plan.phaseLabel})`, plan.headline, ""];
  for (const i2 of plan.items) {
    const box = i2.target === null ? "-" : i2.complete ? "[x]" : "[ ]";
    const counter = i2.target === null ? "" : ` ${Math.min(i2.done, i2.target)}/${i2.target}`;
    lines.push(`${box} ${i2.title}${counter}`);
    if (i2.detail) lines.push(`    ${i2.detail}`);
    if (i2.steps) lines.push(`    ${i2.steps}`);
  }
  return lines.join("\n");
}
var open3 = null;
function renderPlan(plan, actions = {}) {
  const isOpen = open3 ?? (plan.doneToday === 0 && !plan.complete);
  const share = plan.goal ? Math.min(1, plan.doneToday / plan.goal) : plan.complete ? 1 : 0;
  const actionFor2 = (i2) => {
    if (i2.complete) return null;
    if (i2.kind === "review" && actions.startReview) return h("button", { class: "btn small", text: "Start review", onclick: actions.startReview });
    if (i2.kind === "flashcards" && actions.openFlashcards) return h("button", { class: "btn small", text: "Open flashcards", onclick: actions.openFlashcards });
    if (i2.kind === "mixed" && actions.startSet && i2.target) {
      const left = Math.max(1, i2.target - i2.done);
      return h("button", { class: "btn small", text: `Start a set of ${left}`, onclick: () => actions.startSet?.(left) });
    }
    return null;
  };
  const row = (i2) => h(
    "li",
    { class: `rc-plan-item${i2.complete ? " done" : ""}${i2.target === null ? " advice" : ""}` },
    h("span", { class: "rc-check", "aria-hidden": "true", text: i2.complete ? "\u2713" : i2.target === null ? "\u2022" : "" }),
    h(
      "div",
      { class: "rc-plan-body" },
      h(
        "div",
        { class: "rc-plan-line" },
        h("span", { class: "rc-plan-title", text: i2.title }),
        i2.target !== null ? h("span", { class: "small muted rc-num", text: `${Math.min(i2.done, i2.target)}/${i2.target}` }) : null
      ),
      i2.detail ? h("p", { class: "small muted", text: i2.detail }) : null,
      i2.steps ? h("details", { class: "rc-plan-steps" }, h("summary", { class: "small", text: "Find these in the Question Bank" }), h("p", { class: "small", text: i2.steps })) : null,
      actionFor2(i2)
    )
  );
  return h(
    "details",
    { class: `card rc-plan${plan.complete ? " complete" : ""}`, open: isOpen ? "" : null, ontoggle: (ev) => {
      open3 = ev.target.open;
    } },
    h(
      "summary",
      null,
      h(
        "span",
        { class: "rc-plan-head" },
        h("span", { class: "rc-plan-name", text: plan.complete ? "Today's plan: done" : "Today's plan" }),
        chip(plan.daysToTest !== null && plan.daysToTest > 0 ? `${plan.phaseLabel} \xB7 ${plan.daysToTest}d` : plan.phaseLabel, plan.complete ? "good" : ""),
        plan.goal ? h("span", { class: "small muted rc-num", text: `${Math.min(plan.doneToday, plan.goal)}/${plan.goal}` }) : null
      ),
      h("span", { class: `rc-meter${plan.complete ? " good" : " accent"}` }, h("span", { style: `width:${Math.round(share * 100)}%` }))
    ),
    h("p", { class: "small rc-plan-headline", text: plan.headline }),
    h("ol", { class: "rc-plan-items" }, ...plan.items.map(row)),
    actions.copy ? h("button", { class: "btn link small", text: "Copy plan", onclick: () => actions.copy?.(planText(plan)) }) : null
  );
}

// extension/src/addons/redo.ts
var REDO_KEY = "rc.addons.redo.v1";
var MAX_REDOS_PER_ENTRY = 20;
var isLetter = (x) => typeof x === "string" && LETTERS2.includes(x);
function isMultipleChoice(e) {
  if ("format" in e && e.format === "spr") return false;
  const choices = e.choices;
  if (!choices || typeof choices !== "object") return false;
  return LETTERS2.every((l) => {
    const text2 = choices[l];
    return typeof text2 === "string" && text2.trim() !== "";
  });
}
function isRedoable(e) {
  return !!e && e.result === "missed" && typeof e.attemptId === "string" && isMultipleChoice(e) && isLetter(e.correct);
}
function choiceList2(e) {
  return LETTERS2.map((letter) => ({ letter, text: e.choices?.[letter] ?? "" }));
}
function historyOf(store, attemptId) {
  const list2 = Object.prototype.hasOwnProperty.call(store, attemptId) ? store[attemptId] : void 0;
  if (!Array.isArray(list2)) return [];
  return list2.filter((a) => !!a && typeof a === "object" && typeof a.at === "number" && typeof a.correct === "boolean" && isLetter(a.picked)).sort((a, b) => a.at - b.at);
}
var matches = (e, f) => (!f.ruleId || e.ruleId === f.ruleId) && (!f.skill || e.skill === f.skill);
var byAttemptId = (a, b) => a < b ? -1 : a > b ? 1 : 0;
var oldestFirst = (a, b) => a.entry.at - b.entry.at || byAttemptId(a.entry.attemptId, b.entry.attemptId);
function eligible(log, store, filter) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const entry of log) {
    if (!isRedoable(entry) || !matches(entry, filter) || seen.has(entry.attemptId)) continue;
    seen.add(entry.attemptId);
    out.push({ entry, history: historyOf(store, entry.attemptId) });
  }
  return out;
}
function redoQueue(log, store, filter = {}) {
  const fresh = [];
  const wrong = [];
  for (const item of eligible(log, store, filter)) {
    const last = item.history[item.history.length - 1];
    if (!last) fresh.push(item);
    else if (!last.correct) wrong.push(item);
  }
  return [...fresh.sort(oldestFirst), ...wrong.sort(oldestFirst)];
}
function createRedo(log, store, now, opts = {}) {
  const items = redoQueue(log, store, opts);
  const limit = Math.floor(opts.limit ?? Infinity);
  return { items: limit > 0 && limit < items.length ? items.slice(0, limit) : items, index: 0, picked: null, results: [], startedAt: now };
}
function currentRedo(state2) {
  return state2.items[state2.index] ?? null;
}
function isRedoDone(state2) {
  return state2.index >= state2.items.length;
}
function answerRedo(state2, letter, now) {
  const item = currentRedo(state2);
  if (!item || state2.picked || !isLetter(letter)) return { state: state2, saved: null };
  const e = item.entry;
  const correct = letter === e.correct;
  const result = { attemptId: e.attemptId, ruleId: e.ruleId, ruleName: e.ruleName, picked: letter, correct, skipped: false, at: now };
  return {
    state: { ...state2, picked: letter, results: [...state2.results, result] },
    saved: { attemptId: e.attemptId, attempt: { at: now, correct, picked: letter } }
  };
}
function nextRedo(state2) {
  if (isRedoDone(state2) || !state2.picked) return state2;
  return { ...state2, index: state2.index + 1, picked: null };
}
function skipRedo(state2, now) {
  const item = currentRedo(state2);
  if (!item) return state2;
  if (state2.picked) return nextRedo(state2);
  const e = item.entry;
  const result = { attemptId: e.attemptId, ruleId: e.ruleId, ruleName: e.ruleName, picked: null, correct: false, skipped: true, at: now };
  return { ...state2, index: state2.index + 1, picked: null, results: [...state2.results, result] };
}
function redoSummary(state2) {
  const answered = state2.results.filter((r) => !r.skipped);
  const right = answered.filter((r) => r.correct).length;
  const again = /* @__PURE__ */ new Map();
  for (const r of answered) {
    if (r.correct) continue;
    const m = again.get(r.ruleId) ?? { ruleId: r.ruleId, ruleName: r.ruleName, count: 0 };
    m.count++;
    again.set(r.ruleId, m);
  }
  return {
    total: state2.items.length,
    answered: answered.length,
    right,
    wrong: answered.length - right,
    skipped: state2.results.length - answered.length,
    remaining: Math.max(0, state2.items.length - state2.index),
    accuracy: answered.length ? right / answered.length : null,
    missedAgain: [...again.values()].sort((a, b) => b.count - a.count)
  };
}
function redoStats(log, store, filter = {}) {
  let misses = 0, redone = 0, answers = 0, right = 0, fixed = 0;
  for (const { history } of eligible(log, store, filter)) {
    misses++;
    if (!history.length) continue;
    redone++;
    answers += history.length;
    right += history.filter((a) => a.correct).length;
    if (history[history.length - 1]?.correct) fixed++;
  }
  return { misses, redone, answers, right, accuracy: answers ? right / answers : null, fixed, left: misses - fixed };
}
async function readRedo() {
  const raw = await kv().get(REDO_KEY);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}
async function writeRedo(store) {
  await kv().set(REDO_KEY, store);
}
function addRedo(store, attemptId, attempt) {
  const list2 = [...historyOf(store, attemptId), { at: attempt.at, correct: attempt.correct, picked: attempt.picked }].sort((a, b) => a.at - b.at).slice(-MAX_REDOS_PER_ENTRY);
  return { ...store, [attemptId]: list2 };
}
var saving = Promise.resolve();
function recordRedo(attemptId, attempt) {
  const run = saving.then(async () => {
    const next = addRedo(await readRedo(), attemptId, attempt);
    await writeRedo(next);
    return next;
  });
  saving = run.catch(() => void 0);
  return run;
}

// extension/src/addons/practice-ui.ts
function flashHandlers(state2, actions, now = Date.now) {
  return {
    pick: () => {
    },
    flip: () => {
      if (!isDone(state2)) actions.update(flip(state2));
    },
    grade: (g) => {
      const r = grade(state2, g, now(), actions.getSrs?.() ?? state2.srs);
      if (r.state === state2) return;
      actions.saveSrs(r.srs);
      actions.update(r.state);
    },
    next: () => {
      if (isDone(state2)) actions.quit();
      else if (!state2.flipped) actions.update(flip(state2));
    },
    skip: () => {
    },
    quit: () => actions.quit()
  };
}
function redoHandlers(state2, actions, now = Date.now) {
  return {
    pick: (letter) => {
      const r = answerRedo(state2, letter, now());
      if (r.state === state2) return;
      if (r.saved) actions.saveAnswer(r.saved.attemptId, r.saved.attempt);
      actions.update(r.state);
    },
    flip: () => {
    },
    grade: () => {
    },
    next: () => {
      if (isRedoDone(state2)) return actions.quit();
      const n = nextRedo(state2);
      if (n !== state2) actions.update(n);
    },
    skip: () => {
      const n = skipRedo(state2, now());
      if (n !== state2) actions.update(n);
    },
    quit: () => actions.quit()
  };
}
var PICK_KEYS = { a: "A", b: "B", c: "C", d: "D", "1": "A", "2": "B", "3": "C", "4": "D" };
var GRADE_KEYS = { "1": "again", "2": "hard", "3": "good" };
function practiceKey(key, mode) {
  const k = key.length === 1 ? key.toLowerCase() : key;
  if (k === "Escape") return { name: "quit" };
  if (k === "Enter") return { name: "next" };
  if (mode === "flashcards") {
    if (k === " ") return { name: "flip" };
    const g = GRADE_KEYS[k];
    return g ? { name: "grade", arg: g } : null;
  }
  if (k === " ") return { name: "next" };
  if (k === "s") return { name: "skip" };
  const letter = PICK_KEYS[k];
  return letter ? { name: "pick", arg: letter } : null;
}
function pressPracticeKey(handlers, key, mode) {
  const a = practiceKey(key, mode);
  if (!a) return false;
  if (a.name === "pick") handlers.pick(a.arg);
  else if (a.name === "grade") handlers.grade(a.arg);
  else handlers[a.name]();
  return true;
}
var plain2 = (text2) => text2;
var plural2 = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
var shortDate = (ts) => new Date(ts).toLocaleDateString(void 0, { month: "short", day: "numeric" });
var ruleLabel = (id, name) => name ? `${id} \xB7 ${name}` : id;
var PASSAGE_CLIP = 1200;
function head(title, count2, quit, quitLabel = "Quit") {
  return h(
    "div",
    { class: "row between rc-pr-head" },
    h("h2", { text: title }),
    h(
      "div",
      { class: "row" },
      count2 ? h("span", { class: "small muted rc-pr-count", text: count2 }) : null,
      h("button", { class: "btn link small", title: "Esc", onclick: () => quit() }, quitLabel)
    )
  );
}
function bar2(done, total) {
  const n = Math.min(done, total);
  const fill = h("span");
  fill.style.width = `${total ? Math.round(n / total * 100) : 100}%`;
  return h("div", { class: "rc-pr-bar", role: "progressbar", "aria-label": "Progress", "aria-valuemin": 0, "aria-valuemax": total, "aria-valuenow": n }, fill);
}
function renderPracticeEntry(info, actions) {
  const due = Math.max(0, info.due || 0);
  const misses = Math.max(0, info.misses || 0);
  const weak = Math.max(0, info.weak || 0);
  if (!due && !misses && !weak) return null;
  return h(
    "div",
    { class: "card rc-practice-entry" },
    h(
      "div",
      null,
      h("h2", { text: "Practice offline" }),
      h("p", { class: "small muted", text: "Uses only what is saved on this device. No connection needed." })
    ),
    h(
      "div",
      { class: "row rc-pr-actions" },
      h("button", { class: due ? "btn primary" : "btn", disabled: !due, onclick: () => actions.flashcards(0) }, `Flip rule cards (${due} due)`),
      h("button", { class: !due && misses ? "btn primary" : "btn", disabled: !misses, onclick: () => actions.redo() }, `Redo my misses (${misses})`)
    ),
    !due && weak ? h("button", { class: "btn link small", onclick: () => actions.flashcards(weak) }, `Nothing is due. Flip your ${plural2(weak, "weakest rule")} instead`) : null
  );
}
function renderFlashcards(state2, actions, opts = {}) {
  const now = opts.now ?? Date.now;
  const handlers = flashHandlers(state2, actions, now);
  const card = currentCard(state2);
  const el = card ? flashCardView(state2, card, handlers, opts.renderText ?? plain2, actions.getSrs?.() ?? state2.srs, now()) : flashSummaryView(state2, handlers);
  return { el, handlers };
}
function flashCardView(state2, card, hs, t, srs, now) {
  const total = state2.cards.length;
  const kids = [
    head("Rule cards", `${state2.index + 1} of ${total}`, hs.quit),
    bar2(state2.index, total),
    h(
      "div",
      { class: "rc-flash-front" },
      h(
        "div",
        { class: "row" },
        h("span", { class: "rule-id", text: card.ruleId }),
        card.reason === "due" ? chip("due", "accent") : chip("often missed", "warn"),
        card.box !== null ? chip(`box ${card.box}/${MAX_BOX}`) : null
      ),
      h("p", { class: "rc-flash-name", text: card.ruleName ?? `Rule ${card.ruleId}` }),
      cueView(card, t)
    )
  ];
  if (state2.flipped) kids.push(backView(card, t), gradesView(state2, hs, srs, now));
  else kids.push(
    h("p", { class: "small muted", text: "Say the rule in your own words, then flip the card." }),
    h("button", { class: "btn primary", title: "Space", onclick: () => hs.flip() }, "Flip")
  );
  return h("div", { class: "card rc-practice rc-flash" }, ...kids);
}
function cueView(card, t) {
  const cue = card.cue;
  if (!cue) return h("p", { class: "small muted", text: "No question on this rule is saved on this device." });
  return h(
    "div",
    { class: "rc-flash-cue" },
    h("p", { class: "small muted", text: `${cue.missed ? "Last question you missed on this rule" : "Last question on this rule"} (${shortDate(cue.at)})` }),
    h("p", { class: "stem" }, t(cue.stem)),
    cue.passage ? h("details", { class: "rc-flash-passage" }, h("summary", { text: "Show the passage" }), h("div", { class: "passage" }, t(cue.passage))) : null
  );
}
function backView(card, t) {
  const list2 = (items) => h("ul", { class: "steps" }, ...items.map((x) => h("li", null, t(x))));
  const first = card.takeaways.slice(0, 3);
  const rest = card.takeaways.slice(3);
  return h(
    "div",
    { class: "rc-flash-back" },
    h(
      "div",
      null,
      h("h2", { text: "The rule" }),
      card.statement ? h("p", { class: "rule-statement" }, t(card.statement)) : h("p", { class: "small muted", text: "No rule statement is saved on this device." })
    ),
    first.length ? h(
      "div",
      null,
      h("h2", { text: card.takeaways.length === 1 ? "Takeaway" : "Takeaways" }),
      list2(first),
      rest.length ? h("details", { class: "rc-flash-more" }, h("summary", { text: `${rest.length} more` }), list2(rest)) : null
    ) : null,
    card.notes.length ? h(
      "div",
      null,
      h("h2", { text: "Your notes" }),
      h("ul", { class: "rc-flash-notes" }, ...card.notes.map((n) => h("li", null, n.text, h("span", { class: "small muted", text: ` \xB7 ${shortDate(n.at)}` }))))
    ) : null
  );
}
var GRADE_BUTTONS = [
  { g: "again", label: "Again", key: "1", cls: "" },
  { g: "hard", label: "Hard", key: "2", cls: "" },
  { g: "good", label: "Good", key: "3", cls: "primary" }
];
function gradesView(state2, hs, srs, now) {
  return h(
    "div",
    { class: "rc-flash-grade-wrap" },
    h("p", { class: "small muted", text: "How well did you know it?" }),
    h("div", { class: "rc-flash-grades" }, ...GRADE_BUTTONS.map(({ g, label, key, cls }) => {
      const due = nextDueIf(state2, g, now, srs);
      return h(
        "button",
        { class: `btn rc-flash-grade ${cls}`.trim(), title: key, onclick: () => hs.grade(g) },
        h("span", { text: label }),
        due !== null ? h("span", { class: "rc-flash-when", text: describeDue(due, now) }) : null
      );
    }))
  );
}
function flashSummaryView(state2, hs) {
  const s = deckSummary(state2);
  const header2 = head("Rule cards", null, hs.quit, "Close");
  const done = h("button", { class: "btn primary", title: "Enter", onclick: () => hs.quit() }, "Done");
  if (!s.total) {
    return h(
      "div",
      { class: "card rc-practice" },
      header2,
      h(
        "div",
        { class: "banner good" },
        h("p", { class: "stem", text: "Nothing to flip right now." }),
        h("p", { class: "small", text: "A rule shows up here when it is due for review." })
      ),
      done
    );
  }
  return h(
    "div",
    { class: "card rc-practice rc-pr-summary" },
    header2,
    h(
      "div",
      { class: `banner ${s.again ? "warn" : "good"}` },
      h("p", { class: "stem", text: `Done. You knew ${s.hard + s.good} of ${plural2(s.graded, "rule")}.` }),
      h("p", { class: "small", text: s.again ? "Rules you marked Again come back tomorrow. The rest wait longer." : "Each rule now waits longer before it comes back." })
    ),
    h(
      "div",
      { class: "row" },
      chip(`Again ${s.again}`, s.again ? "danger" : ""),
      chip(`Hard ${s.hard}`, s.hard ? "warn" : ""),
      chip(`Good ${s.good}`, s.good ? "good" : "")
    ),
    s.againRules.length ? h("div", null, h("h2", { text: "Back tomorrow" }), h("div", { class: "row" }, ...s.againRules.map((r) => chip(ruleLabel(r.ruleId, r.ruleName), "danger")))) : null,
    done
  );
}
function renderRedo(state2, actions, opts = {}) {
  const handlers = redoHandlers(state2, actions, opts.now ?? Date.now);
  const item = currentRedo(state2);
  const el = item ? redoQuestionView(state2, item, handlers, opts.renderText ?? plain2) : redoSummaryView(state2, handlers, opts.stats ?? null);
  return { el, handlers };
}
function redoQuestionView(state2, item, hs, t) {
  const e = item.entry;
  const total = state2.items.length;
  const picked = state2.picked;
  const first = e.picked !== "correct" && e.picked !== e.correct ? e.picked : null;
  const figure = "figure" in e && typeof e.figure === "string" && e.figure.trim() ? e.figure.trim() : null;
  const choices = h("ol", { class: "choices" }, ...choiceList2(e).map(({ letter, text: text2 }, i2) => {
    const cls = picked ? letter === e.correct ? "correct" : letter === picked ? "picked" : "" : "selectable";
    return h(
      "li",
      { class: `choice ${cls}`.trim(), title: picked ? null : `${letter} or ${i2 + 1}`, onclick: () => hs.pick(letter) },
      h("span", { class: "letter", text: `${letter}.` }),
      h("span", null, t(text2)),
      picked && letter === first ? h("span", { class: "tag danger", text: "first pick" }) : null
    );
  }));
  const kids = [
    head("Redo my misses", `${state2.index + 1} of ${total}`, hs.quit),
    bar2(state2.index, total),
    h(
      "div",
      { class: "row" },
      chip(ruleLabel(e.ruleId, e.ruleName), "accent"),
      e.skill ? chip(e.skill) : null,
      e.difficulty ? chip(e.difficulty) : null,
      chip(`missed ${shortDate(e.at)}`),
      item.history.length ? chip(`redone ${plural2(item.history.length, "time")} before`, "warn") : null
    ),
    e.passage ? h("div", { class: "passage" }, t(e.passage)) : null,
    e.passage && e.passage.length >= PASSAGE_CLIP && e.passage.endsWith("\u2026") ? h("p", { class: "small muted", text: "The saved passage is cut short." }) : null,
    figure ? h("div", { class: "passage" }, h("div", { class: "small muted", text: "The figure, in words" }), t(figure)) : null,
    h("p", { class: "stem" }, t(e.stem)),
    choices
  ];
  if (!picked) {
    kids.push(h(
      "div",
      { class: "row between" },
      h("p", { class: "small muted", text: "Pick the answer you would choose now." }),
      h("button", { class: "btn link small", title: "S", onclick: () => hs.skip() }, "Skip")
    ));
  } else {
    const right = picked === e.correct;
    const detail = right ? first ? `The first time you picked ${first}.` : null : picked === first ? `You picked ${picked} again, same as the first time.` : first ? `You picked ${picked}. The first time you picked ${first}.` : `You picked ${picked}.`;
    const left = total - state2.index - 1;
    kids.push(
      h(
        "div",
        { class: `banner ${right ? "good" : "danger"}`, role: "status" },
        h("p", { class: "stem", text: right ? `Right. The answer is ${e.correct}.` : `Not yet. The answer is ${e.correct}.` }),
        detail ? h("p", { class: "small", text: detail }) : null
      ),
      h(
        "div",
        { class: "rc-redo-why" },
        e.whyCorrect ? h("p", null, h("b", { text: `Why ${e.correct} is right: ` }), t(e.whyCorrect)) : null,
        e.whyPickFails ? h("p", null, h("b", { text: first ? `Why ${first} is wrong: ` : "Why your first pick is wrong: " }), t(e.whyPickFails)) : null,
        e.takeaway ? h("p", null, h("b", { text: "Takeaway: " }), t(e.takeaway)) : null
      ),
      h("button", { class: "btn primary", title: "Enter", onclick: () => hs.next() }, left > 0 ? `Next question (${left} left)` : "See how you did")
    );
  }
  return h("div", { class: "card rc-practice rc-redo" }, ...kids);
}
function redoSummaryView(state2, hs, stats) {
  const s = redoSummary(state2);
  const header2 = head("Redo my misses", null, hs.quit, "Close");
  const done = h("button", { class: "btn primary", title: "Enter", onclick: () => hs.quit() }, "Done");
  const allTime = stats && stats.redone ? h("p", { class: "small muted", text: `All time: ${plural2(stats.redone, "miss", "misses")} redone, ${Math.round((stats.accuracy ?? 0) * 100)}% of answers right, ${stats.fixed} fixed, ${stats.left} left.` }) : null;
  if (!s.total) {
    return h(
      "div",
      { class: "card rc-practice" },
      header2,
      h(
        "div",
        { class: "banner good" },
        h("p", { class: "stem", text: "No misses to redo." }),
        h("p", { class: "small", text: "Multiple-choice questions you miss show up here after you explain them." })
      ),
      allTime,
      done
    );
  }
  return h(
    "div",
    { class: "card rc-practice rc-pr-summary" },
    header2,
    h(
      "div",
      { class: `banner ${s.wrong ? "warn" : "good"}` },
      h("p", { class: "stem", text: s.answered ? `Done. ${s.right} of ${s.answered} right.` : "Done. You skipped them all." }),
      h("p", { class: "small", text: "Right answers leave your redo list. Wrong and skipped ones stay for next time." })
    ),
    h(
      "div",
      { class: "row" },
      chip(`Right ${s.right}`, s.right ? "good" : ""),
      chip(`Wrong ${s.wrong}`, s.wrong ? "danger" : ""),
      s.skipped ? chip(`Skipped ${s.skipped}`) : null
    ),
    s.missedAgain.length ? h("div", null, h("h2", { text: "Missed again" }), h("div", { class: "row" }, ...s.missedAgain.map((r) => chip(`${ruleLabel(r.ruleId, r.ruleName)}${r.count > 1 ? ` (${r.count})` : ""}`, "danger")))) : null,
    allTime,
    done
  );
}

// extension/src/addons/prefs.ts
var DEFAULT_PREFS = {
  timer: true,
  cropBeforeSend: false,
  pageCheck: true,
  hotkeys: true,
  reminders: false,
  reminderHour: 19,
  dailyGoal: 10,
  autoSpeak: false,
  textCapture: true,
  strategies: true,
  askConfidence: true,
  testDate: null,
  zoom: 1,
  seenBefore: true,
  pastePanel: true,
  practice: true,
  plan: true,
  badges: true,
  qbQuiz: true,
  skillMap: true,
  wordBank: true,
  activity: true
};
async function readPrefs() {
  return { ...DEFAULT_PREFS, ...await kv().get(KEYS.prefs) ?? {} };
}
async function writePrefs(p) {
  await kv().set(KEYS.prefs, p);
}

// extension/src/addons/progress.ts
var open4 = true;
var pct4 = (x) => x === null ? "\u2013" : `${Math.round(x * 100)}%`;
function tile(label, value, sub2, tone = "") {
  return h("div", { class: `rc-tile ${tone}`.trim() }, h("span", { class: "rc-tile-value", text: value }), h("span", { class: "rc-tile-label", text: label }), sub2 ? h("span", { class: "rc-tile-sub", text: sub2 }) : null);
}
function dailyChart(daily) {
  const W = 280, H = 64, gap = 3;
  const bw = (W - gap * (daily.length - 1)) / daily.length;
  const max = Math.max(1, ...daily.map((d) => d.attempts));
  const bars = [];
  daily.forEach((d, i2) => {
    const x = i2 * (bw + gap);
    const total = d.attempts / max * (H - 12);
    const miss = d.misses / max * (H - 12);
    const label = `${d.day}: ${d.attempts} question${d.attempts === 1 ? "" : "s"}, ${d.misses} missed`;
    bars.push(svg("rect", { x, y: H - 12 - total, width: bw, height: Math.max(total, d.attempts ? 1 : 0), rx: 2, class: "rc-bar-right" }, svg("title", {}, label)));
    if (miss) bars.push(svg("rect", { x, y: H - 12 - miss, width: bw, height: miss, rx: 2, class: "rc-bar-miss" }, svg("title", {}, label)));
    if (d.attempts === 0) bars.push(svg("rect", { x, y: H - 13, width: bw, height: 1, class: "rc-bar-empty" }));
  });
  const first = daily[0]?.day.slice(5) ?? "", last = daily[daily.length - 1]?.day.slice(5) ?? "";
  bars.push(svg("text", { x: 0, y: H - 1, class: "rc-axis" }, first), svg("text", { x: W, y: H - 1, "text-anchor": "end", class: "rc-axis" }, last === dayKey(Date.now()).slice(5) ? "today" : last));
  return svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "rc-chart", role: "img", "aria-label": "Questions per day, last 14 days" }, ...bars);
}
function diagnosisBar(s) {
  const parts = [
    { key: "rule_gap", label: "rule gap", n: s.missesByDiagnosis.rule_gap, cls: "danger" },
    { key: "careless", label: "careless", n: s.missesByDiagnosis.careless, cls: "warn" },
    { key: "misread", label: "misread", n: s.missesByDiagnosis.misread, cls: "accent" },
    { key: "unknown", label: "no reason given", n: s.missesByDiagnosis.unknown, cls: "" }
  ].filter((p) => p.n > 0);
  const total = parts.reduce((a, p) => a + p.n, 0);
  if (!total) return null;
  return h(
    "section",
    null,
    h("h2", { text: "Why you miss" }),
    h("div", { class: "rc-stack" }, ...parts.map((p) => h("span", { class: `rc-seg ${p.cls}`.trim(), style: `flex:${p.n}`, title: `${p.label}: ${p.n}` }))),
    h("div", { class: "row rc-wrap small" }, ...parts.map((p) => h("span", { class: "row" }, h("span", { class: `rc-dot ${p.cls}`.trim() }), `${p.label} ${Math.round(p.n / total * 100)}%`)))
  );
}
function groupList(title, items, onClick) {
  const shown = items.filter((g) => g.misses > 0).slice(0, 5);
  if (!shown.length) return null;
  return h(
    "section",
    null,
    h("h2", { text: title }),
    h("ul", { class: "rc-groups" }, ...shown.map((g) => {
      const inner2 = [
        h("span", { class: "rc-group-label", text: g.label }),
        h("span", { class: "rc-meter" }, h("span", { style: `width:${Math.round(g.missRate * 100)}%` })),
        h("span", { class: "small muted rc-group-n", text: `${g.misses}/${g.attempts}` })
      ];
      return h("li", null, onClick ? h("button", { class: "rc-group", onclick: () => onClick(g.key), title: "Open this rule in the web app" }, ...inner2) : h("div", { class: "rc-group" }, ...inner2));
    }))
  );
}
function calibrationTable(s) {
  const rows = ["sure", "unsure", "guess"].filter((k) => s.calibration[k].attempts > 0);
  if (!rows.length) return null;
  const label = { sure: "Felt sure", unsure: "Unsure", guess: "Guessed" };
  return h(
    "section",
    null,
    h("h2", { text: "Confidence vs. results" }),
    h("ul", { class: "rc-groups" }, ...rows.map((k) => {
      const c = s.calibration[k];
      return h("li", null, h(
        "div",
        { class: "rc-group" },
        h("span", { class: "rc-group-label", text: label[k] }),
        h("span", { class: "rc-meter good" }, h("span", { style: `width:${Math.round((c.accuracy ?? 0) * 100)}%` })),
        h("span", { class: "small muted rc-group-n", text: `${c.right}/${c.attempts}` })
      ));
    })),
    s.confidentlyWrong ? h("p", { class: "small muted", text: `${s.confidentlyWrong} miss${s.confidentlyWrong === 1 ? "" : "es"} you felt sure about. Those are the misconceptions to fix first.` }) : null
  );
}
function renderProgress(s, tips, dailyGoal, openWeb2, extras = {}) {
  const today = s.daily[s.daily.length - 1]?.attempts ?? 0;
  const goalPct = Math.min(1, today / Math.max(1, dailyGoal));
  const details = h("details", { class: "card rc-progress", open: open4 ? "" : null, ontoggle: (ev) => {
    open4 = ev.target.open;
  } });
  details.append(
    h("summary", null, h("h2", { text: "Progress" }), h("span", { class: "small muted", text: s.attempts ? `${s.attempts} questions \xB7 ${pct4(s.accuracy)} right` : "no questions yet" }))
  );
  if (!s.attempts) {
    details.append(h("p", { class: "muted small", text: tips[0]?.text ?? "" }));
    return details;
  }
  const cd = extras.countdown;
  if (cd) {
    details.append(h(
      "div",
      { class: "rc-countdown" },
      h("span", { class: "rc-countdown-days", text: String(cd.days) }),
      h(
        "span",
        null,
        h("span", { text: cd.days === 1 ? `day to your SAT (${cd.label})` : `days to your SAT (${cd.label})` }),
        h("span", { class: "small muted", text: cd.perDay ? ` At this week's pace (${cd.perDay}/day) that's about ${cd.projected} more questions.` : " Start a daily habit. Even 5 a day adds up." })
      )
    ));
  }
  details.append(
    h("div", { class: "rc-goal", title: `${today} of ${dailyGoal} today` }, h("span", { style: `width:${Math.round(goalPct * 100)}%` })),
    h(
      "div",
      { class: "rc-tiles" },
      tile("today", `${today}/${dailyGoal}`, goalPct >= 1 ? "goal met" : void 0, goalPct >= 1 ? "good" : ""),
      tile("accuracy", pct4(s.accuracy), s.thisWeek.attempts ? `${pct4(s.thisWeek.accuracy)} this week` : void 0),
      tile("streak", `${s.streakDays}d`, s.practicedToday ? void 0 : "practice today", s.streakDays >= 3 ? "good" : ""),
      tile("mastered", String(s.mastery.mastered), `${s.mastery.learning} learning`)
    ),
    dailyChart(s.daily)
  );
  if (tips.length) details.append(h("ul", { class: "rc-insights" }, ...tips.slice(0, 4).map((t) => h("li", { class: t.tone }, t.text))));
  const diag = diagnosisBar(s);
  if (diag) details.append(diag);
  const cal = calibrationTable(s);
  if (cal) details.append(cal);
  const rules = groupList("Most-missed rules", s.byRule, (key) => openWeb2(`/rules#${encodeURIComponent(key)}`));
  if (rules) details.append(rules);
  const skills = groupList("Weakest skills", s.bySkill);
  if (skills) details.append(skills);
  const diff = groupList("By difficulty", s.byDifficulty);
  if (diff) details.append(diff);
  if (s.pacing.timed) {
    details.append(h("p", { class: "small muted", text: `Pacing: avg ${s.pacing.avgSeconds}s over ${s.pacing.timed} timed questions \xB7 ${s.pacing.slow} over 71s` }));
  }
  if (s.drills.total) details.append(h("p", { class: "small muted", text: `Test me: ${s.drills.correct}/${s.drills.total} right (${pct4(s.drills.accuracy)})` }));
  if (extras.onShare) details.append(h("div", { class: "row" }, h("button", { class: "btn small", text: "Share progress image", onclick: extras.onShare })));
  return details;
}

// extension/src/addons/report.ts
var MAX_TIMED_SECONDS = 1800;
function startOfDay3(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function shiftDays2(ts, days) {
  const d = new Date(ts);
  d.setDate(d.getDate() + days);
  return d.getTime();
}
var ratio = (part, total) => total ? part / total : null;
var ruleLabel2 = (id, name) => name ? `${id} \xB7 ${name}` : id;
function weekNumbers(log, start, end) {
  const inWeek = log.filter((e) => e.at >= start && e.at < end);
  const right = inWeek.filter((e) => e.result === "right").length;
  const timed = inWeek.filter((e) => typeof e.seconds === "number" && e.seconds > 0 && e.seconds < MAX_TIMED_SECONDS);
  const drills = log.flatMap((e) => e.drills ?? []).filter((d) => d.at >= start && d.at < end);
  return {
    start,
    end,
    questions: inWeek.length,
    right,
    missed: inWeek.length - right,
    accuracy: ratio(right, inWeek.length),
    seconds: timed.reduce((sum, e) => sum + (e.seconds ?? 0), 0),
    timed: timed.length,
    daysPracticed: new Set(inWeek.map((e) => dayKey(e.at))).size,
    drills: drills.length,
    drillsCorrect: drills.filter((d) => d.correct).length
  };
}
function topMissed(entries, keyOf, labelOf, n) {
  const map = /* @__PURE__ */ new Map();
  for (const e of entries) {
    const key = keyOf(e);
    if (!key) continue;
    const g = map.get(key) ?? { key, label: labelOf(e), misses: 0, attempts: 0, lastAt: -Infinity };
    g.attempts++;
    if (e.result === "missed") g.misses++;
    if (e.at >= g.lastAt) {
      g.lastAt = e.at;
      g.label = labelOf(e);
    }
    map.set(key, g);
  }
  return [...map.values()].filter((g) => g.misses > 0).sort((a, b) => b.misses - a.misses || b.misses / b.attempts - a.misses / a.attempts || b.lastAt - a.lastAt).slice(0, n).map(({ key, label, misses, attempts }) => ({ key, label, misses, attempts }));
}
function streak2(log, now) {
  const days = new Set(log.map((e) => dayKey(e.at)));
  const today = startOfDay3(now);
  const practicedToday = days.has(dayKey(today));
  let cursor = practicedToday ? today : shiftDays2(today, -1);
  let streakDays = 0;
  while (days.has(dayKey(cursor))) {
    streakDays++;
    cursor = shiftDays2(cursor, -1);
  }
  return { streakDays, practicedToday };
}
function buildWeeklyReport(log, srs, now, opts = {}) {
  const today = startOfDay3(now);
  const end = shiftDays2(today, 1);
  const weekStart = shiftDays2(today, -6);
  const prevStart = shiftDays2(today, -13);
  const inWeek = log.filter((e) => e.at >= weekStart && e.at < end);
  const topN = opts.topN ?? 5;
  const right = log.filter((e) => e.result === "right").length;
  return {
    generatedAt: now,
    student: opts.student?.trim() || null,
    thisWeek: weekNumbers(log, weekStart, end),
    lastWeek: weekNumbers(log, prevStart, weekStart),
    ...streak2(log, now),
    topMissedRules: topMissed(inWeek, (e) => e.ruleId, (e) => ruleLabel2(e.ruleId, e.ruleName), topN),
    topMissedSkills: topMissed(inWeek, (e) => e.skill, (e) => e.skill ?? "", topN),
    mastered: Object.values(srs).filter((r) => r.box >= MASTERED_BOX).sort((a, b) => b.box - a.box || a.ruleId.localeCompare(b.ruleId, void 0, { numeric: true })).map((r) => ({ ruleId: r.ruleId, label: ruleLabel2(r.ruleId, r.ruleName) })),
    mastery: masteryCounts(srs),
    dueRules: dueRules(srs, now).length,
    notes: inWeek.filter((e) => e.starred).sort((a, b) => b.at - a.at).slice(0, opts.maxNotes ?? 10).map((e) => ({ at: e.at, ruleId: e.ruleId, label: ruleLabel2(e.ruleId, e.ruleName), note: (e.note ?? "").trim(), takeaway: e.takeaway, result: e.result })),
    allTime: { questions: log.length, accuracy: ratio(right, log.length) }
  };
}
var plural3 = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
function pct5(x) {
  return x === null ? "n/a" : `${Math.round(x * 100)}%`;
}
function formatDuration(seconds) {
  if (!(seconds > 0)) return "0 min";
  if (seconds < 60) return "under 1 min";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
var shortDate2 = (ts, withYear = false) => new Date(ts).toLocaleDateString("en-US", withYear ? { month: "short", day: "numeric", year: "numeric" } : { month: "short", day: "numeric" });
function rangeLabel(start, end) {
  const last = end - 1;
  const sameYear = new Date(start).getFullYear() === new Date(last).getFullYear();
  return `${shortDate2(start, !sameYear)} to ${shortDate2(last, true)}`;
}
function reportTitle(r) {
  return `Rulecard weekly report${r.student ? ` for ${r.student}` : ""}`;
}
function reportHeadline(r) {
  const t = r.thisWeek;
  const l = r.lastWeek;
  if (!t.questions) {
    const before = l.questions ? ` (${plural3(l.questions, "question")} last week)` : "";
    return r.student ? `${r.student} didn't practice this week${before}.` : `No practice this week${before}.`;
  }
  const change = !l.questions ? ", with none last week" : t.questions > l.questions ? `, up from ${l.questions} last week` : t.questions < l.questions ? `, down from ${l.questions} last week` : ", the same as last week";
  return r.student ? `${r.student} answered ${plural3(t.questions, "question")} this week${change}, and got ${pct5(t.accuracy)} right.` : `${plural3(t.questions, "question")} this week${change}, with ${pct5(t.accuracy)} right.`;
}
function timeValue(w) {
  if (!w.timed) return "not timed (the pacing timer was off)";
  const partial = w.timed < w.questions ? ` (timed on ${w.timed} of ${w.questions} questions)` : "";
  return `${formatDuration(w.seconds)}${partial}`;
}
function weekRows(r) {
  const t = r.thisWeek;
  const l = r.lastWeek;
  return [
    ["Questions", `${t.questions} (last week: ${l.questions})`],
    ["Accuracy", `${pct5(t.accuracy)} (last week: ${pct5(l.accuracy)})`],
    ["Time practiced", timeValue(t)],
    ["Days practiced", `${t.daysPracticed} of 7`],
    ["Streak", r.streakDays ? `${plural3(r.streakDays, "day")} in a row` : "none right now"],
    ["Review drills", t.drills ? `${t.drills} (${t.drillsCorrect} right)` : "none"]
  ];
}
var missLine = (g) => `${g.label}: missed ${g.misses} of ${g.attempts}`;
var reviewLine = (r) => `Rule review: ${r.mastery.learning} learning, ${r.mastery.reviewing} reviewing, ${r.mastery.mastered} mastered, ${r.dueRules} due now.`;
var footer = (r) => `Made with Rulecard on ${shortDate2(r.generatedAt, true)} from the practice log on this device. All time: ${plural3(r.allTime.questions, "question")}, ${pct5(r.allTime.accuracy)} right.`;
function toReportText(r) {
  const out = [reportTitle(r), rangeLabel(r.thisWeek.start, r.thisWeek.end), "", reportHeadline(r), "", "This week"];
  for (const [label, value] of weekRows(r)) out.push(`- ${label}: ${value}`);
  out.push("", "Missed most this week");
  if (!r.topMissedRules.length && !r.topMissedSkills.length) out.push("- No misses this week.");
  else {
    out.push("Rules:", ...r.topMissedRules.map((g) => `- ${missLine(g)}`));
    out.push("Skills:", ...r.topMissedSkills.length ? r.topMissedSkills.map((g) => `- ${missLine(g)}`) : ["- No skill recorded."]);
  }
  out.push("", `Rules mastered (${r.mastered.length})`, ...r.mastered.length ? r.mastered.map((m) => `- ${m.label}`) : ["- None yet."], reviewLine(r));
  out.push("", "Starred notes");
  if (!r.notes.length) out.push("- No starred questions this week.");
  for (const n of r.notes) out.push(`- ${shortDate2(n.at)}, ${n.label}: ${n.note || `Takeaway: ${n.takeaway}`}`);
  out.push("", footer(r));
  return out.join("\n");
}
function escapeHtml2(s) {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
var esc2 = escapeHtml2;
var STYLE = `
  body{font:13px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#16161a}
  h1{font-size:20px;margin:0 0 4px} .meta{color:#6b6b70;margin:0 0 20px} .lead{font-size:15px;margin:0 0 16px}
  section{border:1px solid #e4e4e0;border-radius:10px;padding:12px 14px;margin:0 0 12px;break-inside:avoid}
  h2{font-size:14px;margin:0 0 6px;color:#2f5bea} h3{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b6b70;margin:10px 0 4px}
  ul{padding-left:18px;margin:0} li{margin:2px 0} .small{font-size:12px;color:#3f3f46;margin:8px 0 0}
  .tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:4px 0 0}
  .tile{border:1px solid #e4e4e0;border-radius:8px;padding:8px 10px} .tile b{display:block;font-size:18px} .tile span{display:block;color:#6b6b70;font-size:11px}
  .miss{color:#b45309} .note{color:#b45309} .rule{font-weight:600}
  .hint{background:#e8eefc;color:#2f5bea;border-radius:8px;padding:8px 12px;margin:0 0 16px}
  @media print{body{margin:0} section,.tile{border-color:#bbb} .hint{display:none}}
`;
var list = (items, empty) => items.length ? `<ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul>` : `<p class="small">${esc2(empty)}</p>`;
function toReportHtml(r) {
  const t = r.thisWeek;
  const l = r.lastWeek;
  const tile2 = (label, value, sub2) => `<div class="tile"><span>${esc2(label)}</span><b>${esc2(value)}</b><span>${esc2(sub2)}</span></div>`;
  const tiles = [
    tile2("Questions", String(t.questions), `last week: ${l.questions}`),
    tile2("Accuracy", pct5(t.accuracy), `last week: ${pct5(l.accuracy)}`),
    tile2("Time practiced", t.timed ? formatDuration(t.seconds) : "not timed", `${t.daysPracticed} of 7 days`),
    tile2("Streak", plural3(r.streakDays, "day"), r.practicedToday ? "practiced today" : "not yet today")
  ].join("");
  const details = weekRows(r).slice(2).map(([label, value]) => `${label}: ${value}`).join(" \xB7 ");
  const missItem3 = (g) => `<span class="rule">${esc2(g.label)}</span>: <span class="miss">missed ${g.misses} of ${g.attempts}</span>`;
  const misses = r.topMissedRules.length || r.topMissedSkills.length ? `<h3>Rules</h3>${list(r.topMissedRules.map(missItem3), "None.")}<h3>Skills</h3>${list(r.topMissedSkills.map(missItem3), "No skill recorded.")}` : `<p class="small">No misses this week.</p>`;
  const notes = list(
    r.notes.map((n) => `<span class="rule">${esc2(shortDate2(n.at))}, ${esc2(n.label)}</span>: ${n.note ? `<span class="note">${esc2(n.note)}</span>` : `Takeaway: ${esc2(n.takeaway)}`}`),
    "No starred questions this week."
  );
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc2(reportTitle(r))}</title>
<style>${STYLE}</style></head><body>
<p class="hint">To save as PDF: press \u2318P (Mac) or Ctrl+P, then choose "Save as PDF".</p>
<h1>${esc2(reportTitle(r))}</h1><p class="meta">${esc2(rangeLabel(t.start, t.end))}</p>
<p class="lead">${esc2(reportHeadline(r))}</p>
<section><h2>This week</h2><div class="tiles">${tiles}</div><p class="small">${esc2(details)}</p></section>
<section><h2>Missed most this week</h2>${misses}</section>
<section><h2>Rules mastered (${r.mastered.length})</h2>${list(r.mastered.map((m) => esc2(m.label)), "None yet.")}<p class="small">${esc2(reviewLine(r))}</p></section>
<section><h2>Starred notes</h2>${notes}</section>
<p class="meta">${esc2(footer(r))}</p>
</body></html>`;
}
function renderReportTools(getReport, act = {}) {
  const open5 = act.open ?? openPrintable;
  const copy = act.copy ?? ((text2) => navigator.clipboard.writeText(text2));
  return h(
    "div",
    { class: "row rc-wrap rc-report-tools" },
    h("button", {
      class: "btn small",
      text: "Weekly report",
      title: "A printable summary of this week for a parent or tutor",
      onclick: () => open5(toReportHtml(getReport()))
    }),
    h("button", {
      class: "btn small",
      text: "Copy report as text",
      onclick: async () => {
        try {
          await copy(toReportText(getReport()));
          act.notify?.("Report copied. Paste it into an email or a message.");
        } catch {
          act.notify?.("Couldn't copy the report. Open the weekly report and copy it from there.");
        }
      }
    })
  );
}

// extension/src/addons/seen.ts
var SEEN_THRESHOLD = 0.85;
var STEM_MAX2 = 500;
var PASSAGE_MAX2 = 1200;
var DAY_MS = 864e5;
var clip3 = (s, n) => s ? s.length > n ? `${s.slice(0, n - 1)}\u2026` : s : "";
var normId = (id) => (id ?? "").trim().toLowerCase();
var numbersIn = (s) => (s.match(/\d+(?:[.,]\d+)*/g) ?? []).sort().join(" ");
function questionText(q) {
  const choices = LETTERS2.map((l) => q.choices?.[l] ?? "");
  return [clip3(q.passage, PASSAGE_MAX2), clip3(q.stem, STEM_MAX2), ...choices].filter(Boolean).join("\n");
}
function toPast(e, matchedBy, score) {
  return {
    attemptId: e.attemptId,
    at: e.at,
    result: e.result,
    picked: e.picked,
    correct: e.correct,
    ruleId: e.ruleId,
    ruleName: e.ruleName,
    ruleStatement: e.ruleStatement,
    whyCorrect: e.whyCorrect,
    takeaway: e.takeaway,
    matchedBy,
    score
  };
}
function findPrevious(log, question, opts = {}) {
  const skip = new Set(opts.excludeAttemptIds?.filter((x) => Boolean(x)) ?? []);
  const pool = log.filter((e) => !skip.has(e.attemptId) && (opts.before === void 0 || e.at < opts.before));
  const newestFirst2 = (a, b) => b.at - a.at;
  const id = normId(question.qbId);
  if (id) {
    const byId = pool.filter((e) => normId(e.qbId) === id).map((e) => toPast(e, "qbId", 1));
    if (byId.length) return byId.sort(newestFirst2);
  }
  const text2 = questionText(question);
  if (!text2) return [];
  const numbers = numbersIn(text2);
  const threshold = opts.threshold ?? SEEN_THRESHOLD;
  const out = [];
  for (const e of pool) {
    if (id && normId(e.qbId)) continue;
    const other = questionText(e);
    if (!other || numbersIn(other) !== numbers) continue;
    const score = similarity(text2, other);
    if (score >= threshold) out.push(toPast(e, "text", score));
  }
  return out.sort(newestFirst2);
}
function startOfDay4(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function dayLabel(at, now) {
  const days = Math.round((startOfDay4(now) - startOfDay4(at)) / DAY_MS);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  const sameYear = new Date(at).getFullYear() === new Date(now).getFullYear();
  return new Date(at).toLocaleDateString("en-US", sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}
function whenPhrase(at, now) {
  const label = dayLabel(at, now);
  return label === "Today" || label === "Yesterday" ? label.toLowerCase() : `on ${label}`;
}
function pickedPhrase(p) {
  return p.picked === "correct" ? "got it right" : `picked ${p.picked} (${p.result})`;
}
function ruleLine(p) {
  const name = p.ruleName?.trim().replace(/[.\s]+$/, "");
  return `Rule: ${p.ruleId}${name ? ` ${name}` : ""}.`;
}
function seenSentence(prev, now) {
  const last = prev[0];
  if (!last) return "";
  const lead = last.matchedBy === "text" ? "Looks like you did this question" : "You did this question";
  if (prev.length === 1) return `${lead} ${whenPhrase(last.at, now)} and ${pickedPhrase(last)}.`;
  return `${lead} ${prev.length} times before. Last time was ${whenPhrase(last.at, now).replace(/^on /, "")}: you ${pickedPhrase(last)}.`;
}
function renderSeenBanner(prev, opts) {
  const last = prev[0];
  if (!last) return null;
  const now = opts.now ?? Date.now();
  return h(
    "div",
    { class: `banner ${last.result === "missed" ? "warn" : "good"} rc-seen`, role: "note" },
    h(
      "p",
      { class: "rc-seen-text" },
      h("span", { text: `${seenSentence(prev, now)} ` }),
      h("span", { class: "rc-seen-rule", text: ruleLine(last) })
    ),
    h("button", {
      class: "btn link small rc-seen-toggle",
      text: opts.open ? "Hide my old card" : "Show my old card",
      "aria-expanded": opts.open ? "true" : "false",
      onclick: opts.onToggle
    }),
    opts.open ? renderOldCard(prev, now) : null
  );
}
function renderOldCard(prev, now) {
  const last = prev[0];
  return h(
    "div",
    { class: "rc-seen-card" },
    h("p", { class: "rule-statement", text: last.ruleStatement }),
    last.whyCorrect ? h("h4", { class: "rc-seen-label", text: `Why ${last.correct} is right` }) : null,
    last.whyCorrect ? h("p", { class: "small", text: last.whyCorrect }) : null,
    last.takeaway ? h("h4", { class: "rc-seen-label", text: "Takeaway" }) : null,
    last.takeaway ? h("p", { class: "small", text: last.takeaway }) : null,
    prev.length > 1 ? h(
      "ul",
      { class: "rc-seen-history small muted" },
      ...prev.map((p) => h("li", { text: `${dayLabel(p.at, now)}: ${pickedPhrase(p)}, rule ${p.ruleId}` }))
    ) : null
  );
}
function createSeenCheck(rerender) {
  let openFor = null;
  let cache = null;
  function find(log, q, opts = {}) {
    const key = [q.id, q.qbId ?? "", log.length, log[0]?.attemptId ?? "", opts.before ?? "", ...opts.excludeAttemptIds ?? []].join("|");
    if (cache?.key !== key) cache = { key, prev: findPrevious(log, q, opts) };
    return cache.prev;
  }
  return {
    find,
    render(log, q, opts = {}, now = Date.now()) {
      const prev = find(log, q, opts);
      if (!prev.length) return null;
      return renderSeenBanner(prev, {
        open: openFor === q.id,
        onToggle: () => {
          openFor = openFor === q.id ? null : q.id;
          rerender();
        },
        now
      });
    }
  };
}

// extension/src/addons/skillmap.ts
var MAX_SECONDS2 = 1800;
var MIN_TIMED = 3;
var ORDER = new Map(SKILLS.map((s, i2) => [s.skill, i2]));
var rank = (c) => ORDER.get(c.skill) ?? Number.MAX_SAFE_INTEGER;
var plural4 = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
var pct6 = (accuracy) => `${Math.round((accuracy ?? 0) * 100)}%`;
var SHORT = {
  "Central Ideas and Details": "Central ideas",
  "Command of Evidence": "Evidence",
  Inferences: "Inferences",
  "Words in Context": "Words in context",
  "Text Structure and Purpose": "Structure and purpose",
  "Cross-Text Connections": "Cross-text",
  "Rhetorical Synthesis": "Synthesis",
  Transitions: "Transitions",
  Boundaries: "Boundaries",
  "Form, Structure, and Sense": "Form and sense",
  "Linear equations in one variable": "Linear eq., 1 variable",
  "Linear functions": "Linear functions",
  "Linear equations in two variables": "Linear eq., 2 variables",
  "Systems of two linear equations in two variables": "Linear systems",
  "Linear inequalities in one or two variables": "Linear inequalities",
  "Nonlinear functions": "Nonlinear functions",
  "Nonlinear equations in one variable and systems of equations in two variables": "Nonlinear equations",
  "Equivalent expressions": "Equivalent expressions",
  "Ratios, rates, proportional relationships, and units": "Ratios and rates",
  Percentages: "Percentages",
  "One-variable data: Distributions and measures of center and spread": "One-variable data",
  "Two-variable data: Models and scatterplots": "Two-variable data",
  "Probability and conditional probability": "Probability",
  "Inference from sample statistics and margin of error": "Margin of error",
  "Evaluating statistical claims: Observational studies and experiments": "Statistical claims",
  "Area and volume": "Area and volume",
  "Lines, angles, and triangles": "Lines and angles",
  "Right triangles and trigonometry": "Right triangles, trig",
  Circles: "Circles"
};
function shortSkillName(skill) {
  return SHORT[skill] ?? skill.split(":")[0].trim();
}
function levelFor(attempts, accuracy) {
  if (attempts <= 0 || accuracy === null) return "none";
  if (attempts < 3) return "new";
  if (accuracy < 0.5) return "weak";
  if (accuracy < 0.75) return "shaky";
  if (accuracy < 0.9) return "solid";
  return "strong";
}
function defaultSections(log) {
  const present = new Set(log.map((e) => sectionOf(e)));
  return present.size ? [...present] : ["rw"];
}
function cellFor(info, entries) {
  const attempts = entries.length;
  const right = entries.filter((e) => e.result === "right").length;
  const accuracy = attempts ? right / attempts : null;
  const times = entries.map((e) => e.seconds).filter((s) => typeof s === "number" && Number.isFinite(s) && s > 0 && s < MAX_SECONDS2);
  const avgSeconds = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
  const targetSeconds = info.section === "math" ? MATH_TARGET_SECONDS : TARGET_SECONDS;
  return {
    skill: info.skill,
    domain: info.domain,
    section: info.section,
    attempts,
    right,
    accuracy,
    avgSeconds,
    targetSeconds,
    slow: avgSeconds !== null && times.length >= MIN_TIMED && avgSeconds > targetSeconds,
    lastAt: attempts ? entries.reduce((m, e) => Math.max(m, e.at), -Infinity) : null,
    level: levelFor(attempts, accuracy)
  };
}
function skillMap(log, opts = {}) {
  const wanted = new Set(opts.sections?.length ? opts.sections : defaultSections(log));
  const bySkill = /* @__PURE__ */ new Map();
  for (const e of log) {
    const info = skillInfo(e.skill);
    if (!info) continue;
    const list2 = bySkill.get(info.skill);
    if (list2) list2.push(e);
    else bySkill.set(info.skill, [e]);
  }
  return SKILLS.filter((s) => wanted.has(s.section)).map((s) => cellFor(s, bySkill.get(s.skill) ?? []));
}
function groupByDomain(cells) {
  const groups = [];
  for (const c of [...cells].sort((a, b) => rank(a) - rank(b))) {
    let g = groups.find((x) => x.section === c.section && x.domain === c.domain);
    if (!g) {
      g = { section: c.section, domain: c.domain, cells: [] };
      groups.push(g);
    }
    g.cells.push(c);
  }
  return groups;
}
function suggestedDifficulty(cell) {
  if (cell.level === "weak") return "Easy, Medium";
  if (cell.level === "strong") return "Hard";
  return "Medium";
}
function skillDetail(cell) {
  const parts = [];
  if (!cell.attempts) parts.push("You have no cards for this skill yet.");
  else {
    parts.push(`Right on ${cell.right} of ${cell.attempts}.`);
    if (cell.level === "new") parts.push("A few more cards will show your level.");
  }
  if (cell.avgSeconds !== null) {
    if (cell.slow) parts.push(`Average ${cell.avgSeconds} s, slower than the ${cell.targetSeconds} s test pace.`);
    else if (cell.avgSeconds > cell.targetSeconds) parts.push(`Average ${cell.avgSeconds} s so far. Time a few more to judge your pace.`);
    else parts.push(`Average ${cell.avgSeconds} s, within the ${cell.targetSeconds} s test pace.`);
  }
  parts.push(qbFilterSteps(cell, suggestedDifficulty(cell)));
  return parts.join(" ");
}
function tileValue(c) {
  if (c.level === "none") return "not yet";
  if (c.level === "new") return "new";
  return pct6(c.accuracy);
}
function tileTitle(c) {
  if (!c.attempts) return `${c.skill}: no cards yet`;
  const time = c.avgSeconds === null ? "" : `, average ${c.avgSeconds} s${c.slow ? `, slower than the ${c.targetSeconds} s pace` : ""}`;
  return `${c.skill}: right on ${c.right} of ${c.attempts} (${pct6(c.accuracy)})${time}`;
}
var mapOpen = false;
var selectedSkill = null;
var LEGEND = [
  ["none", "Not yet"],
  ["new", "New"],
  ["weak", "Under 50%"],
  ["shaky", "50%+"],
  ["solid", "75%+"],
  ["strong", "90%+"]
];
function renderSkillMap(cells, handlers = {}) {
  const practiced = cells.filter((c) => c.attempts > 0).length;
  const tiles = [];
  const detail = h("div", { class: "rc-sk-detail small", "aria-live": "polite" });
  const paint = () => {
    const cell = cells.find((c) => c.skill === selectedSkill) ?? null;
    for (const t of tiles) {
      const on = cell !== null && t.dataset.skill === cell.skill;
      t.classList.toggle("rc-sk-selected", on);
      t.setAttribute("aria-pressed", on ? "true" : "false");
    }
    if (cell) detail.replaceChildren(h("b", { text: cell.skill }), " ", skillDetail(cell));
    else detail.replaceChildren(h("span", { class: "muted", text: "Pick a skill to see your numbers and how to practice it." }));
  };
  const tile2 = (c) => {
    const label = tileTitle(c);
    const b = h(
      "button",
      {
        type: "button",
        class: `rc-sk-tile rc-sk-${c.level}`,
        title: label,
        "aria-label": label,
        "data-skill": c.skill,
        onclick: () => {
          selectedSkill = selectedSkill === c.skill ? null : c.skill;
          paint();
          if (selectedSkill) handlers.onSelect?.(c.skill);
        }
      },
      h("span", { class: "rc-sk-name", text: shortSkillName(c.skill) }),
      h("span", { class: "rc-sk-value", text: tileValue(c) }),
      c.attempts ? h("span", { class: "rc-sk-count", text: plural4(c.attempts, "card") }) : null,
      c.slow ? h("span", { class: "rc-sk-slow", text: "slow" }) : null
    );
    tiles.push(b);
    return b;
  };
  const body = [];
  let section = null;
  for (const g of groupByDomain(cells)) {
    if (g.section !== section) {
      section = g.section;
      const inSection = cells.filter((c) => c.section === g.section);
      body.push(h(
        "div",
        { class: "rc-sk-section row between" },
        h("h3", { text: SECTION_LABEL[g.section] }),
        h("span", { class: "small muted", text: `${inSection.filter((c) => c.attempts > 0).length} of ${inSection.length} practiced` })
      ));
    }
    body.push(h(
      "div",
      { class: "rc-sk-domain" },
      h("div", { class: "rc-sk-domain-name small muted", text: g.domain }),
      h("div", { class: "rc-sk-tiles" }, ...g.cells.map(tile2))
    ));
  }
  const card = h(
    "details",
    {
      class: "card rc-sk-card",
      open: mapOpen ? "" : null,
      ontoggle: (ev) => {
        mapOpen = ev.target.open;
      }
    },
    h("summary", null, h("h2", { text: "Skill map" }), h("span", { class: "small muted", text: `${practiced} of ${cells.length} practiced` })),
    h(
      "div",
      { class: "rc-sk-legend small muted" },
      ...LEGEND.map(([level, text2]) => h("span", { class: `rc-sk-key rc-sk-${level}`, text: text2 })),
      h("span", { class: "rc-sk-key-slow", text: "slow: over test pace" })
    ),
    practiced ? null : h("p", { class: "small muted", text: "Explain a few questions and your skills fill in here." }),
    ...body,
    cells.length ? detail : null
  );
  paint();
  return card;
}

// extension/src/addons/sets.ts
var emptySets = () => ({ active: null, recap: null });
function startSet(target, now) {
  return { active: { target: Math.max(1, Math.min(100, Math.round(target))), startedAt: now, attemptIds: [] }, recap: null };
}
function buildRecap(entries, attemptIds, startedAt, endedAt) {
  const ids = new Set(attemptIds);
  const mine = entries.filter((e) => ids.has(e.attemptId));
  const right = mine.filter((e) => e.result === "right").length;
  const timed = mine.filter((e) => typeof e.seconds === "number" && (e.seconds ?? 0) > 0);
  const missed = /* @__PURE__ */ new Map();
  for (const e of mine) {
    if (e.result !== "missed") continue;
    const m = missed.get(e.ruleId) ?? { ruleId: e.ruleId, ruleName: e.ruleName, misses: 0 };
    m.misses++;
    missed.set(e.ruleId, m);
  }
  return {
    count: mine.length,
    right,
    accuracy: mine.length ? right / mine.length : 0,
    avgSeconds: timed.length ? Math.round(timed.reduce((a, e) => a + (e.seconds ?? 0), 0) / timed.length) : null,
    slow: timed.filter((e) => (e.seconds ?? 0) > targetSecondsFor(e)).length,
    minutes: Math.max(1, Math.round((endedAt - startedAt) / 6e4)),
    missedRules: [...missed.values()].sort((a, b) => b.misses - a.misses),
    attemptIds: mine.map((e) => e.attemptId),
    startedAt,
    endedAt
  };
}
function addToSet(state2, attemptId, entries, now) {
  const a = state2.active;
  if (!a || a.attemptIds.includes(attemptId)) return state2;
  const attemptIds = [...a.attemptIds, attemptId];
  if (attemptIds.length >= a.target) return { active: null, recap: buildRecap(entries, attemptIds, a.startedAt, now) };
  return { ...state2, active: { ...a, attemptIds } };
}
function endSet(state2, entries, now) {
  const a = state2.active;
  if (!a) return state2;
  return { active: null, recap: a.attemptIds.length ? buildRecap(entries, a.attemptIds, a.startedAt, now) : null };
}
async function readSets() {
  return await kv().get(KEYS.sets) ?? emptySets();
}
async function writeSets(s) {
  await kv().set(KEYS.sets, s);
}

// extension/src/addons/share.ts
function shareLines(s, cd) {
  const lines = [
    { big: `${s.streakDays}`, small: s.streakDays === 1 ? "day streak" : "day streak" },
    { big: `${s.thisWeek.attempts}`, small: "questions this week" },
    { big: s.accuracy === null ? "\u2013" : `${Math.round(s.accuracy * 100)}%`, small: "accuracy overall" },
    { big: `${s.mastery.mastered}`, small: s.mastery.mastered === 1 ? "rule mastered" : "rules mastered" }
  ];
  if (cd) lines.push({ big: `${cd.days}`, small: `days to my SAT (${cd.label})` });
  return lines;
}
async function renderShareImage(s, cd) {
  const W = 1080, H = 1350;
  const canvas = new OffscreenCanvas(W, H);
  const g = canvas.getContext("2d");
  if (!g) throw new Error("Canvas not available");
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#1e3a8a");
  grad.addColorStop(1, "#2f5bea");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.fillStyle = "rgba(255,255,255,0.06)";
  for (const [x, y2, r] of [[900, 180, 260], [120, 1180, 320], [980, 1100, 140]]) {
    g.beginPath();
    g.arc(x, y2, r, 0, Math.PI * 2);
    g.fill();
  }
  const sans = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  g.fillStyle = "#ffffff";
  g.font = `700 64px ${sans}`;
  g.fillText("My SAT Reading & Writing", 80, 170);
  g.font = `500 40px ${sans}`;
  g.fillStyle = "rgba(255,255,255,0.8)";
  g.fillText("practice, one rule at a time", 80, 230);
  const lines = shareLines(s, cd);
  let y = 380;
  for (const line of lines) {
    g.fillStyle = "rgba(255,255,255,0.12)";
    const h3 = 150;
    roundRect(g, 80, y, W - 160, h3, 28);
    g.fill();
    g.fillStyle = "#ffffff";
    g.font = `800 92px ${sans}`;
    g.fillText(line.big, 120, y + 108);
    const bigW = g.measureText(line.big).width;
    g.font = `500 40px ${sans}`;
    g.fillStyle = "rgba(255,255,255,0.88)";
    g.fillText(line.small, 120 + bigW + 32, y + 100);
    y += h3 + 26;
  }
  g.font = `600 36px ${sans}`;
  g.fillStyle = "rgba(255,255,255,0.9)";
  g.fillText("Rulecard \xB7 rulecard.vercel.app", 80, H - 80);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
function roundRect(g, x, y, w, h3, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h3, r);
  g.arcTo(x + w, y + h3, x, y + h3, r);
  g.arcTo(x, y + h3, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function downloadDataUrl(filename, dataUrl) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
}

// extension/src/addons/strategies.ts
var STRATEGIES = [
  {
    skill: "Words in Context",
    steps: [
      "Cover the choices. Read the whole text and find the clue that defines the blank (a contrast, a restatement, an example).",
      "Put your own simple word in the blank before you look.",
      "Pick the choice that matches your word in meaning and in tone (positive, negative, neutral)."
    ],
    traps: ["A word that fits the topic but not the exact meaning", "A secondary meaning of a familiar word", "A word that's right but too strong or too weak"]
  },
  {
    skill: "Text Structure and Purpose",
    steps: [
      "Label what each sentence does: claim, background, example, contrast, conclusion.",
      "For main purpose, sum up the whole text in five words. For an underlined sentence, say how it connects to the sentences around it.",
      "Match the verb in the choice (describe, argue, challenge, illustrate) to what the text actually does."
    ],
    traps: ["True of one detail but not the whole text", `A verb that's too strong ("refute" when the text only describes)`]
  },
  {
    skill: "Cross-Text Connections",
    steps: [
      "Write each text's main claim in one line.",
      "Find the exact point in Text 1 that Text 2 is talking about.",
      "Predict Text 2's reaction to that point (agree, add a limit, or reject) before you read the choices."
    ],
    traps: ["A reaction to something Text 2 never mentions", "Calling a qualification a total disagreement"]
  },
  {
    skill: "Central Ideas and Details",
    steps: [
      "For the main idea, ask what most of the text is about, not just the first or last line.",
      "For a detail, go back and find the line. Don't answer from memory.",
      "Every word of the right choice has to be backed by the text."
    ],
    traps: ["Too broad or too narrow", "Sounds true in real life but the text doesn't say it"]
  },
  {
    skill: "Command of Evidence",
    steps: [
      "Underline the exact claim you need to support or weaken, every part of it.",
      "For quotes or findings, the right one proves that specific claim, not just the topic.",
      "For graphs and tables, read the title, axes and units first, then find the data point that makes the claim's comparison."
    ],
    traps: ["Accurate data that doesn't address the claim", "Supports half the claim", "Reading the wrong row, year or unit"]
  },
  {
    skill: "Inferences",
    steps: [
      "Follow the logic step by step: premise, then premise, then what has to follow.",
      "The blank is the next logical step. Say it in your own words first.",
      "Choose what must be true based on the text, not what might be true."
    ],
    traps: ["Plausible but needs outside knowledge", "Extreme words like always, never, or proves"]
  },
  {
    skill: "Boundaries",
    steps: [
      "Check each side of the blank: is it an independent clause (could stand alone) or not?",
      "Two independent clauses: period, semicolon, or comma + FANBOYS. A colon or dash only after a complete clause.",
      "Nothing goes between a subject and its verb, or a verb and its object. Extra info gets a matching pair: two commas, two dashes, or two parentheses."
    ],
    traps: ["Comma splice", "Colon after an incomplete clause", "Half a pair (one dash, one comma)"]
  },
  {
    skill: "Form, Structure, and Sense",
    steps: [
      'Find the real subject: skip prepositional phrases and "which/who" interrupters, then match the verb to it.',
      "Match the tense to the verbs around the blank and to the time the text describes.",
      "Pronouns agree in number with what they replace. Watch its/it's, their/they're, and plural vs possessive. A modifier sits right next to the thing it describes."
    ],
    traps: ["Agreeing with the nearest noun instead of the subject", "Switching tense for no reason", "A dangling modifier"]
  },
  {
    skill: "Transitions",
    steps: [
      "Cover the choices. Read the sentence before the blank and the one after it.",
      "Name the relationship: contrast, cause and effect, more of the same, example, or time order.",
      "Choose the transition in that category."
    ],
    traps: ["If two choices mean the same thing, neither is right", 'Choosing "however" just because the topic shifts slightly']
  },
  {
    skill: "Rhetorical Synthesis",
    steps: [
      'Read the goal in the question first ("emphasize a difference", "introduce the study to a new audience").',
      "Ignore the notes at first. Every choice is accurate to them, so accuracy isn't the test.",
      "Pick the choice that does exactly the stated goal, and all of it."
    ],
    traps: ["Accurate but doesn't meet the goal", "Meets half the goal (for example, names one item when it should compare two)"]
  }
];
var norm3 = (s) => s.toLowerCase().replace(/[^a-z]/g, "");
function strategyFor(skill) {
  if (!skill) return null;
  const k = norm3(skill);
  return STRATEGIES.find((s) => norm3(s.skill) === k) ?? STRATEGIES.find((s) => k.includes(norm3(s.skill)) || norm3(s.skill).includes(k)) ?? null;
}

// extension/src/addons/traps.ts
var SEC = ["Standard English Conventions"];
var TRAPS = [
  {
    id: "extreme",
    label: "Too extreme",
    section: "rw",
    tip: "Words like always, never, proves and only need the text to back them all the way. If the text hedges, the answer should too.",
    rules: [{ re: /\btoo (strong|extreme|absolute|sweeping|broad|definitive|far)\b/, w: 1.5 }, { re: /\b(overstat\w*|exaggerat\w*|goes too far|extreme)\b/, w: 1 }, { re: /\b(always|never|proves?|certainly|completely|entirely)\b/, w: 0.5 }]
  },
  {
    id: "unsupported",
    label: "Not supported by the text",
    section: "rw",
    tip: "Before you pick, point to the words in the text that prove it. If you can't, it's out.",
    rules: [{ re: /\bnot (supported|stated|mentioned|discussed|addressed|indicated)\b/, w: 1.5 }, { re: /\b(no evidence|unsupported|out of scope|outside (knowledge|the text)|beyond (what|the text)|never (says|mentions|states|discusses))\b/, w: 1.5 }, { re: /\b(text|passage|author) (doesn't|does not|never) (say|mention|state|support|discuss|indicate)/, w: 1.5 }, { re: /\b(assumption|speculat\w*)\b/, w: 0.5 }]
  },
  {
    id: "half_right",
    label: "Half right",
    tip: "Check every part of the choice. One wrong word makes the whole choice wrong.",
    rules: [{ re: /\b(only (part|half|one part|one half) of|half[- ]right|partially (correct|true|right|accurate)|partly (correct|true|right))\b/, w: 1.5 }, { re: /\b(misses|ignores|leaves out|omits) (the )?(second|other|rest|key)\b/, w: 1 }]
  },
  {
    id: "reversed",
    label: "Says the opposite",
    tip: "Mark which way the text leans (for or against, up or down) before you read the choices.",
    rules: [{ re: /\b(opposite|revers\w*|backwards|the other way around|contradicts?)\b/, w: 1.5 }]
  },
  {
    id: "irrelevant",
    label: "True but beside the point",
    section: "rw",
    tip: "Ask whether the choice answers this exact question or goal. Accurate isn't enough.",
    rules: [{ re: /\b(irrelevant|off[- ]topic|unrelated|beside the point|true but)\b/, w: 1.5 }, { re: /\b(doesn't|does not|fails to) (address|support|weaken|meet|accomplish|achieve|relate to|answer)\b/, w: 1 }]
  },
  {
    id: "transition",
    label: "Wrong transition",
    section: "rw",
    skills: ["Transitions"],
    tip: "Name the relationship between the two sentences (contrast, cause, example, addition) before you look at the choices.",
    rules: [{ re: /\b(transition|logical relationship|relationship between)\b/, w: 1 }, { re: /\b(contrast\w*|cause|result|example|addition|continu\w*|sequence)\b/, w: 0.5 }]
  },
  {
    id: "splice",
    label: "Comma splice or run-on",
    section: "rw",
    domains: SEC,
    tip: "Two complete sentences need a period, a semicolon, or a comma plus and, but, or, so.",
    rules: [{ re: /\b(comma splice|run[- ]on|fused sentence)\b/, w: 2 }, { re: /\bindependent clauses?\b/, w: 1 }]
  },
  {
    id: "punctuation",
    label: "Colon, dash or semicolon misuse",
    section: "rw",
    domains: SEC,
    tip: "A colon or semicolon needs a complete sentence before it. Dashes and commas around extra info come in pairs.",
    rules: [{ re: /\b(colon|semicolon|dash(es)?)\b/, w: 1 }, { re: /\b(nonessential|non-essential|nonrestrictive|interrupt\w*|pair of (commas|dashes))\b/, w: 1 }]
  },
  {
    id: "agreement",
    label: "Subject-verb agreement",
    section: "rw",
    domains: SEC,
    tip: "Cross out the words between the subject and the verb, then match the verb to the subject.",
    rules: [{ re: /\bsubject[- ]verb\b/, w: 2 }, { re: /\b(singular|plural) (verb|subject)\b/, w: 1 }, { re: /\b(singular|plural)\b/, w: 0.5 }]
  },
  {
    id: "tense",
    label: "Verb tense",
    section: "rw",
    domains: SEC,
    tip: "Match the tense to the verbs around the blank and to when the action happens.",
    rules: [{ re: /\btense\b/, w: 1.5 }, { re: /\b(past perfect|present perfect|future perfect|simple (past|present)|conditional)\b/, w: 1 }]
  },
  {
    id: "pronoun",
    label: "Pronoun",
    section: "rw",
    domains: SEC,
    tip: "Find what the pronoun replaces and match it in number. Its/it's and their/they're are favorite traps.",
    rules: [{ re: /\b(pronoun|antecedent)\b/, w: 1.5 }, { re: /\b(its|it's|their|they're|whose|who's)\b/, w: 0.5 }]
  },
  {
    id: "modifier",
    label: "Misplaced modifier",
    section: "rw",
    domains: SEC,
    tip: "Whatever an opening phrase describes has to come right after the comma.",
    rules: [{ re: /\b(dangling|misplaced) modifier\b/, w: 2 }, { re: /\b(modifier|modifies|introductory (phrase|clause))\b/, w: 1 }]
  },
  {
    id: "wrong_quantity",
    label: "Answered a different quantity",
    section: "math",
    tip: "Circle what the question asks for. After you solve, check that's what you're reporting.",
    rules: [{ re: /\b(solved for|value of [a-z] (rather|instead)|asks for|asked for|requested|instead of the (value|expression|quantity))\b/, w: 1.5 }, { re: /\b(rather than|not the (value|quantity|expression))\b/, w: 0.5 }]
  },
  {
    id: "wrong_setup",
    label: "Set up the wrong equation",
    section: "math",
    tip: "Translate the words one phrase at a time, then plug a choice back in to check your setup.",
    rules: [{ re: /\b(wrong|incorrect) (equation|expression|model|setup|set-up)\b/, w: 1.5 }, { re: /\b(set ?up|sets up|misinterpret\w*|confus\w* (the )?(slope|intercept|rate))\b/, w: 1 }]
  },
  {
    id: "units_percent",
    label: "Units or percent base",
    section: "math",
    tip: "Write units next to every number, and say what the percent is a percent of.",
    rules: [{ re: /\b(units?|conver(t|ted|sion)|per (hour|minute|second|day|year))\b/, w: 1 }, { re: /\bpercent(age)? (of|increase|decrease|change)\b|\b(original|new) (value|price|amount)\b/, w: 1 }]
  },
  {
    id: "calc_slip",
    label: "Calculation slip",
    section: "math",
    tip: "Write each step down, and check mental arithmetic in Desmos.",
    rules: [{ re: /\b(arithmetic|calculation|computation|miscalculat\w*|sign error|negative sign|distribut\w*|rounding|added instead|subtracted instead|multiplied instead|divided instead)\b/, w: 1.5 }]
  }
];
var EXTRA = {
  misread: { label: "Misread the question", tip: "Say what the question asks in your own words before you read the choices." },
  other: { label: "Other", tip: "Re-read the rule and write one line in your own words on why your pick failed." }
};
function trapInfo(id) {
  const def = TRAPS.find((t) => t.id === id);
  return def ? { label: def.label, tip: def.tip } : EXTRA[id] ?? EXTRA.other;
}
function classifyMiss(e) {
  const section = sectionOf(e);
  const domain = e.domain ?? domainOfSkill(e.skill);
  const text2 = (e.whyPickFails ?? "").toLowerCase();
  const ruleText = `${e.ruleName ?? ""} ${e.ruleStatement ?? ""}`.toLowerCase();
  let best = null;
  for (const t of TRAPS) {
    if (t.section && t.section !== section) continue;
    if (t.domains && domain && !t.domains.includes(domain)) continue;
    let score = 0;
    const matched = [];
    for (const r of t.rules) {
      const m = text2.match(r.re);
      if (m) {
        score += r.w;
        matched.push(m[0]);
        continue;
      }
      const m2 = ruleText.match(r.re);
      if (m2) {
        score += r.w / 2;
        matched.push(m2[0]);
      }
    }
    if (t.skills && e.skill && t.skills.includes(e.skill)) score += 0.5;
    if (score >= 1 && (!best || score > best.score)) best = { id: t.id, label: t.label, score, matched };
  }
  if (best) return best;
  if (e.diagnosis === "misread") return { id: "misread", label: EXTRA.misread.label, score: 1, matched: [] };
  if (section === "math" && e.diagnosis === "careless") return { id: "calc_slip", label: trapInfo("calc_slip").label, score: 1, matched: [] };
  return { id: "other", label: EXTRA.other.label, score: 0, matched: [] };
}
var ORDER2 = [...TRAPS.map((t) => t.id), "misread", "other"];
function trapReport(entries) {
  const misses = entries.filter((e) => e.result === "missed");
  const map = /* @__PURE__ */ new Map();
  for (const e of misses) {
    const hit = classifyMiss(e);
    const c = map.get(hit.id) ?? { id: hit.id, ...trapInfo(hit.id), count: 0, share: 0, attemptIds: [] };
    c.count++;
    c.attemptIds.push(e.attemptId);
    map.set(hit.id, c);
  }
  const counts = [...map.values()].map((c) => ({ ...c, share: misses.length ? c.count / misses.length : 0 })).sort((a, b) => b.count - a.count || ORDER2.indexOf(a.id) - ORDER2.indexOf(b.id));
  return { total: misses.length, counts, top: counts.find((c) => c.id !== "other") ?? null };
}
function renderTraps(r) {
  if (r.total < 3) return null;
  const shown = r.counts.filter((c) => c.id !== "other").slice(0, 4);
  if (!shown.length) return null;
  return h(
    "section",
    { class: "card rc-traps" },
    h("h2", { text: "Traps you fall for" }),
    h("ul", { class: "rc-groups" }, ...shown.map((c) => h("li", null, h(
      "div",
      { class: "rc-group", title: c.tip },
      h("span", { class: "rc-group-label", text: c.label }),
      h("span", { class: "rc-meter" }, h("span", { style: `width:${Math.round(c.share * 100)}%` })),
      h("span", { class: "small muted rc-group-n", text: String(c.count) })
    )))),
    r.top ? h("p", { class: "small rc-trap-tip" }, h("b", { text: `${r.top.label}: ` }), r.top.tip) : null
  );
}

// extension/src/addons/timer.ts
var emptyTimer = () => ({ startedAt: null, laps: [] });
function lap2(state2, now) {
  const seconds = state2.startedAt !== null ? Math.round((now - state2.startedAt) / 1e3) : null;
  const valid = seconds !== null && seconds > 0 && seconds <= 1800 ? seconds : null;
  return { state: { startedAt: now, laps: valid !== null ? [...state2.laps, valid].slice(-200) : state2.laps }, seconds: valid };
}
function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
function sessionStats(state2, target = TARGET_SECONDS) {
  const n = state2.laps.length;
  return {
    count: n,
    avg: n ? Math.round(state2.laps.reduce((a, b) => a + b, 0) / n) : null,
    overTarget: state2.laps.filter((s) => s > target).length
  };
}
async function readTimer() {
  return await kv().get(KEYS.timer) ?? emptyTimer();
}
async function writeTimer(state2) {
  await kv().set(KEYS.timer, state2);
}
var ticker = null;
function renderTimer(state2, actions, target = TARGET_SECONDS) {
  const clock2 = h("span", { class: "rc-clock", text: "0:00" });
  const s = sessionStats(state2, target);
  const tick = () => {
    if (state2.startedAt === null) {
      clock2.textContent = "--:--";
      return;
    }
    const secs2 = (Date.now() - state2.startedAt) / 1e3;
    clock2.textContent = formatClock(secs2);
    clock2.classList.toggle("over", secs2 > target);
  };
  tick();
  if (ticker) clearInterval(ticker);
  ticker = setInterval(() => clock2.isConnected ? tick() : ticker && clearInterval(ticker), 1e3);
  return h(
    "div",
    { class: "rc-timer row between small", title: `Time on this question. Target pace is ${target}s (${target > TARGET_SECONDS ? "44 Math questions in 70 minutes" : "54 questions in 64 minutes"}).` },
    h("span", { class: "row" }, h("span", { class: "muted", text: state2.startedAt !== null ? "This question" : "Timer starts at your next capture" }), state2.startedAt !== null ? clock2 : null),
    h(
      "span",
      { class: "row" },
      s.count ? h("span", { class: "muted", text: `${s.count} done \xB7 avg ${formatClock(s.avg ?? 0)}${s.overTarget ? ` \xB7 ${s.overTarget} slow` : ""}` }) : null,
      h("button", { class: "btn link small", text: "Reset", onclick: actions.reset })
    )
  );
}

// extension/src/addons/vocab.ts
var WIC = "Words in Context";
var BLANK = /_{4,}/;
var FALLBACK_CHARS = 200;
var CARD_BLANK = "_____";
var BOUNDARY = /[.!?]+["'”’)\]]*(?=\s)/g;
var ABBREV = /(?:^|[^A-Za-z])(?:Mr|Mrs|Ms|Dr|Prof|St|Jr|Sr|Mt|vs|[A-Za-z])\.$/;
var squash3 = (s) => s.replace(/\s+/g, " ").trim();
var clip4 = (s, n) => s.length > n ? `${s.slice(0, n - 1).trimEnd()}\u2026` : s;
var escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var wordPattern = (word) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(word)}(?![\\p{L}\\p{N}])`, "giu");
var csvCell2 = (s) => `"${s.replace(/"/g, '""')}"`;
function sentenceAt(text2, from, to) {
  let start = 0;
  let end = text2.length;
  const re = new RegExp(BOUNDARY.source, "g");
  let m;
  while (m = re.exec(text2)) {
    if (m[0] === "." && ABBREV.test(text2.slice(Math.max(0, m.index - 8), m.index + 1))) continue;
    const stop = m.index + m[0].length;
    if (stop <= from) start = stop;
    else if (m.index >= to) {
      end = stop;
      break;
    }
  }
  return squash3(text2.slice(start, end));
}
function firstSentence(text2) {
  const t = squash3(text2 ?? "");
  return t ? sentenceAt(t, 0, 0) || null : null;
}
function sentenceFor(passage, word) {
  const text2 = squash3(passage ?? "");
  if (!text2) return null;
  const m = BLANK.exec(text2);
  if (!m) return clip4(text2, FALLBACK_CHARS);
  return sentenceAt(text2, m.index, m.index + m[0].length).replace(BLANK, () => word);
}
function wordOf(e) {
  if (normalizeSkill(e.skill) !== WIC || !hasChoiceList(e) || !LETTERS2.includes(e.correct)) return null;
  const word = e.choices[e.correct].trim();
  if (!word) return null;
  const missed = e.result === "missed";
  const letter = missed && e.picked !== "correct" && LETTERS2.includes(e.picked) ? e.picked : null;
  const pickedWord = letter ? e.choices[letter].trim() : "";
  return {
    word,
    meaning: firstSentence(e.whyCorrect),
    sentence: sentenceFor(e.passage, word),
    picked: pickedWord && pickedWord.toLowerCase() !== word.toLowerCase() ? pickedWord : null,
    result: missed ? "missed" : "right",
    qbId: e.qbId ?? null,
    at: e.at
  };
}
function collectWords(log) {
  const byWord = /* @__PURE__ */ new Map();
  const ids = /* @__PURE__ */ new Set();
  for (const e of [...log].sort((a, b) => b.at - a.at)) {
    if (ids.has(e.attemptId)) continue;
    const w = wordOf(e);
    if (!w) continue;
    ids.add(e.attemptId);
    const key = w.word.toLowerCase();
    const hit = byWord.get(key);
    if (!hit) {
      byWord.set(key, {
        word: w.word,
        meaning: w.meaning,
        sentence: w.sentence,
        picked: w.picked,
        result: w.result,
        seen: 1,
        lastAt: w.at,
        attemptIds: [e.attemptId],
        qbId: w.qbId,
        picks: w.picked ? [w.picked] : []
      });
      continue;
    }
    hit.seen++;
    hit.attemptIds.push(e.attemptId);
    if (w.result === "missed") hit.result = "missed";
    if (w.picked) {
      hit.picks.push(w.picked);
      hit.picked ??= w.picked;
    }
    hit.meaning ??= w.meaning;
    hit.sentence ??= w.sentence;
    hit.qbId ??= w.qbId;
  }
  return [...byWord.values()];
}
function confusables(words) {
  const pairs = /* @__PURE__ */ new Map();
  for (const w of words) {
    const picks = w.picks?.length ? w.picks : w.picked ? [w.picked] : [];
    for (const p of picks) {
      const key = `${p.toLowerCase()}\0${w.word.toLowerCase()}`;
      const hit = pairs.get(key);
      if (hit) hit.count++;
      else pairs.set(key, { picked: p, word: w.word, count: 1, lastAt: w.lastAt });
    }
  }
  return [...pairs.values()].sort((a, b) => b.count - a.count || b.lastAt - a.lastAt).map(({ picked, word, count: count2 }) => ({ picked, word, count: count2 }));
}
function filterWords(words, query) {
  const q = query.trim().toLowerCase();
  if (!q) return words.slice();
  return words.filter((w) => [w.word, w.meaning, w.sentence].some((s) => !!s && s.toLowerCase().includes(q)));
}
function blankOut(sentence, word) {
  return word.trim() ? sentence.replace(wordPattern(word.trim()), CARD_BLANK) : sentence;
}
function wordsToAnkiCsv(words) {
  const rows = ["#separator:comma", "#html:false", "#columns:Front,Back,Tags", "#tags column:3"];
  for (const w of words) {
    const word = w.word.trim();
    const front = w.sentence && word && wordPattern(word).test(w.sentence) ? blankOut(w.sentence, word) : word;
    const back = w.meaning ? `${word} : ${w.meaning}` : word;
    const tags = ["rulecard", "words_in_context", w.result === "missed" ? "missed" : ""].filter(Boolean).join(" ");
    rows.push([front, back, tags].map(csvCell2).join(","));
  }
  return rows.join("\n") + "\n";
}
var bankOpen = false;
var bankQuery = "";
var PAGE = 30;
function withWord(sentence, word) {
  if (!word.trim()) return [sentence];
  const re = wordPattern(word.trim());
  const out = [];
  let last = 0;
  let m;
  while (m = re.exec(sentence)) {
    if (m.index > last) out.push(sentence.slice(last, m.index));
    out.push(h("b", { text: m[0] }));
    last = m.index + m[0].length;
  }
  if (last < sentence.length) out.push(sentence.slice(last));
  return out;
}
function wordRow(w) {
  return h(
    "li",
    { class: `rc-vocab-item${w.result === "missed" ? " rc-vocab-missed" : ""}` },
    h(
      "div",
      { class: "rc-vocab-head" },
      h("b", { class: "rc-vocab-word", text: w.word }),
      w.result === "missed" ? chip("Missed", "warn") : null,
      w.picked ? h("span", { class: "small muted", text: `you picked ${w.picked}` }) : null,
      w.seen > 1 ? h("span", { class: "small muted", text: `seen ${w.seen} times` }) : null
    ),
    w.meaning ? h("div", { class: "small rc-vocab-meaning", text: w.meaning }) : null,
    w.sentence ? h("div", { class: "small muted rc-vocab-sentence" }, ...withWord(w.sentence, w.word)) : null
  );
}
var mixText = (c) => `"${c.picked}" instead of "${c.word}"${c.count > 1 ? ` (${c.count} times)` : ""}`;
function renderWordBank(words, handlers) {
  const missed = words.filter((w) => w.result === "missed").length;
  const count2 = `${words.length} ${words.length === 1 ? "word" : "words"}${missed ? `, ${missed} missed` : ""}`;
  const card = h(
    "details",
    {
      class: "card rc-vocab-card",
      open: bankOpen ? "" : null,
      ontoggle: (ev) => {
        bankOpen = ev.target.open;
      }
    },
    h("summary", null, h("h2", { text: "Word bank" }), h("span", { class: "small muted", text: count2 }))
  );
  if (!words.length) {
    const wic = SKILLS.find((s) => s.skill === WIC);
    card.append(h("p", { class: "small rc-vocab-empty", text: "No Words in Context cards yet. Explain one and its word, meaning and sentence land here, ready to review or send to Anki." }));
    if (wic) card.append(h("p", { class: "small muted", text: qbFilterSteps(wic) }));
    return card;
  }
  let limit = PAGE;
  const status = h("p", { class: "small muted rc-vocab-status", "aria-live": "polite" });
  const list2 = h("ul", { class: "rc-vocab-list" });
  const more = h("button", { type: "button", class: "btn small rc-vocab-more", onclick: () => {
    limit += PAGE;
    paint();
  } });
  const paint = () => {
    const hits = filterWords(words, bankQuery);
    const q = bankQuery.trim();
    list2.replaceChildren(...hits.slice(0, limit).map(wordRow));
    status.textContent = !q ? "" : hits.length ? `${hits.length} of ${words.length} match.` : `No words match "${q}".`;
    status.hidden = !q;
    more.textContent = `Show more (${Math.max(0, hits.length - limit)})`;
    more.hidden = hits.length <= limit;
  };
  const search = h("input", {
    type: "search",
    // An id lets the side panel keep focus and the text across a re-render (a toast, say).
    id: "rc-vocab-search",
    class: "input rc-vocab-search",
    placeholder: "Search words, meanings, sentences",
    "aria-label": "Search your words",
    value: bankQuery,
    oninput: (ev) => {
      bankQuery = ev.target.value;
      limit = PAGE;
      paint();
    }
  });
  const mix2 = confusables(words).slice(0, 5);
  card.append(search, status, list2, more);
  if (mix2.length) card.append(h("p", { class: "small rc-vocab-mixups" }, h("b", { text: "Mix-ups: " }), `${mix2.map(mixText).join("; ")}.`));
  card.append(h(
    "div",
    { class: "row rc-vocab-actions" },
    h("button", {
      type: "button",
      class: "btn small",
      text: "Export to Anki (.csv)",
      title: "In Anki, use File > Import and pick this file.",
      onclick: () => handlers.download(`rulecard-words-${stamp()}.csv`, wordsToAnkiCsv(words), "text/csv")
    })
  ));
  paint();
  return card;
}

// extension/src/addons/calendar.ts
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
var LEVEL_HINTS = [
  "No practice",
  "Under half your daily goal, or only reviews",
  "Half your daily goal or more",
  "Daily goal met",
  "Twice your daily goal or more"
];
var plural5 = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
var noon = (y, m, d) => new Date(y, m, d, 12).getTime();
var goalOf = (g) => typeof g === "number" && Number.isFinite(g) && g > 0 ? Math.max(1, Math.round(g)) : 10;
var weeksOf = (w) => typeof w === "number" && Number.isFinite(w) && w >= 1 ? Math.floor(w) : 16;
var weekStartOf = (s) => typeof s === "number" && Number.isFinite(s) ? (Math.trunc(s) % 7 + 7) % 7 : 0;
var monthOf = (key) => MONTHS[Number(key.slice(5, 7)) - 1] ?? "";
function shiftDay(key, days) {
  const [y = 1970, m = 1, d = 1] = key.split("-").map(Number);
  return dayKey(noon(y, m - 1, d + days));
}
function activityLevel(questions, reviews2, dailyGoal) {
  const goal = goalOf(dailyGoal);
  if (questions >= 2 * goal) return 4;
  if (questions >= goal) return 3;
  if (questions > 0 && questions * 2 >= goal) return 2;
  return questions > 0 || reviews2 > 0 ? 1 : 0;
}
function countByDay(log) {
  const map = /* @__PURE__ */ new Map();
  const bump = (at, field) => {
    if (typeof at !== "number" || !Number.isFinite(at)) return;
    const key = dayKey(at);
    const c = map.get(key) ?? { questions: 0, reviews: 0 };
    c[field]++;
    map.set(key, c);
  };
  for (const e of log) {
    bump(e.at, "questions");
    for (const d of Array.isArray(e.drills) ? e.drills : []) bump(d.at, "reviews");
  }
  return map;
}
function activityModel(log, opts) {
  const dailyGoal = goalOf(opts.dailyGoal);
  const weekCount = weeksOf(opts.weeks);
  const weekStart = weekStartOf(opts.weekStart);
  const counts = countByDay(log);
  const now = new Date(opts.now);
  const today = dayKey(opts.now);
  const first = now.getDate() - (now.getDay() - weekStart + 7) % 7 - (weekCount - 1) * 7;
  const weeks = [];
  for (let c = 0; c < weekCount; c++) {
    const column = [];
    for (let r = 0; r < 7; r++) {
      const date = noon(now.getFullYear(), now.getMonth(), first + c * 7 + r);
      const key = dayKey(date);
      const future = key > today;
      const hit = future ? void 0 : counts.get(key);
      const questions = hit?.questions ?? 0;
      const reviews2 = hit?.reviews ?? 0;
      column.push({ key, date, questions, reviews: reviews2, level: activityLevel(questions, reviews2, dailyGoal), future });
    }
    weeks.push(column);
  }
  const totals = { questions: 0, reviews: 0, activeDays: 0 };
  let goalDays = 0;
  let busiest = null;
  const sums = [0, 0, 0, 0, 0, 0, 0];
  const seen = [0, 0, 0, 0, 0, 0, 0];
  for (const d of weeks.flat()) {
    if (d.future) continue;
    totals.questions += d.questions;
    totals.reviews += d.reviews;
    if (d.level > 0) totals.activeDays++;
    if (d.questions >= dailyGoal) goalDays++;
    if (d.questions > 0 && (!busiest || d.questions >= busiest.questions)) busiest = { key: d.key, questions: d.questions };
    const wd = new Date(d.date).getDay();
    sums[wd] = (sums[wd] ?? 0) + d.questions;
    seen[wd] = (seen[wd] ?? 0) + 1;
  }
  const avg = sums.map((s, i2) => seen[i2] ? s / seen[i2] : 0);
  const top = Math.max(...avg);
  const leaders = avg.flatMap((a, i2) => a === top ? [i2] : []);
  const best = totals.questions > 0 && leaders.length === 1 ? WEEKDAYS[leaders[0]] ?? null : null;
  let currentStreak = 0;
  for (let k = counts.has(today) ? today : shiftDay(today, -1); counts.has(k); k = shiftDay(k, -1)) currentStreak++;
  const stamps = log.flatMap((e) => [{ at: e.at }, ...Array.isArray(e.drills) ? e.drills : []]).filter((s) => Number.isFinite(s.at));
  const monthLabels = [];
  weeks.forEach((column, c) => {
    const firstOfMonth = column.find((d) => !d.future && d.key.endsWith("-01"));
    if (firstOfMonth) monthLabels.push({ column: c, label: monthOf(firstOfMonth.key) });
  });
  const lead = weeks[0]?.[0];
  if (lead && (monthLabels[0]?.column ?? Infinity) >= 2) monthLabels.unshift({ column: 0, label: monthOf(lead.key) });
  return {
    weeks,
    monthLabels,
    totals,
    currentStreak,
    longestStreak: Math.max(longestStreak(stamps), currentStreak),
    busiest,
    weekday: { avg, best },
    goalDays,
    today,
    dailyGoal,
    weekStart
  };
}
var span = (m) => m.weeks.length === 1 ? "the last week" : `the last ${m.weeks.length} weeks`;
function activityInsight(model) {
  const n = model.totals.activeDays;
  if (!n) return `No practice in ${span(model)} yet.`;
  const best = model.weekday.best && n >= 3 ? ` You practice most on ${model.weekday.best}s.` : "";
  return `${plural5(n, "active day")} in ${span(model)}.${best}`;
}
function streakLine(model) {
  if (!model.longestStreak) return "";
  return `Current streak ${plural5(model.currentStreak, "day")}. Longest ${model.longestStreak}.`;
}
var monthDay = (key) => `${monthOf(key)} ${Number(key.slice(8, 10))}`;
function totalsLine(model) {
  const { questions, reviews: reviews2, activeDays } = model.totals;
  if (!activeDays) return "";
  const what = [questions ? plural5(questions, "question") : "", reviews2 ? plural5(reviews2, "review") : ""].filter(Boolean).join(" and ");
  const out = [`${what}.`];
  if (questions) out.push(model.goalDays ? `You hit your goal of ${model.dailyGoal} on ${plural5(model.goalDays, "day")}.` : `You haven't hit your goal of ${model.dailyGoal} yet.`);
  if (model.busiest) out.push(`Busiest day: ${monthDay(model.busiest.key)} (${model.busiest.questions}).`);
  return out.join(" ");
}
function dayLabel2(day) {
  const d = new Date(day.date);
  const what = [day.questions ? plural5(day.questions, "question") : "", day.reviews ? plural5(day.reviews, "review") : ""].filter(Boolean).join(", ");
  return `${WEEKDAYS[d.getDay()]?.slice(0, 3)}, ${MONTHS[d.getMonth()]} ${d.getDate()}: ${what || "no practice"}`;
}
var calOpen = false;
function renderCalendar(model) {
  const insight = activityInsight(model);
  const streak3 = streakLine(model);
  const totals = totalsLine(model);
  const labelAt = new Map(model.monthLabels.map((l) => [l.column, l.label]));
  const cell = (day) => h("span", {
    class: `rc-cal-cell rc-cal-l${day.level}${day.future ? " rc-cal-future" : ""}${day.key === model.today ? " rc-cal-today" : ""}`,
    title: day.future ? null : dayLabel2(day)
  });
  const weekdayLabel = (row) => {
    const wd = (model.weekStart + row) % 7;
    return h("span", { text: wd === 1 || wd === 3 || wd === 5 ? WEEKDAYS[wd]?.slice(0, 3) : "" });
  };
  return h(
    "details",
    {
      class: "card rc-cal",
      open: calOpen ? "" : null,
      ontoggle: (ev) => {
        calOpen = ev.target.open;
      }
    },
    h("summary", null, h("h2", { text: "Activity" }), h("span", { class: "small muted", text: plural5(model.totals.activeDays, "active day") })),
    h(
      "div",
      { class: "rc-cal-scroll" },
      h(
        "div",
        { class: "rc-cal-chart" },
        h("div", { class: "rc-cal-months", "aria-hidden": "true" }, ...model.weeks.map((_, c) => h("span", { text: labelAt.get(c) ?? "" }))),
        h("div", { class: "rc-cal-wdays", "aria-hidden": "true" }, ...Array.from({ length: 7 }, (_, r) => weekdayLabel(r))),
        h("div", { class: "rc-cal-grid", role: "img", "aria-label": insight }, ...model.weeks.flatMap((column) => column.map(cell))),
        h(
          "div",
          { class: "rc-cal-legend", "aria-hidden": "true" },
          h("span", { text: "Less" }),
          ...LEVEL_HINTS.map((hint, level) => h("span", { class: `rc-cal-cell rc-cal-l${level}`, title: hint })),
          h("span", { text: "More" })
        )
      )
    ),
    h("p", { class: "small rc-cal-insight", text: insight }),
    streak3 ? h("p", { class: "small muted rc-cal-streak", text: streak3 }) : null,
    totals ? h("p", { class: "small muted rc-cal-totals", text: totals }) : null
  );
}

// extension/src/addons/errorlog.ts
var ERROR_LOG_COLUMNS = [
  "Date",
  "Question ID",
  "Section",
  "Domain",
  "Skill",
  "Difficulty",
  "Your answer",
  "Correct answer",
  "Result",
  "Rule",
  "Why your pick fails",
  "Why the answer is right",
  "Diagnosis",
  "How sure",
  "Seconds",
  "Over pace",
  "Review box",
  "Starred",
  "Note"
];
var DIAGNOSIS_WORDS = {
  misread: "Misread",
  rule_gap: "Didn't know the rule",
  careless: "Careless slip",
  got_it_right: "Got it right",
  unknown: "Unknown"
};
var SURE_WORDS = { sure: "Sure", unsure: "Unsure", guess: "Guessed" };
var MAX_SECONDS3 = 1800;
var choiceText = (e, letter) => {
  const text2 = plainMath(e.choices?.[letter] ?? "").trim();
  return text2 ? `${letter}: ${text2}` : letter;
};
function answerCells(e) {
  const gridIn = isGridIn(e) || !hasChoiceList(e) && (e.accepted !== void 0 || e.typed !== void 0);
  if (!gridIn) {
    const correct = choiceText(e, e.correct);
    return { yours: e.picked === "correct" ? correct : choiceText(e, e.picked), correct };
  }
  const accepted = (e.accepted ?? []).map((a) => a.trim()).filter(Boolean);
  const typed = e.typed?.trim() ?? "";
  const yours = typed || (e.picked === "correct" && e.result === "right" ? accepted[0] ?? "" : "");
  return { yours, correct: accepted.join(" or ") };
}
function rowFor(e, srs) {
  const { yours, correct } = answerCells(e);
  const missed = e.result === "missed";
  const secs2 = typeof e.seconds === "number" && Number.isFinite(e.seconds) && e.seconds > 0 ? e.seconds : null;
  const box = srs?.[e.ruleId]?.box;
  return [
    dayKey(e.at),
    e.qbId ?? "",
    SECTION_LABEL[sectionOf(e)],
    e.domain ?? "",
    e.skill ?? "",
    e.difficulty ?? "",
    yours,
    correct,
    missed ? "Missed" : "Right",
    e.ruleName ? `${e.ruleId} \xB7 ${e.ruleName}` : e.ruleId,
    missed ? plainMath(e.whyPickFails ?? "") : "",
    plainMath(e.whyCorrect ?? ""),
    DIAGNOSIS_WORDS[e.diagnosis] ?? "Unknown",
    e.selfConfidence ? SURE_WORDS[e.selfConfidence] ?? "" : "",
    secs2 === null ? "" : String(Math.round(secs2)),
    secs2 === null || secs2 >= MAX_SECONDS3 ? "" : secs2 > targetSecondsFor(e) ? "Yes" : "No",
    typeof box === "number" ? `${box} of ${MAX_BOX}` : "",
    e.starred ? "Yes" : "",
    e.note ?? ""
  ];
}
function errorLogRows(log, opts) {
  const entries = filterScope([...log], opts.scope).sort((a, b) => a.at - b.at);
  return [[...ERROR_LOG_COLUMNS], ...entries.map((e) => rowFor(e, opts.srs))];
}
var FORMULA_START = /^[=+\-@\t\r]/;
var PLAIN_NEGATIVE = /^-(?:\d+(?:\.\d+)?|\.\d+)$/;
function guardCell(cell) {
  return FORMULA_START.test(cell) && !PLAIN_NEGATIVE.test(cell) ? `'${cell}` : cell;
}
var BOM = "\uFEFF";
function toErrorLogCsv(rows) {
  const line = (row) => row.map((cell) => `"${guardCell(String(cell ?? "")).replace(/"/g, '""')}"`).join(",");
  return BOM + rows.map((row) => `${line(row)}\r
`).join("");
}
function toErrorLogTsv(rows) {
  return rows.map((row) => row.map((cell) => guardCell(String(cell ?? "").replace(/[\t\r\n]+/g, " "))).join("	")).join("\n");
}
function errorLogFilename(scope, now) {
  return `rulecard-error-log-${scope}-${dayKey(now)}.csv`;
}

// extension/src/addons/wordquiz.ts
var WORDQUIZ_KEY = "rc.addons.wordquiz.v1";
var BLANK2 = "______";
var MIN_WORDS = 4;
var DEFAULT_WORDS = 10;
var QUIZ_SIZES = [5, 10];
var squash4 = (s) => s.replace(/\s+/g, " ").trim();
var escapeRe2 = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var isText = (x) => typeof x === "string";
var wordKey = (word) => squash4(isText(word) ? word : "").toLowerCase();
function wordPattern2(word) {
  const parts = squash4(isText(word) ? word : "").split(" ").filter(Boolean).map(escapeRe2);
  return parts.length ? new RegExp(`(?<![\\p{L}\\p{N}])${parts.join("\\s+")}(?![\\p{L}\\p{N}])`, "giu") : null;
}
var contains3 = (text2, word) => {
  const re = wordPattern2(word);
  return !!text2 && !!re && re.test(text2);
};
var QUOTE_PAIRS = { '"': '"', "\u201C": "\u201D", "'": "'", "\u2018": "\u2019" };
var LOOSE_QUOTED = new RegExp(`(^|[\\s(\\[])(["\u201C'\u2018]) ?${BLANK2} ?(["\u201D'\u2019])(?=$|[\\s.,;:!?)\\]])`, "g");
function blankWord(text2, word) {
  const t = squash4(isText(text2) ? text2 : "");
  const re = wordPattern2(word);
  if (!re) return t;
  return t.replace(re, BLANK2).replace(LOOSE_QUOTED, (m, pre, open5, close2) => QUOTE_PAIRS[open5] === close2 ? `${pre}${open5}${BLANK2}${close2}` : m);
}
function markWord(text2, word) {
  const re = wordPattern2(word);
  if (!isText(text2) || !text2) return [];
  if (!re) return [{ text: text2, hit: false }];
  const out = [];
  let last = 0;
  for (const m of text2.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text2.slice(last, at), hit: false });
    out.push({ text: m[0], hit: true });
    last = at + m[0].length;
  }
  if (last < text2.length) out.push({ text: text2.slice(last), hit: false });
  return out;
}
var LEAD_IN = new RegExp(
  "^(?:(?:choice|option|answer)\\s+)?\\(?[A-D]\\)?\\s+is\\s+(?:the\\s+)?(?:best|correct|right|most\\s+logical(?:\\s+and\\s+precise)?)(?:\\s+(?:answer|choice|option))?(?:\\s+(?:because|since|as))?\\s*[,:;.\\-\u2013\u2014]?(?:\\s+|$)|^the\\s+(?:best|correct|right)\\s+(?:answer|choice)\\s+is\\s+(?:choice\\s+)?\\(?[A-D]\\)?(?:\\s+(?:because|since|as))?\\s*[,:;.\\-\u2013\u2014]?(?:\\s+|$)",
  "i"
);
function cleanMeaning(meaning) {
  const t = squash4(isText(meaning) ? meaning : "");
  if (!t) return null;
  const rest = t.replace(LEAD_IN, "");
  if (rest === t) return t;
  if (!/[\p{L}\p{N}]/u.test(rest)) return null;
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}
function leaks(prompt, word) {
  const w = wordKey(word);
  if (w.includes(" ") || w.length < 5) return false;
  const stem = w.slice(0, Math.max(4, Math.ceil(w.length * 0.7)));
  return (prompt.toLowerCase().match(new RegExp("\\p{L}+", "gu")) ?? []).some((t) => t.startsWith(stem));
}
var sentenceOf = (w) => {
  const s = squash4(isText(w.sentence) ? w.sentence : "");
  return s && contains3(s, w.word) ? s : null;
};
function sentencePrompt(w) {
  const s = sentenceOf(w);
  if (!s) return null;
  const p = blankWord(s, w.word);
  return leaks(p, w.word) ? null : p;
}
function meaningPrompt(w) {
  const m = cleanMeaning(w.meaning);
  if (!m) return null;
  const p = blankWord(m, w.word);
  const words = p.split(BLANK2).join(" ").match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.length >= 2 && !leaks(p, w.word) ? p : null;
}
function wordQuestionKinds(w) {
  if (!w || !wordKey(w.word)) return [];
  const out = [];
  if (sentencePrompt(w) !== null) out.push("blank");
  if (meaningPrompt(w) !== null) out.push("meaning");
  return out;
}
function hashText(s) {
  let x = 2166136261;
  for (let i2 = 0; i2 < s.length; i2++) x = Math.imul(x ^ s.charCodeAt(i2), 16777619);
  return x >>> 0;
}
var mix = (seed, salt) => (seed ^ Math.imul(salt >>> 0, 2654435761)) >>> 0;
var tieKey = (seed, text2) => mulberry32(mix(seed, hashText(text2)))();
var toSeed = (seed, fallback) => (Number.isFinite(seed) ? seed : Number.isFinite(fallback) ? fallback : 0) >>> 0;
var sizeOf = (n) => typeof n === "number" && Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_WORDS;
var cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function distinctWords(words) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const w of Array.isArray(words) ? words : []) {
    const k = w ? wordKey(w.word) : "";
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(w);
  }
  return out;
}
function wordQuizAvailability(words) {
  const bank = distinctWords(words);
  if (bank.length < MIN_WORDS) {
    const need = MIN_WORDS - bank.length;
    const what = `Words in Context ${need === 1 ? "card" : "cards"}`;
    return { available: 0, reason: `Add ${need}${bank.length ? " more" : ""} ${what} to unlock the word quiz.` };
  }
  const available = bank.filter((w) => wordQuestionKinds(w).length > 0).length;
  return available ? { available, reason: null } : { available: 0, reason: "Your words need a sentence or a meaning before you can be quizzed on them." };
}
function wordQuizSizes(available) {
  const max = Number.isFinite(available) ? Math.max(0, Math.floor(available)) : 0;
  return [...new Set(QUIZ_SIZES.map((n) => Math.min(n, max)))].filter((n) => n > 0);
}
var isObj2 = (x) => typeof x === "object" && x !== null && !Array.isArray(x);
var isNum3 = (x) => typeof x === "number" && Number.isFinite(x);
function cleanEntry(x) {
  if (!isObj2(x) || !isNum3(x.right) || !isNum3(x.wrong) || !isNum3(x.lastAt) || x.right < 0 || x.wrong < 0) return null;
  return { right: Math.floor(x.right), wrong: Math.floor(x.wrong), lastAt: x.lastAt };
}
var entryOf = (record, key) => isObj2(record) && Object.prototype.hasOwnProperty.call(record, key) ? cleanEntry(record[key]) : null;
function pickWords(words, record, opts) {
  const seed = toSeed(opts.seed, 0);
  const rows = distinctWords(words).filter((w) => wordQuestionKinds(w).length > 0).map((w) => {
    const key = wordKey(w.word);
    const r = entryOf(record, key);
    return {
      w,
      missed: w.result === "missed" ? 1 : 0,
      bad: r ? Math.max(0, r.wrong - r.right) : 0,
      last: r ? r.lastAt : Number.NEGATIVE_INFINITY,
      tie: tieKey(seed, key)
    };
  });
  rows.sort((a, b) => b.missed - a.missed || b.bad - a.bad || cmp(a.last, b.last) || cmp(a.tie, b.tie));
  return rows.slice(0, sizeOf(opts.n)).map((r) => r.w);
}
var ENDINGS = [
  ["tion", "sion"],
  ["ness"],
  ["ment"],
  ["able", "ible"],
  ["less"],
  ["ous"],
  ["ive"],
  ["ing"],
  ["ful"],
  ["ity"],
  ["ize", "ise"],
  ["ate"],
  ["ent", "ant"],
  ["est"],
  ["ly"],
  ["ed"],
  ["al"],
  ["ic"],
  ["er"]
];
function ending(word) {
  const last = wordKey(word).split(" ").pop() ?? "";
  return ENDINGS.findIndex((group2) => group2.some((sfx) => last.length >= sfx.length + 2 && last.endsWith(sfx)));
}
function shapeScore(answer, other) {
  const a = wordKey(answer);
  const b = wordKey(other);
  const e = ending(a);
  return (a.split(" ").length === b.split(" ").length ? 2 : 0) + (e >= 0 && e === ending(b) ? 2 : 0) + (Math.abs(a.length - b.length) <= 2 ? 1 : 0);
}
var related = (a, b) => contains3(a.meaning, b.word) || contains3(b.meaning, a.word);
function ownPicks(w) {
  const tally = /* @__PURE__ */ new Map();
  const add = (p, weight) => {
    if (!isText(p) || !wordKey(p)) return;
    const hit = tally.get(wordKey(p));
    if (hit) hit.count += weight;
    else tally.set(wordKey(p), { text: squash4(p), count: weight, first: tally.size });
  };
  for (const p of Array.isArray(w.picks) ? w.picks : []) add(p, 1);
  add(w.picked, 0);
  return [...tally.values()].sort((a, b) => b.count - a.count || a.first - b.first).map((t) => t.text);
}
function pickDistractors(item, words, seed, count2 = 3) {
  const taken = /* @__PURE__ */ new Set([wordKey(item.word)]);
  const out = [];
  const add = (text2) => {
    const k = wordKey(text2);
    if (out.length >= count2 || !k || taken.has(k)) return;
    taken.add(k);
    out.push(squash4(text2));
  };
  for (const p of ownPicks(item)) add(p);
  if (out.length >= count2) return out;
  const s = toSeed(seed, 0);
  distinctWords(words).filter((w) => !taken.has(wordKey(w.word))).map((w) => ({ text: w.word, score: shapeScore(item.word, w.word) - (related(item, w) ? 10 : 0), tie: tieKey(s, wordKey(w.word)) })).sort((a, b) => b.score - a.score || cmp(a.tie, b.tie)).forEach((o) => add(o.text));
  return out;
}
var isUpper = (ch2) => ch2 !== ch2.toLowerCase();
var isLower = (ch2) => ch2 !== ch2.toUpperCase();
function matchCase(option, answer) {
  const a = answer.charAt(0);
  const o = option.charAt(0);
  if (isUpper(a) && isLower(o)) return o.toUpperCase() + option.slice(1);
  const rest = option.slice(1);
  if (isLower(a) && isUpper(o) && rest && rest === rest.toLowerCase()) return o.toLowerCase() + rest;
  return option;
}
function assignKinds(items, seed) {
  const phase = seed % 3;
  let meanings = 0;
  return items.map((w, i2) => {
    const kinds = wordQuestionKinds(w);
    const kind = kinds.length === 1 ? kinds[0] : (meanings + 1) * 3 <= i2 + phase ? "meaning" : "blank";
    if (kind === "meaning") meanings++;
    return kind;
  });
}
function buildQuestion(item, kind, bank, seed) {
  const word = squash4(item.word);
  const prompt = kind === "blank" ? sentencePrompt(item) : meaningPrompt(item);
  if (!prompt) return null;
  const salt = hashText(wordKey(word));
  const wrong = pickDistractors(item, bank, mix(seed, salt));
  if (wrong.length < 3) return null;
  const options = shuffled([word, ...wrong.slice(0, 3)], mix(seed, salt + 1));
  const at = options.indexOf(word);
  const shown = options.map((o, i2) => i2 === at ? o : matchCase(o, word));
  return {
    word,
    kind,
    prompt,
    choices: { A: shown[0], B: shown[1], C: shown[2], D: shown[3] },
    correct: LETTERS2[at],
    sentence: sentenceOf(item),
    meaning: cleanMeaning(item.meaning)
  };
}
function createWordQuiz(words, record, opts) {
  const now = opts.now;
  const seed = toSeed(opts.seed, now);
  const bank = distinctWords(words);
  const chosen = bank.length >= MIN_WORDS ? pickWords(bank, record, { seed, n: opts.n }) : [];
  const ask = shuffled(chosen, seed);
  const kinds = assignKinds(ask, seed);
  const questions = ask.map((w, i2) => buildQuestion(w, kinds[i2], bank, seed)).filter((q) => q !== null);
  return {
    id: `wq-${Math.round(now).toString(36)}-${seed.toString(36)}`,
    questions,
    index: 0,
    answers: {},
    startedAt: now,
    finishedAt: questions.length ? null : now
  };
}
var isWordQuizFinished = (s) => s.finishedAt !== null;
function onScreen2(s) {
  if (isWordQuizFinished(s)) return null;
  return s.index >= 0 && s.index < s.questions.length ? s.index : null;
}
function currentWord(s) {
  const i2 = onScreen2(s);
  return i2 === null ? null : s.questions[i2] ?? null;
}
function currentWordAnswer(s) {
  const i2 = onScreen2(s);
  return i2 === null ? null : s.answers[i2] ?? null;
}
function wordQuizProgress(s) {
  const total = s.questions.length;
  return {
    number: Math.min(s.index + 1, total),
    total,
    answered: s.questions.filter((_, i2) => s.answers[i2]).length,
    left: Math.max(0, total - s.index - 1)
  };
}
function answerWord(s, letter, now) {
  const i2 = onScreen2(s);
  if (i2 === null || s.answers[i2] || !LETTERS2.includes(letter)) return s;
  const q = s.questions[i2];
  return { ...s, answers: { ...s.answers, [i2]: { picked: letter, correct: letter === q.correct, at: now } } };
}
function nextWord(s, now) {
  const i2 = onScreen2(s);
  if (i2 === null || !s.answers[i2]) return s;
  return i2 >= s.questions.length - 1 ? { ...s, index: s.questions.length, finishedAt: now } : { ...s, index: i2 + 1 };
}
function finishWordQuiz(s, now) {
  return isWordQuizFinished(s) ? s : { ...s, finishedAt: now };
}
function wordQuizSummary(s) {
  let answered = 0;
  let right = 0;
  const misses = [];
  s.questions.forEach((q, i2) => {
    const a = s.answers[i2];
    if (!a) return;
    answered++;
    if (a.correct) right++;
    else misses.push({ word: q.word, picked: q.choices[a.picked], meaning: q.meaning, sentence: q.sentence });
  });
  return { total: s.questions.length, answered, right, wrong: answered - right, accuracy: answered ? right / answered : null, misses };
}
var KEY_LETTERS2 = { a: "A", b: "B", c: "C", d: "D", "1": "A", "2": "B", "3": "C", "4": "D" };
function wordQuizKey(key) {
  if (key === "Enter" || key === " ") return "next";
  return isText(key) && key.length === 1 ? KEY_LETTERS2[key.toLowerCase()] ?? null : null;
}
function cleanWordRecord(raw) {
  const out = {};
  if (!isObj2(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    const key = wordKey(k);
    const e = cleanEntry(v);
    if (!key || key === "__proto__" || !e) continue;
    const prev = out[key];
    out[key] = prev ? { right: prev.right + e.right, wrong: prev.wrong + e.wrong, lastAt: Math.max(prev.lastAt, e.lastAt) } : e;
  }
  return out;
}
function applyWordResults(record, state2, now) {
  const out = cleanWordRecord(record);
  state2.questions.forEach((q, i2) => {
    const a = state2.answers[i2];
    const key = wordKey(q.word);
    if (!a || !key || key === "__proto__") return;
    const at = isNum3(a.at) ? a.at : now;
    const prev = out[key];
    if (prev && prev.lastAt >= at) return;
    out[key] = {
      right: (prev?.right ?? 0) + (a.correct ? 1 : 0),
      wrong: (prev?.wrong ?? 0) + (a.correct ? 0 : 1),
      lastAt: isNum3(now) ? Math.max(now, at) : at
    };
  });
  return out;
}
var tail2 = Promise.resolve();
function queued2(fn) {
  const run = tail2.then(fn, fn);
  tail2 = run.catch(() => void 0);
  return run;
}
var rawRead2 = async () => cleanWordRecord(await kv().get(WORDQUIZ_KEY));
async function rawWrite2(record) {
  const clean2 = cleanWordRecord(record);
  await kv().set(WORDQUIZ_KEY, clean2);
  return clean2;
}
var readWordRecord = () => queued2(rawRead2);
var writeWordRecord = (record) => queued2(() => rawWrite2(record));
var saveWordResults = (state2, now) => queued2(async () => {
  const record = await rawRead2();
  return state2.questions.some((_, i2) => state2.answers[i2]) ? rawWrite2(applyWordResults(record, state2, now)) : record;
});

// extension/src/addons/wordquiz-ui.ts
var plural6 = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
var pct7 = (x) => `${Math.round((x ?? 0) * 100)}%`;
var TITLE = "Quiz me on my words";
var withWord2 = (text2, word) => markWord(text2, word).map((p) => p.hit ? h("b", { text: p.text }) : p.text);
function promptNodes(prompt) {
  const out = [];
  prompt.split(BLANK2).forEach((part, i2) => {
    if (i2 > 0) out.push(h("span", { class: "rc-wq-blank", role: "img", "aria-label": "blank", text: BLANK2 }));
    if (part) out.push(part);
  });
  return out;
}
function head2(title, count2, extra, close2) {
  return h(
    "div",
    { class: "row between rc-wq-head" },
    h("h2", { text: title }),
    h(
      "div",
      { class: "row rc-wq-head-right" },
      count2 ? h("span", { class: "small muted rc-wq-count", text: count2 }) : null,
      extra,
      close2 ? h("button", { type: "button", class: "btn link small", title: "Esc", onclick: () => close2() }, "Quit") : null
    )
  );
}
function bar3(done, total) {
  const n = Math.max(0, Math.min(done, total));
  const fill = h("span");
  fill.style.width = `${total ? Math.round(n / total * 100) : 100}%`;
  return h("div", { class: "rc-wq-bar", role: "progressbar", "aria-label": "Progress", "aria-valuemin": 0, "aria-valuemax": total, "aria-valuenow": n }, fill);
}
function choiceList3(q, ans, pick) {
  return h("ol", { class: "choices rc-wq-choices" }, ...LETTERS2.map((letter, i2) => {
    const live = !ans;
    const choose = () => {
      if (live) pick(letter);
    };
    const state2 = ans ? letter === q.correct ? "correct" : letter === ans.picked ? "picked" : "" : "selectable";
    return h(
      "li",
      {
        class: `choice ${state2}`.trim(),
        role: live ? "button" : null,
        tabindex: live ? 0 : null,
        title: live ? `${letter} or ${i2 + 1}` : null,
        onclick: live ? choose : null,
        onkeydown: live ? (ev) => {
          if (ev.key !== "Enter" && ev.key !== " ") return;
          ev.preventDefault();
          ev.stopPropagation();
          choose();
        } : null
      },
      h("span", { class: "letter", text: `${letter}.` }),
      h("span", { class: "rc-wq-word", text: q.choices[letter] }),
      ans && letter === ans.picked ? h("span", { class: "rc-wq-tag", text: "your pick" }) : null
    );
  }));
}
function renderWordQuizEntry(info, handlers) {
  const sizes = info.reason ? [] : wordQuizSizes(info.available);
  const title = h("b", { class: "rc-wq-entry-title", text: TITLE });
  if (!sizes.length) {
    return h(
      "div",
      { class: "rc-wq-entry rc-wq-locked" },
      h(
        "div",
        { class: "rc-wq-entry-text" },
        title,
        h("span", { class: "small muted", text: info.reason ?? "Explain more Words in Context cards to unlock the word quiz." })
      )
    );
  }
  return h(
    "div",
    { class: "rc-wq-entry" },
    h(
      "div",
      { class: "rc-wq-entry-text" },
      title,
      h("span", { class: "small muted", text: "Pick the word for each sentence or meaning. Your past wrong picks show up as choices." })
    ),
    h(
      "div",
      { class: "row rc-wq-sizes", role: "group", "aria-label": "Quiz length" },
      ...sizes.map((n, i2) => h("button", {
        type: "button",
        class: i2 === 0 ? "btn small primary" : "btn small",
        title: `Start a quiz on ${plural6(n, "word")}`,
        onclick: () => handlers.start(n)
      }, plural6(n, "word")))
    )
  );
}
function feedback(q, ans) {
  const said = ans.correct ? ["Right. The word is ", h("b", { text: q.word }), "."] : ["Not quite. You picked ", h("b", { text: q.choices[ans.picked] }), ". The word is ", h("b", { text: q.word }), "."];
  return h(
    "div",
    { class: "rc-wq-feedback" },
    h("div", { class: `banner ${ans.correct ? "good" : "danger"}`, role: "status" }, h("p", { class: "stem" }, ...said)),
    q.sentence ? h("p", { class: "rc-wq-sentence" }, ...withWord2(q.sentence, q.word)) : null,
    q.meaning ? h("p", { class: "small rc-wq-meaning" }, ...withWord2(q.meaning, q.word)) : null
  );
}
function renderWordQuiz(state2, handlers) {
  const q = currentWord(state2);
  const p = wordQuizProgress(state2);
  if (!q) {
    return h(
      "div",
      { class: "card rc-wq rc-wq-run" },
      head2("Word quiz", null, null, handlers.quit),
      h("p", { class: "small muted", text: "You've reached the end of this quiz." }),
      h(
        "div",
        { class: "row rc-wq-actions" },
        h("button", { type: "button", class: "btn primary", title: "Enter", onclick: () => handlers.next() }, "See results")
      )
    );
  }
  const ans = currentWordAnswer(state2);
  const kids = [
    head2("Word quiz", `${p.number} of ${p.total}`, null, handlers.quit),
    bar3(state2.index + (ans ? 1 : 0), p.total),
    h("p", { class: "rc-wq-label", text: q.kind === "blank" ? "Which word fits?" : "Which word means this?" }),
    h("p", { class: `stem rc-wq-prompt rc-wq-kind-${q.kind}` }, ...promptNodes(q.prompt)),
    choiceList3(q, ans, (l) => handlers.pick(l))
  ];
  if (!ans) {
    kids.push(h("p", { class: "small muted rc-wq-hint", text: "Pick a word. Keys 1 to 4 or A to D work too." }));
  } else {
    kids.push(
      feedback(q, ans),
      h(
        "div",
        { class: "row rc-wq-actions" },
        h("button", { type: "button", class: "btn primary", title: "Enter", onclick: () => handlers.next() }, p.left > 0 ? "Next" : "See results")
      )
    );
  }
  return h("div", { class: "card rc-wq rc-wq-run" }, ...kids);
}
function missItem2(m) {
  return h(
    "li",
    { class: "rc-wq-miss" },
    h(
      "div",
      { class: "rc-wq-miss-head" },
      h("b", { class: "rc-wq-miss-word", text: m.word }),
      h("span", { class: "small muted", text: `you picked ${m.picked}` })
    ),
    m.meaning ? h("p", { class: "small rc-wq-meaning" }, ...withWord2(m.meaning, m.word)) : null,
    m.sentence ? h("p", { class: "small muted rc-wq-sentence" }, ...withWord2(m.sentence, m.word)) : null
  );
}
function renderWordQuizResult(summary, handlers) {
  const s = summary;
  const misses = s.misses.length;
  const tone = s.accuracy === null ? "" : s.accuracy >= 0.8 ? "good" : s.accuracy >= 0.5 ? "warn" : "danger";
  const top = head2("Word quiz results", null, s.answered ? chip(pct7(s.accuracy), tone) : null, null);
  const actions = h(
    "div",
    { class: "row rc-wq-actions" },
    h("button", { type: "button", class: misses ? "btn primary" : "btn", onclick: () => handlers.again() }, "Again"),
    h("button", { type: "button", class: misses ? "btn" : "btn primary", title: "Enter", onclick: () => handlers.done() }, "Done")
  );
  if (!s.answered) {
    return h(
      "div",
      { class: "card rc-wq rc-wq-result" },
      top,
      h(
        "div",
        { class: "banner warn", role: "status" },
        h("p", { class: "stem", text: "You didn't answer any words." }),
        h("p", { class: "small", text: "Start again whenever you're ready." })
      ),
      actions
    );
  }
  const left = s.total - s.answered;
  return h(
    "div",
    { class: "card rc-wq rc-wq-result" },
    top,
    h(
      "div",
      { class: `banner ${(s.accuracy ?? 0) >= 0.8 ? "good" : "warn"}`, role: "status" },
      h("p", { class: "stem", text: `You got ${s.right} of ${s.answered} right.` }),
      h("p", { class: "small", text: left ? `That's ${pct7(s.accuracy)}. You stopped with ${plural6(left, "word")} left.` : `That's ${pct7(s.accuracy)}.` })
    ),
    misses ? h(
      "div",
      null,
      h("h3", { text: `Words to review (${misses})` }),
      h("ul", { class: "rc-wq-misses" }, ...s.misses.map(missItem2))
    ) : h("p", { class: "small", text: left ? "No misses in the words you answered." : "You got every word right." }),
    actions
  );
}

// extension/src/addons/index.ts
var freshReview = () => ({ open: false, forced: null, rule: null, drill: null, picked: null, result: null, loading: false, error: null, skipped: [], done: 0, correct: 0 });
var GRID_IN_SKIP = "This one needs a typed answer. Use Test me on the card.";
var CONFIDENCE = [
  { key: "sure", label: "Sure", hint: "I knew it" },
  { key: "unsure", label: "Unsure", hint: "50/50" },
  { key: "guess", label: "Guessed", hint: "no idea" }
];
function createAddons(ctx, host) {
  const s = {
    prefs: { ...DEFAULT_PREFS },
    log: [],
    srs: {},
    timer: emptyTimer(),
    sets: emptySets(),
    summary: null,
    review: freshReview(),
    page: null,
    pageWarning: null,
    captureAnyway: false,
    checkWarnings: [],
    cropping: null,
    lastSent: null,
    confidence: null,
    journal: defaultFilter(),
    showHelp: false,
    showSettings: false,
    strategyOpen: false,
    lastSeconds: null,
    toast: null,
    practice: null,
    redoStore: {},
    /** achievements.ts: badge id -> when it was earned. */
    badges: {},
    /** The next extract came from a right-click selection or a paste, not from the active tab. */
    fromElsewhere: false,
    /** qbquiz.ts: the Question Bank export quiz on screen (or its results). null when there is none. */
    quiz: null,
    /** Finished quizzes, newest first (qbquiz.ts keeps 20). */
    quizHistory: [],
    /** The quiz is set aside (a slim strip on top) while Rulecard explains one of its misses. */
    quizPaused: false,
    quizBusy: false,
    /** Seconds the student spent on the quiz question being explained. afterExtract logs it instead of a timer lap. */
    quizSeconds: null,
    /** The paste box of "Practice a Question Bank export". Kept in memory only. */
    quizEntry: { open: false, text: "", parsed: null },
    /** wordquiz.ts: "Quiz me on my words" on screen (or its results). Memory only. */
    wordQuiz: null,
    wordQuizN: 10
  };
  let practiceView = null;
  const recompute = () => {
    s.summary = summarize(s.log, s.srs);
  };
  const toast = (msg) => {
    s.toast = msg;
    ctx.rerender();
    setTimeout(() => {
      if (s.toast === msg) {
        s.toast = null;
        ctx.rerender();
      }
    }, 2200);
  };
  const badgeInput = () => ({ log: s.log, srs: s.srs, recaps: s.sets.recap ? [s.sets.recap] : [], dailyGoal: s.prefs.dailyGoal });
  const checkBadges = async () => {
    const { badges, fresh } = await syncBadges(badgeInput());
    s.badges = badges;
    return s.prefs.badges && fresh.length ? badgeToast(fresh) : "";
  };
  const applyZoom = () => {
    if (typeof document !== "undefined" && document.body) document.body.style.zoom = String(s.prefs.zoom || 1);
  };
  let unhook = null;
  const ready = (async () => {
    [s.prefs, s.log, s.srs, s.timer, s.sets, s.redoStore] = await Promise.all([readPrefs(), readLog(), readSrs(), readTimer(), readSets(), readRedo()]);
    if (!Object.keys(s.srs).length && s.log.length) {
      s.srs = rebuildFromLog(s.log);
      await writeSrs(s.srs);
    }
    const quizStore = await readQuizStore();
    s.quiz = quizStore.active ? resumeQuiz(quizStore.active, Date.now()) : null;
    s.quizHistory = quizStore.history;
    recompute();
    s.badges = (await syncBadges(badgeInput())).badges;
    applyZoom();
    if (s.prefs.hotkeys) unhook = installHotkeys(hotkeyActions);
    ctx.rerender();
  })();
  const captureHost = {
    processImage: async (image) => {
      s.fromElsewhere = true;
      s.lastSent = null;
      try {
        await host.processImage(image);
      } catch (error) {
        s.fromElsewhere = false;
        throw error;
      }
    },
    rerender: () => ctx.rerender(),
    describe: (error) => ctx.describe(error)
  };
  const selection = createSelectionCapture(captureHost);
  const paste = createPastePanel(captureHost);
  const seen = createSeenCheck(() => ctx.rerender());
  void ready.then(async () => {
    for (let i2 = 0; i2 < 30 && !ctx.settings?.token; i2++) await new Promise((r) => setTimeout(r, 100));
    await selection.start();
  });
  function hotkeyActions() {
    if (s.wordQuiz) return { raw: pressWordQuizKey, help: toggleHelp };
    if (s.quiz && !s.quizPaused) return { raw: pressQuizKey, help: toggleHelp };
    if (s.practice && practiceView) {
      const v = practiceView;
      return { raw: (key) => pressPracticeKey(v.handlers, key, v.mode), help: toggleHelp };
    }
    const r = s.review;
    if (r.open && r.drill && !r.result) {
      return { pick: (l) => void answerReview(l), help: toggleHelp };
    }
    if (r.open && r.result) return { review: () => void nextReview(), help: toggleHelp };
    return {
      pick: (l) => host.pick?.(l),
      pickCorrect: () => host.pick?.("correct"),
      explain: () => host.explain?.(),
      capture: () => host.capture?.(),
      testMe: () => host.testMe?.(),
      focusChat: () => host.focusChat?.(),
      review: () => void startReview(),
      copyCard: () => void copyCurrentCard(),
      help: toggleHelp
    };
  }
  function toggleHelp() {
    s.showHelp = !s.showHelp;
    ctx.rerender();
  }
  async function beforeCapture(tab) {
    s.pageWarning = null;
    s.checkWarnings = [];
    s.page = null;
    s.fromElsewhere = false;
    const wantsPage = s.prefs.pageCheck || s.prefs.textCapture;
    if (!wantsPage || tab.id === void 0 || !isQuestionBankUrl(tab.url)) return true;
    const read = await readQuestionBankPage(tab.id);
    if (read) s.page = { ...read, at: Date.now(), tabId: tab.id };
    if (s.captureAnyway) {
      s.captureAnyway = false;
      return true;
    }
    const p = read?.parsed;
    if (s.prefs.pageCheck && p?.qbId && !p.answerRevealed && hasChoices(p.choices) && !isMathTaxonomy(p.domain, p.skill)) {
      s.pageWarning = `The answer to ${p.qbId} isn't showing yet. Reveal it on the page, then capture. That way the card uses the official answer and you don't spend a capture.`;
      ctx.rerender();
      return false;
    }
    return true;
  }
  async function tryTextCapture(tab) {
    if (!s.prefs.textCapture || tab.id === void 0 || !isQuestionBankUrl(tab.url)) return null;
    let read = s.page && s.page.tabId === tab.id && Date.now() - s.page.at < 15e3 ? s.page : null;
    if (!read) read = await readQuestionBankPage(tab.id);
    if (!read || isMathTaxonomy(read.parsed.domain, read.parsed.skill) || !canTextCapture(read.parsed, read.media)) return null;
    try {
      const image = await renderQuestionImage(read.parsed);
      s.lastSent = { kind: "text", image };
      return image;
    } catch {
      return null;
    }
  }
  async function transformImage(image) {
    s.lastSent = { kind: "screenshot", image };
    if (!s.prefs.cropBeforeSend) return image;
    return new Promise((resolve) => {
      s.cropping = { image, resolve };
      ctx.rerender();
    });
  }
  async function afterExtract(question) {
    const elsewhere = s.fromElsewhere;
    s.fromElsewhere = false;
    const quizSeconds = s.quizSeconds;
    s.quizSeconds = null;
    if (s.prefs.timer) {
      if (quizSeconds !== null) {
        s.lastSeconds = quizSeconds;
      } else {
        const res = lap2(s.timer, Date.now());
        s.timer = res.state;
        s.lastSeconds = res.seconds;
        await writeTimer(s.timer);
      }
    }
    s.confidence = null;
    s.checkWarnings = [];
    const isMath = question.section === "math" || question.format === "spr" || isMathTaxonomy(question.domain, question.skill);
    if (s.prefs.pageCheck && s.lastSent?.kind !== "text" && !elsewhere && !isMath) {
      let page = s.page && Date.now() - s.page.at < 6e4 ? s.page.parsed : null;
      if (!page) {
        try {
          const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          if (tab?.id !== void 0 && isQuestionBankUrl(tab.url)) page = (await readQuestionBankPage(tab.id))?.parsed ?? null;
        } catch {
        }
      }
      if (page) s.checkWarnings = crossCheck(question, page).warnings;
    }
    s.page = null;
    ctx.rerender();
  }
  async function afterExplain(data, picked, typed = null) {
    try {
      await afterExplainInner(data, picked, typed);
    } catch (error) {
      console.warn("Rulecard: couldn't save this card on the device", error);
      toast("Couldn't save this card on this device");
    }
  }
  async function afterExplainInner(data, picked, typed) {
    const entry = entryFromExplain(data, picked, { seconds: s.prefs.timer ? s.lastSeconds : null, selfConfidence: s.confidence, typed });
    s.checkWarnings = [];
    s.log = await recordAttempt(entry);
    s.srs = applyAttempt(s.srs, entry, entry.at);
    await writeSrs(s.srs);
    let setDone = false;
    if (s.sets.active) {
      s.sets = addToSet(s.sets, entry.attemptId, s.log, Date.now());
      await writeSets(s.sets);
      setDone = Boolean(s.sets.recap && !s.sets.active);
    }
    recompute();
    const earned = await checkBadges();
    if (setDone || earned) toast([setDone ? "Set complete" : "", earned].filter(Boolean).join(". "));
    if (s.prefs.autoSpeak) speak(`${data.rule?.name ?? ""}. ${data.card.rule_statement}`);
    ctx.rerender();
  }
  async function afterDrillCheck(attemptId, correct) {
    try {
      await recordDrill(attemptId, correct, false);
      s.log = await readLog();
    } catch (error) {
      console.warn("Rulecard: couldn't save the drill result", error);
      return;
    }
    recompute();
    ctx.rerender();
  }
  const due = () => dueRules(s.srs, Date.now());
  const queueLeft = () => due().filter((d) => !s.review.skipped.includes(d.ruleId));
  async function startReview(ruleId) {
    if (ruleId && !s.srs[ruleId]) {
      const latest = s.log.find((e) => e.ruleId === ruleId);
      if (latest) {
        s.srs = applyAttempt(s.srs, latest, latest.at);
        await writeSrs(s.srs);
      }
    }
    s.review = { ...freshReview(), open: true, forced: ruleId ?? null };
    s.practice = null;
    await nextReview();
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function nextReview() {
    const r = s.review;
    const forced = r.forced ? s.srs[r.forced] ?? null : null;
    r.forced = null;
    const rule = forced ?? queueLeft()[0] ?? null;
    Object.assign(r, { rule, drill: null, picked: null, result: null, error: null, loading: Boolean(rule) });
    ctx.rerender();
    if (!rule) return;
    try {
      const d = await ctx.request(ctx.settings, "/api/drill", { body: { attemptId: rule.attemptId } });
      if (d.format === "spr" || !hasChoices(d.question.choices)) r.error = GRID_IN_SKIP;
      else r.drill = d;
    } catch (error) {
      r.error = ctx.describe(error);
    } finally {
      r.loading = false;
      ctx.rerender();
    }
  }
  async function answerReview(letter) {
    const r = s.review;
    if (!r.drill || r.result || r.picked || !r.rule) return;
    r.picked = letter;
    ctx.rerender();
    try {
      r.result = await ctx.request(ctx.settings, "/api/drill/check", { body: { drillId: r.drill.drillId, picked: letter } });
      r.done++;
      if (r.result.correct) r.correct++;
      s.srs = applyReview(s.srs, r.rule.ruleId, r.result.correct, Date.now());
      await writeSrs(s.srs);
      await recordDrill(r.rule.attemptId, r.result.correct, true);
      s.log = await readLog();
      recompute();
      const earned = await checkBadges();
      if (earned) toast(earned);
    } catch (error) {
      r.error = ctx.describe(error);
      r.picked = null;
    }
    ctx.rerender();
  }
  function renderReview() {
    const r = s.review;
    const dueList = due();
    if (!r.open) {
      if (!Object.keys(s.srs).length) return null;
      const next = nextDue(s.srs, Date.now());
      return h(
        "div",
        { class: "card rc-review-cta" },
        h(
          "div",
          { class: "row between" },
          h("div", null, h("h2", { text: "Review" }), h("p", { class: "small", text: dueList.length ? `${dueList.length} rule${dueList.length === 1 ? "" : "s"} due` : next ? `Nothing due. Next review ${describeDue(next.due, Date.now())}.` : "Nothing due." })),
          dueList.length ? h("button", { class: "btn primary", onclick: () => void startReview(), title: "R" }, `Review ${dueList.length}`) : null
        ),
        dueList.length ? h("div", { class: "row rc-wrap" }, ...dueList.slice(0, 6).map((d) => chip(d.ruleName ? `${d.ruleId} \xB7 ${d.ruleName}` : d.ruleId, d.lapses > 1 ? "danger" : "accent"))) : null
      );
    }
    const header2 = h(
      "div",
      { class: "row between" },
      h("h2", { text: `Review${r.done ? ` \xB7 ${r.correct}/${r.done}` : ""}` }),
      h("button", { class: "btn link small", text: "Done", onclick: () => {
        s.review = freshReview();
        ctx.rerender();
      } })
    );
    if (!r.rule) {
      return h("div", { class: "card" }, header2, h("div", { class: "banner good" }, h("p", { class: "stem", text: r.done ? `Done. ${r.correct} of ${r.done} right.` : "Nothing due right now." }), h("p", { class: "small muted", text: "Missed rules come back tomorrow. Ones you get right come back after longer and longer gaps." })));
    }
    const children = [header2, h("div", { class: "row" }, chip(r.rule.ruleName ? `${r.rule.ruleId} \xB7 ${r.rule.ruleName}` : r.rule.ruleId, "accent"), chip(`box ${r.rule.box}/6`))];
    if (r.loading) children.push(h("p", { class: "muted small row" }, spinner(), "Writing a fresh question on this rule..."));
    if (r.drill) {
      const d = r.drill;
      children.push(
        d.question.passage ? h("div", { class: "passage", text: d.question.passage }) : null,
        h("p", { class: "stem", text: d.question.stem }),
        h(
          "ol",
          { class: "choices" },
          ...LETTERS2.map((letter) => {
            const isPick = r.picked === letter;
            const isCorrect = r.result?.correctLetter === letter;
            const cls = r.result ? isCorrect ? "correct" : isPick ? "picked" : "" : isPick ? "selected" : "selectable";
            return h("li", { class: `choice ${cls}`.trim(), onclick: () => void answerReview(letter) }, h("span", { class: "letter", text: `${letter}.` }), h("span", { text: d.question.choices?.[letter] ?? "" }));
          })
        )
      );
    }
    if (r.result) {
      children.push(
        h(
          "div",
          { class: `banner ${r.result.correct ? "good" : "danger"}` },
          h("p", { class: "stem", text: r.result.correct ? "Right. This rule's next review is pushed further out." : `Not quite. The answer is ${r.result.correctLetter ?? r.result.correctAnswer ?? "not available"}. This rule comes back tomorrow.` }),
          h("p", { text: r.result.correct ? r.result.whyCorrect : r.result.fix ?? r.result.whyCorrect })
        ),
        h("button", { class: "btn primary", onclick: () => void nextReview(), title: "R" }, queueLeft().length ? `Next rule (${queueLeft().length} left)` : "Finish")
      );
    }
    if (r.error) {
      const gridIn = r.error === GRID_IN_SKIP;
      children.push(h("div", { class: `banner ${gridIn ? "warn" : "danger"}`, role: "alert", text: r.error }), h("button", { class: "btn", text: "Skip this rule", onclick: () => {
        if (r.rule) {
          r.skipped.push(r.rule.ruleId);
          if (!gridIn) {
            s.srs = applyReview(s.srs, r.rule.ruleId, false, Date.now());
            void writeSrs(s.srs);
          }
        }
        void nextReview();
      } }));
    }
    return h("div", { class: "card rc-review" }, ...children);
  }
  function openPractice(p) {
    s.review = freshReview();
    s.practice = p;
    ctx.rerender();
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function quitPractice() {
    s.practice = null;
    practiceView = null;
    recompute();
    ctx.rerender();
  }
  function renderPractice() {
    const p = s.practice;
    if (!p) {
      practiceView = null;
      if (!s.prefs.practice || s.review.open) return null;
      const counts = deckCounts(s.log, s.srs, Date.now());
      return renderPracticeEntry({ due: counts.due, weak: counts.weak, misses: redoQueue(s.log, s.redoStore).length }, {
        flashcards: (extra) => openPractice({ mode: "flashcards", deck: createDeck(s.log, s.srs, Date.now(), { extra }) }),
        redo: () => openPractice({ mode: "redo", redo: createRedo(s.log, s.redoStore, Date.now()) })
      });
    }
    const view = p.mode === "flashcards" ? renderFlashcards(p.deck, {
      update: (deck) => {
        s.practice = { mode: "flashcards", deck };
        ctx.rerender();
      },
      saveSrs: (srs) => {
        s.srs = srs;
        void writeSrs(srs);
        recompute();
        void checkBadges().then((m) => {
          if (m) toast(m);
        });
      },
      getSrs: () => s.srs,
      quit: quitPractice
    }) : renderRedo(p.redo, {
      update: (redo) => {
        s.practice = { mode: "redo", redo };
        ctx.rerender();
      },
      saveAnswer: (attemptId, attempt) => void recordRedo(attemptId, attempt).then((store) => {
        s.redoStore = store;
        if (!s.practice) ctx.rerender();
      }),
      quit: quitPractice
    }, { stats: redoStats(s.log, s.redoStore) });
    practiceView = { mode: p.mode, handlers: view.handlers };
    return view.el;
  }
  const scrollTop = () => {
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  function setQuiz(next) {
    const prev = s.quiz;
    s.quiz = next;
    if (!next) s.quizPaused = false;
    void saveActive(next).catch((error) => console.warn("Rulecard: couldn't save the quiz", error));
    if (next && isFinished(next) && !(prev && prev.id === next.id && isFinished(prev))) {
      void recordResult(next).then((store) => {
        s.quizHistory = store.history;
      });
    }
    ctx.rerender();
  }
  function startQuiz(opts) {
    const parsed = s.quizEntry.parsed;
    if (!parsed?.questions.length) return;
    s.review = freshReview();
    s.practice = null;
    s.quizEntry.open = false;
    setQuiz(createQuiz(parsed.questions, { now: Date.now(), shuffle: opts.shuffle, limit: opts.limit }));
    scrollTop();
  }
  function quitQuiz() {
    const st = s.quiz;
    if (!st) return;
    if (isFinished(st)) return setQuiz(null);
    setQuiz(quizProgress(st).answered ? finishQuiz(st, Date.now()) : null);
  }
  function nextInQuiz() {
    const st = s.quiz;
    if (!st || isFinished(st)) return;
    setQuiz(currentQuestion(st) ? nextQuiz(st, Date.now()) : finishQuiz(st, Date.now()));
  }
  function setWordQuiz(next) {
    const prev = s.wordQuiz;
    s.wordQuiz = next;
    if (next && isWordQuizFinished(next) && !(prev && prev.id === next.id && isWordQuizFinished(prev))) {
      void saveWordResults(next, Date.now()).catch((error) => console.warn("Rulecard: couldn't save word quiz results", error));
    }
    ctx.rerender();
  }
  async function startWordQuiz(n) {
    s.wordQuizN = n;
    const record = await readWordRecord().catch(() => ({}));
    setWordQuiz(createWordQuiz(collectWords(s.log), record, { now: Date.now(), n }));
    window.scrollTo({ top: 0 });
  }
  function quitWordQuiz() {
    const st = s.wordQuiz;
    if (st && !isWordQuizFinished(st) && wordQuizProgress(st).answered) setWordQuiz(finishWordQuiz(st, Date.now()));
    else setWordQuiz(null);
  }
  function pressWordQuizKey(key) {
    const st = s.wordQuiz;
    if (!st) return false;
    if (key === "Escape") {
      quitWordQuiz();
      return true;
    }
    const k = wordQuizKey(key);
    if (!k) return false;
    if (isWordQuizFinished(st)) {
      if (key !== "Enter") return false;
      setWordQuiz(null);
      return true;
    }
    const answered = !currentWord(st) || currentWordAnswer(st) !== null;
    if (k === "next") {
      if (!answered) return false;
      setWordQuiz(nextWord(st, Date.now()));
      return true;
    }
    if (answered) return false;
    setWordQuiz(answerWord(st, k, Date.now()));
    return true;
  }
  function renderWordQuizSlot() {
    const st = s.wordQuiz;
    if (!st) return null;
    if (isWordQuizFinished(st)) {
      return renderWordQuizResult(wordQuizSummary(st), { again: () => void startWordQuiz(s.wordQuizN), done: () => setWordQuiz(null) });
    }
    return renderWordQuiz(st, {
      pick: (l) => {
        if (!currentWordAnswer(st)) setWordQuiz(answerWord(st, l, Date.now()));
      },
      next: () => setWordQuiz(nextWord(st, Date.now())),
      quit: quitWordQuiz
    });
  }
  function renderWordBankCard() {
    const words = collectWords(s.log);
    const card = renderWordBank(words, { download: downloadText });
    if (words.length && !s.wordQuiz) card.append(renderWordQuizEntry(wordQuizAvailability(words), { start: (n) => void startWordQuiz(n) }));
    return card;
  }
  function pressQuizKey(key) {
    const st = s.quiz;
    if (!st) return false;
    if (key === "Escape") {
      quitQuiz();
      return true;
    }
    const k = quizKey(key);
    if (!k) return false;
    if (isFinished(st)) {
      if (key !== "Enter") return false;
      setQuiz(null);
      return true;
    }
    const answered = !currentQuestion(st) || currentAnswer(st) !== null;
    if (k === "next") {
      if (!answered) return false;
      nextInQuiz();
      return true;
    }
    if (answered) return false;
    setQuiz(answerQuiz(st, k, Date.now()));
    return true;
  }
  async function explainQuizMiss(q, picked) {
    const st = s.quiz;
    if (!st || s.quizBusy) return;
    const qi = st.questions.findIndex((x) => x === q || q.qbId !== null && x.qbId === q.qbId);
    s.quizBusy = true;
    s.quizPaused = true;
    ctx.rerender();
    try {
      const image = await renderQuestionImage(toParsedQB(q));
      s.quizSeconds = qi >= 0 ? st.answers[qi]?.seconds ?? null : null;
      await captureHost.processImage(image);
      host.pick?.(picked);
      host.explain?.();
    } catch (error) {
      s.quizSeconds = null;
      s.quizPaused = false;
      toast(ctx.describe(error));
    } finally {
      s.quizBusy = false;
      ctx.rerender();
    }
  }
  function renderQuizSlot() {
    const st = s.quiz;
    if (!st) return null;
    const done = isFinished(st);
    if (s.quizPaused) {
      const p = quizProgress(st);
      return h(
        "div",
        { class: "rc-setbar active rc-quiz-strip row between small" },
        h(
          "span",
          null,
          h("b", { text: "Question Bank practice" }),
          h("span", { class: "muted", text: s.quizBusy ? " \xB7 getting the question ready..." : done ? " \xB7 results saved" : ` \xB7 paused at ${p.number} of ${p.total}` })
        ),
        h("button", {
          class: "btn small",
          disabled: s.quizBusy,
          onclick: () => {
            s.quizPaused = false;
            setQuiz(done ? st : resumeQuiz(st, Date.now()));
            scrollTop();
          }
        }, done ? "Back to results" : "Back to quiz")
      );
    }
    const explain2 = (q, picked) => void explainQuizMiss(q, picked);
    if (done) {
      return renderQuizResult(quizSummary(st), {
        retry: () => {
          if (s.quiz) setQuiz(retryMisses(s.quiz, Date.now()));
          scrollTop();
        },
        done: () => setQuiz(null),
        explain: explain2
      });
    }
    return renderQuiz(st, {
      pick: (l) => {
        if (s.quiz) setQuiz(answerQuiz(s.quiz, l, Date.now()));
      },
      next: nextInQuiz,
      skip: () => {
        if (s.quiz) setQuiz(skipQuiz(s.quiz, Date.now()));
      },
      quit: quitQuiz,
      explain: explain2
    });
  }
  function renderQuizEntryCard() {
    if (!s.prefs.qbQuiz || s.quiz) return null;
    const e = s.quizEntry;
    const last = s.quizHistory[0] ?? null;
    const entry = renderQuizEntry({ text: e.text, preview: e.parsed ? previewOf(e.parsed) : null, last }, {
      input: (text2) => {
        e.text = text2;
        e.parsed = text2.trim() ? parseExport(text2) : null;
        return e.parsed ? previewOf(e.parsed) : null;
      },
      start: startQuiz
    });
    return h(
      "details",
      { class: "card rc-quiz-box", open: e.open ? "" : null, ontoggle: (ev) => {
        e.open = ev.target.open;
      } },
      h(
        "summary",
        null,
        h("h2", { text: "Practice a Question Bank export" }),
        h("span", { class: "small muted", text: last ? `last: ${last.right} of ${last.total}` : "offline quiz" })
      ),
      entry
    );
  }
  async function beginSet(target) {
    s.sets = startSet(target, Date.now());
    await writeSets(s.sets);
    if (s.prefs.timer) {
      s.timer = { ...emptyTimer(), startedAt: Date.now() };
      await writeTimer(s.timer);
    }
    ctx.rerender();
  }
  async function finishSet() {
    s.sets = endSet(s.sets, s.log, Date.now());
    await writeSets(s.sets);
    ctx.rerender();
  }
  async function dismissRecap() {
    s.sets = { ...s.sets, recap: null };
    await writeSets(s.sets);
    ctx.rerender();
  }
  function renderPlanCard() {
    if (!s.prefs.plan || s.review.open) return null;
    const plan = buildPlan({ log: s.log, srs: s.srs, now: Date.now(), dailyGoal: s.prefs.dailyGoal, testDate: s.prefs.testDate });
    return renderPlan(plan, {
      startReview: () => void startReview(),
      openFlashcards: s.prefs.practice ? () => openPractice({ mode: "flashcards", deck: createDeck(s.log, s.srs, Date.now()) }) : void 0,
      startSet: s.sets.active ? void 0 : (n) => void beginSet(n),
      copy: (text2) => void navigator.clipboard.writeText(text2).then(() => toast("Plan copied"), () => toast("Couldn't copy"))
    });
  }
  function renderSetStrip() {
    const a = s.sets.active;
    if (!a) {
      if (s.sets.recap) return null;
      return h(
        "div",
        { class: "rc-setbar row between small" },
        h("span", { class: "muted", text: "Practice set" }),
        h("span", { class: "row" }, ...[5, 10, 20].map((n) => h("button", { class: "btn small", text: `${n}`, title: `Start a ${n}-question set`, onclick: () => void beginSet(n) })))
      );
    }
    const ids = new Set(a.attemptIds);
    const mine = s.log.filter((e) => ids.has(e.attemptId));
    const missed = mine.filter((e) => e.result === "missed").length;
    const pctDone = Math.round(a.attemptIds.length / a.target * 100);
    return h(
      "div",
      { class: "rc-setbar active" },
      h(
        "div",
        { class: "row between small" },
        h("span", null, h("b", { text: `Set ${a.attemptIds.length}/${a.target}` }), h("span", { class: "muted", text: ` \xB7 ${missed} missed \xB7 ${formatClock((Date.now() - a.startedAt) / 1e3)} elapsed` })),
        h("button", { class: "btn link small", text: "End set", onclick: () => void finishSet() })
      ),
      h("div", { class: "rc-goal" }, h("span", { style: `width:${pctDone}%` }))
    );
  }
  function renderRecap() {
    const r = s.sets.recap;
    if (!r) return null;
    const ids = new Set(r.attemptIds);
    const entries = s.log.filter((e) => ids.has(e.attemptId));
    const target = entries.length ? entries.reduce((a, e) => a + targetSecondsFor(e), 0) / entries.length : TARGET_SECONDS;
    const tone = r.accuracy >= 0.8 ? "good" : r.accuracy >= 0.6 ? "accent" : "warn";
    return h(
      "div",
      { class: `card rc-recap ${tone}` },
      h("div", { class: "row between" }, h("h2", { text: "Set complete" }), h("button", { class: "btn link small", text: "Dismiss", onclick: () => void dismissRecap() })),
      h(
        "div",
        { class: "rc-tiles" },
        h("div", { class: "rc-tile" }, h("span", { class: "rc-tile-value", text: `${r.right}/${r.count}` }), h("span", { class: "rc-tile-label", text: "right" })),
        h("div", { class: "rc-tile" }, h("span", { class: "rc-tile-value", text: `${Math.round(r.accuracy * 100)}%` }), h("span", { class: "rc-tile-label", text: "accuracy" })),
        h("div", { class: `rc-tile ${r.avgSeconds !== null && r.avgSeconds > target ? "" : "good"}`.trim() }, h("span", { class: "rc-tile-value", text: r.avgSeconds === null ? "\u2013" : `${r.avgSeconds}s` }), h("span", { class: "rc-tile-label", text: "avg pace" })),
        h("div", { class: "rc-tile" }, h("span", { class: "rc-tile-value", text: `${r.minutes}m` }), h("span", { class: "rc-tile-label", text: "total" }))
      ),
      r.missedRules.length ? h("div", null, h("p", { class: "small", text: "Rules to fix:" }), h("div", { class: "row rc-wrap" }, ...r.missedRules.map((m) => chip(`${m.ruleName ? `${m.ruleId} \xB7 ${m.ruleName}` : m.ruleId}${m.misses > 1 ? ` \xD7${m.misses}` : ""}`, "danger")))) : h("p", { class: "small", text: "No misses. Clean set." }),
      h(
        "div",
        { class: "row rc-wrap" },
        r.missedRules.length ? h("button", { class: "btn primary small", text: "Review these rules", onclick: () => void startReview(r.missedRules[0].ruleId) }) : null,
        h("button", { class: "btn small", text: "Print this set", onclick: () => entries.length && openPrintable(toPrintableHtml(entries, `Rulecard set \xB7 ${new Date(r.endedAt).toLocaleDateString()}`)) }),
        h("button", { class: "btn small", text: "Another set", onclick: () => void beginSet(r.count || 10) })
      )
    );
  }
  function renderQuestionExtras(q) {
    const out = [];
    if (s.prefs.seenBefore) out.push(seen.render(s.log, q, { excludeAttemptIds: [host.getExplained()?.attemptId] }));
    const st = s.prefs.strategies ? strategyFor(q.skill) : null;
    if (!st) return out;
    out.push(h(
      "details",
      { class: "rc-strategy", open: s.strategyOpen ? "" : null, ontoggle: (ev) => {
        s.strategyOpen = ev.target.open;
      } },
      h("summary", { class: "small", text: `How to attack ${st.skill}` }),
      h("ol", { class: "steps small" }, ...st.steps.map((t) => h("li", { text: t }))),
      h("p", { class: "small muted" }, h("b", { text: "Traps: " }), st.traps.join(" \xB7 "))
    ));
    return out;
  }
  function renderPickExtras() {
    if (!s.prefs.askConfidence) return [];
    return [h(
      "div",
      { class: "rc-confidence row rc-wrap", role: "radiogroup", "aria-label": "How sure were you?" },
      h("span", { class: "small muted", text: "How sure were you?" }),
      ...CONFIDENCE.map((c) => h("button", {
        class: `btn small ${s.confidence === c.key ? "on" : ""}`.trim(),
        role: "radio",
        "aria-checked": String(s.confidence === c.key),
        title: c.hint,
        text: c.label,
        onclick: () => {
          s.confidence = s.confidence === c.key ? null : c.key;
          ctx.rerender();
        }
      }))
    )];
  }
  const currentEntry = () => {
    const ex = host.getExplained();
    return ex ? s.log.find((e) => e.attemptId === ex.attemptId) ?? null : null;
  };
  async function copyCurrentCard() {
    const e = currentEntry();
    if (!e) return;
    try {
      await navigator.clipboard.writeText(cardAsText(e));
      toast("Rule card copied");
    } catch {
      toast("Couldn't copy");
    }
  }
  function speak(text2) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text2);
    u.rate = 1.02;
    speechSynthesis.speak(u);
  }
  let noteTimer = null;
  let noteDraft = null;
  function renderCardTools() {
    const e = currentEntry();
    if (!e) return null;
    const note = h("textarea", { id: `rc-note-${e.attemptId}`, class: "input rc-note", rows: "2", placeholder: "Your own note on this mistake (saved on this device, goes into exports)" });
    note.value = noteDraft?.attemptId === e.attemptId ? noteDraft.value : e.note;
    note.addEventListener("input", () => {
      noteDraft = { attemptId: e.attemptId, value: note.value };
      if (noteTimer) clearTimeout(noteTimer);
      noteTimer = setTimeout(async () => {
        const value = note.value;
        await updateEntry(e.attemptId, { note: value }).catch(() => null);
        e.note = value;
        if (noteDraft?.attemptId === e.attemptId && noteDraft.value === value) noteDraft = null;
      }, 400);
    });
    const dueInfo = s.srs[e.ruleId];
    return h(
      "div",
      { class: "card rc-tools" },
      h(
        "div",
        { class: "row rc-wrap" },
        h("button", { class: "btn small", onclick: () => void copyCurrentCard(), title: "Y" }, "Copy card"),
        h("button", { class: "btn small", onclick: () => speak(`${e.ruleName ?? ""}. ${e.ruleStatement}. Takeaway: ${e.takeaway}`) }, "Read aloud"),
        h("button", {
          class: `btn small ${e.starred ? "on" : ""}`.trim(),
          "aria-pressed": String(e.starred),
          onclick: async () => {
            await updateEntry(e.attemptId, { starred: !e.starred });
            e.starred = !e.starred;
            ctx.rerender();
          }
        }, e.starred ? "\u2605 Starred" : "\u2606 Star"),
        e.seconds !== null ? chip(`${e.seconds}s`, e.seconds > targetSecondsFor(e) ? "warn" : "good") : null,
        e.selfConfidence === "sure" && e.result === "missed" ? chip("sure but wrong", "danger") : null,
        dueInfo ? chip(`review ${describeDue(dueInfo.due, Date.now())}`) : null
      ),
      note
    );
  }
  function openImage(dataUrl) {
    void fetch(dataUrl).then((r) => r.blob()).then((b) => {
      const url = URL.createObjectURL(b);
      void chrome.tabs.create({ url });
      setTimeout(() => URL.revokeObjectURL(url), 6e4);
    });
  }
  function renderCaptureExtras() {
    const out = [];
    if (s.cropping) {
      const c = s.cropping;
      out.push(renderCropper(c.image, (img) => {
        s.cropping = null;
        c.resolve(img);
        ctx.rerender();
      }));
    }
    out.push(selection.render());
    if (s.prefs.pastePanel) out.push(paste.render());
    out.push(renderSetStrip());
    if (s.prefs.timer) out.push(renderTimer(s.timer, { reset: async () => {
      s.timer = emptyTimer();
      await writeTimer(s.timer);
      ctx.rerender();
    } }, targetSecondsFor(host.getQuestion())));
    if (s.lastSent?.kind === "text" && host.getQuestion())
      out.push(h("p", { class: "small muted row" }, chip("read from page text", "good"), "No screenshot needed. ", h("button", { class: "btn link small", text: "See what was sent", onclick: () => s.lastSent && openImage(s.lastSent.image) })));
    if (s.pageWarning)
      out.push(h(
        "div",
        { class: "banner warn", role: "alert" },
        h("p", { text: s.pageWarning }),
        h("button", { class: "btn small", style: "margin-top:6px", text: "Capture anyway", onclick: () => {
          s.captureAnyway = true;
          s.pageWarning = null;
          host.capture?.();
        } })
      ));
    for (const w of s.checkWarnings) out.push(h("div", { class: "banner warn", role: "alert", text: w }));
    return out;
  }
  async function doExport(kind, scope) {
    const entries = filterScope(s.log, scope);
    if (!entries.length && kind !== "backup") {
      toast("Nothing to export yet");
      return;
    }
    if (kind === "anki") downloadText(`rulecard-anki-${scope}-${stamp()}.csv`, toAnkiCsv(entries), "text/csv");
    if (kind === "md") downloadText(`rulecard-notes-${scope}-${stamp()}.md`, toMarkdown(entries), "text/markdown");
    if (kind === "print") openPrintable(toPrintableHtml(entries));
    if (kind === "backup") downloadText(`rulecard-backup-${stamp()}.json`, toBackup(s.log), "application/json");
  }
  async function doImport(file) {
    try {
      const added = await importEntries(parseBackup(await file.text()));
      s.log = await readLog();
      s.srs = rebuildFromLog(s.log);
      await writeSrs(s.srs);
      recompute();
      s.badges = (await syncBadges(badgeInput())).badges;
      toast(`Imported ${added} question${added === 1 ? "" : "s"}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Import failed");
    }
  }
  async function share() {
    if (!s.summary) return;
    try {
      const img = await renderShareImage(s.summary, countdown(s.prefs.testDate, s.summary));
      downloadDataUrl(`rulecard-progress-${stamp()}.png`, img);
      toast("Progress image saved");
    } catch {
      toast("Couldn't make the image");
    }
  }
  async function setPref(key, value) {
    if (key === "reminders" && value === true) {
      const granted = await chrome.permissions.request({ permissions: ["notifications"] }).catch(() => false);
      if (!granted) {
        toast("Reminders need notification permission");
        return;
      }
    }
    s.prefs = { ...s.prefs, [key]: value };
    await writePrefs(s.prefs);
    if (key === "hotkeys") {
      unhook?.();
      unhook = value ? installHotkeys(hotkeyActions) : null;
    }
    if (key === "zoom") applyZoom();
    ctx.rerender();
  }
  function renderSettings() {
    const toggle = (key, label, hint) => h(
      "label",
      { class: "rc-toggle" },
      h("input", { type: "checkbox", checked: Boolean(s.prefs[key]), onchange: (ev) => void setPref(key, ev.target.checked) }),
      h("span", null, h("span", { text: label }), h("span", { class: "muted small", text: hint }))
    );
    const exportScope = h(
      "select",
      { id: "rc-export-scope", class: "input rc-select" },
      h("option", { value: "missed", text: "Missed questions" }),
      h("option", { value: "starred", text: "Starred" }),
      h("option", { value: "all", text: "Everything" })
    );
    const scope = () => document.getElementById("rc-export-scope")?.value ?? "missed";
    const fileInput = h("input", { type: "file", accept: "application/json,.json", hidden: "", onchange: (ev) => {
      const f = ev.target.files?.[0];
      if (f) void doImport(f);
    } });
    const goal = h("input", { class: "input rc-num", type: "number", min: "1", max: "100", value: String(s.prefs.dailyGoal), onchange: (ev) => void setPref("dailyGoal", Math.max(1, Math.min(100, Number(ev.target.value) || 10))) });
    const hour = h("input", { class: "input rc-num", type: "number", min: "0", max: "23", value: String(s.prefs.reminderHour), onchange: (ev) => void setPref("reminderHour", Math.max(0, Math.min(23, Number(ev.target.value) || 19))) });
    const testDate = h("input", { class: "input rc-date", type: "date", value: s.prefs.testDate ?? "", onchange: (ev) => void setPref("testDate", ev.target.value || null) });
    const zoom = h(
      "select",
      { class: "input rc-select", onchange: (ev) => void setPref("zoom", Number(ev.target.value) || 1) },
      ...[[0.9, "Small"], [1, "Normal"], [1.1, "Large"], [1.25, "Extra large"]].map(([v, l]) => h("option", { value: String(v), text: String(l) }))
    );
    zoom.value = String(s.prefs.zoom || 1);
    return h(
      "details",
      { class: "card rc-settings", open: s.showSettings ? "" : null, ontoggle: (ev) => {
        s.showSettings = ev.target.open;
      } },
      h("summary", null, h("h2", { text: "Export & settings" })),
      h(
        "section",
        null,
        h("h2", { text: "Export" }),
        h("div", { class: "row rc-wrap" }, exportScope),
        h(
          "div",
          { class: "row rc-wrap" },
          h("button", { class: "btn small", text: "Anki deck (.csv)", onclick: () => void doExport("anki", scope()) }),
          h("button", { class: "btn small", text: "Notes (.md)", onclick: () => void doExport("md", scope()) }),
          h("button", { class: "btn small", text: "Print / PDF", onclick: () => void doExport("print", scope()) }),
          h("button", { class: "btn small", text: "Progress image", onclick: () => void share() })
        ),
        h(
          "div",
          { class: "row rc-wrap" },
          h("button", { class: "btn small", text: "Error log (.csv)", title: "The mistake spreadsheet tutors ask for. Opens in Excel or Numbers.", onclick: () => downloadText(errorLogFilename(scope(), Date.now()), toErrorLogCsv(errorLogRows(s.log, { scope: scope(), srs: s.srs })), "text/csv") }),
          h("button", { class: "btn small", text: "Copy for Google Sheets", onclick: () => void navigator.clipboard.writeText(toErrorLogTsv(errorLogRows(s.log, { scope: scope(), srs: s.srs }))).then(() => toast("Error log copied. Paste it into cell A1."), () => toast("Couldn't copy")) })
        ),
        renderReportTools(() => buildWeeklyReport(s.log, s.srs, Date.now()), { notify: toast })
      ),
      h(
        "section",
        null,
        h("h2", { text: "Capture" }),
        toggle("textCapture", "Read the page text", "On the Question Bank, send a clean copy of the question instead of a screenshot. No icon click needed."),
        toggle("pageCheck", "Check the page first", "Catches a hidden answer before you spend a capture, and flags misreads."),
        toggle("cropBeforeSend", "Crop screenshots", "Box just the question before sending (screenshots only)."),
        toggle("pastePanel", "Paste box", "Shows Paste a question under Capture, for text or a screenshot from any site.")
      ),
      h(
        "section",
        null,
        h("h2", { text: "Practice" }),
        toggle("askConfidence", "Ask how sure I was", "Tracks overconfidence. Misses you were sure about are misconceptions."),
        toggle("strategies", "Show attack strategies", "A short method for each question type."),
        toggle("seenBefore", "Flag repeats", "Says when a question is already in your log, with your old card."),
        toggle("practice", "Offline practice", "Rule flashcards and redo my misses. No connection needed."),
        toggle("qbQuiz", "Question Bank export quiz", "Paste an exported Question Bank PDF and practice it here, graded with the official answer key."),
        toggle("timer", "Pacing timer", `Times each question between captures. Target ${TARGET_SECONDS}s for Reading and Writing, ${MATH_TARGET_SECONDS}s for Math.`),
        toggle("hotkeys", "Keyboard shortcuts", "Press ? in the panel to see them."),
        toggle("autoSpeak", "Read the rule aloud", "Speaks each new rule card."),
        h("label", { class: "rc-toggle" }, h("span", { text: "Daily goal" }), goal, h("span", { class: "muted small", text: "questions" })),
        h("label", { class: "rc-toggle" }, h("span", { text: "My SAT date" }), testDate),
        toggle("reminders", "Daily reminder", "A notification if you haven't practiced by the hour below."),
        s.prefs.reminders ? h("label", { class: "rc-toggle" }, h("span", { text: "Remind at" }), hour, h("span", { class: "muted small", text: ":00 (24h)" })) : null,
        h("label", { class: "rc-toggle" }, h("span", { text: "Text size" }), zoom)
      ),
      h(
        "section",
        null,
        h("h2", { text: "Coach" }),
        toggle("plan", "Today's plan", "A daily checklist: due reviews, your weakest skills with Question Bank filters, timed sets as the test gets close."),
        toggle("skillMap", "Skill map", "All 29 SAT skills colored by how you do, with the Question Bank filters for each."),
        toggle("wordBank", "Word bank", "The Words in Context words from your cards, with your mix-ups, a word quiz and an Anki export."),
        toggle("activity", "Activity calendar", "A 16-week heatmap of your practice against your daily goal, with streaks."),
        toggle("badges", "Badges", "Milestones for streaks, mastered rules and steady habits.")
      ),
      h(
        "section",
        null,
        h("h2", { text: "Your data (on this device)" }),
        h("p", { class: "muted small", text: `${s.log.length} questions saved locally for stats, review and export. Your account history on the web app is separate.` }),
        h(
          "div",
          { class: "row rc-wrap" },
          h("button", { class: "btn small", text: "Back up", onclick: () => void doExport("backup", "all") }),
          h("button", { class: "btn small", text: "Restore", onclick: () => fileInput.click() }),
          h("button", { class: "btn small danger", text: "Erase local data", onclick: async () => {
            if (!confirm("Erase the local stats, review schedule, notes and quiz history? Your account history is not affected.")) return;
            await clearLog();
            s.log = [];
            s.srs = {};
            await writeSrs(s.srs);
            s.redoStore = {};
            await writeRedo(s.redoStore);
            s.sets = emptySets();
            await writeSets(s.sets);
            s.badges = {};
            await writeBadges(s.badges);
            s.quiz = null;
            s.quizPaused = false;
            s.quizHistory = [];
            await writeQuizStore({ active: null, history: [] });
            s.wordQuiz = null;
            await writeWordRecord({});
            recompute();
            ctx.rerender();
          } }),
          fileInput
        )
      )
    );
  }
  function renderHelp() {
    if (!s.showHelp) return null;
    return h(
      "div",
      { class: "rc-overlay", onclick: toggleHelp },
      h(
        "div",
        { class: "card rc-help", onclick: (ev) => ev.stopPropagation() },
        h("div", { class: "row between" }, h("h2", { text: "Keyboard shortcuts" }), h("button", { class: "btn link small", text: "Close", onclick: toggleHelp })),
        h("dl", null, ...HOTKEY_HELP.flatMap(([k, v]) => [h("dt", null, h("kbd", { text: k })), h("dd", { text: v })])),
        h("p", { class: "muted small", text: "Alt+Shift+R captures the tab from anywhere in Chrome. On any site, select a question, right-click and choose Explain this question with Rulecard." })
      )
    );
  }
  function renderBottom() {
    const cd = s.summary ? countdown(s.prefs.testDate, s.summary) : null;
    return [
      s.summary ? renderProgress(s.summary, insights(s.summary, due().length), s.prefs.dailyGoal, (path2) => void ctx.openWeb(path2), { countdown: cd, onShare: () => void share() }) : null,
      s.prefs.activity && s.log.length ? renderCalendar(activityModel(s.log, { now: Date.now(), dailyGoal: s.prefs.dailyGoal })) : null,
      renderQuizEntryCard(),
      s.prefs.skillMap ? renderSkillMap(skillMap(s.log)) : null,
      s.prefs.wordBank ? renderWordBankCard() : null,
      renderTraps(trapReport(s.log)),
      s.prefs.badges ? renderBadges(badgeProgress(badgeInput(), s.badges)) : null,
      s.log.length ? renderJournal(s.log, s.journal, {
        change: (f) => {
          s.journal = f;
          ctx.rerender();
        },
        openWeb: (path2) => void ctx.openWeb(path2),
        toggleStar: async (e) => {
          await updateEntry(e.attemptId, { starred: !e.starred });
          s.log = await readLog();
          ctx.rerender();
        },
        reviewRule: (ruleId) => void startReview(ruleId)
      }, ctx.rerender) : null,
      renderSettings(),
      renderHelp(),
      s.toast ? h("div", { class: "rc-toast", role: "status", text: s.toast }) : null
    ];
  }
  return {
    ready,
    state: s,
    // hooks
    beforeCapture,
    tryTextCapture,
    transformImage,
    afterExtract,
    afterExplain,
    afterDrillCheck,
    startReview,
    // render slots
    renderAboveCapture: () => s.wordQuiz ? [renderWordQuizSlot()] : s.practice ? [renderPractice()] : s.quiz ? [renderQuizSlot()] : [renderRecap(), renderPlanCard(), renderReview(), renderPractice()],
    renderInCapture: renderCaptureExtras,
    renderQuestionExtras,
    renderPickExtras,
    renderAfterRuleCard: () => [renderCardTools()],
    renderBottom,
    /** While a review is open, the host can hide the capture/question flow if it wants a focused screen. */
    isReviewing: () => s.review.open,
    /** True while the cropper is waiting on the user (capture() is still "in flight"). */
    isCropping: () => Boolean(s.cropping),
    /** True while a flashcard deck, a redo session or a Question Bank export quiz is on screen. */
    isPracticing: () => Boolean(s.practice) || Boolean(s.wordQuiz) || Boolean(s.quiz) && !s.quizPaused,
    destroy: () => {
      unhook?.();
      selection.stop();
    }
  };
}

// extension/src/sidepanel.ts
var state = {
  view: "loading",
  settings: { server: DEFAULT_SERVER, token: null },
  connectError: null,
  connecting: false,
  authMode: "signin",
  recent: null,
  health: null,
  shortcut: null,
  capturing: false,
  captureError: null,
  needsAllSites: false,
  question: null,
  picked: null,
  allowSolve: false,
  explaining: false,
  explainError: null,
  sprInput: "",
  explained: null,
  chat: { messages: [], busy: false, error: null },
  drill: emptyDrill()
};
function emptyDrill() {
  return { data: null, picked: null, response: "", result: null, loading: false, error: null };
}
var DIAGNOSIS = {
  misread: { label: "misread the sentence", tone: "warn" },
  rule_gap: { label: "rule gap", tone: "danger" },
  careless: { label: "careless slip", tone: "warn" },
  got_it_right: { label: "you got it", tone: "good" },
  unknown: { label: "no reasoning given", tone: "" }
};
function h2(tag, props = null, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === void 0 || value === null || value === false) continue;
      if (key === "class") el.className = String(value);
      else if (key === "text") el.textContent = String(value);
      else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === "checked" || key === "disabled" || key === "value") el[key] = value;
      else el.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === void 0 || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return el;
}
var chip2 = (text2, tone = "") => h2("span", { class: `chip ${tone}`.trim(), text: text2 });
function mathEl(tag, text2, props = null) {
  const el = h2(tag, props);
  el.innerHTML = renderMathHtml(text2);
  return el;
}
var isMathQuestion = (q) => q?.section === "math";
var isGridIn2 = (q) => q?.format === "spr";
var spinner2 = () => h2("span", { class: "spinner", "aria-label": "working" });
function link(href, text2, cls = "") {
  return h2("a", { href, target: "_blank", rel: "noreferrer", class: cls, text: text2 });
}
var app = () => document.getElementById("app");
function render3() {
  const active = document.activeElement;
  const keep = active && active.id && "value" in active ? { id: active.id, value: active.value, start: active.selectionStart, end: active.selectionEnd } : null;
  const inputs = {};
  for (const el of app().querySelectorAll("input[id], textarea[id]")) inputs[el.id] = el.value;
  const root = app();
  root.replaceChildren(...state.view === "connect" ? renderConnect() : state.view === "main" ? renderMain() : [h2("p", { class: "muted", text: "Loading..." })]);
  for (const [id, value] of Object.entries(inputs)) {
    const el = document.getElementById(id);
    if (el && el.type !== "checkbox" && !el.value) el.value = value;
  }
  if (keep) {
    const el = document.getElementById(keep.id);
    if (el) {
      el.focus({ preventScroll: true });
      try {
        if (keep.start !== null && keep.end !== null) el.setSelectionRange(keep.start, keep.end);
      } catch {
      }
    }
  }
}
function renderConnect() {
  const signup = state.authMode === "signup";
  const submitOnEnter = (event) => {
    if (event.key === "Enter") void connect();
  };
  const email = h2("input", { id: "email", class: "input", type: "email", placeholder: "you@example.com", autocomplete: "email", value: state.settings.email ?? "", onkeydown: submitOnEnter });
  const password = h2("input", {
    id: "password",
    class: "input",
    type: "password",
    placeholder: signup ? "At least 8 characters" : "Password",
    autocomplete: signup ? "new-password" : "current-password",
    onkeydown: submitOnEnter
  });
  const server = h2("input", { id: "server", class: "input", type: "url", placeholder: DEFAULT_SERVER, value: state.settings.server === DEFAULT_SERVER ? "" : state.settings.server, autocomplete: "url" });
  const tab = (mode, label) => h2("button", {
    class: `tab${state.authMode === mode ? " active" : ""}`,
    role: "tab",
    "aria-selected": String(state.authMode === mode),
    text: label,
    onclick: () => {
      state.authMode = mode;
      state.connectError = null;
      render3();
    }
  });
  return [
    h2(
      "div",
      { class: "card" },
      h2("h1", { text: "Rulecard" }),
      h2("p", { class: "muted small", text: "Capture a Reading and Writing or Math question from the Question Bank and learn the one rule it tested. Your history is saved to your account, on the web app too." }),
      h2("div", { class: "tabs", role: "tablist" }, tab("signin", "Sign in"), tab("signup", "Create account")),
      h2("label", { class: "field" }, "Email", email),
      h2("label", { class: "field" }, "Password", password),
      state.connectError ? h2("div", { class: "banner danger", role: "alert", text: state.connectError }) : null,
      h2(
        "button",
        { class: "btn primary big", disabled: state.connecting, onclick: () => void connect() },
        state.connecting ? spinner2() : null,
        signup ? "Create account" : "Sign in"
      ),
      h2("details", { class: "small muted" }, h2("summary", { text: "Use a different server" }), h2("label", { class: "field" }, "Server address (leave empty for the default)", server)),
      h2("p", { class: "muted small" }, link(`${DEFAULT_SERVER}/privacy`, "Privacy"))
    )
  ];
}
async function connect() {
  const value = (id) => document.getElementById(id)?.value ?? "";
  const email = value("email").trim();
  const password = value("password");
  let server;
  try {
    server = normalizeServer(value("server"));
  } catch {
    state.connectError = "That server address does not look right.";
    render3();
    return;
  }
  if (!email || !password) {
    state.connectError = "Enter your email and password.";
    render3();
    return;
  }
  state.connecting = true;
  state.connectError = null;
  render3();
  try {
    if (server !== DEFAULT_SERVER) {
      const origin = `${server}/*`;
      const has = await chrome.permissions.contains({ origins: [origin] });
      if (!has) {
        const granted = await chrome.permissions.request({ origins: [origin] });
        if (!granted) throw new Error(`Rulecard needs permission to talk to ${server}.`);
      }
    }
    const { token, user } = await authenticate(server, state.authMode, email, password);
    state.settings = { server, token, email: user.email };
    await saveSettings(state.settings);
    state.view = "main";
    void refreshRecent();
    await refreshHealth();
  } catch (error) {
    state.connectError = describe(error);
  } finally {
    state.connecting = false;
    render3();
  }
}
async function openWeb(path2) {
  try {
    await chrome.tabs.create({ url: await webLink(state.settings, path2) });
  } catch (error) {
    if (await handleAuthFailure(error)) return;
    await chrome.tabs.create({ url: state.settings.server + path2 });
  }
}
async function refreshRecent() {
  try {
    const data = await request(state.settings, "/api/attempts?limit=5");
    state.recent = data.attempts;
  } catch (error) {
    if (await handleAuthFailure(error)) return;
    state.recent = null;
  }
  render3();
}
async function signOut() {
  state.settings = { ...state.settings, token: null };
  await saveSettings(state.settings);
  resetQuestion();
  state.health = null;
  state.recent = null;
  state.view = "connect";
  state.connectError = null;
  render3();
}
function renderMain() {
  const nodes = [renderHeader(), ...addons.renderAboveCapture(), renderCapture()];
  if (state.question) nodes.push(renderQuestion(state.question));
  else nodes.push(renderHowTo());
  if (!state.question && state.recent?.length) nodes.push(renderRecent(state.recent));
  if (state.explained) {
    nodes.push(renderRuleCard(state.explained.card, state.explained.picked, state.explained.ruleName));
    nodes.push(...addons.renderAfterRuleCard());
    nodes.push(renderChat());
  }
  nodes.push(...addons.renderBottom());
  nodes.push(renderFooter());
  return nodes.filter((n) => Boolean(n));
}
function renderHeader() {
  const health = state.health;
  let dot = "";
  let title = "Checking the server...";
  if (health) {
    if (!health.db.ok) {
      dot = "danger";
      title = "Database unreachable";
    } else if (health.ai.live || health.ai.stub || health.ai.configured.length) {
      dot = "good";
      title = `AI: ${health.ai.live ?? health.ai.configured[0] ?? "stub"} \xB7 database ok`;
    } else {
      dot = "warn";
      title = "No AI key on the server yet (add OPENAI_API_KEY or ANTHROPIC_API_KEY in Vercel)";
    }
  }
  return h2(
    "div",
    { class: "row between" },
    h2("div", { class: "row" }, h2("h1", { text: "Rulecard" }), h2("span", { class: `dot ${dot}`.trim(), title })),
    h2(
      "div",
      { class: "row small" },
      webButton("/history", "History"),
      webButton("/rules", "Rules"),
      h2("button", { class: "btn link small", title: state.settings.email ?? "", onclick: () => void signOut(), text: "Sign out" })
    )
  );
}
function webButton(path2, text2) {
  return h2("button", { class: "btn link small", text: text2, onclick: () => void openWeb(path2) });
}
function renderRecent(items) {
  return h2(
    "div",
    { class: "card" },
    h2("div", { class: "row between" }, h2("h2", { text: "Recent" }), webButton("/history", "All history")),
    ...items.map(
      (item) => h2(
        "button",
        { class: "recent", onclick: () => void openWeb(`/history/${item.id}`) },
        h2(
          "span",
          { class: "row" },
          chip2(item.result === "right" ? "right" : item.result === "missed" ? "missed" : "reviewed", item.result === "right" ? "good" : item.result === "missed" ? "danger" : ""),
          item.section ? chip2(item.section === "math" ? "Math" : "R&W") : null,
          h2("span", { class: "small muted", text: item.ruleName ?? item.skill ?? "" })
        ),
        mathEl("span", item.stem, { class: "recent-stem" })
      )
    )
  );
}
function renderCapture() {
  const hint = state.shortcut ? ["or press ", h2("kbd", { text: state.shortcut })] : ["(set a shortcut at chrome://extensions/shortcuts)"];
  const children = [
    h2("button", { class: "btn primary big", disabled: state.capturing, onclick: () => void capture() }, state.capturing ? spinner2() : null, state.capturing ? addons.isCropping() ? "Crop below, then send" : "Reading the question..." : state.question ? "Capture again" : "Capture this tab"),
    h2("p", { class: "muted small" }, "On the Question Bank tab, click the Rulecard toolbar icon once (that is Chrome's permission to read the tab), reveal the answer, then click Capture ", ...hint, ".")
  ];
  if (state.health && !state.health.ai.live && !state.health.ai.stub && state.health.ai.configured.length === 0) {
    children.push(h2("div", { class: "banner warn" }, "The server has no AI key yet, so capture will fail until you add OPENAI_API_KEY or ANTHROPIC_API_KEY in Vercel. ", link(`${state.settings.server}/health`, "Status page")));
  }
  children.push(...addons.renderInCapture());
  if (state.captureError) children.push(h2("div", { class: "banner danger", role: "alert", text: state.captureError }));
  if (state.needsAllSites) {
    children.push(h2("button", { class: "btn", onclick: () => void allowAllSites() }, "Allow capturing on all sites (no icon click needed)"));
  }
  return h2("div", { class: "card" }, ...children);
}
function renderHowTo() {
  return h2(
    "div",
    { class: "card" },
    h2("h2", { text: "How it works" }),
    h2(
      "ol",
      { class: "steps small" },
      h2("li", { text: "Work a Reading and Writing or Math question in the SAT Suite Question Bank and reveal the answer." }),
      h2("li", { text: "Press Capture. One picture of that tab is read; nothing is recorded." }),
      h2("li", { text: "Tell me what you picked or typed (and why). You get the one rule it tested, why your answer breaks it, and for Math the steps and a Desmos shortcut." }),
      h2("li", { text: "Ask follow-ups, or press Test me for a fresh question on the same rule." })
    )
  );
}
function renderQuestion(q) {
  const showAnswer = Boolean(state.explained);
  const picked = state.explained?.picked ?? null;
  const chips = h2(
    "div",
    { class: "row" },
    chip2(isMathQuestion(q) ? "Math" : "Reading and Writing"),
    isGridIn2(q) ? chip2("grid-in", "accent") : null,
    q.qbId ? chip2(`ID ${q.qbId}`) : null,
    q.domain ? chip2(q.domain, "accent") : null,
    q.skill ? chip2(q.skill, "accent") : null,
    q.difficulty ? chip2(q.difficulty) : null,
    q.answerSource === "model" ? chip2("answer solved by the model", "warn") : null
  );
  const children = [
    chips,
    q.passage ? mathEl("div", q.passage, { class: "passage" }) : null,
    q.figure ? h2("div", { class: "figure" }, h2("div", { class: "figure-label", text: "Figure (as read)" }), mathEl("div", q.figure)) : null,
    mathEl("p", q.stem, { class: "stem" })
  ];
  if (!isGridIn2(q) && q.choices) {
    const choices = q.choices;
    children.push(
      h2(
        "ol",
        { class: "choices" },
        ...LETTERS.map((letter) => {
          const isPick = picked === letter;
          const isCorrect = showAnswer && q.correct === letter;
          const cls = `choice ${isCorrect ? "correct" : isPick ? "picked" : ""}`.trim();
          return h2(
            "li",
            { class: cls },
            h2("span", { class: "letter", text: `${letter}.` }),
            mathEl("span", choices[letter]),
            isCorrect ? h2("span", { class: "tag good", text: "correct" }) : isPick ? h2("span", { class: "tag danger", text: "your pick" }) : null
          );
        })
      )
    );
  } else if (showAnswer && state.explained) {
    const ex = state.explained;
    const accepted = q.answers?.length ? q.answers.join(", ") : ex.card.correct_answer;
    children.push(
      h2(
        "div",
        { class: "spr-result" },
        ex.response ? h2("div", { class: `choice ${ex.isCorrect === true ? "correct" : ex.isCorrect === false ? "picked" : ""}`.trim() }, h2("span", { class: "letter", text: "You" }), h2("span", { text: ex.response }), ex.isCorrect === true ? h2("span", { class: "tag good", text: "correct" }) : ex.isCorrect === false ? h2("span", { class: "tag danger", text: "not accepted" }) : null) : null,
        accepted ? h2("div", { class: "choice correct" }, h2("span", { class: "letter", text: "Key" }), h2("span", { text: `Accepted: ${accepted}` })) : null
      )
    );
  }
  children.push(...addons.renderQuestionExtras(normalizeQuestion(q)));
  if (!state.explained) children.push(renderPickPanel(q));
  return h2("div", { class: "card" }, ...children);
}
function sprCheck() {
  if (!state.sprInput.trim()) return { ok: false, error: null };
  const entry = parseSprEntry(state.sprInput);
  return entry.ok ? { ok: true, error: null } : { ok: false, error: entry.error };
}
function renderPickPanel(q) {
  const gridIn = isGridIn2(q);
  const needsAnswer = gridIn ? !q.answers?.length : !q.correct;
  const rightButton = h2("button", {
    class: `pick wide ${state.picked === "correct" ? "on" : ""}`.trim(),
    text: "I got it right, but explain",
    onclick: () => {
      state.picked = "correct";
      render3();
    }
  });
  const children = [h2("h2", { text: gridIn ? "What did you enter?" : "Which did you pick?" })];
  if (needsAnswer) {
    children.push(
      h2(
        "div",
        { class: "banner warn" },
        h2("p", { text: "The correct answer is not in what I read." }),
        h2("p", { class: "muted small", text: "Reveal the answer on the Question Bank tab and capture again, or let me solve it (less reliable)." }),
        h2(
          "label",
          { class: "row small", style: "margin-top:6px" },
          h2("input", {
            type: "checkbox",
            checked: state.allowSolve,
            onchange: (event) => {
              state.allowSolve = event.target.checked;
              render3();
            }
          }),
          "Let the model work out the answer"
        )
      )
    );
  }
  let sprOk = true;
  if (gridIn) {
    const check = sprCheck();
    sprOk = state.picked !== "spr" || check.ok;
    const input = h2("input", {
      id: "spr-input",
      class: "input",
      maxlength: 6,
      inputmode: "decimal",
      autocomplete: "off",
      placeholder: "Your answer, e.g. 3/17 or .75",
      value: state.sprInput,
      oninput: (event) => {
        state.sprInput = event.target.value;
        state.picked = state.sprInput.trim() ? "spr" : state.picked === "spr" ? null : state.picked;
        render3();
      },
      onkeydown: (event) => {
        if (event.key === "Enter") void explain();
      }
    });
    children.push(h2("div", { class: "picks" }, h2("div", { style: "flex:1;min-width:140px" }, input), rightButton));
    if (state.picked === "spr" && check.error) children.push(h2("p", { class: "small", style: "color:var(--danger)", role: "alert", text: check.error }));
    else children.push(h2("p", { class: "muted small", text: "Enter it the way you would on the test: a fraction or a decimal, up to 5 characters (6 if negative)." }));
  } else {
    children.push(
      h2(
        "div",
        { class: "picks" },
        ...LETTERS.map(
          (letter) => h2("button", {
            class: `pick ${state.picked === letter ? "on" : ""}`.trim(),
            text: letter,
            onclick: () => {
              state.picked = letter;
              render3();
            }
          })
        ),
        rightButton
      )
    );
  }
  const reasoning = h2("input", {
    id: "reasoning",
    class: "input",
    placeholder: "What was your thinking? (optional, one line)",
    onkeydown: (event) => {
      if (event.key === "Enter") void explain();
    }
  });
  children.push(...addons.renderPickExtras());
  children.push(reasoning);
  children.push(
    h2(
      "div",
      { class: "row" },
      h2(
        "button",
        { id: "explain-button", class: "btn primary", disabled: !state.picked || !sprOk || state.explaining || needsAnswer && !state.allowSolve, onclick: () => void explain() },
        state.explaining ? spinner2() : null,
        "Explain"
      ),
      state.explaining ? h2("span", { class: "muted small", text: isMathQuestion(q) ? "Working it out..." : "Writing your rule card..." }) : null
    )
  );
  if (state.explainError) children.push(h2("div", { class: "banner danger", role: "alert", text: state.explainError }));
  return h2("div", { style: "display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--line);padding-top:10px" }, ...children);
}
function renderRuleCard(card, picked, ruleName) {
  const diag = DIAGNOSIS[card.diagnosis] ?? DIAGNOSIS.unknown;
  const math2 = isMathQuestion(state.question);
  const section = (title, body) => h2("section", null, h2("h2", { text: title }), mathEl("p", body));
  const answerLabel = card.correct_letter ?? card.correct_answer ?? "the answer";
  const pickedLabel = picked === "spr" ? state.explained?.response ?? "your answer" : picked;
  const rulePath = `/rules${math2 ? "?section=math" : ""}#${card.rule_id}`;
  const children = [
    h2(
      "div",
      { class: "row" },
      chip2(math2 && card.diagnosis === "careless" ? "computation slip" : math2 && card.diagnosis === "misread" ? "misread the question" : diag.label, diag.tone),
      chip2(`confidence ${Math.round(card.confidence * 100)}%`),
      card.solved_by_model ? chip2("answer worked out by the model, double check it", "warn") : null,
      card.suggested_rule ? chip2(`suggested new rule: ${card.suggested_rule}`) : null
    ),
    h2(
      "div",
      { class: "banner accent" },
      h2(
        "div",
        { class: "rule-id" },
        "Rule ",
        h2("button", { class: "btn link rule-link", text: `${card.rule_id}${ruleName ? ` \xB7 ${ruleName}` : ""}`, onclick: () => void openWeb(rulePath) })
      ),
      mathEl("p", card.rule_statement, { class: "rule-statement" })
    ),
    section(`Why ${answerLabel} is right`, card.why_correct),
    card.why_pick_fails && picked !== "correct" ? section(`Why ${pickedLabel} fails`, card.why_pick_fails) : null,
    card.steps?.length ? h2("section", null, h2("h2", { text: "Steps" }), h2("ol", { class: "steps" }, ...card.steps.map((step) => mathEl("li", step)))) : null,
    card.shortcut ? h2("div", { class: "shortcut" }, h2("h2", { text: "Shortcut" }), mathEl("p", card.shortcut)) : null,
    card.eliminations.length && !isGridIn2(state.question) ? h2(
      "section",
      null,
      h2("h2", { text: "Kill the rest" }),
      h2("ul", { class: "list" }, ...card.eliminations.map((e) => h2("li", null, h2("span", { class: "letter", text: `${e.letter}.` }), mathEl("span", e.reason))))
    ) : null,
    h2("div", { class: "banner", style: "background:var(--bg)" }, h2("h2", { text: "Takeaway" }), mathEl("p", card.takeaway, { class: "stem" })),
    renderDrill()
  ];
  return h2("div", { class: "card" }, ...children);
}
function renderDrill() {
  const d = state.drill;
  if (!d.data) {
    return h2(
      "div",
      { class: "row", style: "border-top:1px solid var(--line);padding-top:10px" },
      h2("button", { class: "btn", disabled: d.loading, title: "Writes one new mini-question on the same rule", onclick: () => void startDrill() }, d.loading ? spinner2() : null, d.loading ? "Writing a question..." : "Test me"),
      d.error ? h2("span", { class: "small", style: "color:var(--danger)", text: d.error }) : null
    );
  }
  const drill = d.data;
  const gridIn = drill.format === "spr" || !drill.question.choices;
  const children = [
    h2("h2", { text: `Test me \xB7 ${drill.ruleId} ${drill.ruleName}` }),
    drill.question.passage ? mathEl("div", drill.question.passage, { class: "passage" }) : null,
    drill.question.figure ? h2("div", { class: "figure" }, h2("div", { class: "figure-label", text: "Figure" }), mathEl("div", drill.question.figure)) : null,
    mathEl("p", drill.question.stem, { class: "stem" })
  ];
  if (gridIn) {
    const entry = d.response.trim() ? parseSprEntry(d.response) : null;
    children.push(
      h2(
        "div",
        { class: "picks" },
        h2(
          "div",
          { style: "flex:1;min-width:140px" },
          h2("input", {
            id: "drill-spr-input",
            class: "input",
            maxlength: 6,
            inputmode: "decimal",
            autocomplete: "off",
            placeholder: "Your answer",
            value: d.response,
            disabled: Boolean(d.result) || d.picked === "spr",
            oninput: (event) => {
              d.response = event.target.value;
              render3();
            },
            onkeydown: (event) => {
              if (event.key === "Enter") void checkDrillResponse();
            }
          })
        ),
        h2("button", { id: "drill-check", class: "btn primary", disabled: !entry?.ok || Boolean(d.result) || d.picked === "spr", onclick: () => void checkDrillResponse() }, d.picked === "spr" && !d.result ? spinner2() : null, "Check")
      )
    );
    if (entry && !entry.ok && !d.result) children.push(h2("p", { class: "small", style: "color:var(--danger)", text: entry.error }));
  } else if (drill.question.choices) {
    const choices = drill.question.choices;
    children.push(
      h2(
        "ol",
        { class: "choices" },
        ...LETTERS.map((letter) => {
          const isPick = d.picked === letter;
          const isCorrect = d.result?.correctLetter === letter;
          const cls = d.result ? isCorrect ? "correct" : isPick ? "picked" : "" : isPick ? "selected" : "selectable";
          return h2(
            "li",
            { class: `choice ${cls}`.trim(), onclick: () => void answerDrill(letter) },
            h2("span", { class: "letter", text: `${letter}.` }),
            mathEl("span", choices[letter])
          );
        })
      )
    );
  }
  if (d.result) {
    const answer = d.result.correctLetter ?? d.result.correctAnswer ?? "";
    children.push(
      h2(
        "div",
        { class: `banner ${d.result.correct ? "good" : "danger"}` },
        h2("p", { class: "stem", text: d.result.correct ? "Right." : `Not quite. The answer is ${answer}.` }),
        mathEl("p", d.result.correct ? d.result.whyCorrect : d.result.fix ?? d.result.whyCorrect),
        !d.result.correct && d.result.fix ? mathEl("p", d.result.whyCorrect, { class: "muted small" }) : null,
        d.result.solution?.length ? h2("ol", { class: "steps small" }, ...d.result.solution.map((step) => mathEl("li", step))) : null
      ),
      h2("button", { class: "btn", disabled: d.loading, onclick: () => void startDrill() }, d.loading ? spinner2() : null, "Another one")
    );
  }
  if (d.error) children.push(h2("div", { class: "banner danger", role: "alert", text: d.error }));
  return h2("div", { style: "display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--line);padding-top:10px" }, ...children);
}
function renderChat() {
  const c = state.chat;
  const input = h2("input", {
    id: "chat-input",
    class: "input",
    placeholder: "Ask about this question",
    onkeydown: (event) => {
      if (event.key === "Enter") void sendChat();
    }
  });
  return h2(
    "div",
    { class: "card" },
    h2("h2", { text: "Ask about this question" }),
    c.messages.length ? h2(
      "div",
      { class: "chat" },
      ...c.messages.map((m) => h2("div", { class: `msg ${m.role === "user" ? "user" : "tutor"}`, id: `msg-${m.id}` }, h2("span", { class: "who", text: m.role === "user" ? "you" : "tutor" }), mathEl("span", m.text || (c.busy ? "..." : ""), { class: "body" })))
    ) : null,
    c.error ? h2("div", { class: "banner danger", role: "alert", text: c.error }) : null,
    h2("div", { class: "row" }, h2("div", { style: "flex:1;min-width:0" }, input), h2("button", { class: "btn", disabled: c.busy, onclick: () => void sendChat() }, c.busy ? spinner2() : "Send"))
  );
}
function renderFooter() {
  return h2(
    "div",
    { class: "footer muted" },
    webButton("/", "Open the web app"),
    h2("span", { class: "small", text: [state.settings.email, state.health ? `v${state.health.version}` : ""].filter(Boolean).join(" \xB7 ") })
  );
}
function describe(error) {
  if (error instanceof ApiError) {
    if (error.code === "no_provider") return "The server has no AI key yet. Add OPENAI_API_KEY or ANTHROPIC_API_KEY in Vercel, then try again.";
    if (error.code === "extraction_failed") return "I could not find a question in that picture. Scroll so the whole question and the choices are visible, then capture again.";
    if (error.code === "needs_answer") return "The answer was not visible. Reveal it on the Question Bank tab and capture again, or tick 'Let the model work out the answer'.";
    if (error.code === "daily_limit") return error.message;
    if (error.code === "invalid_response") return error.message;
    if (error.code === "unverified") return "Could not double-check that question. Try again.";
    if (error.status === 429) return error.message;
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
async function handleAuthFailure(error) {
  if (error instanceof ApiError && error.status === 401) {
    state.settings = { ...state.settings, token: null };
    await saveSettings(state.settings);
    resetQuestion();
    state.view = "connect";
    state.connectError = "Your session expired. Sign in again.";
    render3();
    return true;
  }
  return false;
}
function resetQuestion() {
  state.question = null;
  state.picked = null;
  state.sprInput = "";
  state.allowSolve = false;
  state.explaining = false;
  state.explainError = null;
  state.explained = null;
  state.chat = { messages: [], busy: false, error: null };
  state.drill = emptyDrill();
}
async function refreshHealth() {
  try {
    state.health = await request(state.settings, "/api/health");
  } catch (error) {
    if (await handleAuthFailure(error)) return;
    state.health = null;
  }
  render3();
}
async function activeTab() {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || tab.windowId === void 0) throw new Error("No active tab found. Click the Question Bank tab, then try again.");
  const url = tab.url ?? "";
  if (/^(chrome|chrome-extension|edge|about|devtools):/.test(url)) throw new Error("Switch to the Question Bank tab first; browser pages cannot be captured.");
  return tab;
}
async function capture() {
  if (state.capturing) return;
  state.capturing = true;
  state.captureError = null;
  state.needsAllSites = false;
  render3();
  try {
    const tab = await activeTab();
    if (!await addons.beforeCapture(tab)) return;
    const textImage = await addons.tryTextCapture(tab);
    if (textImage) {
      await processImage(textImage);
      return;
    }
    let raw;
    try {
      raw = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/permission|activeTab|all_urls/i.test(message)) {
        state.needsAllSites = true;
        throw new Error(
          "Chrome only lets Rulecard read a tab after you click the Rulecard toolbar icon on that tab (or press the shortcut there). Click the icon on the Question Bank tab, then Capture again. Or allow all sites below, once."
        );
      }
      throw error;
    }
    const image = await addons.transformImage(await downscale(raw));
    if (!image) return;
    await processImage(image);
  } catch (error) {
    if (await handleAuthFailure(error)) return;
    state.captureError = describe(error);
  } finally {
    state.capturing = false;
    render3();
  }
}
async function processImage(image) {
  const data = await request(state.settings, "/api/extract", { body: { image, source: "capture" } });
  resetQuestion();
  state.question = data.question;
  void addons.afterExtract(normalizeQuestion(data.question));
}
async function allowAllSites() {
  try {
    const granted = await chrome.permissions.request({ origins: ["<all_urls>"] });
    if (granted) {
      state.needsAllSites = false;
      state.captureError = null;
      render3();
      await capture();
    }
  } catch (error) {
    state.captureError = describe(error);
    render3();
  }
}
async function explain() {
  const q = state.question;
  if (!q || !state.picked || state.explaining) return;
  const reasoning = (document.getElementById("reasoning")?.value ?? "").trim();
  const picked = state.picked;
  let response = null;
  if (picked === "spr") {
    const entry = parseSprEntry(state.sprInput);
    if (!entry.ok) {
      state.explainError = entry.error;
      render3();
      return;
    }
    response = entry.text;
  }
  state.explaining = true;
  state.explainError = null;
  render3();
  try {
    const data = await request(state.settings, "/api/explain", {
      body: { questionId: q.id, picked, ...response ? { response } : {}, reasoning: reasoning || null, allowModelSolve: state.allowSolve }
    });
    state.question = data.question;
    state.explained = { attemptId: data.attemptId, card: data.card, ruleName: data.rule?.name ?? null, picked, response, isCorrect: data.isCorrect ?? null };
    void addons.afterExplain(data, picked, response);
    void refreshRecent();
    state.chat = { messages: [], busy: false, error: null };
    state.drill = emptyDrill();
  } catch (error) {
    if (await handleAuthFailure(error)) return;
    state.explainError = describe(error);
  } finally {
    state.explaining = false;
    render3();
  }
}
async function startDrill() {
  const attemptId = state.explained?.attemptId;
  if (!attemptId || state.drill.loading) return;
  state.drill = { ...emptyDrill(), loading: true };
  render3();
  try {
    state.drill.data = await request(state.settings, "/api/drill", { body: { attemptId } });
  } catch (error) {
    if (await handleAuthFailure(error)) return;
    state.drill.error = describe(error);
  } finally {
    state.drill.loading = false;
    render3();
  }
}
async function answerDrill(letter) {
  const d = state.drill;
  if (!d.data || d.result || d.picked) return;
  d.picked = letter;
  render3();
  try {
    d.result = await request(state.settings, "/api/drill/check", { body: { drillId: d.data.drillId, picked: letter } });
    if (state.explained) void addons.afterDrillCheck(state.explained.attemptId, d.result.correct);
  } catch (error) {
    if (await handleAuthFailure(error)) return;
    d.error = describe(error);
    d.picked = null;
  }
  render3();
}
async function checkDrillResponse() {
  const d = state.drill;
  if (!d.data || d.result || d.picked) return;
  const entry = parseSprEntry(d.response);
  if (!entry.ok) {
    d.error = entry.error;
    render3();
    return;
  }
  d.picked = "spr";
  d.error = null;
  render3();
  try {
    d.result = await request(state.settings, "/api/drill/check", { body: { drillId: d.data.drillId, response: entry.text } });
    if (state.explained) void addons.afterDrillCheck(state.explained.attemptId, d.result.correct);
  } catch (error) {
    if (await handleAuthFailure(error)) return;
    d.error = describe(error);
    d.picked = null;
  }
  render3();
}
async function sendChat() {
  const attemptId = state.explained?.attemptId;
  const input = document.getElementById("chat-input");
  const text2 = (input?.value ?? "").trim();
  if (!attemptId || !text2 || state.chat.busy) return;
  if (input) input.value = "";
  const c = state.chat;
  c.busy = true;
  c.error = null;
  const user = { id: `u-${Date.now()}`, role: "user", text: text2 };
  const reply = { id: `a-${Date.now()}`, role: "assistant", text: "" };
  c.messages.push(user, reply);
  render3();
  try {
    const history = c.messages.slice(0, -1);
    await streamChat(state.settings, attemptId, history, (delta) => {
      reply.text += delta;
      const body = document.querySelector(`#msg-${reply.id} .body`);
      if (body) body.innerHTML = renderMathHtml(reply.text);
      else render3();
    });
    if (!reply.text) reply.text = "(no reply)";
  } catch (error) {
    if (await handleAuthFailure(error)) return;
    c.error = describe(error);
    c.messages = c.messages.filter((m) => m.id !== reply.id);
  } finally {
    c.busy = false;
    render3();
  }
}
async function consumePendingCapture() {
  const stored = await chrome.storage.session.get("pendingCapture");
  const pending = stored.pendingCapture;
  if (!pending) return;
  await chrome.storage.session.remove("pendingCapture");
  if (Date.now() - pending.at > 12e4) return;
  if (state.view !== "main") return;
  state.capturing = true;
  state.captureError = null;
  render3();
  try {
    if (pending.error) throw new Error(pending.error);
    if (pending.image) {
      const image = await addons.transformImage(pending.image);
      if (image) await processImage(image);
    }
  } catch (error) {
    if (await handleAuthFailure(error)) return;
    state.captureError = describe(error);
  } finally {
    state.capturing = false;
    render3();
  }
}
async function consumePendingQuestion() {
  const stored = await chrome.storage.session.get("pendingQuestion");
  const pending = stored.pendingQuestion;
  if (!pending) return;
  await chrome.storage.session.remove("pendingQuestion");
  if (state.view !== "main" || !pending.id || !pending.stem) return;
  resetQuestion();
  state.question = pending;
  void addons.afterExtract(normalizeQuestion(pending));
  render3();
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.pendingCapture?.newValue) void consumePendingCapture();
  if (area === "session" && changes.pendingQuestion?.newValue) void consumePendingQuestion();
});
async function boot() {
  state.settings = await loadSettings();
  try {
    const commands = await chrome.commands.getAll();
    state.shortcut = commands.find((c) => c.name === "capture")?.shortcut || null;
  } catch {
    state.shortcut = null;
  }
  if (!state.settings.token) {
    state.view = "connect";
    render3();
    return;
  }
  state.view = "main";
  render3();
  void refreshRecent();
  await refreshHealth();
  await consumePendingCapture();
  await consumePendingQuestion();
}
var addons = createAddons(
  {
    get settings() {
      return state.settings;
    },
    request,
    rerender: () => render3(),
    openWeb: (path2) => openWeb(path2),
    describe
  },
  {
    getQuestion: () => state.question ? normalizeQuestion(state.question) : null,
    getExplained: () => state.explained && { attemptId: state.explained.attemptId, picked: state.explained.picked === "spr" ? "correct" : state.explained.picked },
    processImage,
    capture: () => void capture(),
    pick: (letter) => {
      const d = state.drill;
      if (d.data && !d.result) {
        if (d.data.question.choices && letter !== "correct") void answerDrill(letter);
        return;
      }
      if (!state.question || state.explained) return;
      if (isGridIn2(state.question) && letter !== "correct") return;
      state.picked = letter;
      render3();
    },
    explain: () => void explain(),
    testMe: () => void startDrill(),
    focusChat: () => document.getElementById("chat-input")?.focus()
  }
);
void boot();
