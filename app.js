// app.js - ADMIN: LÓGICA SEGURA Y CORREGIDA

let idCancionEditando = null; 
// Hacemos esta variable global para que el buscador la vea siempre
window.todasLasCancionesAdmin = []; 

// Función de inicio que será llamada por admin.html SOLO si hay permisos
window.iniciarAdmin = function() {
    if(!window.db) { console.error("DB no lista"); return; }
    
    // Carga en tiempo real
    window.db.collection('canciones').orderBy('titulo').onSnapshot(snap => {
        window.todasLasCancionesAdmin = [];
        snap.forEach(doc => {
            window.todasLasCancionesAdmin.push({ id: doc.id, ...doc.data() });
        });
        console.log(`📚 ${window.todasLasCancionesAdmin.length} canciones cargadas.`);
    });
};

// --- MODALES ---
const Modal = {
    element: document.getElementById('customModal'),
    title: document.getElementById('modalTitle'),
    text: document.getElementById('modalText'),
    icon: document.getElementById('modalIcon'),
    btnConfirm: document.getElementById('btnModalConfirm'),
    btnCancel: document.getElementById('btnModalCancel'),
    
    show: function(options) {
        return new Promise((resolve) => {
            this.title.innerText = options.title || 'Atención';
            this.text.innerText = options.text || '';
            this.icon.innerHTML = options.icon || '✨';
            this.btnCancel.style.display = options.type === 'alert' ? 'none' : 'block';
            this.btnConfirm.innerText = options.confirmText || 'Aceptar';
            this.element.classList.add('open');
            const close = (val) => { this.element.classList.remove('open'); resolve(val); };
            this.btnConfirm.onclick = () => close(true);
            this.btnCancel.onclick = () => close(false);
        });
    },
    alert: function(title, text, icon='⚠️') { return this.show({ type: 'alert', title, text, icon }); },
    confirm: function(title, text, icon='🤔') { return this.show({ type: 'confirm', title, text, icon }); }
};

// ==========================================
// 1. GESTIÓN DE CANCIONES
// ==========================================

function guardarCancion() {
    const tituloInput = document.getElementById('titulo');
    if(!tituloInput) return; 

    const titulo = tituloInput.value.trim();
    const artista = document.getElementById('artista').value.trim();
    const tono = document.getElementById('tono').value;
    const bpm = document.getElementById('bpm').value;
    const compas = document.getElementById('compas').value;
    const letra = document.getElementById('letraInput').value;

    if(!titulo || !letra) return Modal.alert('Faltan datos', 'Ingresa Título y Letra.', '📝');

    const btn = document.getElementById('btnSave');
    const txtOriginal = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> ...';
    btn.disabled = true;

    const datos = {
        titulo: titulo,
        artista: artista,
        tonoOriginal: tono,
        bpm: bpm,
        compas: compas,
        letraChordPro: letra,
        busqueda: titulo.toLowerCase() // Ayuda para búsquedas simples
    };

    let promesa;
    if (idCancionEditando) {
        promesa = window.db.collection('canciones').doc(idCancionEditando).update(datos);
    } else {
        datos.fechaCreacion = new Date();
        promesa = window.db.collection('canciones').add(datos);
    }

    promesa.then(() => {
        Modal.alert('Éxito', 'Canción guardada correctamente.', '✅');
        limpiarFormulario();
    }).catch(e => {
        Modal.alert('Error', e.message, '❌');
    }).finally(() => {
        btn.innerHTML = txtOriginal; btn.disabled = false;
    });
}

function eliminarCancion() {
    if (!idCancionEditando) return;
    Modal.confirm("¿Eliminar?", "Esta acción es irreversible.", "🗑️").then(confirmado => {
        if (confirmado) {
            window.db.collection('canciones').doc(idCancionEditando).delete().then(() => {
                Modal.alert('Eliminado', 'La canción ha sido borrada.', '🗑️');
                limpiarFormulario();
            }).catch(e => Modal.alert("Error", e.message, "⚠️"));
        }
    });
}

// ==========================================
// 2. BUSCADOR CORREGIDO
// ==========================================

function buscarParaEditar() {
    const texto = document.getElementById('searchEdit').value.toLowerCase();
    const contenedor = document.getElementById('searchResults');
    
    // Verificamos que ya existan datos cargados
    if (!window.todasLasCancionesAdmin || window.todasLasCancionesAdmin.length === 0) {
        if(texto.length > 2) contenedor.innerHTML = '<div style="padding:10px; color:#666;">Cargando base de datos...</div>';
        return;
    }
    
    if (texto.length < 2) { contenedor.style.display = 'none'; return; }

    const resultados = window.todasLasCancionesAdmin.filter(c => 
        (c.titulo && c.titulo.toLowerCase().includes(texto)) || 
        (c.artista && c.artista.toLowerCase().includes(texto))
    );
    
    if (resultados.length > 0) {
        let html = '';
        resultados.forEach(c => {
            // Escapamos comillas simples para evitar errores en el string del onclick
            const idSeguro = c.id; 
            html += `<div class="search-result-item" onclick="cargarParaEditar('${idSeguro}')">
                        <div style="display:flex; justify-content:space-between; width:100%;">
                            <span><strong>${c.titulo}</strong></span>
                            <span style="font-size:11px; opacity:0.7;">${c.artista}</span>
                        </div>
                     </div>`;
        });
        contenedor.innerHTML = html;
        contenedor.style.display = 'block';
    } else {
        contenedor.style.display = 'none';
    }
}

function cargarParaEditar(id) {
    const cancion = window.todasLasCancionesAdmin.find(c => c.id === id);
    if (!cancion) return;

    document.getElementById('titulo').value = cancion.titulo || '';
    document.getElementById('artista').value = cancion.artista || '';
    document.getElementById('tono').value = cancion.tonoOriginal || '';
    document.getElementById('bpm').value = cancion.bpm || '';
    document.getElementById('compas').value = cancion.compas || '';
    document.getElementById('letraInput').value = cancion.letraChordPro || '';

    idCancionEditando = id;
    
    // Cambiar UI a modo edición
    document.getElementById('formTitle').innerHTML = `<i class="fas fa-edit"></i> Editando: ${cancion.titulo}`;
    document.getElementById('btnSave').innerHTML = `<i class="fas fa-sync"></i> Actualizar`;
    
    // Mostrar botones de cancelar y eliminar
    document.getElementById('btnCancelEdit').style.display = 'block';
    document.getElementById('btnDelete').style.display = 'block';
    
    // Ocultar buscador
    document.getElementById('searchResults').style.display = 'none';
    document.getElementById('searchEdit').value = '';

    actualizarPrevisualizacion(); 
}

function cancelarEdicion() { limpiarFormulario(); }

function limpiarFormulario() {
    idCancionEditando = null;
    document.getElementById('titulo').value = '';
    document.getElementById('artista').value = '';
    document.getElementById('tono').value = '';
    document.getElementById('bpm').value = '';
    document.getElementById('compas').value = '';
    document.getElementById('letraInput').value = '';
    
    document.getElementById('previewArea').innerHTML = '<div style="text-align: center; color: #64748b; margin-top: 100px; opacity: 0.5;"><i class="fas fa-music fa-3x"></i><br><br>Vista previa...</div>';
    
    document.getElementById('formTitle').innerHTML = `<i class="fas fa-pen-fancy"></i> Nueva Canción`;
    document.getElementById('btnSave').innerHTML = `<i class="fas fa-save"></i> Guardar`;
    
    document.getElementById('btnCancelEdit').style.display = 'none';
    document.getElementById('btnDelete').style.display = 'none';
}

// ==========================================
// 3. UTILIDADES (PDF, ETC)
// ==========================================

function insertarSeccion(nombreSeccion) {
    const textarea = document.getElementById('letraInput');
    const etiqueta = `\n${nombreSeccion}\n`;
    const startPos = textarea.selectionStart;
    const endPos = textarea.selectionEnd;
    textarea.value = textarea.value.substring(0, startPos) + etiqueta + textarea.value.substring(endPos);
    textarea.focus();
    actualizarPrevisualizacion();
}

function convertirLaCuerda() {
    const textarea = document.getElementById('letraInput');
    const textoOriginal = textarea.value;
    if(!textoOriginal.trim()) return Modal.alert("Campo vacío", "Primero pega la letra.", "✏️");

    const lineas = textoOriginal.split('\n');
    let textoNuevo = [];
    const esLineaDeAcordes = (texto) => {
        const limpio = texto.trim();
        if (limpio.length === 0) return false;
        const palabras = limpio.split(/\s+/);
        let contador = 0;
        palabras.forEach(p => { if (/^[A-G][b#]?(m|min|maj|dim|aug|sus|add|2|4|5|6|7|9|11|13)*(\/[A-G][b#]?)?$/.test(p)) contador++; });
        return (contador / palabras.length) > 0.5;
    };

    for (let i = 0; i < lineas.length; i++) {
        const lineaActual = lineas[i];
        const lineaSiguiente = lineas[i+1] || "";
        if (esLineaDeAcordes(lineaActual)) {
            if (!esLineaDeAcordes(lineaSiguiente) && lineaSiguiente.trim().length > 0) {
                let lineaFusionada = lineaSiguiente;
                const regexAcorde = /[A-G][^\s]*/g;
                let match;
                let inserciones = [];
                while ((match = regexAcorde.exec(lineaActual)) !== null) { inserciones.push({ acorde: `[${match[0]}]`, posicion: match.index }); }
                inserciones.sort((a,b) => b.posicion - a.posicion);
                inserciones.forEach(ins => {
                    if (ins.posicion >= lineaFusionada.length) { lineaFusionada += " " + ins.acorde; } 
                    else { lineaFusionada = lineaFusionada.slice(0, ins.posicion) + ins.acorde + lineaFusionada.slice(ins.posicion); }
                });
                textoNuevo.push(lineaFusionada); i++; 
            } else { textoNuevo.push(lineaActual.replace(/([A-G][^\s]*)/g, "[$1]")); }
        } else { textoNuevo.push(lineaActual); }
    }
    textarea.value = textoNuevo.join("\n");
    actualizarPrevisualizacion();
    Modal.alert("Listo", "Formato convertido.", "✨");
}

async function procesarPDF() {
    const fileInput = document.getElementById('pdfUpload');
    if (!fileInput.files[0]) return; 
    const label = document.querySelector('label[for="pdfUpload"]');
    let txtOriginal = "";
    if(label) { txtOriginal = label.innerHTML; label.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    try {
        const file = fileInput.files[0];
        const buff = await file.arrayBuffer();
        if(typeof pdfjsLib === 'undefined') throw new Error("Librería PDF no cargada.");
        const pdf = await pdfjsLib.getDocument(buff).promise;
        let full = "";
        for(let i=1; i<=pdf.numPages; i++){
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            let items = content.items.map(it => ({str:it.str, x:it.transform[4], y:it.transform[5]}));
            items.sort((a,b)=>(Math.abs(a.y-b.y)>5)?b.y-a.y:a.x-b.x);
            let lines=[], lastY=-1, cur="";
            items.forEach(it=>{ if(lastY===-1 || Math.abs(it.y-lastY)>5){ if(cur)lines.push(cur); lastY=it.y; cur=it.str; } else cur+=" "+it.str; });
            if(cur)lines.push(cur);
            full += fusionarSimple(lines) + "\n\n";
        }
        document.getElementById('letraInput').value = full;
        actualizarPrevisualizacion();
        fileInput.value = ''; 
    } catch(e){ Modal.alert("Error PDF", e.message, "❌"); } 
    finally { if(label) label.innerHTML = txtOriginal; }
}

function fusionarSimple(lines) {
    let res=[];
    const isCh = t => {
        let w=t.trim().split(/\s+/);
        let c=w.filter(x=>/^[A-G][b#]?(m|7|sus|dim|\/)*$/.test(x));
        return (c.length/w.length)>0.5;
    };
    for(let i=0; i<lines.length; i++) {
        let l=lines[i], n=lines[i+1]||"";
        if(isCh(l) && !isCh(n) && n.trim()) {
            let fus=n, ins=[], reg=/[A-G][^\s]*/g, m;
            while((m=reg.exec(l))!==null) ins.push({c:`[${m[0]}]`, i:m.index});
            ins.sort((a,b)=>b.i-a.i).forEach(x=>{ fus=(x.i>=fus.length)? fus+" "+x.c : fus.slice(0,x.i)+x.c+fus.slice(x.i); });
            res.push(fus); i++;
        } else res.push(l);
    }
    return res.join('\n');
}

// ==========================================
// 4. RENDERIZADO VISUAL
// ==========================================

function actualizarPrevisualizacion() {
    const el = document.getElementById('letraInput');
    if(el) document.getElementById('previewArea').innerHTML = renderizarChordPro(el.value);
}

function detectarSeccionAutomatica(linea) {
    const texto = linea.trim();
    const regexInicio = /^(intro|verso|estrofa|pre-?coro|coro|puente|intermedio|instrumental|final|salida|outro)[\s\w\d\.]*(x\d+)?[:\.]?$/i;
    const match = texto.match(regexInicio);

    if (match) {
        const etiquetaEncontrada = match[0]; 
        const restoDelTexto = texto.substring(etiquetaEncontrada.length).trim();
        if (restoDelTexto.length > 20 && !/intro|intermedio|puente/i.test(etiquetaEncontrada)) return null; 

        let clase = 'tag-verso'; 
        const t = etiquetaEncontrada.toLowerCase();
        if (t.includes('intro')) clase = 'tag-intro';
        else if (t.includes('coro') && !t.includes('pre')) clase = 'tag-coro';
        else if (t.includes('pre')) clase = 'tag-precoro';
        else if (t.includes('puente') || t.includes('intermedio')) clase = 'tag-puente';
        else if (t.includes('final') || t.includes('salida')) clase = 'tag-final';

        let html = `<div class="struct-btn ${clase}">${etiquetaEncontrada.replace(/[:\.]/g, '').toUpperCase()}</div>`;
        if (restoDelTexto.length > 0) {
            const regexAcordes = /(\[[^\]]+\])|([^\[]+)/g;
            let subHtml = '<div class="song-line">';
            let m;
            if (!restoDelTexto.includes('[')) {
                 subHtml += `<div class="chord-group"><div class="chord" style="margin-bottom:5px;">${restoDelTexto}</div></div>`;
            } else {
                while ((m = regexAcordes.exec(restoDelTexto)) !== null) {
                    if (m[1]) subHtml += crearBloque(m[1].replace(/\[|\]/g, ''), '&nbsp;');
                    else if (m[2]) subHtml += crearBloque(null, m[2]);
                }
            }
            subHtml += '</div>';
            html += subHtml;
        } else {
            html += '<div style="height:5px;"></div>';
        }
        return html;
    }
    return null;
}

function renderizarChordPro(texto) {
    if (!texto) return '';
    const lineas = texto.split('\n');
    let html = '';

    lineas.forEach(linea => {
        if (!linea.trim()) { html += '<div class="song-line" style="height:5px;"></div>'; return; }
        const seccionAuto = detectarSeccionAutomatica(linea);
        if (seccionAuto) { html += seccionAuto; return; }

        const regex = /(\[[^\]]+\])|([^\[]+)/g;
        let match;
        let htmlLinea = '<div class="song-line">';
        let bufferAcorde = null;

        while ((match = regex.exec(linea)) !== null) {
            if (match[1]) { 
                if (bufferAcorde) htmlLinea += crearBloque(bufferAcorde, '&nbsp;');
                bufferAcorde = match[1].replace(/\[|\]/g, '');
            } else if (match[2]) { 
                htmlLinea += crearBloque(bufferAcorde || '', match[2]);
                bufferAcorde = null;
            }
        }
        if (bufferAcorde) htmlLinea += crearBloque(bufferAcorde, '');
        html += htmlLinea + '</div>';
    });
    return html;
}

function crearBloque(acorde, letra) {
    return `<div class="chord-group"><div class="chord">${acorde||'&nbsp;'}</div><div class="lyric">${letra}</div></div>`;
}

function irALista() { window.location.href = 'index.html'; }
