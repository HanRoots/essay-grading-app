const assert = require("assert");

process.env.STORAGE_DRIVER = "oss";
process.env.OSS_REGION = "oss-cn-hangzhou";
process.env.OSS_BUCKET = "test-bucket";
process.env.OSS_ACCESS_KEY_ID = "test-access-key";
process.env.OSS_ACCESS_KEY_SECRET = "test-access-secret";

const storage = require("../backend/oss-storage");

const objects = new Map();
let getObjectCalls = 0;
const mockClient = {
  async get(name) {
    getObjectCalls += 1;
    if (!objects.has(name)) {
      const error = new Error("not found");
      error.status = 404;
      throw error;
    }
    return { content: Buffer.from(objects.get(name)) };
  },
  async put(name, content) {
    objects.set(name, Buffer.from(content));
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
    return `https://test-bucket.oss-cn-hangzhou.aliyuncs.com/${name}?method=${method}&expires=${expires}`;
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
  assert.strictEqual(getObjectCalls, readsAfterSeed, "consecutive OSS reads should use the short-lived cache");
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

  await storage.deleteObjectKeys(storage.collectImageObjectKeys(storedState.queueItems));
  assert.strictEqual(objects.has(persistedImages[0].storageKey), false);
  console.log("serverless storage test passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
