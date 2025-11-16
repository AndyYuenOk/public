// ============================================================
// 🔧 FIClash 动态配置脚本
// 作者：萌森工作室
// 说明：Clash / FIClash 在加载配置时调用 main(config)，返回修改后的配置
//
// ✅ 使用说明：
// 1️⃣ 在 `PROXY_GROUPS` 中定义一个或多个代理组。
//     - 每个组可直接列出 proxies（精确名称）
//     - 或用 `match` 定义一个正则（自动匹配所有代理名）
//
// 2️⃣ 在 `NEW_RULES` 中添加规则（会插入在 MATCH / FINAL 之前）
//
// 🔍 模糊匹配示例：
//     match: /(香港|台湾|新加坡)/   → 自动匹配所有包含这些词的代理
//
// ============================================================


// ======= 用户配置区 =======

// 覆盖的代理组
const PROXY_GROUPS = [
  {
    name: "港湾",
    type: "select",
    match: /(香港|台湾)/,
  },
  {
    name: "新日韩",
    type: "select",
    match: /(新加坡|日本|韩国)/,
  },
  {
    name: "优选",
    type: "select",
    proxies: [
      "🇭🇰【亚洲】香港01丨直连",
      "🇹🇼【亚洲】台湾家宽01丨直连",
    ],
  },
];

// 覆盖的规则
const NEW_RULES = [
  "DOMAIN-SUFFIX,javdb.com,港湾",
  "DOMAIN-SUFFIX,javdb562.com,港湾",
];


// ======= 核心逻辑 =======

const main = (config) => {
  console.log("🚀 FIClash 脚本开始执行");

  // 确保关键字段存在
  config.proxies ??= [];
  config["proxy-groups"] ??= [];
  config.rules ??= [];

  const allProxyNames = config.proxies.map(p => p.name);
  const groups = config["proxy-groups"];

  // === 处理代理组 ===
  for (const groupDef of PROXY_GROUPS) {
    let proxies = [];

    if (groupDef.proxies && Array.isArray(groupDef.proxies)) {
      // 直接使用手动列出的 proxies
      proxies = groupDef.proxies;
    } else if (groupDef.match instanceof RegExp) {
      // 模糊匹配（正则）
      proxies = allProxyNames.filter(name => groupDef.match.test(name));
    }

    if (proxies.length === 0) {
      console.log(`⚠️ 代理组 [${groupDef.name}] 未匹配到任何节点`);
      continue;
    }

    const newGroup = {
      name: groupDef.name,
      type: groupDef.type || "select",
      proxies,
    };

    // 防止重复添加
    const exists = groups.some(g => g.name === newGroup.name);
    if (!exists) {
      groups.push(newGroup);
      console.log(`✅ 添加代理组：${newGroup.name}（${proxies.length} 节点）`);
    } else {
      console.log(`⚠️ 已存在代理组：${newGroup.name}`);
    }
  }

  // === 处理规则 ===
  const rules = config.rules;
  const upperRules = rules.map(r => r.toUpperCase().trim());

  // 插入点：第一个 MATCH / FINAL
  let insertIndex = rules.findIndex(r => {
    const u = r.toUpperCase();
    return u.startsWith("MATCH") || u.startsWith("FINAL");
  });
  if (insertIndex === -1) insertIndex = rules.length;

  let addedCount = 0;
  for (const rule of NEW_RULES) {
    const upper = rule.toUpperCase().trim();
    if (!upperRules.includes(upper)) {
      rules.splice(insertIndex, 0, rule);
      insertIndex++;
      addedCount++;
    }
  }

  if (addedCount > 0) {
    console.log(`✅ 添加规则 ${addedCount} 条`);
  } else {
    console.log("⚠️ 无需添加规则（均已存在）");
  }

  console.log("🎉 FIClash 配置更新完成");
  return config;
};
