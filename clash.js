const main = (config, profileName) => {
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
    // config.rules.unshift('DOMAIN-SUFFIX,pairdrop.net,DIRECT');


    // config["rule-providers"]['AdBlock'] = {
    //     type: 'http',
    //     url: "https://gh-proxy.org/https://raw.githubusercontent.com/privacy-protection-tools/anti-AD/master/anti-ad-clash.yaml",
    //     interval: 86400,
    //     proxy: 'DIRECT',
    //     behavior: 'domain'
    // };

    let names = [
        "AdBlock",
        "全球拦截",
        "广告拦截"
    ];

    const name = config["proxy-groups"]
        .find(group => names.some(name => group.name.includes(name)))
        ?.name;

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

    // let index = config["proxy-groups"].findIndex(({ name }) => name.includes("Auto - UrlTest"));
    // index > -1 && config["proxy-groups"].splice(1, 0, config["proxy-groups"].splice(index, 1)[0]);

    // names = ["手动切换"];
    // config["proxy-groups"] = config["proxy-groups"]
    //     .filter(({ name: name1 }) => !names.some(name2 => name1.includes(name2)))
    //     .map(group => ({
    //         ...group,
    //         proxies: group.proxies.filter(proxy =>
    //             !names.some(name => proxy.includes(name))
    //         )
    //     }));

    // if (profileName) {
    //     profileName = " | " + profileName;

    //     names = ["手动切换", "Ai平台"];

    //     config["proxy-groups"] = config["proxy-groups"].map(group => ({
    //         ...group,
    //         name: names.reduce(
    //             (acc, name) => acc.replace(name, name + profileName),
    //             group.name
    //         ),
    //         proxies: group.proxies.map(proxy =>
    //             names.reduce(
    //                 (acc, name) => acc.replace(name, name + profileName),
    //                 proxy
    //             )
    //         ),
    //     }));

    //     config.rules = config.rules.map(rule =>
    //         names.reduce((result, name) =>
    //             result.replace(name, name + profileName),
    //             rule
    //         )
    //     );
    // }

    return config;
}
