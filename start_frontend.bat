@echo off
echo Starting local web server for Stock Dashboard...
echo.
echo Server will start at http://localhost:8000/index.html
echo Press Ctrl+C to stop the server
echo.

cd /d "d:\Personal Project\StockApp"
python -m SimpleHTTPServer 8000