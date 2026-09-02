const fs = require("fs");
const path = require("path");

function loadPlaywright() {
  try {
    return require("playwright");
  } catch (error) {
    return require("/Users/han/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
  }
}

const { chromium } = loadPlaywright();

const ROOT = path.resolve(__dirname, "..");
const PROFILE_DIR = process.env.DOUBAO_PROFILE || path.join(ROOT, ".doubao-automation-profile");
const CHROME_PATH =
  process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT_DIR = process.env.DOUBAO_OUT || "/private/tmp/doubao-web-probe";
const DEFAULT_IMAGES = ["/Users/han/Desktop/1.jpg", "/Users/han/Desktop/2.jpg"];

const args = process.argv.slice(2);
const images = args.length ? args : DEFAULT_IMAGES;

function pagePrompt(pageNo) {
  return [
    `请识别这张小学作文图片中的正文，这是第 ${pageNo} 页。`,
    "要求：",
    "1. 只输出本页作文正文，不要点评，不要解释，不要补写内容。",
    "2. 按图片中从上到下的行序输出，尽量保留自然段和换行。",
    "3. 忽略修正栏、日期栏、页边露出的其他页面内容。",
    "4. 看不清的字用□占位。",
  ].join("\n");
}

async function visibleButtonSnapshot(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return (
        rect.width > 6 &&
        rect.height > 6 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity || 1) > 0
      );
    };
    return Array.from(document.querySelectorAll("button,[role='button']"))
      .filter(visible)
      .map((el, index) => {
        const rect = el.getBoundingClientRect();
        return {
          index,
          text: (el.innerText || "").trim().slice(0, 80),
          aria: el.getAttribute("aria-label") || "",
          title: el.getAttribute("title") || "",
          disabled: el.disabled || el.getAttribute("aria-disabled") === "true",
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            right: Math.round(rect.right),
            bottom: Math.round(rect.bottom),
          },
        };
      });
  });
}

async function clickSend(page) {
  const namedLocators = [
    page.getByRole("button", { name: /发送|Send/i }).last(),
    page.locator("button[aria-label*='发送']").last(),
    page.locator("[role='button'][aria-label*='发送']").last(),
    page.locator("button[title*='发送']").last(),
    page.locator("[role='button'][title*='发送']").last(),
  ];

  for (const locator of namedLocators) {
    try {
      if ((await locator.count()) > 0 && (await locator.isVisible()) && (await locator.isEnabled())) {
        await locator.click();
        return { method: "named-locator" };
      }
    } catch (error) {
      // Try the next selector.
    }
  }

  const clicked = await page.evaluate(() => {
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return (
        rect.width > 8 &&
        rect.height > 8 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity || 1) > 0 &&
        el.getAttribute("aria-disabled") !== "true" &&
        !el.disabled
      );
    };
    const candidates = Array.from(document.querySelectorAll("button,[role='button']"))
      .filter(visible)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const name = [
          el.innerText || "",
          el.getAttribute("aria-label") || "",
          el.getAttribute("title") || "",
        ]
          .join(" ")
          .trim();
        return { el, name, rect };
      });

    const named = candidates.filter((item) => /发送|send/i.test(item.name));
    const lowerPanel = candidates
      .filter((item) => item.rect.bottom > window.innerHeight * 0.55)
      .sort((a, b) => b.rect.right - a.rect.right || b.rect.bottom - a.rect.bottom);
    const pick = named[named.length - 1] || lowerPanel[0];
    if (!pick) {
      return null;
    }
    pick.el.click();
    return {
      name: pick.name,
      rect: {
        x: Math.round(pick.rect.x),
        y: Math.round(pick.rect.y),
        width: Math.round(pick.rect.width),
        height: Math.round(pick.rect.height),
      },
    };
  });

  if (!clicked) {
    throw new Error("没有找到可点击的发送按钮");
  }
  return { method: "fallback-visible-button", clicked };
}

async function waitForNewReply(page, beforeText, timeoutMs = 120000) {
  const started = Date.now();
  let bestText = "";
  let stableCount = 0;
  let lastLength = 0;

  while (Date.now() - started < timeoutMs) {
    await page.waitForTimeout(2500);
    const current = await page.locator("body").innerText({ timeout: 10000 });
    if (current.length > bestText.length) {
      bestText = current;
    }
    if (current.length > beforeText.length + 80) {
      if (current.length === lastLength) {
        stableCount += 1;
      } else {
        stableCount = 0;
        lastLength = current.length;
      }
      if (stableCount >= 2) {
        return current;
      }
    }
  }

  return bestText || (await page.locator("body").innerText({ timeout: 10000 }));
}

async function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    executablePath: CHROME_PATH,
    viewport: { width: 1440, height: 900 },
  });
  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(45000);

  const summary = [];
  for (let index = 0; index < images.length; index += 1) {
    const imagePath = images[index];
    if (!fs.existsSync(imagePath)) {
      throw new Error(`图片不存在：${imagePath}`);
    }

    await page.goto("https://www.doubao.com/chat/", {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.waitForTimeout(4000);

    await page.locator("input[type='file']").first().setInputFiles(imagePath);
    await page.waitForTimeout(5000);

    const prompt = pagePrompt(index + 1);
    const input = page.getByPlaceholder("发消息...");
    await input.waitFor({ state: "visible", timeout: 45000 });
    await input.fill(prompt);
    await page.waitForTimeout(1000);

    const buttons = await visibleButtonSnapshot(page);
    fs.writeFileSync(
      path.join(OUT_DIR, `buttons-page-${index + 1}.json`),
      JSON.stringify(buttons, null, 2),
      "utf8"
    );

    const beforeSend = await page.locator("body").innerText({ timeout: 10000 });
    const sendResult = await clickSend(page);
    const finalText = await waitForNewReply(page, beforeSend);

    const textFile = path.join(OUT_DIR, `body-page-${index + 1}.txt`);
    const shotFile = path.join(OUT_DIR, `shot-page-${index + 1}.png`);
    fs.writeFileSync(textFile, finalText, "utf8");
    await page.screenshot({ path: shotFile, fullPage: true });

    summary.push({
      page: index + 1,
      image: imagePath,
      sendResult,
      bodyLengthBefore: beforeSend.length,
      bodyLengthAfter: finalText.length,
      textFile,
      shotFile,
    });
  }

  console.log(JSON.stringify(summary, null, 2));
  await context.close();
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
