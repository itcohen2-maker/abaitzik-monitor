#!/usr/bin/env python3
"""Moves WeTransfer notices and read Pegasus update mails out of Itzik's Gmail, by his request (8.10.2026).

"Every WeTransfer mail, throw it away, every time one comes, after I see it,
they fill the mail." So: only mail from wetransfer.com, only once it is read
(\\Seen), and it goes to the Gmail trash, where it can still be restored for 30
days. Nothing else in the mailbox is touched. mail-search.py stays read only.

  python3 tools/mail-trash-wetransfer.py          read ones only (the cron, every 10 minutes)
  python3 tools/mail-trash-wetransfer.py --all    also unread ones (the first cleanup)
"""
import imaplib
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from importlib import import_module
creds = import_module('mail-search').creds

# 14.10 Itzik: the Pegasus live-update mails (sent by the PC to himself) go the same
# way: the moment he has opened one, it goes to the trash.
QUERY = '(from:wetransfer.com OR (from:itcohen2@gmail.com to:itcohen2@gmail.com subject:פגסוס))'


# 15.10 Itzik: "אני ממשיך לקבל מיילים של הום סטייל ... לא נקבל מיילים יותר". ICL keep
# him on their list and Yael answers all, so her replies got past the ilcargo
# filter. Shipment mail goes to the trash at once, read or not. Rinat his sister
# (rinata@) and Roni are not in it.
NOW = ('(from:ilcargo.com OR from:yaele@extraretail.co.il OR from:rinatb@extraretail.co.il'
       ' OR from:yael@homestyle.co.il OR subject:"תיק עמילות" OR subject:"הודעת חוסר בניירת")')


def main():
    take_all = '--all' in sys.argv
    user, pw = creds()
    m = imaplib.IMAP4_SSL('imap.gmail.com')
    m.login(user, pw)
    m.select('"[Gmail]/All Mail"')
    m.literal = (QUERY + ('' if take_all else ' is:read') + ' -in:trash').encode('utf8')
    _, data = m.uid('SEARCH', 'CHARSET', 'UTF-8', 'X-GM-RAW')
    uids = data[0].split()
    if uids:
        m.uid('STORE', b','.join(uids).decode(), '+X-GM-LABELS', '(\\Trash)')
    m.literal = (NOW + ' -in:trash').encode('utf8')
    _, data = m.uid('SEARCH', 'CHARSET', 'UTF-8', 'X-GM-RAW')
    ship = data[0].split()
    if ship:
        m.uid('STORE', b','.join(ship).decode(), '+X-GM-LABELS', '(\Trash)')
    print(f'moved to trash: {len(uids)}, shipments: {len(ship)}')
    m.logout()


if __name__ == '__main__':
    main()
