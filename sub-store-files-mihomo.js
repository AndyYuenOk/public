// prettier-ignore
const flagMap = {"HK":"🇭🇰","MO":"🇲🇴","TW":"🇹🇼","JP":"🇯🇵","KR":"🇰🇷","SG":"🇸🇬","US":"🇺🇸","GB":"🇬🇧","FR":"🇫🇷","DE":"🇩🇪","AU":"🇦🇺","AE":"🇦🇪","AF":"🇦🇫","AL":"🇦🇱","DZ":"🇩🇿","AO":"🇦🇴","AR":"🇦🇷","AM":"🇦🇲","AT":"🇦🇹","AZ":"🇦🇿","BH":"🇧🇭","BD":"🇧🇩","BY":"🇧🇾","BE":"🇧🇪","BZ":"🇧🇿","BJ":"🇧🇯","BT":"🇧🇹","BO":"🇧🇴","BA":"🇧🇦","BW":"🇧🇼","BR":"🇧🇷","VG":"🇻🇬","BN":"🇧🇳","BG":"🇧🇬","BF":"🇧🇫","BI":"🇧🇮","KH":"🇰🇭","CM":"🇨🇲","CA":"🇨🇦","CV":"🇨🇻","KY":"🇰🇾","CF":"🇨🇫","TD":"🇹🇩","CL":"🇨🇱","CO":"🇨🇴","KM":"🇰🇲","CG":"🇨🇬","CD":"🇨🇩","CR":"🇨🇷","HR":"🇭🇷","CY":"🇨🇾","CZ":"🇨🇿","DK":"🇩🇰","DJ":"🇩🇯","DO":"🇩🇴","EC":"🇪🇨","EG":"🇪🇬","SV":"🇸🇻","GQ":"🇬🇶","ER":"🇪🇷","EE":"🇪🇪","ET":"🇪🇹","FJ":"🇫🇯","FI":"🇫🇮","GA":"🇬🇦","GM":"🇬🇲","GE":"🇬🇪","GH":"🇬🇭","GR":"🇬🇷","GL":"🇬🇱","GT":"🇬🇹","GN":"🇬🇳","GY":"🇬🇾","HT":"🇭🇹","HN":"🇭🇳","HU":"🇭🇺","IS":"🇮🇸","IN":"🇮🇳","ID":"🇮🇩","IR":"🇮🇷","IQ":"🇮🇶","IE":"🇮🇪","IM":"🇮🇲","IL":"🇮🇱","IT":"🇮🇹","CI":"🇨🇮","JM":"🇯🇲","JO":"🇯🇴","KZ":"🇰🇿","KE":"🇰🇪","KW":"🇰🇼","KG":"🇰🇬","LA":"🇱🇦","LV":"🇱🇻","LB":"🇱🇧","LS":"🇱🇸","LR":"🇱🇷","LY":"🇱🇾","LT":"🇱🇹","LU":"🇱🇺","MK":"🇲🇰","MG":"🇲🇬","MW":"🇲🇼","MY":"🇲🇾","MV":"🇲🇻","ML":"🇲🇱","MT":"🇲🇹","MR":"🇲🇷","MU":"🇲🇺","MX":"🇲🇽","MD":"🇲🇩","MC":"🇲🇨","MN":"🇲🇳","ME":"🇲🇪","MA":"🇲🇦","MZ":"🇲🇿","MM":"🇲🇲","NA":"🇳🇦","NP":"🇳🇵","NL":"🇳🇱","NZ":"🇳🇿","NI":"🇳🇮","NE":"🇳🇪","NG":"🇳🇬","KP":"🇰🇵","NO":"🇳🇴","OM":"🇴🇲","PK":"🇵🇰","PA":"🇵🇦","PY":"🇵🇾","PE":"🇵🇪","PH":"🇵🇭","PT":"🇵🇹","PR":"🇵🇷","QA":"🇶🇦","RO":"🇷🇴","RU":"🇷🇺","RW":"🇷🇼","SM":"🇸🇲","SA":"🇸🇦","SN":"🇸🇳","RS":"🇷🇸","SL":"🇸🇱","SK":"🇸🇰","SI":"🇸🇮","SO":"🇸🇴","ZA":"🇿🇦","ES":"🇪🇸","LK":"🇱🇰","SD":"🇸🇩","SR":"🇸🇷","SZ":"🇸🇿","SE":"🇸🇪","CH":"🇨🇭","SY":"🇸🇾","TJ":"🇹🇯","TZ":"🇹🇿","TH":"🇹🇭","TG":"🇹🇬","TO":"🇹🇴","TT":"🇹🇹","TN":"🇹🇳","TR":"🇹🇷","TM":"🇹🇲","VI":"🇻🇮","UG":"🇺🇬","UA":"🇺🇦","UY":"🇺🇾","UZ":"🇺🇿","VE":"🇻🇪","VN":"🇻🇳","YE":"🇾🇪","ZM":"🇿🇲","ZW":"🇿🇼","AD":"🇦🇩","RE":"🇷🇪","PL":"🇵🇱","GU":"🇬🇺","VA":"🇻🇦","LI":"🇱🇮","CW":"🇨🇼","SC":"🇸🇨","AQ":"🇦🇶","GI":"🇬🇮","CU":"🇨🇺","FO":"🇫🇴","AX":"🇦🇽","BM":"🇧🇲","TL":"🇹🇱"};

let enableFallback = $arguments.fallback || $file.sourceType == 'collection';
let isMainProxyGroupOnly = /true|1/i.test($arguments.proxy_group_only ?? enableFallback);

$options ??= {};
$options._req ??= {
  query: { smart: false },
  headers: { host: 'localhost', 'user-agent': '' },
};
let query = $options._req.query;

let isMobile = /android/i.test($options._req.headers['user-agent']);

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

let filterAI = query.filter_ai ?? '';
Object.entries(flagMap).forEach(([code, flag]) => {
  filterAI = filterAI.replace(code, flag);
});

function main(config = { proxies: [], 'proxy-providers': {} }) {
  config['lgbm-auto-update'] = true;

  config['unified-delay'] = true;
  config['external-controller'] = '0.0.0.0:9090';
  config['geo-auto-update'] = true;
  config['dns'] = {
    enable: true,
    ipv6: false,
    'enhanced-mode': 'fake-ip',
    'respect-rules': true,
    'proxy-server-nameserver': [
      '223.5.5.5',
      // '119.29.29.29'
    ],
    'direct-nameserver': ['system'],
    // 'nameserver-policy': {
    //   // 'GEOSITE:Youtube': [
    //   //   'tcp://8.8.8.8#Youtube',
    //   //   // 'tcp://1.1.1.1#FCM'
    //   // ],
    //   // 'GEOSITE:category-ai-!cn': [
    //   //   'tcp://8.8.8.8#AI',
    //   //   // 'tcp://1.1.1.1#AI'
    //   // ],
    //   'GEOSITE:gfw': [
    //     'tcp://8.8.8.8',
    //     // 'tcp://1.1.1.1'
    //   ],
    // },
    nameserver: [
      '223.5.5.5',
      // '119.29.29.29'
    ],
    'fake-ip-filter-mode': 'rule',
    'fake-ip-filter': [
      'GEOSITE,private,real-ip',
      'GEOSITE,cn,real-ip',
      'GEOSITE,googlefcm,real-ip',
      // 'GEOSITE,gfw,fake-ip',
      'MATCH,fake-ip',
    ],
    fallback: [
      'tcp://8.8.8.8',
      // 'tcp://1.1.1.1'
    ],
    // 'fallback-filter': { geoip: true, 'geoip-code': 'CN' },
  };

  // https://github.com/Loyalsoldier/clash-rules
  config['rule-providers'] = [
    'applications',
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
      adblockfilters: {
        url: 'https://raw.githubusercontent.com/217heidai/adblockfilters/main/rules/adblockmihomo.mrs',
        format: 'mrs',
      },
    },
  ].reduce((providers, provider) => {
    let providerName;

    if (typeof provider === 'string') {
      providerName = provider;
      providers[providerName] = {
        url: `https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/${providerName}.txt`,
      };
    } else {
      // 处理已经定义的特殊对象 (如 adblockfilters)
      providerName = Object.keys(provider)[0];
      providers[providerName] = Object.values(provider)[0];
    }

    providers[providerName].type = 'http';
    providers[providerName].interval = 86400;
    if (providerName.includes('applications')) {
      providers[providerName].behavior = 'classical';
    } else {
      providers[providerName].behavior = providerName.includes('idr') ? 'ipcidr' : 'domain';
    }

    return providers;
  }, {});

  config['geodata-mode'] = true;

  config['geox-url'] = {
    geoip: 'https://cdn.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geoip.dat',
    geosite: 'https://cdn.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geosite.dat',
  };

  // https://github.com/Loyalsoldier/v2ray-rules-dat
  // https://github.com/v2fly/domain-list-community/tree/master/data
  // Rule order is top-down; earlier entries have higher priority.
  config.rules = [
    // 'AND,((NETWORK,UDP),(GEOSITE,youtube)),Auto_UDP',
    // 'AND,((NETWORK,UDP),(PROCESS-NAME-WILDCARD,*youtube*)),REJECT',

    'RULE-SET,applications,DIRECT',
    // 'RULE-SET,lancidr,DIRECT,no-resolve',
    // 'RULE-SET,private,DIRECT',
    // 'RULE-SET,reject,Reject',
    'RULE-SET,adblockfilters,Reject',

    // 'GEOSITE,google-play@cn,DIRECT',
    'GEOSITE,googlefcm,FCM',
    // 'GEOSITE,anthropic,Claude',
    // 'GEOSITE,openai,OpenAI',
    // 'GEOSITE,google-gemini,Gemini'
    'GEOSITE,category-ai-!cn,AI',
    // 'GEOSITE,microsoft@cn,DIRECT',
    // 'GEOSITE,microsoft,Microsoft',
    'GEOSITE,youtube,Youtube',
    'GEOSITE,netflix,Netflix',
    'GEOSITE,private,DIRECT',
    'GEOSITE,cn,DIRECT',

    // 'RULE-SET,google,DIRECT',
    // 'RULE-SET,telegramcidr,Proxy,no-resolve',
    // 'RULE-SET,apple,Apple',
    // 'RULE-SET,icloud,DIRECT',

    // 'RULE-SET,cncidr,DIRECT,no-resolve',
    // 'RULE-SET,direct,DIRECT',
    // 'RULE-SET,proxy,Proxy',

    'GEOIP,private,DIRECT,no-resolve',
    'GEOIP,CN,DIRECT,no-resolve',
    'MATCH,Final',
  ];

  // https://github.com/Orz-3/mini/tree/master/Color
  // https://github.com/lobehub/lobe-icons/tree/master/packages/static-png/light
  config['proxy-groups'] = [
    // {
    //   name: 'Auto_AI',
    //   type: autoType,
    //   'include-all': true,
    //   filter: 'AI',
    // },
    {
      name: 'AI',
      icon: 'https://img.icons8.com/fluency/256/bot.png',
      type: 'select',
      'include-all': true,
      proxies: ['Proxy'],
    },
    // {
    //   name: 'Claude',
    //   icon: 'https://cdn.jsdelivr.net/gh/lobehub/lobe-icons@master/packages/static-png/light/claude-color.png',
    //   type: 'url-test',
    //   'include-all': true,
    //   url: 'https://claude.ai/api/auth/session',
    //   'expected-status': 404,
    // },
    // {
    //   name: 'OpenAI',
    //   icon: 'https://cdn.jsdelivr.net/gh/lobehub/lobe-icons@master/packages/static-png/light/openai.png',
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

    {
      name: 'Youtube',
      icon: 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/youtube.svg',
      type: 'select',
      'include-all': true,
      proxies: ['Proxy'],
    },
    {
      name: 'Netflix',
      icon: 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/netflix.svg',
      type: 'select',
      'include-all': true,
      proxies: ['Proxy'],
    },
    {
      name: 'Microsoft',
      icon: 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/microsoft.svg',
      type: 'select',
      // 'include-all': true,
      proxies: ['Proxy', 'DIRECT'],
    },
    {
      name: 'FCM',
      icon: 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/firebase.svg',
      type: 'select',
      // 'include-all': true,
      proxies: ['DIRECT', 'Proxy'],
    },
    // {
    //   name: 'Apple',
    //   icon: 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/apple.svg',
    //   type: 'select',
    //   'include-all': true,
    //   proxies: ['DIRECT', 'Proxy'],
    // },
    {
      name: 'Reject',
      icon: 'Adblock.png',
      type: 'select',
      proxies: ['REJECT', 'DIRECT'],
    },

    // {
    //   name: "Direct",
    //   icon: "China.png",
    //   type: "select",
    //   proxies: ["DIRECT"],
    // },

    {
      name: 'Final',
      icon: 'Final.png',
      type: 'select',
      proxies: ['Proxy', 'DIRECT'],
    },
    // {
    //   name: 'Auto_HK',
    //   icon: 'HK.png',
    //   type: autoType,
    //   'include-all': true,
    //   filter: '🇭🇰',
    // },
    // {
    //   name: 'Auto_TW',
    //   icon: 'TW.png',
    //   type: autoType,
    //   'include-all': true,
    //   filter: '🇹🇼',
    // },
    // {
    //   name: 'Auto_SG',
    //   icon: 'SG.png',
    //   type: autoType,
    //   'include-all': true,
    //   filter: '🇸🇬',
    // },
    // {
    //   name: 'Auto_US',
    //   icon: 'US.png',
    //   type: autoType,
    //   'include-all': true,
    //   filter: '🇺🇸',
    // },
  ];

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

  enableFallback = subs.length > 1;

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
      timeout: 1500,
      tolerance: 200,
      'max-failed-times': 1,
    };

  if (enableFallback) {
    autoSelectGroup = {
      name: 'Fallback',
      icon: 'Roundrobin.png',
      type: 'fallback',
      proxies: ['Auto_Primary', 'Auto_Backup'],
    };
    autoPrimaryGroup = {
      name: 'Auto_Primary',
      type: autoType,
      interval: getInterval(),
      use: [],
      proxies: [],
    };
    autoBackupGroup = {
      name: 'Auto_Backup',
      type: autoType,
      interval: getInterval(),
      use: [],
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

      let name = sub.displayName;

      config['proxy-providers'][name] = {
        type: 'http',
        url: `http://${$options._req.headers.host}${process.env.SUB_STORE_FRONTEND_BACKEND_PATH}/download/${sub.name}/ClashMeta`,
        interval: name === 'Free' ? 3600 : 86400,
        path: `./proxies/${name}.yaml`,
        'health-check': {
          enable: !isMobile || sub.tag.includes('Primary'),
          interval: getInterval(),
          url: healthCheck.url,
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

      Object.entries(flagMap).forEach(([code, flag]) => {
        filter = filter.replace(code, flag);
      });
      config['proxy-providers'][name].filter = filter;
    });

    if (!autoPrimaryGroup.use.length) {
      autoPrimaryGroup.proxies = ['REJECT'];
    }
  } else {
    autoSelectGroup = {
      name: 'Auto',
      type: autoType,
      proxies: [],
    };
  }

  let airportGroupNames = airportGroups.map((group) => group.name);

  mainProxyGroup.proxies.push(
    autoSelectGroup.name,
    'Auto_Primary',
    'Auto_Backup',
    ...(enableFallback ? airportGroupNames : [])
  );

  config['proxy-groups'].unshift(
    mainProxyGroup,
    autoSelectGroup,
    ...(enableFallback ? [autoPrimaryGroup, autoBackupGroup] : []),
    ...airportGroups
  );

  config['proxy-groups'].forEach((group) => {
    if (group.name.includes('Auto')) {
      group.icon ??= 'Available.png';
    }

    if (!group.icon.startsWith('http')) {
      group.icon = 'https://raw.githubusercontent.com/Orz-3/mini/master/Color/' + group.icon;
    }

    if (group.type === 'fallback') {
      group.url = healthCheck.url;
    }

    if (group.type === 'url-test') {
      Object.assign(group, healthCheck);
    }

    if (group.type === 'smart') {
      group.uselightgbm = true;
    }

    if (group['include-all']) {
      group['exclude-filter'] = 'Tailscale';
    }

    if (
      [
        'FCM',
        //  'Youtube'
      ].includes(group.name)
    ) {
      group.proxies.push(...airportGroupNames);
    }
  });

  $options._res ??= {};
  $options._res.headers ??= {};
  $options._res.headers['content-disposition'] =
    'attachment; filename="Fallback' + (enableSmart ? '-Smart' : '') + '"';

  if (isMobile) {
    config.proxies.push({
      name: 'Tailscale',
      type: 'tailscale',
      hostname: 'mihomo',
      udp: true,
    });
    config.rules.unshift('IP-CIDR,100.64.0.0/10,Tailscale,no-resolve');
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
  return Math.floor(Math.random() * (360 - 300 + 1)) + 300;
}

if (typeof $content === 'string') {
  // $content = ProxyUtils.yaml.dump(main(ProxyUtils.yaml.load($content)));
  $content = ProxyUtils.yaml.dump(main());
}
