// guest-js/index.ts
import { invoke } from "@aphrody/api/core";
async function openUrl(url, openWith) {
  await invoke("plugin:opener|open_url", {
    url,
    with: openWith
  });
}
async function openPath(path, openWith) {
  await invoke("plugin:opener|open_path", {
    path,
    with: openWith
  });
}
async function revealItemsInDir(path) {
  const paths = typeof path === "string" ? [path] : path;
  return invoke("plugin:opener|reveal_items_in_dir", { paths });
}
export {
  openPath,
  openUrl,
  revealItemsInDir
};
