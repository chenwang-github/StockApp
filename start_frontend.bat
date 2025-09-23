@echo off
echo Starting local web server for Stock Dashboard...
echo.
echo Opening http://localhost:8000
echo Press Ctrl+C to stop the server
echo.

cd "d:\Personal Project\StockApp"
C:/Python313/python.exe -m http.server 8000