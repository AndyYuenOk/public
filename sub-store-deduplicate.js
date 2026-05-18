function operator(proxies, targetPlatform, context) {
  const proxyMap = new Map();
  proxies.forEach((proxy) => {
    let key = proxy.name;

    let octets = $arguments.octets ?? 4;
    if (proxy.egress.ip) {
      key = proxy.egress.ip.split(".").slice(0, octets).join(".");
    }

    if (proxy.egress.asn) {
      if ($arguments.geo == 1) {
        key = proxy.egress.asn + proxy.egress.country;
      }

      if ($arguments.geo == 2) {
        key =
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
