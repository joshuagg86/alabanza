document.addEventListener('DOMContentLoaded', () => {
            const passwordInput = document.getElementById('txtPassword');
            if (passwordInput) {
                passwordInput.addEventListener('keyup', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        procesarAutenticacion();
                        precargarTodosLosPads();
                    }
                });
            }
        });
        const ADMIN_EMAILS = ["admin@genesaret.com", "monica@genesaret.com", "joshua@genesaret.com"]; 

        // === VARIABLES GLOBALES (CORREGIDAS SIN DUPLICADOS) ===
        let tabActual = 'home'; // Única declaración inicial
        let listaUsuariosGrupo = [];
        let usuarioActual = null;
        let rolActual = localStorage.getItem('alabanza_rol') || 'voz';
        let rolTemp = null;
        let todasLasCanciones = [];
        let idsEnPlaylist = [];
        let cancionActual = null;
        let semitonos = 0;
        let notasDeLaCancion = {};
        let cancionesListas = false;
        let padsListos = false;
        const NOTAS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

        let listaNavegacionActual = []; 
        let indiceNavegacion = -1;

        // --- SISTEMA NO-SLEEP (Pantalla Encendida) ---
        let wakeLock = null;

        async function activarPantalla() {
            if ('wakeLock' in navigator) {
                try {
                    wakeLock = await navigator.wakeLock.request('screen');
                    console.log('💡 Pantalla mantenida encendida');
                } catch (err) {
                    console.log('Error WakeLock:', err);
                }
            }
        }

        function desactivarPantalla() {
            if (wakeLock !== null) {
                wakeLock.release().then(() => { wakeLock = null; });
                console.log('🌑 Pantalla liberada');
            }
        }

        function togglePasswordVisibility() {
            const passInput = document.getElementById('txtPassword');
            const icon = document.querySelector('.toggle-pass');
            if (passInput.type === 'password') {
                passInput.type = 'text';
                icon.classList.replace('fa-eye', 'fa-eye-slash');
            } else {
                passInput.type = 'password';
                icon.classList.replace('fa-eye-slash', 'fa-eye');
            }
        }

       const Modal = {
            element: document.getElementById('customModal'),
            title: document.getElementById('modalTitle'),
            text: document.getElementById('modalText'),
            input: document.getElementById('modalInput'),
            icon: document.getElementById('modalIcon'),
            btnConfirm: document.getElementById('btnModalConfirm'),
            btnCancel: document.getElementById('btnModalCancel'),
            btnDelete: null, 
            chkBottom: document.getElementById('chkNoteBottom'),
            optionsDiv: document.getElementById('modalOptions'),

            show: function(options) {
                if (!this.btnDelete) {
                    this.btnDelete = document.createElement('button');
                    this.btnDelete.className = 'btn-modal danger';
                    this.btnDelete.style.background = '#ef4444';
                    this.btnDelete.style.color = 'white';
                    this.btnDelete.innerText = 'Eliminar';
                    this.btnConfirm.parentNode.insertBefore(this.btnDelete, this.btnConfirm);
                }

                return new Promise((resolve) => {
                    this.title.innerText = options.title || 'Atención';
                    this.text.innerText = options.text || '';
                    this.icon.innerHTML = options.icon || '✨';
                    
                    if (options.type === 'prompt') {
                        this.input.style.display = 'block';
                        this.optionsDiv.style.display = 'block'; 
                        
                        let rawValue = options.value || '';
                        if (rawValue.startsWith('_')) {
                            this.input.value = rawValue.substring(1); 
                            this.chkBottom.checked = true;
                        } else {
                            this.input.value = rawValue;
                            this.chkBottom.checked = false;
                        }
                        setTimeout(() => this.input.focus(), 100);
                    } else { 
                        this.input.style.display = 'none'; 
                        this.optionsDiv.style.display = 'none';
                    }

                    this.btnCancel.style.display = options.type === 'alert' ? 'none' : 'block';
                    this.btnDelete.style.display = options.showDelete ? 'block' : 'none'; 
                    
                    this.btnConfirm.innerText = options.confirmText || 'Aceptar';
                    this.element.classList.add('open');

                    const close = (val) => { this.element.classList.remove('open'); resolve(val); };

                    this.btnConfirm.onclick = () => { 
                        if (options.type === 'prompt') {
                            const prefix = this.chkBottom.checked ? '_' : '';
                            close(prefix + this.input.value); 
                        } else { 
                            close(true); 
                        }
                    };
                    this.btnCancel.onclick = () => close(false);
                    this.btnDelete.onclick = () => close("__DELETE__"); 
                    
                    this.input.onkeyup = (e) => { if(e.key === 'Enter') this.btnConfirm.click(); };
                });
            },
            alert: function(title, text, icon='⚠️') { return this.show({ type: 'alert', title, text, icon }); },
            confirm: function(title, text, icon='🤔') { return this.show({ type: 'confirm', title, text, icon }); },
            prompt: function(title, text, value='', icon='✏️') { return this.show({ type: 'prompt', title, text, value, icon }); }
        };

        function selectRolTemp(rol, div) {
            rolTemp = rol;
            document.querySelectorAll('.role-option').forEach(b => b.classList.remove('selected'));
            div.classList.add('selected');
        }

        let modoRegistro = false; 

        function alternarModo() {
            modoRegistro = !modoRegistro;
            const titulo = document.getElementById('authTitle');
            const btnMain = document.getElementById('btnMainAuth');
            const btnToggle = document.getElementById('btnToggleAuth');
            const errorDiv = document.getElementById('loginError');
            const roleContainer = document.getElementById('roleSelectorContainer');

            errorDiv.style.display = 'none';

            if (modoRegistro) {
                titulo.innerText = "Crear Cuenta";
                btnMain.innerText = "REGISTRARSE";
                btnMain.style.background = "linear-gradient(135deg, #10b981, #059669)";
                btnToggle.innerText = "¿Ya tienes cuenta? Inicia sesión";
                roleContainer.style.display = 'block'; 
            } else {
                titulo.innerText = "Playlist Music";
                btnMain.innerText = "ENTRAR";
                btnMain.style.background = "linear-gradient(135deg, #6366f1, #4f46e5)";
                btnToggle.innerText = "¿No tienes cuenta? Regístrate";
                roleContainer.style.display = 'none';
            }
        }

        function procesarAutenticacion() {
            if (modoRegistro) registroMejorado(); else loginFirebase();
        }

        function loginFirebase() {
            const email = document.getElementById('txtEmail').value;
            const pass = document.getElementById('txtPassword').value;
            const errDiv = document.getElementById('loginError');
            if(!email || !pass) { errDiv.style.display='block'; errDiv.innerText="Faltan datos"; return; }
            firebase.auth().signInWithEmailAndPassword(email, pass).catch((e) => { errDiv.style.display = 'block'; errDiv.innerText = "Error: " + e.message; });
        }

        function registroMejorado() {
            const email = document.getElementById('txtEmail').value;
            const pass = document.getElementById('txtPassword').value;
            const errDiv = document.getElementById('loginError');
            if(!email || !pass) { errDiv.style.display='block'; errDiv.innerText="Ingresa un correo y contraseña."; return; }
            if(!rolTemp) { errDiv.style.display='block'; errDiv.innerText="Selecciona qué instrumento tocas."; return; }

            firebase.auth().createUserWithEmailAndPassword(email, pass)
                .then((cred) => {
                    return db.collection('usuarios').doc(cred.user.uid).set({ rol: rolTemp, email: email });
                })
                .then(() => { localStorage.setItem('alabanza_rol', rolTemp); })
                .catch((e) => { errDiv.style.display = 'block'; errDiv.innerText = "Error al registrar: " + e.message; });
        }

        function cerrarSesion() {
            Modal.confirm("¿Salir?", "¿Cerrar sesión actual?", "👋").then(res => { 
                if(res) {
                    const splash = document.getElementById('splashScreen');
                    if(splash) { splash.style.display = 'flex'; splash.style.opacity = '1'; }
                    firebase.auth().signOut().then(() => location.reload()); 
                }
            });
        }
modalRol
        function mostrarSelectorRol() {
            document.getElementById('modalCambioRol').style.display = 'flex';
        }

        function guardarNuevoRol(nuevoRol) {
            if(!usuarioActual) return;
            rolActual = nuevoRol;
            localStorage.setItem('alabanza_rol', nuevoRol);
            actualizarBadgeUsuario(usuarioActual, nuevoRol);
            aplicarRol();
            document.getElementById('modalCambioRol').style.display = 'none';

            db.collection('usuarios').doc(usuarioActual.uid).set({
                rol: nuevoRol,
                email: usuarioActual.email
            }, { merge: true }).then(() => {
                console.log("Rol guardado exitosamente");
            });
        }

        firebase.auth().onAuthStateChanged(user => {
            if (user) {
                usuarioActual = user;
                document.getElementById('loginModal').style.display = 'none';
                
                const splash = document.getElementById('splashScreen');
                const logo = document.getElementById('splashLogo');
                const loader = document.getElementById('splashLoader');
                
                splash.style.display = 'flex';
                setTimeout(() => {
                    if(logo) logo.classList.add('animate-splash');
                    if(loader) loader.style.opacity = "1";
                }, 100);

                db.collection('usuarios').doc(user.uid).get().then(doc => {
                    if (doc.exists && doc.data().rol) {
                        rolActual = doc.data().rol;
                        localStorage.setItem('alabanza_rol', rolActual);
                    }
                    actualizarBadgeUsuario(user, rolActual);
                    aplicarRol();
                    cargarDatosApp();

                    setTimeout(() => { 
                        cambiarTab('home'); 
                    }, 500);

                    setTimeout(() => {
                        if(splash) {
                            splash.style.opacity = "0";
                            splash.style.transition = "opacity 0.5s ease";
                            setTimeout(() => { splash.style.display = 'none'; }, 500);
                        }
                    }, 2000); 
                });

                if (ADMIN_EMAILS.includes(user.email)) {
                    const btnAdmin = document.getElementById('btnAdmin');
                    if(btnAdmin) btnAdmin.style.display = 'flex';
                }
            } else {
                document.getElementById('loginModal').style.display = 'flex';
                const splash = document.getElementById('splashScreen');
                if(splash) splash.style.display = 'none';
            }
        });

        function actualizarBadgeUsuario(user, rol) {
            const rolesIcons = { 'bateria': '<i class="fas fa-drum"></i>', 'voz': '<i class="fas fa-microphone"></i>', 'guitarra': '<i class="fas fa-guitar"></i>', 'teclado': '<i class="fas fa-keyboard"></i>' };
            const icon = rolesIcons[rol] || '<i class="fas fa-user"></i>';
            const nombreDisplay = user.email.split('@')[0].toUpperCase();
            document.getElementById('displayUserBadge').innerHTML = `${icon} <span style="margin-left: 8px;">${nombreDisplay}</span>`;
        }

        let primeraCargaCanciones = true; // Variable de control

       function cargarDatosApp() {

            // 1. Escuchar Canciones en tiempo real
            db.collection('canciones').orderBy('titulo').onSnapshot({ includeMetadataChanges: true }, snap => {
                cancionesListas = snap.metadata.fromCache;
                verificarEstadoTotal();

                todasLasCanciones = [];
                snap.forEach(doc => { todasLasCanciones.push({ id: doc.id, ...doc.data() }); });
                renderizarLista();
                

                if (primeraCargaCanciones) {
                    primeraCargaCanciones = false;
                    const params = new URLSearchParams(window.location.search);
                    const songId = params.get('song');
                    if (songId) setTimeout(() => abrirCancion(songId), 100);
                }
            });

            // 2. Escuchar Notas Personales (Solo si hay un usuario firmado)
            if (usuarioActual) {
                db.collection('notas_personales')
                .where('usuarioEmail', '==', usuarioActual.email)
                .onSnapshot({ includeMetadataChanges: true }, snap => {
                    console.log("📝 Notas personales sincronizadas");
                    if (snap.metadata.fromCache) {
                        cancionesListas = true;
                        verificarEstadoTotal();
                    }
                });
            }

            // 3. Escuchar la Playlist Semanal del Domingo
            db.collection('configuracion').doc('playlist_semanal').onSnapshot(doc => {
                idsEnPlaylist = doc.exists ? (doc.data().canciones || []) : [];
                renderizarLista();
            });

            // 4. Escuchar Colección de Usuarios del Grupo en tiempo real
            db.collection('usuarios').onSnapshot(snap => {
                listaUsuariosGrupo = [];
                snap.forEach(doc => {
                    // Guardamos tanto el ID del documento como sus datos internos
                    listaUsuariosGrupo.push({ id: doc.id, ...doc.data() });
                });
                console.log(`👥 Se cargaron ${listaUsuariosGrupo.length} usuarios en tiempo real.`);
                
                // Poblamos el selector inmediatamente al recibir los datos
                cargarUsuariosEnSelector();
            });
        }

        function cambiarTab(tab) {
            tabActual = tab;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            
            // Elementos a controlar del DOM
            const listContainer = document.getElementById('songList');
            const searchContainer = document.querySelector('.search-container');
            const rolContainer = document.getElementById('viewRolContent');
            const dashContainer = document.getElementById('viewDashboard');

            // Apagamos todo por defecto
            listContainer.style.display = 'none';
            searchContainer.style.display = 'none';
            rolContainer.style.display = 'none';
            if(dashContainer) dashContainer.style.display = 'none';

            if (tab === 'home') {
                document.getElementById('tabHome').classList.add('active');
                if(dashContainer) dashContainer.style.display = 'block';
                renderizarDashboard(); // Refresca contadores y fechas del líder
            } else if (tab === 'rol') {
                document.getElementById('tabRol').classList.add('active');
                rolContainer.style.display = 'block';
                cargarRolServicio(); 
            } else {
                listContainer.style.display = 'flex';
                searchContainer.style.display = 'block';
                if(tab === 'all') document.getElementById('tabAll').classList.add('active');
                else document.getElementById('tabPlaylist').classList.add('active');
                renderizarLista();
            }
        }
        async function cargarRolServicio() {
            const container = document.getElementById('rolListaContainer');
            const btnNuevo = document.getElementById('btnNuevoRol');
            
            // 1. Mostrar botón si es Admin
            if (usuarioActual && ADMIN_EMAILS.includes(usuarioActual.email)) {
                btnNuevo.style.display = 'block';
            }

            // 2. Traer roles del mes (desde hoy en adelante)
            const hoy = new Date().toISOString().split('T')[0];
            
            db.collection('roles')
            .where('fecha', '>=', hoy)
            .orderBy('fecha', 'asc')
            .onSnapshot(snap => {
                if (snap.empty) {
                    container.innerHTML = "<p style='text-align:center; color:#666; margin-top:50px;'>No hay fechas programadas aún.</p>";
                    return;
                }
                
                let html = '';
                snap.forEach(doc => {
                    const d = doc.data();
                    const id = doc.id;
                    const opcionesAdmin = (ADMIN_EMAILS.includes(usuarioActual.email)) ? 
                        `<i class="fas fa-trash" style="color:#ef4444; cursor:pointer;" onclick="eliminarRol('${id}', event)"></i>` : '';

                    html += `
                        <div class="card" style="margin-bottom:15px; background: rgba(255,255,255,0.03);">
                            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #333; padding-bottom:10px; margin-bottom:15px;">
                                <span style="color:var(--accent-glow); font-weight:700; text-transform:capitalize;">
                                    <i class="fas fa-calendar-day"></i> ${new Date(d.fecha + "T00:00:00").toLocaleDateString('es-MX', {weekday:'short', day:'numeric', month:'short'})}
                                </span>
                                ${opcionesAdmin}
                            </div>
                            <div class="rol-row"><strong>Dirección:</strong> <span>${d.direccion}</span></div>
                            <div class="rol-row"><strong>Coro 1:</strong> <span>${d.coro1}</span></div>
                            <div class="rol-row"><strong>Coro 2:</strong> <span>${d.coro2}</span></div>
                        </div>
                    `;
                });
                container.innerHTML = html;
            });
        }

        function renderizarLista() {
            const lista = document.getElementById('songList');
            const searchContainer = document.querySelector('.search-container');
            const inputBusqueda = document.getElementById('searchInput');

            // Controlamos visibilidad de contenedores del repertorio según la pestaña
            if (tabActual === 'home') {
                if (lista) lista.style.display = 'none';
                if (searchContainer) searchContainer.style.display = 'none';
            } else {
                if (lista) lista.style.display = 'flex';
                if (searchContainer) searchContainer.style.display = 'block';
            }

            if (!lista) return;
            
            // Evitamos que truene si el input de búsqueda aún no se monta en el DOM
            const busqueda = inputBusqueda ? inputBusqueda.value.toLowerCase() : "";
            let html = '';
            
            let cancionesAMostrar = todasLasCanciones;
            if (tabActual === 'playlist') {
                cancionesAMostrar = idsEnPlaylist.map(id => todasLasCanciones.find(c => c.id === id)).filter(c => c);
            }
            
            cancionesAMostrar = cancionesAMostrar.filter(c => c.titulo.toLowerCase().includes(busqueda));

            if (cancionesAMostrar.length === 0) { 
                lista.innerHTML = '<div style="text-align:center; padding:40px; color:#555;">No hay canciones</div>'; 
                return; 
            }

            cancionesAMostrar.forEach(c => {
                const enPlaylist = idsEnPlaylist.includes(c.id);
                
                let btnAccion = tabActual === 'all' ? 
                    (enPlaylist ? `<div class="action-btn btn-add added" onclick="togglePlaylist('${c.id}', event)"><i class="fas fa-check"></i></div>` : `<div class="action-btn btn-add" onclick="togglePlaylist('${c.id}', event)"><i class="fas fa-plus"></i></div>`) :
                    `<div class="action-btn btn-remove" onclick="togglePlaylist('${c.id}', event)"><i class="fas fa-minus"></i></div>`;

                let btnEliminarAdmin = '';
                if (tabActual === 'all' && usuarioActual && ADMIN_EMAILS.includes(usuarioActual.email)) {
                    btnEliminarAdmin = `
                        <div class="action-btn" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; margin-right: 8px;" 
                            onclick="eliminarCancionDirecto('${c.id}', '${c.titulo.replace(/'/g, "\\'")}', event)">
                            <i class="fas fa-trash"></i>
                        </div>`;
                }

                const dragHandle = tabActual === 'playlist' ? `<div class="drag-handle"><i class="fas fa-grip-lines"></i></div>` : ''; 

                html += `
                <li class="song-item" data-id="${c.id}" onclick="abrirCancion('${c.id}')">
                    ${dragHandle} 
                    <div class="song-info">
                        <h3>${c.titulo}</h3>
                        <div><span class="song-meta-badge">${c.tonoOriginal||'?'}</span><span class="song-artist">${c.artista||''}</span></div>
                    </div>
                    <div style="display:flex; align-items:center;">
                        ${btnEliminarAdmin}
                        ${btnAccion}
                    </div>
                </li>`;
            });
            
            lista.innerHTML = html;
            if (tabActual === 'playlist') inicializarArrastre();
        }

        function togglePlaylist(id, event) {
            event.stopPropagation();
            let nuevaLista = [...idsEnPlaylist];
            if (nuevaLista.includes(id)) nuevaLista = nuevaLista.filter(x => x !== id);
            else nuevaLista.push(id);
            db.collection('configuracion').doc('playlist_semanal').set({ canciones: nuevaLista }, { merge: true });
        }

        function abrirCancion(id) {
            const busqueda = document.getElementById('searchInput').value.toLowerCase();
            let contextoCanciones = [];

            if (tabActual === 'playlist') {
                contextoCanciones = idsEnPlaylist
                    .map(playlistId => todasLasCanciones.find(c => c.id === playlistId))
                    .filter(c => c !== undefined); 
            } else {
                contextoCanciones = todasLasCanciones;
            }

            if(busqueda) {
                contextoCanciones = contextoCanciones.filter(c => c.titulo.toLowerCase().includes(busqueda));
            }

            listaNavegacionActual = contextoCanciones.map(c => c.id);
            indiceNavegacion = listaNavegacionActual.indexOf(id);

            actualizarVistaCancion(id);
            const nuevaUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + "?song=" + id;
            window.history.pushState({ path: nuevaUrl }, '', nuevaUrl);
        }

        function navegarCancion(direccion) {
            const nuevoIndice = indiceNavegacion + direccion;
            if (nuevoIndice >= 0 && nuevoIndice < listaNavegacionActual.length) {
                indiceNavegacion = nuevoIndice;
                const nuevoId = listaNavegacionActual[nuevoIndice];
                document.getElementById('songContent').style.opacity = 0.5;
                setTimeout(() => {
                    actualizarVistaCancion(nuevoId);
                    document.getElementById('songContent').style.opacity = 1;
                }, 150);
            }
            activarPantalla();
        }

        function cargarNotasYRenderizar() {
            document.getElementById('songContent').innerHTML = '<div style="text-align:center; padding:100px; color:#555;">Cargando...</div>';
            if(!usuarioActual) return;
            const docId = usuarioActual.uid + "_" + cancionActual.id;
            db.collection('notas_personales').doc(docId).get().then(doc => {
                notasDeLaCancion = doc.exists ? (doc.data().notas || {}) : {};
                renderizarLetra();
            }).catch(() => { notasDeLaCancion = {}; renderizarLetra(); });
        }

        function guardarNotaEnNube(index, texto) {
            if (!usuarioActual || !cancionActual) return;
            const docId = usuarioActual.uid + "_" + cancionActual.id;
            const ref = db.collection('notas_personales').doc(docId);
            if (texto === null || texto === "") {
                delete notasDeLaCancion[index];
                ref.set({
                    notas: { [index]: firebase.firestore.FieldValue.delete() }
                }, { merge: true }).then(() => {
                    renderizarLetra();
                });
            } else {
                notasDeLaCancion[index] = texto;
                ref.set({
                    usuarioEmail: usuarioActual.email,
                    cancionId: cancionActual.id, 
                    notas: notasDeLaCancion
                }, { merge: true }).then(() => {
                    renderizarLetra();
                });
            }
        }

        function agregarNota(index) {
            const valorActual = notasDeLaCancion[index] || '';
            const esNueva = !valorActual;
            Modal.show({
                type: 'prompt',
                title: esNueva ? "Nueva Nota" : "Editar Nota",
                text: "Escribe un recordatorio para esta línea:",
                value: valorActual,
                icon: "📝",
                showDelete: !esNueva 
            }).then(resultado => {
                if (resultado === "__DELETE__") {
                    guardarNotaEnNube(index, null); 
                } else if (resultado !== false) {
                    guardarNotaEnNube(index, resultado.trim());
                }
            });
        }
        function editarNota(index, e) { e.stopPropagation(); agregarNota(index); }
        
        function aplicarRol() {
            const btnIcon = document.querySelector('#btnToggleChords i');
            const fabContainer = document.querySelector('.fab-container');
            if (rolActual === 'bateria' || rolActual === 'voz') {
                document.body.classList.add('hide-chords');
                if(btnIcon) btnIcon.className = "fas fa-eye";
                if(fabContainer) fabContainer.style.display = 'none';
            } else {
                document.body.classList.remove('hide-chords');
                if(btnIcon) btnIcon.className = "fas fa-eye-slash";
                if(fabContainer) fabContainer.style.display = 'flex';
            }
        }

        function alternarAcordes() {
            document.body.classList.toggle('hide-chords');
            const btnIcon = document.querySelector('#btnToggleChords i');
            btnIcon.className = document.body.classList.contains('hide-chords') ? "fas fa-eye" : "fas fa-eye-slash";
        }

        function detectarSeccionAutomatica(linea) {
            const texto = linea.trim();
            const regexInicio = /^(intro|verso|estrofa|pre-?coro|coro|puente|intermedio|instrumental|final|salida|outro)[\s\w\d\.]*(x\d+)?[:\.]?$/i;
            const match = texto.match(regexInicio);
            if (match) {
                let clase = 'tag-verso'; 
                const t = match[0].toLowerCase();
                if (t.includes('intro')) clase = 'tag-intro';
                else if (t.includes('coro') && !t.includes('pre')) clase = 'tag-coro';
                else if (t.includes('pre')) clase = 'tag-precoro';
                else if (t.includes('puente')) clase = 'tag-puente';
                else if (t.includes('final')) clase = 'tag-final';
                return `<div class="struct-btn ${clase}">${match[0].replace(/[:\.]/g, '').toUpperCase()}</div><div class="song-line">${parsearAcordes(texto.substring(match[0].length))}</div>`;
            }
            return null;
        }

        function parsearAcordes(txt) {
            if(!txt.trim()) return '';
            const regex = /(\[[^\]]+\])|([^\[]+)/g;
            let m, html = '';
            while ((m = regex.exec(txt)) !== null) {
                if(m[1]) html += `<div class="chord-group"><div class="chord">${m[1].replace(/\[|\]/g,'')}</div><div class="lyric">&nbsp;</div></div>`;
                else html += `<div class="chord-group"><div class="chord">&nbsp;</div><div class="lyric">${m[2]}</div></div>`;
            }
            return html;
        }

        function renderizarLetra() {
            if (!cancionActual) return;
            let texto = cancionActual.letraChordPro;
            if (semitonos !== 0) { 
                texto = texto.replace(/\[(.*?)\]/g, (m, ac) => { 
                    const p = ac.split('/'); 
                    let r = cn(p[0], semitonos); 
                    if(p[1]) r += '/' + cn(p[1], semitonos); 
                    return `[${r}]`; 
                }); 
            }
            const lineas = texto.split('\n'); 
            let htmlFinal = '';
            let bloqueActual = ''; 
            let bloqueOcultoParaBateriaVoz = false;
            let bloqueOcultoParaGuitarraTeclado = false;

            lineas.forEach((linea, idx) => {
                let contenidoParaRenderizar = linea.trim(); 
                if (contenidoParaRenderizar.includes('[INICIO-SOLO-GT]')) { bloqueOcultoParaBateriaVoz = true; return; }
                if (contenidoParaRenderizar.includes('[FIN-SOLO-GT]')) { bloqueOcultoParaBateriaVoz = false; return; }
                if (contenidoParaRenderizar.includes('[INICIO-REPETICION]')) { bloqueOcultoParaGuitarraTeclado = true; return; }
                if (contenidoParaRenderizar.includes('[FIN-REPETICION]')) { bloqueOcultoParaGuitarraTeclado = false; return; }

                if (bloqueOcultoParaBateriaVoz && (rolActual === 'bateria' || rolActual === 'voz')) return;
                if (bloqueOcultoParaGuitarraTeclado && (rolActual === 'guitarra' || rolActual === 'teclado')) return;

                if (contenidoParaRenderizar.includes('[REPETICION]')) {
                    if (rolActual !== 'bateria' && rolActual !== 'voz') return;
                    contenidoParaRenderizar = contenidoParaRenderizar.replace('[REPETICION]', '').trim();
                }
                if (contenidoParaRenderizar.includes('[SOLO-G-T]')) {
                    if (rolActual === 'bateria' || rolActual === 'voz') return;
                    contenidoParaRenderizar = contenidoParaRenderizar.replace('[SOLO-G-T]', '').trim();
                }

                const esTituloSeccion = detectarSeccionAutomatica(contenidoParaRenderizar);
                if (esTituloSeccion && bloqueActual !== '') {
                    htmlFinal += `<div class="section-block">${bloqueActual}</div>`;
                    bloqueActual = '';
                }

                const rawNota = notasDeLaCancion[idx] || '';
                let isBottom = false;
                let textoNotaLimpio = rawNota;
                if (rawNota.startsWith('_')) {
                    isBottom = true;
                    textoNotaLimpio = rawNota.substring(1);
                }

                let htmlNota = textoNotaLimpio ? `<div class="note-card" onclick="editarNota(${idx}, event)">${textoNotaLimpio}</div>` : '';
                let htmlLinea = '';
                
                if (esTituloSeccion) { 
                    htmlLinea = `<div style="break-after: avoid; margin-bottom: 2px;">${esTituloSeccion}</div>`; 
                } else if (!contenidoParaRenderizar) { 
                    const alturaVacia = (rolActual === 'bateria' || rolActual === 'voz') ? '0px' : '8px';
                    htmlLinea = `<div class="song-line empty-line" style="height:${alturaVacia};"></div>`;
                } else {
                    const rx = /(\[[^\]]+\])|([^\[\n]+)/g; 
                    let cl = ''; let buf = null; let m;
                    while ((m = rx.exec(contenidoParaRenderizar)) !== null) {
                        if (m[1]) { 
                            if (buf) cl += bl(buf, '\u00A0'); 
                            buf = m[1].replace(/[\[\]]/g, ''); 
                        } else if (m[2]) {
                            const rawText = m[2];
                            if (buf && /^\s+$/.test(rawText)) {
                                cl += bl(buf, '\u00A0');
                                const espaciosReales = rawText.replace(/ /g, '\u00A0');
                                cl += bl('', espaciosReales);
                                buf = null;
                            } else {
                                const textoProcesado = rawText.replace(/ /g, '\u00A0');
                                cl += bl(buf || '', textoProcesado); 
                                buf = null; 
                            }
                        }
                    }
                    if (buf) cl += bl(buf, '\u00A0');
                    htmlLinea = `<div class="song-line">${cl}</div>`;
                }

                let contenidoWrapper = isBottom ? htmlLinea + htmlNota : htmlNota + htmlLinea;
                bloqueActual += `<div class="line-wrapper" data-index="${idx}" oncontextmenu="return false;">${contenidoWrapper}</div>`;
            });

            if (bloqueActual !== '') { htmlFinal += `<div class="section-block">${bloqueActual}</div>`; }
            const container = document.getElementById('songContent');
            container.innerHTML = htmlFinal;
            container.scrollTop = 0;

            if (rolActual === 'bateria' || rolActual === 'voz') {
                container.classList.add('lyrics-cols-bate');
                container.style.width = "100%"; 
            } else {
                container.classList.remove('lyrics-cols-bate');
                container.style.width = ""; 
            }
        }
        function bl(a, l) { return `<div class="chord-group"><div class="chord">${a || '&nbsp;'}</div><div class="lyric">${(l === '' || l === undefined) ? '&nbsp;' : l}</div></div>`; }
        function editarCancionActual() { if (!cancionActual) return; window.location.href = `admin.html?edit=${cancionActual.id}`; }
        
        function toggleTransposer(event) {
            if(event) event.stopPropagation();
            const p = document.getElementById('transposerPanel');
            p.style.display = (p.style.display === 'flex') ? 'none' : 'flex';
        }
        function transponer(d) { semitonos += d; renderizarLetra(); }
        function resetTono() { semitonos=0; renderizarLetra(); }
        function cn(n, d) { let no=n.trim(), r=no.substring(0,1), s=no.substring(1); if(no.length>1&&(no[1]=='#'||no[1]=='b')){r=no.substring(0,2);s=no.substring(2);} const b={'Db':'C#','Eb':'D#','Gb':'F#','Ab':'G#','Bb':'A#'}; if(b[r])r=b[r]; let i=NOTAS.indexOf(r); if(i===-1)return no; let ni=(i+d)%12; if(ni<0)ni+=12; return NOTAS[ni]+s; }
        
        let sortableInstance = null;
        function inicializarArrastre() {
            const el = document.getElementById('songList');
            if (!el || typeof Sortable === 'undefined') return;
            if (sortableInstance) { sortableInstance.destroy(); sortableInstance = null; }
            sortableInstance = Sortable.create(el, {
                handle: '.drag-handle', animation: 200, ghostClass: 'sortable-ghost', delay: 0,
                onEnd: function () {
                    const nuevoOrden = Array.from(el.querySelectorAll('.song-item')).map(item => item.dataset.id);
                    db.collection('configuracion').doc('playlist_semanal').set({ canciones: nuevoOrden, ultimaEdicion: new Date() }, { merge: true });
                }
            });
        }

        // --- SISTEMA DE LONG PRESS ---
        let pressTimer;
        const LONG_PRESS_DURATION = 800;
        document.addEventListener('touchstart', handleTouchStart, { passive: false });
        document.addEventListener('touchend', handleTouchEnd);
        document.addEventListener('touchmove', handleTouchMove); 
        document.addEventListener('mousedown', handleTouchStart);
        document.addEventListener('mouseup', handleTouchEnd);

        function handleTouchStart(e) {
            const target = e.target.closest('.line-wrapper');
            const esNota = e.target.classList.contains('note-card');
            if (esNota) return; 
            if (target) {
                pressTimer = setTimeout(() => {
                    const idx = target.getAttribute('data-index');
                    if (navigator.vibrate) navigator.vibrate(50);
                    agregarNota(parseInt(idx));
                }, LONG_PRESS_DURATION);
            }
        }
        function handleTouchEnd(e) { clearTimeout(pressTimer); }
        function handleTouchMove(e) { clearTimeout(pressTimer); }

        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(err => console.log('Error SW:', err)); });
        }
        
        document.addEventListener('click', function(event) {
            const panel = document.getElementById('transposerPanel');
            const btn = document.getElementById('btnTransposerToggle');
            const rack = document.getElementById('audioDock');
            const btnToggle = document.getElementById('btnToggleAudio');
            
            // 1. Cerrar Transpositor de tonos (Solo si existe en el DOM)
            if (panel && panel.style.display === 'flex') {
                if (!panel.contains(event.target) && (!btn || !btn.contains(event.target))) {
                    panel.style.display = 'none';
                }
            }
            
            // 2. Cerrar Módulo Audio Rack (Pads/Metrónomo) si hacen clic afuera
            if (rack && rack.classList.contains('show-rack')) {
                if (!rack.contains(event.target) && (!btnToggle || !btnToggle.contains(event.target))) {
                    rack.classList.remove('show-rack');
                }
            }
            
            // 3. Cerrar popups de volumen al hacer click fuera
            if (!event.target.closest('.vol-toggle-container')) {
                document.querySelectorAll('.vol-popup').forEach(p => p.classList.remove('show'));
                document.querySelectorAll('.bar-btn-icon').forEach(b => b.classList.remove('active'));
            }
        });


/* ===========================================================
   MOTOR DE AUDIO PRO V3 (CORREGIDO Y UNIFICADO)
   =========================================================== */
let audioCtx = null;

// Variables Metrónomo
let isMetronomeOn = false;
let isSubdivisionOn = false; // Variable para el botón 1/8
let metronomeTimerID = null;
let nextNoteTime = 0.0;
let currentBpm = 120;
let beatsPerMeasure = 4;
let currentBeat = 0;
let scheduleAheadTime = 0.1;
let lookahead = 25.0;

// Variables Pads
let isPadOn = false;
let currentPadKey = 'C';
let activeSource = null;    
let activeGain = null;      
let fadingSource = null;    
let fadingGain = null;

const FILE_PREFIX = "pads/"; 
const FILE_EXT = ".mp3";

function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

// --- LÓGICA DE SUBDIVISIÓN (BOTÓN 1/8) ---
function toggleSubdivision() {
    isSubdivisionOn = !isSubdivisionOn;
    const btn = document.getElementById('btnSubdivision');
    
    if (isSubdivisionOn) {
        btn.classList.add('active');
        btn.innerText = "1/8"; // Muestra corcheas
    } else {
        btn.classList.remove('active');
        btn.innerText = "1/4"; // Muestra negras
    }
    
    // Si el metrónomo está prendido, reiniciamos para que el cambio se note al instante
    if (isMetronomeOn) {
        toggleMetronome(); // Apaga
        toggleMetronome(); // Prende
    }
}

function toggleMetronome() {
    initAudio();
    isMetronomeOn = !isMetronomeOn;
    const btn = document.getElementById('btnMetronomeDock');
    if (isMetronomeOn) {
        btn.classList.add('active');
        btn.innerHTML = '<i class="fas fa-stop"></i>';
        currentBeat = 0; 
        nextNoteTime = audioCtx.currentTime;
        scheduler();
    } else {
        btn.classList.remove('active');
        btn.innerHTML = '<i class="fas fa-play"></i>';
        clearTimeout(metronomeTimerID);
    }
}

function nextNote() {
    const secondsPerBeat = 60.0 / currentBpm;
    // Si está activa la subdivisión, el tiempo avanza la mitad (0.5)
    const factor = isSubdivisionOn ? 0.5 : 1;
    
    nextNoteTime += secondsPerBeat * factor;
    currentBeat += factor;

    if (currentBeat >= beatsPerMeasure) {
        currentBeat = 0;
    }
}

function scheduleNote(time) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    // --- SONIDOS DIFERENTES ---
    // 1. Beat 1 (Fuerte - TIC)
    if (currentBeat === 0) {
        osc.frequency.value = 1500; 
        gain.gain.value = 1;
    } 
    // 2. Subdivisión (Contratiempo - tuc suave)
    // Detectamos decimales (ej: 0.5, 1.5)
    else if (currentBeat % 1 !== 0) {
        osc.frequency.value = 800; 
        osc.type = 'sine'; // Onda suave
        gain.gain.value = 0.3; // Volumen bajo
    } 
    // 3. Beats normales (2, 3, 4 - tac)
    else {
        osc.frequency.value = 1000; 
        gain.gain.value = 0.7; 
    }

    const masterVol = document.getElementById('metroVolumeSlider').value;
    gain.gain.setValueAtTime(gain.gain.value * masterVol, time);
    
    // Evitar "pop" al final del sonido
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    osc.start(time);
    osc.stop(time + 0.05);

    // --- LED VISUAL (Solo en tiempos enteros) ---
    if (currentBeat % 1 === 0) {
        const drawTime = (time - audioCtx.currentTime) * 1000;
        setTimeout(() => {
            const led = document.getElementById('tempoLed');
            if(led) {
                led.classList.add('flash');
                led.style.backgroundColor = currentBeat === 0 ? '#00ff00' : '#444'; // Verde en el 1
                setTimeout(() => {
                    led.classList.remove('flash');
                    led.style.backgroundColor = '#333';
                }, 50);
            }
        }, Math.max(0, drawTime));
    }
}

function scheduler() {
    while (nextNoteTime < audioCtx.currentTime + scheduleAheadTime) {
        scheduleNote(nextNoteTime);
        nextNote();
    }
    metronomeTimerID = setTimeout(scheduler, lookahead);
}

function updateBpm(val) { currentBpm = parseInt(val); }
function updateTimeSig(val) { beatsPerMeasure = parseInt(val); currentBeat = 0; }

function togglePad() { 
    initAudio(); // ¡Faltaba esto! Es lo que "despierta" el motor de audio
    isPadOn = !isPadOn; 
    const capsule = document.getElementById('padCapsule'); 
    const btn = document.getElementById('padTriggerBtn');
    const select = document.getElementById('padKeySelect');

    if(isPadOn) { 
        capsule.classList.add('active'); 
        currentPadKey = select.value; // ¡Faltaba asignar el tono antes de tocar!
        // Mostramos el texto visual de la opción (C#)
        btn.innerHTML = select.options[select.selectedIndex].text;
        playPadFile(currentPadKey); 
    } else { 
        capsule.classList.remove('active'); 
        // Volvemos al ícono cuando se apaga
        btn.innerHTML = '<i class="fas fa-music"></i>';
        stopPadSmoothly(); 
    } 
}

function manualPadChange(k) { 
    currentPadKey = k; 
    const btn = document.getElementById('padTriggerBtn');
    const select = document.getElementById('padKeySelect');

    if(isPadOn) { 
        btn.innerHTML = select.options[select.selectedIndex].text;
        playPadFile(k); 
    } 
}
/* ===========================================================
   MOTOR DE AUDIO OPTIMIZADO (CACHE & QUICK CROSSFADE)
   =========================================================== */
   
// Nueva variable para guardar los audios ya descargados
const padBufferCache = {}; 

async function playPadFile(key) {
    initAudio(); // Aseguramos que el motor esté activo
    const fileName = FILE_PREFIX + encodeURIComponent(key) + FILE_EXT;
    
    try {
        let audioBuffer;

        // 1. VERIFICAR SI YA ESTÁ EN CACHÉ
        if (padBufferCache[key]) {
            audioBuffer = padBufferCache[key];
        } else {
            const response = await fetch(fileName);
            if (!response.ok) throw new Error("No pad: " + fileName);
            const arrayBuffer = await response.arrayBuffer();
            audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            padBufferCache[key] = audioBuffer;
        }

        // --- MEJORA PRO: Si la nueva canción tiene el MISMO tono, no cortamos el audio ---
        if (activeSource && activeSource.key === key) return;

        if (activeSource) fadeOutOldSource(activeSource, activeGain);

        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.loop = true; 
        source.key = key; // Etiquetamos la pista actual con su tono

        const gainNode = audioCtx.createGain();
        const masterVol = parseFloat(document.getElementById('padVolumeSlider').value);
        
        // Anclamos en 0 el inicio del nuevo pad
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        source.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        source.start(0);
        
        // 2. CROSSFADE MÁS SUAVE (1.5s)
        gainNode.gain.linearRampToValueAtTime(masterVol, audioCtx.currentTime + 1.5);

        activeSource = source;
        activeGain = gainNode;
    } catch (error) {
        console.error("Error en Pad:", error);
        const textBtn = document.getElementById('padTriggerBtn');
        if(textBtn) textBtn.innerText = "Err";
        isPadOn = false;
        document.getElementById('padCapsule').classList.remove('active');
    }
}

// 3. AJUSTE EN EL FADEOUT (Crossfade perfecto)
function fadeOutOldSource(source, gainNode) {
    if (fadingSource) { try { fadingSource.stop(); } catch(e){} }
    fadingSource = source;
    fadingGain = gainNode;
    
    // Cancelamos cualquier cambio previo y "anclamos" el volumen actual
    fadingGain.gain.cancelScheduledValues(audioCtx.currentTime);
    fadingGain.gain.setValueAtTime(fadingGain.gain.value, audioCtx.currentTime);
    
    // Bajamos el volumen a 0 suavemente en 1.5 segundos
    fadingGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1.5);
    
    setTimeout(() => { try { source.stop(); } catch(e){} }, 1600);
}

function stopPadSmoothly() {
    if (activeSource && activeGain) {
        fadeOutOldSource(activeSource, activeGain);
        activeSource = null;
        activeGain = null;
    }
}

document.getElementById('padVolumeSlider').addEventListener('input', function(e) {
    if (activeGain) {
        activeGain.gain.cancelScheduledValues(audioCtx.currentTime);
        activeGain.gain.setValueAtTime(this.value, audioCtx.currentTime);
    }
});

function toggleVolPopup(popupId) {
    const popup = document.getElementById(popupId);
    const isShowing = popup.classList.contains('show');
    document.querySelectorAll('.vol-popup').forEach(p => p.classList.remove('show'));
    document.querySelectorAll('.bar-btn-icon').forEach(b => b.classList.remove('active'));
    if (!isShowing) {
        popup.classList.add('show');
        popup.parentElement.querySelector('.bar-btn-icon').classList.add('active');
    }
}

        // --- ACTUALIZAR VISTA CANCION CON INTEGRACIÓN AUDIO ---
        function actualizarVistaCancion(id) {
            cancionActual = todasLasCanciones.find(c => c.id === id);
            semitonos = 0; 
            
            document.getElementById('viewTitle').innerText = cancionActual.titulo;
            document.getElementById('viewArtist').innerText = cancionActual.artista;
            document.getElementById('currentToneDisplay').innerText = cancionActual.tonoOriginal;
            document.getElementById('viewBPM').innerText = cancionActual.bpm || '-';
            document.getElementById('viewCompas').innerText = cancionActual.compas || '-';

            document.getElementById('btnPrevSong').disabled = (indiceNavegacion <= 0);
            document.getElementById('btnNextSong').disabled = (indiceNavegacion >= listaNavegacionActual.length - 1);

            document.getElementById('viewList').style.display = 'none';
            document.getElementById('viewSong').style.display = 'flex';
            
            cargarNotasYRenderizar();
            
            const btnEdit = document.getElementById('btnDirectEdit');
            if (usuarioActual && ADMIN_EMAILS.includes(usuarioActual.email)) btnEdit.style.display = 'flex';
            else btnEdit.style.display = 'none';


            // --- AUDIO DOCK UPDATE ---
            const dock = document.getElementById('audioDock');
            if (dock) {
                dock.classList.add('visible'); // El componente se monta en el visor, pero permanece oculto por CSS
            }
            // document.body.classList.remove('audio-dock-open'); <-- Asegúrate de que esta clase de padding no empuje la letra

            // BPM
            const bpm = cancionActual.bpm ? parseInt(cancionActual.bpm) : 120;
            currentBpm = bpm; 
            document.getElementById('bpmInput').value = bpm;
            
            // Compás
            let beats = 4; 
            if (cancionActual.compas) {
                const partes = cancionActual.compas.split('/'); 
                if(partes.length > 0) beats = parseInt(partes[0]);
            }
            if (![2, 3, 4, 6].includes(beats)) beats = 4;
            beatsPerMeasure = beats;
            currentBeat = 0;         
            document.getElementById('timeSigInput').value = beats;

            // Tono Pad
            const tonoPad = cancionActual.tonoOriginal || 'C';
            currentPadKey = tonoPad; 
            const selectPad = document.getElementById('padKeySelect');
            if(selectPad) selectPad.value = tonoPad;
            
            // Sincronizar texto visual y audio si cambiamos de canción
            const padBtn = document.getElementById('padTriggerBtn');
            if (isPadOn) {
                if(padBtn) padBtn.innerHTML = selectPad.options[selectPad.selectedIndex].text;
                playPadFile(tonoPad);
            } else {
                if(padBtn) padBtn.innerHTML = '<i class="fas fa-music"></i>';
            }
            
            // Crossfade si está prendido
            if (isPadOn) playPadFile(tonoPad);
        }

       function volverALista() { 
            if (isMetronomeOn) toggleMetronome();
            if (isPadOn) togglePad();
            
            // NUEVO: Asegura quitar la clase al salir
            const rack = document.getElementById('audioDock');
            if (rack) rack.classList.remove('show-rack');

            document.getElementById('audioDock').classList.remove('visible');
            document.body.classList.remove('audio-dock-open');
            desactivarPantalla(); 
            document.getElementById('viewSong').style.display = 'none'; 
            document.getElementById('viewList').style.display = 'block'; 
            document.getElementById('transposerPanel').style.display='none'; 
            
            document.getElementById('searchInput').value = '';
            renderizarLista();

            const urlLimpia = window.location.protocol + "//" + window.location.host + window.location.pathname;
            window.history.pushState({ path: urlLimpia }, '', urlLimpia);
        }

        // NUEVO: Evento para cerrar de manera inteligente el Rack si el músico toca la letra
        document.addEventListener('DOMContentLoaded', () => {
            const songContent = document.getElementById('songContent');
            if (songContent) {
                songContent.addEventListener('click', () => {
                    const rack = document.getElementById('audioDock');
                    if (rack && rack.classList.contains('show-rack')) {
                        rack.classList.remove('show-rack');
                    }
                });
            }
        });
        // Variable global para saber si creamos o editamos
        let rolEditandoId = null;

       function abrirModalNuevoRol() {
            rolEditandoId = null; 
            document.getElementById('inputRolFecha').value = "";
            document.getElementById('inputRolC1').value = "";
            document.getElementById('inputRolC2').value = "";
            
            cambiarModalidadServicio('voces');
            cargarUsuariosEnSelector();

            document.querySelector('#modalRol .modal-title').innerText = "Programar Servicio";
            document.getElementById('modalRol').classList.add('open');
        }
        function cerrarModalRol() {
            // 1. Cerramos el modal
            document.getElementById('modalRol').classList.remove('open');
            
            // 2. Limpiamos la variable por si estábamos editando y nos arrepentimos
            rolEditandoId = null; 
        }

       function editarRol(id, f, dEmail, mode, c1, c2, e) {
            e.stopPropagation();
            rolEditandoId = id;
            
            // 🔥 Aseguramos que pinte la lista antes de asignarle el valor guardado
            cargarUsuariosEnSelector();
            
            document.getElementById('inputRolFecha').value = f;
            document.getElementById('inputRolDirUser').value = dEmail || "";
            cambiarModalidadServicio(mode || 'voces');
            
            if (mode !== 'completo') {
                document.getElementById('inputRolC1').value = c1 === "---" ? "" : c1;
                document.getElementById('inputRolC2').value = c2 === "---" ? "" : c2;
            }
            
            document.querySelector('#modalRol .modal-title').innerText = "Editar Servicio";
            document.getElementById('modalRol').classList.add('open');
        }

        function guardarNuevoRolFirebase() {
            const f = document.getElementById('inputRolFecha').value;
            const directorEmail = document.getElementById('inputRolDirUser').value;
            const c1 = document.getElementById('inputRolC1').value;
            const c2 = document.getElementById('inputRolC2').value;

            if (!f || !directorEmail) return alert("Por favor selecciona fecha y dirección");

            // Extraemos el nombre visible del correo para el renderizado de la tarjeta
            const nombreDirector = directorEmail.split('@')[0].toUpperCase();

            const datos = {
                fecha: f,
                direccion: nombreDirector,       // Nombre que se mostrará en la tarjeta
                directorEmail: directorEmail,   // CRÍTICO: Esto servirá para filtrar su página de inicio después
                modalidad: modalidadServicioActual,
                coro1: modalidadServicioActual === 'completo' ? "GRUPO COMPLETO" : (c1 || "---"),
                coro2: modalidadServicioActual === 'completo' ? "---" : (c2 || "---"),
                ultimaEdicion: new Date()
            };

            let promesa;
            if (rolEditandoId) {
                promesa = db.collection('roles').doc(rolEditandoId).update(datos);
            } else {
                datos.creadoEn = new Date();
                promesa = db.collection('roles').add(datos);
            }

            promesa.then(() => {
                document.getElementById('modalRol').classList.remove('open');
                if (window.vibrate) navigator.vibrate(50);
                rolEditandoId = null;
            }).catch(e => console.error("Error guardando rol:", e));
        }

        function eliminarRol(id, e) {
            e.stopPropagation();
            Modal.confirm("¿Eliminar fecha?", "Se borrará este rol del calendario.", "🗑️").then(conf => {
                if(conf) db.collection('roles').doc(id).delete();
            });
        }

        // Renderizado con el nuevo diseño minimalista
        // Renderizado con el nuevo diseño minimalista
        async function cargarRolServicio() {
            const container = document.getElementById('rolListaContainer');
            
            // CORRECCIÓN: Verifica usando la lista ADMIN_EMAILS
            if (usuarioActual && ADMIN_EMAILS.includes(usuarioActual.email)) {
                document.getElementById('btnNuevoRol').style.display = 'block';
            }

            const hoy = new Date().toISOString().split('T')[0];
            
            db.collection('roles')
            .where('fecha', '>=', hoy)
            .orderBy('fecha', 'asc')
            .onSnapshot(snap => {
                if (snap.empty) {
                    container.innerHTML = "<div class='empty-state'><i class='fas fa-calendar-times fa-3x'></i><p>No hay fechas programadas.</p></div>";
                    return;
                }
                
                let html = '';
                snap.docs.forEach((doc, index) => {
                    const d = doc.data();
                    const f = d.fecha.split('-');
                    const dateObj = new Date(f[0], f[1]-1, f[2]);
                    const esProximo = index === 0;

                    // CORRECCIÓN: Verifica usando la lista ADMIN_EMAILS para mostrar lápiz y bote de basura
                   const opcionesAdmin = (usuarioActual && ADMIN_EMAILS.includes(usuarioActual.email)) ? 
                    `<div class="admin-actions" style="display:flex; gap:10px;">
                        <i class="fas fa-pen" style="color:#818cf8; cursor:pointer;" onclick="editarRol('${doc.id}', '${d.fecha}', '${d.directorEmail || ''}', '${d.modalidad || 'voces'}', '${d.coro1}', '${d.coro2}', event)"></i>
                        <i class="fas fa-trash" style="color:#ef4444; cursor:pointer;" onclick="eliminarRol('${doc.id}', event)"></i>
                    </div>` : '';

                    html += `
                        <div class="card rol-minimal-card ${esProximo ? 'proximo-servicio' : ''}">
                            <div class="rol-minimal-header">
                                <div class="rol-date">
                                    <span class="day">${dateObj.getDate()}</span>
                                    <span class="month">${dateObj.toLocaleDateString('es-MX', {month:'short'}).toUpperCase()}</span>
                                </div>
                                ${opcionesAdmin}
                            </div>
                            <div class="rol-minimal-body">
                                <div class="rol-item">
                                    <i class="fas fa-star"></i> <strong>Dirige:</strong> <span>${d.direccion}</span>
                                </div>
                                <div class="rol-item">
                                    <i class="fas fa-microphone"></i> <strong>Coro 1:</strong> <span>${d.coro1}</span>
                                </div>
                                <div class="rol-item">
                                    <i class="fas fa-microphone"></i> <strong>Coro 2:</strong> <span>${d.coro2}</span>
                                </div>
                            </div>
                        </div>`;
                });
                container.innerHTML = html;
            });

         }

        async function precargarTodosLosPads() {
            // 1. Verificamos quién está usando la app
            const user = firebase.auth().currentUser;
            
            // Si no hay usuario o no eres tú, salimos
            if (!user || user.email !== 'joshua@genesaret.com') {
                console.log("🎸 Modo Músico: Pads omitidos para ahorrar RAM.");
                padsListos = true;
                if (typeof verificarEstadoTotal === 'function') verificarEstadoTotal();
                return; 
            }

            // 2. Si eres tú, inicializamos el audio
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }

            console.log("🚀 Iniciando precarga de pads para Baterista...");
            const notas = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
            
            for (const nota of notas) {
                if (!padBufferCache[nota]) {
                    try {
                        const fileName = FILE_PREFIX + encodeURIComponent(nota) + FILE_EXT;
                        const response = await fetch(fileName + "?v=" + Date.now()); 
                        const arrayBuffer = await response.arrayBuffer();
                        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                        
                        padBufferCache[nota] = audioBuffer;
                        console.log(`✅ ${nota} guardado en RAM.`);
                        
                        // Pausa para tu Galaxy A54
                        await new Promise(res => setTimeout(res, 300)); 
                    } catch (e) {
                        console.error(`❌ Error en pad ${nota}:`, e);
                    }
                }
            }
            padsListos = true;
            if (typeof verificarEstadoTotal === 'function') verificarEstadoTotal();
            console.log("🎯 Pads cargados en RAM (Solo Joshua)");
        }

        // 3. Importante: Para que 'currentUser' no sea null al cargar la página,
        // llamamos a la función dentro del observador de Firebase
        firebase.auth().onAuthStateChanged((user) => {
            if (user) {
                precargarTodosLosPads();
            }
        });

        function eliminarCancionDirecto(id, titulo, event) {
            event.stopPropagation(); // Evita que se abra la canción al querer borrarla
            
            Modal.confirm("¿Eliminar canción?", `¿Estás seguro de borrar "${titulo}"? Esta acción no se puede deshacer.`, "🗑️")
            .then(confirmado => {
                if (confirmado) {
                    db.collection('canciones').doc(id).delete()
                    .then(() => {
                        if (navigator.vibrate) navigator.vibrate(50); // Feedback táctil
                        console.log("Canción eliminada");
                    })
                    .catch(e => Modal.alert("Error", "No se pudo eliminar: " + e.message));
                }
            });
        }
        function actualizarIndicadorSync(fromCache) {
            const icon = document.getElementById('syncIndicator');
            if (!icon) return;

            if (fromCache) {
                // Los datos ya están en tu laptop
                icon.style.color = "#10b981"; // Verde Esmeralda
                icon.innerHTML = '<i class="fas fa-check-circle"></i>';
                icon.title = "Sincronizado Offline";
            } else {
                // Los datos vienen de internet (sincronizando)
                icon.style.color = "#6366f1"; // Morado/Indigo
                icon.innerHTML = '<i class="fas fa-sync fa-spin"></i>';
                icon.title = "Sincronizando con la nube...";
            }
        }
        function verificarEstadoTotal() {
            const icon = document.getElementById('syncIndicator');
            if (!icon) return;

            // Solo si AMBAS son verdaderas, pasamos a verde
            if (cancionesListas && padsListos) {
                icon.style.color = "#10b981"; // Verde Esmeralda
                icon.innerHTML = '<i class="fas fa-check-circle"></i>';
                icon.title = "Todo listo: Letras y Pads offline";
                console.log("✅ SISTEMA TOTALMENTE SINCRONIZADO");
            } else {
                // Mientras falte alguna, mantenemos el estado de carga
                icon.style.color = "#6366f1"; 
                icon.innerHTML = '<i class="fas fa-sync fa-spin"></i>';
            }
        }
        // --- NUEVO: CONTROL DEL AUDIO RACK FLOTANTE ---
        function toggleAudioRack(event) {
            if (event) event.stopPropagation();
            const rack = document.getElementById('audioDock');
            if (rack) {
                rack.classList.toggle('show-rack');
            }
        }

        let modalidadServicioActual = 'voces'; // Estado global del formulario

        // Controla si se muestran o esconden los coros en el modal
        function cambiarModalidadServicio(modo) {
            modalidadServicioActual = modo;
            const btnVoces = document.getElementById('btnModeVoces');
            const btnCompleto = document.getElementById('btnModeCompleto');
            const contenedorCoros = document.getElementById('contenedorCamposCoros');

            if (modo === 'completo') {
                btnCompleto.classList.add('active');
                btnVoces.classList.remove('active');
                contenedorCoros.style.display = 'none';
                // Limpiamos los inputs por seguridad
                document.getElementById('inputRolC1').value = "";
                document.getElementById('inputRolC2').value = "";
            } else {
                btnVoces.classList.add('active');
                btnCompleto.classList.remove('active');
                contenedorCoros.style.display = 'block';
            }
        }

       function cargarUsuariosEnSelector() {
            const selector = document.getElementById('inputRolDirUser');
            if (!selector) return;

            // Limpiamos y dejamos la opción por defecto
            selector.innerHTML = '<option value="">Selecciona un líder...</option>';
            
            listaUsuariosGrupo.forEach(u => {
                // Si el documento no tiene el campo 'email', usamos el ID del documento como respaldo
                const correoIdentificador = u.email || u.id; 
                
                if (correoIdentificador && correoIdentificador.includes('@')) {
                    const emailLimpio = correoIdentificador.split('@')[0].toUpperCase();
                    
                    const option = document.createElement('option');
                    option.value = correoIdentificador;
                    option.innerText = emailLimpio;
                    selector.appendChild(option);
                }
            });
        }

        // === MOTOR DE CONTENIDO DEL DASHBOARD ===

        const VERSICULOS_RV60 = [
            { texto: "Alabaré yo el nombre de Dios con cántico, lo ensalzaré con alabanza.", cita: "Salmos 69:30" },
            { texto: "Bueno es alabarte, oh Jehová, y cantar salmos a tu nombre, oh Altísimo.", cita: "Salmos 92:1" },
            { texto: "Cantad a Jehová cántico nuevo; su alabanza sea en la congregación de los santos.", cita: "Salmos 149:1" },
            { texto: "Todo lo que respira alabe a Jehová. Aleluya.", cita: "Salmos 150:6" },
            { texto: "Entrad por sus puertas con acción de gracias, por sus atrios con alabanza.", cita: "Salmos 100:4" },
            { texto: "Jehová es mi fuerza y mi escudo; en él esperó mi corazón, y fui ayudado.", cita: "Salmos 28:7" },
            { texto: "Grandes y maravillosas son tus obras, Señor Dios Todopoderoso; justos y verdaderos son tus caminos.", cita: "Apocalipsis 15:3" }
        ];

        function cargarVersiculoDiario() {
            // Rotación matemática basada en el día absoluto del año actual
            const hoy = new Date();
            const diaDelAno = Math.floor((hoy - new Date(hoy.getFullYear(), 0, 0)) / 86400000);
            const indice = diaDelAno % VERSICULOS_RV60.length;
            
            const v = VERSICULOS_RV60[indice];
            const txtEl = document.getElementById('dashVersiculoTexto');
            const citaEl = document.getElementById('dashVersiculoCita');
            
            if(txtEl && citaEl) {
                txtEl.innerText = `"${v.texto}"`;
                citaEl.innerText = v.cita;
            }
        }

        function renderizarDashboard() {
            // 1. Cargar Palabra Diaria (RV60)
            cargarVersiculoDiario();

            // 2. Renderizar nombres de canciones asignadas al Domingo (Consola Live)
            const cancionesContainer = document.getElementById('dashCancionesLista');
            const countEl = document.getElementById('dashPlaylistCount');
            
            if (cancionesContainer && countEl) {
                const cancionesDomingo = idsEnPlaylist.map(id => todasLasCanciones.find(c => c.id === id)).filter(c => c);
                countEl.innerText = `${cancionesDomingo.length} canciones listas`;

                if (cancionesDomingo.length === 0) {
                    cancionesContainer.innerHTML = `
                        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; flex:1; opacity:0.3; padding:10px;">
                            <i class="fas fa-music-alt fa-lg" style="margin-bottom:6px;"></i>
                            <p style="font-size: 12px; margin:0;">No hay canciones seleccionadas aún.</p>
                        </div>`;
                } else {
                    let cancionesHtml = '';
                    cancionesDomingo.forEach((c, index) => {
                        cancionesHtml += `
                            <div style="display: flex; align-items: center; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.03); padding: 8px 12px; border-radius: 10px; gap: 10px;">
                                <span style="color: #6366f1; font-weight: 700; font-size: 12px; background: rgba(99, 102, 241, 0.1); width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; border-radius: 6px;">${index + 1}</span>
                                <div style="display: flex; flex-direction: column; min-width: 0; flex: 1;">
                                    <span style="font-weight: 600; font-size: 13px; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${c.titulo}</span>
                                    <span style="font-size: 11px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${c.artista || 'Sin artista'}</span>
                                </div>
                                <span style="font-size: 11px; font-weight: 700; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); padding: 2px 7px; border-radius: 6px; color: #94a3b8; text-shadow: 0 0 10px rgba(255,255,255,0.1);">${c.tonoOriginal || '?'}</span>
                            </div>`;
                    });
                    cancionesContainer.innerHTML = cancionesHtml;
                }
            }

            // 3. Renderizar las próximas 2 fechas generales del Rol con Alerta Premium (Minimalista sin badges)
            const fechasContainer = document.getElementById('dashMisFechasContainer');
            if (!fechasContainer) return;

            const hoyStr = new Date().toISOString().split('T')[0];

            db.collection('roles')
            .where('fecha', '>=', hoyStr)
            .orderBy('fecha', 'asc')
            .limit(2)
            .get().then(snap => {
                if (snap.empty) {
                    fechasContainer.innerHTML = `
                        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:15px; opacity:0.3;">
                            <p style="font-size: 12px; margin:0;">Calendario de roles vacío.</p>
                        </div>`;
                    return;
                }

                let html = '';
                snap.forEach(doc => {
                    const d = doc.data();
                    const f = d.fecha.split('-');
                    const dateObj = new Date(f[0], f[1]-1, f[2]);
                    const diaNum = dateObj.getDate();
                    const mesStr = dateObj.toLocaleDateString('es-MX', {month: 'short'}).toUpperCase().replace('.', '');
                    const diaSemana = dateObj.toLocaleDateString('es-MX', {weekday: 'short'}).toUpperCase().replace('.', '');

                    const eresElDirector = usuarioActual && d.directorEmail === usuarioActual.email;

                    if (eresElDirector) {
                        // Alerta premium limpia sin el badge de la modalidad al final
                        html += `
                            <div style="background: linear-gradient(90deg, rgba(217, 119, 6, 0.18) 0%, rgba(10, 10, 14, 0.6) 100%); border: 1px solid rgba(217, 119, 6, 0.35); border-left: 4px solid #f59e0b; padding: 10px 14px; border-radius: 12px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 4px 20px rgba(217, 119, 6, 0.08);">
                                <div style="display: flex; align-items: center; gap: 12px;">
                                    <div style="background: rgba(217, 119, 6, 0.15); color: #fbbf24; padding: 8px; border-radius: 10px; font-size: 14px; width:34px; height:34px; display:flex; align-items:center; justify-content:center;">
                                        <i class="fas fa-star"></i>
                                    </div>
                                    <div>
                                        <div style="color: #fbbf24; font-weight: 800; font-size: 12px; letter-spacing: 0.5px;">¡TE TOCA DIRECCIÓN!</div>
                                        <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">Este domingo (${diaNum} de ${mesStr.toLowerCase()}) estás al frente.</div>
                                    </div>
                                </div>
                            </div>`;
                    } else {
                        // Fila de agenda limpia sin la etiqueta del extremo derecho
                        html += `
                            <div style="background: rgba(255,255,255,0.01); border: 1px solid rgba(255,255,255,0.03); padding: 8px 12px; border-radius: 12px; display: flex; align-items: center;">
                                <div style="display: flex; align-items: center; gap: 12px;">
                                    <div style="text-align: center; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; width: 38px; padding: 4px 0; display: flex; flex-direction: column; justify-content: center;">
                                        <span style="font-size: 9px; color: #64748b; font-weight: 700; line-height: 1;">${diaSemana}</span>
                                        <span style="font-size: 14px; color: #f1f5f9; font-weight: 700; line-height: 1.1; margin-top: 2px;">${diaNum}</span>
                                    </div>
                                    <div style="display: flex; flex-direction: column;">
                                        <span style="font-size: 13px; font-weight: 600; color: #cbd5e1;">Dirige: <span style="color: #fff; font-weight:700;">${d.direccion}</span></span>
                                        <span style="font-size: 11px; color: #475569; margin-top: 1px;">Mes de ${mesStr.toLowerCase()}</span>
                                    </div>
                                </div>
                            </div>`;
                    }
                });
                fechasContainer.innerHTML = html;
            }).catch(err => console.error("Error cargando agenda de inicio:", err));
        }