const assert = require("assert");

process.env.STORAGE_DRIVER = "oss";
process.env.OSS_REGION = "oss-cn-hangzhou";
process.env.OSS_BUCKET = "test-bucket";
process.env.OSS_ACCESS_KEY_ID = "test-access-key";
process.env.OSS_ACCESS_KEY_SECRET = "test-access-secret";

const storage = require("../backend/oss-storage");

const objects = new Map();
let getObjectCalls = 0;
let lastPutOptions = null;
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
      res: { headers: { etag: "\"test-etag\"" } }
    };
  },
  async put(name, content, options) {
    lastPutOptions = options;
    const ifMatch = options?.headers?.["If-Match"];
    const ifNoneMatch = options?.headers?.["If-None-Match"];
    if (ifMatch || ifNoneMatch) {
      const error = new Error("PutObject does not support conditional headers");
      error.status = 400;
      error.code = "NotImplemented";
      throw error;
    }
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
    const oldThirdUnit = data.promptLibrary.find((item) => item.id === "g3b-u3");
    Object.assign(oldThirdUnit, {
      title: "中华传统节日",
      type: "节日文化",
      status: "本地已配置",
      catalogVersion: 1,
      requirements: ["旧版第三单元要求"]
    });
    const oldFourthUnit = data.promptLibrary.find((item) => item.id === "g3b-u4");
    Object.assign(oldFourthUnit, {
      title: "我做了一项小实验",
      type: "实验记录",
      status: "本地已配置",
      catalogVersion: 1,
      requirements: ["旧版第四单元要求"]
    });
    data.queueItems.push({
      id: "q-old-festival",
      promptId: "g3b-u3",
      grade: "三年级",
      book: "下册",
      unit: "第三单元",
      meta: "三年级下册 第三单元 中华传统节日",
      report: {
        id: "r-old-festival",
        prompt: {
          id: "g3b-u3",
          grade: "三年级",
          book: "下册",
          unit: "第三单元",
          title: "中华传统节日"
        },
        requirements: [{ label: "选择一个传统节日", level: "良好" }]
      }
    });
    data.reports.push({
      id: "r-old-experiment",
      prompt: {
        id: "g3b-u4",
        grade: "三年级",
        book: "下册",
        unit: "第四单元",
        title: "我做了一项小实验"
      },
      requirements: [{ label: "写清楚实验步骤", level: "优秀" }]
    });
    data.submissions.push({
      id: "s-old-experiment",
      promptId: "g3b-u4",
      grade: "三年级",
      book: "下册",
      unit: "第四单元",
      meta: "三年级下册 第四单元 我做了一项小实验"
    });
  });
  const migrated = await readData();
  const migratedPrompt = migrated.promptLibrary.find((item) => item.id === "g3a-u3");
  assert.strictEqual(migratedPrompt.title, "续写故事");
  assert.strictEqual(migratedPrompt.catalogVersion, 2);
  assert.strictEqual(migratedPrompt.requirements.length, 24);
  const migratedThirdUnit = migrated.promptLibrary.find((item) => item.id === "g3b-u3");
  const migratedFourthUnit = migrated.promptLibrary.find((item) => item.id === "g3b-u4");
  assert.strictEqual(migratedThirdUnit.title, "我做了一项小实验");
  assert.strictEqual(migratedThirdUnit.type, "实验记录");
  assert.strictEqual(migratedThirdUnit.catalogVersion, 2);
  assert.strictEqual(migratedFourthUnit.title, "中华传统节日");
  assert.strictEqual(migratedFourthUnit.type, "节日文化");
  assert.strictEqual(migratedFourthUnit.catalogVersion, 2);
  const migratedFestivalTask = migrated.queueItems.find((item) => item.id === "q-old-festival");
  assert.strictEqual(migratedFestivalTask.promptId, "g3b-u4");
  assert.strictEqual(migratedFestivalTask.unit, "第四单元");
  assert.strictEqual(migratedFestivalTask.meta, "三年级下册 第四单元 中华传统节日");
  assert.strictEqual(migratedFestivalTask.report.prompt.id, "g3b-u4");
  assert.strictEqual(migratedFestivalTask.report.prompt.title, "中华传统节日");
  assert.strictEqual(migratedFestivalTask.report.requirements[0].level, "良好");
  const migratedExperimentReport = migrated.reports.find((item) => item.id === "r-old-experiment");
  assert.strictEqual(migratedExperimentReport.prompt.id, "g3b-u3");
  assert.strictEqual(migratedExperimentReport.prompt.unit, "第三单元");
  assert.strictEqual(migratedExperimentReport.prompt.title, "我做了一项小实验");
  assert.strictEqual(migratedExperimentReport.requirements[0].level, "优秀");
  const migratedExperimentSubmission = migrated.submissions.find((item) => item.id === "s-old-experiment");
  assert.strictEqual(migratedExperimentSubmission.promptId, "g3b-u3");
  assert.strictEqual(migratedExperimentSubmission.unit, "第三单元");
  assert.strictEqual(migratedExperimentSubmission.meta, "三年级下册 第三单元 我做了一项小实验");
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

  await updateData((data) => {
    data.queueItems.unshift({ id: "q-local", student: "当前请求保存的任务" });
  });
  const savedState = JSON.parse(objects.get("essay-grading/data/app-data.json").toString("utf8"));
  assert.ok(savedState.queueItems.some((item) => item.id === "q-local"));
  assert.strictEqual(lastPutOptions.headers["If-Match"], undefined);
  assert.strictEqual(lastPutOptions.headers["If-None-Match"], undefined);

  await updateData((data) => {
    data.queueItems.unshift({
      id: "q-stale-error",
      status: "failed",
      gradingError: "A header you provided implies functionality that is not implemented."
    });
  });
  const recoveredState = await readData();
  const recoveredItem = recoveredState.queueItems.find((item) => item.id === "q-stale-error");
  assert.strictEqual(recoveredItem.status, "draft");
  assert.strictEqual(recoveredItem.gradingError, "");

  await storage.deleteObjectKeys(storage.collectImageObjectKeys(storedState.queueItems));
  assert.strictEqual(objects.has(persistedImages[0].storageKey), false);
  console.log("serverless storage test passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
