let enableFallback = $arguments.fallback || $file.sourceType == "collection";
let isMainProxyGroupOnly = /true|1/i.test(
  $arguments.proxy_group_only ?? enableFallback,
);

let enableSmart = /true|1/i.test($options?._req?.query?.smart),
  autoType = enableSmart ? "smart" : "url-test";
let regions, allowPatterns, blockPatterns;

try {
  regions = JSON.parse($arguments.regions ?? "[]");
} catch {
  regions = [$arguments.regions];
}

try {
  allowPatterns = JSON.parse($arguments.allow ?? "[]");
} catch {
  allowPatterns = [$arguments.allow];
}

try {
  blockPatterns = JSON.parse($arguments.block ?? "[]");
} catch {
  blockPatterns = [$arguments.block];
}

// 使用 reduce 将数组转换为单个对象
let ruleProviders = [
  "reject",
  "icloud",
  "apple",
  "google",
  "proxy",
  "direct",
  "private",
  // "gfw",
  // "tld-not-cn",
  "telegramcidr",
  "cncidr",
  "lancidr",
  // "applications",
  // {
  //   adblockfilters: {
  //     url: "https://raw.githubusercontent.com/217heidai/adblockfilters/main/rules/adblockmihomo.yaml",
  //   },
  // },
].reduce((providers, provider) => {
  let providerName;

  if (typeof provider === "string") {
    providerName = provider;
    providers[providerName] = {
      url: `https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/${providerName}.txt`,
    };
  } else {
    // 处理已经定义的特殊对象 (如 adblockfilters)
    providerName = Object.keys(provider)[0];
  }

  providers[providerName].type = "http";
  providers[providerName].interval = 86400;
  providers[providerName].behavior = providerName.includes("idr")
    ? "ipcidr"
    : "domain";
  providers[providerName].path = `./rules/${providerName}.yaml`;

  return providers;
}, {});

// https://github.com/Loyalsoldier/clash-rules
// https://github.com/Loyalsoldier/v2ray-rules-dat
// https://github.com/v2fly/domain-list-community/tree/master/data
// Rule order is top-down; earlier entries have higher priority.
let routingRules = [
  "RULE-SET,lancidr,DIRECT",
  "RULE-SET,private,DIRECT",
  "RULE-SET,reject,Reject",
  // "RULE-SET,adblockfilters,Reject",

  "DOMAIN-SUFFIX,pairdrop.net,DIRECT",
  "DOMAIN-SUFFIX,gh-proxy.com,DIRECT",
  "DOMAIN-SUFFIX,ghfast.top,DIRECT",
  "DOMAIN-SUFFIX,host.docker.internal,DIRECT",

  "GEOSITE,category-ai-!cn,AI",
  "GEOSITE,anthropic,AI",
  "GEOSITE,microsoft,Microsoft",
  "GEOSITE,netflix,Netflix",

  "RULE-SET,google,Proxy",
  "RULE-SET,telegramcidr,Proxy",
  "RULE-SET,apple,DIRECT",
  "RULE-SET,icloud,DIRECT",

  "RULE-SET,proxy,Proxy",
  "RULE-SET,direct,DIRECT",
  "RULE-SET,cncidr,DIRECT",

  "GEOIP,LAN,DIRECT",
  "GEOIP,CN,DIRECT",
  "MATCH,Final",
];

let strategyGroups = [
  {
    name: "AI",
    icon: "OpenAI.png",
    type: autoType,
    "include-all": true,
    filter: "AI",
  },
  {
    name: "Netflix",
    icon: "Netflix.png",
    type: "select",
    "include-all": true,
    proxies: ["Proxy"],
  },
  {
    name: "Microsoft",
    icon: "Microsoft.png",
    type: "select",
    "include-all": true,
    proxies: ["Proxy", "DIRECT"],
  },

  {
    name: "Reject",
    icon: "Adblock.png",
    type: "select",
    proxies: ["REJECT", "DIRECT"],
  },

  // {
  //   name: "Direct",
  //   icon: "China.png",
  //   type: "select",
  //   proxies: ["DIRECT"],
  // },

  {
    name: "Final",
    icon: "Final.png",
    type: "select",
    proxies: ["Proxy", "DIRECT"],
  },
];

function main(config = {}) {
  config["geodata-mode"] = true;
  config["geox-url"] = {
    geosite:
      "https://cdn.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geosite.dat",
  };

  // Inject rules and provider definitions.
  config.rules = routingRules;
  config["rule-providers"] = ruleProviders;

  if (regions.length) {
    config.proxies = config.proxies.filter(({ name }) =>
      regions.some((pattern) => RegExp(pattern).test(name)),
    );
  }

  if (allowPatterns.length) {
    config.proxies = config.proxies.filter(({ name }) =>
      allowPatterns.some((pattern) => RegExp(pattern).test(name)),
    );
  }

  if (blockPatterns.length) {
    config.proxies = config.proxies.filter(
      ({ name }) =>
        !blockPatterns.some((pattern) => RegExp(pattern).test(name)),
    );
  }

  let subs = $substore
    .read("subs")
    .filter(
      (sub) => sub.tag.includes("TimeLimited") || sub.tag.includes("NoExpiry"),
    );

  enableFallback = subs.length > 1;

  let mainProxyGroup = {
    name: "Proxy",
    icon: "Static.png",
    type: "select",
    proxies: [],
  };

  config["proxy-providers"] ??= {};

  let autoSelectGroup,
    autoTimeLimitedGroup,
    autoNoExpiryGroup,
    airportGroups = [],
    healthCheck = {
      // url: "https://www.gstatic.com/generate_204",
      url: "https://cp.cloudflare.com/generate_204",
      timeout: 1500,
      tolerance: 200,
      "max-failed-times": 1,
    };

  if (enableFallback) {
    autoSelectGroup = {
      name: "Fallback",
      icon: "Auto.png",
      type: "fallback",
      proxies: ["Auto_TimeLimited", "Auto_NoExpiry"],
    };
    autoTimeLimitedGroup = {
      name: "Auto_TimeLimited",
      type: "url-test",
      proxies: [],
    };
    autoNoExpiryGroup = {
      name: "Auto_NoExpiry",
      type: "url-test",
      proxies: [],
    };

    const userInfoMap = getSubUserinfo();
    if (enableFallback) {
      let first = Object.values(userInfoMap)
        .sort((a, b) => {
          const aRemaining = a.total - a.usage.upload - a.usage.download;
          const bRemaining = b.total - b.usage.upload - b.usage.download;
          return aRemaining - bRemaining;
        })
        .find((info) => info.usage.upload + info.usage.download < info.total);

      if (first) {
        $options ??= {};
        $options._res = {
          headers: {
            "subscription-userinfo": `upload=${first.usage.upload}; download=${first.usage.download}; total=${first.total}; expire=${first.expires}`,
          },
        };
      }
    }

    subs.forEach((sub) => {
      const userInfo = userInfoMap[sub.name];
      if (
        userInfo &&
        userInfo.usage.upload + userInfo.usage.download >= userInfo.total
      ) {
        return;
      }

      let name = sub.displayName;

      config["proxy-providers"][name] = {
        type: "http",
        url: `http://${$options?._req?.headers?.host}${process.env.SUB_STORE_FRONTEND_BACKEND_PATH}/download/${sub.name}/ClashMeta`,
        interval: 86400,
        path: `./proxies/${name}.yaml`,
        "health-check": {
          enable: true,
          url: healthCheck.url,
        },
      };

      airportGroups.push({
        name: "Auto_" + name,
        type: autoType,
        use: [name],
      });

      if (sub.tag.includes("TimeLimited")) {
        autoTimeLimitedGroup.proxies.push("Auto_" + name);
      }
      if (sub.tag.includes("NoExpiry")) {
        autoNoExpiryGroup.proxies.push("Auto_" + name);
      }
    });
  } else {
    autoSelectGroup = {
      name: "Auto",
      type: autoType,
      proxies: [],
    };
  }

  mainProxyGroup.proxies.push(
    autoSelectGroup.name,
    ...(enableFallback ? airportGroups.map((group) => group.name) : []),
  );

  strategyGroups.unshift(
    mainProxyGroup,
    autoSelectGroup,
    ...(enableFallback ? [autoTimeLimitedGroup, autoNoExpiryGroup] : []),
    ...airportGroups,
  );

  for (const group of strategyGroups) {
    if (group.name.includes("Auto")) {
      group.icon = "Auto.png";
    }

    group.icon =
      "https://raw.githubusercontent.com/Orz-3/mini/master/Color/" + group.icon;

    if (group.type === "fallback") {
      group.url = healthCheck.url;
      group.interval = healthCheck.interval;
    }

    if (group.type === "url-test") {
      Object.assign(group, healthCheck);
    }

    if (group.type === "smart") {
      group.uselightgbm = true;
    }
  }

  config["proxy-groups"] = strategyGroups;

  $options ??= {};
  $options._res ??= {};
  $options._res.headers ??= {};
  $options._res.headers["content-disposition"] =
    'attachment; filename="Fallback' + (enableSmart ? "-Smart" : "") + '"';

  return config;
}

function getSubUserinfo() {
  const subscriptions = $substore.read("subs") || [];
  const headers = JSON.parse(
    $substore.read("#sub-store-cached-headers-resource"),
  );
  let userInfoMap = {};

  for (const subscription of subscriptions) {
    if (!subscription.tag.includes("NoExpiry")) {
      if (subscription?.subUserinfo) {
        userInfoMap[subscription.name] = flowUtils.parseFlowHeaders(
          subscription.subUserinfo,
        );
      } else {
        const id = ProxyUtils.hex_md5(
          `clash.meta/v1.19.24${subscription.url.split("#")[0]}`,
        );
        if (headers[id]) {
          userInfoMap[subscription.name] = flowUtils.parseFlowHeaders(
            headers[id].data,
          );
        }
      }
    }
  }

  return userInfoMap;
}

if (typeof $content === "string") {
  $content = ProxyUtils.yaml.dump(main(ProxyUtils.yaml.load($content)));
}
