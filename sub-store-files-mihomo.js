let isCollection = $arguments.fallback || $file.sourceType == 'collection';
let isMainProxyGroupOnly = /true|1/i.test($arguments.proxy_group_only ?? isCollection);

$options ??= {};
$options._req ??= {
  query: { smart: false },
  headers: { host: 'localhost', 'user-agent': '' },
};
let query = $options._req.query;

let isMobile = /Android|iPhone/i.test($options._req.headers['user-agent']);

if (query.mobile) {
  isMobile = /true|1/i.test(query.mobile);
}

let enableSmart = /true|1/i.test(query.smart),
  autoType = enableSmart ? 'smart' : 'url-test';
let regions, allowPatterns, blockPatterns;

try {
  regions = JSON.parse($arguments.regions ?? '[]');
} catch {
  regions = [$arguments.regions];
}

try {
  allowPatterns = JSON.parse($arguments.allow ?? '[]');
} catch {
  allowPatterns = [$arguments.allow];
}

try {
  blockPatterns = JSON.parse($arguments.block ?? '[]');
} catch {
  blockPatterns = [$arguments.block];
}

function main(subConfig = { proxies: [] }) {
  const nameserver = ['https://223.5.5.5/dns-query'],
    cdn = 'https://gcore.jsdelivr.net/gh/';

  config = {
    dns: {
      enable: true,
      ipv6: true,
      'prefer-h3': true,
      'enhanced-mode': 'fake-ip',
      'respect-rules': true,
      'proxy-server-nameserver': nameserver,
      // system doesn't cache ipv6, so DNS queries are sent repeatedly
      'nameserver-policy': {
        // enable this option when using real-ip mode
        // 'RULE-SET:AdBlock': ['rcode://success'],
        'GEOSITE:private': ['system'],
      },
      'direct-nameserver-follow-policy': true,
      'direct-nameserver': nameserver,
      nameserver: nameserver,
      // 'fake-ip-filter-mode': 'rule',
      // 'fake-ip-filter': [
      //   // use real-ip mode, must enable nameserver-policy
      //   // otherwise it will trigger fallback
      //   // 'GEOSITE,private,real-ip',
      //   // 'GEOSITE,cn,real-ip',
      //   // 'GEOSITE,googlefcm,real-ip',
      //   // 'GEOSITE,gfw,fake-ip',
      //   'MATCH,fake-ip',
      // ],
      // If a foreign domain is not included in any ruleset
      // a fallback DNS server is required.
      fallback: ['https://8.8.8.8/dns-query'],
      // 'fallback-filter': { geoip: true, 'geoip-code': 'CN' },
    },

    proxies: [],
    'proxy-providers': {},

    // https://github.com/Orz-3/mini/tree/master/Color
    // https://github.com/lobehub/lobe-icons/tree/master/packages/static-png/light
    'proxy-groups': [
      {
        name: 'AdBlock',
        icon: 'Adblock.png',
        type: 'select',
        proxies: ['REJECT', 'DIRECT'],
      },
      {
        name: 'AI',
        icon: cdn + 'selfhst/icons/svg/openai.svg',
        type: 'select',
        // 'include-all': true,
        proxies: ['Proxy', 'Auto_AI'],
      },
      // {
      //   name: 'Claude',
      //   icon: 'https://cdn.jsdelivr.net/gh/lobehub/lobe-icons@master/packages/static-png/light/claude-color.png',
      //   type: 'url-test',
      //   'include-all-providers': true,
      //   url: 'https://claude.ai/api/auth/session',
      //   'expected-status': 404,
      // },
      // {
      //   name: 'OpenAI',
      //   icon: cdn + 'lobehub/lobe-icons@master/packages/static-png/light/openai.png',
      //   type: 'url-test',
      //   'include-all': true,
      //   url: 'https://chatgpt.com/api/auth/session',
      //   'expected-status': 200,
      // },
      // {
      //   name: 'Gemini',
      //   icon: 'https://cdn.jsdelivr.net/gh/lobehub/lobe-icons@master/packages/static-png/light/gemini-color.png',
      //   type: 'url-test',
      //   'include-all': true,
      //   url: `https://generativelanguage.googleapis.com/v1/models?key=${$arguments.google_ai_key}`,
      //   'expected-status': 200,
      // },
      // {
      //   name: 'Youtube',
      //   icon: 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/youtube.svg',
      //   type: 'select',
      //   'include-all': true,
      //   proxies: ['Proxy'],
      // },
      // {
      //   name: 'Netflix',
      //   icon: cdn + 'selfhst/icons/svg/netflix.svg',
      //   type: 'select',
      //   'include-all': true,
      //   proxies: ['Proxy'],
      // },
      // {
      //   name: 'Microsoft',
      //   icon:  cdn + 'selfhst/icons/svg/microsoft.svg',
      //   type: 'select',
      //   // 'include-all': true,
      //   proxies: ['Proxy', 'DIRECT'],
      // },
      // {
      //   name: 'FCM',
      //   icon: cdn + 'selfhst/icons/svg/firebase.svg',
      //   type: 'select',
      //   // 'include-all': true,
      //   proxies: ['DIRECT', 'Proxy'],
      // },
      // {
      //   name: 'Apple',
      //   icon:  cdn + 'selfhst/icons/svg/apple.svg',
      //   type: 'select',
      //   'include-all': true,
      //   proxies: ['DIRECT', 'Proxy'],
      // },
      // {
      //   name: 'Telegram',
      //   icon: cdn + 'selfhst/icons/svg/telegram.svg',
      //   type: 'select',
      //   // 'include-all': true,
      //   proxies: ['Proxy'],
      //   'default-selected': 'Auto_SG',
      // },

      // {
      //   name: "Direct",
      //   icon: "China.png",
      //   type: "select",
      //   proxies: ["DIRECT"],
      // },

      // {
      //   name: 'Final',
      //   icon: 'Final.png',
      //   type: 'select',
      //   proxies: ['Proxy', 'DIRECT'],
      // },
    ],

    // https://github.com/Loyalsoldier/clash-rules
    'rule-providers': [
      // 'applications',
      // 'lancidr',
      // 'private',
      // 'reject',
      // 'icloud',
      // 'apple',
      // 'google',
      // 'telegramcidr',
      // 'cncidr',
      // 'direct',
      // 'proxy',
      {
        AdBlock: {
          url: cdn + '217heidai/adblockfilters@main/rules/adblockmihomo.mrs',
        },
      },
    ].reduce((providers, provider) => {
      let providerName;

      if (typeof provider === 'string') {
        providerName = provider;
        providers[providerName] = {
          url: cdn + `Loyalsoldier/clash-rules@release/${providerName}.txt`,
        };
      } else {
        // 处理已经定义的特殊对象 (如 adblockfilters)
        providerName = Object.keys(provider)[0];
        providers[providerName] = Object.values(provider)[0];
      }

      if (providers[providerName].url.split('.').pop() === 'mrs') {
        providers[providerName].format = 'mrs';
      }

      providers[providerName].type = 'http';
      providers[providerName].interval = 86400;
      if (providerName.includes('applications')) {
        providers[providerName].behavior = 'classical';
      } else {
        providers[providerName].behavior = providerName.includes('idr') ? 'ipcidr' : 'domain';
      }

      return providers;
    }, {}),

    // https://github.com/MetaCubeX/meta-rules-dat
    // https://github.com/Loyalsoldier/v2ray-rules-dat
    // https://github.com/v2fly/domain-list-community/tree/master/data
    // Rule order is top-down; earlier entries have higher priority.
    rules: [
      // 'AND,((NETWORK,UDP),(GEOSITE,youtube)),Auto_UDP',
      // 'AND,((NETWORK,UDP),(PROCESS-NAME-WILDCARD,*youtube*)),REJECT',

      // 'RULE-SET,applications,DIRECT',
      // 'RULE-SET,lancidr,DIRECT,no-resolve',
      // 'RULE-SET,private,DIRECT',
      'RULE-SET,AdBlock,AdBlock',

      // 'GEOSITE,category-ads-all,Reject',
      'GEOSITE,googlefcm,DIRECT',
      // 'GEOSITE,anthropic,Claude',
      // 'GEOSITE,openai,OpenAI',
      // 'GEOSITE,google-gemini,Gemini'
      'GEOSITE,category-ai-!cn,AI',
      // 'GEOSITE,microsoft@cn,DIRECT',
      // 'GEOSITE,microsoft,Microsoft',
      // 'GEOSITE,youtube,Youtube',
      // 'GEOSITE,netflix,Netflix',
      'GEOSITE,private,DIRECT',
      'GEOSITE,cn,DIRECT',
      'GEOSITE,category-companies@cn,DIRECT',
      'GEOSITE,category-entertainment@cn,DIRECT',
      'GEOSITE,geolocation-!cn,Proxy',

      // 'RULE-SET,google,DIRECT',
      'IP-ASN,59930,Auto_US',
      'GEOIP,telegram,Auto_SG',
      // 'RULE-SET,apple,Apple',
      // 'RULE-SET,icloud,DIRECT',

      // 'RULE-SET,cncidr,DIRECT,no-resolve',
      // 'RULE-SET,direct,DIRECT',
      // 'RULE-SET,proxy,Proxy',

      'GEOIP,private,DIRECT',
      'GEOIP,CN,DIRECT',
      'MATCH,Proxy',
    ],
  };
  // config['lgbm-auto-update'] = true;

  // config['unified-delay'] = true;
  // config['external-controller'] = '0.0.0.0:9090';
  // config['geo-auto-update'] = true;

  // config['geodata-mode'] = true;

  // config['geox-url'] = {
  //   geoip: 'https://cdn.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geoip.dat',
  //   geosite: 'https://cdn.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geosite.dat',
  // };

  let autoAreaGroups = Object.entries({ HK: '🇭🇰', JP: '🇯🇵', SG: '🇸🇬', TW: '🇹🇼', US: '🇺🇸' }).map(
    ([code, flag]) => ({
      name: 'Auto_' + code,
      icon: code + '.png',
      type: autoType,
      // interval: getInterval(),
      'include-all-providers': true,
      filter: flag,
    })
  );

  if (regions.length) {
    config.proxies = config.proxies.filter(({ name }) =>
      regions.some((pattern) => RegExp(pattern).test(name))
    );
  }

  if (allowPatterns.length) {
    config.proxies = config.proxies.filter(({ name }) =>
      allowPatterns.some((pattern) => RegExp(pattern).test(name))
    );
  }

  if (blockPatterns.length) {
    config.proxies = config.proxies.filter(
      ({ name }) => !blockPatterns.some((pattern) => RegExp(pattern).test(name))
    );
  }

  let subs = $substore.read('subs').filter(
    (sub) => sub.tag.includes('Primary') || sub.tag.includes('Backup')
    // || sub.tag.includes('UDP')
  );

  // enableFallback = subs.length > 1;

  let mainProxyGroup = {
    name: 'Proxy',
    icon: 'Static.png',
    type: 'select',
    proxies: [],
  };

  let autoSelectGroup,
    autoPrimaryGroup,
    autoBackupGroup,
    airportGroups = [],
    healthCheck = {
      url: 'http://www.gstatic.com/generate_204',
      // url: "http://www.google.com/generate_204",
      // url: "http://cp.cloudflare.com/generate_204",
      // timeout: 1500,
      // tolerance: 200,
      'max-failed-times': 1,
    };

  if (isCollection) {
    autoSelectGroup = {
      name: 'Fallback',
      icon: 'Roundrobin.png',
      type: 'fallback',
      proxies: ['Auto_Primary', 'Auto_Backup'],
    };
    autoPrimaryGroup = {
      name: 'Auto_Primary',
      type: autoType,
      // interval: getInterval(),
      use: [],
    };
    autoBackupGroup = {
      name: 'Auto_Backup',
      type: autoType,
      // interval: getInterval(),
      use: [],
    };

    const userInfoMap = getSubUserinfo();
    if (isCollection) {
      let first = Object.values(userInfoMap)
        .sort((a, b) => {
          const aRemaining = a.total - a.usage.upload - a.usage.download;
          const bRemaining = b.total - b.usage.upload - b.usage.download;
          return aRemaining - bRemaining;
        })
        .find((info) => info.expires && info.usage.upload + info.usage.download < info.total);

      if (first) {
        $options._res = {
          headers: {
            'subscription-userinfo': `upload=${first.usage.upload}; download=${first.usage.download}; total=${first.total}; expire=${first.expires}`,
          },
        };
      }
    }

    subs.forEach((sub, index) => {
      const userInfo = userInfoMap[sub.name];
      if (userInfo && userInfo.usage.upload + userInfo.usage.download >= userInfo.total) {
        return;
      }

      let name = sub.displayName || sub.name;

      config['proxy-providers'][name] = {
        type: 'http',
        url: `http://${$options._req.headers.host}${process.env.SUB_STORE_FRONTEND_BACKEND_PATH}/download/${sub.name}/ClashMeta`,
        interval: 86400,
        'health-check': {
          enable: true,
          interval: getInterval(),
          url: healthCheck.url,
          lazy: isMobile,
        },
      };

      airportGroups.push({
        name: 'Auto_' + name,
        type: autoType,
        use: [name],
      });

      let filter = query.filter ?? '';

      if (sub.tag.includes('Primary')) {
        autoPrimaryGroup.use.push(name);
      }
      if (sub.tag.includes('Backup')) {
        autoBackupGroup.use.push(name);

        let filter_backup = query.filter_backup ?? '';
        if (filter_backup) {
          filter = filter_backup;
        }
      }

      if (filter) {
        config['proxy-providers'][name].filter = filter;
      }
    });

    if (!autoPrimaryGroup.use.length) {
      autoPrimaryGroup.proxies = ['REJECT'];
    }
  } else {
    config.proxies = [];
    config['proxy-providers'] = {
      [$file.name]: {
        type: 'http',
        url: `http://${$options._req.headers.host}${process.env.SUB_STORE_FRONTEND_BACKEND_PATH}/download/${$file.sourceName}/ClashMeta`,
        interval: 86400,
        'health-check': {
          enable: true,
          interval: getInterval(),
          url: healthCheck.url,
        },
      },
    };

    autoSelectGroup = {
      name: 'Auto',
      type: autoType,
      'include-all-providers': true,
      proxies: [],
    };
  }

  let airportGroupNames = airportGroups.map((group) => group.name);

  mainProxyGroup.proxies.push(
    autoSelectGroup.name,
    ...(isCollection ? ['Auto_Primary', 'Auto_Backup'] : []),
    ...(isCollection ? airportGroupNames : []),
    ...autoAreaGroups.map((group) => group.name)
  );

  config['proxy-groups'].push(
    mainProxyGroup,
    autoSelectGroup,
    ...(isCollection ? [autoPrimaryGroup, autoBackupGroup] : []),
    ...airportGroups,
    ...autoAreaGroups,
    {
      name: 'Auto_AI',
      type: autoType,
      // interval: getInterval(),
      'include-all-providers': true,
      filter: 'AI',
    }
  );

  config['proxy-groups'].forEach((group) => {
    if (group.name.includes('Auto')) {
      group.icon ??= 'Available.png';
    }

    if (!group.icon.startsWith('http')) {
      group.icon = cdn + 'Orz-3/mini@master/Color/' + group.icon;
    }

    if (group.type === 'fallback') {
      Object.assign(group, healthCheck);
    }

    if (group.type === 'url-test') {
      const { url, ...rest } = healthCheck;
      Object.assign(group, rest);
    }

    if (group.type === 'smart') {
      group.uselightgbm = true;
      group['prefer-asn'] = true;
    }

    // if (isMobile && group['include-all']) {
    //   group['exclude-filter'] = 'Tailscale';
    // }

    if (['FCM'].includes(group.name)) {
      group.proxies.push(...airportGroupNames);
    }

    if (['Netflix', 'Telegram'].includes(group.name)) {
      group.proxies.push(...autoAreaGroups.map((group) => group.name));
    }
  });

  if (isCollection) {
    $options._res ??= {};
    $options._res.headers ??= {};
    $options._res.headers['content-disposition'] =
      'attachment; filename="Fallback' + (enableSmart ? '-Smart' : '') + '"';
  } else {
    if (mainProxyGroup.proxies.length === 1) {
      config['proxy-groups'] = config['proxy-groups'].filter((group) => group.name !== 'Proxy');
      config['proxy-groups'].find((group) => group.name === 'Auto').name = 'Proxy';
    }

    if (
      subConfig.proxies.filter(({ name }) => name.includes('AI')).length ===
      subConfig.proxies.length
    ) {
      config['proxy-groups'] = config['proxy-groups'].filter((group) => !group.name.includes('AI'));
      config.rules = config.rules.filter((rule) => !rule.endsWith(',AI'));
    }
  }

  if (isMobile) {
    config.proxies.push({
      name: 'Tailscale',
      type: 'tailscale',
      hostname: 'mihomo',
      'auth-key': $arguments.tskey,
      udp: true,
    });
    config.rules.unshift(
      'DOMAIN-SUFFIX,ts.net,Tailscale',
      'IP-CIDR,100.64.0.0/10,Tailscale,no-resolve',
      'IP-CIDR6,fd7a:115c:a1e0::/48,Tailscale,no-resolve'
    );
  } else {
    config['sub-rules'] ??= {};
    config['sub-rules'].docker = ['GEOSITE,docker,Proxy', 'GEOSITE,github,Proxy', 'MATCH,DIRECT'];

    config.rules.unshift(
      'SUB-RULE,(PROCESS-NAME,com.docker.backend.exe),docker',
      'PROCESS-NAME,tailscaled.exe,DIRECT'
    );
  }

  return config;
}

function getSubUserinfo() {
  const subscriptions = $substore.read('subs') || [];
  const settings = $substore.read('settings') || {};
  const headers = JSON.parse($substore.read('#sub-store-cached-headers-resource'));
  let userInfoMap = {};

  for (const subscription of subscriptions) {
    if (subscription.tag.includes('Primary')) {
      if (subscription?.subUserinfo) {
        userInfoMap[subscription.name] = flowUtils.parseFlowHeaders(subscription.subUserinfo);
      } else {
        const id = ProxyUtils.hex_md5(
          `${settings.defaultFlowUserAgent}${subscription.url.split('#')[0]}`
        );
        if (headers[id]) {
          userInfoMap[subscription.name] = flowUtils.parseFlowHeaders(headers[id].data);
        }
      }
    }
  }

  return userInfoMap;
}

function getInterval() {
  let min = isMobile ? 30 * 60 : 5 * 60;
  let max = min * 2;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

if (typeof $content === 'string' && $content === '') {
  $content = ProxyUtils.yaml.dump(main(ProxyUtils.yaml.load($content)));
}
