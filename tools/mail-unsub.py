#!/usr/bin/env python3
"""Read-only fetch of mail that may ask to leave Shachar's mailing list (4.11.2026).

Mail to shachar@abaitzik.com is forwarded by Forward Email into Itzik's Gmail, so this
reads the same mailbox as mail-search.py: EXAMINE plus BODY.PEEK, nothing is marked,
moved or sent. It prints one JSON object per line (uid, from, replyTo, to, subject, body)
for the last --days days. lib/shachar-unsub.js decides which of them is a removal request.
"""
import argparse
import email
import importlib.util
import imaplib
import json
import os
import sys
from datetime import date, timedelta

here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('mail_search', os.path.join(here, 'mail-search.py'))
ms = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ms)

QUERY = '(to:shachar@abaitzik.com OR deliveredto:shachar@abaitzik.com OR (subject:(re OR "השב") שחר))'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--days', type=int, default=3)
    ap.add_argument('--limit', type=int, default=60)
    a = ap.parse_args()
    user, pw = ms.creds()
    m = imaplib.IMAP4_SSL('imap.gmail.com')
    m.login(user, pw)
    m.select(ms.BOX, readonly=True)
    q = QUERY + ' after:' + (date.today() - timedelta(days=a.days)).strftime('%Y/%m/%d')
    m.literal = q.encode('utf8')
    _, data = m.uid('SEARCH', 'CHARSET', 'UTF-8', 'X-GM-RAW')
    for uid in data[0].split()[-a.limit:]:
        _, d = m.uid('FETCH', uid, '(BODY.PEEK[])')
        raw = next((t[1] for t in d if isinstance(t, tuple)), b'')
        msg = email.message_from_bytes(raw)
        h = lambda k: ms.dec(msg.get(k))
        print(json.dumps({
            'uid': uid.decode(), 'from': h('From'), 'replyTo': h('Reply-To'),
            'to': ' '.join(h(k) for k in ('To', 'Cc', 'Delivered-To', 'X-Forwarded-To', 'X-Original-To')),
            'subject': h('Subject'), 'body': ms.body(msg).strip()[:3000],
        }, ensure_ascii=False))
    m.logout()


if __name__ == '__main__':
    main()
