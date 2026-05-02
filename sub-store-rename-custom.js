// prettier-ignore
const flagMap = {"HK":"🇭🇰","MO":"🇲🇴","TW":"🇹🇼","JP":"🇯🇵","KR":"🇰🇷","SG":"🇸🇬","US":"🇺🇸","GB":"🇬🇧","FR":"🇫🇷","DE":"🇩🇪","AU":"🇦🇺","AE":"🇦🇪","AF":"🇦🇫","AL":"🇦🇱","DZ":"🇩🇿","AO":"🇦🇴","AR":"🇦🇷","AM":"🇦🇲","AT":"🇦🇹","AZ":"🇦🇿","BH":"🇧🇭","BD":"🇧🇩","BY":"🇧🇾","BE":"🇧🇪","BZ":"🇧🇿","BJ":"🇧🇯","BT":"🇧🇹","BO":"🇧🇴","BA":"🇧🇦","BW":"🇧🇼","BR":"🇧🇷","VG":"🇻🇬","BN":"🇧🇳","BG":"🇧🇬","BF":"🇧🇫","BI":"🇧🇮","KH":"🇰🇭","CM":"🇨🇲","CA":"🇨🇦","CV":"🇨🇻","KY":"🇰🇾","CF":"🇨🇫","TD":"🇹🇩","CL":"🇨🇱","CO":"🇨🇴","KM":"🇰🇲","CG":"🇨🇬","CD":"🇨🇩","CR":"🇨🇷","HR":"🇭🇷","CY":"🇨🇾","CZ":"🇨🇿","DK":"🇩🇰","DJ":"🇩🇯","DO":"🇩🇴","EC":"🇪🇨","EG":"🇪🇬","SV":"🇸🇻","GQ":"🇬🇶","ER":"🇪🇷","EE":"🇪🇪","ET":"🇪🇹","FJ":"🇫🇯","FI":"🇫🇮","GA":"🇬🇦","GM":"🇬🇲","GE":"🇬🇪","GH":"🇬🇭","GR":"🇬🇷","GL":"🇬🇱","GT":"🇬🇹","GN":"🇬🇳","GY":"🇬🇾","HT":"🇭🇹","HN":"🇭🇳","HU":"🇭🇺","IS":"🇮🇸","IN":"🇮🇳","ID":"🇮🇩","IR":"🇮🇷","IQ":"🇮🇶","IE":"🇮🇪","IM":"🇮🇲","IL":"🇮🇱","IT":"🇮🇹","CI":"🇨🇮","JM":"🇯🇲","JO":"🇯🇴","KZ":"🇰🇿","KE":"🇰🇪","KW":"🇰🇼","KG":"🇰🇬","LA":"🇱🇦","LV":"🇱🇻","LB":"🇱🇧","LS":"🇱🇸","LR":"🇱🇷","LY":"🇱🇾","LT":"🇱🇹","LU":"🇱🇺","MK":"🇲🇰","MG":"🇲🇬","MW":"🇲🇼","MY":"🇲🇾","MV":"🇲🇻","ML":"🇲🇱","MT":"🇲🇹","MR":"🇲🇷","MU":"🇲🇺","MX":"🇲🇽","MD":"🇲🇩","MC":"🇲🇨","MN":"🇲🇳","ME":"🇲🇪","MA":"🇲🇦","MZ":"🇲🇿","MM":"🇲🇲","NA":"🇳🇦","NP":"🇳🇵","NL":"🇳🇱","NZ":"🇳🇿","NI":"🇳🇮","NE":"🇳🇪","NG":"🇳🇬","KP":"🇰🇵","NO":"🇳🇴","OM":"🇴🇲","PK":"🇵🇰","PA":"🇵🇦","PY":"🇵🇾","PE":"🇵🇪","PH":"🇵🇭","PT":"🇵🇹","PR":"🇵🇷","QA":"🇶🇦","RO":"🇷🇴","RU":"🇷🇺","RW":"🇷🇼","SM":"🇸🇲","SA":"🇸🇦","SN":"🇸🇳","RS":"🇷🇸","SL":"🇸🇱","SK":"🇸🇰","SI":"🇸🇮","SO":"🇸🇴","ZA":"🇿🇦","ES":"🇪🇸","LK":"🇱🇰","SD":"🇸🇩","SR":"🇸🇷","SZ":"🇸🇿","SE":"🇸🇪","CH":"🇨🇭","SY":"🇸🇾","TJ":"🇹🇯","TZ":"🇹🇿","TH":"🇹🇭","TG":"🇹🇬","TO":"🇹🇴","TT":"🇹🇹","TN":"🇹🇳","TR":"🇹🇷","TM":"🇹🇲","VI":"🇻🇮","UG":"🇺🇬","UA":"🇺🇦","UY":"🇺🇾","UZ":"🇺🇿","VE":"🇻🇪","VN":"🇻🇳","YE":"🇾🇪","ZM":"🇿🇲","ZW":"🇿🇼","AD":"🇦🇩","RE":"🇷🇪","PL":"🇵🇱","GU":"🇬🇺","VA":"🇻🇦","LI":"🇱🇮","CW":"🇨🇼","SC":"🇸🇨","AQ":"🇦🇶","GI":"🇬🇮","CU":"🇨🇺","FO":"🇫🇴","AX":"🇦🇽","BM":"🇧🇲","TL":"🇹🇱"};

function operator(proxies = [], targetPlatform, context) {
  let counters = {};

  const preferredCountryCodeOrder = ["HK", "SG", "TW", "JP", "US"];
  const countryCodeToSortIndex = Object.fromEntries(
    preferredCountryCodeOrder.map((countryCode, sortIndex) => [
      countryCode,
      sortIndex,
    ]),
  );

  let entranceIps = new Set(),
    egressIps = new Set();
  proxies = proxies
    .map((proxy, originalIndex) => ({ proxy, originalIndex }))
    .sort((leftItem, rightItem) => {
      const leftCountryCode = leftItem.proxy?.egressCountryCode;
      const rightCountryCode = rightItem.proxy?.egressCountryCode;

      const leftSortIndex =
        countryCodeToSortIndex[leftCountryCode] ??
        preferredCountryCodeOrder.length;
      const rightSortIndex =
        countryCodeToSortIndex[rightCountryCode] ??
        preferredCountryCodeOrder.length;

      return (
        leftSortIndex - rightSortIndex ||
        leftItem.originalIndex - rightItem.originalIndex
      );
    })
    .map(({ proxy }) => {
      proxy.subscriptionName = proxy._subName;

      entranceIps.add(proxy.entranceIp);
      egressIps.add(proxy.egressIp);

      return proxy;
    });

  entranceIps = [...entranceIps];
  egressIps = [...egressIps];

  let counter, index;
  proxies.forEach((proxy) => {
    let entrance = [];
    if (proxy.entranceIp != proxy.egressIp) {
      index = "";
      if (entranceIps.length > 1) {
        index = (entranceIps.indexOf(proxy.entranceIp) + 1)
          .toString()
          .padStart(2, "0");
      }
      entrance = [
        proxy.entranceCountryCode,
        proxy.entranceRegion.replace(/^\d+$/, ""),
        index,
        // $server.ipCity,
        normalizedIsp(
          proxy.entranceIsp,
          proxy.entranceCountry,
          proxy.entranceCity,
        ),
        "-",
      ];
    }

    let multiplier = proxy.name.match(/(\d\.\d)x/i)?.[1] || "";
    if (multiplier) multiplier = parseFloat(multiplier) + "\u00D7";

    index = "";
    if (egressIps.length > 1) {
      index = (egressIps.indexOf(proxy.egressIp) + 1)
        .toString()
        .padStart(2, "0");
    }

    proxy.name = [
      flagMap[proxy.egressCountryCode],
      ...entrance,
      proxy.egressCountryCode,
      index,
      proxy.egressHosting ? "" : "HBB",
      normalizedIsp(proxy.egressIsp, proxy.egressCountry, proxy.egressCity),
      multiplier,
      proxy?.canAccessOpenai ? "GPT" : "",
      proxy?.canAccessGemini ? "GM" : "",
      proxy?.canAccessClaude ? "CL" : "",
    ]
      .join(" ")
      .replace(/\s{2,}/g, " ")
      .trim();

    counters[proxy.name] ??= { count: 0, index: 0 };
    counters[proxy.name].count++;
  });

  proxies.forEach((proxy) => {
    counter = counters[proxy.name];
    if (counter.count > 1) {
      index = (++counter.index).toString().padStart(2, "0");
      proxy.name += " - " + index;
    }
  });

  return proxies;
}

function normalizedIsp(isp, country, city) {
  return isp
    .replace(/.*China Mobile.*/, "CM")
    .replace(/.*China Unicom.*/, "CU")
    .replace(/.*Chinanet.*/, "CT")
    .replace(/.*Amazon.*/, "AMZ")
    .replace(/.*Microsoft.*/, "Azure")
    .replace(/.*Cloudflare.*/, "CF")
    .replace(/.*Chunghwa Telecom.*/, "HiNet")
    .replace(/.*HostPapa.*/, "HPAPA")
    .replace(/.*NetLab.*/, "NetLab")
    .replace(/.*Hong Kong Telecommunications.*/, "HKT")
    .replace(/.*Alibaba.*/, "Ali")
    .replace(RegExp(country + "|" + city, "i"), "")
    .replace(
      /,|(?:co|ltd|inc|pte)\.|k\.k|s\.a\.|networks?|technolog(y|ies)|ltd|llc|pty|information|corporation|data|communications|limited|labs|the|link|europe|srl|sas|servers/gi,
      "",
    )
    .trim();
  // .split(" ")
  // .at(-1);
}
