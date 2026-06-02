// ==========================================================================
// BúhoCédula Pro - Client Application Logic
// ==========================================================================

// Global state variables
let currentJobId = null;
let totalRecords = 0;
// Career classification is handled automatically in the backend.
let activeEventSource = null;
let isProcessing = false;
let processedCount = 0;
let totalMedicalFound = 0;
let resultsStore = [];
let isStructured = true;
let currentUploadedFile = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

// DOM Element references
const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const uploadedDetails = document.getElementById("uploaded-file-details");
const fileNameDisp = document.getElementById("file-name");
const fileMetaDisp = document.getElementById("file-meta");
const btnChangeFile = document.getElementById("btn-change-file");

const btnStructYes = document.getElementById("btn-struct-yes");
const btnStructNo = document.getElementById("btn-struct-no");
const cardConfig = document.getElementById("card-config");
const mappingStructured = document.getElementById("mapping-structured");
const mappingUnstructured = document.getElementById("mapping-unstructured");

const selectColNombre = document.getElementById("select-col-nombre");
const selectColPaterno = document.getElementById("select-col-paterno");
const selectColMaterno = document.getElementById("select-col-materno");
const selectColFullname = document.getElementById("select-col-fullname");

// Keywords preview elements removed
const btnStartProcess = document.getElementById("btn-start-process");

const cardPreview = document.getElementById("card-preview");
const previewTableBody = document.getElementById("preview-table-body");

const cardConsole = document.getElementById("card-console");
const terminalLog = document.getElementById("terminal-log");
const progressPercent = document.getElementById("progress-percent");
const progressCount = document.getElementById("progress-count");
const progressBarFill = document.getElementById("progress-bar-fill");
const btnPauseProcess = document.getElementById("btn-pause-process");
const btnResumeProcess = document.getElementById("btn-resume-process");
const engineEta = document.getElementById("engine-eta");

const resultsSection = document.getElementById("results-section");
const inputSearchTable = document.getElementById("input-search-table");
const selectFilterStatus = document.getElementById("select-filter-status");
const resultsTableBody = document.getElementById("results-table-body");
const btnExportExcel = document.getElementById("btn-export-excel");

// Modals elements
// Keyword modal elements removed

const modalCaptcha = document.getElementById("modal-captcha");
const textareaCookies = document.getElementById("textarea-cookies");
const btnSubmitCookies = document.getElementById("btn-submit-cookies");
const captchaErrorMsg = document.getElementById("captcha-error-msg");

// ==========================================================================
// Event Listeners & Initialization
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
    initDragAndDrop();
    initStructureToggle();
    // Automatic classification active
    initModals();
    initTableFilters();
});

// Drag & Drop
function initDragAndDrop() {
    dropZone.addEventListener("click", (e) => {
        // If the click is on the fileInput itself, do NOT call .click() again (prevent infinite loop/bubble conflict)
        if (e.target === fileInput) {
            return;
        }
        
        // Prevent duplicate click if clicked on select button label (which already clicks the input)
        if (e.target.closest(".select-btn")) {
            return;
        }
        
        fileInput.click();
    });
    
    fileInput.addEventListener("click", (e) => {
        e.stopPropagation();
    });
    
    fileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            handleUploadedFile(e.target.files[0]);
        }
    });

    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("drag-over");
    });

    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("drag-over");
    });

    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("drag-over");
        if (e.dataTransfer.files.length > 0) {
            handleUploadedFile(e.dataTransfer.files[0]);
        }
    });

    btnChangeFile.addEventListener("click", (e) => {
        e.stopPropagation();
        resetToUploadState();
    });
}

function initStructureToggle() {
    btnStructYes.addEventListener("click", () => {
        if (isStructured) return;
        isStructured = true;
        
        btnStructYes.classList.add("active");
        btnStructNo.classList.remove("active");
        
        mappingStructured.classList.remove("hidden");
        mappingUnstructured.classList.add("hidden");
        
        appendLog(`[CONFIG] Modo cambiado a Estructurado (3 columnas).`, "info");
        
        if (currentUploadedFile) {
            handleUploadedFile(currentUploadedFile);
        }
    });

    btnStructNo.addEventListener("click", () => {
        if (!isStructured) return;
        isStructured = false;
        
        btnStructYes.classList.remove("active");
        btnStructNo.classList.add("active");
        
        mappingStructured.classList.add("hidden");
        mappingUnstructured.classList.remove("hidden");
        
        appendLog(`[CONFIG] Modo cambiado a No Estructurado (1 columna combinada).`, "info");
        
        if (currentUploadedFile) {
            handleUploadedFile(currentUploadedFile);
        }
    });
}

// ==========================================================================
// File Load & Pre-cleansing Preview
// ==========================================================================

function handleUploadedFile(file) {
    appendLog(`[INFO] Subiendo archivo "${file.name}" al servidor para previsualización...`, "info");
    
    currentUploadedFile = file;
    
    // UI Loading state
    dropZone.classList.add("disabled");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("structured", isStructured);

    fetch("/api/preview", {
        method: "POST",
        body: formData
    })
    .then(res => {
        if (!res.ok) throw new Error("Error en servidor al procesar preliminar.");
        return res.json();
    })
    .then(data => {
        currentJobId = data.job_id;
        totalRecords = data.total_rows;
        
        // Show file details
        fileNameDisp.textContent = file.name;
        fileMetaDisp.textContent = `${totalRecords} filas listas para procesar`;
        dropZone.classList.add("hidden");
        uploadedDetails.classList.remove("hidden");
        
        // Enable configs panel
        cardConfig.classList.remove("disabled");
        btnStartProcess.removeAttribute("disabled");
        
        // Populate Mapping selectors
        populateSelectors(data.columns, data.mapped);
        
        // Populate preview table
        renderPreviewTable(data.preview);
        
        appendLog(`[EXITO] Archivo cargado con éxito. ID de Tarea: ${currentJobId}. Se identificaron ${totalRecords} filas.`, "success");
    })
    .catch(err => {
        appendLog(`[ERROR] Falló la carga del archivo: ${err.message}`, "error");
        resetToUploadState();
    })
    .finally(() => {
        dropZone.classList.remove("disabled");
    });
}

function resetToUploadState() {
    fileInput.value = "";
    currentJobId = null;
    totalRecords = 0;
    
    uploadedDetails.classList.add("hidden");
    dropZone.classList.remove("hidden");
    
    cardConfig.classList.add("disabled");
    btnStartProcess.setAttribute("disabled", "true");
    
    selectColNombre.innerHTML = "";
    selectColPaterno.innerHTML = "";
    selectColMaterno.innerHTML = "";
    selectColFullname.innerHTML = "";
    
    previewTableBody.innerHTML = `
        <tr class="empty-state">
            <td colspan="3">Sube un Excel para ver la limpieza de datos en tiempo real.</td>
        </tr>
    `;
    
    // Hide terminal & results
    cardConsole.classList.add("hidden");
    resultsSection.classList.add("hidden");
    resultsTableBody.innerHTML = "";
    resultsStore = [];
    processedCount = 0;
    totalMedicalFound = 0;
}

function populateSelectors(columns, mapped) {
    selectColNombre.innerHTML = "";
    selectColPaterno.innerHTML = "";
    selectColMaterno.innerHTML = "";
    selectColFullname.innerHTML = "";

    columns.forEach(col => {
        // Structured options
        const optN = document.createElement("option");
        optN.value = col;
        optN.textContent = col;
        optN.selected = (col === mapped.nombre);
        selectColNombre.appendChild(optN);

        const optP = document.createElement("option");
        optP.value = col;
        optP.textContent = col;
        optP.selected = (col === mapped.paterno);
        selectColPaterno.appendChild(optP);

        const optM = document.createElement("option");
        optM.value = col;
        optM.textContent = col;
        optM.selected = (col === mapped.materno);
        selectColMaterno.appendChild(optM);

        // Unstructured option
        const optF = document.createElement("option");
        optF.value = col;
        optF.textContent = col;
        optF.selected = (col === mapped.nombre);
        selectColFullname.appendChild(optF);
    });

    // Add event listeners to recalculate dynamic preview on mapping change
    [selectColNombre, selectColPaterno, selectColMaterno, selectColFullname].forEach(sel => {
        sel.removeEventListener("change", handleMappingChange);
        sel.addEventListener("change", handleMappingChange);
    });
}

function handleMappingChange() {
    if (!currentJobId) return;
    
    appendLog(`[MAPPING] Actualizando mapeo de columnas...`, "info");
    
    const payload = {
        job_id: currentJobId,
        structured: isStructured
    };
    
    if (isStructured) {
        payload.nombre = selectColNombre.value;
        payload.paterno = selectColPaterno.value;
        payload.materno = selectColMaterno.value;
    } else {
        payload.nombre = selectColFullname.value;
    }
    
    fetch("/api/update_mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    })
    .then(res => {
        if (!res.ok) throw new Error("Error al actualizar mapeo.");
        return res.json();
    })
    .then(data => {
        renderPreviewTable(data.preview);
        appendLog(`[MAPPING] Limpieza y división de nombres re-aplicadas en tiempo real.`, "success");
    })
    .catch(err => {
        appendLog(`[ERROR] No se pudo actualizar el mapeo: ${err.message}`, "error");
    });
}

function updatePreviewMapping() {
    // In a real robust implementation, we could query the server to refresh previews
    // But since the names are already loaded, we just do a visual notification
    appendLog(`[MAPPING] Se actualizó el mapeo de columnas. Limpieza re-aplicada.`, "info");
}

function renderPreviewTable(rows) {
    previewTableBody.innerHTML = "";
    if (rows.length === 0) {
        previewTableBody.innerHTML = `<tr><td colspan="3" class="text-center">Sin filas para previsualizar.</td></tr>`;
        return;
    }

    rows.forEach(r => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="font-weight:600; color:var(--primary);">${r.idx}</td>
            <td style="color:var(--text-muted); font-size:0.8rem;">
                ${r.nombre_orig} ${r.paterno_orig} ${r.materno_orig}
            </td>
            <td style="font-weight:600;">
                ${r.nombre_clean} ${r.paterno_clean} ${r.materno_clean}
            </td>
        `;
        previewTableBody.appendChild(tr);
    });
}

// Professional career classification is automated in the backend.

// Modals handlers
function initModals() {
    // Keyword modal event listeners removed

    // Captcha modal
    btnSubmitCookies.addEventListener("click", () => {
        const rawString = textareaCookies.value.trim();
        if (!rawString) {
            captchaErrorMsg.classList.remove("hidden");
            return;
        }

        captchaErrorMsg.classList.add("hidden");
        btnSubmitCookies.setAttribute("disabled", "true");
        btnSubmitCookies.querySelector("span").textContent = "Validando sesión...";

        fetch("/api/update_cookies", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                job_id: currentJobId,
                cookies: rawString
            })
        })
        .then(res => {
            if (!res.ok) throw new Error("Cookies inválidas o expiradas.");
            return res.json();
        })
        .then(data => {
            modalCaptcha.classList.add("hidden");
            appendLog(`[SESION] ¡Cookies de sesión importadas correctamente! Reanudando consultas masivas...`, "success");
            textareaCookies.value = "";
            resumeScrapingProcess();
        })
        .catch(err => {
            captchaErrorMsg.textContent = err.message;
            captchaErrorMsg.classList.remove("hidden");
        })
        .finally(() => {
            btnSubmitCookies.removeAttribute("disabled");
            btnSubmitCookies.querySelector("span").textContent = "Actualizar Sesión y Reanudar";
        });
    });
}

// ==========================================================================
// Scraper Processing Loop (Server-Sent Events)
// ==========================================================================

btnStartProcess.addEventListener("click", () => {
    if (!currentJobId) return;

    // Transition Layout
    cardConfig.classList.add("disabled");
    btnStartProcess.setAttribute("disabled", "true");
    cardConsole.classList.remove("hidden");
    resultsSection.classList.remove("hidden");
    
    // Reset Process counts
    processedCount = 0;
    totalMedicalFound = 0;
    resultsTableBody.innerHTML = "";
    resultsStore = [];
    
    startScrapingProcess();
});

function startScrapingProcess() {
    isProcessing = true;
    appendLog(`[PROCESO] Iniciando consultas masivas en BúhoLegal. ETA aproximado: ${Math.round(totalRecords * 2.5)}s`, "info");
    
    // Disable file switching during run
    btnChangeFile.setAttribute("disabled", "true");
    btnPauseProcess.classList.remove("hidden");
    btnResumeProcess.classList.add("hidden");

    // Establish Server-Sent Events source
    activeEventSource = new EventSource(`/api/process/${currentJobId}`);

    activeEventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.status === "start") {
            appendLog(`[PROCESO] Conexión establecida. Iniciando ${data.total} búsquedas...`, "info");
            updateProgress(0, data.total);
        }
        
        else if (data.status === "searching") {
            reconnectAttempts = 0;
            appendLog(`[BUSCANDO] Fila ${data.index}/${totalRecords}: "${data.name}"`, "info");
        }
        
        else if (data.status === "row_processed") {
            processedCount = data.index;
            updateProgress(processedCount, totalRecords);
            
            let logMsg = `[OK] Fila ${data.index}: Cédulas encontradas: ${data.found}`;
            if (data.found > 0) {
                appendLog(logMsg + ` (Procesada con éxito)`, "success");
                
                // Add to dynamic table results
                data.results.forEach(res => {
                    const rowData = {
                        id: res.id,
                        original: data.name || "Buscado",
                        nombre: res.nombre,
                        cedula: res.cedula,
                        tipo: res.categoria,
                        carrera: res.carrera,
                        meta: `${res.universidad} | ${res.estado} | ${res.ano}`,
                        ambigua: res.ambigua,
                        motivo: res.motivo
                    };
                    resultsStore.push(rowData);
                    addResultRowToTable(rowData);
                });
            } else {
                appendLog(logMsg + ` (Sin registros)`, "info");
                // Add NOT_FOUND record
                const rowData = {
                    id: "N/A",
                    original: data.name || "Buscado",
                    nombre: "NO ENCONTRADO",
                    cedula: "-",
                    tipo: "NOT_FOUND",
                    carrera: "-",
                    meta: "-",
                    ambigua: "No"
                };
                resultsStore.push(rowData);
                addResultRowToTable(rowData);
            }
        }
        
        else if (data.status === "row_error") {
            appendLog(`[ERROR] Fila ${data.index}: ${data.error}`, "error");
        }
        
        else if (data.status === "captcha_required") {
            appendLog(`[CAPTCHA] ¡BúhoLegal ha activado una validación CAPTCHA! Pausando consultas de forma segura...`, "error");
            pauseScrapingProcess(true); // Open modal
        }
        
        else if (data.status === "completed") {
            isProcessing = false;
            activeEventSource.close();
            appendLog(`[COMPLETADO] ¡Búsqueda finalizada con éxito! Total procesados: ${data.total_processed}.`, "success");
            
            // Enable download Excel
            btnExportExcel.removeAttribute("disabled");
            btnPauseProcess.classList.add("hidden");
            btnResumeProcess.classList.add("hidden");
            btnChangeFile.removeAttribute("disabled");
            
            progressBarFill.style.background = "linear-gradient(90deg, #10b981 0%, #059669 100%)";
            progressPercent.textContent = "100%";
            engineEta.textContent = "Proceso terminado con éxito";
            
            // Flash ambient glow
            document.querySelector(".ambient-glow.bg-blue").style.background = "radial-gradient(circle, var(--success) 0%, transparent 70%)";
        }
    };

    activeEventSource.onerror = (err) => {
        if (activeEventSource) {
            activeEventSource.close();
        }
        
        if (isProcessing && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            appendLog(`[CONEXION] Conexión interrumpida en fila ${processedCount}/${totalRecords}. Re-intentando reconexión automática (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) en 3 segundos...`, "warning");
            
            setTimeout(() => {
                if (isProcessing) {
                    startScrapingProcess();
                }
            }, 3000);
        } else {
            appendLog(`[CONEXION] Error de transmisión Server-Sent Events o conexión de red interrumpida.`, "error");
            pauseScrapingProcess(false);
        }
    };
}

function pauseScrapingProcess(showCaptchaModal = false) {
    if (activeEventSource) {
        activeEventSource.close();
    }
    isProcessing = false;
    appendLog(`[PAUSA] Consultas pausadas temporalmente en la fila ${processedCount}/${totalRecords}.`, "warning");
    
    btnPauseProcess.classList.add("hidden");
    btnResumeProcess.classList.remove("hidden");

    if (showCaptchaModal) {
        modalCaptcha.classList.remove("hidden");
    }
}

function resumeScrapingProcess() {
    startScrapingProcess();
}

btnPauseProcess.addEventListener("click", () => pauseScrapingProcess(false));
btnResumeProcess.addEventListener("click", () => resumeScrapingProcess());

// Update Visual progress
function updateProgress(current, total) {
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    progressBarFill.style.width = `${percent}%`;
    progressPercent.textContent = `${percent}%`;
    progressCount.textContent = `(${current} / ${total})`;
    
    // Calculate simple dynamic ETA
    if (percent > 0 && percent < 100) {
        const remaining = total - current;
        const etaSeconds = Math.round(remaining * 2.2);
        if (etaSeconds > 60) {
            engineEta.textContent = `ETA: ~${Math.round(etaSeconds/60)} minutos`;
        } else {
            engineEta.textContent = `ETA: ~${etaSeconds} segundos`;
        }
    } else if (percent === 0) {
        engineEta.textContent = "Calculando tiempo restante...";
    }
}

// Log Appender Helper
function appendLog(message, type = "info") {
    const p = document.createElement("p");
    p.className = `log-${type}`;
    
    const timeStr = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
    p.textContent = `[${timeStr}] ${message}`;
    
    terminalLog.appendChild(p);
    terminalLog.scrollTop = terminalLog.scrollHeight;
}

// ==========================================================================
// Dynamic Results Table Filtering
// ==========================================================================

function addResultRowToTable(r) {
    // If it's the first actual row, clean empty state
    if (resultsTableBody.querySelector(".empty-state")) {
        resultsTableBody.innerHTML = "";
    }

    // Enable export button immediately so the user can download accumulated results at any time
    btnExportExcel.removeAttribute("disabled");

    const tr = document.createElement("tr");
    tr.dataset.type = r.tipo;
    tr.dataset.ambig = r.ambigua;
    
    let badgeClass = "status-other";
    let badgeLabel = r.tipo;
    
    if (r.ambigua === "Sí") {
        badgeClass = "status-ambig";
        badgeLabel = `${r.tipo} (Ambiguo)`;
    } else {
        if (r.tipo === "MEDICINA Y SALUD") {
            badgeClass = "status-med";
        } else if (r.tipo === "INGENIERÍA Y TECNOLOGÍA") {
            badgeClass = "status-tec";
        } else if (r.tipo === "ARQUITECTURA Y DISEÑO") {
            badgeClass = "status-arq";
        } else if (r.tipo === "DERECHO Y LEYES") {
            badgeClass = "status-der";
        } else if (r.tipo === "NEGOCIOS Y FINANZAS") {
            badgeClass = "status-neg";
        } else if (r.tipo === "EDUCACIÓN Y HUMANIDADES") {
            badgeClass = "status-edu";
        } else if (r.tipo === "NOT_FOUND") {
            badgeClass = "status-notfound";
            badgeLabel = "No Registrado";
        } else {
            badgeClass = "status-other";
        }
    }

    const ambigTitle = r.motivo ? `title="${r.motivo}"` : "";

    tr.innerHTML = `
        <td style="font-family:var(--font-code); font-size:0.75rem; font-weight:600;">
            <span class="badge-table ${badgeClass}" ${ambigTitle}>${r.id}</span>
        </td>
        <td style="color:var(--text-muted); font-size:0.8rem;">${r.original}</td>
        <td style="font-weight:600;">${r.nombre}</td>
        <td style="font-weight:700; color:var(--primary);">${r.cedula}</td>
        <td style="font-size:0.8rem; font-weight:500; max-width:250px; overflow:hidden; text-overflow:ellipsis;" title="${r.carrera}">${r.carrera}</td>
        <td style="font-size:0.8rem; color:var(--text-muted);">${r.meta}</td>
    `;
    
    // Add row with quick fade-in
    tr.style.opacity = 0;
    resultsTableBody.appendChild(tr);
    setTimeout(() => { tr.style.opacity = 1; tr.style.transition = "opacity 0.3s ease-in"; }, 50);

    // Reapply active filters
    filterResultsTable();
}

function initTableFilters() {
    inputSearchTable.addEventListener("input", () => filterResultsTable());
    selectFilterStatus.addEventListener("change", () => filterResultsTable());
}

function filterResultsTable() {
    const query = inputSearchTable.value.toLowerCase().trim();
    const filter = selectFilterStatus.value;
    
    const rows = resultsTableBody.querySelectorAll("tr:not(.empty-state)");
    let visibleCount = 0;

    rows.forEach(row => {
        const type = row.dataset.type;
        const ambig = row.dataset.ambig;
        const text = row.textContent.toLowerCase();
        
        let matchQuery = text.includes(query);
        let matchFilter = true;

        if (filter === "AMBIG") {
            matchFilter = (ambig === "Sí");
        } else if (filter !== "ALL") {
            matchFilter = (type === filter);
        }

        if (matchQuery && matchFilter) {
            row.classList.remove("hidden");
            visibleCount++;
        } else {
            row.classList.add("hidden");
        }
    });

    // If all filtered out, show temporary empty state
    const existingTempEmpty = resultsTableBody.querySelector(".temp-empty-state");
    if (visibleCount === 0 && rows.length > 0) {
        if (!existingTempEmpty) {
            const tr = document.createElement("tr");
            tr.className = "empty-state temp-empty-state";
            tr.innerHTML = `<td colspan="6" class="text-center" style="padding:3rem 0;">No se encontraron resultados con los filtros aplicados.</td>`;
            resultsTableBody.appendChild(tr);
        }
    } else if (visibleCount > 0 && existingTempEmpty) {
        existingTempEmpty.remove();
    }
}

// ==========================================================================
// Excel Export Trigger
// ==========================================================================

btnExportExcel.addEventListener("click", () => {
    if (!currentJobId) return;
    appendLog(`[EXPORTAR] Iniciando descarga del archivo Excel final enriquecido...`, "info");
    
    // Redirect to download endpoint
    window.location.href = `/api/download/${currentJobId}`;
});
