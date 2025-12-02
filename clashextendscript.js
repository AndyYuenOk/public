// Define main function (script entry)

function main(config, profileName) {
    config.sniffer = {
        enable: true,
        'force-dns-mapping': false,
        'parse-pure-ip': true,
        'override-destination': false,
        sniff: {
            HTTP: { ports: [80, 8080, 8081, 8082, 8083, 8084, 8085, 8086, 8087, 8088] },
            TLS: { ports: [443, 8443] },
            QUIC: { ports: [443, 8443] }
        }
    };

    config.rules.unshift('DOMAIN-SUFFIX,xn--v4q818bf34b.com,DIRECT');

    // config['proxy-groups'].splice(
    //   config['proxy-groups'].findIndex(group => group.name === 'AdBlock'),
    //   0,
    //   {
    //     name: 'AntiAd',
    //     type: 'select',
    //     proxies: ['REJECT', 'DIRECT', 'Proxy']
    //   }
    // );
    // config["rule-providers"].AntiAd = {
    //   type: 'http',
    //   url: "https://gh-proxy.org/https://raw.githubusercontent.com/privacy-protection-tools/anti-AD/master/anti-ad-clash.yaml",
    //   interval: 86400,
    //   proxy: 'DIRECT',
    //   behavior: 'domain'
    // };
    // config.rules.unshift('RULE-SET,AntiAd,AntiAd,REJECT');

    // config['proxy-groups'].splice(
    //   config['proxy-groups'].findIndex(group => group.name === 'AdBlock'),
    //   0,
    //   {
    //     name: 'AdBlockFiltersLite',
    //     type: 'select',
    //     proxies: ['REJECT', 'DIRECT', 'Proxy']
    //   }
    // );
    // config["rule-providers"]['AdBlockFiltersLite'] = {
    //   type: 'http',
    //   url: "https://gcore.jsdelivr.net/gh/217heidai/adblockfilters@main/rules/adblockmihomolite.yaml",
    //   interval: 86400,
    //   proxy: 'DIRECT',
    //   behavior: 'domain'
    // };
    // config.rules.unshift('RULE-SET,AdBlockFiltersLite,AdBlockFiltersLite,REJECT');

    // config['proxy-groups'].splice(
    //   config['proxy-groups'].findIndex(group => group.name === 'AdBlock'),
    //   0,
    //   {
    //     name: 'AdBlockFilters',
    //     type: 'select',
    //     proxies: ['REJECT', 'DIRECT', 'Proxy']
    //   }
    // );
    // config["rule-providers"]['AdBlockFilters'] = {
    //   type: 'http',
    //   url: "https://gcore.jsdelivr.net/gh/217heidai/adblockfilters@main/rules/adblockmihomo.yaml",
    //   interval: 86400,
    //   proxy: 'DIRECT',
    //   behavior: 'domain'
    // };
    // config.rules.unshift('RULE-SET,AdBlockFilters,AdBlockFilters,REJECT');

    const groupNames = [
        'AdBlock',
        'HTTPDNS',
        'Netflix',
        'Disney Plus',
        'YouTube',
        'Max',
        'Spotify',
        'CN Mainland TV',
        'Asian TV',
        'Global TV',
        'Apple',
        'Apple TV',
        'Telegram',
        'Google FCM',
        'Crypto',
        'Discord',
        'AI Suite',
        'PayPal',
        'Scholar',
        'Speedtest',
        'Steam',
        'TikTok',
        'miHoYo'
    ];

    config.rules = config.rules.filter(rule => !groupNames.find(name => RegExp(`,${name}$`).test(rule)));

    config["proxy-groups"] = config["proxy-groups"].filter(group => !groupNames.find(groupName => groupName == group.name));

    // config['rule-providers'] = Object.fromEntries(Object.entries(config['rule-providers']).filter(([name, group]) => {
    //   return !groupNames.includes(name);
    // }));

    // config.script.code = config.script.code.replace("{\n", "{\n        'AdBlock DNS Lite': 'AdBlock DNS Lite',\n        ");
    // config.script.code = '';

    return config;
}
