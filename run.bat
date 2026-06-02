@echo off
title BuhoCedula Pro - Servidor Activo
color 0B
echo =========================================================================
echo  B U H O C E D U L A   P R O   -   B u s c a d o r   d e   C e d u l a s
echo =========================================================================
echo.
echo  Iniciando entorno virtual de Python...

if not exist ".venv" (
    echo [INFO] No se encontro el entorno virtual .venv. Creandolo de forma automatica...
    python -m venv .venv
    if errorlevel 1 (
        echo [ERROR] No se pudo crear el entorno virtual. Asegurate de tener Python instalado y en tu PATH.
        pause
        exit /b
    )
    echo [OK] Entorno virtual creado exitosamente.
)

call .venv\Scripts\activate.bat

echo [OK] Entorno virtual activado.
echo Instalando/Verificando dependencias necesarias...
python -m pip install --quiet flask requests beautifulsoup4 pandas openpyxl lxml

echo [OK] Dependencias validadas.
echo.
echo =========================================================================
echo  1. Iniciando servidor backend Flask local...
echo  2. Abriendo tu navegador web predeterminado en http://127.0.0.1:5050 ...
echo =========================================================================
echo.
echo  Manten esta ventana abierta mientras uses la herramienta.
echo  Para cerrar el servidor, presiona CTRL+C en esta ventana.
echo.

:: Open browser automatically after a short delay
start "" "http://127.0.0.1:5050"

:: Start the flask application
python app.py

pause
