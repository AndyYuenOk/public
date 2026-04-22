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
  aiPatterns = JSON.parse($arguments.ai ?? '["GPT"]');
} catch {
  aiPatterns = [$arguments.ai];
}

// Rule order is top-down; earlier entries have higher priority.
let routingRules = [
  "RULE-SET,LocalAreaNetwork (Domain),Direct",
  "RULE-SET,LocalAreaNetwork (IP-CIDR),Direct,no-resolve",
  "RULE-SET,UnBan (Domain),Direct",
  "RULE-SET,adblockclash (Domain),AdBlock",
  "RULE-SET,GoogleCN (Domain),Direct",
  "RULE-SET,SteamCN (Domain),Direct",
  "DOMAIN-KEYWORD,1drv,Microsoft",
  "DOMAIN-KEYWORD,microsoft,Microsoft",
  "RULE-SET,Microsoft (Domain),Microsoft",
  "DOMAIN-KEYWORD,anthropic,AI",
  "DOMAIN-KEYWORD,claude,AI",
  "DOMAIN-KEYWORD,openai,AI",
  "RULE-SET,AI (Domain),AI",
  "RULE-SET,OpenAi (Domain),AI",
  "DOMAIN-KEYWORD,apiproxy-device-prod-nlb-,Netflix",
  "DOMAIN-KEYWORD,dualstack.apiproxy-,Netflix",
  "DOMAIN-KEYWORD,netflixdnstest,Netflix",
  "RULE-SET,Netflix (Domain),Netflix",
  "RULE-SET,Netflix (IP-CIDR),Netflix,no-resolve",
  "DOMAIN-KEYWORD,1e100,Manual",
  "DOMAIN-KEYWORD,abema,Manual",
  "DOMAIN-KEYWORD,appledaily,Manual",
  "DOMAIN-KEYWORD,avtb,Manual",
  "DOMAIN-KEYWORD,beetalk,Manual",
  "DOMAIN-KEYWORD,blogspot,Manual",
  "DOMAIN-KEYWORD,dropbox,Manual",
  "DOMAIN-KEYWORD,facebook,Manual",
  "DOMAIN-KEYWORD,fbcdn,Manual",
  "DOMAIN-KEYWORD,github,Manual",
  "DOMAIN-KEYWORD,gmail,Manual",
  "DOMAIN-KEYWORD,google,Manual",
  "DOMAIN-KEYWORD,instagram,Manual",
  "DOMAIN-KEYWORD,porn,Manual",
  "DOMAIN-KEYWORD,sci-hub,Manual",
  "DOMAIN-KEYWORD,spotify,Manual",
  "DOMAIN-KEYWORD,telegram,Manual",
  "DOMAIN-KEYWORD,twitter,Manual",
  "DOMAIN-KEYWORD,whatsapp,Manual",
  "DOMAIN-KEYWORD,youtube,Manual",
  "DOMAIN-KEYWORD,uk-live,Manual",
  "DOMAIN-KEYWORD,onedrive,Manual",
  "DOMAIN-KEYWORD,skydrive,Manual",
  "DOMAIN-KEYWORD,porn,Manual",
  "DOMAIN-KEYWORD,ttvnw,Manual",
  "RULE-SET,ProxyLite (Domain),Manual",
  "RULE-SET,ProxyLite (IP-CIDR),Manual,no-resolve",
  "DOMAIN-KEYWORD,360buy,Direct",
  "DOMAIN-KEYWORD,alicdn,Direct",
  "DOMAIN-KEYWORD,alimama,Direct",
  "DOMAIN-KEYWORD,alipay,Direct",
  "DOMAIN-KEYWORD,appzapp,Direct",
  "DOMAIN-KEYWORD,baidupcs,Direct",
  "DOMAIN-KEYWORD,bilibili,Direct",
  "DOMAIN-KEYWORD,ccgslb,Direct",
  "DOMAIN-KEYWORD,chinacache,Direct",
  "DOMAIN-KEYWORD,duobao,Direct",
  "DOMAIN-KEYWORD,jdpay,Direct",
  "DOMAIN-KEYWORD,moke,Direct",
  "DOMAIN-KEYWORD,qhimg,Direct",
  "DOMAIN-KEYWORD,vpimg,Direct",
  "DOMAIN-KEYWORD,xiami,Direct",
  "DOMAIN-KEYWORD,xiaomi,Direct",
  "RULE-SET,ChinaDomain (Domain),Direct",
  "RULE-SET,ChinaDomain (IP-CIDR),Direct,no-resolve",
  "RULE-SET,ChinaCompanyIp (IP-CIDR),Direct,no-resolve",
  "DOMAIN-SUFFIX,pairdrop.net,Direct",
  "GEOIP,CN,Direct",
  "MATCH,Others",
];

let ruleProviders = {
  // Provider keys must match RULE-SET names used in `rules`.
  "LocalAreaNetwork (Domain)": {
    behavior: "domain",
    url: "https://url.v1.mk/getruleset?type=3&url=aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL0FDTDRTU1IvQUNMNFNTUi9tYXN0ZXIvQ2xhc2gvTG9jYWxBcmVhTmV0d29yay5saXN0",
  },
  "LocalAreaNetwork (IP-CIDR)": {
    behavior: "ipcidr",
    url: "https://url.v1.mk/getruleset?type=4&url=aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL0FDTDRTU1IvQUNMNFNTUi9tYXN0ZXIvQ2xhc2gvTG9jYWxBcmVhTmV0d29yay5saXN0",
  },
  "UnBan (Domain)": {
    behavior: "domain",
    url: "https://url.v1.mk/getruleset?type=3&url=aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL0FDTDRTU1IvQUNMNFNTUi9tYXN0ZXIvQ2xhc2gvVW5CYW4ubGlzdA",
  },
  "adblockclash (Domain)": {
    behavior: "domain",
    url: "https://url.v1.mk/getruleset?type=3&url=aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tLzIxN2hlaWRhaS9hZGJsb2NrZmlsdGVycy9tYWluL3J1bGVzL2FkYmxvY2tjbGFzaC5saXN0",
  },
  "GoogleCN (Domain)": {
    behavior: "domain",
    url: "https://url.v1.mk/getruleset?type=3&url=aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL0FDTDRTU1IvQUNMNFNTUi9tYXN0ZXIvQ2xhc2gvR29vZ2xlQ04ubGlzdA",
  },
  "SteamCN (Domain)": {
    behavior: "domain",
    url: "https://url.v1.mk/getruleset?type=3&url=aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL0FDTDRTU1IvQUNMNFNTUi9tYXN0ZXIvQ2xhc2gvUnVsZXNldC9TdGVhbUNOLmxpc3Q",
  },
  "Microsoft (Domain)": {
    behavior: "domain",
    url: "https://url.v1.mk/getruleset?type=3&url=aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL0FDTDRTU1IvQUNMNFNTUi9tYXN0ZXIvQ2xhc2gvTWljcm9zb2Z0Lmxpc3Q",
  },
  "AI (Domain)": {
    behavior: "domain",
    url: "https://url.v1.mk/getruleset?type=3&url=aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL0FDTDRTU1IvQUNMNFNTUi9tYXN0ZXIvQ2xhc2gvUnVsZXNldC9BSS5saXN0",
  },
  "OpenAi (Domain)": {
    behavior: "domain",
    url: "https://url.v1.mk/getruleset?type=3&url=aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL0FDTDRTU1IvQUNMNFNTUi9tYXN0ZXIvQ2xhc2gvUnVsZXNldC9PcGVuQWkubGlzdA",
  },
  "Netflix (Domain)": {
    behavior: "domain",
    url: "https://url.v1.mk/getruleset?type=3&url=aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL0FDTDRTU1IvQUNMNFNTUi9tYXN0ZXIvQ2xhc2gvUnVsZXNldC9OZXRmbGl4Lmxpc3Q",
  },
  "Netflix (IP-CIDR)": {
    behavior: "ipcidr",
    url: "https://url.v1.mk/getruleset?type=4&url=aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL0FDTDRTU1IvQUNMNFNTUi9tYXN0ZXIvQ2xhc2gvUnVsZXNldC9OZXRmbGl4Lmxpc3Q",
  },
  "ProxyLite (Domain)": {
    behavior: "domain",
    url: "https://url.v1.mk/getruleset?type=3&url=aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL0FDTDRTU1IvQUNMNFNTUi9tYXN0ZXIvQ2xhc2gvUHJveHlMaXRlLmxpc3Q",
  },
  "ProxyLite (IP-CIDR)": {
    behavior: "ipcidr",
    url: "https://url.v1.mk/getruleset?type=4&url=aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL0FDTDRTU1IvQUNMNFNTUi9tYXN0ZXIvQ2xhc2gvUHJveHlMaXRlLmxpc3Q",
  },
  "ChinaDomain (Domain)": {
    behavior: "domain",
    url: "https://url.v1.mk/getruleset?type=3&url=aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL0FDTDRTU1IvQUNMNFNTUi9tYXN0ZXIvQ2xhc2gvQ2hpbmFEb21haW4ubGlzdA",
  },
  "ChinaDomain (IP-CIDR)": {
    behavior: "ipcidr",
    url: "https://url.v1.mk/getruleset?type=4&url=aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL0FDTDRTU1IvQUNMNFNTUi9tYXN0ZXIvQ2xhc2gvQ2hpbmFEb21haW4ubGlzdA",
  },
  "ChinaCompanyIp (IP-CIDR)": {
    behavior: "ipcidr",
    url: "https://url.v1.mk/getruleset?type=4&url=aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL0FDTDRTU1IvQUNMNFNTUi9tYXN0ZXIvQ2xhc2gvQ2hpbmFDb21wYW55SXAubGlzdA",
  },
};

Object.values(ruleProviders).forEach((provider) => {
  provider.type = "http";
  provider.interval = 86400;
});

let strategyGroups = [
  {
    name: "AutoAI",
    type: "url-test",
    url: "http://www.gstatic.com/generate_204",
    interval: 300,
    tolerance: 50,
    proxies: [],
  },
  {
    name: "Manual",
    type: "select",
    proxies: [],
  },
  {
    name: "AI",
    type: "select",
    proxies: ["AutoAI", "Manual"],
  },
  {
    name: "Netflix",
    type: "select",
    proxies: ["Manual"],
  },
  {
    name: "Microsoft",
    type: "select",
    proxies: ["Manual", "DIRECT"],
  },

  {
    name: "AdBlock",
    type: "select",
    proxies: ["REJECT", "DIRECT"],
  },

  {
    name: "Direct",
    type: "select",
    proxies: ["DIRECT"],
  },

  {
    name: "Others",
    type: "select",
    proxies: ["Manual", "DIRECT"],
  },
];

function main(config) {
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

  let ManualProxies = strategyGroups.find(
    ({ name }) => name == "Manual",
  ).proxies;
  let fullNodeGroupNames = ["Manual", "Netflix"];

  let autoSelectGroup,
    healthCheck = {
      url: "http://www.gstatic.com/generate_204",
      interval: 300,
      tolerance: 50,
    };

  if (enableFallback) {
    autoSelectGroup = {
      name: "Fallback",
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
          type: "url-test",
          proxies: airportProxies,
        });
        autoSelectGroup.proxies.push("Auto" + airportCode);
      },
    );
  } else {
    autoSelectGroup = {
      name: "Auto",
      type: "url-test",
      proxies: [],
    };

    fullNodeGroupNames.unshift("Auto");
  }

  strategyGroups.unshift({ ...autoSelectGroup, ...healthCheck });

  ManualProxies.push(autoSelectGroup.name);

  let allProxyNames = config.proxies.map((proxy) => proxy.name);

  for (const group of strategyGroups) {
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
