# Puts Ilay's own Claude login on the server, for his monitor only.
# 1.10.2026: Ilay bought his own Claude plan. His worker on the server runs as
# user ily and reads /etc/monitor-ily.env (systemd drop-in token.conf). The
# token is typed here, hidden, and goes straight over ssh: it never passes
# through a chat, a file on this PC, or the repository.
$s = Read-Host -AsSecureString 'Paste the code (sk-ant-oat...)'
$t = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)).Trim()
if ($t -notmatch '^sk-ant-') { Write-Host 'That does not look like the right code. Nothing was sent.'; exit 1 }
$remote = 'umask 077; cat > /etc/monitor-ily.env && chown ily:ily /etc/monitor-ily.env && chmod 600 /etc/monitor-ily.env && cd /home/ily/ily-monitor && sudo -u ily -H env $(cat /etc/monitor-ily.env) timeout 90 claude -p "Reply with the single word: OK" 2>&1 | tail -1'
$out = ('CLAUDE_CODE_OAUTH_TOKEN=' + $t) | ssh -i C:/Users/User/.ssh/monitor_server -o BatchMode=yes root@178.105.63.97 $remote
Write-Host ''
if ($out -match 'OK') { Write-Host 'Saved. Ilay''s monitor now runs on his own Claude account.' }
else { Write-Host ('Something failed: ' + $out); Write-Host 'Take a screenshot and send it to Claude.' }
