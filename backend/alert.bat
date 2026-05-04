@echo off
REM ============================================================================
REM EKHOBOT ALERT SETTER (Windows)
REM ============================================================================
REM Quick Windows batch script to set campus alerts
REM 
REM Usage:
REM   alert.bat "Your message here"
REM   alert.bat clear
REM ============================================================================

if "%~1"=="" (
    echo Usage: alert.bat "Your alert message"
    echo        alert.bat clear
    echo.
    echo Examples:
    echo   alert.bat "Campus power outage"
    echo   alert.bat "Weather alert: Campus closed"
    echo   alert.bat clear
    exit /b 1
)

node setAlert.js %*
