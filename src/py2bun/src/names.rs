//! Name tables: Python builtins, exceptions, Java roots, Ghidra script globals.

pub const BUILTINS: &[&str] = &[
    "print", "len", "range", "enumerate", "zip", "sorted", "reversed", "str", "int", "float", "bool",
    "hex", "oct", "bin", "format", "repr", "abs", "min", "max", "sum", "any", "all", "map", "filter",
    "list", "dict", "set", "tuple", "isinstance", "issubclass", "getattr", "setattr", "hasattr", "ord",
    "chr", "round", "divmod", "pow", "type", "id", "iter", "next", "open", "input", "callable",
    "file", "xrange", "unicode", "long", "raw_input", "unichr", "basestring", "reduce",
    "bytes", "bytearray", "hash", "slice", "frozenset", "object", "exit", "quit", "vars", "dir",
];

/// Builtins that may receive Java objects/iterables: async variants `__py.a_NAME` (awaited) in async mode.
pub const ASYNC_BUILTINS: &[&str] = &[
    "len", "list", "tuple", "set", "frozenset", "sorted", "sum", "min", "max", "any", "all", "reversed", "str", "dict",
];
/// Lazy builtins with async-generator variants (not awaited).
pub const ASYNC_GEN_BUILTINS: &[&str] = &["enumerate", "zip", "map", "filter"];

pub const EXCEPTIONS: &[&str] = &[
    "BaseException", "Exception", "ValueError", "KeyError", "IndexError", "TypeError", "RuntimeError",
    "StopIteration", "OSError", "IOError", "ZeroDivisionError", "AttributeError", "AssertionError",
    "NotImplementedError", "NameError", "OverflowError", "KeyboardInterrupt", "SystemExit",
    "LookupError", "ArithmeticError", "UnicodeDecodeError", "UnicodeEncodeError", "ImportError",
    "FileNotFoundError", "FileExistsError", "PermissionError", "TimeoutError", "EOFError", "GeneratorExit",
];

/// Methods rewritten to `__py.m.NAME(recv, ...args)`. The runtime falls back to the native
/// method when the receiver is not the Python type (Java objects via the jpype-like proxy).
pub const METHODS: &[&str] = &[
    "join", "replace", "split", "rsplit", "format", "strip", "lstrip", "rstrip", "upper", "lower",
    "startswith", "endswith", "append", "extend", "items", "sort", "pop", "get", "find", "rfind",
    "count", "index", "insert", "remove", "update", "setdefault", "copy", "clear", "encode", "decode",
    "isdigit", "isalpha", "isalnum", "isspace", "isupper", "islower", "zfill", "ljust", "rjust",
    "center", "title", "capitalize", "splitlines", "partition", "discard", "rpartition", "removeprefix",
    "removesuffix", "swapcase", "popitem",
];

/// Top-level packages that live in the JVM (resolved through the Ghidra java proxy).
pub const JAVA_ROOTS: &[&str] = &[
    "ghidra", "java", "javax", "generic", "docking", "utility", "db", "org", "com", "resources",
    "agent", "sun", "jdk", "ghidra_builtins",
];

/// Stdlib modules provided by `@aphrody/py2bun/runtime/<name>`.
pub const STDLIB: &[&str] = &["math", "json", "os", "sys", "re", "time", "string", "struct", "random"];

/// Modules that may be silently dropped.
pub const IGNORED_MODULES: &[&str] = &["__future__", "typing", "__main__", "exceptions"];

/// Names importable from `@aphrody/ghidra/script`: the fields of `frameworks/re-ts/ghidra/src/script.ts` plus
/// every async function of `frameworks/re-ts/ghidra/src/script.generated.ts` (GhidraScript + FlatProgramAPI,
/// generated from the Java sources by `frameworks/re-ts/ghidra/scripts/gen-script-exports.ts`).
pub const GHIDRA_FLAT: &[&str] = &[
    "currentProgram", "currentAddress", "currentLocation", "currentSelection", "currentHighlight",
    "monitor", "state", "sourceFile",
    "addEntryPoint", "addInstructionXref", "analyze", "analyzeAll", "analyzeChanges", "askAddress", 
    "askBytes", "askChoice", "askChoices", "askDirectory", "askDomainFile", "askDouble", "askFile", 
    "askInt", "askLanguage", "askLong", "askPassword", "askProgram", "askProjectFolder", 
    "askString", "askValues", "askYesNo", "clearBackgroundColor", "clearListing", 
    "createAddressSet", "createAsciiString", "createBookmark", "createByte", "createChar", 
    "createClass", "createDWord", "createData", "createDouble", "createDwords", "createEquate", 
    "createExternalReference", "createFloat", "createFragment", "createFunction", 
    "createHighlight", "createLabel", "createMemoryBlock", "createMemoryReference", 
    "createNamespace", "createProgram", "createQWord", "createSelection", "createStackReference", 
    "createSymbol", "createUnicodeString", "createWord", "disassemble", "end", "find", "findBytes", 
    "findPascalStrings", "findStrings", "getAddressFactory", "getAnalysisOptionDefaultValue", 
    "getAnalysisOptionDefaultValues", "getAnalysisOptionDescription", 
    "getAnalysisOptionDescriptions", "getBookmarks", "getByte", "getBytes", "getCategory", 
    "getCodeUnitFormat", "getCurrentAnalysisOptionsAndValues", "getCurrentProgram", "getDataAfter", 
    "getDataAt", "getDataBefore", "getDataContaining", "getDataTypes", "getDefaultLanguage", 
    "getDemangled", "getDouble", "getEOLComment", "getEOLCommentAsRendered", "getEquate", 
    "getEquates", "getFirstData", "getFirstFunction", "getFirstInstruction", "getFloat", 
    "getFragment", "getFunction", "getFunctionAfter", "getFunctionAt", "getFunctionBefore", 
    "getFunctionContaining", "getGhidraVersion", "getGlobalFunctions", "getInstructionAfter", 
    "getInstructionAt", "getInstructionBefore", "getInstructionContaining", "getInt", 
    "getLanguage", "getLastData", "getLastFunction", "getLastInstruction", "getLong", 
    "getMemoryBlock", "getMemoryBlocks", "getMonitor", "getNamespace", "getPlateComment", 
    "getPlateCommentAsRendered", "getPostComment", "getPostCommentAsRendered", "getPreComment", 
    "getPreCommentAsRendered", "getProgramFile", "getProjectRootFolder", "getReference", 
    "getReferencesFrom", "getReferencesTo", "getRepeatableComment", 
    "getRepeatableCommentAsRendered", "getReusePreviousChoices", "getScriptAnalysisMode", 
    "getScriptArgs", "getScriptName", "getShort", "getSourceFile", "getState", "getSymbol", 
    "getSymbolAfter", "getSymbolAt", "getSymbolBefore", "getSymbols", "getUndefinedDataAfter", 
    "getUndefinedDataAt", "getUndefinedDataBefore", "getUserName", "goTo", "importFile", 
    "importFileAsBinary", "isAnalysisOptionDefaultValue", "isRunningHeadless", 
    "openDataTypeArchive", "openFileDataTypeArchive", "popup", "print", "printerr", "printf", 
    "println", "removeBookmark", "removeData", "removeDataAt", "removeEntryPoint", "removeEquate", 
    "removeEquates", "removeFunction", "removeFunctionAt", "removeHighlight", "removeInstruction", 
    "removeInstructionAt", "removeMemoryBlock", "removeReference", "removeSelection", 
    "removeSymbol", "run", "runCommand", "runScript", "runScriptPreserveMyState", "saveProgram", 
    "set", "setAnalysisOption", "setAnalysisOptions", "setBackgroundColor", "setByte", "setBytes", 
    "setCurrentHighlight", "setCurrentLocation", "setCurrentSelection", "setDouble", 
    "setEOLComment", "setFloat", "setInt", "setLong", "setPlateComment", "setPostComment", 
    "setPreComment", "setReferencePrimary", "setRepeatableComment", "setReusePreviousChoices", 
    "setScriptArgs", "setShort", "setToolStatusMessage", "start", "toAddr", 
];
/// Generic names that are in the generated script exports but must not capture an unbound Python name.
pub const FLAT_AMBIGUOUS: &[&str] = &["start", "end", "set", "print", "analyze", "run", "find"];

pub fn is_flat(id: &str) -> bool {
    GHIDRA_FLAT.contains(&id) && !FLAT_AMBIGUOUS.contains(&id)
}
