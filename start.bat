@echo off
echo ============================================
echo   FinSight AI - Local Dev Launcher
echo ============================================
echo.
echo [1/2] Starting FastAPI backend on port 8000...
start "FinSight Backend" cmd /k "cd /d %~dp0backend && .\venv\Scripts\python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload"

timeout /t 3 /nobreak >nul

echo [2/2] Starting static frontend on port 3000...
start "FinSight Frontend" cmd /k "cd /d %~dp0 && python local-server.py"

timeout /t 2 /nobreak >nul

echo.
echo ============================================
echo   Both servers are starting up!
echo   Frontend: http://127.0.0.1:3000
echo   Backend:  http://127.0.0.1:8000
echo   API Docs: http://127.0.0.1:8000/docs
echo ============================================
echo.
echo IMPORTANT: Add your API key to backend\.env before uploading real documents.
echo   - OpenAI: Uncomment OPENAI_API_KEY=sk-proj-...
echo   - Gemini:  Uncomment GEMINI_API_KEY=AIza...
echo.
pause
