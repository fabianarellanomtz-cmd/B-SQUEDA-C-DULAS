import sys
import os
import io
import re
import time
import random
import json
import urllib.parse
from flask import Flask, render_template, request, jsonify, Response, send_file, session
import pandas as pd
from bs4 import BeautifulSoup
import requests
import webbrowser
from threading import Timer

# Resolve bundle base directory for PyInstaller standalone executables
if getattr(sys, 'frozen', False):
    base_dir = sys._MEIPASS
else:
    base_dir = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__, static_folder=base_dir, static_url_path="", template_folder=base_dir)
app.secret_key = "busqueda_cedulas_secret_key_2026"

# Global session/memory storage for active job data
ACTIVE_JOBS = {}

# Career Categorization Keywords
CAREER_CATEGORIES = {
    "MEDICINA Y SALUD": [
        "MEDIC", "CIRU", "DERMA", "GINECO", "ESTETI", "PLASTI", "PEDIAT", 
        "CARDI", "ANEST", "OFTAL", "NEURO", "URÓ", "OCULO", "ONCO", "TRAUMA",
        "ODONTO", "DENTI", "NUTRI", "FISIO", "TERAP", "ENFERM", "SALUD", "REHAB",
        "PSICOL", "PSIQUI", "PATOL", "ALERG", "ENDOCR", "GASTRO", "HEMAT", 
        "INFECT", "NEFRO", "NEUMO", "REUMA", "GERIAT", "PARTERA", "OPTOM", "SALUD"
    ],
    "INGENIERÍA Y TECNOLOGÍA": [
        "INGENIER", "SISTEMA", "COMPUTAC", "INFORMAT", "TECNOLOG", "TELECOMUN", 
        "SOFTWARE", "PROGRAMA", "DATOS", "INDUSTRIAL", "MECATRONIC", "ROBOTIC", 
        "ELECTR", "MECANIC", "QUIMIC", "CIVIL", "SOPORTE", "REDES", "COMUNICACION",
        "BIOESTAD", "BIOTEC", "METALUR", "MINAS", "AERONAUT"
    ],
    "ARQUITECTURA Y DISEÑO": [
        "ARQUITEC", "DISEÑO", "GRAFIC", "INTERIOR", "PAISAJ", "URBANIS", "EDIFICAC",
        "CONSTRUC", "ARTES", "DIBUJO"
    ],
    "DERECHO Y LEYES": [
        "DERECH", "LEYES", "ABOGAD", "JURID", "LEGAL", "FISCAL", "NOTAR", "CRIMIN", 
        "FORENSE", "PENAL", "CIVILIST"
    ],
    "NEGOCIOS Y FINANZAS": [
        "CONTADOR", "ADMINISTR", "FINANZ", "ECONOM", "NEGOCIO", "MERCADOT", 
        "AUDITOR", "COMERCIO", "EMPRESAR", "ACTUAR", "TURIS", "MERCADEO",
        "VENTAS", "LOGISTIC", "PLANIFIC"
    ],
    "EDUCACIÓN Y HUMANIDADES": [
        "PROFESOR", "DOCENT", "PEDAGOG", "EDUCAC", "CATEDRAT", "ENSEÑAN", 
        "HISTOR", "FILOSOF", "LITERAT", "GEOGRAF", "SOCIOLOG", "TRADUC", 
        "IDIOMA", "LETRAS", "HUMANID", "TEOLOG", "ARTES", "MUSICA", "PEDAGOG"
    ]
}

def classify_career(career_name):
    if not career_name:
        return "OTRA PROFESIÓN"
    career_clean = clean_name_text(career_name)
    for category, keywords in CAREER_CATEGORIES.items():
        for kw in keywords:
            kw_clean = clean_name_text(kw)
            if kw_clean in career_clean:
                return category
    return "OTRA PROFESIÓN"

def clean_name_text(text):
    if pd.isna(text) or not isinstance(text, (str, int, float)):
        return ""
    text = str(text).strip()
    # Replace hyphens, slashes, and underscores with space for word separation
    text = re.sub(r'[-/_]', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    # Translate common accents except Ñ/ñ
    translation = str.maketrans(
        "áéíóúüÁÉÍÓÚÜ",
        "aeiouuAEIOUU"
    )
    text = text.translate(translation)
    # Remove special chars but keep letters, numbers, spaces, and Ñ/ñ
    text = re.sub(r'[^a-zA-Z0-9ñÑ\s]', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip().upper()

def autocorrect_name_parts(nombre, paterno, materno):
    """
    Returns a list of candidate corrected names to query as fallback.
    Generates candidates by applying common Spanish spelling corrections offline and locally.
    """
    n_clean = nombre.strip().upper()
    p_clean = paterno.strip().upper()
    m_clean = materno.strip().upper()
    
    candidates = []
    
    def correct_surname(word):
        if not word:
            return [word]
        
        word_candidates = {word}
        
        # 1. Missing 'Z' at the end of patronymic surnames
        if word.endswith("MARTINE"):
            word_candidates.add("MARTINEZ")
        elif word.endswith("RODRIGUE"):
            word_candidates.add("RODRIGUEZ")
        elif word.endswith("GONZALE"):
            word_candidates.add("GONZALEZ")
        elif word.endswith("HERNANDE"):
            word_candidates.add("HERNANDEZ")
        elif word.endswith("SANCHE"):
            word_candidates.add("SANCHEZ")
        elif word.endswith("PERE"):
            word_candidates.add("PEREZ")
        elif word.endswith("GOME"):
            word_candidates.add("GOMEZ")
        elif word.endswith("DOMINGUE"):
            word_candidates.add("DOMINGUEZ")
        elif word.endswith("JIMENE"):
            word_candidates.add("JIMENEZ")
        elif word.endswith("VAZQUE"):
            word_candidates.add("VAZQUEZ")
        elif word.endswith("VELASQUE"):
            word_candidates.add("VELASQUEZ")
        elif word.endswith("ALVARE"):
            word_candidates.add("ALVAREZ")
        elif word.endswith("RAMIRE"):
            word_candidates.add("RAMIREZ")
        elif word.endswith("GUTIERRE"):
            word_candidates.add("GUTIERREZ")
        elif word.endswith("CHAVE"):
            word_candidates.add("CHAVEZ")
            
        # 2. Swaps between S and Z ending variations
        if word.endswith("EZ"):
            word_candidates.add(word[:-2] + "ES")
        elif word.endswith("ES"):
            word_candidates.add(word[:-2] + "EZ")
            
        # 3. Specific common typos and variants in Mexican names
        if word == "VELAZCO":
            word_candidates.add("VELASCO")
        elif word == "VELASCO":
            word_candidates.add("VELAZCO")
        elif word == "GITIERREZ":
            word_candidates.add("GUTIERREZ")
        elif word == "GUTIERREZ":
            word_candidates.add("GITIERREZ")
        elif word == "JACIER":
            word_candidates.add("JAVIER")
        elif word == "ESPINOSA":
            word_candidates.add("ESPINOZA")
        elif word == "ESPINOZA":
            word_candidates.add("ESPINOSA")
            
        return list(word_candidates)
        
    def correct_first_name(name_str):
        if not name_str:
            return [name_str]
        
        name_candidates = {name_str}
        
        # 4. Fransisco / Francisco swaps
        if "FRANSISCO" in name_str:
            name_candidates.add(name_str.replace("FRANSISCO", "FRANCISCO"))
        if "FRANCISCO" in name_str:
            name_candidates.add(name_str.replace("FRANCISCO", "FRANSISCO"))
            
        return list(name_candidates)
        
    # Cross-product combinations
    n_options = correct_first_name(n_clean)
    p_options = correct_surname(p_clean)
    m_options = correct_surname(m_clean)
    
    # Accumulate all distinct candidate combinations
    for n_opt in n_options:
        for p_opt in p_options:
            for m_opt in m_options:
                if (n_opt != n_clean) or (p_opt != p_clean) or (m_opt != m_clean):
                    candidates.append((n_opt, p_opt, m_opt))
                    
    return candidates

def split_full_name(full_name):
    """
    Splits a full name string into (names, paternal, maternal).
    Handles common Mexican compound surnames and double first names.
    """
    if pd.isna(full_name) or not isinstance(full_name, (str, int, float)):
        return "", "", ""
        
    # Clean up double spaces and split
    full_name_str = re.sub(r'\s+', ' ', str(full_name).strip())
    words = full_name_str.split(' ')
    
    if len(words) == 1:
        return words[0], "", ""
    elif len(words) == 2:
        return words[0], words[1], ""
        
    # Common prefixes for paternal/maternal surnames in Spanish
    prefixes = {"DE", "DEL", "LA", "LAS", "LOS", "Y"}
    
    # Group compound particles with the word that follows them
    grouped_words = []
    i = 0
    while i < len(words):
        word = words[i]
        word_upper = word.upper()
        
        # If this is a prefix and there is a next word, group them
        if word_upper in prefixes and i + 1 < len(words):
            # Check if there is a double prefix (e.g., "de la" or "de los")
            if word_upper == "DE" and words[i+1].upper() == "LA" and i + 2 < len(words):
                grouped_words.append(f"{word} {words[i+1]} {words[i+2]}")
                i += 3
            elif word_upper == "DE" and words[i+1].upper() == "LOS" and i + 2 < len(words):
                grouped_words.append(f"{word} {words[i+1]} {words[i+2]}")
                i += 3
            else:
                grouped_words.append(f"{word} {words[i+1]}")
                i += 2
        else:
            grouped_words.append(word)
            i += 1
            
    # Split based on the length of grouped words
    if len(grouped_words) == 2:
        return grouped_words[0], grouped_words[1], ""
    elif len(grouped_words) == 3:
        return grouped_words[0], grouped_words[1], grouped_words[2]
    else:
        # 4 or more words: last is maternal, second-to-last is paternal, the rest is first name(s)
        maternal = grouped_words[-1]
        paternal = grouped_words[-2]
        names = " ".join(grouped_words[:-2])
        return names, paternal, maternal

def is_medical_career(career_name, keywords=None):
    return classify_career(career_name) == "MEDICINA Y SALUD"

def analyze_ambiguity(sep_rows, searched_name, medical_keywords=None):
    """
    Analyzes all SEP results for a single query to detect true ambiguity.
    Detects name variations, active homonymies, chronological paradoxes, or age anomalies.
    Returns: dict of {cedula: {"ambigua": "Sí/No", "motivo": "..."}}
    """
    analysis = {}
    if not sep_rows:
        return analysis

    # Default all to "No"
    for r in sep_rows:
        analysis[r["cedula"]] = {"ambigua": "No", "motivo": ""}

    # 1. Cleaned Search Name Comparison
    searched_clean = clean_name_text(searched_name)
    for r in sep_rows:
        name_cedula_clean = clean_name_text(r["nombre_completo"])
        if name_cedula_clean != searched_clean:
            analysis[r["cedula"]] = {
                "ambigua": "Sí",
                "motivo": f"Variacion de nombre: '{r['nombre_completo']}' contra original '{searched_name}'"
            }

    # 2. Group by Exact Returned Name to detect Homonymy (different people returned)
    grouped_by_name = {}
    for r in sep_rows:
        name_key = r["nombre_completo"].strip().upper()
        if name_key not in grouped_by_name:
            grouped_by_name[name_key] = []
        grouped_by_name[name_key].append(r)

    if len(grouped_by_name) > 1:
        # Multiple different names returned for a single search -> strong homonymy
        for r in sep_rows:
            analysis[r["cedula"]] = {
                "ambigua": "Sí",
                "motivo": f"Homonimia activa: Multiples personas similares encontradas"
            }
        return analysis

    # 3. Compatible Careers & Chronology checks for the same person
    person_name = list(grouped_by_name.keys())[0]
    records = grouped_by_name[person_name]

    if len(records) <= 1:
        return analysis  # Single record is fine, name variation already covered in Step 1

    # Incompatible Careers Check (Careers across different major categories)
    categories_found = set()
    for r in records:
        cat = classify_career(r["carrera"])
        if cat != "OTRA PROFESIÓN":
            categories_found.add(cat)

    if len(categories_found) > 1:
        # Careers across completely different major categories under the exact same name -> highly likely to be homonymy
        for r in records:
            analysis[r["cedula"]] = {
                "ambigua": "Sí",
                "motivo": f"Categorias incompatibles: Contiene cedulas en distintas areas ({', '.join(sorted(categories_found))})"
            }
        return analysis

    # Chronology Check
    valid_years = []
    for r in records:
        y_str = r["ano"]
        if str(y_str).isdigit():
            valid_years.append((int(y_str), r))
    
    valid_years.sort(key=lambda x: x[0])

    lic_year = None
    spec_year = None
    for year, r in valid_years:
        carrera = r["carrera"].upper()
        if "LICENCIATURA" in carrera or "GENERAL" in carrera or "MEDICO CIRUJANO" in carrera:
            if lic_year is None or year < lic_year:
                lic_year = year
        elif "ESPECIALIDAD" in carrera or "SUBESPECIALIDAD" in carrera or "MAESTRIA" in carrera or "DOCTORADO" in carrera:
            if spec_year is None or year < spec_year:
                spec_year = year

    if lic_year and spec_year:
        if spec_year < lic_year:
            for r in records:
                analysis[r["cedula"]] = {
                    "ambigua": "Sí",
                    "motivo": f"Inconsistencia cronologica: Postgrado ({spec_year}) expedido antes que Licenciatura ({lic_year})"
                }
        elif (spec_year - lic_year) < 2:
            for r in records:
                analysis[r["cedula"]] = {
                    "ambigua": "Sí",
                    "motivo": f"Intervalo de posgrado sospechoso: Postgrado ({spec_year}) en menos de 2 años de egreso de Licenciatura ({lic_year})"
                }

    # Volume anomaly check
    if len(records) >= 5:
        for r in records:
            if analysis[r["cedula"]]["ambigua"] == "No":
                analysis[r["cedula"]] = {
                    "ambigua": "Sí",
                    "motivo": f"Volumen inusual de cedulas ({len(records)}) sugerente de homonimia acumulada"
                }

    return analysis

def parse_raw_cookies(cookie_string):
    cookies = {}
    if not cookie_string:
        return cookies
    # Remove 'Cookie:' prefix if present
    if cookie_string.lower().startswith('cookie:'):
        cookie_string = cookie_string[7:].strip()
    for cookie in cookie_string.split(';'):
        if '=' in cookie:
            k, v = cookie.strip().split('=', 1)
            cookies[k] = v
    return cookies

# Cache for dynamic proxy testing
DYNAMIC_MEXICO_PROXY = {"proxy_url": None, "last_tested": 0}

def fetch_free_mexico_proxies():
    """
    Fetches a list of free HTTP, SOCKS4 and SOCKS5 proxies in Mexico in real-time
    from multiple highly-reliable public sources.
    Returns: list of (ip_port, proto)
    """
    candidates = []
    
    # 1. Proxyscrape v4 (Text-based, returns protocol://ip:port)
    url_ps4 = "https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=protocolipport&format=text&country=mx"
    try:
        resp = requests.get(url_ps4, timeout=5)
        if resp.status_code == 200:
            for line in resp.text.splitlines():
                line = line.strip()
                if line and "://" in line:
                    parts = line.split("://")
                    if len(parts) == 2:
                        proto, ip_port = parts
                        candidates.append((ip_port, proto.lower()))
    except Exception as e:
        print("[PROXY] Error fetching from Proxyscrape v4:", str(e))

    # 2. Geonode API (JSON-based, very rich list)
    url_geonode = "https://proxylist.geonode.com/api/proxy-list?limit=150&page=1&sort_by=lastChecked&sort_type=desc&country=MX"
    try:
        resp = requests.get(url_geonode, timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            for p in data.get("data", []):
                ip = p.get("ip")
                port = p.get("port")
                protocols = p.get("protocols", [])
                if ip and port and protocols:
                    # Choose best protocol
                    proto = "http"
                    if "socks5" in protocols:
                        proto = "socks5"
                    elif "socks4" in protocols:
                        proto = "socks4"
                    elif "https" in protocols:
                        proto = "https"
                    candidates.append((f"{ip}:{port}", proto))
    except Exception as e:
        print("[PROXY] Error fetching from Geonode:", str(e))

    # 3. Proxy-List.download (Text-based)
    for proto in ["http", "socks4", "socks5"]:
        url_pld = f"https://www.proxy-list.download/api/v1/get?country=MX&type={proto}"
        try:
            resp = requests.get(url_pld, timeout=5)
            if resp.status_code == 200:
                for line in resp.text.splitlines():
                    line = line.strip()
                    if line and ":" in line:
                        candidates.append((line, proto))
        except Exception as e:
            print(f"[PROXY] Error fetching from Proxy-List.download {proto}:", str(e))

    # 4. Proxyscrape v2 (Fallback)
    for proto in ["socks4", "socks5", "http"]:
        url_ps2 = f"https://api.proxyscrape.com/v2/?request=displayproxies&protocol={proto}&timeout=5000&country=MX&ssl=all&anonymity=all"
        try:
            resp = requests.get(url_ps2, timeout=5)
            if resp.status_code == 200:
                for line in resp.text.splitlines():
                    line = line.strip()
                    if line and ":" in line:
                        candidates.append((line, proto))
        except Exception as e:
            print(f"[PROXY] Error fetching from Proxyscrape v2 {proto}:", str(e))

    # Deduplicate and keep ordering
    seen = set()
    unique_proxies = []
    for ip_port, proto in candidates:
        if ip_port not in seen:
            seen.add(ip_port)
            unique_proxies.append((ip_port, proto))
            
    return unique_proxies

def get_working_mexico_proxy(force_refresh=False):
    """
    Checks if there is a cached working Mexican proxy (HTTP or SOCKS).
    Otherwise fetches new candidates, tests up to 25 candidates, and returns the first working one.
    """
    global DYNAMIC_MEXICO_PROXY
    
    # Return cached proxy if valid and not force refreshing
    if not force_refresh and DYNAMIC_MEXICO_PROXY["proxy_url"] and (time.time() - DYNAMIC_MEXICO_PROXY["last_tested"] < 900):
        return DYNAMIC_MEXICO_PROXY["proxy_url"]
        
    DYNAMIC_MEXICO_PROXY["proxy_url"] = None
    print("[PROXY] Buscando un proxy gratuito (HTTP/SOCKS) en México...")
    
    candidates = []
    
    # Known working high-quality static proxies to try FIRST (for ultra-fast startup)
    known_working = [
        ("38.123.220.147:999", "http"),
        ("5.102.109.41:999", "http")
    ]
    
    # Add known working ones if not force refreshing or as first choice
    for ip_port, proto in known_working:
        candidates.append((ip_port, proto))
        
    try:
        scraped = fetch_free_mexico_proxies()
        # Filter out duplicates of known_working
        for ip_port, proto in scraped:
            if ip_port not in [kw[0] for kw in known_working]:
                candidates.append((ip_port, proto))
    except Exception as e:
        print("[PROXY] Error fetching scraped candidates:", str(e))
        
    print(f"[PROXY] Se encontraron {len(candidates)} candidatos de México (HTTP/SOCKS) para probar.")
    
    if not candidates:
        return None
        
    # Shuffle only the scraped ones, keeping the known working ones at the very front
    scraped_part = candidates[len(known_working):]
    random.shuffle(scraped_part)
    candidates = candidates[:len(known_working)] + scraped_part
    
    test_url = "https://cedulaprofesional.sep.gob.mx/api/auth/token"
    test_headers = {
        "X-Client-Id": "rnp-angular-app-prod",
        "X-API-Key": "65da8s675f8s75fda675s8d76as87d5as675da",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json"
    }
    
    # Try up to 5 candidates to find a working tunnel
    for ip_port, proto in candidates[:5]:
        proxy_url = f"{proto}://{ip_port}"
        proxies = {
            "http": proxy_url,
            "https": proxy_url
        }
        try:
            print(f"[PROXY] Probando {proxy_url}...")
            # Snappy test (3.5 seconds timeout)
            resp = requests.get(test_url, headers=test_headers, proxies=proxies, timeout=3.5)
            # 200, 401, 403, 400 all mean we connected to the SEP backend successfully!
            if resp.status_code in [200, 400, 401, 403]:
                print(f"[PROXY] ¡Conexión exitosa a través de {proxy_url}! Guardando en caché.")
                DYNAMIC_MEXICO_PROXY["proxy_url"] = proxy_url
                DYNAMIC_MEXICO_PROXY["last_tested"] = time.time()
                return proxy_url
        except Exception:
            pass
            
    print("[PROXY] No se encontraron proxies activos en México.")
    return None

def get_proxies(force_refresh=False):
    """
    Returns proxy configuration.
    1. Prioritizes MEXICO_PROXY_URL environment variable.
    2. If running on Render/cloud, automatically queries for an active working Mexico proxy.
    """
    proxy_url = os.environ.get("MEXICO_PROXY_URL")
    if proxy_url:
        return {
            "http": proxy_url,
            "https": proxy_url
        }
        
    # Auto-detection for Render/cloud deployments
    if os.environ.get("RENDER") or os.environ.get("PORT"):
        working_proxy = get_working_mexico_proxy(force_refresh=force_refresh)
        if working_proxy:
            return {
                "http": working_proxy,
                "https": working_proxy
            }
            
    return None

import threading

def prefetch_mexico_proxy_async():
    """
    Launches a background thread to find and cache a working Mexico proxy.
    Pre-populates DYNAMIC_MEXICO_PROXY so requests can use it instantly.
    """
    if os.environ.get("MEXICO_PROXY_URL"):
        return  # No need, using manual proxy

    # Check if we are running in Render
    if os.environ.get("RENDER") or os.environ.get("PORT"):
        def worker():
            try:
                get_working_mexico_proxy(force_refresh=True)
            except Exception as e:
                print("Background proxy harvester error:", str(e))
                
        thread = threading.Thread(target=worker)
        thread.daemon = True
        thread.start()

AUTHORIZED_CODES = ["VIP-BUHO-2026", "FABIAN-CORP-FREE", "PRO-ACCESS"]

SEP_TOKEN_CACHE = {"token": None, "expires_at": 0}

def get_sep_token():
    # Check if cached token is still valid
    if SEP_TOKEN_CACHE["token"] and time.time() < SEP_TOKEN_CACHE["expires_at"]:
        return SEP_TOKEN_CACHE["token"]

    url = "https://cedulaprofesional.sep.gob.mx/api/auth/token"
    headers = {
        "X-Client-Id": "rnp-angular-app-prod",
        "X-API-Key": "65da8s675f8s75fda675s8d76as87d5as675da",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json"
    }
    
    # Try with current proxy configuration (fast 6 seconds timeout)
    try:
        resp = requests.get(url, headers=headers, proxies=get_proxies(), timeout=6)
        if resp.status_code == 200:
            data = resp.json()
            token = data.get("access_token")
            SEP_TOKEN_CACHE["token"] = token
            SEP_TOKEN_CACHE["expires_at"] = time.time() + 3000
            return token
    except Exception as e:
        print("First attempt to obtain token failed:", str(e))
        # Always clear dynamic proxy cache and force a refresh/retry to find a working one
        global DYNAMIC_MEXICO_PROXY
        print("[PROXY] Limpiando caché e intentando de nuevo con force_refresh=True...")
        DYNAMIC_MEXICO_PROXY["proxy_url"] = None
        try:
            resp = requests.get(url, headers=headers, proxies=get_proxies(force_refresh=True), timeout=6)
            if resp.status_code == 200:
                data = resp.json()
                token = data.get("access_token")
                SEP_TOKEN_CACHE["token"] = token
                SEP_TOKEN_CACHE["expires_at"] = time.time() + 3000
                return token
            else:
                print("[PROXY] Reintento de obtención de token falló con código:", resp.status_code)
        except Exception as e2:
            print("Retry obtaining token failed:", str(e2))
                
    return None

def query_sep_api(nombre, paterno, materno):
    # Try up to 2 attempts using the current cached proxy
    # If both attempts fail, we will clear the proxy cache and perform one final attempt with a fresh proxy
    
    url = "https://cedulaprofesional.sep.gob.mx/api/solr/profesionista/consultar/byDetalle"
    
    payload = {}
    if nombre:
        payload["nombre"] = nombre.strip().upper()
    if paterno:
        payload["primerApellido"] = paterno.strip().upper()
    if materno:
        payload["segundoApellido"] = materno.strip().upper()

    # Attempt loop
    for attempt in range(1, 3):
        token = get_sep_token()
        if not token:
            print(f"[SEP] No se pudo obtener token de la SEP en intento {attempt}.")
            time.sleep(1.0)
            continue
            
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json"
        }
        
        try:
            # Slower, natural query pacing to respect the SEP endpoint (anti-bot friendly)
            time.sleep(random.uniform(0.8, 1.6))
            resp = requests.post(url, headers=headers, json=payload, proxies=get_proxies(), timeout=6)
            
            if resp.status_code in [401, 403]:
                # Token expired, clear token cache and retry immediately
                print("[SEP] Token expirado en intento. Renovando token...")
                SEP_TOKEN_CACHE["token"] = None
                token = get_sep_token()
                if token:
                    headers["Authorization"] = f"Bearer {token}"
                    resp = requests.post(url, headers=headers, json=payload, proxies=get_proxies(), timeout=6)
            
            if resp.status_code == 200:
                raw_results = resp.json()
                results = []
                for r in raw_results:
                    n = r.get("nombre") or ""
                    p = r.get("primerApellido") or ""
                    m = r.get("segundoApellido") or ""
                    nombre_completo = f"{n} {p} {m}".strip()
                    nombre_completo = re.sub(r'\s+', ' ', nombre_completo).upper()
                    
                    carrera = r.get("profesion") or r.get("carrera") or "DATO NO ENCONTRADO"
                    carrera = str(carrera).upper()
                    
                    results.append({
                        "cedula": r.get("cedula") or "",
                        "tipo": r.get("tipo") or "C1",
                        "nombre_completo": nombre_completo,
                        "nombre_sep": n.strip().upper(),
                        "paterno_sep": p.strip().upper(),
                        "materno_sep": m.strip().upper(),
                        "carrera": carrera,
                        "universidad": (r.get("institucion") or "DATO NO ENCONTRADO").upper(),
                        "estado": (r.get("entidadInstitucion") or "DATO NO ENCONTRADO").upper(),
                        "ano": r.get("anioRegistro") or "DATO NO ENCONTRADO"
                    })
                return {"status": "success", "results": results, "cookies": {}}
                
            else:
                print(f"[SEP] Intento {attempt} falló con código de estado: {resp.status_code}")
                time.sleep(1.0)
        except Exception as e:
            print(f"[SEP] Intento {attempt} falló debido a excepción: {type(e).__name__} - {str(e)}")
            time.sleep(1.0)
            
    # If we are here, 2 attempts failed with the current proxy!
    # Assume the proxy is dead. Clear cache and try one final time with a fresh force-refreshed proxy.
    print("[SEP] Ambos intentos fallaron. Asumiendo proxy inactivo. Limpiando caché de proxy...")
    global DYNAMIC_MEXICO_PROXY
    DYNAMIC_MEXICO_PROXY["proxy_url"] = None
    
    # Trigger background harvester asynchronously to find more candidates for next runs
    prefetch_mexico_proxy_async()
    
    # Try one last final attempt with a freshly scraped working proxy (fast 6s timeout)
    try:
        SEP_TOKEN_CACHE["token"] = None  # Force clean token cache too
        token = get_sep_token()
        if token:
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "application/json"
            }
            resp = requests.post(url, headers=headers, json=payload, proxies=get_proxies(force_refresh=True), timeout=6)
            if resp.status_code == 200:
                raw_results = resp.json()
                results = []
                for r in raw_results:
                    n = r.get("nombre") or ""
                    p = r.get("primerApellido") or ""
                    m = r.get("segundoApellido") or ""
                    nombre_completo = f"{n} {p} {m}".strip()
                    nombre_completo = re.sub(r'\s+', ' ', nombre_completo).upper()
                    
                    carrera = r.get("profesion") or r.get("carrera") or "DATO NO ENCONTRADO"
                    carrera = str(carrera).upper()
                    
                    results.append({
                        "cedula": r.get("cedula") or "",
                        "tipo": r.get("tipo") or "C1",
                        "nombre_completo": nombre_completo,
                        "nombre_sep": n.strip().upper(),
                        "paterno_sep": p.strip().upper(),
                        "materno_sep": m.strip().upper(),
                        "carrera": carrera,
                        "universidad": (r.get("institucion") or "DATO NO ENCONTRADO").upper(),
                        "estado": (r.get("entidadInstitucion") or "DATO NO ENCONTRADO").upper(),
                        "ano": r.get("anioRegistro") or "DATO NO ENCONTRADO"
                    })
                return {"status": "success", "results": results, "cookies": {}}
            else:
                return {"status": "error", "message": f"Servidor SEP respondió con código {resp.status_code} tras refresco de proxy"}
    except Exception as e3:
        print("[SEP] Intento final con refresco de proxy falló:", str(e3))
        return {"status": "error", "message": f"Fallo final tras refresco de proxy: {str(e3)}"}
        
    return {"status": "error", "message": "Fallo en la comunicación con la SEP tras múltiples reintentos"}

def query_sep_official(nombre, paterno, materno, session_cookies=None):
    return query_sep_api(nombre, paterno, materno)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/preview", methods=["POST"])
def preview_file():
    if 'file' not in request.files:
        return jsonify({"error": "No se subió ningún archivo."}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "Nombre de archivo vacío."}), 400

    try:
        df = pd.read_excel(file)
        
        # Structured parameter from request
        structured = request.form.get("structured", "true").lower() == "true"
        
        # Analyze columns
        columns = list(df.columns)
        
        # Map columns automatically
        mapped = {"nombre": "", "paterno": "", "materno": ""}
        
        if structured:
            for col in columns:
                col_clean = clean_name_text(col)
                if "NOMB" in col_clean:
                    mapped["nombre"] = col
                elif "PATER" in col_clean or "APELLIDO1" in col_clean or ("APELLIDO" in col_clean and "1" in col_clean):
                    mapped["paterno"] = col
                elif "MATER" in col_clean or "APELLIDO2" in col_clean or ("APELLIDO" in col_clean and "2" in col_clean):
                    mapped["materno"] = col

            # If paternal/maternal not found, make best guess
            if not mapped["nombre"] and len(columns) > 0:
                mapped["nombre"] = columns[0]
            if not mapped["paterno"] and len(columns) > 1:
                mapped["paterno"] = columns[1]
            if not mapped["materno"] and len(columns) > 2:
                mapped["materno"] = columns[2]
        else:
            # For unstructured, find column that likely contains full name
            full_name_col = ""
            for col in columns:
                col_clean = clean_name_text(col)
                if "COMPLET" in col_clean or "COMBIN" in col_clean or "NOMB" in col_clean:
                    full_name_col = col
                    break
            if not full_name_col and len(columns) > 0:
                full_name_col = columns[0]
            mapped["nombre"] = full_name_col

        # Generate sample of first 5 rows with original vs clean preview
        preview_rows = []
        sample_size = min(5, len(df))
        for idx in range(sample_size):
            row = df.iloc[idx]
            
            if structured:
                n_orig = str(row.get(mapped["nombre"], "")) if mapped["nombre"] else ""
                p_orig = str(row.get(mapped["paterno"], "")) if mapped["paterno"] else ""
                m_orig = str(row.get(mapped["materno"], "")) if mapped["materno"] else ""
                
                n_clean = clean_name_text(n_orig)
                p_clean = clean_name_text(p_orig)
                m_clean = clean_name_text(m_orig)
            else:
                n_orig = str(row.get(mapped["nombre"], "")) if mapped["nombre"] else ""
                p_orig = ""
                m_orig = ""
                
                # Split full name under the hood
                split_names, split_paterno, split_materno = split_full_name(n_orig)
                n_clean = clean_name_text(split_names)
                p_clean = clean_name_text(split_paterno)
                m_clean = clean_name_text(split_materno)
            
            preview_rows.append({
                "idx": idx + 1,
                "nombre_orig": n_orig,
                "paterno_orig": p_orig,
                "materno_orig": m_orig,
                "nombre_clean": n_clean,
                "paterno_clean": p_clean,
                "materno_clean": m_clean,
            })

        # Save data in ACTIVE_JOBS
        job_id = str(int(time.time()))
        # Convert df to records to store safely in active memory
        records = df.to_dict(orient="records")
        total_rows = len(df)
        amount_mxn = 0.0  # Temporalmente gratis de forma ilimitada para pruebas generales con usuarios
        
        ACTIVE_JOBS[job_id] = {
            "records": records,
            "columns": columns,
            "mapped": mapped,
            "structured": structured,
            "results": [],
            "status": "pending",
            "current_index": 0,
            "session_cookies": {},
            "authorized": False,
            "paid": False,
            "amount_mxn": round(amount_mxn, 2)
        }

        prefetch_mexico_proxy_async()

        return jsonify({
            "job_id": job_id,
            "columns": columns,
            "mapped": mapped,
            "preview": preview_rows,
            "total_rows": total_rows,
            "amount_mxn": round(amount_mxn, 2)
        })

    except Exception as e:
        return jsonify({"error": f"Error al procesar archivo: {str(e)}"}), 500

@app.route("/api/update_cookies", methods=["POST"])
def update_cookies():
    data = request.json or {}
    job_id = data.get("job_id")
    raw_cookies = data.get("cookies")
    
    if not job_id or job_id not in ACTIVE_JOBS:
        return jsonify({"error": "ID de tarea inválido."}), 400

    parsed_cookies = parse_raw_cookies(raw_cookies)
    if not parsed_cookies:
        return jsonify({"error": "No se pudieron extraer cookies válidas de la cadena proporcionada."}), 400

    ACTIVE_JOBS[job_id]["session_cookies"].update(parsed_cookies)
    return jsonify({"success": True, "message": "Cookies actualizadas correctamente."})

@app.route("/api/update_mapping", methods=["POST"])
def update_mapping():
    data = request.json or {}
    job_id = data.get("job_id")
    if not job_id or job_id not in ACTIVE_JOBS:
        return jsonify({"error": "ID de tarea inválido o expirado."}), 404
        
    job = ACTIVE_JOBS[job_id]
    structured = data.get("structured", True)
    job["structured"] = structured
    
    # Update mapping
    if structured:
        job["mapped"]["nombre"] = data.get("nombre", job["mapped"].get("nombre", ""))
        job["mapped"]["paterno"] = data.get("paterno", job["mapped"].get("paterno", ""))
        job["mapped"]["materno"] = data.get("materno", job["mapped"].get("materno", ""))
    else:
        job["mapped"]["nombre"] = data.get("nombre", job["mapped"].get("nombre", ""))
        
    # Re-generate preview based on new mapping
    records = job["records"]
    mapped = job["mapped"]
    
    preview_rows = []
    sample_size = min(5, len(records))
    for idx in range(sample_size):
        row = records[idx]
        
        if structured:
            n_orig = str(row.get(mapped["nombre"], "")) if mapped["nombre"] else ""
            p_orig = str(row.get(mapped["paterno"], "")) if mapped["paterno"] else ""
            m_orig = str(row.get(mapped["materno"], "")) if mapped["materno"] else ""
            
            n_clean = clean_name_text(n_orig)
            p_clean = clean_name_text(p_orig)
            m_clean = clean_name_text(m_orig)
        else:
            n_orig = str(row.get(mapped["nombre"], "")) if mapped["nombre"] else ""
            p_orig = ""
            m_orig = ""
            
            split_names, split_paterno, split_materno = split_full_name(n_orig)
            n_clean = clean_name_text(split_names)
            p_clean = clean_name_text(split_paterno)
            m_clean = clean_name_text(split_materno)
        
        preview_rows.append({
            "idx": idx + 1,
            "nombre_orig": n_orig,
            "paterno_orig": p_orig,
            "materno_orig": m_orig,
            "nombre_clean": n_clean,
            "paterno_clean": p_clean,
            "materno_clean": m_clean,
        })
        
    return jsonify({
        "success": True,
        "preview": preview_rows
    })

@app.route("/api/validate_code", methods=["POST"])
def validate_code():
    data = request.json or {}
    job_id = data.get("job_id")
    code = data.get("code", "").strip().upper()
    
    if not job_id or job_id not in ACTIVE_JOBS:
        return jsonify({"error": "ID de tarea inválido o expirado."}), 404
        
    job = ACTIVE_JOBS[job_id]
    if code in AUTHORIZED_CODES:
        job["authorized"] = True
        return jsonify({"success": True, "message": "Acceso Corporativo Concedido (Gratis)"})
    else:
        job["authorized"] = False
        return jsonify({"success": False, "message": "Código de acceso inválido"}), 400

@app.route("/api/simulate_payment", methods=["POST"])
def simulate_payment():
    data = request.json or {}
    job_id = data.get("job_id")
    
    if not job_id or job_id not in ACTIVE_JOBS:
        return jsonify({"error": "ID de tarea inválido o expirado."}), 404
        
    job = ACTIVE_JOBS[job_id]
    job["paid"] = True
    return jsonify({"success": True})

@app.route("/api/job_status/<job_id>", methods=["GET"])
def job_status(job_id):
    if job_id not in ACTIVE_JOBS:
        return jsonify({"status": "not_found"}), 404
    job = ACTIVE_JOBS[job_id]
    return jsonify({
        "job_id": job_id,
        "status": job["status"],
        "total_rows": len(job["records"]),
        "current_index": job["current_index"],
        "amount_mxn": job["amount_mxn"],
        "authorized": job["authorized"],
        "paid": job["paid"],
        "structured": job.get("structured", True),
        "columns": job.get("columns", []),
        "mapped": job.get("mapped", {})
    })

@app.route("/api/pause/<job_id>", methods=["POST"])
def pause_job(job_id):
    if job_id not in ACTIVE_JOBS:
        return jsonify({"error": "ID de tarea inválido o expirado."}), 404
    job = ACTIVE_JOBS[job_id]
    job["status"] = "paused"
    return jsonify({"success": True, "message": "Tarea pausada correctamente en el servidor."})

@app.route("/api/resume/<job_id>", methods=["POST"])
def resume_job(job_id):
    if job_id not in ACTIVE_JOBS:
        return jsonify({"error": "ID de tarea inválido o expirado."}), 404
    job = ACTIVE_JOBS[job_id]
    if job["status"] == "completed":
        return jsonify({"error": "La tarea ya está completada."}), 400
    job["status"] = "processing"
    return jsonify({"success": True, "message": "Tarea reanudada en el servidor."})

def background_worker(job_id):
    job = ACTIVE_JOBS.get(job_id)
    if not job:
        return
        
    records = job["records"]
    mapped = job["mapped"]
    results_accumulated = job["results"]
    
    PREFIX_MAP = {
        "MEDICINA Y SALUD": "MED",
        "INGENIERÍA Y TECNOLOGÍA": "TEC",
        "ARQUITECTURA Y DISEÑO": "ARQ",
        "DERECHO Y LEYES": "DER",
        "NEGOCIOS Y FINANZAS": "NEG",
        "EDUCACIÓN Y HUMANIDADES": "EDU",
        "OTRA PROFESIÓN": "GEN"
    }
    
    idx = job["current_index"]
    
    # Send start event if not already present
    if not job["stream_events"]:
        job["stream_events"].append({'status': 'start', 'total': len(records)})
        
    while idx < len(records):
        # Check if the job was paused or stopped
        if job.get("status") == "paused":
            job["background_thread_active"] = False
            return
            
        row = records[idx]
        job["current_index"] = idx
        
        structured = job.get("structured", True)
        
        if structured:
            n_val = str(row.get(mapped["nombre"], "")) if mapped["nombre"] else ""
            p_val = str(row.get(mapped["paterno"], "")) if mapped["paterno"] else ""
            m_val = str(row.get(mapped["materno"], "")) if mapped["materno"] else ""
            
            searched_name_raw = re.sub(r'\s+', ' ', f"{n_val} {p_val} {m_val}").strip()
            
            n_clean = clean_name_text(n_val)
            p_clean = clean_name_text(p_val)
            m_clean = clean_name_text(m_val)
        else:
            full_name_val = str(row.get(mapped["nombre"], "")) if mapped["nombre"] else ""
            searched_name_raw = re.sub(r'\s+', ' ', full_name_val).strip()
            
            split_names, split_paterno, split_materno = split_full_name(full_name_val)
            
            n_clean = clean_name_text(split_names)
            p_clean = clean_name_text(split_paterno)
            m_clean = clean_name_text(split_materno)
            
        # Log searching status in stream
        job["stream_events"].append({'status': 'searching', 'index': idx + 1, 'name': searched_name_raw})
        
        # Query SEP API
        response = query_sep_official(n_clean, p_clean, m_clean, session_cookies=job["session_cookies"])
        
        if response["status"] == "captcha_required":
            if "cookies" in response:
                job["session_cookies"].update(response["cookies"])
            job["stream_events"].append({'status': 'captcha_required', 'index': idx + 1})
            job["status"] = "paused"
            job["background_thread_active"] = False
            return
            
        elif response["status"] == "error":
            error_msg = response.get("message", "Error de red.")
            job["stream_events"].append({'status': 'row_error', 'index': idx + 1, 'error': error_msg})
            
            results_accumulated.append({
                "original_row": row,
                "searched_name": searched_name_raw,
                "estatus": f"Error de consulta ({error_msg})",
                "id_resultado": "ERROR",
                "cedula": "",
                "tipo": "NOT_FOUND",
                "nombre_cedula": "",
                "nombre_sep": "",
                "paterno_sep": "",
                "materno_sep": "",
                "carrera": "",
                "universidad": "",
                "estado": "",
                "ano": "",
                "categoria": "OTRA PROFESIÓN",
                "ambigua": "No",
                "motivo_ambiguedad": ""
            })
            
            # Append NOT_FOUND equivalent for frontend processed log
            job["stream_events"].append({
                'status': 'row_processed', 
                'index': idx + 1, 
                'found': 0, 
                'name': searched_name_raw, 
                'results': []
            })
            
        else:
            if "cookies" in response:
                job["session_cookies"].update(response["cookies"])
                
            sep_rows = response.get("results", [])
            is_autocorrected = False
            
            if not sep_rows:
                candidates = autocorrect_name_parts(n_clean, p_clean, m_clean)
                for n_corr, p_corr, m_corr in candidates:
                    resp_corr = query_sep_official(n_corr, p_corr, m_corr, session_cookies=job["session_cookies"])
                    if resp_corr["status"] == "success" and resp_corr.get("results", []):
                        sep_rows = resp_corr["results"]
                        is_autocorrected = True
                        if "cookies" in resp_corr:
                            job["session_cookies"].update(resp_corr["cookies"])
                        break
                        
            if not sep_rows:
                results_accumulated.append({
                    "original_row": row,
                    "searched_name": searched_name_raw,
                    "estatus": "No Encontrado (Sin registro en la SEP)",
                    "id_resultado": "N/A",
                    "cedula": "",
                    "tipo": "NOT_FOUND",
                    "nombre_cedula": "",
                    "nombre_sep": "",
                    "paterno_sep": "",
                    "materno_sep": "",
                    "carrera": "",
                    "universidad": "",
                    "estado": "",
                    "ano": "",
                    "categoria": "OTRA PROFESIÓN",
                    "ambigua": "No",
                    "motivo_ambiguedad": ""
                })
                job["stream_events"].append({
                    'status': 'row_processed', 
                    'index': idx + 1, 
                    'found': 0, 
                    'name': searched_name_raw, 
                    'results': []
                })
            else:
                ambiguity_report = analyze_ambiguity(sep_rows, searched_name_raw, None)
                
                def get_year_key(x):
                    y = x.get("ano", "0")
                    return int(y) if str(y).isdigit() else 0
                    
                sep_rows.sort(key=lambda x: (x["nombre_completo"], get_year_key(x)))
                
                processed_results = []
                for r in sep_rows:
                    cat = classify_career(r["carrera"])
                    r["categoria"] = cat
                    
                    rep = ambiguity_report.get(r["cedula"], {"ambigua": "No", "motivo": ""})
                    r["ambigua"] = rep["ambigua"]
                    r["motivo_ambiguedad"] = rep["motivo"]
                    
                    prefix = PREFIX_MAP.get(cat, "GEN")
                    id_res = f"{prefix}-{job_id[-4:]}-{len(results_accumulated)+1:04d}"
                    
                    results_accumulated.append({
                        "original_row": row,
                        "searched_name": searched_name_raw,
                        "estatus": "Cédula Encontrada (Corregido)" if is_autocorrected else "Cédula Encontrada",
                        "id_resultado": id_res,
                        "cedula": r["cedula"],
                        "tipo": prefix,
                        "nombre_cedula": r["nombre_completo"],
                        "nombre_sep": r.get("nombre_sep", ""),
                        "paterno_sep": r.get("paterno_sep", ""),
                        "materno_sep": r.get("materno_sep", ""),
                        "carrera": r["carrera"],
                        "universidad": r["universidad"],
                        "estado": r["estado"],
                        "ano": r["ano"],
                        "categoria": cat,
                        "ambigua": r["ambigua"],
                        "motivo_ambiguedad": r["motivo_ambiguedad"]
                    })
                    
                    processed_results.append({
                        "id": id_res,
                        "cedula": r["cedula"],
                        "nombre": r["nombre_completo"],
                        "carrera": r["carrera"],
                        "universidad": r["universidad"],
                        "estado": r["estado"],
                        "ano": r["ano"],
                        "categoria": cat,
                        "ambigua": r["ambigua"],
                        "motivo": r["motivo_ambiguedad"]
                    })
                    
                job["stream_events"].append({
                    'status': 'row_processed', 
                    'index': idx + 1, 
                    'found': len(sep_rows), 
                    'name': searched_name_raw, 
                    'results': processed_results
                })
                
        idx += 1
        job["current_index"] = idx
        # Natural delay between queries to respect anti-bot
        time.sleep(random.uniform(1.2, 2.5))
        
    # Complete job!
    job["status"] = "completed"
    job["current_index"] = len(records)
    job["stream_events"].append({'status': 'completed', 'total_processed': len(records)})
    job["background_thread_active"] = False

@app.route("/api/process/<job_id>")
def process_job(job_id):
    if job_id not in ACTIVE_JOBS:
        return Response("event: error\ndata: Task not found\n\n", mimetype="text/event-stream")

    job = ACTIVE_JOBS[job_id]
    amount_mxn = job.get("amount_mxn", 0.0)
    
    # Strict backend billing check
    if amount_mxn > 0.0 and not job.get("authorized") and not job.get("paid"):
        def billing_error_stream():
            error_data = {"status": "billing_required_error", "message": "Se requiere pago para procesar más de 10 registros."}
            yield f"data: {json.dumps(error_data)}\n\n"
        return Response(billing_error_stream(), mimetype="text/event-stream")
        
    # Initialize stream events queue in job dictionary
    if "stream_events" not in job:
        job["stream_events"] = []
        
    # Start the asynchronous python thread if not already running and not explicitly paused
    if not job.get("background_thread_active") and job["status"] in ["pending", "processing"]:
        job["background_thread_active"] = True
        job["status"] = "processing"
        
        thread = threading.Thread(target=background_worker, args=(job_id,))
        thread.daemon = True
        thread.start()
        
    def event_stream():
        client_event_idx = 0
        while True:
            if client_event_idx < len(job["stream_events"]):
                event_data = job["stream_events"][client_event_idx]
                yield f"data: {json.dumps(event_data)}\n\n"
                client_event_idx += 1
                if event_data.get("status") in ["completed", "captcha_required"]:
                    break
            else:
                # Yield keepalive heartbeat to reset connection timeouts
                yield ": keepalive\n\n"
                time.sleep(0.5)
                
    resp = Response(event_stream(), mimetype="text/event-stream")
    resp.headers["X-Accel-Buffering"] = "no"
    resp.headers["Cache-Control"] = "no-cache"
    return resp

@app.route("/api/download/<job_id>", methods=["GET"])
def download_results(job_id):
    if job_id not in ACTIVE_JOBS:
        return jsonify({"error": "ID de tarea inválido o expirado."}), 404

    job = ACTIVE_JOBS[job_id]
    results = job["results"]

    if not results:
        return jsonify({"error": "No hay resultados para exportar."}), 400

    try:
        # Build DataFrame
        output_rows = []
        mapped = job["mapped"]
        for r in results:
            row_dict = {}
            
            row_dict["Nombre Completo Buscado"] = r.get("searched_name", "")
            
            # Add original columns first
            for k, v in r["original_row"].items():
                row_dict[k] = v
                
            # Add official results columns (excluding Tipo, Coincidencia Ambigua, and Motivo de Ambiguedad)
            row_dict["Estatus Búsqueda"] = r["estatus"]
            row_dict["ID Cédula Único"] = r["id_resultado"]
            row_dict["Cédula"] = r["cedula"]
            row_dict["Nombre Completo Cédula"] = r["nombre_cedula"]
            row_dict["Nombre Cédula Oficial"] = r.get("nombre_sep", "")
            row_dict["Apellido 1 Cédula Oficial"] = r.get("paterno_sep", "")
            row_dict["Apellido 2 Cédula Oficial"] = r.get("materno_sep", "")
            row_dict["Carrera / Especialidad"] = r["carrera"]
            row_dict["Universidad"] = r["universidad"]
            row_dict["Estado Expedición"] = r["estado"]
            row_dict["Año"] = r["ano"]
            row_dict["Categoría Profesional"] = r.get("categoria", "OTRA PROFESIÓN")
            
            output_rows.append(row_dict)

        df_out = pd.DataFrame(output_rows)
        
        # Write Excel with formatting directly into memory
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            df_out.to_excel(writer, index=False, sheet_name="Resultados Cédulas")
            
            # Format Excel columns slightly
            workbook = writer.book
            worksheet = writer.sheets["Resultados Cédulas"]
            
            # Autoselect column width
            for col in worksheet.columns:
                max_len = max(len(str(cell.value or '')) for cell in col)
                col_letter = col[0].column_letter
                worksheet.column_dimensions[col_letter].width = max(max_len + 3, 12)

        # Seek to the beginning of the stream
        output.seek(0)

        # Return file download directly from memory (avoids disk writes that trigger Flask debug reload)
        return send_file(
            output, 
            as_attachment=True, 
            download_name=f"Reporte_Cedulas_Oficiales_{job_id}.xlsx",
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )

    except Exception as e:
        return jsonify({"error": f"Error al generar Excel: {str(e)}"}), 500

def open_browser():
    try:
        webbrowser.open_new("http://127.0.0.1:5050")
    except Exception as e:
        print("Error opening browser automatically:", str(e))

if __name__ == "__main__":
    # Pre-fetch working proxy on startup for cloud environments (only if on Render)
    if os.environ.get("RENDER") or os.environ.get("PORT"):
        prefetch_mexico_proxy_async()
        
    print("Iniciando Búsqueda Cédulas Profesionales en puerto 5050...")
    
    # Automatically open local browser window for offline desktop users
    if not os.environ.get("RENDER") and not os.environ.get("PORT"):
        Timer(1.5, open_browser).start()
        
    # Disable debug mode when compiled into .exe to prevent multiple browser tabs or crashes
    debug_mode = not getattr(sys, 'frozen', False)
    app.run(host="127.0.0.1", port=5050, debug=debug_mode)
