// Define main function (script entry)

function main(config, profileName) {
    // config.sniffer = {
    //     enable: true,
    //     'force-dns-mapping': false,
    //     'parse-pure-ip': true,
    //     'override-destination': false,
    //     sniff: {
    //         HTTP: { ports: [80, 8080, 8081, 8082, 8083, 8084, 8085, 8086, 8087, 8088] },
    //         TLS: { ports: [443, 8443] },
    //         QUIC: { ports: [443, 8443] }
    //     }
    // };

    // config.rules.unshift('DOMAIN-SUFFIX,xn--v4q818bf34b.com,DIRECT');
    config.rules.unshift('DOMAIN-SUFFIX,pairdrop.net,DIRECT');


    // config["rule-providers"]['AdBlock'] = {
    //     type: 'http',
    //     url: "https://gh-proxy.org/https://raw.githubusercontent.com/privacy-protection-tools/anti-AD/master/anti-ad-clash.yaml",
    //     interval: 86400,
    //     proxy: 'DIRECT',
    //     behavior: 'domain'
    // };



    const names = new Set([
        "AdBlock",
        "🛑 全球拦截"
    ]);

    const name = config["proxy-groups"].find(({ name }) => names.has(name)).name;

    if (name) {
        const rule = `RULE-SET,${name},${name}`;
        config.rules.includes(rule) || config.rules.unshift(rule);

        config["rule-providers"] ??= {};
        config["rule-providers"][name] = {
            type: 'http',
            url: "https://gcore.jsdelivr.net/gh/217heidai/adblockfilters@main/rules/adblockmihomo.yaml",
            interval: 86400,
            proxy: 'DIRECT',
            behavior: 'domain'
        };
    }

    return config;
}
