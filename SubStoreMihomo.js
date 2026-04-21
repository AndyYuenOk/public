"use strict";

let regionFilters = $arguments.regions?.split("+") ?? [];
let nameRegex = $arguments.multiplier;
let enableFallback = $arguments.fallback;

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
  "DOMAIN-KEYWORD,1e100,Proxies",
  "DOMAIN-KEYWORD,abema,Proxies",
  "DOMAIN-KEYWORD,appledaily,Proxies",
  "DOMAIN-KEYWORD,avtb,Proxies",
  "DOMAIN-KEYWORD,beetalk,Proxies",
  "DOMAIN-KEYWORD,blogspot,Proxies",
  "DOMAIN-KEYWORD,dropbox,Proxies",
  "DOMAIN-KEYWORD,facebook,Proxies",
  "DOMAIN-KEYWORD,fbcdn,Proxies",
  "DOMAIN-KEYWORD,github,Proxies",
  "DOMAIN-KEYWORD,gmail,Proxies",
  "DOMAIN-KEYWORD,google,Proxies",
  "DOMAIN-KEYWORD,instagram,Proxies",
  "DOMAIN-KEYWORD,porn,Proxies",
  "DOMAIN-KEYWORD,sci-hub,Proxies",
  "DOMAIN-KEYWORD,spotify,Proxies",
  "DOMAIN-KEYWORD,telegram,Proxies",
  "DOMAIN-KEYWORD,twitter,Proxies",
  "DOMAIN-KEYWORD,whatsapp,Proxies",
  "DOMAIN-KEYWORD,youtube,Proxies",
  "DOMAIN-KEYWORD,uk-live,Proxies",
  "DOMAIN-KEYWORD,onedrive,Proxies",
  "DOMAIN-KEYWORD,skydrive,Proxies",
  "DOMAIN-KEYWORD,porn,Proxies",
  "DOMAIN-KEYWORD,ttvnw,Proxies",
  "RULE-SET,ProxyLite (Domain),Proxies",
  "RULE-SET,ProxyLite (IP-CIDR),Proxies,no-resolve",
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
    type: "http",
    behavior: "domain",
    url: "https://url.v1.mk/getruleset?type=3&url=aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL0FDTDRTU1IvQUNMNFNTUi9tYXN0ZXIvQ2xhc2gvTG9jYWxBcmVhTmV0d29yay5saXN0",
    interval: 86400,
  },
  "LocalAreaNetwork (IP-CIDR)": {
    type: "http",
    behavior: "ipcidr",
    url: "https://url.v1.mk/getruleset?type=4&url=aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL0FDTDRTU1IvQUNMNFNTUi9tYXN0ZXIvQ2xhc2gvTG9jYWxBcmVhTmV0d29yay5saXN0",

    interval: 86400,
  },
  "UnBan (Domain)": {
    type: "http",
    behavior: "domain",
    url: "https://url.v1.mk/getruleset?type=3&url=aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL0FDTDRTU1IvQUNMNFNTUi9tYXN0ZXIvQ2xhc2gvVW5CYW4ubGlzdA",

    interval: 86400,
  },
  "adblockclash (Domain)": {
    type: "http",
    behavior: "domain",
    url: "https://url.v1.mk/getruleset?type=3&url=aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tLzIxN2hlaWRhaS9hZGJsb2NrZmlsdGVycy9tYWluL3J1bGVzL2FkYmxvY2tjbGFzaC5saXN0",

    interval: 86400,
  },
  "GoogleCN (Domain)": {
    type: "http",
    behavior: "domain",
    url: "https://url.v1.mk/getruleset?type=3&url=aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL0FDTDRTU1IvQUNMNFNTUi9tYXN0ZXIvQ2xhc2gvR29vZ2xlQ04ubGlzdA",

    interval: 86400,
  },
  "SteamCN (Domain)": {
    type: "http",
    behavior: "domain",
    url: "https://url.v1.mk/getruleset?type=3&url=aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL0FDTDRTU1IvQUNMNFNTUi9tYXN0ZXIvQ2xhc2gvUnVsZXNldC9TdGVhbUNOLmxpc3Q",

    interval: 86400,
  },
  "Microsoft (Domain)": {
    type: "http",
    behavior: "domain",
    url: "https://url.v1.mk/getruleset?type=3&url=aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL0FDTDRTU1IvQUNMNFNTUi9tYXN0ZXIvQ2xhc2gvTWljcm9zb2Z0Lmxpc3Q",

    interval: 86400,
  },
  "AI (Domain)": {
    type: "http",
    behavior: "domain",
    url: "https://url.v1.mk/getruleset?type=3&url=aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL0FDTDRTU1IvQUNMNFNTUi9tYXN0ZXIvQ2xhc2gvUnVsZXNldC9BSS5saXN0",

    interval: 86400,
  },
  "OpenAi (Domain)": {
    type: "http",
    behavior: "domain",
    url: "https://url.v1.mk/getruleset?type=3&url=aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL0FDTDRTU1IvQUNMNFNTUi9tYXN0ZXIvQ2xhc2gvUnVsZXNldC9PcGVuQWkubGlzdA",

    interval: 86400,
  },
  "Netflix (Domain)": {
    type: "http",
    behavior: "domain",
    url: "https://url.v1.mk/getruleset?type=3&url=aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL0FDTDRTU1IvQUNMNFNTUi9tYXN0ZXIvQ2xhc2gvUnVsZXNldC9OZXRmbGl4Lmxpc3Q",

    interval: 86400,
  },
  "Netflix (IP-CIDR)": {
    type: "http",
    behavior: "ipcidr",
    url: "https://url.v1.mk/getruleset?type=4&url=aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL0FDTDRTU1IvQUNMNFNTUi9tYXN0ZXIvQ2xhc2gvUnVsZXNldC9OZXRmbGl4Lmxpc3Q",

    interval: 86400,
  },
  "ProxyLite (Domain)": {
    type: "http",
    behavior: "domain",
    url: "https://url.v1.mk/getruleset?type=3&url=aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL0FDTDRTU1IvQUNMNFNTUi9tYXN0ZXIvQ2xhc2gvUHJveHlMaXRlLmxpc3Q",

    interval: 86400,
  },
  "ProxyLite (IP-CIDR)": {
    type: "http",
    behavior: "ipcidr",
    url: "https://url.v1.mk/getruleset?type=4&url=aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL0FDTDRTU1IvQUNMNFNTUi9tYXN0ZXIvQ2xhc2gvUHJveHlMaXRlLmxpc3Q",

    interval: 86400,
  },
  "ChinaDomain (Domain)": {
    type: "http",
    behavior: "domain",
    url: "https://url.v1.mk/getruleset?type=3&url=aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL0FDTDRTU1IvQUNMNFNTUi9tYXN0ZXIvQ2xhc2gvQ2hpbmFEb21haW4ubGlzdA",

    interval: 86400,
  },
  "ChinaDomain (IP-CIDR)": {
    type: "http",
    behavior: "ipcidr",
    url: "https://url.v1.mk/getruleset?type=4&url=aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL0FDTDRTU1IvQUNMNFNTUi9tYXN0ZXIvQ2xhc2gvQ2hpbmFEb21haW4ubGlzdA",

    interval: 86400,
  },
  "ChinaCompanyIp (IP-CIDR)": {
    type: "http",
    behavior: "ipcidr",
    url: "https://url.v1.mk/getruleset?type=4&url=aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL0FDTDRTU1IvQUNMNFNTUi9tYXN0ZXIvQ2xhc2gvQ2hpbmFDb21wYW55SXAubGlzdA",

    interval: 86400,
  },
};

let strategyGroups = [
  {
    name: "Proxies",
    type: "select",
    proxies: [],
  },
  {
    name: "AI",
    type: "select",
    proxies: ["AutoAI", "Proxies"],
  },
  {
    name: "Netflix",
    type: "select",
    proxies: ["Proxies"],
  },
  {
    name: "Microsoft",
    type: "select",
    proxies: ["Proxies", "DIRECT"],
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
    proxies: ["Proxies", "DIRECT"],
  },
  {
    name: "AutoAI",
    type: "url-test",
    url: "http://www.gstatic.com/generate_204",
    interval: 300,
    tolerance: 50,
    proxies: [],
  },
];

function operator(config) {
  // Inject rules and provider definitions.
  config.rules = routingRules;
  config["rule-providers"] = ruleProviders;

  config.proxies = config.proxies.filter((proxy) => {
    const matchesRegion =
      !regionFilters.length ||
      regionFilters.some((regionFilter) => proxy.name.includes(regionFilter));
    const matchesRegex = !nameRegex || RegExp(nameRegex).test(proxy.name);
    return matchesRegion && matchesRegex;
  });

  let proxiesGroupMembers = strategyGroups.find(
    ({ name }) => name == "Proxies",
  ).proxies;
  let fullNodeGroupNames = ["Proxies", "Microsoft", "AI", "Netflix"];

  if (enableFallback) {
    let autoSelectGroup = {
      name: "Fallback",
      type: "fallback",
      url: "http://www.gstatic.com/generate_204",
      interval: 300,
      tolerance: 50,
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
          url: "http://www.gstatic.com/generate_204",
          interval: 300,
          tolerance: 50,
          proxies: airportProxies,
        });
        autoSelectGroup.proxies.push("Auto" + airportCode);
      },
    );
  } else {
    autoSelectGroup = {
      name: "Auto",
      type: "url-test",
      url: "http://www.gstatic.com/generate_204",
      interval: 300,
      tolerance: 50,
      proxies: [],
    };

    fullNodeGroupNames.unshift("Auto");
  }

  strategyGroups.unshift(autoSelectGroup);

  proxiesGroupMembers.push(autoSelectGroup.name);

  let allProxyNames = config.proxies.map((proxy) => proxy.name);

  for (const strategyGroup of strategyGroups) {
    // Append all nodes to common manual selection groups for fallback use.
    if (fullNodeGroupNames.includes(strategyGroup.name)) {
      strategyGroup.proxies = strategyGroup.proxies.concat(allProxyNames);
    }

    if (strategyGroup.name == "AutoAI") {
      // AutoAI prefers nodes containing GPT; otherwise use all nodes.
      strategyGroup.proxies = allProxyNames.filter((name) =>
        name.includes("GPT"),
      );
      strategyGroup.proxies = strategyGroup.proxies.length
        ? strategyGroup.proxies
        : allProxyNames;
    }
  }

  config["proxy-groups"] = strategyGroups;

  return config;
}
