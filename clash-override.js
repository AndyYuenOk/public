const main = (config) => {
  config['sub-rules'] ??= {};
  config['sub-rules'].docker = [
    'DOMAIN-KEYWORD,docker,Proxy',
    'DOMAIN-KEYWORD,github,Proxy',
    'MATCH,DIRECT',
  ];

  config.rules.unshift('SUB-RULE,(PROCESS-NAME,com.docker.backend.exe),docker');

  return config;
};
