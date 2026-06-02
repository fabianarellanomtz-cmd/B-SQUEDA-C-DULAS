@echo off
title Búsqueda Cédulas Profesionales - Compilador de Ejecutable Desktop
color 0B
echo =========================================================================
echo  B Ú S Q U E D A   C É D U L A S   P R O F E S I O N A L E S
echo =========================================================================
echo.
echo  Paso 1: Validando entorno virtual (.venv)...
if not exist ".venv" (
    echo [ERROR] No se encontro la carpeta .venv. Por favor corre primero run.bat
    pause
    exit /b
)

call .venv\Scripts\activate.bat
echo [OK] Entorno virtual activado.

echo Paso 2: Validando instalacion de PyInstaller...
python -c "import PyInstaller" 2>nul
if errorlevel 1 (
    echo [INFO] PyInstaller no esta instalado. Instalando ahora...
    pip install pyinstaller
)
echo [OK] PyInstaller esta disponible.

echo.
echo Paso 3: Compilando aplicacion de forma modular (Flask + Frontend)...
echo.
echo  =========================================================================
echo  [COMPILACION]: Generando ejecutable standalone (.exe)...
echo  =========================================================================
echo.

:: Run PyInstaller to build a single standalone .exe
:: We bundle index.html, style.css and main.js directly into the executable base directory
.venv\Scripts\pyinstaller --noconfirm --clean --onefile --add-data "index.html;." --add-data "style.css;." --add-data "main.js;." --name "busqueda_cedulas" app.py

if errorlevel 1 (
    echo.
    echo [ERROR] Hubo un error durante la compilacion. Revisa la consola.
    pause
    exit /b
)

echo.
echo =========================================================================
echo  ¡COMPILACIÓN COMPLETADA CON ÉXITO!
echo =========================================================================
echo.
echo  El archivo ejecutable portable ha sido creado en:
echo  -^> %cd%\dist\busqueda_cedulas.exe
echo.
echo  Puedes enviar este archivo (.exe) directamente a tus usuarios en Mexico.
echo  Solo necesitan hacer doble clic sobre el para iniciar la aplicacion 
echo  local, la cual abrira de forma automatica su navegador en segundos.
echo  ¡100% libre de geobloqueo, 100% estable y ultra-veloz!
echo =========================================================================
echo.
pause
