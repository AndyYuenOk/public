const fs = eval(`require("fs")`);
const path = eval(`require("path")`);
fs.writeFileSync(
  "/opt/app/data/sub-store-debug.log",
  JSON.stringify(process, null, 2),
  "utf8",
);
