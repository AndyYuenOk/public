async function operator(proxies, targetPlatform, context) {
  const config = ProxyUtils.yaml.load(context.raw[0]);
  const domains = [
    ...new Set(
      proxies.map((proxy) => {
        return '+.' + proxy.server.split('.').slice(-2).join('.');
      })
    ),
  ].join(',');

  const nameserver = config.dns['proxy-server-nameserver'];
  if (domains && nameserver.length) {
    const policy = $substore.read('proxy-server-nameserver-policy') ?? {};

    const name = Object.values(context.source)[0].name;

    policy[name] = {};
    policy[name][domains] = nameserver;

    $substore.write(policy, 'proxy-server-nameserver-policy');
  }
}
