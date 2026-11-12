#!/usr/bin/env python3
"""
12.11.2026, Itzik: "אבטחה זה מעלה ראשונה וזה חלק מעבודות המנהל השוטפות לבדוק את האבטחה שלנו".
Read only security check of the monitor server. Runs as root (monitor-security.timer, 06:50 and 16:50 Israel)
and by hand: sudo python3 /usr/local/bin/monitor-security-check.py
Writes data/status/security-summary.json in Itzik's monitor ({at, checks:[{k, ok, t, sub}]}), which lib/manager.js
shows as the FIRST line of every round. A push goes to Itzik only when the set of failing checks changes.
Never prints a secret: only names, modes and counts.
Source: setup/security-check.py in abaitzik-monitor; installed by copying to /usr/local/bin.
"""
import json, os, re, glob, stat, subprocess, time, datetime, pwd

REPO = '/home/monitor/abaitzik-monitor'
OUT = os.path.join(REPO, 'data', 'status', 'security-summary.json')
CADDY = '/etc/caddy/Caddyfile'
checks = []


def add(k, ok, t, sub=''):
    checks.append({'k': k, 'ok': bool(ok), 't': t, 'sub': sub[:300]})


def sh(cmd, timeout=30):
    try:
        return subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
    except Exception as e:
        return subprocess.CompletedProcess(cmd, 99, '', str(e))


def tenants():
    out = []
    for f in glob.glob(os.path.join(REPO, 'data', 'tenants', 'tenants', '*.json')):
        try:
            j = json.load(open(f, encoding='utf-8'))
        except Exception:
            continue
        d = j.get('dir') or ''
        if not d or not os.path.isdir(d) or j.get('paused'):
            continue
        try:
            user = pwd.getpwuid(os.stat(d).st_uid).pw_name
        except Exception:
            continue
        if user in ('monitor', 'root'):
            continue
        out.append({'id': j.get('id') or os.path.basename(f)[:-5], 'dir': d, 'user': user})
    return out


# 1. Customers cannot read each other, or Itzik's data.
T = tenants()
leaks = []
for a in T:
    for b in T:
        if a['user'] == b['user']:
            continue
        probe = os.path.join(b['dir'], 'instance.json')
        if os.path.exists(probe) and sh('runuser -u %s -- test -r %s' % (a['user'], probe)).returncode == 0:
            leaks.append(a['id'] + ' > ' + b['id'])
    own = os.path.join(REPO, 'data', 'keys.json')
    if sh('runuser -u %s -- test -r %s' % (a['user'], own)).returncode == 0:
        leaks.append(a['id'] + ' > איציק')
add('isolation', not leaks, 'בידוד בין הלקוחות', ('לקוח רואה קבצים של אחר: ' + ', '.join(leaks)) if leaks else '%d לקוחות, אף אחד לא רואה את האחר' % len(T))

# 2. Secret files closed to others.
secrets = [os.path.join(REPO, 'data', n) for n in ('owner-code.txt', 'owner-code.prev.txt', 'keys.json', 'gviya/token.txt', 'gviya/devices.json')]
secrets += [os.path.join(REPO, 'gate-key.txt')] + glob.glob('/etc/*.env') + glob.glob('/root/tenant-codes/*')
for t in T:
    secrets += [os.path.join(t['dir'], 'gate-key.txt'), os.path.join(t['dir'], 'data', 'keys.json'), os.path.join(t['dir'], 'data', 'fc-key.txt')]
open_s = []
for f in secrets:
    try:
        m = os.stat(f).st_mode
    except FileNotFoundError:
        continue
    if m & stat.S_IROTH or m & stat.S_IWOTH:
        open_s.append(f)
add('secrets', not open_s, 'קבצים סודיים נעולים', ('פתוחים לכולם: ' + ', '.join(open_s)) if open_s else 'קודים, מפתחות וסיסמאות בהרשאות סגורות')

# 3. Logs readable by other users.
open_l = [f for f in glob.glob('/var/log/monitor-*.log') if os.stat(f).st_mode & stat.S_IROTH]
add('logs', not open_l, 'יומנים סגורים', ('%d יומנים פתוחים לכולם: ' % len(open_l) + ', '.join(os.path.basename(x) for x in open_l[:5])) if open_l else 'אף משתמש אחר לא קורא אותם')

# 4. Owner code strength.
try:
    oc = open(os.path.join(REPO, 'data', 'owner-code.txt')).read().strip()
    add('ownercode', len(oc) >= 8, 'קוד הבעלים חזק', 'באורך %d' % len(oc) + ('' if len(oc) >= 8 else ', צריך לפחות 8'))
except Exception:
    add('ownercode', False, 'קוד הבעלים חזק', 'הקובץ חסר')

# 5. Lolos collection board: no open enrollment.
add('gviya', not os.path.exists(os.path.join(REPO, 'data', 'gviya', 'enroll')), 'לוח הגבייה סגור למכשירים חדשים', 'חלון רישום פתוח' if os.path.exists(os.path.join(REPO, 'data', 'gviya', 'enroll')) else '')

# 6. Caddy admin API not on TCP.
r = sh('curl -s -m 3 -o /dev/null -w "%{http_code}" http://127.0.0.1:2019/config/')
add('caddyadmin', r.stdout.strip() in ('', '000'), 'ניהול שרת האתרים סגור', 'פתוח על 127.0.0.1:2019' if r.stdout.strip() not in ('', '000') else '')

# 7. Listening ports: only 22, 80, 443 to the world.
r = sh("ss -Htln")
pub = set()
for line in r.stdout.splitlines():
    parts = line.split()
    if len(parts) < 4:
        continue
    addr = parts[3]
    host, _, port = addr.rpartition(':')
    if host.strip('[]') in ('127.0.0.1', '::1', '127.0.0.53', '127.0.0.54') or host.startswith('127.'):
        continue
    if port not in ('22', '80', '443'):
        pub.add(port)
add('ports', not pub, 'רק הפורטים של האתרים פתוחים', ('פורטים פתוחים לעולם: ' + ', '.join(sorted(pub))) if pub else '22, 80, 443')

# 8. Firewall, fail2ban, automatic updates.
ufw = sh('ufw status').stdout
add('firewall', 'Status: active' in ufw, 'חומת אש פעילה', '' if 'Status: active' in ufw else 'ufw כבוי')
for unit, k, t in (('fail2ban', 'fail2ban', 'חסימת ניסיונות פריצה (fail2ban)'), ('unattended-upgrades', 'updates', 'עדכוני אבטחה אוטומטיים')):
    a = sh('systemctl is-active ' + unit).stdout.strip()
    add(k, a == 'active', t, '' if a == 'active' else unit + ' ' + a)

# 9. SSH: keys only.
st = sh('sshd -T').stdout.lower()
pw_off = re.search(r'^passwordauthentication no$', st, re.M) is not None
root_ok = re.search(r'^permitrootlogin (no|prohibit-password|without-password)$', st, re.M) is not None
add('ssh', pw_off and root_ok, 'כניסה לשרת רק עם מפתח', '' if pw_off and root_ok else ('סיסמה מותרת ' if not pw_off else '') + ('root עם סיסמה' if not root_ok else ''))

# 10. Every site: security headers, nothing private served.
hosts = []
try:
    for line in open(CADDY, encoding='utf-8'):
        m = re.match(r'^([a-z0-9.-]+\.[a-z]{2,})(\s*,\s*[a-z0-9.-]+)*\s*\{\s*$', line.strip())
        if m:
            hosts.append(m.group(1))
except Exception:
    pass
nohdr, exposed = [], []
for h in hosts:
    r = sh('curl -s -m 8 -o /dev/null -D - https://%s/' % h, timeout=15).stdout.lower()
    if not r:
        continue
    if 'strict-transport-security' not in r or ('x-frame-options' not in r and 'frame-ancestors' not in r):
        nohdr.append(h)
    home = sh('curl -s -m 8 https://%s/ | head -c 400' % h, timeout=15).stdout
    for p in ('.git/config', 'gate-key.txt', 'instance.json', 'data/keys.json', '.env', 'CLAUDE.md'):
        code = sh('curl -s -m 8 -o /dev/null -w "%%{http_code}" https://%s/%s' % (h, p), timeout=15).stdout.strip()
        if code == '200':
            body = sh('curl -s -m 8 https://%s/%s | head -c 400' % (h, p), timeout=15).stdout
            # A site that answers every path with its home page (index.html, or a fixed word) is not a leak.
            if body != home and '<!doctype html' not in body.lower() and '<html' not in body.lower():
                exposed.append(h + '/' + p)
add('headers', not nohdr, 'כותרות אבטחה בכל האתרים', ('חסרות ב: ' + ', '.join(nohdr)) if nohdr else '%d אתרים' % len(hosts))
add('exposed', not exposed, 'אין קבצים פרטיים פתוחים ברשת', ('נגישים: ' + ', '.join(exposed)) if exposed else '')

# Write, and push only when the failing set changed.
prev = {}
try:
    prev = json.load(open(OUT, encoding='utf-8'))
except Exception:
    pass
bad_now = sorted(c['k'] for c in checks if not c['ok'])
bad_prev = sorted(c['k'] for c in prev.get('checks', []) if not c.get('ok'))
res = {'at': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'checks': checks}
tmp = OUT + '.tmp'
with open(tmp, 'w', encoding='utf-8') as f:
    json.dump(res, f, ensure_ascii=False, indent=1)
os.chmod(tmp, 0o600)
mon = pwd.getpwnam('monitor')
os.chown(tmp, mon.pw_uid, mon.pw_gid)
os.replace(tmp, OUT)
if bad_now != bad_prev and prev:
    if bad_now:
        title = '🛡️ אבטחה: ' + str(len(bad_now)) + ' בעיות'
        body = '\n'.join(c['t'] + ': ' + c['sub'] for c in checks if not c['ok'])
    else:
        title, body = '🛡️ אבטחה: הכל תקין שוב', 'כל %d הבדיקות עברו' % len(checks)
    subprocess.run(['runuser', '-u', 'monitor', '--', 'node', os.path.join(REPO, 'notify.js'), title, body[:600]], cwd=REPO, timeout=60)
print(json.dumps({'ok': len(checks) - len(bad_now), 'bad': bad_now}, ensure_ascii=False))
