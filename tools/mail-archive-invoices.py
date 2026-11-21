"""Takes invoice and receipt mails out of the inbox once they carry the label "חשבוניות 2026" (20.11.2026).

Itzik, 20.11: "כן תבצע", with the rule "אתה חייב תמיד לפני שאתה מעביר לתווית לעדכן אותי במוניטור ובוואטסאפ".
The label is given by the PC job after the PDF is saved in Drive, so a labelled mail already has its copy.
Only \\Inbox is removed: nothing is deleted, the mail stays under its label and in search.
The caller tells Itzik first (mail-check.js: the WhatsApp and chat line); this script never runs on its own.

  python3 -I tools/mail-archive-invoices.py --dry   count only
  python3 -I tools/mail-archive-invoices.py         archive
"""
import imaplib
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from importlib import import_module
creds = import_module('mail-search').creds

QUERY = 'in:inbox label:חשבוניות-2026'


def main():
    dry = '--dry' in sys.argv
    user, pw = creds()
    m = imaplib.IMAP4_SSL('imap.gmail.com')
    m.login(user, pw)
    m.select('"[Gmail]/All Mail"')
    m.literal = QUERY.encode('utf8')
    _, data = m.uid('SEARCH', 'CHARSET', 'UTF-8', 'X-GM-RAW')
    uids = data[0].split()
    if uids and not dry:
        m.uid('STORE', b','.join(uids).decode(), '-X-GM-LABELS', '(\\Inbox)')
    print(('would archive' if dry else 'archived') + ': %d' % len(uids))
    m.logout()


if __name__ == '__main__':
    main()
