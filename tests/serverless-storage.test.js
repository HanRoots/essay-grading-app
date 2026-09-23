const assert = require("assert");

process.env.STORAGE_DRIVER = "oss";
process.env.OSS_REGION = "oss-cn-hangzhou";
process.env.OSS_BUCKET = "test-bucket";
process.env.OSS_ACCESS_KEY_ID = "test-access-key";
process.env.OSS_ACCESS_KEY_SECRET = "test-access-secret";

const storage = require("../backend/oss-storage");

const objects = new Map();
const objectVersions = new Map();
let getObjectCalls = 0;
let lastPutOptions = null;
let injectDataConflict = false;
const getEtag = (name) => `\"v${objectVersions.get(name) || 0}\"`;
const mockClient = {
  async get(name) {
    getObjectCalls += 1;
    if (!objects.has(name)) {
      const error = new Error("not found");
      error.status = 404;
      throw error;
    }
    return {
      content: Buffer.from(objects.get(name)),
      res: { headers: { etag: getEtag(name) } }
    };
  },
  async put(name, content, options) {
    lastPutOptions = options;
    if (injectDataConflict && name === "essay-grading/data/app-data.json" && options?.headers?.["If-Match"]) {
      const external = JSON.parse(objects.get(name).toString("utf8"));
      external.queueItems.unshift({ id: "q-external", student: "另一实例保存的任务" });
      objects.set(name, Buffer.from(JSON.stringify(external)));
      objectVersions.set(name, (objectVersions.get(name) || 0) + 1);
      injectDataConflict = false;
    }
    const ifMatch = options?.headers?.["If-Match"];
    const ifNoneMatch = options?.headers?.["If-None-Match"];
    if ((ifMatch && ifMatch !== getEtag(name)) || (ifNoneMatch === "*" && objects.has(name))) {
      const error = new Error("precondition failed");
      error.status = 412;
      error.code = "PreconditionFailed";
      throw error;
    }
    objects.set(name, Buffer.from(content));
    objectVersions.set(name, (objectVersions.get(name) || 0) + 1);
    return { name };
  },
  async delete(name) {
    objects.delete(name);
  },
  async deleteMulti(names) {
    names.forEach((name) => objects.delete(name));
  },
  signatureUrlV4(method, expires, options, name) {
    throw new Error("服务器 OSS 客户端不能用于生成浏览器签名 URL");
  }
};

const publicClient = {
  signatureUrlV4(method, expires, options, name) {
    const params = new URLSearchParams({ method, expires: String(expires) });
    Object.entries(options?.queries || {}).forEach(([key, value]) => params.set(key, value));
    return `https://test-bucket.oss-cn-hangzhou.aliyuncs.com/${name}?${params.toString()}`;
  }
};

storage._setClientsForTests({ serverClient: mockClient, publicClient });

async function run() {
  assert.deepStrictEqual(storage.getStorageRuntimeInfo(), {
    driver: "oss",
    directUploads: true,
    bucket: "test-bucket",
    region: "oss-cn-hangzhou"
  });

  const uploadSlots = await storage.createImageUploadSlots([
    { id: "page-1", name: "第一页.jpg" },
    { id: "page-2", name: "第二页.jpg" }
  ]);
  assert.strictEqual(uploadSlots.length, 2);
  assert.notStrictEqual(uploadSlots[0].storageKey, uploadSlots[1].storageKey);
  assert.match(uploadSlots[0].uploadUrl, /^https:\/\//);
  const learningSheetUrl = await storage.createSignedGetUrl("essay-grading/learning-sheets/g3a-u1.pdf", 900, {
    contentDisposition: "attachment; filename=\"g3a-u1.pdf\""
  });
  assert.match(learningSheetUrl, /^https:\/\//);
  assert.match(learningSheetUrl, /response-content-disposition=attachment/);

  await storage.putObjectBuffer("essay-grading/learning-sheets/test.pdf", Buffer.from("pdf"), "application/pdf", {
    contentDisposition: "attachment; filename=\"test.pdf\""
  });
  assert.strictEqual(lastPutOptions.headers["Content-Type"], "application/pdf");
  assert.strictEqual(lastPutOptions.headers["Content-Disposition"], "attachment; filename=\"test.pdf\"");

  const pageContent = Buffer.from("serverless-image-test");
  const pageDataUrl = `data:image/jpeg;base64,${pageContent.toString("base64")}`;
  const persistedImages = await storage.persistImageList([{
    id: "page-1",
    name: "作文第一页.jpg",
    type: "image/jpeg",
    dataUrl: pageDataUrl,
    previewDataUrl: pageDataUrl
  }]);
  assert.strictEqual(persistedImages.length, 1);
  assert.ok(persistedImages[0].storageKey);
  assert.strictEqual(persistedImages[0].dataUrl, "");

  const hydratedImages = await storage.hydrateImageListForClient(persistedImages);
  assert.match(hydratedImages[0].dataUrl, /^https:\/\//);
  const materializedImages = await storage.materializeImageList(persistedImages);
  assert.strictEqual(materializedImages[0].dataUrl, pageDataUrl);

  const { readData, updateData, _clearOssDataCacheForTests } = require("../backend/data-store");
  _clearOssDataCacheForTests();
  const seed = await readData();
  assert.ok(Array.isArray(seed.promptLibrary));
  const readsAfterSeed = getObjectCalls;
  await readData();
  assert.strictEqual(getObjectCalls, readsAfterSeed + 1, "each OSS read should observe the latest shared state");
  await updateData((data) => {
    const oldPrompt = data.promptLibrary.find((item) => item.id === "g3a-u3");
    Object.assign(oldPrompt, {
      title: "我来编童话",
      status: "本地已配置",
      catalogVersion: 1,
      requirements: ["旧版要求"]
    });
  });
  const migrated = await readData();
  const migratedPrompt = migrated.promptLibrary.find((item) => item.id === "g3a-u3");
  assert.strictEqual(migratedPrompt.title, "续写故事");
  assert.strictEqual(migratedPrompt.catalogVersion, 2);
  assert.strictEqual(migratedPrompt.requirements.length, 24);
  await updateData((data) => {
    data.modelConfig.apiKey = "must-not-persist";
    data.queueItems = [{
      id: "q-test",
      imageData: persistedImages,
      report: {
        id: "r-test",
        sourceImages: hydratedImages,
        summary: "test"
      }
    }];
  });
  const storedState = JSON.parse(objects.get("essay-grading/data/app-data.json").toString("utf8"));
  assert.strictEqual(storedState.modelConfig.apiKey, "");
  assert.strictEqual(storedState.queueItems[0].report.sourceImages, undefined);
  assert.strictEqual(storedState.queueItems[0].report.summary, "test");

  injectDataConflict = true;
  await updateData((data) => {
    data.queueItems.unshift({ id: "q-local", student: "当前请求保存的任务" });
  });
  const conflictSafeState = JSON.parse(objects.get("essay-grading/data/app-data.json").toString("utf8"));
  assert.ok(conflictSafeState.queueItems.some((item) => item.id === "q-external"));
  assert.ok(conflictSafeState.queueItems.some((item) => item.id === "q-local"));

  await storage.deleteObjectKeys(storage.collectImageObjectKeys(storedState.queueItems));
  assert.strictEqual(objects.has(persistedImages[0].storageKey), false);
  console.log("serverless storage test passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
