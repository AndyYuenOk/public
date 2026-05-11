async function operator(proxies, targetPlatform, context) {
  const fs = require("fs");
  const path = require("path");
  fs.writeFileSync(
    "/opt/app/data/sub-store-debug.log",
    JSON.stringify(process, null, 2),
    "utf8",
  );
}
