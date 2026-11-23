function normalizarBusqueda(texto) {
    return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
function coincideBusqueda(cancion, busqueda) {
    return normalizarBusqueda(`${cancion.titulo || ''} ${cancion.artista || ''}`).includes(busqueda);
}
function limpiarBusqueda() {
    document.getElementById('searchInput').value = '';
    renderizarLista();
    document.getElementById('searchInput').focus();
}
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

        // === VARIABLES GLOBALES (CORREGIDAS SIN DUPLICADOS) ===
        let tabActual = 'home'; // Única declaración inicial
        let listaUsuariosGrupo = [];
        let usuarioActual = null;
        let rolActual = localStorage.getItem('alabanza_rol') || 'voz';
        let rolTemp = null;
        let todasLasCanciones = [];
        const playlistsPorDia = { domingo: [], miercoles: [] };
        const cancionesAgregandose = new Set();
        let servicioActual = 'domingo';
        let rolesProgramados = [];
        let filtroRoles = 'todos';
        let rolesCargados = false;
        let errorRoles = false;
        function playlistActual() { return playlistsPorDia[servicioActual]; }
        function esTabServicio() { return ['playlist', 'wednesday'].includes(tabActual); }
        function seleccionarServicio(dia) {
            if (!Servicios.dias[dia]) return;
            servicioActual = dia;
            document.getElementById('playlistDayTarget').value = dia;
            renderizarLista();
        }
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
            if (wakeLock && !wakeLock.released) return;
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
            const toggle = document.querySelector('.toggle-pass');
            const mostrar = passInput.type === 'password';
            toggle.setAttribute('aria-label', mostrar ? 'Ocultar contraseña' : 'Mostrar contraseña');
            toggle.setAttribute('aria-pressed', String(mostrar));
            const icon = document.querySelector('.toggle-pass i');
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
            document.getElementById('txtPassword').autocomplete = modoRegistro ? 'new-password' : 'current-password';

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

        let inicioSesionManual = false;
        function loginFirebase() {
            const email = document.getElementById('txtEmail').value;
            const pass = document.getElementById('txtPassword').value;
            const errDiv = document.getElementById('loginError');
            if(!email || !pass) { errDiv.style.display='block'; errDiv.innerText="Faltan datos"; return; }
            inicioSesionManual = true;
            firebase.auth().signInWithEmailAndPassword(email, pass).catch((e) => { inicioSesionManual = false; errDiv.style.display = 'block'; errDiv.innerText = "Error: " + e.message; });
        }

        function registroMejorado() {
            const email = document.getElementById('txtEmail').value;
            const pass = document.getElementById('txtPassword').value;
            const errDiv = document.getElementById('loginError');
            if(!email || !pass) { errDiv.style.display='block'; errDiv.innerText="Ingresa un correo y contraseña."; return; }
            if(!rolTemp) { errDiv.style.display='block'; errDiv.innerText="Selecciona qué instrumento tocas."; return; }

            inicioSesionManual = true;
            firebase.auth().createUserWithEmailAndPassword(email, pass)
                .then((cred) => {
                    return db.collection('usuarios').doc(cred.user.uid).set({ rol: rolTemp, email: email });
                })
                .then(() => { localStorage.setItem('alabanza_rol', rolTemp); })
                .catch((e) => { inicioSesionManual = false; errDiv.style.display = 'block'; errDiv.innerText = "Error al registrar: " + e.message; });
        }

        function cerrarSesion() {
            Modal.confirm("¿Salir?", "¿Cerrar sesión actual?", "👋").then(res => { 
                if(res) {
                    firebase.auth().signOut().then(() => location.reload()); 
                }
            });
        }
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

        const estadoConexion = { canciones: false, listas: {}, pendientes: {}, archivos: false };
        let retornoEditorPendiente = null;
        let seccionesLectura = [];
        let seccionFrame = null;
        let temporizadorToast = null;
        let modoEnsayo = false;
        let pantallaCompletaEnsayo = false;
        function clavePreferenciasCancion() {
            return 'alabanza_lector_v1_' + (usuarioActual?.uid || 'local') + '_' + rolActual + '_' + cancionActual.id;
        }
        function cargarPreferenciasCancion() {
            if (!cancionActual) return;
            const clave = clavePreferenciasCancion();
            const prefs = ExperienciaLectura.preferencias(clave);
            if (ExperienciaLectura.leer(clave)) {
                tamanoLectura = prefs.letra;
                tamanoBateria = prefs.bateria;
            } else {
                tamanoLectura = Math.max(16, Math.min(26, Number(ExperienciaLectura.leer('alabanza_letra_tamano')) || 19));
                tamanoBateria = Math.max(12, Math.min(24, Number(ExperienciaLectura.leer('alabanza_bateria_tamano')) || 19));
            }
            lecturaContinua = prefs.continua;
            document.getElementById('readerScrollSpeed').value = String(prefs.velocidad);
            const ocultar = prefs.ocultarAcordes ?? (rolActual === 'bateria' || rolActual === 'voz');
            document.body.classList.toggle('hide-chords', ocultar);
            actualizarBotonAcordes();
        }
        function guardarPreferenciasCancion() {
            if (!cancionActual) return;
            ExperienciaLectura.guardar(clavePreferenciasCancion(), {
                letra: tamanoLectura, bateria: tamanoBateria,
                velocidad: Number(document.getElementById('readerScrollSpeed').value),
                ocultarAcordes: document.body.classList.contains('hide-chords'), continua: lecturaContinua
            });
        }
        function actualizarBotonAcordes() {
            const ocultar = document.body.classList.contains('hide-chords');
            ['btnToggleChords', 'readerChords'].forEach(id => {
                const boton = document.getElementById(id);
                boton.querySelector('i').className = ocultar ? 'fas fa-eye' : 'fas fa-eye-slash';
                boton.setAttribute('aria-pressed', String(!ocultar));
                boton.setAttribute('aria-label', ocultar ? 'Mostrar acordes' : 'Ocultar acordes');
            });
        }
        function seleccionarSeccionLectura(linea, boton) {
            document.querySelectorAll('#songStructure [aria-current]').forEach(el => el.removeAttribute('aria-current'));
            document.querySelectorAll('#songContent .section-selected').forEach(el => el.classList.remove('section-selected'));
            boton.setAttribute('aria-current', 'location');
            linea.closest('.section-block').classList.add('section-selected');
            const nav = document.getElementById('songStructure');
            const rect = boton.getBoundingClientRect(), marco = nav.getBoundingClientRect();
            if (rect.top < marco.top || rect.bottom > marco.bottom) nav.scrollTop += rect.top - marco.top - 12;
        }
        function actualizarSeccionVisible() {
            if (!seccionesLectura.length || document.getElementById('viewSong').style.display !== 'flex') return;
            const contenido = document.getElementById('songContent');
            const hoja = contenido.querySelector('.drum-sheet');
            if (hoja && !hoja.classList.contains('drum-sheet-overflow') && document.querySelector('#songStructure [aria-current]')) return;
            const marco = contenido.getBoundingClientRect();
            let elegida = seccionesLectura[0];
            for (const seccion of seccionesLectura) {
                const rect = seccion.linea.getBoundingClientRect();
                if (rect.left < marco.right && rect.right > marco.left && rect.top <= marco.top + 45) elegida = seccion;
            }
            if (contenido.scrollTop >= contenido.scrollHeight - contenido.clientHeight - 2 && contenido.scrollTop > 0) elegida = seccionesLectura[seccionesLectura.length - 1];
            if (!elegida.boton.hasAttribute('aria-current')) seleccionarSeccionLectura(elegida.linea, elegida.boton);
        }
        function programarSeccionVisible() {
            if (seccionFrame !== null) return;
            seccionFrame = requestAnimationFrame(() => { seccionFrame = null; actualizarSeccionVisible(); });
        }
        function capturarRetornoEditor() {
            const contenido = document.getElementById('songContent');
            const marco = contenido.getBoundingClientRect();
            const lineas = Array.from(contenido.querySelectorAll('.line-wrapper'));
            const ancla = lineas.find(linea => linea.getBoundingClientRect().bottom > marco.top + 20) || lineas[0];
            const activa = seccionesLectura.find(seccion => seccion.boton.hasAttribute('aria-current'));
            return {
                uid: usuarioActual?.uid, cancion: cancionActual.id, fecha: Date.now(),
                indice: ancla?.dataset.index, offset: ancla ? ancla.getBoundingClientRect().top - marco.top : 0,
                scroll: contenido.scrollTop, seccion: activa?.boton.textContent,
                navegacion: listaNavegacionActual, tab: tabActual, ensayo: modoEnsayo
            };
        }
        function restaurarRetornoEditor() {
            if (!retornoEditorPendiente || !cancionActual) return;
            const retorno = retornoEditorPendiente;
            retornoEditorPendiente = null;
            const contenido = document.getElementById('songContent');
            const ancla = Array.from(contenido.querySelectorAll('.line-wrapper')).find(linea => linea.dataset.index === String(retorno.indice));
            const seccion = seccionesLectura.find(item => item.boton.textContent === retorno.seccion);
            if (ancla) contenido.scrollTop += ancla.getBoundingClientRect().top - contenido.getBoundingClientRect().top - (Number(retorno.offset) || 0);
            else if (seccion) contenido.scrollTop += seccion.linea.getBoundingClientRect().top - contenido.getBoundingClientRect().top - 20;
            else contenido.scrollTop = Number(retorno.scroll) || 0;
            if (seccion) seleccionarSeccionLectura(seccion.linea, seccion.boton);
            if (retorno.ensayo) establecerModoEnsayo(true);
            mostrarToastLector('Canción guardada');
            ExperienciaLectura.guardar('alabanza_editor_return', null, sessionStorage);
            const url = new URL(window.location.href);
            url.searchParams.delete('saved');
            window.history.replaceState({}, '', url);
        }
        function mostrarToastLector(texto) {
            const toast = document.getElementById('readerToast');
            clearTimeout(temporizadorToast);
            toast.textContent = texto;
            toast.hidden = false;
            temporizadorToast = setTimeout(() => { toast.hidden = true; }, 2800);
        }
        function establecerModoEnsayo(activo) {
            modoEnsayo = activo;
            document.getElementById('viewSong').classList.toggle('rehearsal-mode', activo);
            const boton = document.getElementById('readerRehearsal');
            boton.setAttribute('aria-pressed', String(activo));
            boton.querySelector('span').textContent = activo ? 'Salir de ensayo' : 'Ensayo';
            if (activo) {
                activarPantalla();
                document.getElementById('transposerPanel').style.display = 'none';
            }
            solicitarAjusteBateria();
        }
        async function alternarModoEnsayo() {
            const activo = !modoEnsayo;
            establecerModoEnsayo(activo);
            if (activo && !document.fullscreenElement && document.getElementById('viewSong').requestFullscreen) {
                try { await document.getElementById('viewSong').requestFullscreen(); pantallaCompletaEnsayo = true; }
                catch (_) { /* Compact rehearsal also works without fullscreen support. */ }
            } else if (!activo && pantallaCompletaEnsayo && document.fullscreenElement) {
                pantallaCompletaEnsayo = false;
                try { await document.exitFullscreen(); } catch (_) {}
            }
        }
        async function comprobarArchivosOffline() {
            if (!('caches' in window) || !navigator.serviceWorker?.controller) return;
            const necesarios = ['./index.html', './index-app.js', './reader-experience.js', './permissions.js', './config.js', './rhythm.js', './services.js', './drummer-reader.js', './reader.css', './style.css', './index-style.css', './ux.css',
                'https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js',
                'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore-compat.js',
                'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth-compat.js'];
            try { estadoConexion.archivos = (await Promise.all(necesarios.map(url => caches.match(new URL(url, location.href).href)))).every(Boolean); }
            catch (_) { estadoConexion.archivos = false; }
            verificarEstadoTotal();
        }

        const escuchasDatos = [];
        function escucharDatos(referencia, ...argumentos) {
            escuchasDatos.push(referencia.onSnapshot(...argumentos));
        }
        let versionSesion = 0;
        let temporizadorSplash = null;
        function ocultarSplash() {
            clearTimeout(temporizadorSplash);
            document.getElementById('splashScreen').style.display = 'none';
            document.getElementById('splashLogo').classList.remove('animate-splash');
        }
        firebase.auth().onAuthStateChanged(async user => {
            // Repeated notifications must not reset navigation or duplicate listeners.
            if (user && usuarioActual && usuarioActual.uid === user.uid) return;
            const version = ++versionSesion;
            window.EnsayoMusical?.cerrar();
            const mostrarBienvenida = Boolean(user && inicioSesionManual);
            inicioSesionManual = false;
            if (detenerNotas) { detenerNotas(); detenerNotas = null; }
            if (detenerNotaActual) { detenerNotaActual(); detenerNotaActual = null; }
            documentoNotaEscuchada = null;
            escuchasDatos.splice(0).forEach(detener => detener());
            estadoConexion.canciones = false;
            estadoConexion.listas = {};
            estadoConexion.pendientes = {};
            pausarDesplazamientoLetra();
            notasLocales = { canciones: {} };
            notasDeLaCancion = {};
            notasConsultadas = false;
            usuarioActual = user;
            ocultarSplash();
            document.getElementById('loginModal').style.display = user ? 'none' : 'flex';
            const btnAdmin = document.getElementById('btnAdmin');
            if (btnAdmin) btnAdmin.style.display = Permisos.puedeEditar(user) ? 'flex' : 'none';
            if (!user) return;

            if (mostrarBienvenida) {
                const splash = document.getElementById('splashScreen');
                splash.style.opacity = '1';
                splash.style.display = 'flex';
                document.getElementById('splashLogo').classList.add('animate-splash');
                document.getElementById('splashLoader').style.opacity = '1';
                // A slow/offline profile request must never lock the application.
                temporizadorSplash = setTimeout(ocultarSplash, 4000);
            }
            actualizarBadgeUsuario(user, rolActual);
            aplicarRol();
            cargarDatosApp();
            cambiarTab('home');
            try {
                const doc = await db.collection('usuarios').doc(user.uid).get();
                if (version !== versionSesion) return;
                const rolAnterior = rolActual;
                if (doc.exists && doc.data().rol) {
                    rolActual = doc.data().rol;
                    localStorage.setItem('alabanza_rol', rolActual);
                }
                actualizarBadgeUsuario(user, rolActual);
                if (rolActual !== rolAnterior) aplicarRol();
            } catch (error) {
                console.warn('No se pudo cargar el perfil; se conserva el instrumento local.', error);
            } finally {
                if (version === versionSesion) ocultarSplash();
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
            escucharDatos(db.collection('canciones').orderBy('titulo'),{ includeMetadataChanges: true }, snap => {
                cancionesListas = true;
                estadoConexion.canciones = true;
                estadoConexion.pendientes.canciones = snap.metadata.hasPendingWrites;
                verificarEstadoTotal();

                todasLasCanciones = [];
                snap.forEach(doc => { todasLasCanciones.push({ id: doc.id, ...doc.data() }); });
                renderizarLista();
                if (tabActual === 'home') renderizarDashboard();
                if (cancionActual) {
                    const actualizada = todasLasCanciones.find(c => c.id === cancionActual.id);
                    if (actualizada && JSON.stringify(actualizada) !== JSON.stringify(cancionActual)) {
                        const anterior = cancionActual;
                        cancionActual = actualizada;
                        if (actualizada.bpm !== anterior.bpm) updateBpm(actualizada.bpm);
                        if (actualizada.compas !== anterior.compas) updateTimeSig(actualizada.compas);
                        actualizarEncabezadoCancion();
                        if (document.getElementById('viewSong').style.display === 'flex') renderizarLetra();
                    }
                }

                if (primeraCargaCanciones && (!snap.metadata.fromCache || todasLasCanciones.some(c => c.id === new URLSearchParams(window.location.search).get('song')))) {
                    primeraCargaCanciones = false;
                    const params = new URLSearchParams(window.location.search);
                    const songId = params.get('song');
                    if (songId && todasLasCanciones.some(c => c.id === songId)) abrirCancion(songId);
                }
            });

            iniciarNotasPersonales();

            // Keep Sunday's existing document and give Wednesday an independent list.
            Object.entries(Servicios.dias).forEach(([dia, config]) => {
                escucharDatos(db.collection('configuracion').doc(config.documento),{ includeMetadataChanges: true }, doc => {
                    estadoConexion.listas[dia] = true;
                    estadoConexion.pendientes[dia] = doc.metadata.hasPendingWrites;
                    verificarEstadoTotal();
                    playlistsPorDia[dia] = doc.exists ? (doc.data().canciones || []) : [];
                    renderizarLista();
                    if (tabActual === 'home') renderizarDashboard();
                });
            });
            escucharDatos(db.collection('roles').where('fecha', '>=', Servicios.hoy()).orderBy('fecha', 'asc'),snap => {
                    rolesProgramados = snap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                    rolesCargados = true;
                    errorRoles = false;
                    cargarRolServicio();
                    renderizarResumenServicio();
                    if (tabActual === 'home') renderizarDashboard();
                }, () => {
                    rolesCargados = true;
                    errorRoles = true;
                    cargarRolServicio();
                    renderizarResumenServicio();
                });

            // 4. Escuchar Colección de Usuarios del Grupo en tiempo real
            escucharDatos(db.collection('usuarios'),snap => {
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
            if (tab === 'playlist' || tab === 'wednesday') servicioActual = tab === 'playlist' ? 'domingo' : 'miercoles';
            document.getElementById('playlistDayTarget').value = servicioActual;
            document.getElementById('playlistDestination').hidden = tab !== 'all';
            document.getElementById('serviceRoleSummary').hidden = !esTabServicio();
            renderizarResumenServicio();
            document.getElementById('searchSummary').hidden = !['all', 'playlist', 'wednesday'].includes(tab);
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
                if(dashContainer) dashContainer.style.display = 'flex';
                renderizarDashboard(); // Refresca contadores y fechas del líder
            } else if (tab === 'rol') {
                document.getElementById('tabRol').classList.add('active');
                rolContainer.style.display = 'block';
                cargarRolServicio(); 
            } else {
                listContainer.style.display = 'flex';
                searchContainer.style.display = 'block';
                if(tab === 'all') document.getElementById('tabAll').classList.add('active');
                else document.getElementById(tab === 'wednesday' ? 'tabWednesday' : 'tabPlaylist').classList.add('active');
                renderizarLista();
            }
        }
        function renderizarLista() {
            // Keep realtime updates from replacing the card during a gesture.
            if (arrastreEnCurso) { refrescoTrasArrastre = true; return; }
            const lista = document.getElementById('songList');
            const searchContainer = document.querySelector('.search-container');
            const inputBusqueda = document.getElementById('searchInput');

            // Controlamos visibilidad de contenedores del repertorio según la pestaña
            if (tabActual === 'home' || tabActual === 'rol') {
                if (lista) lista.style.display = 'none';
                if (searchContainer) searchContainer.style.display = 'none';
            } else {
                if (lista) lista.style.display = 'flex';
                if (searchContainer) searchContainer.style.display = 'block';
            }

            if (!lista) return;
            
            // Evitamos que truene si el input de búsqueda aún no se monta en el DOM
            const busqueda = inputBusqueda ? normalizarBusqueda(inputBusqueda.value) : "";
            let html = '';
            
            let cancionesAMostrar = todasLasCanciones;
            if (esTabServicio()) {
                cancionesAMostrar = playlistActual().map(id => todasLasCanciones.find(c => c.id === id)).filter(c => c);
            }
            
            cancionesAMostrar = cancionesAMostrar.filter(c => coincideBusqueda(c, busqueda));
            const sugerencias = esTabServicio() && busqueda
                ? todasLasCanciones.filter(c => !playlistActual().includes(c.id) && coincideBusqueda(c, busqueda)) : [];
            const resumen = document.getElementById('searchSummary');
            resumen.hidden = !['all', 'playlist', 'wednesday'].includes(tabActual);
            resumen.textContent = `${cancionesAMostrar.length} ${cancionesAMostrar.length === 1 ? 'canción' : 'canciones'}${busqueda ? ' encontradas' : ''}`;
            if (esTabServicio() && busqueda) resumen.textContent = `${cancionesAMostrar.length} en la lista · ${sugerencias.length} del repertorio para agregar`;
            if (inputBusqueda) inputBusqueda.placeholder = esTabServicio() ? 'Buscar en la lista y en el repertorio…' : 'Buscar canción o artista…';

            if (cancionesAMostrar.length === 0 && sugerencias.length === 0) {
                lista.innerHTML = `<li class="empty-state"><i class="fas fa-music" aria-hidden="true"></i><h3>${busqueda ? 'Sin coincidencias' : esTabServicio() ? `El ${Servicios.dias[servicioActual].nombre.toLowerCase()} aún no tiene canciones` : 'Tu repertorio está por comenzar'}</h3><p>${busqueda ? 'Prueba con otro título o con el nombre del artista.' : esTabServicio() ? 'Explora el repertorio y usa + para añadir canciones.' : 'Las canciones aparecerán aquí cuando se agreguen.'}</p>${busqueda ? '<button class="btn btn-secondary" onclick="limpiarBusqueda()">Limpiar búsqueda</button>' : esTabServicio() ? '<button class="btn btn-primary" onclick="cambiarTab(&quot;all&quot;)">Explorar repertorio</button>' : ''}</li>`;
                return; 
            }

            [...cancionesAMostrar, ...sugerencias].forEach((c, indice) => {
                const enPlaylist = playlistActual().includes(c.id);
                const sugerida = esTabServicio() && !enPlaylist;
                if (sugerida && indice === cancionesAMostrar.length) html += '<li class="song-search-heading">Del repertorio · Agregar a ' + Servicios.dias[servicioActual].nombre + '</li>';
                
                let btnAccion = tabActual === 'all' ? 
                    (enPlaylist ? `<div class="action-btn btn-add added" onclick="togglePlaylist('${c.id}', event)"><i class="fas fa-check"></i></div>` : `<div class="action-btn btn-add" onclick="togglePlaylist('${c.id}', event)"><i class="fas fa-plus"></i></div>`) :
                    `<div class="action-btn btn-remove" onclick="togglePlaylist('${c.id}', event)"><i class="fas fa-minus"></i></div>`;
                if (sugerida) {
                    const agregando = cancionesAgregandose.has(servicioActual + ':' + c.id);
                    btnAccion = `<button type="button" class="action-btn btn-add song-add-to-service" ${agregando ? 'disabled' : ''} onclick="agregarALista('${c.id}', event)"><i class="fas fa-${agregando ? 'spinner fa-spin' : 'plus'}" aria-hidden="true"></i> ${agregando ? 'Agregando…' : 'Agregar a ' + Servicios.dias[servicioActual].nombre}</button>`;
                }

                let btnEliminarAdmin = '';
                if (tabActual === 'all' && Permisos.puedeEliminar(usuarioActual)) {
                    btnEliminarAdmin = `
                        <div class="action-btn" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; margin-right: 8px;" 
                            onclick="eliminarCancionDirecto('${c.id}', '${c.titulo.replace(/'/g, "\\'")}', event)">
                            <i class="fas fa-trash"></i>
                        </div>`;
                }

                const dragHandle = esTabServicio() && enPlaylist ? `<div class="drag-handle"><i class="fas fa-grip-lines"></i></div>` : '';

                html += `
                <li class="song-item${sugerida ? ' song-suggestion' : ''}" data-id="${c.id}" onclick="abrirCancion('${c.id}')">
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
            if (esTabServicio()) inicializarArrastre();
        }

        function agregarALista(id, event) {
            event.stopPropagation();
            if (!Permisos.puedeEditar(usuarioActual) || !esTabServicio() || playlistActual().includes(id)
                || !todasLasCanciones.some(c => c.id === id)) return;
            const dia = servicioActual, clave = dia + ':' + id;
            if (cancionesAgregandose.has(clave)) return;
            cancionesAgregandose.add(clave);
            renderizarLista();
            return db.collection('configuracion').doc(Servicios.dias[dia].documento)
                .set({ canciones: firebase.firestore.FieldValue.arrayUnion(id) }, { merge: true })
                .catch(() => Modal.alert('No se agregó la canción', 'Revisa tu conexión y los permisos de la lista e intenta de nuevo.'))
                .finally(() => { cancionesAgregandose.delete(clave); renderizarLista(); });
        }

        function togglePlaylist(id, event) {
            event.stopPropagation();
            let nuevaLista = [...playlistActual()];
            if (nuevaLista.includes(id)) nuevaLista = nuevaLista.filter(x => x !== id);
            else nuevaLista.push(id);
            db.collection('configuracion').doc(Servicios.dias[servicioActual].documento).set({ canciones: nuevaLista }, { merge: true })
                .catch(() => Modal.alert('No se guardó el cambio', 'Revisa tu conexión y los permisos de la lista e intenta de nuevo.'));
        }

        function abrirCancion(id) {
            const busqueda = normalizarBusqueda(document.getElementById('searchInput').value);
            let contextoCanciones = [];

            if (esTabServicio()) {
                contextoCanciones = playlistActual()
                    .map(playlistId => todasLasCanciones.find(c => c.id === playlistId))
                    .filter(c => c !== undefined); 
            } else {
                contextoCanciones = todasLasCanciones;
            }

            if(busqueda) {
                contextoCanciones = contextoCanciones.filter(c => coincideBusqueda(c, busqueda));
                if (esTabServicio()) contextoCanciones.push(...todasLasCanciones.filter(c => !playlistActual().includes(c.id) && coincideBusqueda(c, busqueda)));
            }

            const regreso = new URLSearchParams(window.location.search).get('saved') === '1' ? ExperienciaLectura.retorno(usuarioActual?.uid, id) : null;
            if (regreso && Array.isArray(regreso.navegacion)) {
                const ids = regreso.navegacion.filter(item => todasLasCanciones.some(c => c.id === item));
                if (ids.includes(id)) contextoCanciones = ids.map(item => todasLasCanciones.find(c => c.id === item));
                if (['home', 'all', 'playlist', 'wednesday', 'rol'].includes(regreso.tab)) cambiarTab(regreso.tab);
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

        let notasLocales = { canciones: {} };
        let detenerNotas = null;
        let detenerNotaActual = null;
        let documentoNotaEscuchada = null;
        let notasConsultadas = false;
        let errorNotas = false;
        let secuenciaNota = 0;
        const enviosNotas = new Set();
        function claveNotasLocales() { return 'alabanza_notas_v2_' + usuarioActual.uid; }
        function persistirNotasLocales() {
            if (usuarioActual) return ExperienciaLectura.guardar(claveNotasLocales(), notasLocales);
            return false;
        }
        function mostrarNotasActuales() {
            if (!cancionActual || !usuarioActual) return;
            const nuevas = ExperienciaLectura.notasVisibles(notasLocales, cancionActual.id);
            if (JSON.stringify(nuevas) === JSON.stringify(notasDeLaCancion)) return;
            notasDeLaCancion = nuevas;
            if (document.getElementById('viewSong').style.display === 'flex') renderizarLetra();
        }
        function iniciarNotasPersonales() {
            if (detenerNotas) detenerNotas();
            const usuario = usuarioActual;
            notasLocales = ExperienciaLectura.leer(claveNotasLocales(), { canciones: {} });
            if (!notasLocales || typeof notasLocales.canciones !== 'object' || !notasLocales.canciones) notasLocales = { canciones: {} };
            notasConsultadas = false;
            errorNotas = false;
            // Query existing owned documents: reading a nonexistent document can be
            // denied by ownership rules, and older notes may use a different ID.
            detenerNotas = db.collection('notas_personales').where('usuarioEmail', '==', usuario.email)
                .onSnapshot({ includeMetadataChanges: true }, snap => {
                    if (!usuarioActual || usuarioActual.uid !== usuario.uid) return;
                    if (detenerNotaActual) { detenerNotaActual(); detenerNotaActual = null; documentoNotaEscuchada = null; }
                    delete estadoConexion.pendientes.notaActual;
                    const recibidas = {};
                    snap.forEach(doc => {
                        const datos = doc.data();
                        const id = datos.cancionId || (doc.id.startsWith(usuario.uid + '_') ? doc.id.slice(usuario.uid.length + 1) : null);
                        if (!id) return;
                        const previa = recibidas[id];
                        // Prefer the canonical document when both old and new IDs exist.
                        const canonica = doc.id === usuario.uid + '_' + id;
                        recibidas[id] = {
                            documento: canonica || !previa ? doc.id : previa.documento,
                            documentos: [...new Set([...(previa?.documentos || []), doc.id])],
                            notas: canonica ? { ...(previa?.notas || {}), ...(datos.notas || {}) } : { ...(datos.notas || {}), ...(previa?.notas || {}) }
                        };
                    });
                    const ids = new Set([...Object.keys(notasLocales.canciones), ...Object.keys(recibidas)]);
                    ids.forEach(id => {
                        const previa = notasLocales.canciones[id] || {};
                        if (recibidas[id]) notasLocales.canciones[id] = { ...recibidas[id], pendientes: previa.pendientes || {} };
                        else if (!snap.metadata.fromCache) notasLocales.canciones[id] = { notas: {}, pendientes: previa.pendientes || {} };
                    });
                    if (!snap.metadata.fromCache) {
                        notasConsultadas = true;
                        notasLocales.sincronizadas = true;
                    }
                    errorNotas = false;
                    estadoConexion.pendientes.notas = snap.metadata.hasPendingWrites;
                    persistirNotasLocales();
                    mostrarNotasActuales();
                    verificarEstadoTotal();
                }, error => {
                    if (!usuarioActual || usuarioActual.uid !== usuario.uid) return;
                    errorNotas = true;
                    console.warn('No se pudieron sincronizar las notas personales.', error);
                    escucharNotaActualSiHaceFalta();
                    mostrarNotasActuales();
                    verificarEstadoTotal();
                });
            sincronizarNotasPendientes();
        }
        function escucharNotaActualSiHaceFalta() {
            if (!errorNotas || !usuarioActual || !cancionActual) return;
            const usuario = usuarioActual, id = cancionActual.id;
            const documento = usuario.uid + '_' + id;
            if (documentoNotaEscuchada === documento) return;
            if (detenerNotaActual) detenerNotaActual();
            delete estadoConexion.pendientes.notaActual;
            documentoNotaEscuchada = documento;
            // Some deployments allow individual owned documents but not queries.
            detenerNotaActual = db.collection('notas_personales').doc(documento).onSnapshot({ includeMetadataChanges: true }, doc => {
                if (usuarioActual?.uid !== usuario.uid || cancionActual?.id !== id) return;
                if (!doc.exists) return;
                const anterior = notasLocales.canciones[id] || {};
                notasLocales.canciones[id] = {
                    documento, documentos: anterior.documentos || [documento],
                    notas: doc.data().notas || {}, pendientes: anterior.pendientes || {}
                };
                estadoConexion.pendientes.notaActual = doc.metadata.hasPendingWrites;
                persistirNotasLocales();
                mostrarNotasActuales();
                verificarEstadoTotal();
            }, error => {
                if (usuarioActual?.uid === usuario.uid && cancionActual?.id === id) console.warn('La copia local de comentarios se conserva.', error);
            });
        }
        function cargarNotasYRenderizar() {
            if (!cancionActual) return;
            notasDeLaCancion = usuarioActual ? ExperienciaLectura.notasVisibles(notasLocales, cancionActual.id) : {};
            document.getElementById('songContent').scrollTop = 0;
            renderizarLetra();
            escucharNotaActualSiHaceFalta();
        }
        function guardarNotaEnNube(index, texto) {
            if (!usuarioActual || !cancionActual) return;
            const id = cancionActual.id;
            const estado = notasLocales.canciones[id] || (notasLocales.canciones[id] = { notas: {}, pendientes: {} });
            estado.pendientes ||= {};
            estado.pendientes[index] = { texto: texto || null, revision: Date.now() + '_' + (++secuenciaNota) };
            const guardada = persistirNotasLocales();
            mostrarNotasActuales();
            verificarEstadoTotal();
            if (!guardada && !navigator.onLine) Modal.alert('Almacenamiento no disponible', 'Mantén esta página abierta y vuelve a conectar para guardar tu comentario.');
            sincronizarNotasPendientes();
        }
        function sincronizarNotasPendientes() {
            if (!usuarioActual || !navigator.onLine) return;
            const usuario = usuarioActual;
            const almacen = notasLocales;
            Object.entries(almacen.canciones).forEach(([id, estado]) => {
                Object.entries(estado.pendientes || {}).forEach(([indice, cambio]) => {
                    const envio = usuario.uid + '_' + id + '_' + indice;
                    if (enviosNotas.has(envio)) return;
                    enviosNotas.add(envio);
                    const documento = estado.documento || usuario.uid + '_' + id;
                    const destinos = cambio.texto === null ? [...new Set([documento, ...(estado.documentos || [])])] : [documento];
                    Promise.all(destinos.map(destino => db.collection('notas_personales').doc(destino).set({
                        usuarioEmail: usuario.email, cancionId: id,
                        notas: { [indice]: cambio.texto === null ? firebase.firestore.FieldValue.delete() : cambio.texto }
                    }, { merge: true }))).then(() => {
                        if (!usuarioActual || usuarioActual.uid !== usuario.uid || almacen !== notasLocales) return;
                        const actual = notasLocales.canciones[id];
                        if (cambio.texto === null) delete actual.notas[indice];
                        else actual.notas[indice] = cambio.texto;
                        actual.documento = documento;
                        if (actual.pendientes?.[indice]?.revision === cambio.revision) delete actual.pendientes[indice];
                        persistirNotasLocales();
                    }).catch(error => {
                        console.warn('El comentario se conserva pendiente en este dispositivo.', error);
                    }).finally(() => {
                        enviosNotas.delete(envio);
                        if (!usuarioActual || usuarioActual.uid !== usuario.uid || almacen !== notasLocales) return;
                        verificarEstadoTotal();
                        const siguiente = notasLocales.canciones[id]?.pendientes?.[indice];
                        if (siguiente && siguiente.revision !== cambio.revision) sincronizarNotasPendientes();
                    });
                });
            });
        }

        function agregarNota(index) {
            const cancionEditada = cancionActual?.id;
            const usuarioEditando = usuarioActual?.uid;
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
                if (cancionActual?.id !== cancionEditada || usuarioActual?.uid !== usuarioEditando) return;
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
            if (cancionActual && document.getElementById('viewSong').style.display === 'flex') {
                cargarPreferenciasCancion();
                renderizarLetra();
            }
        }

        function alternarAcordes() {
            document.body.classList.toggle('hide-chords');
            const btnIcon = document.querySelector('#btnToggleChords i');
            btnIcon.className = document.body.classList.contains('hide-chords') ? "fas fa-eye" : "fas fa-eye-slash";
            actualizarBotonAcordes();
            guardarPreferenciasCancion();
            solicitarAjusteBateria();
        }

        function detectarSeccionAutomatica(linea) {
            const texto = linea.trim();
            const regexInicio = /^(intro|verso|estrofa|pre-?coro|coro(?=\s*(?:\d+\s*)?(?:x\d+\s*)?[:\.]?$)|puente|intermedio|instrumental|final|salida|outro)[\s\w\d\.]*(x\d+)?[:\.]?$/i;
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
            pausarDesplazamientoLetra();
            const scrollAnterior = document.getElementById('songContent').scrollTop;
            let texto = cancionActual.letraChordPro || '';
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
                let ocultarLinea = false;
                if (contenidoParaRenderizar.includes('[INICIO-SOLO-GT]')) { bloqueOcultoParaBateriaVoz = true; ocultarLinea = true; }
                if (contenidoParaRenderizar.includes('[FIN-SOLO-GT]')) { bloqueOcultoParaBateriaVoz = false; ocultarLinea = true; }
                if (contenidoParaRenderizar.includes('[INICIO-REPETICION]')) { bloqueOcultoParaGuitarraTeclado = true; ocultarLinea = true; }
                if (contenidoParaRenderizar.includes('[FIN-REPETICION]')) { bloqueOcultoParaGuitarraTeclado = false; ocultarLinea = true; }

                if (bloqueOcultoParaBateriaVoz && (rolActual === 'bateria' || rolActual === 'voz')) ocultarLinea = true;
                if (bloqueOcultoParaGuitarraTeclado && (rolActual === 'guitarra' || rolActual === 'teclado')) ocultarLinea = true;

                if (contenidoParaRenderizar.includes('[REPETICION]')) {
                    if (rolActual !== 'bateria' && rolActual !== 'voz') ocultarLinea = true;
                    contenidoParaRenderizar = contenidoParaRenderizar.replace('[REPETICION]', '').trim();
                }
                if (contenidoParaRenderizar.includes('[SOLO-G-T]')) {
                    if (rolActual === 'bateria' || rolActual === 'voz') ocultarLinea = true;
                    contenidoParaRenderizar = contenidoParaRenderizar.replace('[SOLO-G-T]', '').trim();
                }
                // Role filters hide lyrics, but personal reminders keep their original line index.
                if (ocultarLinea) {
                    if (!notasDeLaCancion[idx]) return;
                    contenidoParaRenderizar = '';
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

                let htmlNota = textoNotaLimpio ? `<button type="button" class="note-card" onclick="editarNota(${idx}, event)" aria-label="Editar nota: ${escaparLectura(textoNotaLimpio)}"><i class="fas fa-pen" aria-hidden="true"></i><span>${escaparLectura(textoNotaLimpio)}</span></button>` : '';
                let htmlLinea = '';
                
                if (ocultarLinea) {
                    htmlLinea = '';
                } else if (esTituloSeccion) {
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
                                const textoProcesado = rawText;
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
            actualizarEstructuraCancion();
            container.scrollTop = scrollAnterior;

            // All instruments read vertically; legacy newspaper columns can
            // push remaining verses outside the viewport when height is constrained.
            container.classList.remove('lyrics-cols-bate');
            container.style.width = '';
            aplicarTamanoLectura();
        }
        function actualizarVisibilidadSecciones() {
            const ocultas = ExperienciaLectura.leer('alabanza_ocultar_secciones', false) === true;
            const disponible = seccionesLectura.length > 0;
            document.getElementById('songStructure').hidden = ocultas || !disponible;
            const boton = document.getElementById('readerSections');
            boton.hidden = !disponible;
            boton.setAttribute('aria-expanded', String(disponible && !ocultas));
            boton.setAttribute('aria-label', ocultas ? 'Mostrar secciones' : 'Ocultar secciones');
        }
        function alternarSeccionesLectura() {
            const ocultar = !document.getElementById('songStructure').hidden;
            ExperienciaLectura.guardar('alabanza_ocultar_secciones', ocultar);
            actualizarVisibilidadSecciones();
            solicitarAjusteBateria();
        }
        function actualizarEstructuraCancion() {
            const nav = document.getElementById('songStructure');
            const titulos = document.querySelectorAll('#songContent .struct-btn');
            nav.replaceChildren();
            seccionesLectura = [];
            titulos.forEach(titulo => {
                const linea = titulo.closest('.line-wrapper');
                const indice = linea.dataset.index;
                linea.id = 'song-section-' + indice;
                linea.tabIndex = -1;
                const boton = document.createElement('button');
                boton.type = 'button';
                boton.textContent = titulo.textContent;
                boton.className = 'structure-button';
                const color = Array.from(titulo.classList).find(clase => clase.startsWith('tag-'));
                if (color) boton.classList.add(color);
                boton.setAttribute('aria-controls', linea.id);
                boton.setAttribute('aria-label', 'Ir a ' + titulo.textContent);
                boton.addEventListener('click', () => irASeccionCancion(linea.id, boton));
                nav.append(boton);
                seccionesLectura.push({ linea, boton });
            });
            actualizarVisibilidadSecciones();
        }
        function irASeccionCancion(id, boton) {
            pausarDesplazamientoLetra();
            const linea = document.getElementById(id);
            if (!linea) return;
            const contenido = document.getElementById('songContent');
            seleccionarSeccionLectura(linea, boton);
            // A fitted drum sheet is already visible; emphasize the requested section.
            const hoja = contenido.querySelector('.drum-sheet');
            if (!hoja || hoja.classList.contains('drum-sheet-overflow')) {
                const top = contenido.scrollTop + linea.getBoundingClientRect().top - contenido.getBoundingClientRect().top - 20;
                contenido.scrollTo({ top: Math.max(0, top), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
            }
            linea.focus({ preventScroll: true });
        }
        function escaparLectura(texto) {
            return String(texto).replace(/[&<>"']/g, caracter => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[caracter]));
        }
        let lecturaContinua = false;
        let desplazamientoActivo = false;
        let desplazamientoFrame = null;
        let desplazamientoTiempo = null;
        let desplazamientoPosicion = 0;
        function pausarDesplazamientoLetra() {
            desplazamientoActivo = false;
            cancelAnimationFrame(desplazamientoFrame);
            desplazamientoFrame = null;
            desplazamientoTiempo = null;
            const boton = document.getElementById('readerPlay');
            boton.setAttribute('aria-pressed', 'false');
            boton.setAttribute('aria-label', 'Iniciar desplazamiento de letra');
            boton.querySelector('i').className = 'fas fa-play';
            document.getElementById('readerPlayLabel').textContent = 'Auto';
        }
        function alternarDesplazamientoLetra() {
            if (desplazamientoActivo) { pausarDesplazamientoLetra(); return; }
            if (!cancionActual) return;
            // Continuous reading uses the vertical layout, including on desktop drums.
            if (!lecturaContinua) {
                lecturaContinua = true;
                guardarPreferenciasCancion();
                renderizarLetra();
            }
            const contenido = document.getElementById('songContent');
            desplazamientoActivo = true;
            desplazamientoPosicion = contenido.scrollTop;
            desplazamientoTiempo = null;
            const boton = document.getElementById('readerPlay');
            boton.setAttribute('aria-pressed', 'true');
            boton.setAttribute('aria-label', 'Pausar desplazamiento de letra');
            boton.querySelector('i').className = 'fas fa-pause';
            document.getElementById('readerPlayLabel').textContent = 'Pausa';
            activarPantalla();
            desplazamientoFrame = requestAnimationFrame(avanzarDesplazamientoLetra);
        }
        function avanzarDesplazamientoLetra(tiempo) {
            if (!desplazamientoActivo) return;
            const contenido = document.getElementById('songContent');
            const limite = Math.max(0, contenido.scrollHeight - contenido.clientHeight);
            if (!cancionActual || document.hidden || document.getElementById('viewSong').style.display === 'none' || contenido.scrollTop >= limite - 1) {
                pausarDesplazamientoLetra(); return;
            }
            if (desplazamientoTiempo !== null) {
                const segundos = Math.min(100, tiempo - desplazamientoTiempo) / 1000;
                const linea = contenido.querySelector('.song-line:not(.empty-line)');
                const altoLinea = linea ? parseFloat(getComputedStyle(linea).lineHeight) || 30 : 30;
                const pulsos = Ritmo.compases[Ritmo.compas(currentTimeSig)].pulsos;
                const factor = Number(document.getElementById('readerScrollSpeed').value) || 1;
                // One lyric line per bar is a starting estimate, adjustable by the musician.
                desplazamientoPosicion = Math.min(limite, desplazamientoPosicion + altoLinea * Ritmo.bpm(currentBpm) / 60 / pulsos * factor * segundos);
                contenido.scrollTop = desplazamientoPosicion;
            }
            desplazamientoTiempo = tiempo;
            desplazamientoFrame = requestAnimationFrame(avanzarDesplazamientoLetra);
        }
        const superficieLectura = document.getElementById('songContent');
        ['wheel', 'touchstart', 'pointerdown'].forEach(tipo => superficieLectura.addEventListener(tipo, pausarDesplazamientoLetra, { passive: true }));
        superficieLectura.addEventListener('keydown', evento => {
            if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(evento.key)) pausarDesplazamientoLetra();
        });
        document.addEventListener('visibilitychange', () => { if (document.hidden) pausarDesplazamientoLetra(); });
        let tamanoLectura = Math.max(16, Math.min(26, Number(ExperienciaLectura.leer('alabanza_letra_tamano')) || 19));
        let tamanoBateria = Math.max(12, Math.min(24, Number(ExperienciaLectura.leer('alabanza_bateria_tamano')) || 19));
        let ajusteBateriaFrame = null;
        function aplicarTamanoLectura() {
            const formato = document.getElementById('readerLayout');
            formato.hidden = !VistaBateria.activa(rolActual);
            formato.setAttribute('aria-pressed', String(lecturaContinua));
            formato.setAttribute('aria-label', lecturaContinua ? 'Usar columnas para batería' : 'Usar lectura vertical');
            formato.title = lecturaContinua ? 'Usar columnas para batería' : 'Usar lectura vertical';
            const bateria = (VistaBateria.activa(rolActual) && !lecturaContinua);
            const fuente = bateria ? tamanoBateria : tamanoLectura;
            document.getElementById('viewSong').style.setProperty('--reader-font', tamanoLectura + 'px');
            document.getElementById('readerSmaller').disabled = fuente <= (bateria ? 12 : 16);
            document.getElementById('readerLarger').disabled = fuente >= (bateria ? 24 : 26);
            solicitarAjusteBateria();
        }
        function alternarFormatoLectura() {
            pausarDesplazamientoLetra();
            lecturaContinua = !lecturaContinua;
            guardarPreferenciasCancion();
            renderizarLetra();
        }
        function cambiarTamanoLectura(cambio) {
            if ((VistaBateria.activa(rolActual) && !lecturaContinua)) {
                tamanoBateria = Math.max(12, Math.min(24, tamanoBateria + cambio));
                ExperienciaLectura.guardar('alabanza_bateria_tamano', tamanoBateria);
            } else {
                tamanoLectura = Math.max(16, Math.min(26, tamanoLectura + cambio));
                ExperienciaLectura.guardar('alabanza_letra_tamano', tamanoLectura);
            }
            guardarPreferenciasCancion();
            aplicarTamanoLectura();
        }
        function solicitarAjusteBateria() {
            cancelAnimationFrame(ajusteBateriaFrame);
            ajusteBateriaFrame = requestAnimationFrame(() => {
                const visor = document.getElementById('viewSong');
                const contenido = document.getElementById('songContent');
                const activa = (VistaBateria.activa(rolActual) && !lecturaContinua);
                visor.classList.toggle('drummer-desktop', activa);
                const estado = document.getElementById('drumFitStatus');
                estado.hidden = !activa;
                document.getElementById('readerSizeLabel').textContent = activa ? 'Vista de batería · ajuste automático' : 'Tamaño de letra';
                if (!activa) {
                    VistaBateria.restaurar(contenido);
                    restaurarRetornoEditor();
                    actualizarSeccionVisible();
                    return;
                }
                if (!cancionActual || !visor.clientHeight || !contenido.querySelector('.section-block')) return;
                const resultado = VistaBateria.ajustar(contenido, tamanoBateria);
                if (resultado) estado.textContent = resultado.completo
                    ? `${resultado.columnas} ${resultado.columnas === 1 ? 'columna' : 'columnas'} · ${resultado.fuente} px · Canción completa`
                    : 'Canción extensa: amplía la ventana o usa pantalla completa. Se conserva el scroll para no ocultar letra.';
                restaurarRetornoEditor();
                actualizarSeccionVisible();
            });
        }
        window.addEventListener('resize', aplicarTamanoLectura);
        window.matchMedia(VistaBateria.media).addEventListener('change', aplicarTamanoLectura);
        if (document.fonts) document.fonts.ready.then(solicitarAjusteBateria);
        function bl(a, l) { return `<div class="chord-group"><div class="chord">${a || '&nbsp;'}</div><div class="lyric">${(l === '' || l === undefined) ? '&nbsp;' : l}</div></div>`; }
        function editarCancionActual() {
            if (!cancionActual || !Permisos.puedeEditar(usuarioActual)) return;
            pausarDesplazamientoLetra();
            guardarPreferenciasCancion();
            ExperienciaLectura.guardar('alabanza_editor_return', capturarRetornoEditor(), sessionStorage);
            window.location.href = 'admin.html?edit=' + encodeURIComponent(cancionActual.id);
        }
        
        function toggleTransposer(event) {
            if(event) event.stopPropagation();
            const p = document.getElementById('transposerPanel');
            p.style.display = (p.style.display === 'flex') ? 'none' : 'flex';
        }
        function transponer(d) { semitonos += d; renderizarLetra(); }
        function resetTono() { semitonos=0; renderizarLetra(); }
        function cn(n, d) { let no=n.trim(), r=no.substring(0,1), s=no.substring(1); if(no.length>1&&(no[1]=='#'||no[1]=='b')){r=no.substring(0,2);s=no.substring(2);} const b={'Db':'C#','Eb':'D#','Gb':'F#','Ab':'G#','Bb':'A#'}; if(b[r])r=b[r]; let i=NOTAS.indexOf(r); if(i===-1)return no; let ni=(i+d)%12; if(ni<0)ni+=12; return NOTAS[ni]+s; }
        
        let sortableInstance = null;
        let arrastreEnCurso = false;
        let refrescoTrasArrastre = false;
        function inicializarArrastre() {
            const el = document.getElementById('songList');
            if (!el || typeof Sortable === 'undefined') return;
            if (sortableInstance) { sortableInstance.destroy(); sortableInstance = null; }
            const diaArrastre = servicioActual;
            const movimientoReducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            sortableInstance = Sortable.create(el, {
                draggable: '.song-item:not(.song-suggestion)',
                // The full card can be picked up; action buttons keep their own clicks.
                filter: '.action-btn, button, a, input, select',
                preventOnFilter: false,
                animation: movimientoReducido ? 0 : 320,
                easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                ghostClass: 'playlist-placeholder',
                chosenClass: 'playlist-chosen',
                dragClass: 'playlist-dragging',
                fallbackClass: 'playlist-floating',
                forceFallback: true,
                fallbackOnBody: true,
                fallbackTolerance: 3,
                delay: 180,
                delayOnTouchOnly: true,
                touchStartThreshold: 4,
                scrollSensitivity: 70,
                scrollSpeed: 8,
                onChoose: function () {
                    document.body.classList.add('playlist-pointer-held');
                },
                onUnchoose: function () {
                    document.body.classList.remove('playlist-pointer-held');
                },
                onStart: function () {
                    arrastreEnCurso = true;
                    el.classList.add('playlist-sorting');
                    if (!movimientoReducido && navigator.vibrate) navigator.vibrate(12);
                },
                onEnd: function (evento) {
                    el.classList.remove('playlist-sorting');
                    document.body.classList.remove('playlist-pointer-held');
                    const cambio = evento.oldDraggableIndex !== evento.newDraggableIndex;
                    if (cambio) {
                        evento.item.classList.add('playlist-landed');
                        const visibles = Array.from(el.querySelectorAll('.song-item:not(.song-suggestion)')).map(item => item.dataset.id);

                        // Searching must never remove songs hidden by the filter.
                        const nuevoOrden = Servicios.reordenar(playlistsPorDia[diaArrastre], visibles);
                        db.collection('configuracion').doc(Servicios.dias[diaArrastre].documento)
                            .set({ canciones: nuevoOrden, ultimaEdicion: new Date() }, { merge: true })
                            .catch(() => {
                                Modal.alert('No se guardó el orden', 'Revisa tu conexión e intenta mover la canción de nuevo.');
                                renderizarLista();
                            });
                        const resumen = document.getElementById('searchSummary');
                        resumen.textContent = `Canción movida a la posición ${evento.newDraggableIndex + 1} de ${visibles.length}`;
                        if (!movimientoReducido && navigator.vibrate) navigator.vibrate(8);
                    }
                    // Let the landing finish before applying incoming snapshots.
                    window.setTimeout(() => {
                        evento.item.classList.remove('playlist-landed');
                        arrastreEnCurso = false;
                        if (refrescoTrasArrastre) {
                            refrescoTrasArrastre = false;
                            renderizarLista();
                        }
                    }, movimientoReducido ? 0 : 560);
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
            const esNota = e.target.closest('.note-card');
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
let isSubdivisionOn = false; // Subdivide the main pulse into two or three clicks.
let metronomeTimerID = null;
let nextNoteTime = 0.0;
let currentBpm = 120;
let currentTimeSig = '4/4';
let metronomeGeneration = 0;
const clicksProgramados = new Set();
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
function actualizarControlesRitmo() {
    const btn = document.getElementById('btnSubdivision');
    const division = Ritmo.compases[currentTimeSig].subdivision;
    btn.classList.toggle('active', isSubdivisionOn);
    btn.textContent = isSubdivisionOn ? `×${division}` : 'Pulso';
    btn.setAttribute('aria-pressed', String(isSubdivisionOn));
    btn.setAttribute('aria-label', `Subdividir cada pulso en ${division} clics`);
    document.getElementById('metronomeHelp').textContent = Ritmo.descripcion(currentTimeSig);
}
function reiniciarMetronomo() {
    if (isMetronomeOn) { toggleMetronome(); toggleMetronome(); }
}
function toggleSubdivision() {
    isSubdivisionOn = !isSubdivisionOn;
    actualizarControlesRitmo();
    reiniciarMetronomo();
}

function toggleMetronome() {
    initAudio();
    isMetronomeOn = !isMetronomeOn;
    metronomeGeneration++;
    const btn = document.getElementById('btnMetronomeDock');
    btn.setAttribute('aria-label', isMetronomeOn ? 'Detener metrónomo' : 'Iniciar metrónomo');
    btn.setAttribute('aria-pressed', String(isMetronomeOn));
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
        clicksProgramados.forEach(osc => { try { osc.stop(); } catch (_) {} });
        clicksProgramados.clear();
    }
}

function nextNote() {
    const paso = Ritmo.paso(currentTimeSig, currentBpm, isSubdivisionOn, currentBeat);
    nextNoteTime += paso.segundos;
    currentBeat = (currentBeat + 1) % paso.total;
}

function scheduleNote(time) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const paso = Ritmo.paso(currentTimeSig, currentBpm, isSubdivisionOn, currentBeat);
    const generacion = metronomeGeneration;
    // --- SONIDOS DIFERENTES ---
    // 1. Beat 1 (Fuerte - TIC)
    if (paso.acento) {
        osc.frequency.value = 1500; 
        gain.gain.value = 1;
    } 
    // 2. Subdivisión (Contratiempo - tuc suave)
    // Integer tick positions prevent drift in compound subdivisions.
    else if (!paso.principal) {
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

    clicksProgramados.add(osc);
    osc.onended = () => clicksProgramados.delete(osc);
    osc.start(time);
    osc.stop(time + 0.05);

    // LED follows main pulses; capture the scheduled accent before advancing.
    if (paso.principal) {
        const drawTime = (time - audioCtx.currentTime) * 1000;
        setTimeout(() => {
            if (!isMetronomeOn || generacion !== metronomeGeneration) return;
            const led = document.getElementById('tempoLed');
            if(led) {
                led.classList.add('flash');
                led.style.backgroundColor = paso.acento ? '#00ff00' : '#444'; // Verde en el 1
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

function updateBpm(val) {
    currentBpm = Ritmo.bpm(val);
    document.getElementById('bpmInput').value = currentBpm;
    reiniciarMetronomo();
}
function updateTimeSig(val) {
    currentTimeSig = Ritmo.compas(val);
    currentBeat = 0;
    document.getElementById('timeSigInput').value = currentTimeSig;
    actualizarControlesRitmo();
    reiniciarMetronomo();
}

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
            const offline = await window.AlabanzaAudioOffline?.getPad(key);
            let arrayBuffer;
            if (offline?.blob) {
                arrayBuffer = await offline.blob.arrayBuffer();
            } else {
                const preview = location.pathname.startsWith('/alabanza-preview/');
                const source = preview ? 'https://joshuagg86.github.io/alabanza/' + fileName : fileName;
                const response = await fetch(source);
                if (!response.ok) throw new Error("No pad: " + fileName);
                arrayBuffer = await response.arrayBuffer();
            }
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
        function actualizarEncabezadoCancion() {
            document.getElementById('viewTitle').innerText = cancionActual.titulo;
            document.getElementById('viewArtist').innerText = cancionActual.artista;
            document.getElementById('currentToneDisplay').innerText = cancionActual.tonoOriginal;
            document.getElementById('viewBPM').innerText = cancionActual.bpm || '-';
            document.getElementById('viewCompas').innerText = cancionActual.compas || '-';

        }
        function actualizarVistaCancion(id) {
            pausarDesplazamientoLetra();
            if (cancionActual) guardarPreferenciasCancion();
            lecturaContinua = false;
            cancionActual = todasLasCanciones.find(c => c.id === id);
            if (!cancionActual) return;
            window.dispatchEvent(new CustomEvent('alabanza:song-opened', {detail:{song:cancionActual}}));
            window.EnsayoMusical?.abrir(cancionActual, usuarioActual);
            cargarPreferenciasCancion();
            const paramsRetorno = new URLSearchParams(window.location.search);
            if (paramsRetorno.get('saved') === '1') {
                retornoEditorPendiente = ExperienciaLectura.retorno(usuarioActual?.uid, id);
                if (!retornoEditorPendiente) mostrarToastLector('Canción guardada');
            }
            semitonos = 0;

            actualizarEncabezadoCancion();

            document.getElementById('btnPrevSong').disabled = (indiceNavegacion <= 0);
            document.getElementById('btnNextSong').disabled = (indiceNavegacion >= listaNavegacionActual.length - 1);

            document.getElementById('viewList').style.display = 'none';
            document.getElementById('viewSong').style.display = 'flex';
            
            cargarNotasYRenderizar();
            
            const btnEdit = document.getElementById('btnDirectEdit');
            if (Permisos.puedeEditar(usuarioActual)) btnEdit.style.display = 'flex';
            else btnEdit.style.display = 'none';


            // --- AUDIO DOCK UPDATE ---
            const dock = document.getElementById('audioDock');
            if (dock) {
                dock.classList.add('visible'); // El componente se monta en el visor, pero permanece oculto por CSS
            }
            // document.body.classList.remove('audio-dock-open'); <-- Asegúrate de que esta clase de padding no empuje la letra

            // Preserve stored BPM values and interpret compound meters by main pulse.
            currentBpm = Ritmo.bpm(cancionActual.bpm);
            document.getElementById('bpmInput').value = currentBpm;
            updateTimeSig(cancionActual.compas);

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
            window.EnsayoMusical?.cerrar();
            pausarDesplazamientoLetra();
            guardarPreferenciasCancion();
            if (modoEnsayo) establecerModoEnsayo(false);
            if (pantallaCompletaEnsayo && document.fullscreenElement) document.exitFullscreen().catch(() => {});
            pantallaCompletaEnsayo = false;
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
            if (!Permisos.puedeEditar(usuarioActual)) return;
            rolEditandoId = null; 
            document.getElementById('inputRolFecha').value = "";
            document.getElementById('inputRolC1').value = "";
            document.getElementById('inputRolC2').value = "";
            
            actualizarDiaRol();
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
            if (!Permisos.puedeEditar(usuarioActual)) return;
            rolEditandoId = id;
            
            // 🔥 Aseguramos que pinte la lista antes de asignarle el valor guardado
            cargarUsuariosEnSelector();
            
            document.getElementById('inputRolFecha').value = f;
            actualizarDiaRol();
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
            if (!Permisos.puedeEditar(usuarioActual)) return;
            const f = document.getElementById('inputRolFecha').value;
            const directorEmail = document.getElementById('inputRolDirUser').value;
            const c1 = document.getElementById('inputRolC1').value;
            const c2 = document.getElementById('inputRolC2').value;

            if (!Servicios.diaDeFecha(f) || !directorEmail) return alert("Por favor selecciona fecha y dirección");

            // Extraemos el nombre visible del correo para el renderizado de la tarjeta
            const nombreDirector = directorEmail.split('@')[0].toUpperCase();

            const datos = {
                fecha: f,
                diaServicio: Servicios.diaDeFecha(f),
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
            }).catch(() => Modal.alert("No se pudo guardar", "Tu rol sigue aquí. Revisa la conexión e intenta de nuevo."));
        }

        function eliminarRol(id, e) {
            e.stopPropagation();
            if (!Permisos.puedeEliminar(usuarioActual)) return;
            Modal.confirm("¿Eliminar fecha?", "Se borrará este rol del calendario.", "🗑️").then(conf => {
                if(conf) db.collection('roles').doc(id).delete();
            });
        }

        function actualizarDiaRol() {
            const dia = Servicios.diaDeFecha(document.getElementById('inputRolFecha').value);
            document.getElementById('rolDayHint').textContent = !dia
                ? 'Selecciona una fecha; el día del servicio se detectará automáticamente.'
                : dia === 'otro' ? 'Este servicio se mostrará en Roles → Otros días.'
                : `Este servicio se mostrará en ${Servicios.dias[dia].nombre} automáticamente.`;
        }
        function filtrarRoles(dia) {
            filtroRoles = dia;
            cargarRolServicio();
        }
        function crearTarjetaRol(rol, proximo) {
            const tarjeta = document.createElement('article');
            tarjeta.className = 'card rol-minimal-card' + (proximo ? ' proximo-servicio' : '');
            const fecha = document.createElement('h3');
            fecha.className = 'service-date';
            fecha.textContent = new Date(rol.fecha + 'T12:00:00').toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' });
            tarjeta.append(fecha);
            const campos = [['Dirige', rol.direccion], ...(rol.modalidad === 'completo' ? [['Equipo', 'Grupo completo']] : [['Coro 1', rol.coro1], ['Coro 2', rol.coro2]])];
            campos.forEach(([etiqueta, valor]) => {
                const fila = document.createElement('p');
                fila.className = 'service-person';
                const label = document.createElement('strong');
                label.textContent = etiqueta + ': ';
                fila.append(label, document.createTextNode(valor || 'Por asignar'));
                tarjeta.append(fila);
            });
            if (Permisos.puedeEditar(usuarioActual)) {
                const acciones = document.createElement('div');
                acciones.className = 'service-role-actions';
                const botones = [['Editar', e => editarRol(rol.id, rol.fecha, rol.directorEmail, rol.modalidad, rol.coro1 || '', rol.coro2 || '', e)]];
                if (Permisos.puedeEliminar(usuarioActual)) botones.push(['Eliminar', e => eliminarRol(rol.id, e)]);
                botones.forEach(([texto, handler]) => {
                    const boton = document.createElement('button');
                    boton.type = 'button'; boton.textContent = texto;
                    boton.addEventListener('click', handler);
                    acciones.append(boton);
                });
                tarjeta.append(acciones);
            }
            return tarjeta;
        }
        function cargarRolServicio() {
            document.getElementById('btnNuevoRol').style.display = Permisos.puedeEditar(usuarioActual) ? 'block' : 'none';
            document.querySelectorAll('.role-day-filters button').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.dia === filtroRoles);
                btn.setAttribute('aria-pressed', String(btn.dataset.dia === filtroRoles));
            });
            const container = document.getElementById('rolListaContainer');
            container.replaceChildren();
            // Derive from the date so existing roles work without a migration.
            const roles = rolesProgramados.filter(rol => filtroRoles === 'todos' || Servicios.diaDeFecha(rol.fecha) === filtroRoles);
            if (!roles.length || errorRoles) {
                const vacio = document.createElement('p'); vacio.className = 'empty-state';
                vacio.textContent = errorRoles ? 'No se pudo cargar el calendario. Revisa tu conexión.' : !rolesCargados ? 'Cargando servicios…' : 'No hay servicios programados para este día.';
                container.append(vacio);
            } else roles.forEach((rol, index) => container.append(crearTarjetaRol(rol, index === 0)));
        }
        function renderizarResumenServicio() {
            const container = document.getElementById('serviceRoleSummary');
            if (!esTabServicio()) return;
            container.replaceChildren();
            const encabezado = document.createElement('h2');
            encabezado.textContent = `Servicio del ${Servicios.dias[servicioActual].nombre.toLowerCase()}`;
            container.append(encabezado);
            const rol = rolesProgramados.find(item => Servicios.diaDeFecha(item.fecha) === servicioActual);
            if (rol) container.append(crearTarjetaRol(rol, true));
            else {
                const mensaje = document.createElement('p');
                mensaje.textContent = errorRoles ? 'No se pudo cargar el rol. Revisa tu conexión.' : !rolesCargados ? 'Cargando próximo servicio…' : 'Aún no hay un rol programado para este día. Puedes preparar sus canciones.';
                container.append(mensaje);
            }
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
            if (!Permisos.puedeEliminar(usuarioActual)) return;
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
        function verificarEstadoTotal() {
            const cola = Object.values(notasLocales.canciones).reduce((total, cancion) => total + Object.keys(cancion.pendientes || {}).length, 0);
            const pendientes = cola > 0 || Object.values(estadoConexion.pendientes).some(Boolean);
            const letras = window.persistenciaDisponible && estadoConexion.canciones;
            const listas = Object.keys(Servicios.dias).every(dia => estadoConexion.listas[dia]);
            const comentarios = !errorNotas && (notasConsultadas || notasLocales.sincronizadas === true);
            const preparado = letras && listas && comentarios && estadoConexion.archivos;
            let texto, tipo;
            if (pendientes) {
                texto = navigator.onLine ? 'Cambios pendientes de sincronizar' : 'Sin conexión · cambios pendientes';
                tipo = 'pending';
            } else if (!navigator.onLine) {
                texto = preparado ? 'Sin conexión · letras y comentarios disponibles' : letras ? 'Sin conexión · letras guardadas' : 'Sin conexión · contenido sin preparar';
                tipo = preparado || letras ? 'ready' : 'pending';
            } else if (preparado) {
                texto = 'Listas y comentarios disponibles sin conexión';
                tipo = 'ready';
            } else if (errorNotas) {
                texto = estadoConexion.canciones ? 'Letras disponibles · comentarios por sincronizar' : 'Con conexión · sincronización pendiente';
                tipo = 'pending';
            } else if (!window.persistenciaDisponible && window.persistenciaResuelta) {
                texto = 'Con conexión · almacenamiento local no disponible';
                tipo = 'pending';
            } else {
                texto = 'Preparando contenido sin conexión…';
                tipo = 'loading';
            }
            document.querySelectorAll('[data-connection-status]').forEach(el => {
                if (el.textContent !== texto) el.textContent = texto;
                el.dataset.state = tipo;
            });
            const icon = document.getElementById('syncIndicator');
            if (icon) {
                icon.style.color = tipo === 'ready' ? '#34d399' : '#b7a2e8';
                icon.innerHTML = tipo === 'ready' ? '<i class="fas fa-check-circle" aria-hidden="true"></i>' : '<i class="fas fa-cloud" aria-hidden="true"></i>';
                icon.title = texto;
                icon.setAttribute('aria-label', texto);
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

        function abrirPlaylistDashboard() {
            cambiarTab(Servicios.dias[document.getElementById('dashServiceDay').value].tab);
        }
        function renderizarDashboard() {
            // 1. Cargar Palabra Diaria (RV60)
            cargarVersiculoDiario();

            // 2. Renderizar nombres de canciones asignadas al Domingo (Consola Live)
            const cancionesContainer = document.getElementById('dashCancionesLista');
            const countEl = document.getElementById('dashPlaylistCount');
            
            if (cancionesContainer && countEl) {
                const cancionesDomingo = playlistsPorDia[document.getElementById('dashServiceDay').value].map(id => todasLasCanciones.find(c => c.id === id)).filter(c => c);
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

            const hoyStr = Servicios.hoy();

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
                                        <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">${dateObj.toLocaleDateString('es-MX', {weekday: 'long'})} (${diaNum} de ${mesStr.toLowerCase()}) estás al frente.</div>
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
// Reader lifecycle: manual scrolling, reconnecting and display changes.
document.getElementById('readerScrollSpeed').addEventListener('change', guardarPreferenciasCancion);
document.getElementById('songContent').addEventListener('scroll', programarSeccionVisible, { passive: true });
window.addEventListener('online', () => { sincronizarNotasPendientes(); comprobarArchivosOffline(); verificarEstadoTotal(); });
window.addEventListener('offline', verificarEstadoTotal);
window.addEventListener('alabanza-persistencia', verificarEstadoTotal);
document.addEventListener('fullscreenchange', () => {
    if (pantallaCompletaEnsayo && !document.fullscreenElement) {
        pantallaCompletaEnsayo = false;
        establecerModoEnsayo(false);
    }
});
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && document.getElementById('viewSong').style.display === 'flex') activarPantalla();
});
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', comprobarArchivosOffline);
    navigator.serviceWorker.ready.then(comprobarArchivosOffline);
}
verificarEstadoTotal();
