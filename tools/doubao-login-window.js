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

async function hasVisibleLoginButton(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return (
        rect.width > 8 &&
        rect.height > 8 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity || 1) > 0
      );
    };
    return Array.from(document.querySelectorAll("button,[role='button']"))
      .filter(visible)
      .some((el) => (el.innerText || "").trim() === "登录");
  });
}

async function run() {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    executablePath: CHROME_PATH,
    viewport: { width: 1440, height: 900 },
  });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto("https://www.doubao.com/chat/", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });

  console.log("请在打开的豆包窗口里登录。右上角黑色“登录”按钮消失后，脚本会自动继续。");
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(3000);
    if (!(await hasVisibleLoginButton(page))) {
      console.log("LOGIN_READY");
      await context.close();
      return;
    }
    console.log("WAITING_LOGIN");
  }

  await context.close();
  throw new Error("等待登录超时：豆包页面仍显示“登录”按钮");
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
