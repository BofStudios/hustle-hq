@echo off
title Hustle HQ
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 24+ gerekli / required: https://nodejs.org & pause & exit /b 1)
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODEMAJOR=%%v
if %NODEMAJOR% LSS 24 echo Node.js %NODEMAJOR% bulundu; Node.js 24+ onerilir / Node.js 24+ recommended: https://nodejs.org
if not exist node_modules (echo Ilk kurulum / First install... & call npm install --no-audit --no-fund)
start "" http://localhost:3777
node server/index.js
pause
