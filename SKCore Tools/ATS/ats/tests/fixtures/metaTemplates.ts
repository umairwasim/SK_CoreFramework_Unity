/** Realistic Unity 6 (6000.x) .meta files, used by the sample project generator and tests. */

export interface TexMetaOpts {
  guid: string;
  textureType?: number; // 0 default, 1 normal, 8 sprite
  spriteMode?: number; // 0 none, 1 single, 2 multiple
  enableMipMap?: 0 | 1;
  sRGB?: 0 | 1;
  isReadable?: 0 | 1;
  maxTextureSize?: number;
  ppu?: number;
  border?: [number, number, number, number];
  labels?: string[];
  platforms?: string[]; // besides DefaultTexturePlatform
  crlf?: boolean;
}

const platform = (target: string, size: number) => `  - serializedVersion: 4
    buildTarget: ${target}
    maxTextureSize: ${size}
    resizeAlgorithm: 0
    textureFormat: -1
    textureCompression: 1
    compressionQuality: 50
    crunchedCompression: 0
    allowsAlphaSplitting: 0
    overridden: 0
    ignorePlatformSupport: 0
    androidETC2FallbackOverride: 0
    forceMaximumCompressionQuality_BC6H_BC7: 0`;

const labelsBlock = (labels?: string[]) => (labels?.length ? `labels:\n${labels.map((l) => `- ${l}`).join('\n')}\n` : '');

export function textureMeta(o: TexMetaOpts): string {
  const size = o.maxTextureSize ?? 2048;
  const b = o.border ?? [0, 0, 0, 0];
  const sprites =
    o.spriteMode === 2
      ? `
    sprites:
    - serializedVersion: 2
      name: button_0
      rect:
        serializedVersion: 2
        x: 0
        y: 1280
        width: 1280
        height: 1280
      alignment: 0
      pivot: {x: 0.5, y: 0.5}
      border: {x: 0, y: 0, z: 0, w: 0}
      outline: []
      physicsShape: []
      tessellationDetail: -1
      bones: []
      spriteID: 2b1e6f4a9c3d4e5f8a7b6c5d4e3f2a1b
      internalID: 21300000
      vertices: []
      indices: 
      edges: []
      weights: []`
      : `
    sprites: []`;
  const text = `fileFormatVersion: 2
guid: ${o.guid}
${labelsBlock(o.labels)}TextureImporter:
  internalIDToNameTable: []
  externalObjects: {}
  serializedVersion: 13
  mipmaps:
    mipMapMode: 0
    enableMipMap: ${o.enableMipMap ?? 1}
    sRGBTexture: ${o.sRGB ?? 1}
    linearTexture: 0
    fadeOut: 0
    borderMipMap: 0
    mipMapsPreserveCoverage: 0
    alphaTestReferenceValue: 0.5
    mipMapFadeDistanceStart: 1
    mipMapFadeDistanceEnd: 3
  bumpmap:
    convertToNormalMap: 0
    externalNormalMap: 0
    heightScale: 0.25
    normalMapFilter: 0
    flipGreenChannel: 0
  isReadable: ${o.isReadable ?? 0}
  streamingMipmaps: 0
  streamingMipmapsPriority: 0
  vTOnly: 0
  ignoreMipmapLimit: 0
  grayScaleToAlpha: 0
  generateCubemap: 6
  cubemapConvolution: 0
  seamlessCubemap: 0
  textureFormat: 1
  maxTextureSize: ${size}
  textureSettings:
    serializedVersion: 2
    filterMode: 1
    aniso: 1
    mipBias: 0
    wrapU: 0
    wrapV: 0
    wrapW: 0
  nPOTScale: ${o.textureType === 8 ? 0 : 1}
  lightmap: 0
  compressionQuality: 50
  spriteMode: ${o.spriteMode ?? 0}
  spriteExtrude: 1
  spriteMeshType: 1
  alignment: 0
  spritePivot: {x: 0.5, y: 0.5}
  spritePixelsToUnits: ${o.ppu ?? 100}
  spriteBorder: {x: ${b[0]}, y: ${b[1]}, z: ${b[2]}, w: ${b[3]}}
  spriteGenerateFallbackPhysicsShape: 1
  alphaUsage: 1
  alphaIsTransparency: ${o.textureType === 8 ? 1 : 0}
  spriteTessellationDetail: -1
  textureType: ${o.textureType ?? 0}
  textureShape: 1
  singleChannelComponent: 0
  flipbookRows: 1
  flipbookColumns: 1
  maxTextureSizeSet: 0
  compressionQualitySet: 0
  textureFormatSet: 0
  ignorePngGamma: 0
  applyGammaDecoding: 0
  swizzle: 50462976
  cookieLightType: 0
  platformSettings:
${[platform('DefaultTexturePlatform', size), ...(o.platforms ?? ['Standalone']).map((p) => platform(p, size))].join('\n')}
  spriteSheet:
    serializedVersion: 2${sprites}
    outline: []
    customData: 
    physicsShape: []
    bones: []
    spriteID: ${o.textureType === 8 ? '5e97eb03825dee720800000000000000' : ''}
    internalID: 0
    vertices: []
    indices: 
    edges: []
    weights: []
    secondaryTextures: []
    spriteCustomMetadata:
      entries: []
    nameFileIdTable: {}
  mipmapLimitGroupName: 
  pSDRemoveMatte: 0
  userData: 
  assetBundleName: 
  assetBundleVariant: 
`;
  return o.crlf ? text.replace(/\n/g, '\r\n') : text;
}

export function audioMeta(o: { guid: string; forceToMono?: 0 | 1; loadType?: number; labels?: string[] }): string {
  return `fileFormatVersion: 2
guid: ${o.guid}
${labelsBlock(o.labels)}AudioImporter:
  externalObjects: {}
  serializedVersion: 7
  defaultSettings:
    serializedVersion: 2
    loadType: ${o.loadType ?? 0}
    sampleRateSetting: 0
    sampleRateOverride: 44100
    compressionFormat: 1
    quality: 1
    conversionMode: 0
    preloadAudioData: 0
  platformSettingOverrides: {}
  forceToMono: ${o.forceToMono ?? 0}
  normalize: 1
  loadInBackground: 0
  ambisonic: 0
  3D: 1
  userData: 
  assetBundleName: 
  assetBundleVariant: 
`;
}

export function modelMeta(o: { guid: string; animationType?: number; labels?: string[] }): string {
  return `fileFormatVersion: 2
guid: ${o.guid}
${labelsBlock(o.labels)}ModelImporter:
  serializedVersion: 22200
  internalIDToNameTable: []
  externalObjects: {}
  materials:
    materialImportMode: 2
    materialName: 0
    materialSearch: 1
    materialLocation: 1
  animations:
    legacyGenerateAnimations: 4
    bakeSimulation: 0
    resampleCurves: 1
    optimizeGameObjects: 0
    removeConstantScaleCurves: 0
    motionNodeName: 
    animationImportErrors: 
    animationImportWarnings: 
    animationRetargetingWarnings: 
    animationDoRetargetingWarnings: 0
    importAnimatedCustomProperties: 0
    importConstraints: 0
    animationCompression: 1
    animationRotationError: 0.5
    animationPositionError: 0.5
    animationScaleError: 0.5
    animationWrapMode: 0
    extraExposedTransformPaths: []
    extraUserProperties: []
    clipAnimations: []
    isReadable: 1
  meshes:
    lODScreenPercentages: []
    globalScale: 1
    meshCompression: 0
    addColliders: 0
    useSRGBMaterialColor: 1
    sortHierarchyByName: 1
    importPhysicalCameras: 1
    importVisibility: 1
    importBlendShapes: 1
    importCameras: 1
    importLights: 1
    nodeNameCollisionStrategy: 1
    fileIdsGeneration: 2
    swapUVChannels: 0
    generateSecondaryUV: 0
    useFileUnits: 1
    keepQuads: 0
    weldVertices: 1
    bakeAxisConversion: 0
    preserveHierarchy: 0
    skinWeightsMode: 0
    maxBonesPerVertex: 4
    minBoneWeight: 0.001
    optimizeBones: 1
    meshOptimizationFlags: -1
    indexFormat: 0
    secondaryUVAngleDistortion: 8
    secondaryUVAreaDistortion: 15.000001
    secondaryUVHardAngle: 88
    secondaryUVMarginMethod: 1
    secondaryUVMinLightmapResolution: 40
    secondaryUVMinObjectScale: 1
    secondaryUVPackMargin: 4
    useFileScale: 1
    strictVertexDataChecks: 0
  tangentSpace:
    normalSmoothAngle: 60
    normalImportMode: 0
    tangentImportMode: 3
    normalCalculationMode: 4
    legacyComputeAllNormalsFromSmoothingGroupsWhenMeshHasBlendShape: 0
    blendShapeNormalImportMode: 1
    normalSmoothingSource: 0
  referencedClips: []
  importAnimation: 1
  humanDescription:
    serializedVersion: 3
    human: []
    skeleton: []
    armTwist: 0.5
    foreArmTwist: 0.5
    upperLegTwist: 0.5
    legTwist: 0.5
    armStretch: 0.05
    legStretch: 0.05
    feetSpacing: 0
    globalScale: 1
    rootMotionBoneName: 
    hasTranslationDoF: 0
    hasExtraRoot: 0
    skeletonHasParents: 1
  lastHumanDescriptionAvatarSource: {instanceID: 0}
  autoGenerateAvatarMappingIfUnspecified: 1
  animationType: ${o.animationType ?? 2}
  humanoidOversampling: 1
  avatarSetup: 0
  addHumanoidExtraRootOnlyWhenUsingAvatar: 1
  importBlendShapeDeformPercent: 1
  remapMaterialsIfMaterialImportModeIsNone: 0
  additionalBone: 0
  userData: 
  assetBundleName: 
  assetBundleVariant: 
`;
}

/** glTFast ScriptedImporter meta (what Unity 6 writes for .glb/.gltf with com.unity.cloud.gltfast). */
export function gltfMeta(o: { guid: string; labels?: string[] }): string {
  return `fileFormatVersion: 2
guid: ${o.guid}
${labelsBlock(o.labels)}ScriptedImporter:
  internalIDToNameTable: []
  externalObjects: {}
  serializedVersion: 2
  userData: 
  assetBundleName: 
  assetBundleVariant: 
  script: {fileID: 11500000, guid: 345a0b4bd4c4e4fd5a9e3ad3fbea0ec1, type: 3}
  editorImportSettings:
    generateSecondaryUVSet: 0
  importSettings:
    nodeNameMethod: 1
    animationMethod: 2
    generateMipMaps: 1
    defaultMinFilterMode: 9729
    defaultMagFilterMode: 9729
    anisotropicFilterLevel: 1
  instantiationSettings:
    mask: -1
    layer: 0
    skinUpdateWhenOffscreen: 1
    lightIntensityFactor: 1
    sceneObjectCreation: 2
  assetDependencies: []
  reportItems: []
`;
}
