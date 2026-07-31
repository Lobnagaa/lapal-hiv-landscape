#!/bin/bash
# Double-click this file to open the dashboard on this Mac.
#
# Why this exists: the dashboard loads its data file at runtime, and browsers
# refuse to do that when a page is opened straight from disk. So it has to be
# served over http, even locally. This starts a tiny local web server using the
# Python that is already on macOS. Nothing is installed and nothing is uploaded.
#
# Leave the Terminal window open while you are using the dashboard.
# Close the window, or press Ctrl+C, to stop it.

cd "$(dirname "$0")/dist" 2>/dev/null || {
  echo
  echo "Could not find the 'dist' folder next to this file."
  echo "Build it first, in Terminal:"
  echo "    cd \"$(dirname "$0")\" && npm run build"
  echo
  read -r -p "Press Return to close."
  exit 1
}

# Use 8000 unless something is already there, then try the next few.
PORT=8000
while lsof -ti:"$PORT" >/dev/null 2>&1 && [ "$PORT" -lt 8020 ]; do
  PORT=$((PORT + 1))
done

echo
echo "  LAPaL long-acting HIV therapeutics"
echo "  ----------------------------------"
echo "  Opening at http://localhost:$PORT"
echo
echo "  Keep this window open while you use the dashboard."
echo "  Close it, or press Ctrl+C, when you are done."
echo

# Give the server a moment to bind before pointing the browser at it.
( sleep 1; open "http://localhost:$PORT" ) &

python3 -m http.server "$PORT" --bind 127.0.0.1
