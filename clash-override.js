const main = (config) => {
  config.rules.unshift("DOMAIN-SUFFIX,ikuncode.cc,DIRECT");
  config.rules.unshift("DOMAIN-SUFFIX,b886.top,DIRECT");
  config.rules.unshift("DOMAIN-SUFFIX,right.codes,DIRECT");
  config.rules.unshift("DOMAIN-SUFFIX,codex-for.me,DIRECT");
  config.rules.unshift("IP-CIDR,23.94.183.182/32,DIRECT,no-resolve");

  return config;
};
