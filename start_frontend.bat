@echo off
echo Starting Stock Dashboard Frontend...
echo.
echo Server will start at http://localhost:8000/frontend/
echo Press Ctrl+C to stop the server
echo.
cd /d "d:\Personal Project\StockApp"
C:/Users/chenw/AppData/Local/Microsoft/WindowsApps/python3.12.exe -m http.server 8000
