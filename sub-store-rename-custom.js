// prettier-ignore
const flagMap = {"HK":"🇭🇰","MO":"🇲🇴","TW":"🇹🇼","JP":"🇯🇵","KR":"🇰🇷","SG":"🇸🇬","US":"🇺🇸","GB":"🇬🇧","FR":"🇫🇷","DE":"🇩🇪","AU":"🇦🇺","AE":"🇦🇪","AF":"🇦🇫","AL":"🇦🇱","DZ":"🇩🇿","AO":"🇦🇴","AR":"🇦🇷","AM":"🇦🇲","AT":"🇦🇹","AZ":"🇦🇿","BH":"🇧🇭","BD":"🇧🇩","BY":"🇧🇾","BE":"🇧🇪","BZ":"🇧🇿","BJ":"🇧🇯","BT":"🇧🇹","BO":"🇧🇴","BA":"🇧🇦","BW":"🇧🇼","BR":"🇧🇷","VG":"🇻🇬","BN":"🇧🇳","BG":"🇧🇬","BF":"🇧🇫","BI":"🇧🇮","KH":"🇰🇭","CM":"🇨🇲","CA":"🇨🇦","CV":"🇨🇻","KY":"🇰🇾","CF":"🇨🇫","TD":"🇹🇩","CL":"🇨🇱","CO":"🇨🇴","KM":"🇰🇲","CG":"🇨🇬","CD":"🇨🇩","CR":"🇨🇷","HR":"🇭🇷","CY":"🇨🇾","CZ":"🇨🇿","DK":"🇩🇰","DJ":"🇩🇯","DO":"🇩🇴","EC":"🇪🇨","EG":"🇪🇬","SV":"🇸🇻","GQ":"🇬🇶","ER":"🇪🇷","EE":"🇪🇪","ET":"🇪🇹","FJ":"🇫🇯","FI":"🇫🇮","GA":"🇬🇦","GM":"🇬🇲","GE":"🇬🇪","GH":"🇬🇭","GR":"🇬🇷","GL":"🇬🇱","GT":"🇬🇹","GN":"🇬🇳","GY":"🇬🇾","HT":"🇭🇹","HN":"🇭🇳","HU":"🇭🇺","IS":"🇮🇸","IN":"🇮🇳","ID":"🇮🇩","IR":"🇮🇷","IQ":"🇮🇶","IE":"🇮🇪","IM":"🇮🇲","IL":"🇮🇱","IT":"🇮🇹","CI":"🇨🇮","JM":"🇯🇲","JO":"🇯🇴","KZ":"🇰🇿","KE":"🇰🇪","KW":"🇰🇼","KG":"🇰🇬","LA":"🇱🇦","LV":"🇱🇻","LB":"🇱🇧","LS":"🇱🇸","LR":"🇱🇷","LY":"🇱🇾","LT":"🇱🇹","LU":"🇱🇺","MK":"🇲🇰","MG":"🇲🇬","MW":"🇲🇼","MY":"🇲🇾","MV":"🇲🇻","ML":"🇲🇱","MT":"🇲🇹","MR":"🇲🇷","MU":"🇲🇺","MX":"🇲🇽","MD":"🇲🇩","MC":"🇲🇨","MN":"🇲🇳","ME":"🇲🇪","MA":"🇲🇦","MZ":"🇲🇿","MM":"🇲🇲","NA":"🇳🇦","NP":"🇳🇵","NL":"🇳🇱","NZ":"🇳🇿","NI":"🇳🇮","NE":"🇳🇪","NG":"🇳🇬","KP":"🇰🇵","NO":"🇳🇴","OM":"🇴🇲","PK":"🇵🇰","PA":"🇵🇦","PY":"🇵🇾","PE":"🇵🇪","PH":"🇵🇭","PT":"🇵🇹","PR":"🇵🇷","QA":"🇶🇦","RO":"🇷🇴","RU":"🇷🇺","RW":"🇷🇼","SM":"🇸🇲","SA":"🇸🇦","SN":"🇸🇳","RS":"🇷🇸","SL":"🇸🇱","SK":"🇸🇰","SI":"🇸🇮","SO":"🇸🇴","ZA":"🇿🇦","ES":"🇪🇸","LK":"🇱🇰","SD":"🇸🇩","SR":"🇸🇷","SZ":"🇸🇿","SE":"🇸🇪","CH":"🇨🇭","SY":"🇸🇾","TJ":"🇹🇯","TZ":"🇹🇿","TH":"🇹🇭","TG":"🇹🇬","TO":"🇹🇴","TT":"🇹🇹","TN":"🇹🇳","TR":"🇹🇷","TM":"🇹🇲","VI":"🇻🇮","UG":"🇺🇬","UA":"🇺🇦","UY":"🇺🇾","UZ":"🇺🇿","VE":"🇻🇪","VN":"🇻🇳","YE":"🇾🇪","ZM":"🇿🇲","ZW":"🇿🇼","AD":"🇦🇩","RE":"🇷🇪","PL":"🇵🇱","GU":"🇬🇺","VA":"🇻🇦","LI":"🇱🇮","CW":"🇨🇼","SC":"🇸🇨","AQ":"🇦🇶","GI":"🇬🇮","CU":"🇨🇺","FO":"🇫🇴","AX":"🇦🇽","BM":"🇧🇲","TL":"🇹🇱"};

function operator(proxies = [], targetPlatform, context) {
  let counters = {};

  proxies.forEach((proxy) => {
    proxy.subscriptionName = proxy._subName;

    let entrance = [];
    if (proxy.entranceIp != proxy.egressIp) {
      entrance = [
        proxy.entranceCountryCode,
        proxy.entranceRegion.replace(/^\d+$/, ""),
        proxy.entranceGroup,
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
    if (multiplier) multiplier = parseFloat(multiplier) + "×";

    proxy.name = [
      flagMap[proxy.egressCountryCode],
      ...entrance,
      proxy.egressCountryCode,
      proxy.egressGroup,
      proxy.egressHosting ? "" : "HBB",
      normalizedIsp(proxy.egressIsp, proxy.egressCountry, proxy.egressCity),
      multiplier,
      proxy?.canAccessOpenai ? "GPT" : "",
      proxy?.canAccessGemini ? "GM" : "",
      proxy?.canAccessClaude ? "CL" : "",
    ]
      .join(" ")
      .replace(/\s{2,}/, " ")
      .trim();

    counters[proxy.name] ??= { count: 0, index: 0 };
    counters[proxy.name].count++;
  });

  proxies.forEach((proxy) => {
    let counter = counters[proxy.name];
    if (counter.count > 1) {
      let index = (++counter.index).toString().padStart(2, "0");
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
