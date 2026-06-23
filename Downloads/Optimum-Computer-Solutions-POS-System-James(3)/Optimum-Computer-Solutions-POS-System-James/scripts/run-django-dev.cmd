@echo off
cd /d "%~dp0..\backend\backend"
"venv\Scripts\python.exe" manage.py runserver 127.0.0.1:8000 --noreload > "%~dp0..\django-runserver.log" 2>&1
