$server.name = $server.name.replace(
  /[\u{1F1E6}-\u{1F1FF}]{2}/gu,
  `$& ${$server.subscriptionName}`,
);

$server.subscriptionDisplayName = $server._subDisplayName;
