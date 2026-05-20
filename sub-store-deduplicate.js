function operator(proxies, targetPlatform, context) {
  const proxyMap = new Map();
  proxies.forEach((proxy) => {
    let key = proxy.name;

    if (
      proxy.entrance.ip &&
      proxy.entrance.asn &&
      proxy.egress.ip &&
      proxy.egress.asn
    ) {
      let octets = $arguments.octets ?? 4;
      key =
        proxy.entrance.ip +
        proxy.egress.ip.split(".").slice(0, octets).join(".");

      if ($arguments.geo == 1) {
        key =
          proxy.entrance.asn +
          proxy.entrance.country +
          proxy.egress.asn +
          proxy.egress.country;
      }

      if ($arguments.geo == 2) {
        key =
          proxy.entrance.asn +
          proxy.entrance.country +
          proxy.entrance.region +
          proxy.entrance.city +
          proxy.egress.asn +
          proxy.egress.country +
          proxy.egress.region +
          proxy.egress.city;
      }
    }

    proxyMap.set(key + proxy.type, proxy);
  });
  return Array.from(proxyMap.values());
}
