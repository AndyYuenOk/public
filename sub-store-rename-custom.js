if ($arguments?.is_multiple) {
  $server.name = $server.name
    .split(" ")
    .toSpliced(1, 0, $server._subName)
    .join(" ");
} else {
  // prettier-ignore
  const countryFlagMap = {"HK":"🇭🇰","MO":"🇲🇴","TW":"🇹🇼","JP":"🇯🇵","KR":"🇰🇷","SG":"🇸🇬","US":"🇺🇸","GB":"🇬🇧","FR":"🇫🇷","DE":"🇩🇪","AU":"🇦🇺","AE":"🇦🇪","AF":"🇦🇫","AL":"🇦🇱","DZ":"🇩🇿","AO":"🇦🇴","AR":"🇦🇷","AM":"🇦🇲","AT":"🇦🇹","AZ":"🇦🇿","BH":"🇧🇭","BD":"🇧🇩","BY":"🇧🇾","BE":"🇧🇪","BZ":"🇧🇿","BJ":"🇧🇯","BT":"🇧🇹","BO":"🇧🇴","BA":"🇧🇦","BW":"🇧🇼","BR":"🇧🇷","VG":"🇻🇬","BN":"🇧🇳","BG":"🇧🇬","BF":"🇧🇫","BI":"🇧🇮","KH":"🇰🇭","CM":"🇨🇲","CA":"🇨🇦","CV":"🇨🇻","KY":"🇰🇾","CF":"🇨🇫","TD":"🇹🇩","CL":"🇨🇱","CO":"🇨🇴","KM":"🇰🇲","CG":"🇨🇬","CD":"🇨🇩","CR":"🇨🇷","HR":"🇭🇷","CY":"🇨🇾","CZ":"🇨🇿","DK":"🇩🇰","DJ":"🇩🇯","DO":"🇩🇴","EC":"🇪🇨","EG":"🇪🇬","SV":"🇸🇻","GQ":"🇬🇶","ER":"🇪🇷","EE":"🇪🇪","ET":"🇪🇹","FJ":"🇫🇯","FI":"🇫🇮","GA":"🇬🇦","GM":"🇬🇲","GE":"🇬🇪","GH":"🇬🇭","GR":"🇬🇷","GL":"🇬🇱","GT":"🇬🇹","GN":"🇬🇳","GY":"🇬🇾","HT":"🇭🇹","HN":"🇭🇳","HU":"🇭🇺","IS":"🇮🇸","IN":"🇮🇳","ID":"🇮🇩","IR":"🇮🇷","IQ":"🇮🇶","IE":"🇮🇪","IM":"🇮🇲","IL":"🇮🇱","IT":"🇮🇹","CI":"🇨🇮","JM":"🇯🇲","JO":"🇯🇴","KZ":"🇰🇿","KE":"🇰🇪","KW":"🇰🇼","KG":"🇰🇬","LA":"🇱🇦","LV":"🇱🇻","LB":"🇱🇧","LS":"🇱🇸","LR":"🇱🇷","LY":"🇱🇾","LT":"🇱🇹","LU":"🇱🇺","MK":"🇲🇰","MG":"🇲🇬","MW":"🇲🇼","MY":"🇲🇾","MV":"🇲🇻","ML":"🇲🇱","MT":"🇲🇹","MR":"🇲🇷","MU":"🇲🇺","MX":"🇲🇽","MD":"🇲🇩","MC":"🇲🇨","MN":"🇲🇳","ME":"🇲🇪","MA":"🇲🇦","MZ":"🇲🇿","MM":"🇲🇲","NA":"🇳🇦","NP":"🇳🇵","NL":"🇳🇱","NZ":"🇳🇿","NI":"🇳🇮","NE":"🇳🇪","NG":"🇳🇬","KP":"🇰🇵","NO":"🇳🇴","OM":"🇴🇲","PK":"🇵🇰","PA":"🇵🇦","PY":"🇵🇾","PE":"🇵🇪","PH":"🇵🇭","PT":"🇵🇹","PR":"🇵🇷","QA":"🇶🇦","RO":"🇷🇴","RU":"🇷🇺","RW":"🇷🇼","SM":"🇸🇲","SA":"🇸🇦","SN":"🇸🇳","RS":"🇷🇸","SL":"🇸🇱","SK":"🇸🇰","SI":"🇸🇮","SO":"🇸🇴","ZA":"🇿🇦","ES":"🇪🇸","LK":"🇱🇰","SD":"🇸🇩","SR":"🇸🇷","SZ":"🇸🇿","SE":"🇸🇪","CH":"🇨🇭","SY":"🇸🇾","TJ":"🇹🇯","TZ":"🇹🇿","TH":"🇹🇭","TG":"🇹🇬","TO":"🇹🇴","TT":"🇹🇹","TN":"🇹🇳","TR":"🇹🇷","TM":"🇹🇲","VI":"🇻🇮","UG":"🇺🇬","UA":"🇺🇦","UY":"🇺🇾","UZ":"🇺🇿","VE":"🇻🇪","VN":"🇻🇳","YE":"🇾🇪","ZM":"🇿🇲","ZW":"🇿🇼","AD":"🇦🇩","RE":"🇷🇪","PL":"🇵🇱","GU":"🇬🇺","VA":"🇻🇦","LI":"🇱🇮","CW":"🇨🇼","SC":"🇸🇨","AQ":"🇦🇶","GI":"🇬🇮","CU":"🇨🇺","FO":"🇫🇴","AX":"🇦🇽","BM":"🇧🇲","TL":"🇹🇱"};

  let ipIsp = $server.ipIsp
    .replace(/.*China Mobile.*/, "CM")
    .replace(/.*China Unicom.*/, "CU")
    .replace(/.*Chinanet.*/, "CT")
    .replace(/.*Amazon.*/, "AMZ")
    .replace(/.*Microsoft.*/, "Azure")
    .replace(/.*Chunghwa Telecom.*/, "HiNet")
    .replace(/.*HostPapa.*/, "HPAPA")
    .replace(/.*NetLab.*/, "NetLab")
    .replace(/.*Hong Kong Telecommunications.*/, "HKT")
    .replace(/.*Alibaba.*/, "Ali")
    .replace(/Network|Technology|Co\.,|Ltd\./g, "")
    .replace(/\s{2,}/, " ")
    .trim();

  $server.name = [
    countryFlagMap[$server.name.split(" ")[0]],
    $server.ipCountryCode,
    $server.ipRegion,
    // $server.ipCity,
    ipIsp,
    "-",
    $server.name,
    $server.canAccessGpt ? "GPT" : "",
    $server.canAccessGm ? "GM" : "",
  ].join(" ");
}
