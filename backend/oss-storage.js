const crypto = require("crypto");

const DEFAULT_ASSET_PREFIX = "essay-grading/assets";
const DEFAULT_SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;

let serverClient = null;
let publicClient = null;

function setClientForTests(nextClient) {
  serverClient = nextClient;
  publicClient = nextClient;
}

function setClientsForTests(nextClients = {}) {
  serverClient = nextClients.serverClient || null;
  publicClient = nextClients.publicClient || null;
}

function isOssEnabled() {
  return String(process.env.STORAGE_DRIVER || "").toLowerCase() === "oss";
}

function getOssConfig() {
  const config = {
    region: String(process.env.OSS_REGION || "").trim(),
    bucket: String(process.env.OSS_BUCKET || "").trim(),
    accessKeyId: String(process.env.OSS_ACCESS_KEY_ID || process.env.ALIBABA_CLOUD_ACCESS_KEY_ID || "").trim(),
    accessKeySecret: String(process.env.OSS_ACCESS_KEY_SECRET || process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET || "").trim(),
    stsToken: String(process.env.OSS_STS_TOKEN || process.env.ALIBABA_CLOUD_SECURITY_TOKEN || "").trim(),
    publicEndpoint: String(process.env.OSS_PUBLIC_ENDPOINT || process.env.OSS_ENDPOINT || "").trim(),
    internalEndpoint: String(process.env.OSS_INTERNAL_ENDPOINT || "").trim(),
    secure: true,
    authorizationV4: true
  };
  const missing = ["region", "bucket", "accessKeyId", "accessKeySecret"].filter((key) => !config[key]);
  if (missing.length) {
    throw new Error(`OSS 配置不完整，缺少：${missing.join(", ")}`);
  }
  return config;
}

function createClient(endpoint) {
  let OSS;
  try {
    OSS = require("ali-oss");
  } catch (error) {
    throw new Error("云端模式需要安装 ali-oss 依赖，请先执行 npm install");
  }
  const config = getOssConfig();
  return new OSS({
    region: config.region,
    bucket: config.bucket,
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    stsToken: config.stsToken || undefined,
    endpoint: endpoint || undefined,
    secure: true,
    authorizationV4: true
  });
}

function getServerClient() {
  if (!isOssEnabled()) return null;
  if (serverClient) return serverClient;
  const config = getOssConfig();
  serverClient = createClient(config.internalEndpoint || config.publicEndpoint);
  return serverClient;
}

function getPublicClient() {
  if (!isOssEnabled()) return null;
  if (publicClient) return publicClient;
  const config = getOssConfig();
  publicClient = createClient(config.publicEndpoint);
  return publicClient;
}

function getStorageRuntimeInfo() {
  return {
    driver: isOssEnabled() ? "oss" : "local",
    directUploads: isOssEnabled(),
    bucket: isOssEnabled() ? String(process.env.OSS_BUCKET || "") : "",
    region: isOssEnabled() ? String(process.env.OSS_REGION || "") : ""
  };
}

async function getObjectBuffer(objectKey) {
  const result = await getServerClient().get(assertObjectKey(objectKey));
  return Buffer.isBuffer(result.content) ? result.content : Buffer.from(result.content || "");
}

async function putObjectBuffer(objectKey, content, contentType = "application/octet-stream", options = {}) {
  const result = await getServerClient().put(assertObjectKey(objectKey), Buffer.from(content), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": options.cacheControl || "private, no-store",
      ...(options.contentDisposition ? { "Content-Disposition": options.contentDisposition } : {})
    }
  });
  return result;
}

async function deleteObjectKeys(objectKeys) {
  const keys = [...new Set((objectKeys || []).filter(Boolean).map(assertObjectKey))];
  if (!isOssEnabled() || !keys.length) return;
  if (keys.length === 1) {
    await getServerClient().delete(keys[0]);
    return;
  }
  await getServerClient().deleteMulti(keys, { quiet: true });
}

async function createSignedGetUrl(objectKey, expires = getSignedGetUrlTtl(), options = {}) {
  const queries = {};
  if (options.contentDisposition) queries["response-content-disposition"] = options.contentDisposition;
  return getPublicClient().signatureUrlV4("GET", expires, {
    headers: {},
    ...(Object.keys(queries).length ? { queries } : {})
  }, assertObjectKey(objectKey));
}

async function createSignedPutUrl(objectKey, expires = 15 * 60) {
  return getPublicClient().signatureUrlV4("PUT", expires, { headers: {} }, assertObjectKey(objectKey));
}

async function createImageUploadSlots(files) {
  if (!isOssEnabled()) return [];
  return Promise.all((files || []).slice(0, 12).map(async (file, index) => {
    const id = String(file.id || `img-${index + 1}`);
    const originalKey = createAssetKey(file.name || `${id}.jpg`, "original");
    const previewKey = createAssetKey(file.name || `${id}.jpg`, "preview");
    return {
      id,
      storageKey: originalKey,
      previewStorageKey: previewKey,
      uploadUrl: await createSignedPutUrl(originalKey),
      previewUploadUrl: await createSignedPutUrl(previewKey)
    };
  }));
}

async function persistImageList(images) {
  if (!isOssEnabled()) return images;
  const persisted = [];
  for (const [index, image] of (images || []).entries()) {
    if (image.storageKey) {
      persisted.push(stripTransientImageUrls(image));
      continue;
    }
    if (!isImageDataUrl(image.dataUrl)) continue;
    const original = parseDataUrl(image.dataUrl);
    const preview = isImageDataUrl(image.previewDataUrl) ? parseDataUrl(image.previewDataUrl) : original;
    const storageKey = createAssetKey(image.name || `作文图片${index + 1}.jpg`, "original");
    const previewStorageKey = createAssetKey(image.name || `作文图片${index + 1}.jpg`, "preview");
    await putObjectBuffer(storageKey, original.buffer, original.contentType);
    await putObjectBuffer(previewStorageKey, preview.buffer, preview.contentType);
    persisted.push(stripTransientImageUrls({
      ...image,
      storageKey,
      previewStorageKey
    }));
  }
  return persisted;
}

async function hydrateImageListForClient(images) {
  if (!isOssEnabled()) return images || [];
  return Promise.all((images || []).map(async (image) => ({
    ...image,
    dataUrl: image.storageKey ? await createSignedGetUrl(image.storageKey) : image.dataUrl || "",
    previewDataUrl: image.previewStorageKey
      ? await createSignedGetUrl(image.previewStorageKey)
      : (image.storageKey ? await createSignedGetUrl(image.storageKey) : image.previewDataUrl || image.dataUrl || "")
  })));
}

async function materializeImageList(images) {
  if (!isOssEnabled()) return images || [];
  const materialized = [];
  for (const image of images || []) {
    if (isImageDataUrl(image.dataUrl)) {
      materialized.push(image);
      continue;
    }
    if (!image.storageKey) continue;
    const buffer = await getObjectBuffer(image.storageKey);
    const contentType = image.type || "image/jpeg";
    materialized.push({
      ...image,
      dataUrl: `data:${contentType};base64,${buffer.toString("base64")}`,
      previewDataUrl: ""
    });
  }
  return materialized;
}

function collectImageObjectKeys(items) {
  return (items || []).flatMap((item) => (item.imageData || []).flatMap((image) => (
    [image.storageKey, image.previewStorageKey].filter(Boolean)
  )));
}

function stripTransientImageUrls(image) {
  return {
    ...image,
    dataUrl: "",
    previewDataUrl: ""
  };
}

function createAssetKey(fileName, variant) {
  const prefix = String(process.env.OSS_ASSET_PREFIX || DEFAULT_ASSET_PREFIX).replace(/^\/+|\/+$/g, "");
  const safeName = sanitizeFileName(fileName);
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix}/${date}/${crypto.randomUUID()}-${variant}-${safeName}`;
}

function sanitizeFileName(value) {
  const safe = String(value || "image.jpg")
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-96);
  return safe || "image.jpg";
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl).match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match) throw new Error("图片数据格式不正确");
  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], "base64")
  };
}

function isImageDataUrl(value) {
  return typeof value === "string" && value.startsWith("data:image/");
}

function getSignedGetUrlTtl() {
  const configured = Number(process.env.OSS_SIGNED_URL_TTL_SECONDS || DEFAULT_SIGNED_URL_TTL_SECONDS);
  return Math.max(300, Math.min(24 * 60 * 60, Number.isFinite(configured) ? configured : DEFAULT_SIGNED_URL_TTL_SECONDS));
}

function assertObjectKey(value) {
  const key = String(value || "").replace(/^\/+/, "");
  if (!key || key.includes("..") || key.includes("\\")) {
    throw new Error("OSS Object Key 不合法");
  }
  return key;
}

module.exports = {
  _setClientForTests: setClientForTests,
  _setClientsForTests: setClientsForTests,
  collectImageObjectKeys,
  createImageUploadSlots,
  createSignedGetUrl,
  deleteObjectKeys,
  getObjectBuffer,
  getStorageRuntimeInfo,
  hydrateImageListForClient,
  isOssEnabled,
  materializeImageList,
  persistImageList,
  putObjectBuffer
};
