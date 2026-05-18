function operator(proxies, targetPlatform, context) {
  const proxyMap = new Map();
  proxies.forEach((proxy) => {
    let key = proxy.name;

    let entranceIp = proxy.entrance.ip;
    if (proxy.entrance.ip == proxy.egress.ip) {
      entranceIp = "";
    }

    if (proxy.egress.ip) {
      let octets = $arguments.octets ?? 4;
      key = entranceIp + proxy.egress.ip.split(".").slice(0, octets).join(".");
    }

    if (proxy.egress.asn) {
      if ($arguments.geo == 1) {
        key = entranceIp + proxy.egress.asn + proxy.egress.country;
      }

      if ($arguments.geo == 2) {
        key =
          entranceIp +
          proxy.egress.asn +
          proxy.egress.country +
          proxy.egress.region +
          proxy.egress.city;
      }
    }

    proxyMap.set(key, proxy);
  });
  return Array.from(proxyMap.values());
}
