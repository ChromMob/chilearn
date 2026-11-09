#!/bin/bash
# Wait for a running gen.py, then: finish generation (resumes), repair failures, pack.
cd "$(dirname "$0")"
while pgrep -f "python3 gen\.py" >/dev/null; do sleep 20; done
python3 gen.py --workers 4 2>/dev/null >> gen.log
python3 repair.py --workers 4 2>/dev/null >> repair.log
python3 pack.py > pack.log 2>&1
echo CHAIN-DONE
