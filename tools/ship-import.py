"""Import the Home Style shipments Excel into the shared shipments table.

6.10.2026. Run as the hs user, with the venv python in isolated mode:
    /opt/ship-venv/bin/python -I tools/ship-import.py <file.xlsx> [--dir /srv/homestyle/shipments]

The table is rows.json, one object per order line, newest knowledge wins. A
second run does not duplicate anything: a row is matched by its id (order
number, sheet, and a short hash of the product text), and every change to a
tracked field is written into that row's history with the source "excel".
The shipments table is read by Rinat's monitor (writes) and Roni's (read only).
"""
import datetime as dt
import hashlib
import json
import os
import re
import sys

import openpyxl

TRACKED = ["status", "etd", "eta", "retd", "customs", "container", "notes"]


def iso(v):
    if isinstance(v, dt.datetime):
        return v.date().isoformat()
    if isinstance(v, dt.date):
        return v.isoformat()
    s = str(v or "").strip()
    m = re.match(r"^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$", s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        y += 2000 if y < 100 else 0
        try:
            return dt.date(y, mo, d).isoformat()
        except ValueError:
            return ""
    return ""


def text(v):
    s = "" if v is None else str(v).strip()
    s = re.sub(r"\s+", " ", s)
    return re.sub(r"\.0$", "", s) if re.fullmatch(r"\d+\.0", s) else s


def number(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def read_sheet(ws):
    rows = [r for r in ws.iter_rows(values_only=True)]
    hi = next((i for i, r in enumerate(rows) if any(str(c or "").strip() == "PO#" for c in r)), None)
    if hi is None:
        return []
    head = [str(c or "").strip() for c in rows[hi]]

    def col(*names):
        for n in names:
            if n in head:
                return head.index(n)
        return None

    ix = {
        "po": col("PO#"), "sap": col("SAP", "SAP-DOCNUM"), "project": col("Project"),
        "supplier": col("SUPPLIER"), "product": col("מוצר"), "item": col("ITEM"), "fcl": col("FCL"),
        "retd": col("R.ETD"), "etd": col("ETD"), "eta": col("ETA", "תאריך הגעה צפוי"),
        "customs": col("תיק עמילות"), "container": col("CONTAINER"), "status": col("סטטוס"),
        "samples": col("סטטוס דוגמאות מהספק"), "pay": col("סטטוס תשלום"), "amount": col("סכום הזמנה"),
    }
    notes_cols = [i for i, h in enumerate(head) if h in ("הערות", "הערות כלליות")]
    out = []
    seen = {}
    for r in rows[hi + 1:]:
        def g(k):
            i = ix.get(k)
            return r[i] if i is not None and i < len(r) else None

        po = text(g("po"))
        supplier = text(g("supplier"))
        if not po or not supplier:
            continue
        product = text(g("product"))
        h = hashlib.sha1(product.encode("utf-8")).hexdigest()[:6]
        base = "%s|%s|%s" % (po, ws.title[-4:], h)
        seen[base] = seen.get(base, 0) + 1
        rid = base if seen[base] == 1 else "%s|%d" % (base, seen[base])
        notes = " | ".join(x for x in (text(r[i]) for i in notes_cols if i < len(r)) if x)
        out.append({
            "id": rid, "po": po, "sap": text(g("sap")), "project": text(g("project")),
            "supplier": supplier, "product": product, "item": text(g("item")), "fcl": text(g("fcl")),
            "retd": iso(g("retd")), "etd": iso(g("etd")), "eta": iso(g("eta")),
            "customs": text(g("customs")), "container": text(g("container")),
            "status": text(g("status")), "notes": notes, "samples": text(g("samples")),
            "payStatus": text(g("pay")), "amount": number(g("amount")), "sheet": ws.title,
        })
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    d = "/srv/homestyle/shipments"
    if "--dir" in sys.argv:
        d = sys.argv[sys.argv.index("--dir") + 1]
        args = [a for a in args if a != d]
    if not args:
        sys.exit("usage: ship-import.py <file.xlsx> [--dir DIR]")
    wb = openpyxl.load_workbook(args[0], data_only=True)
    fresh = []
    for ws in wb:
        fresh += read_sheet(ws)

    path = os.path.join(d, "rows.json")
    old = {}
    if os.path.exists(path):
        for r in json.load(open(path, encoding="utf-8")):
            old[r["id"]] = r
    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    changed = added = 0
    merged = []
    for r in fresh:
        o = old.pop(r["id"], None)
        if o is None:
            r["history"] = [{"at": now, "field": "row", "from": "", "to": "נקלט מהאקסל", "src": "excel"}]
            added += 1
            merged.append(r)
            continue
        hist = o.get("history", [])
        for f in TRACKED:
            if (o.get(f) or "") != (r.get(f) or ""):
                hist.append({"at": now, "field": f, "from": o.get(f) or "", "to": r.get(f) or "", "src": "excel"})
                changed += 1
        r["history"] = hist
        merged.append(r)
    merged += list(old.values())  # rows that vanished from the file are kept

    os.makedirs(d, exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False)
    os.chmod(tmp, 0o640)
    os.replace(tmp, path)
    meta = {"importedAt": now, "source": os.path.basename(args[0]), "rows": len(merged)}
    with open(os.path.join(d, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False)
    os.chmod(os.path.join(d, "meta.json"), 0o640)
    print("rows %d, added %d, field changes %d" % (len(merged), added, changed))


if __name__ == "__main__":
    main()
