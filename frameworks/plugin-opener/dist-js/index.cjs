var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toCommonJS = (from) => {
  var entry = (__moduleCache ??= new WeakMap).get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function") {
    for (var key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(entry, key))
        __defProp(entry, key, {
          get: __accessProp.bind(from, key),
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
  }
  __moduleCache.set(from, entry);
  return entry;
};
var __moduleCache;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};

// guest-js/index.ts
var exports_guest_js = {};
__export(exports_guest_js, {
  openPath: () => openPath,
  openUrl: () => openUrl,
  revealItemsInDir: () => revealItemsInDir
});
module.exports = __toCommonJS(exports_guest_js);
var import_core = require("@aphrody/api/core");
async function openUrl(url, openWith) {
  await import_core.invoke("plugin:opener|open_url", {
    url,
    with: openWith
  });
}
async function openPath(path, openWith) {
  await import_core.invoke("plugin:opener|open_path", {
    path,
    with: openWith
  });
}
async function revealItemsInDir(path) {
  const paths = typeof path === "string" ? [path] : path;
  return import_core.invoke("plugin:opener|reveal_items_in_dir", { paths });
}
