#!/usr/bin/env python3
"""11.11.2026: one mail from info@it-solution.co.il (lib/mailer.js calls this).
Reads {"to","subject","text","html"?} as JSON on stdin. SMTP settings come from the environment:
SMTP_HOST, SMTP_PORT (587, STARTTLS; Hetzner blocks 25 and 465), SMTP_USER, SMTP_PASS, MAIL_FROM.
Prints "sent" or exits non zero with the reason. Nothing is logged with the body."""
import json
import os
import smtplib
import ssl
import sys
from email.message import EmailMessage
from email.utils import make_msgid


def main():
    m = json.load(sys.stdin)
    host, user, pw = os.environ.get('SMTP_HOST'), os.environ.get('SMTP_USER'), os.environ.get('SMTP_PASS')
    if not (host and user and pw):
        sys.exit('no smtp settings')
    port = int(os.environ.get('SMTP_PORT') or 587)
    msg = EmailMessage()
    msg['From'] = os.environ.get('MAIL_FROM') or 'IT Solution <info@it-solution.co.il>'
    msg['To'] = m['to']
    msg['Subject'] = m['subject']
    msg['Message-ID'] = make_msgid(domain='it-solution.co.il')
    msg.set_content(m['text'])
    if m.get('html'):
        msg.add_alternative(m['html'], subtype='html')
    with smtplib.SMTP(host, port, timeout=30) as s:
        s.starttls(context=ssl.create_default_context())
        s.login(user, pw)
        s.send_message(msg)
    print('sent')


if __name__ == '__main__':
    main()
