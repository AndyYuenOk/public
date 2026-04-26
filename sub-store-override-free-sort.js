let config = ProxyUtils.yaml.load($content ?? $files[0]);
config = await _main(config);
$content = ProxyUtils.yaml.dump(config);

function _main(config) {
  config.proxies.sort(
    (a, b) => parseSpeedToKb(b.name) - parseSpeedToKb(a.name),
  );

  return config;
}
function parseSpeedToKb(name) {
  const speed = name.split("|")[1];
  if (speed.includes("MB/s")) {
    return parseFloat(speed) * 1024;
  } else if (speed.includes("KB/s")) {
    return parseFloat(speed);
  } else {
    return -1;
  }
}
