#!/usr/bin/env python3
"""Send one email for the Yoel collection board (28.10.2026).

Reads GMAIL_USER / GMAIL_APP_PASSWORD from /etc/monitor-mail.env (the same
read-only creds mail-search.py uses). Sends FROM that account TO the recipient
given as argv[1], with a fixed subject (argv[2]) so Gmail threads the updates
into one conversation in the shared mailbox. Body is read from stdin (UTF-8).

  echo "body" | python3 tools/lolos-mail-send.py 100lolos@gmail.com "subject"
"""
import sys
import ssl
import smtplib
from email.message import EmailMessage

ENV = '/etc/monitor-mail.env'


def creds():
    vals = {}
    with open(ENV, encoding='utf8') as f:
        for line in f:
            k, _, v = line.strip().partition('=')
            if k:
                vals[k] = v.strip()
    return vals.get('GMAIL_USER'), vals.get('GMAIL_APP_PASSWORD')


def main():
    if len(sys.argv) < 3:
        sys.exit('usage: lolos-mail-send.py <to> <subject>  (body on stdin)')
    to = sys.argv[1]
    subject = sys.argv[2]
    body = sys.stdin.read()
    user, pw = creds()
    if not user or not pw:
        sys.exit('no mail creds in ' + ENV)
    msg = EmailMessage()
    msg['From'] = 'לולוס גבייה <%s>' % user
    msg['To'] = to
    msg['Subject'] = subject
    msg.set_content(body)
    ctx = ssl.create_default_context()
    # Hetzner blocks outbound 465/25; 587 (STARTTLS) is open.
    with smtplib.SMTP('smtp.gmail.com', 587, timeout=30) as s:
        s.ehlo()
        s.starttls(context=ctx)
        s.ehlo()
        s.login(user, pw)
        s.send_message(msg)
    print('sent to', to)


if __name__ == '__main__':
    main()
