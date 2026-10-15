async function operator(proxies, targetPlatform, context) {
  const hosts = ProxyUtils.yaml.load(context.raw[0]).hosts;
  return proxies.map((proxy) => {
    proxy.server = hosts[proxy.server];
    return proxy;
  });
}
