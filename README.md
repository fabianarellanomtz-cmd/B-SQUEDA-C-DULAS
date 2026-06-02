# 🦉 BúhoCédula Pro
### Buscador Masivo y Limpiador de Cédulas Profesionales (API Oficial SEP)

**BúhoCédula Pro** es una aplicación web local de alto rendimiento diseñada para la búsqueda masiva, validación y homologación de cédulas profesionales en México, consumiendo directamente la **API oficial de la Secretaría de Educación Pública (SEP)**. 

Está especialmente optimizada para profesionistas del **Área de la Salud y Medicina**, incorporando filtros avanzados de especialidades, lógica de detección de ambigüedades (homonimia o inconsistencias cronológicas), y un motor local de tolerancia a fallas de captura.

---

## ✨ Características Principales

*   **⚡ Conexión Directa con la SEP:** Realiza consultas masivas de forma directa, rápida e ilimitada consumiendo la API gubernamental oficial en tiempo real.
*   **⚖️ Interruptor de Estructura Inteligente (Estructurado vs No Estructurado):**
    *   **Modo Estructurado (3 Columnas):** Mapea columnas individuales de `Nombre/(s)`, `Apellido Paterno` y `Apellido Materno`.
    *   **Modo No Estructurado (1 Columna Unificada):** Extrae automáticamente el nombre completo e implementa el algoritmo `split_full_name` para separar nombres dobles (e.g., *Juan Carlos*) y partículas complejas de apellidos en español (e.g., *de la O*, *del Real*, *de los Angeles*) a nivel de campo.
*   **🛡️ Motor de Autocorrección Tipográfica Offline y Gratuito:**
    *   Si una búsqueda original no arroja resultados, el motor local aplica reglas fonéticas y de reemplazo tipográfico comunes en México (e.g., *Martine* ➡️ *Martinez*, *Velazco* ➡️ *Velasco*, *Gitierrez* ➡️ *Gutierrez*, *Fransisco* ➡️ *Francisco*, *Jacier* ➡️ *Javier*).
    *   Realiza reintentos automáticos de forma local y 100% gratuita (sin cargos de APIs de Inteligencia Artificial externas).
*   **🎯 Homologación Estructurada desde la Fuente:**
    *   El reporte de salida en Excel extrae los campos oficiales exactos registrados en la SEP: `Nombre Cédula Oficial`, `Apellido 1 Cédula Oficial` y `Apellido 2 Cédula Oficial`.
*   **📂 Descarga Segura In-Memory (io.BytesIO):**
    *   Genera y transmite el archivo Excel directamente desde la memoria RAM del servidor, evitando escrituras en disco que provoquen caídas o reinicios del servidor local.
*   **🎨 Interfaz Web Premium (Glassmorphism Dark Mode):**
    *   Diseño moderno, limpio y reactivo con micro-animaciones, gráficos en tiempo real, terminal de búsqueda activa y un sistema de reconexión automática de hasta 3 intentos ante micro-cortes de red.

---

## 🛠️ Stack Tecnológico

*   **Backend:** Python 3.12, Flask (Servidor ligero y modular)
*   **Procesamiento de Datos:** Pandas, OpenPyXL (Gestión de libros Excel de alto volumen)
*   **Consultas e Integración:** Requests, BeautifulSoup4
*   **Frontend:** HTML5, CSS3 (Efectos Glassmorphism y variables CSS fluidas), JavaScript Vanilla (SSE - Server Sent Events para actualizaciones en vivo)

---

## 🚀 Instalación y Uso Local (Windows)

### Requisitos Previos
*   Tener instalado **Python 3.10 o superior**.

### Pasos para Ejecutar
1.  **Clona o descarga este repositorio** en tu computadora:
    ```bash
    git clone https://github.com/tu-usuario/buho-cedula-pro.git
    cd buho-cedula-pro
    ```
2.  **Ejecución Rápida en Windows:**
    *   Haz doble clic en el archivo **`run.bat`** en la carpeta raíz.
    *   El script se encargará automáticamente de activar el entorno virtual (`.venv`), validar e instalar las dependencias necesarias (`flask`, `requests`, `pandas`, `openpyxl`), iniciar el backend y abrir la aplicación en tu navegador web.
3.  **Acceso Web:**
    *   La aplicación estará disponible inmediatamente en: **`http://127.0.0.1:5050`**

---

## 📝 Licencia

Este proyecto está bajo la licencia MIT. Es de uso libre, gratuito y de código abierto para desarrolladores y profesionales en México.
