# The bank agent on a customer's computer (14.11.2026). No Claude, no AI, no password.
# Itzik: "ללקוח אין מנוי קלוד על המחשב שלו". Every minute it asks the monitor (the same
# /up/v1/<name>/pc queue, keys.json pcName "bank") whether a bank download was asked for.
# When one was ("בנק" on WhatsApp):
#   1. Chrome opens in a new, empty profile at the bank's login page. The customer logs in
#      himself, with his password and the SMS code. Nothing here reads or types them.
#   2. Once the bank's home page is up, the agent reads the last 90 days of movements and
#      the balance from the bank's own site (the same calls the site makes, as in the open
#      source israeli-bank-scrapers), inside that logged in page.
#   3. It sends one JSON file to the monitor, clicks the bank's logout, closes that Chrome
#      and deletes the temporary profile. Nothing of the bank stays on the computer.
# First bank: Hapoalim. Usage: bank-agent.ps1 [-Loop] [-Once]
param([switch]$Loop)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Web.Extensions
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Cfg = Get-Content -Raw -Encoding UTF8 (Join-Path $Here 'config.json') | ConvertFrom-Json
# 14.11.2026, Itzik: "is it all encrypted at the best level?" The key is kept sealed with Windows
# DPAPI (this user on this computer only, a copied config.json opens nowhere else). A plain key, the
# one that came inside the install file, is traded for a fresh one (POST rekey) on first contact and
# never written again. The new key is used only after it was saved and read back, so a failed save
# keeps the old key, which the server still accepts until the new one is used.
function Open-PcKey($enc) {
  try { $ss = ConvertTo-SecureString ([string]$enc); $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($ss); try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) } } catch { return $null }
}
function Get-PcKey($cfgPath) {
  $c = Get-Content -Raw -Encoding UTF8 $cfgPath | ConvertFrom-Json
  if ($c.keyDpapi) { $k = Open-PcKey $c.keyDpapi; if ($k) { return $k } }
  if (-not $c.key) { return $null }
  $old = [string]$c.key
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Method POST -Uri ($c.url.TrimEnd('/') + '/rekey') -Headers @{ 'X-Pc-Key' = $old } -Body '' -TimeoutSec 30
    $txt = if ($r.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($r.Content) } else { [string]$r.Content }
    $new = [string](($txt | ConvertFrom-Json).key)
    if ($new -notmatch '^[0-9a-f]{32}$') { return $old }
    $o = [ordered]@{}
    $c.PSObject.Properties | Where-Object { $_.Name -ne 'key' -and $_.Name -ne 'keyDpapi' } | ForEach-Object { $o[$_.Name] = $_.Value }
    $o['keyDpapi'] = ConvertFrom-SecureString (ConvertTo-SecureString $new -AsPlainText -Force)
    $tmp = $cfgPath + '.new'
    [IO.File]::WriteAllText($tmp, ($o | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
    $back = Get-Content -Raw -Encoding UTF8 $tmp | ConvertFrom-Json
    if ((Open-PcKey $back.keyDpapi) -ne $new) { Remove-Item $tmp -Force -ErrorAction SilentlyContinue; return $old }
    Move-Item $tmp $cfgPath -Force
    return $new
  } catch { return $old }
}
$PcKey = Get-PcKey (Join-Path $Here 'config.json')
$Log = Join-Path $Here 'bank.log'
$Lock = Join-Path $Here 'bank.lock'
$Profile = Join-Path $Here 'chrome-profile'
$Port = 9339
$WaitLoginMin = 15
$Days = 90
# config.json may name another login page (a test bank); the real one is Hapoalim's.
# 14.11: the task names the bank, BANK:RUN <id>. Each bank: its login page, how its logged in home looks,
# and the page script that reads it. Only Hapoalim (private accounts) so far; the others come as customers need them.
$Banks = @{
  'hapoalim' = @{ name = 'בנק הפועלים'; login = 'https://login.bankhapoalim.co.il/ng-portals/auth/he/'; inTest = "(/\/(ng-portals(-bt)?\/rb\/|portalserver\/HomePage)/i.test(location.href) && !!window.bnhpApp && !!window.bnhpApp.restContext)" }
}
function Use-Bank($id) {
  if (-not $Banks.ContainsKey($id)) { throw ('הבנק ' + $id + ' עוד לא נתמך בתוכנה הזאת') }
  $script:Bank = $Banks[$id]
  $script:BankLogin = if ($Cfg.bankLogin) { [string]$Cfg.bankLogin } else { $Bank.login }
  $script:BankOrigin = ([Uri]$BankLogin).GetLeftPart([UriPartial]::Authority)
  $script:BankHost = ([Uri]$BankLogin).Host
}
$Json = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$Json.MaxJsonLength = [int]::MaxValue

function Say($s) { $l = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '  ' + $s; Add-Content -Path $Log -Value $l -Encoding UTF8 }
function Call($method, $p, $body) {
  $u = $Cfg.url.TrimEnd('/') + '/' + $p
  try {
    if ($body -ne $null) {
      $r = Invoke-WebRequest -UseBasicParsing -Method $method -Uri $u -Headers @{ 'X-Pc-Key' = $PcKey } -Body ([Text.Encoding]::UTF8.GetBytes([string]$body)) -ContentType 'text/plain; charset=utf-8' -TimeoutSec 60
    } else {
      $r = Invoke-WebRequest -UseBasicParsing -Method $method -Uri $u -Headers @{ 'X-Pc-Key' = $PcKey } -TimeoutSec 60
    }
    $txt = if ($r.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($r.Content) } else { [string]$r.Content }
    return @{ code = [int]$r.StatusCode; text = $txt }
  } catch {
    $c = 0; try { $c = [int]$_.Exception.Response.StatusCode } catch {}
    return @{ code = $c; text = $_.Exception.Message }
  }
}

function Find-Chrome {
  foreach ($c in @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe")) {
    if ($c -and (Test-Path $c)) { return $c }
  }
  throw 'לא נמצא כרום או אדג׳ במחשב'
}

# 14.11: started from a hidden minute task, Chrome opened behind the windows on the screen,
# and the customer could not see where to log in. Windows does not let a background process
# take the focus, so the window is made topmost for a moment, which puts it in front.
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class BankWin {
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
}
"@
function Bring-Front {
  $n = 0
  Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($Profile) -and $_.CommandLine -notmatch '--type=' } |
    ForEach-Object {
      $h = (Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue).MainWindowHandle
      if ($h -and $h -ne [IntPtr]::Zero) {
        [void][BankWin]::ShowWindow($h, 3)
        [void][BankWin]::SetWindowPos($h, [IntPtr](-1), 0, 0, 0, 0, 0x43)
        Start-Sleep -Milliseconds 400
        [void][BankWin]::SetWindowPos($h, [IntPtr](-2), 0, 0, 0, 0, 0x43)
        [void][BankWin]::SetForegroundWindow($h)
        $n++
      }
    }
  return $n
}

# ---- Chrome DevTools Protocol over a websocket, in plain PowerShell 5.1 ----
$script:cid = 0
function Cdp-Connect($wsUrl) {
  $ws = New-Object System.Net.WebSockets.ClientWebSocket
  $ws.Options.KeepAliveInterval = [TimeSpan]::FromSeconds(20)
  $ws.ConnectAsync([Uri]$wsUrl, [Threading.CancellationToken]::None).Wait(15000) | Out-Null
  if ($ws.State -ne 'Open') { throw 'cdp connect failed' }
  return $ws
}
function Cdp($ws, $method, $params) {
  $script:cid++; $id = $script:cid
  $msg = $Json.Serialize(@{ id = $id; method = $method; params = $(if ($params) { $params } else { @{} }) })
  $b = [Text.Encoding]::UTF8.GetBytes($msg)
  $ws.SendAsync((New-Object 'ArraySegment[byte]' -ArgumentList @(, $b)), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).Wait(15000) | Out-Null
  $deadline = (Get-Date).AddSeconds(150)
  while ((Get-Date) -lt $deadline) {
    $ms = New-Object IO.MemoryStream
    do {
      $buf = New-Object byte[] 262144
      $t = $ws.ReceiveAsync((New-Object 'ArraySegment[byte]' -ArgumentList @(, $buf)), [Threading.CancellationToken]::None)
      if (-not $t.Wait(150000)) { throw 'cdp timeout' }
      $ms.Write($buf, 0, $t.Result.Count)
    } while (-not $t.Result.EndOfMessage)
    $o = $Json.DeserializeObject([Text.Encoding]::UTF8.GetString($ms.ToArray()))
    if ($o -and $o.ContainsKey('id') -and $o['id'] -eq $id) {
      if ($o.ContainsKey('error')) { throw ('cdp ' + $method + ': ' + $o['error']['message']) }
      return $o['result']
    }
  }
  throw 'cdp no answer'
}
function Eval($ws, $expr) {
  $r = Cdp $ws 'Runtime.evaluate' @{ expression = $expr; awaitPromise = $true; returnByValue = $true; timeout = 120000 }
  if ($r.ContainsKey('exceptionDetails')) { throw ('page error: ' + $r['exceptionDetails']['text'] + ' ' + $r['result']['description']) }
  return $r['result']['value']
}

function Close-Chrome {
  try {
    Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -and $_.CommandLine.Contains($Profile) } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  } catch {}
  Start-Sleep -Seconds 2
  for ($i = 0; $i -lt 5 -and (Test-Path $Profile); $i++) { try { Remove-Item -Recurse -Force $Profile -ErrorAction Stop } catch { Start-Sleep -Seconds 2 } }
}

# The page script: the same calls the bank's site makes, as israeli-bank-scrapers does for Hapoalim.
$Script = @'
(async function(xsrf, days){
  var base = location.origin;
  var rc = String(window.bnhpApp.restContext || '').replace(/^\//, '');
  var api = base + '/' + rc;
  var fmt = function(d){ return d.toISOString().slice(0,10).replace(/-/g,''); };
  var iso = function(s){ s = String(s||''); return s.length === 8 ? s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8) : s; };
  var end = new Date(), start = new Date(Date.now() - days*86400000);
  var accs = await (await fetch(base + '/ServerServices/general/accounts', {credentials:'include'})).json();
  var out = [];
  for (var a of (accs || []).filter(function(x){ return x.accountClosingReasonCode === 0; })) {
    var id = a.bankNumber + '-' + a.branchNumber + '-' + a.accountNumber;
    var bal = null;
    try { bal = (await (await fetch(api + '/current-account/composite/balanceAndCreditLimit?accountId=' + id + '&view=details&lang=he', {credentials:'include'})).json()).currentBalance; } catch (e) {}
    var h = {'Content-Type':'application/json;charset=UTF-8', 'pageUuid':'/current-account/transactions', 'uuid': (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()))};
    if (xsrf) h['X-XSRF-TOKEN'] = xsrf;
    var r = await fetch(api + '/current-account/transactions?accountId=' + id + '&numItemsPerPage=1000&retrievalEndDate=' + fmt(end) + '&retrievalStartDate=' + fmt(start) + '&sortCode=1', {method:'POST', credentials:'include', headers:h, body:'[]'});
    var j = r.status === 204 ? {transactions:[]} : await r.json();
    out.push({ account: '****' + String(a.accountNumber).slice(-4), balance: (typeof bal === 'number' ? bal : null),
      movements: (j.transactions || []).map(function(t){ return { date: iso(t.eventDate), value: iso(t.valueDate),
        amount: t.eventActivityTypeCode === 2 ? -t.eventAmount : t.eventAmount, payee: t.activityDescription || '', pending: t.serialNumber === 0 }; }) });
  }
  return JSON.stringify({ bank: 'hapoalim', from: start.toISOString().slice(0,10), to: end.toISOString().slice(0,10), accounts: out });
})
'@
$Logout = @'
(function(){ var w = ['יציאה','התנתקות','התנתק','יציאה מהחשבון'];
  var els = Array.prototype.slice.call(document.querySelectorAll('a,button,[role=button],span'));
  var hit = els.find(function(e){ var t = (e.textContent||'').trim(); return w.indexOf(t) > -1; });
  if (hit) { hit.click(); return 'clicked'; } return 'none'; })()
'@

function Run-Bank($t) {
  $start = Get-Date
  Close-Chrome
  $exe = Find-Chrome
  $login = $BankLogin
  Say ('פותח את הבנק עם ' + $exe)
  Start-Process -FilePath $exe -ArgumentList @("--remote-debugging-port=$Port", "--remote-allow-origins=http://127.0.0.1:$Port", "--user-data-dir=`"$Profile`"", '--no-first-run', '--no-default-browser-check', '--start-maximized', '--new-window', $login) | Out-Null
  $ws = $null
  try {
    for ($i = 0; $i -lt 30 -and -not $ws; $i++) {
      Start-Sleep -Seconds 1
      try {
        $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json" -TimeoutSec 5
        $pg = $pages | Where-Object { $_.type -eq 'page' -and $_.url -like ('*' + $BankHost + '*') } | Select-Object -First 1
        if (-not $pg) { $pg = $pages | Where-Object { $_.type -eq 'page' } | Select-Object -First 1 }
        if ($pg) { $ws = Cdp-Connect $pg.webSocketDebuggerUrl }
      } catch {}
    }
    if (-not $ws) { throw 'החלון של הבנק לא נפתח' }
    for ($i = 0; $i -lt 10; $i++) { if ((Bring-Front) -gt 0) { break }; Start-Sleep -Milliseconds 500 }
    try { Cdp $ws 'Page.bringToFront' @{} | Out-Null } catch {}
    Say 'מחכה שהלקוח יתחבר'
    $in = $false
    $lastLoad = Get-Date; $reloads = 0
    while (((Get-Date) - $start).TotalMinutes -lt $WaitLoginMin) {
      Start-Sleep -Seconds 3
      try {
        $ok = Eval $ws $Bank.inTest
        if ($ok) { $in = $true; break }
        # 14.11, Itzik's first real run: the window stayed white until he pressed F5. A page with
        # nothing to type in after 20 seconds is reloaded, up to three times.
        if (((Get-Date) - $lastLoad).TotalSeconds -gt 20 -and $reloads -lt 3) {
          $empty = Eval $ws "(!document.body || (document.body.innerText || '').trim().length < 20) && document.querySelectorAll('input').length === 0"
          if ($empty) { $reloads++; Say ('הדף לבן, מרענן (' + $reloads + ')'); Cdp $ws 'Page.reload' @{ ignoreCache = $true } | Out-Null; $lastLoad = Get-Date }
        }
      } catch {
        # the page navigated and the socket closed: reconnect to the bank tab
        try { $ws.Dispose() } catch {}
        $ws = $null
        try { $pg = (Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json" -TimeoutSec 5) | Where-Object { $_.type -eq 'page' -and $_.url -like ('*' + $BankHost + '*') } | Select-Object -First 1; if ($pg) { $ws = Cdp-Connect $pg.webSocketDebuggerUrl } } catch {}
        if (-not $ws) { if (-not (Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($Profile) })) { throw 'חלון הבנק נסגר לפני שהתחברת' } }
      }
    }
    if (-not $in) { throw ('לא זיהיתי התחברות לבנק תוך ' + $WaitLoginMin + ' דקות') }
    Say 'מחובר. מושך תנועות'
    Start-Sleep -Seconds 4
    $xsrf = ''
    try { $ck = Cdp $ws 'Network.getCookies' @{ urls = @($BankOrigin + '/') }; $x = $ck['cookies'] | Where-Object { $_['name'] -eq 'XSRF-TOKEN' } | Select-Object -First 1; if ($x) { $xsrf = [Uri]::UnescapeDataString($x['value']) } } catch {}
    $data = Eval $ws ($Script + '(' + $Json.Serialize($xsrf) + ', ' + $Days + ')')
    if (-not $data) { throw 'הבנק לא החזיר נתונים' }
    $d = $Json.DeserializeObject($data)
    $n = 0; foreach ($a in $d['accounts']) { $n += @($a['movements']).Count }
    $file = Join-Path $Here ('bank-' + (Get-Date -Format 'yyyyMMdd-HHmm') + '.json')
    [IO.File]::WriteAllText($file, $data, (New-Object Text.UTF8Encoding $false))
    $u = $Cfg.url.TrimEnd('/') + '/file/' + $t.id + '?name=' + [uri]::EscapeDataString((Split-Path -Leaf $file))
    Invoke-WebRequest -UseBasicParsing -Method POST -Uri $u -Headers @{ 'X-Pc-Key' = $PcKey } -InFile $file -ContentType 'application/octet-stream' -TimeoutSec 300 | Out-Null
    Remove-Item $file -Force -ErrorAction SilentlyContinue
    $out = 'none'
    try { $out = Eval $ws $Logout; Start-Sleep -Seconds 4 } catch {}
    Say ('ירדו ' + $n + ' תנועות. יציאה: ' + $out)
    $accs = @($d['accounts']).Count
    $msg = '🏦 ירדו ' + $n + ' תנועות מ' + ($(if ($accs -gt 1) { $accs.ToString() + ' חשבונות' } else { 'החשבון' })) + ', מ ' + $d['from'] + ' עד ' + $d['to'] + '.' + "`n" + $(if ($out -eq 'clicked') { 'התנתקתי מהבנק וסגרתי את החלון.' } else { 'סגרתי את החלון של הבנק ומחקתי ממנו הכל. כדאי לוודא שאין חלון בנק פתוח.' })
    Call 'POST' ('done/' + $t.id) $msg | Out-Null
  } catch {
    Say ('!! ' + $_.Exception.Message)
    Call 'POST' ('fail/' + $t.id) ([string]$_.Exception.Message) | Out-Null
  } finally {
    try { if ($ws) { $ws.Dispose() } } catch {}
    Close-Chrome
  }
}

function Once {
  Set-Content -Path (Join-Path $Here 'last-run.txt') -Value (Get-Date -Format o) -Encoding UTF8
  if (Test-Path $Lock) {
    if (((Get-Date) - (Get-Item $Lock).LastWriteTime).TotalMinutes -lt ($WaitLoginMin + 5)) { return }
    Remove-Item $Lock -Force -ErrorAction SilentlyContinue
  }
  $r = Call 'GET' 'next' $null
  if ($r.code -eq 204) { return }
  if ($r.code -ne 200) { Say ('!! השרת: ' + $r.code + ' ' + $r.text); return }
  $t = $r.text | ConvertFrom-Json
  Set-Content -Path $Lock -Value $t.id -Encoding UTF8
  try {
    if ([string]$t.task -notmatch 'BANK:RUN(?:\s+([a-z0-9-]+))?') { Call 'POST' ('fail/' + $t.id) 'המחשב הזה מבצע רק משיכת תנועות בנק' | Out-Null; return }
    $bid = if ($Matches[1]) { $Matches[1] } else { 'hapoalim' }
    Say ('בקשת בנק ' + $t.id + ' ' + $bid)
    try { Use-Bank $bid } catch { Call 'POST' ('fail/' + $t.id) ([string]$_.Exception.Message) | Out-Null; return }
    Run-Bank $t
  } finally { Remove-Item $Lock -Force -ErrorAction SilentlyContinue }
}

if ($Loop) { while ($true) { try { Once } catch { Say ('!! ' + $_.Exception.Message) }; Start-Sleep -Seconds 60 } }
else { try { Once } catch { Say ('!! ' + $_.Exception.Message) } }
