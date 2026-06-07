# FCM IP Resolve & Latency Test - IPv4
# DNS: 223.5.5.5 (Aliyun)
# Usage: .\fcm-ping-v4.ps1 [-Count 4] [-Timeout 2000] [-Export]

param(
    [int]$Count   = 4,
    [int]$Timeout = 2000,
    [switch]$Export
)

$DNS_SERVER = "223.5.5.5"

$FCM_DOMAINS = @(
    "mtalk.google.com",
    "mtalk4.google.com",
    "mtalk-staging.google.com",
    "alt1-mtalk.google.com",
    "alt2-mtalk.google.com",
    "alt3-mtalk.google.com",
    "alt4-mtalk.google.com",
    "alt5-mtalk.google.com",
    "alt6-mtalk.google.com",
    "alt7-mtalk.google.com",
    "alt8-mtalk.google.com"
)

# nslookup output format (no -type flag, default query):
#   Addresses:  2001:4860:...      <- first IP on same line as label
#               216.239.36.57      <- subsequent IPs on indented lines
# We collect every token that looks like an IPv4 address from those lines.
function Resolve-IPv4 {
    param([string]$Domain)
    try {
        $raw = & nslookup $Domain $DNS_SERVER 2>&1
        $ips      = @()
        $collect  = $false
        $ipv4re   = '(?:(?:\d{1,3}\.){3}\d{1,3})'

        foreach ($line in $raw) {
            # "Addresses:" or "Address:" line -> start collecting
            if ($line -match '^\S*Addresses?:') {
                $collect = $true
            }
            if ($collect) {
                # grab every IPv4-shaped token on this line
                $found = [regex]::Matches($line, $ipv4re)
                foreach ($m in $found) {
                    $ip = $m.Value
                    # skip the DNS server IP itself
                    if ($ip -ne $DNS_SERVER) { $ips += $ip }
                }
                # stop collecting when we hit a non-indented, non-blank line
                # that is NOT the Addresses line itself
                if ($line -notmatch '^\s' -and $line -notmatch '^\S*Addresses?:' -and $line.Trim() -ne '') {
                    if ($ips.Count -gt 0) { $collect = $false }
                }
            }
        }
        return $ips | Select-Object -Unique
    } catch {
        return @()
    }
}

function Test-Latency {
    param([string]$IP, [int]$Count, [int]$Timeout)
    $rtts = @()
    for ($i = 0; $i -lt $Count; $i++) {
        try {
            $reply = (New-Object System.Net.NetworkInformation.Ping).Send($IP, $Timeout)
            if ($reply.Status -eq "Success") { $rtts += $reply.RoundtripTime }
        } catch {}
    }
    if ($rtts.Count -eq 0) { return @{ Min=-1; Avg=-1; Max=-1; Loss=100 } }
    return @{
        Min  = ($rtts | Measure-Object -Minimum).Minimum
        Avg  = [math]::Round(($rtts | Measure-Object -Average).Average, 1)
        Max  = ($rtts | Measure-Object -Maximum).Maximum
        Loss = [math]::Round((($Count - $rtts.Count) / $Count) * 100)
    }
}

# --------------------------------------------------------------------------
Write-Host ""
Write-Host "  FCM IP Latency Test - IPv4" -ForegroundColor Cyan
Write-Host "  DNS: $DNS_SERVER  |  Pings: $Count  |  Timeout: ${Timeout}ms"
Write-Host ("  " + "-" * 70)

$allIPs = @{}   # ip -> first domain that returned it

Write-Host "  Resolving..." -ForegroundColor DarkGray
foreach ($domain in $FCM_DOMAINS) {
    $ips = Resolve-IPv4 -Domain $domain
    foreach ($ip in $ips) {
        if (-not $allIPs.ContainsKey($ip)) { $allIPs[$ip] = $domain }
    }
}

if ($allIPs.Count -eq 0) {
    Write-Host "  No IPv4 addresses resolved. Check DNS connectivity." -ForegroundColor Red
    exit 1
}

Write-Host ("  Resolved {0} unique IPv4 addresses. Testing latency..." -f $allIPs.Count) -ForegroundColor DarkGray
Write-Host ("  " + "-" * 70)
Write-Host ("  {0,-18} {1,-28} {2,6} {3,6} {4,6} {5,6}" -f "IP", "Domain", "min", "avg", "max", "loss%")
Write-Host ("  " + "-" * 70)

$rows = @()

foreach ($ip in ($allIPs.Keys | Sort-Object)) {
    $domain = $allIPs[$ip]
    $lat    = Test-Latency -IP $ip -Count $Count -Timeout $Timeout

    $rows += [PSCustomObject]@{
        IP = $ip; Domain = $domain
        Min = $lat.Min; Avg = $lat.Avg; Max = $lat.Max; Loss = $lat.Loss
    }

    $minS  = if ($lat.Min -lt 0) { "     -" } else { "{0,5}ms" -f $lat.Min }
    $avgS  = if ($lat.Avg -lt 0) { "timeout" } else { "{0,5}ms" -f $lat.Avg }
    $maxS  = if ($lat.Max -lt 0) { "     -" } else { "{0,5}ms" -f $lat.Max }
    $lossS = "{0,5}%" -f $lat.Loss
    $col   = if ($lat.Avg -lt 0)   { "DarkGray" } `
             elseif ($lat.Avg -lt 100) { "Green" } `
             elseif ($lat.Avg -lt 200) { "Yellow" } `
             else                  { "Red" }

    $shortDomain = if ($domain.Length -gt 27) { $domain.Substring(0,24) + "..." } else { $domain }
    Write-Host ("  {0,-18} {1,-28}" -f $ip, $shortDomain) -NoNewline
    Write-Host (" $minS $avgS $maxS $lossS") -ForegroundColor $col
}

Write-Host ("  " + "-" * 70)

$valid = $rows | Where-Object { $_.Avg -ge 0 }
if ($valid.Count -gt 0) {
    $best = $valid | Sort-Object Avg | Select-Object -First 1
    $gavg = [math]::Round(($valid | Measure-Object -Property Avg -Average).Average, 1)
    Write-Host ""
    Write-Host ("  Total: {0}  |  Reachable: {1}  |  Global avg: {2}ms" -f $rows.Count, $valid.Count, $gavg) -ForegroundColor Cyan
    Write-Host ("  Best : {0}  avg {1}ms  ({2})" -f $best.IP, $best.Avg, $best.Domain) -ForegroundColor Green
} else {
    Write-Host "  No reachable IPs." -ForegroundColor Red
}

if ($Export) {
    $path = "fcm-ipv4-$(Get-Date -Format 'yyyyMMdd-HHmmss').csv"
    $rows | Export-Csv -Path $path -NoTypeInformation -Encoding UTF8
    Write-Host ("  Exported: {0}" -f $path) -ForegroundColor DarkCyan
}
Write-Host ""