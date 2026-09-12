const assert = require("assert");
const fs = require("fs");
const path = require("path");

const serverSource = fs.readFileSync(path.join(__dirname, "..", "backend", "server.js"), "utf8");

assert.match(
  serverSource,
  /const CORS_ALLOWED_HEADERS = "Authorization, Content-Type, X-Teacher-Id, X-App-Client-Id"/
);

console.log("CORS client header test passed");
