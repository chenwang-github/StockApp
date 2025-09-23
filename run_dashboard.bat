@echo off
echo Installing required packages...
pip install -r requirements.txt

echo Starting Stock Dashboard...
streamlit run stock_dashboard.py
pause