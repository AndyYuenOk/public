// prettier-ignore
const flagMap = {"HK":"🇭🇰","MO":"🇲🇴","TW":"🇹🇼","JP":"🇯🇵","KR":"🇰🇷","SG":"🇸🇬","US":"🇺🇸","GB":"🇬🇧","FR":"🇫🇷","DE":"🇩🇪","AU":"🇦🇺","AE":"🇦🇪","AF":"🇦🇫","AL":"🇦🇱","DZ":"🇩🇿","AO":"🇦🇴","AR":"🇦🇷","AM":"🇦🇲","AT":"🇦🇹","AZ":"🇦🇿","BH":"🇧🇭","BD":"🇧🇩","BY":"🇧🇾","BE":"🇧🇪","BZ":"🇧🇿","BJ":"🇧🇯","BT":"🇧🇹","BO":"🇧🇴","BA":"🇧🇦","BW":"🇧🇼","BR":"🇧🇷","VG":"🇻🇬","BN":"🇧🇳","BG":"🇧🇬","BF":"🇧🇫","BI":"🇧🇮","KH":"🇰🇭","CM":"🇨🇲","CA":"🇨🇦","CV":"🇨🇻","KY":"🇰🇾","CF":"🇨🇫","TD":"🇹🇩","CL":"🇨🇱","CO":"🇨🇴","KM":"🇰🇲","CG":"🇨🇬","CD":"🇨🇩","CR":"🇨🇷","HR":"🇭🇷","CY":"🇨🇾","CZ":"🇨🇿","DK":"🇩🇰","DJ":"🇩🇯","DO":"🇩🇴","EC":"🇪🇨","EG":"🇪🇬","SV":"🇸🇻","GQ":"🇬🇶","ER":"🇪🇷","EE":"🇪🇪","ET":"🇪🇹","FJ":"🇫🇯","FI":"🇫🇮","GA":"🇬🇦","GM":"🇬🇲","GE":"🇬🇪","GH":"🇬🇭","GR":"🇬🇷","GL":"🇬🇱","GT":"🇬🇹","GN":"🇬🇳","GY":"🇬🇾","HT":"🇭🇹","HN":"🇭🇳","HU":"🇭🇺","IS":"🇮🇸","IN":"🇮🇳","ID":"🇮🇩","IR":"🇮🇷","IQ":"🇮🇶","IE":"🇮🇪","IM":"🇮🇲","IL":"🇮🇱","IT":"🇮🇹","CI":"🇨🇮","JM":"🇯🇲","JO":"🇯🇴","KZ":"🇰🇿","KE":"🇰🇪","KW":"🇰🇼","KG":"🇰🇬","LA":"🇱🇦","LV":"🇱🇻","LB":"🇱🇧","LS":"🇱🇸","LR":"🇱🇷","LY":"🇱🇾","LT":"🇱🇹","LU":"🇱🇺","MK":"🇲🇰","MG":"🇲🇬","MW":"🇲🇼","MY":"🇲🇾","MV":"🇲🇻","ML":"🇲🇱","MT":"🇲🇹","MR":"🇲🇷","MU":"🇲🇺","MX":"🇲🇽","MD":"🇲🇩","MC":"🇲🇨","MN":"🇲🇳","ME":"🇲🇪","MA":"🇲🇦","MZ":"🇲🇿","MM":"🇲🇲","NA":"🇳🇦","NP":"🇳🇵","NL":"🇳🇱","NZ":"🇳🇿","NI":"🇳🇮","NE":"🇳🇪","NG":"🇳🇬","KP":"🇰🇵","NO":"🇳🇴","OM":"🇴🇲","PK":"🇵🇰","PA":"🇵🇦","PY":"🇵🇾","PE":"🇵🇪","PH":"🇵🇭","PT":"🇵🇹","PR":"🇵🇷","QA":"🇶🇦","RO":"🇷🇴","RU":"🇷🇺","RW":"🇷🇼","SM":"🇸🇲","SA":"🇸🇦","SN":"🇸🇳","RS":"🇷🇸","SL":"🇸🇱","SK":"🇸🇰","SI":"🇸🇮","SO":"🇸🇴","ZA":"🇿🇦","ES":"🇪🇸","LK":"🇱🇰","SD":"🇸🇩","SR":"🇸🇷","SZ":"🇸🇿","SE":"🇸🇪","CH":"🇨🇭","SY":"🇸🇾","TJ":"🇹🇯","TZ":"🇹🇿","TH":"🇹🇭","TG":"🇹🇬","TO":"🇹🇴","TT":"🇹🇹","TN":"🇹🇳","TR":"🇹🇷","TM":"🇹🇲","VI":"🇻🇮","UG":"🇺🇬","UA":"🇺🇦","UY":"🇺🇾","UZ":"🇺🇿","VE":"🇻🇪","VN":"🇻🇳","YE":"🇾🇪","ZM":"🇿🇲","ZW":"🇿🇼","AD":"🇦🇩","RE":"🇷🇪","PL":"🇵🇱","GU":"🇬🇺","VA":"🇻🇦","LI":"🇱🇮","CW":"🇨🇼","SC":"🇸🇨","AQ":"🇦🇶","GI":"🇬🇮","CU":"🇨🇺","FO":"🇫🇴","AX":"🇦🇽","BM":"🇧🇲","TL":"🇹🇱"};

function operator(proxies = [], targetPlatform, context) {
  let counters = {};

  if (Object.values(context.source)[0].displayName.includes("Free")) {
    $arguments.sort = 0;
  }

  if (/true|1/.test($arguments.sort ?? 1)) {
    const preferredCountryCodeOrder = ["HK", "SG", "TW", "JP", "US"];
    const countryCodeToSortIndex = Object.fromEntries(
      preferredCountryCodeOrder.map((countryCode, sortIndex) => [
        countryCode,
        sortIndex,
      ]),
    );

    proxies = proxies
      .map((proxy, originalIndex) => ({ proxy, originalIndex }))
      .sort((leftItem, rightItem) => {
        const leftCountryCode = leftItem.proxy?.egress?.countryCode;
        const rightCountryCode = rightItem.proxy?.egress?.countryCode;

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
      .map(({ proxy }) => proxy);
  }

  proxies.forEach((proxy) => {
    proxy.entrance ??= {};
    proxy.egress ??= {};
    proxy.entrance.ip ??= "";
    proxy.entrance.countryCode ??= "";
    proxy.entrance.regionCode ??= "";
    proxy.entrance.country ??= "";
    proxy.entrance.city ??= "";
    proxy.entrance.isp ??= "";
    proxy.egress.ip ??= "";
    proxy.egress.countryCode ??= "";
    proxy.egress.country ??= "";
    proxy.egress.city ??= "";
    proxy.egress.isp ??= "";
    proxy.egress.isResidential ??= false;

    const entranceIp = proxy.entrance.ip;
    const entranceCountryCode = proxy.entrance.countryCode;
    const egressIp = proxy.egress.ip;
    const egressCountryCode = proxy.egress.countryCode;

    proxy.subscriptionName = proxy._subName;

    if (entranceIp) {
      counters[entranceCountryCode + entranceIp] ??= {
        count: 0,
        index: 0,
      };
    }
    counters[egressCountryCode + egressIp] ??= {
      count: 0,
      index: 0,
    };
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

    let entranceParts = [];
    if (entranceIp && entranceIp != egressIp) {
      index = "";
      counter = counters[entranceCountryCode + entranceIp];
      if (counter.count > 1) {
        index = (++counter.index).toString().padStart(2, "0");
      }
      entranceParts = [
        entranceCountryCode,
        entranceCountryCode == "CN" ? entranceRegionCode : "",
        index,
        // $server.ipCity,
        normalizedIsp(entranceIsp, entranceCountry, entranceCity),
        "-",
      ];
    }

    let multiplier = proxy.name.match(/(\d(?:\.\d)?)x/i)?.[1] || "";
    if (multiplier) multiplier = parseFloat(multiplier) + "\u00D7";

    index = "";
    counter = counters[egressCountryCode + egressIp];
    if (counter.count > 1) {
      index = (++counter.index).toString().padStart(2, "0");
    }

    proxy.name = [
      flagMap[egressCountryCode],
      proxy._subName,
      ...entranceParts,
      egressCountryCode || "ERR",
      index,
      normalizedIsp(egressIsp, egressCountry, egressCity),
      egressIsResidential ? "Resi" : "",
      multiplier,
      proxy?.measuredSpeed ?? "",
      proxy?.guaranteedSpeed ?? "",
      proxy?.ai?.tag ?? "",
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
  return (
    isp
      .replace(/.*China Mobile.*/i, "[Mobile]")
      .replace(/.*China Unicom.*/i, "[Unicom]")
      .replace(/.*Chinanet.*/i, "[Telecom]")
      .replace(/.*Alibaba.*/i, "Alibaba")
      .replace(/.*Tencent.*/i, "Tencent")
      .replace(/.*Amazon.*/i, "Amazon")
      .replace(/.*Microsoft.*/i, "Microsoft")
      .replace(/.*Cloudflare.*/i, "Cloudflare")
      // .replace(/.*Chunghwa Telecom.*/i, "HiNet")
      // .replace(/.*HostPapa.*/i, "HPAPA")
      // .replace(/.*NetLab.*/i, "NetLab")
      // .replace(/.*Hong Kong Telecommunications.*/i, "HKT")
      .replace(/,|\./g, "")
      // .replace(/Telecommunications/i, "Telecom")
      .replace(/\bTelevision\b/i, "TV")
      .replace(/\band\b/i, "&")
      .replace(
        /\b(?:networks?|technolog(?:y|ies)|centers?|hosting|data|global|telecom|telecommunications|mass|internet|shared|cloud|servers|services|group|company|co|ltd|inc|pte|kk|sa|llc|pty|information|corporation|data|communications|limited|labs|the|link|europe|srl|sas|servers)\b/gi,
        "",
      )
      .replace(RegExp(country + "|" + city, "i"), "")
      .replace(/[\[\]\(\)]/g, "")
      .trim()
  );
  // .split(" ")
  // .at(-1);
}
