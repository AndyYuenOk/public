function operator(proxies = [], targetPlatform, context) {
  return proxies.filter((proxy) => {
    // prettier-ignore
    if ([
      // proxy?.ai?.tag,
      proxy?.entrance?.ip
    ].every(Boolean)) {
      return true;
    }
    return false;
  });
}
