/** Whitelisted service methods callable from the renderer (Electron IPC or HTTP). */
export const RPC_METHODS = [
  'openWorkspace', 'getWorkspace', 'rescan', 'listAssets', 'getFolderTree', 'getFacets', 'getAsset', 'getAssetInfo',
  'readMeta', 'setTags', 'listPresets', 'savePreset', 'deletePreset', 'apply', 'cancelJob', 'listJobs',
  'listOperations', 'listHistory', 'undoOperation', 'toolStatus',
] as const;
export type RpcMethod = (typeof RPC_METHODS)[number];

/** Encode a project-relative path segment-by-segment so relative URLs (glTF .bin, textures) keep resolving. */
export const encodeRelPath = (rel: string) => rel.split('/').map(encodeURIComponent).join('/');
