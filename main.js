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

// Billing and Payment states
let amountMxn = 0.0;
let isAuthorized = false;
let isPaid = false;

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

// Hybrid Billing elements
const inputAccessKey = document.getElementById("input-access-key");
const accessKeyStatus = document.getElementById("access-key-status");
const billingTotalCost = document.getElementById("billing-total-cost");
const btnPayValidation = document.getElementById("btn-pay-validation");

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
const modalCaptcha = document.getElementById("modal-captcha");
const textareaCookies = document.getElementById("textarea-cookies");
const btnSubmitCookies = document.getElementById("btn-submit-cookies");
const captchaErrorMsg = document.getElementById("captcha-error-msg");

// Payment Modal elements
const modalPayment = document.getElementById("modal-payment");
const btnClosePayment = document.getElementById("btn-close-payment");
const btnCancelPayment = document.getElementById("btn-cancel-payment");
const btnConfirmPayment = document.getElementById("btn-confirm-payment");
const formCcPayment = document.getElementById("form-cc-payment");
const paySummaryRows = document.getElementById("pay-summary-rows");
const paySummaryTotal = document.getElementById("pay-summary-total");
const receiptTxId = document.getElementById("receipt-tx-id");
const receiptTxAmount = document.getElementById("receipt-tx-amount");
const paymentFormView = document.getElementById("payment-form-view");
const paymentProcessingView = document.getElementById("payment-processing-view");
const paymentSuccessView = document.getElementById("payment-success-view");
const paymentFooterActions = document.getElementById("payment-footer-actions");
const ccName = document.getElementById("cc-name");
const ccNumber = document.getElementById("cc-number");
const ccExpiry = document.getElementById("cc-expiry");
const ccCvc = document.getElementById("cc-cvc");

// ==========================================================================
// Event Listeners & Initialization
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
    initDragAndDrop();
    initStructureToggle();
    // Automatic classification active
    initModals();
    initTableFilters();
    checkActiveJobOnLoad();
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
        amountMxn = data.amount_mxn;
        
        // Show file details
        fileNameDisp.textContent = file.name;
        fileMetaDisp.textContent = `${totalRecords} filas listas para procesar`;
        dropZone.classList.add("hidden");
        uploadedDetails.classList.remove("hidden");
        
        // Enable configs panel
        cardConfig.classList.remove("disabled");
        
        // Evaluate dynamic hybrid payment status
        evaluatePaymentStatus();
        
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
    localStorage.removeItem("currentJobId");
    
    // Billing states reset
    amountMxn = 0.0;
    isAuthorized = false;
    isPaid = false;
    if (inputAccessKey) {
        inputAccessKey.value = "";
        inputAccessKey.className = "custom-input";
    }
    if (accessKeyStatus) {
        accessKeyStatus.className = "access-status-text";
        accessKeyStatus.textContent = "Promoción activa: Búsquedas masivas gratis por tiempo limitado.";
    }
    if (billingTotalCost) {
        billingTotalCost.textContent = "$0.00 MXN";
    }
    if (btnPayValidation) {
        btnPayValidation.classList.add("hidden");
    }
    
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

    // Payment Modal Cancel & Close
    btnClosePayment.addEventListener("click", () => closePaymentModal());
    btnCancelPayment.addEventListener("click", () => closePaymentModal());

    // CC number input formatting (4-4-4-4 spacing)
    ccNumber.addEventListener("input", (e) => {
        let value = e.target.value.replace(/\D/g, "");
        let formatted = "";
        for (let i = 0; i < value.length; i++) {
            if (i > 0 && i % 4 === 0) formatted += " ";
            formatted += value[i];
        }
        e.target.value = formatted;
    });

    // CC Expiry formatting (MM/AA)
    ccExpiry.addEventListener("input", (e) => {
        let value = e.target.value.replace(/\D/g, "");
        if (value.length > 2) {
            e.target.value = value.substring(0, 2) + "/" + value.substring(2, 4);
        } else {
            e.target.value = value;
        }
    });

    // Simulated Payment Submission
    formCcPayment.addEventListener("submit", (e) => {
        e.preventDefault();
        
        // Form validations
        if (!ccName.value || ccNumber.value.length < 16 || ccExpiry.value.length < 5 || ccCvc.value.length < 3) {
            alert("Por favor completa los datos de tu tarjeta correctamente.");
            return;
        }

        // Transition to Processing View
        paymentFormView.classList.add("hidden");
        paymentFooterActions.classList.add("hidden");
        paymentProcessingView.classList.remove("hidden");

        setTimeout(() => {
            // Confirm transaction to server
            fetch("/api/simulate_payment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ job_id: currentJobId })
            })
            .then(res => {
                if (!res.ok) throw new Error("Fallo en la comunicación con el procesador de pagos.");
                return res.json();
            })
            .then(data => {
                // Transition to Success View
                paymentProcessingView.classList.add("hidden");
                paymentSuccessView.classList.remove("hidden");

                // Generate and display transaction details
                const txId = "TX-" + Math.floor(10000 + Math.random() * 90000) + "-OK";
                receiptTxId.textContent = txId;
                receiptTxAmount.textContent = `$${amountMxn.toFixed(2)} MXN`;

                isPaid = true;
                evaluatePaymentStatus();

                appendLog(`[PAGO] ¡Transacción autorizada con éxito por el banco emisor! Referencia: ${txId}. Costo: $${amountMxn.toFixed(2)} MXN.`, "success");

                // Close after brief delay to let user see success screen
                setTimeout(() => {
                    closePaymentModal();
                }, 3500);
            })
            .catch(err => {
                alert("Error al procesar pago simulado: " + err.message);
                paymentProcessingView.classList.add("hidden");
                paymentFormView.classList.remove("hidden");
                paymentFooterActions.classList.remove("hidden");
            });
        }, 2000); // Premium interactive delay
    });

    // Also call initBilling
    initBilling();
}

function initBilling() {
    let valTimeout;
    
    // Keyup access key validation
    inputAccessKey.addEventListener("input", () => {
        clearTimeout(valTimeout);
        const code = inputAccessKey.value.trim().toUpperCase();
        
        if (!code) {
            inputAccessKey.className = "custom-input";
            accessKeyStatus.className = "access-status-text";
            accessKeyStatus.textContent = "Promoción activa: Búsquedas masivas gratis por tiempo limitado.";
            isAuthorized = false;
            evaluatePaymentStatus();
            return;
        }

        accessKeyStatus.className = "access-status-text";
        accessKeyStatus.textContent = "Validando clave con el servidor...";

        valTimeout = setTimeout(() => {
            fetch("/api/validate_code", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    job_id: currentJobId,
                    code: code
                })
            })
            .then(res => {
                if (!res.ok) throw new Error("Código no válido");
                return res.json();
            })
            .then(data => {
                inputAccessKey.className = "custom-input success-glow";
                accessKeyStatus.className = "access-status-text status-success";
                accessKeyStatus.textContent = "✔ Acceso Corporativo Concedido (Gratis)";
                isAuthorized = true;
                evaluatePaymentStatus();
                appendLog(`[VIP] Clave de acceso corporativa "${code}" validada correctamente. Búsqueda desbloqueada gratis.`, "success");
            })
            .catch(err => {
                inputAccessKey.className = "custom-input error-glow";
                accessKeyStatus.className = "access-status-text status-error";
                accessKeyStatus.textContent = "✖ Código de acceso corporativo inválido";
                isAuthorized = false;
                evaluatePaymentStatus();
            });
        }, 350); // Small debounce
    });

    // Trigger payment modal
    btnPayValidation.addEventListener("click", () => {
        openPaymentModal();
    });
}

function evaluatePaymentStatus() {
    if (!currentJobId) return;

    if (isAuthorized) {
        billingTotalCost.textContent = "$0.00 MXN (VIP)";
        btnPayValidation.classList.add("hidden");
        btnStartProcess.removeAttribute("disabled");
        btnStartProcess.querySelector("span").textContent = "Comenzar Búsqueda Masiva (VIP)";
    } else if (isPaid) {
        billingTotalCost.textContent = `$${amountMxn.toFixed(2)} MXN (PAGADO)`;
        btnPayValidation.classList.add("hidden");
        btnStartProcess.removeAttribute("disabled");
        btnStartProcess.querySelector("span").textContent = "Comenzar Búsqueda Masiva";
    } else {
        billingTotalCost.textContent = `$${amountMxn.toFixed(2)} MXN`;
        
        if (amountMxn === 0.0) {
            // Free tier <= 10 rows
            btnPayValidation.classList.add("hidden");
            btnStartProcess.removeAttribute("disabled");
            btnStartProcess.querySelector("span").textContent = "Comenzar Búsqueda Masiva (Nivel Gratis)";
        } else {
            btnPayValidation.classList.remove("hidden");
            btnPayValidation.querySelector("span").textContent = `Proceder al Pago con Tarjeta ($${amountMxn.toFixed(2)} MXN)`;
            btnStartProcess.setAttribute("disabled", "true");
            btnStartProcess.querySelector("span").textContent = "Comenzar Búsqueda Masiva (Bloqueado)";
        }
    }
}

function openPaymentModal() {
    if (!currentJobId || amountMxn <= 0) return;

    // Set totals
    paySummaryRows.textContent = `${totalRecords} filas cargadas`;
    paySummaryTotal.textContent = `$${amountMxn.toFixed(2)} MXN`;

    // Ensure form is visible
    paymentFormView.classList.remove("hidden");
    paymentFooterActions.classList.remove("hidden");
    paymentProcessingView.classList.add("hidden");
    paymentSuccessView.classList.add("hidden");

    // Show overlay
    modalPayment.classList.remove("hidden");
}

function closePaymentModal() {
    modalPayment.classList.add("hidden");
    
    // Clear CC Form inputs
    formCcPayment.reset();
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
    if (!currentJobId) return;
    
    // Save job ID in localStorage to allow recovery if tab is closed or reloaded
    localStorage.setItem("currentJobId", currentJobId);

    // Disable file switching during run
    btnChangeFile.setAttribute("disabled", "true");
    
    // Set UI state according to isProcessing
    if (isProcessing) {
        btnPauseProcess.classList.remove("hidden");
        btnResumeProcess.classList.add("hidden");
    } else {
        btnPauseProcess.classList.add("hidden");
        btnResumeProcess.classList.remove("hidden");
    }

    // Establish Server-Sent Events source
    activeEventSource = new EventSource(`/api/process/${currentJobId}`);

    activeEventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.status === "start") {
            appendLog(`[SISTEMA] Canal de comunicación establecido. Sincronizando búsquedas...`, "info");
            // Clear table and store to avoid duplicates on replay/reconnect
            resultsStore = [];
            resultsTableBody.innerHTML = "";
            processedCount = 0;
            updateProgress(0, data.total);
        }
        
        else if (data.status === "searching") {
            reconnectAttempts = 0;
            appendLog(`[BÚSQUEDA] Fila ${data.index}/${totalRecords}: "${data.name}"`, "info");
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
                    // Prevent duplicates in resultsStore just in case
                    if (!resultsStore.some(item => item.cedula === res.cedula && item.cedula !== "-")) {
                        resultsStore.push(rowData);
                        addResultRowToTable(rowData);
                    }
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
            appendLog(`[SEGURIDAD] ¡La API de la SEP ha activado una validación de seguridad! Pausando consultas de forma segura...`, "error");
            pauseScrapingProcess(true); // Open modal
        }
        
        else if (data.status === "completed") {
            isProcessing = false;
            if (activeEventSource) {
                activeEventSource.close();
            }
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
            const glow = document.querySelector(".ambient-glow.bg-blue");
            if (glow) {
                glow.style.background = "radial-gradient(circle, var(--success) 0%, transparent 70%)";
            }
        }
    };

    activeEventSource.onerror = (err) => {
        if (activeEventSource) {
            activeEventSource.close();
        }
        
        // If the process is still marked as active, reconnect indefinitely (resilience to tab suspension)
        if (isProcessing) {
            reconnectAttempts++;
            const backoff = Math.min(3000 + (reconnectAttempts * 1000), 10000);
            appendLog(`[CONEXIÓN] Canal de comunicación interrumpido. Re-conectando en segundo plano en ${Math.round(backoff/1000)}s... (Intento ${reconnectAttempts})`, "warning");
            
            setTimeout(() => {
                if (isProcessing) {
                    startScrapingProcess();
                }
            }, backoff);
        } else {
            appendLog(`[CONEXIÓN] Canal de comunicación cerrado.`, "info");
        }
    };
}

function pauseScrapingProcess(showCaptchaModal = false) {
    if (activeEventSource) {
        activeEventSource.close();
    }
    isProcessing = false;
    
    btnPauseProcess.classList.add("hidden");
    btnResumeProcess.classList.remove("hidden");
    
    if (currentJobId) {
        appendLog(`[PROCESO] Enviando señal de pausa al servidor...`, "info");
        fetch(`/api/pause/${currentJobId}`, { method: "POST" })
        .then(res => {
            if (!res.ok) throw new Error("Error en servidor al pausar.");
            return res.json();
        })
        .then(() => {
            appendLog(`[PAUSA] Consultas pausadas temporalmente en la fila ${processedCount}/${totalRecords}.`, "warning");
        })
        .catch(err => {
            console.error("Error al pausar en servidor:", err);
            appendLog(`[PAUSA] Consultas pausadas localmente, pero falló señal al servidor: ${err.message}`, "warning");
        });
    }

    if (showCaptchaModal) {
        modalCaptcha.classList.remove("hidden");
    }
}

function resumeScrapingProcess() {
    if (!currentJobId) return;
    
    appendLog(`[PROCESO] Enviando señal de reanudación al servidor...`, "info");
    
    fetch(`/api/resume/${currentJobId}`, { method: "POST" })
    .then(res => {
        if (!res.ok) throw new Error("No se pudo reanudar en el servidor.");
        return res.json();
    })
    .then(() => {
        isProcessing = true;
        reconnectAttempts = 0;
        appendLog(`[PROCESO] Reanudando consultas masivas en el servidor...`, "info");
        startScrapingProcess();
    })
    .catch(err => {
        appendLog(`[ERROR] No se pudo reanudar el proceso: ${err.message}`, "error");
    });
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

// recovery of active jobs
function checkActiveJobOnLoad() {
    const savedJobId = localStorage.getItem("currentJobId");
    if (!savedJobId) return;

    appendLog(`[SISTEMA] Buscando tarea activa previa en el servidor: ${savedJobId}...`, "info");

    fetch(`/api/job_status/${savedJobId}`)
    .then(res => {
        if (!res.ok) throw new Error("No se encontró la tarea o expiró.");
        return res.json();
    })
    .then(data => {
        currentJobId = data.job_id;
        totalRecords = data.total_rows;
        amountMxn = data.amount_mxn;
        isPaid = data.paid;
        isAuthorized = data.authorized;
        isStructured = data.structured;

        // Restore file info view
        fileNameDisp.textContent = `Tarea recuperada (${currentJobId})`;
        fileMetaDisp.textContent = `${totalRecords} filas en esta consulta`;
        dropZone.classList.add("hidden");
        uploadedDetails.classList.remove("hidden");

        // Set structure buttons visual states
        if (isStructured) {
            btnStructYes.classList.add("active");
            btnStructNo.classList.remove("active");
            mappingStructured.classList.remove("hidden");
            mappingUnstructured.classList.add("hidden");
        } else {
            btnStructYes.classList.remove("active");
            btnStructNo.classList.add("active");
            mappingStructured.classList.add("hidden");
            mappingUnstructured.classList.remove("hidden");
        }

        // Populate dynamic mapping selectors with placeholder since columns are saved
        if (data.columns && data.columns.length > 0) {
            populateSelectors(data.columns, data.mapped);
        }

        // Enable configs card visually, evaluate billing
        cardConfig.classList.remove("disabled");
        evaluatePaymentStatus();

        // Restore console and results sections
        cardConsole.classList.remove("hidden");
        resultsSection.classList.remove("hidden");

        // Synchronize and render current status
        if (data.status === "processing") {
            isProcessing = true;
            appendLog(`[SISTEMA] Sincronizando tarea activa en ejecución...`, "success");
            startScrapingProcess();
        } else if (data.status === "completed") {
            isProcessing = false;
            appendLog(`[SISTEMA] Tarea finalizada encontrada. Recuperando resultados...`, "success");
            startScrapingProcess();
        } else {
            isProcessing = false;
            btnPauseProcess.classList.add("hidden");
            btnResumeProcess.classList.remove("hidden");
            appendLog(`[SISTEMA] Tarea pausada encontrada. Haz clic en "Reanudar" para continuar.`, "warning");
            // Pull the results processed so far by connecting to the stream once
            startScrapingProcess();
        }
    })
    .catch(err => {
        console.warn("No active job to restore:", err.message);
        localStorage.removeItem("currentJobId");
    });
}

// Monitor page visibility to instantly sync when returning to the tab
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        if (isProcessing && currentJobId) {
            // Check if connection is currently closed or missing
            if (!activeEventSource || activeEventSource.readyState === EventSource.CLOSED) {
                appendLog(`[PAGINA] Aplicación visible. Re-sincronizando progreso con el servidor...`, "info");
                reconnectAttempts = 0;
                startScrapingProcess();
            }
        }
    }
});
