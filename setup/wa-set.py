# Sets one field of data/wa.json from stdin, so a secret never appears in a command line or a log.
import json, sys
p = "/home/monitor/abaitzik-monitor/data/wa.json"
d = json.load(open(p))
d[sys.argv[1]] = sys.stdin.read().replace(chr(0xfeff), "").strip()
json.dump(d, open(p, "w"), indent=1)
print("saved", sys.argv[1], len(d[sys.argv[1]]))
