//! Name tables: Python builtins, exceptions, Java roots, Ghidra script globals.

pub const BUILTINS: &[&str] = &[
    "print", "len", "range", "enumerate", "zip", "sorted", "reversed", "str", "int", "float", "bool",
    "hex", "oct", "bin", "format", "repr", "abs", "min", "max", "sum", "any", "all", "map", "filter",
    "list", "dict", "set", "tuple", "isinstance", "issubclass", "getattr", "setattr", "hasattr", "ord",
    "chr", "round", "divmod", "pow", "type", "id", "iter", "next", "open", "input", "callable",
    "bytes", "bytearray", "hash", "slice", "frozenset", "object", "exit", "quit", "vars", "dir",
];

pub const EXCEPTIONS: &[&str] = &[
    "BaseException", "Exception", "ValueError", "KeyError", "IndexError", "TypeError", "RuntimeError",
    "StopIteration", "OSError", "IOError", "ZeroDivisionError", "AttributeError", "AssertionError",
    "NotImplementedError", "NameError", "OverflowError", "KeyboardInterrupt", "SystemExit",
    "LookupError", "ArithmeticError", "UnicodeDecodeError", "UnicodeEncodeError", "ImportError",
    "FileNotFoundError", "PermissionError", "TimeoutError", "EOFError",
];

/// Methods rewritten to `__py.m.NAME(recv, ...args)`. The runtime falls back to the native
/// method when the receiver is not the Python type (Java objects via the jpype-like proxy).
pub const METHODS: &[&str] = &[
    "join", "replace", "split", "rsplit", "format", "strip", "lstrip", "rstrip", "upper", "lower",
    "startswith", "endswith", "append", "extend", "items", "sort", "pop", "get", "find", "rfind",
    "count", "index", "insert", "remove", "update", "setdefault", "copy", "clear", "encode", "decode",
    "isdigit", "isalpha", "isalnum", "isspace", "isupper", "islower", "zfill", "ljust", "rjust",
    "center", "title", "capitalize", "splitlines", "partition", "discard",
];

/// Top-level packages that live in the JVM (resolved through the Ghidra java proxy).
pub const JAVA_ROOTS: &[&str] = &[
    "ghidra", "java", "javax", "generic", "docking", "utility", "db", "org", "com", "resources",
    "agent", "sun", "jdk", "ghidra_builtins",
];

/// Stdlib modules provided by `@aphrody/py2bun/runtime/<name>`.
pub const STDLIB: &[&str] = &["math", "json", "os", "sys", "re", "time", "string", "struct", "random"];

/// Modules that may be silently dropped.
pub const IGNORED_MODULES: &[&str] = &["__future__", "typing", "__main__", "jarray"];

/// GhidraScript + FlatProgramAPI + FlatDecompilerAPI-less globals. Resolved to
/// `import { ... } from "@aphrody/ghidra/script"`.
pub const GHIDRA_FLAT: &[&str] = &[
    "currentProgram", "currentAddress", "currentLocation", "currentSelection", "currentHighlight",
    "monitor", "state", "sourceFile", "potentialPropertiesFileLocs", "writer",
    "println", "printerr", "printf", "popup", "getScriptArgs", "getState", "getMonitor",
    "askString", "askInt", "askLong", "askDouble", "askAddress", "askFile", "askDirectory",
    "askChoice", "askChoices", "askYesNo", "askBytes", "askProgram", "askDomainFile",
    "askProjectFolder", "askValues", "askTaskMonitor", "runScript", "runCommand", "goTo",
    "isRunningHeadless", "getSourceFile", "getProgramFile", "getCurrentProgram", "setCurrentLocation",
    "analyzeAll", "analyzeChanges", "getCurrentAnalysisOptionsAndValues",
    "toAddr", "getFunctionAt", "getFunctionContaining", "getFunctionAfter", "getFunctionBefore",
    "getFirstFunction", "getLastFunction", "getGlobalFunctions", "getSymbolAt", "getSymbols",
    "getSymbol", "getNamespace", "createFunction", "createLabel", "createData", "createAsciiString",
    "createUnicodeString", "createByte", "createWord", "createDWord", "createQWord", "createFloat",
    "createDouble", "createChar", "createFragment", "createFolder", "createMemoryBlock",
    "createBookmark", "createClass", "createNamespace", "createEquate", "createStructure",
    "getInstructionAt", "getInstructionAfter", "getInstructionBefore", "getInstructionContaining",
    "getFirstInstruction", "getLastInstruction", "getDataAt", "getDataAfter", "getDataBefore",
    "getDataContaining", "getFirstData", "getLastData", "getUndefinedDataAt",
    "getUndefinedDataAfter", "getUndefinedDataBefore", "getByte", "getBytes", "getShort", "getInt",
    "getLong", "setByte", "setBytes", "setShort", "setInt", "setLong", "setFloat", "setDouble",
    "setBoolean", "setString", "find", "findBytes", "findStrings", "findPascalStrings",
    "getReferencesFrom", "getReferencesTo", "getReference", "addInstructionXref", "addDataXref",
    "createMemoryReference", "createExternalReference", "removeReference", "getMemoryBlock",
    "getMemoryBlocks", "removeFunction", "removeData", "removeInstruction", "removeSymbol",
    "removeEquate", "removeBookmark", "clearListing", "disassemble", "setEOLComment",
    "setPlateComment", "setPreComment", "setPostComment", "setRepeatableComment", "getEOLComment",
    "getPlateComment", "getPreComment", "getPostComment", "getRepeatableComment", "getBookmarks",
    "getEquate", "getEquates", "getDataTypes", "getAddressFactory", "getCurrentProgram",
    "getAddressAt", "getLanguage", "getCompilerSpec", "getMinAddress", "getMaxAddress",
    "getEntryPoint", "getEntryPoints", "openDataTypeArchive", "setAnalysisOption", "getFunction",
    "removeFunctionAt", "currentAnalysis", "getRegister", "getProgramFile", "getProgramInfo",
    "startTransaction", "endTransaction", "getCurrentHighlight", "setCurrentHighlight",
    "getDefaultDataTypeManager", "clearBookmark", "getEOL", "getCurrentSelection", "createLabel",
    "isAddress", "parseAddress", "getAddressesInRange",
];
