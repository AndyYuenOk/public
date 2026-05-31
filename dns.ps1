$servers = @(
    [PSCustomObject]@{Name='System'; IP=$null},
    [PSCustomObject]@{Name='Ali'; IP='223.5.5.5'},
    [PSCustomObject]@{Name='DNSPod'; IP='119.29.29.29'},
    [PSCustomObject]@{Name='Google'; IP='8.8.8.8'}
)

$rounds = 10
$domain = 'baidu.com'

$servers | ForEach-Object {
    $item = $_
    $results = 1..$rounds | ForEach-Object {
        if ($item.IP) {
            (Measure-Command { Resolve-DnsName $domain -Server $item.IP -ErrorAction SilentlyContinue }).TotalMilliseconds
        } else {
            (Measure-Command { Resolve-DnsName $domain -ErrorAction SilentlyContinue }).TotalMilliseconds
        }
    }
    [PSCustomObject]@{
        DNS  = $item.Name
        Min  = [math]::Round(($results | Measure-Object -Minimum).Minimum, 1)
        Avg  = [math]::Round(($results | Measure-Object -Average).Average, 1)
        Max  = [math]::Round(($results | Measure-Object -Maximum).Maximum, 1)
    }
} | Format-Table -AutoSize