"use strict";

let enableFallback = $arguments.fallback;
let regions, allowPatterns, blockPatterns, ai;

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

try {
  aiPatterns = JSON.parse($arguments.ai ?? '["GPT","GM"]');
} catch {
  aiPatterns = [$arguments.ai];
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
  if (typeof provider === "string") {
    providers[provider] = {
      type: "http",
      behavior: provider.includes("idr") ? "ipcidr" : "domain",
      url: `https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/${provider}.txt`, // 修复：这里应该是 provider 而不是 name
      interval: 86400,
      path: `./ruleset/${provider}.yaml`, // 建议加上路径
    };
  } else {
    // 处理已经定义的特殊对象 (如 adblockfilters)
    const key = Object.keys(provider)[0];
    providers[key] = {
      ...provider[key],
      type: "http",
      behavior: provider[key].behavior ?? "domain",
      interval: 86400,
      path: `./ruleset/${key}.yaml`,
    };
  }
  return providers;
}, {});

// https://github.com/Loyalsoldier/clash-rules
// https://github.com/Loyalsoldier/v2ray-rules-dat
// https://github.com/v2fly/domain-list-community/tree/master/data
// Rule order is top-down; earlier entries have higher priority.
let routingRules = [
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

  "RULE-SET,icloud,DIRECT",
  "RULE-SET,apple,DIRECT",
  "RULE-SET,google,Proxy",
  "RULE-SET,proxy,Proxy",
  "RULE-SET,direct,DIRECT",
  "RULE-SET,lancidr,DIRECT",
  "RULE-SET,cncidr,DIRECT",
  "RULE-SET,telegramcidr,Proxy",

  "GEOIP,LAN,DIRECT",
  "GEOIP,CN,DIRECT",
  "MATCH,Final",
];

Object.values(ruleProviders).forEach((provider) => {
  provider.type = "http";
  provider.interval = 86400;
});

let strategyGroups = [
  {
    name: "AutoAI",
    icon: "Urltest.png",
    type: "url-test",
    url: "http://www.gstatic.com/generate_204",
    interval: 300,
    tolerance: 50,
    proxies: [],
  },
  {
    name: "Proxy",
    icon: "Static.png",
    type: "select",
    proxies: [],
  },
  {
    name: "AI",
    icon: "OpenAI.png",
    type: "select",
    proxies: ["AutoAI"],
  },
  {
    name: "Netflix",
    icon: "Netflix.png",
    type: "select",
    proxies: ["Proxy"],
  },
  {
    name: "Microsoft",
    icon: "Microsoft.png",
    type: "select",
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

function main(config) {
  const userinfoSubName = $arguments?.userinfo_sub_name;
  if (userinfoSubName) {
    setSubUserinfo(userinfoSubName);
  }

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

  let ProxyProxies = strategyGroups.find(
    ({ name }) => name == "Proxy",
  ).proxies;
  let fullNodeGroupNames = ["Proxy", "AI", "Netflix"];

  let autoSelectGroup,
    healthCheck = {
      url: "http://www.gstatic.com/generate_204",
      interval: 300,
      tolerance: 50,
    };

  if (enableFallback) {
    autoSelectGroup = {
      name: "Fallback",
      icon: "Auto.png",
      type: "fallback",
      proxies: [],
    };

    // Group proxies by the second token in name, e.g. `HK xxx`, `JP xxx`.
    const airportProxyMap = config.proxies.reduce(
      (airportProxyMap, { name }) => {
        (airportProxyMap[name.split(" ")[1]] ??= []).push(name);
        return airportProxyMap;
      },
      {},
    );

    Object.entries(airportProxyMap).forEach(
      ([airportCode, airportProxies], groupInsertIndex) => {
        // Create one url-test group per airport.
        strategyGroups.splice(groupInsertIndex, 0, {
          name: "Auto" + airportCode,
          icon: "Urltest.png",
          type: "url-test",
          proxies: airportProxies,
        });
        autoSelectGroup.proxies.push("Auto" + airportCode);
      },
    );
  } else {
    autoSelectGroup = {
      name: "Auto",
      icon: "Auto.png",
      type: "url-test",
      proxies: [],
    };

    fullNodeGroupNames.unshift("Auto");
  }

  strategyGroups.unshift({ ...autoSelectGroup, ...healthCheck });

  ProxyProxies.push(autoSelectGroup.name);

  let allProxyNames = config.proxies.map((proxy) => proxy.name);

  for (const group of strategyGroups) {
    group.icon =
      "https://raw.githubusercontent.com/Orz-3/mini/master/Color/" + group.icon;

    // Append all nodes to common manual selection groups for fallback use.
    if (fullNodeGroupNames.includes(group.name)) {
      group.proxies = group.proxies.concat(allProxyNames);
    }

    if (group.name == "AutoAI") {
      if (aiPatterns.length) {
        group.proxies = allProxyNames.filter((name) =>
          aiPatterns.every((pattern) => RegExp(pattern).test(name)),
        );
      }

      group.proxies = group.proxies.length ? group.proxies : allProxyNames;
    }
  }

  config["proxy-groups"] = strategyGroups;

  return config;
}

function setSubUserinfo(subcriptionName) {
  const subscriptions = $substore.read("subs") || [];

  for (const subscription of subscriptions) {
    if (subscription.name === subcriptionName) {
      $options ??= {};
      $options._res = {
        headers: {
          "subscription-userinfo": subscription.subUserinfo,
        },
      };
    }
  }
}

if ($content) {
  $content = ProxyUtils.yaml.dump(main(ProxyUtils.yaml.load($content)));
}
