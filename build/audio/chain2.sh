#!/bin/bash
# Clearer tones for every settled clip, then (after repair.py) the repaired ones, then pack.
cd "$(dirname "$0")"
python3 clarify_all.py --workers 2 2>/dev/null >> clarify.log
while pgrep -f "python3 repair\.py" >/dev/null || pgrep -f "python3 pack\.py" >/dev/null; do sleep 20; done
python3 clarify_all.py --workers 4 2>/dev/null >> clarify.log
python3 pack.py > pack.log 2>&1
echo CHAIN2-DONE
