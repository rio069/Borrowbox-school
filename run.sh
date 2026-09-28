#!/usr/bin/env bash
# BorrowBox Server Launcher
PORT="${PORT:-8080}"
echo "Launching BorrowBox Server on http://127.0.0.1:${PORT} ..."
/Library/Frameworks/Python.framework/Versions/3.14/bin/python3 app.py
