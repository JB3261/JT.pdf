@echo off
title JT.pdf - Local PDF Studio
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo Node.js is required to run JT.pdf.
  echo Please install Node.js LTS from https://nodejs.org/ and run this script again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies for the first time...
  call npm install
  if %errorlevel% neq 0 (
    echo Failed to install dependencies.
    pause
    exit /b 1
  )
)

echo Starting JT.pdf in your browser...
echo Keep this window open while using JT.pdf. Press Ctrl+C to stop.
call npm run dev -- --open
