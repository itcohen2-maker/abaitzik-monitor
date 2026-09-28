#!/usr/bin/env python3
"""Read-only search in Itzik's Gmail, for the sessions on the server.

28.9: a session could not find the date of the occupational doctor because the
server had no way into the mailbox. This opens the inbox with EXAMINE (read
only) and fetches with BODY.PEEK, so nothing is marked read, moved or deleted,
and there is no code here that sends.

Credentials come from /etc/monitor-mail.env (GMAIL_USER, GMAIL_APP_PASSWORD),
which Itzik writes himself. They never live in the repo.

  python3 tools/mail-search.py "רופא תעסוקתי"            subject or body text
  python3 tools/mail-search.py --from clalit.co.il        sender
  python3 tools/mail-search.py "תור" --days 30 --limit 5  last 30 days, 5 results
  python3 tools/mail-search.py --id 12345                 full text of one message
"""
import argparse
import email
import email.header
import email.utils
import imaplib
import sys
from datetime import date, timedelta

ENV = '/etc/monitor-mail.env'
BOX = '"[Gmail]/All Mail"'


def creds():
    vals = {}
    try:
        with open(ENV, encoding='utf8') as f:
            for line in f:
                k, _, v = line.strip().partition('=')
                if k:
                    vals[k] = v.strip()
    except OSError as e:
        sys.exit(f'no credentials: {e}. Itzik writes {ENV} with GMAIL_USER and GMAIL_APP_PASSWORD.')
    if not vals.get('GMAIL_USER') or not vals.get('GMAIL_APP_PASSWORD'):
        sys.exit(f'{ENV} is missing GMAIL_USER or GMAIL_APP_PASSWORD')
    return vals['GMAIL_USER'], vals['GMAIL_APP_PASSWORD'].replace(' ', '')


def dec(v):
    if not v:
        return ''
    return ''.join(
        p.decode(c or 'utf8', 'replace') if isinstance(p, bytes) else p
        for p, c in email.header.decode_header(v))


def body(msg):
    parts = msg.walk() if msg.is_multipart() else [msg]
    html = ''
    for p in parts:
        if p.get_content_maintype() == 'multipart' or p.get('Content-Disposition', '').startswith('attachment'):
            continue
        raw = p.get_payload(decode=True)
        if raw is None:
            continue
        text = raw.decode(p.get_content_charset() or 'utf8', 'replace')
        if p.get_content_type() == 'text/plain':
            return text
        if p.get_content_type() == 'text/html' and not html:
            import re
            html = re.sub(r'<[^>]+>', ' ', text)
    return html


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('text', nargs='?', help='words to look for, Gmail search syntax works')
    ap.add_argument('--from', dest='frm')
    ap.add_argument('--days', type=int, default=180)
    ap.add_argument('--limit', type=int, default=10)
    ap.add_argument('--id', help='print one message in full')
    a = ap.parse_args()

    user, pw = creds()
    m = imaplib.IMAP4_SSL('imap.gmail.com')
    m.login(user, pw)
    m.select(BOX, readonly=True)  # EXAMINE: nothing can change

    if a.id:
        _, data = m.uid('FETCH', a.id, '(BODY.PEEK[])')
        msg = email.message_from_bytes(data[0][1])
        print('From:', dec(msg['From']))
        print('Date:', msg['Date'])
        print('Subject:', dec(msg['Subject']))
        print()
        print(body(msg).strip()[:20000])
        m.logout()
        return

    q = []
    if a.text:
        q.append(a.text)
    if a.frm:
        q.append(f'from:{a.frm}')
    q.append('after:' + (date.today() - timedelta(days=a.days)).strftime('%Y/%m/%d'))
    # X-GM-RAW takes the same syntax as the Gmail search box, Hebrew included.
    m.literal = ' '.join(q).encode('utf8')
    _, data = m.uid('SEARCH', 'CHARSET', 'UTF-8', 'X-GM-RAW')
    uids = data[0].split()[-a.limit:][::-1]
    if not uids:
        print('nothing found for:', ' '.join(q))
    for uid in uids:
        _, d = m.uid('FETCH', uid, '(BODY.PEEK[HEADER.FIELDS (FROM DATE SUBJECT)] BODY.PEEK[TEXT]<0.600>)')
        head = email.message_from_bytes(d[0][1])
        snippet = d[1][1].decode('utf8', 'replace') if len(d) > 1 and isinstance(d[1], tuple) else ''
        when = email.utils.parsedate_to_datetime(head['Date']).strftime('%d.%m.%Y %H:%M') if head['Date'] else ''
        print(f'[{uid.decode()}] {when} | {dec(head["From"])}')
        print('   ', dec(head['Subject']))
        print('   ', ' '.join(snippet.split())[:200])
    m.logout()


if __name__ == '__main__':
    main()
