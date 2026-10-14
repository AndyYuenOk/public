// prettier-ignore
const flagMap = {"HK":"🇭🇰","MO":"🇲🇴","TW":"🇹🇼","JP":"🇯🇵","KR":"🇰🇷","SG":"🇸🇬","US":"🇺🇸","GB":"🇬🇧","FR":"🇫🇷","DE":"🇩🇪","AU":"🇦🇺","AE":"🇦🇪","AF":"🇦🇫","AL":"🇦🇱","DZ":"🇩🇿","AO":"🇦🇴","AR":"🇦🇷","AM":"🇦🇲","AT":"🇦🇹","AZ":"🇦🇿","BH":"🇧🇭","BD":"🇧🇩","BY":"🇧🇾","BE":"🇧🇪","BZ":"🇧🇿","BJ":"🇧🇯","BT":"🇧🇹","BO":"🇧🇴","BA":"🇧🇦","BW":"🇧🇼","BR":"🇧🇷","VG":"🇻🇬","BN":"🇧🇳","BG":"🇧🇬","BF":"🇧🇫","BI":"🇧🇮","KH":"🇰🇭","CM":"🇨🇲","CA":"🇨🇦","CV":"🇨🇻","KY":"🇰🇾","CF":"🇨🇫","TD":"🇹🇩","CL":"🇨🇱","CO":"🇨🇴","KM":"🇰🇲","CG":"🇨🇬","CD":"🇨🇩","CR":"🇨🇷","HR":"🇭🇷","CY":"🇨🇾","CZ":"🇨🇿","DK":"🇩🇰","DJ":"🇩🇯","DO":"🇩🇴","EC":"🇪🇨","EG":"🇪🇬","SV":"🇸🇻","GQ":"🇬🇶","ER":"🇪🇷","EE":"🇪🇪","ET":"🇪🇹","FJ":"🇫🇯","FI":"🇫🇮","GA":"🇬🇦","GM":"🇬🇲","GE":"🇬🇪","GH":"🇬🇭","GR":"🇬🇷","GL":"🇬🇱","GT":"🇬🇹","GN":"🇬🇳","GY":"🇬🇾","HT":"🇭🇹","HN":"🇭🇳","HU":"🇭🇺","IS":"🇮🇸","IN":"🇮🇳","ID":"🇮🇩","IR":"🇮🇷","IQ":"🇮🇶","IE":"🇮🇪","IM":"🇮🇲","IL":"🇮🇱","IT":"🇮🇹","CI":"🇨🇮","JM":"🇯🇲","JO":"🇯🇴","KZ":"🇰🇿","KE":"🇰🇪","KW":"🇰🇼","KG":"🇰🇬","LA":"🇱🇦","LV":"🇱🇻","LB":"🇱🇧","LS":"🇱🇸","LR":"🇱🇷","LY":"🇱🇾","LT":"🇱🇹","LU":"🇱🇺","MK":"🇲🇰","MG":"🇲🇬","MW":"🇲🇼","MY":"🇲🇾","MV":"🇲🇻","ML":"🇲🇱","MT":"🇲🇹","MR":"🇲🇷","MU":"🇲🇺","MX":"🇲🇽","MD":"🇲🇩","MC":"🇲🇨","MN":"🇲🇳","ME":"🇲🇪","MA":"🇲🇦","MZ":"🇲🇿","MM":"🇲🇲","NA":"🇳🇦","NP":"🇳🇵","NL":"🇳🇱","NZ":"🇳🇿","NI":"🇳🇮","NE":"🇳🇪","NG":"🇳🇬","KP":"🇰🇵","NO":"🇳🇴","OM":"🇴🇲","PK":"🇵🇰","PA":"🇵🇦","PY":"🇵🇾","PE":"🇵🇪","PH":"🇵🇭","PT":"🇵🇹","PR":"🇵🇷","QA":"🇶🇦","RO":"🇷🇴","RU":"🇷🇺","RW":"🇷🇼","SM":"🇸🇲","SA":"🇸🇦","SN":"🇸🇳","RS":"🇷🇸","SL":"🇸🇱","SK":"🇸🇰","SI":"🇸🇮","SO":"🇸🇴","ZA":"🇿🇦","ES":"🇪🇸","LK":"🇱🇰","SD":"🇸🇩","SR":"🇸🇷","SZ":"🇸🇿","SE":"🇸🇪","CH":"🇨🇭","SY":"🇸🇾","TJ":"🇹🇯","TZ":"🇹🇿","TH":"🇹🇭","TG":"🇹🇬","TO":"🇹🇴","TT":"🇹🇹","TN":"🇹🇳","TR":"🇹🇷","TM":"🇹🇲","VI":"🇻🇮","UG":"🇺🇬","UA":"🇺🇦","UY":"🇺🇾","UZ":"🇺🇿","VE":"🇻🇪","VN":"🇻🇳","YE":"🇾🇪","ZM":"🇿🇲","ZW":"🇿🇼","AD":"🇦🇩","RE":"🇷🇪","PL":"🇵🇱","GU":"🇬🇺","VA":"🇻🇦","LI":"🇱🇮","CW":"🇨🇼","SC":"🇸🇨","AQ":"🇦🇶","GI":"🇬🇮","CU":"🇨🇺","FO":"🇫🇴","AX":"🇦🇽","BM":"🇧🇲","TL":"🇹🇱"};

function operator(proxies = [], targetPlatform, context) {
  let counters = {};

  if (Object.values(context.source)[0].displayName.includes('Free')) {
    $arguments.sort = 0;
  }

  proxies.forEach((proxy) => {
    proxy.entrance ??= {};
    proxy.egress ??= {};
    proxy.entrance.ip ??= '';
    proxy.entrance.countryCode ??= '';
    proxy.entrance.regionCode ??= '';
    proxy.entrance.country ??= '';
    proxy.entrance.city ??= '';
    proxy.entrance.isp ??= '';
    proxy.egress.ip ??= '';
    proxy.egress.countryCode ??= '';
    proxy.egress.country ??= '';
    proxy.egress.city ??= '';
    proxy.egress.isp ??= '';
    proxy.egress.isResidential ??= false;

    const entranceIp = proxy.entrance.ip;
    const entranceCountryCode = proxy.entrance.countryCode;
    const egressIp = proxy.egress.ip;
    const egressCountryCode = proxy.egress.countryCode;

    proxy.subscriptionName = proxy._subName;
  });

  let counter, index;
  proxies.forEach((proxy) => {
    const entranceIp = proxy.entrance.ip;
    const entranceCountryCode = proxy.entrance.countryCode;
    const entranceRegionCode = proxy.entrance.regionCode;
    const entranceCountry = proxy.entrance.country;
    const entranceCity = proxy.entrance.city;
    const entranceIsp = proxy.entrance.isp;
    const egressIp = proxy.egress.ip;
    const egressCountryCode = proxy.egress.countryCode;
    const egressCountry = proxy.egress.country;
    const egressCity = proxy.egress.city;
    const egressIsp = proxy.egress.isp;
    const egressIsResidential = proxy.egress.isResidential;

    proxy.entranceName = '';
    if (entranceIp && entranceIp != egressIp) {
      proxy.entranceName = [
        entranceCountryCode,
        entranceCountryCode == 'CN' ? entranceRegionCode : '',
        // $server.ipCity,
        normalizedIsp(entranceIsp, entranceCountry, entranceCity),
        '-',
      ]
        .join(' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }

    let multiplier =
      proxy.name.match(/(\d(?:\.\d+)?)[x倍]/i)?.[1] ||
      proxy.name.match(/x(\d(?:\.\d+)?)/i)?.[1] ||
      '';
    if (multiplier) multiplier = parseFloat(multiplier) + '\u00D7';

    proxy.egressName =
      (egressCountryCode || 'ERR') + ' ' + normalizedIsp(egressIsp, egressCountry, egressCity);

    proxy.name = [
      flagMap[egressCountryCode],
      proxy._subName,
      proxy.entranceName,
      proxy.egressName,
      proxy?.measuredSpeed ?? '',
      proxy?.guaranteedSpeed ?? '',
      proxy?.ai?.tag ?? '',
      multiplier,
    ]
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    counters[proxy.name] ??= { count: 0, index: 0 };
    counters[proxy.name].count++;
  });

  return proxies
    .sort(
      (a, b) =>
        a.egressName.localeCompare(b.egressName) || a.entranceName.localeCompare(b.entranceName)
    )
    .map((proxy) => {
      counter = counters[proxy.name];
      if (counter.count > 1) {
        index = (++counter.index).toString().padStart(2, '0');
        proxy.name += ' - ' + index;
      }
      return proxy;
    });
}

function normalizedIsp(isp, country, city) {
  return isp
    .replace(/.*Tencent.*/i, 'Tencent')
    .replace(/.*Amazon.*/i, 'Amazon')
    .replace(/.*Cloudflare.*/i, 'Cloudflare')
    .replace(/.*Data Communication Business Group.*/i, 'HiNet')
    .replace(/.*LocLix.*/i, 'LocLix')
    .replace(/.*Optimal Link.*/i, 'Oplink')
    .replace(/.*FDCservers.*/i, 'FDCservers')
    .replace(/.*Brain PEACE.*/i, 'Brain PEACE')
    .replace(/.*Hong Kong Broadband Network.*/i, 'HKBN')
    .replace(/[,.]/g, '')
    .replace(/\(.+\)/g, '')
    .replace(
      /\b(?:services|pc|inc|llc|networks?|ltd|corporation|pty|data|communications|limited|sas?|agency|labs|global)\b/gi,
      ''
    )
    .trim();
}
