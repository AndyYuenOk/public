function operator(proxies, targetPlatform, context) {
  const proxyMap = new Map();
  proxies.forEach((proxy) => {
    proxyMap.set(proxy.server + proxy.port, proxy);
  });
  return Array.from(proxyMap.values());
}
