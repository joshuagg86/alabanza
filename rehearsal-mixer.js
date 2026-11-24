(function () {
    'use strict';
    const local = ['127.0.0.1', 'localhost'].includes(location.hostname);
    const endpoint = 'http://127.0.0.1:8765';
    const names = [['vocals', 'Voz', 'fa-microphone'], ['guitar', 'Guitarra', 'fa-guitar'],
        ['bass', 'Bajo', 'fa-guitar'], ['piano', 'Teclado', 'fa-keyboard'],
        ['drums', 'Batería', 'fa-drum'], ['other', 'Otros', 'fa-music']];
    const available = () => status?.stems || ['vocals', 'drums', 'bass', 'other'];
    const el = id => document.getElementById(id);
    let song = null, user = null, engine = null, status = null, timer = null;
    let generation = 0, controller = null, frame = null, loading = false, opened = false, seeking = false;
    let uploading = false;
    let settings = names.map(() => ({ volume: 100, mute: false, solo: false }));
    const format = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
    const admin = () => Boolean(user && status?.canPublish);
    const cloudConfig = () => window.REHEARSAL_CLOUD || {};
    const cloudEnabled = () => cloudConfig().enabled && /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(cloudConfig().url);
    async function cloudStatus(identifier) {
        const activeUser = firebase.auth().currentUser;
        if (!activeUser) throw new Error('Inicia sesión para acceder al audio.');
        const token = await activeUser.getIdToken();
        let response;
        if(!navigator.onLine)throw new Error('Sin conexión');
        try {
            response = await fetch(cloudConfig().url + '/functions/v1/rehearsal-audio?song=' + encodeURIComponent(identifier), {
                cache:'no-store', headers:{Authorization:'Bearer '+token, apikey:cloudConfig().publishableKey || ''} });
        } catch(error) {
            if(!navigator.onLine || /Failed to fetch|NetworkError|fetch failed/i.test(String(error.message||error)))
                throw new Error('Sin conexión');
            throw new Error('No se pudo conectar con el servicio de audio.');
        }
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.detail || 'No se pudo cargar el audio compartido.');
        }
        return response.json();
    }
    async function readStatus(identifier) {
        if (local) {
            try {
                const result = await (await request('/songs/'+encodeURIComponent(identifier))).json();
                if (result.ready && result.state==='listo' && result.cloudState==='publicado'
                        && cloudEnabled() && !engine && !loading) {
                    try {
                        const shared=await cloudStatus(identifier);
                        if (shared.ready) return shared;
                    } catch (_) { /* Retain the verified local copy if the cloud is temporarily unavailable. */ }
                }
                if (result.ready || !cloudEnabled()) return result;
            } catch (error) { if (!cloudEnabled()) throw error; }
        }
        if (cloudEnabled()) {
            const saved = await window.AlabanzaAudioOffline?.getSong(firebase.auth().currentUser?.uid, identifier);
            if (saved && (!navigator.onLine || window.Capacitor?.isNativePlatform?.()))
                return { ready:true,state:'listo',cloud:false,localOffline:true,
                    version:saved.version,stems:saved.stems,frames:saved.frames,sampleRate:saved.sampleRate };
            try { return await cloudStatus(identifier); }
            catch (error) {
                const cached = await window.AlabanzaAudioOffline?.getSong(firebase.auth().currentUser?.uid, identifier);
                if (cached) return { ready:true,state:'listo',cloud:false,localOffline:true,
                    version:cached.version,stems:cached.stems,frames:cached.frames,sampleRate:cached.sampleRate };
                throw error;
            }
        }
        throw new Error('El audio compartido aún no está configurado.');
    }
    function message(text, error = false) {
        el('rehearsalMessage').textContent = text;
        el('rehearsalMessage').dataset.error = String(error);
    }
    async function request(path, options = {}) {
        if (!local) throw new Error('El ensayo está disponible por ahora en la versión local del Mac.');
        const activeUser = firebase.auth().currentUser;
        if (!activeUser) throw new Error('Inicia sesión para acceder al audio.');
        const token = await activeUser.getIdToken();
        let response;
        try {
            response = await fetch(endpoint + path, { ...options, cache: 'no-store',
                headers: { ...options.headers, Authorization: 'Bearer ' + token } });
        } catch (error) {
            if (error.name === 'AbortError') throw error;
            throw new Error('Inicia el servicio de audio en tu Mac y pulsa Actualizar.');
        }
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(typeof body.detail === 'string' ? body.detail : 'No se pudo acceder al audio.');
        }
        return response;
    }
    function openPanel(value) {
        opened = value;
        const sheet=el('rehearsalPanel');
        let backdrop=el('rehearsalBackdrop');
        if(!backdrop){
            backdrop=document.createElement('div');
            backdrop.id='rehearsalBackdrop';
            backdrop.className='rehearsal-backdrop';
            backdrop.hidden=true;
            backdrop.addEventListener('click',()=>openPanel(false));
            document.body.appendChild(backdrop);
        }
        // Moving the modal to body avoids the reader's stacking context blurring it.
        // Reattach to reader when closed so the desktop split layout remains unchanged.
        const mobile=window.matchMedia('(max-width:767px)').matches;
        if(value&&mobile&&!sheet.dataset.modalMounted){
            sheet._originalParent=sheet.parentNode;
            sheet._originalNext=sheet.nextSibling;
            document.body.appendChild(sheet);
            sheet.dataset.modalMounted='true';
        }
        sheet.hidden=!value;
        backdrop.hidden=!value;
        if(!value&&sheet.dataset.modalMounted){
            if(sheet._originalParent)sheet._originalParent.insertBefore(sheet,sheet._originalNext);
            delete sheet.dataset.modalMounted;
        }
        el('rehearsalToggle').setAttribute('aria-expanded', String(value));
        el('viewSong').classList.toggle('mixer-open', value&&!mobile);
        document.body.classList.toggle('rehearsal-modal-open',value);
        // Closing the sheet never pauses or disposes the music.
        if(value){paint();if(!status?.ready)refresh();}
        window.dispatchEvent(new Event('resize'));
    }
    function paint() {
        const busy = loading || ['pendiente', 'procesando'].includes(status?.state);
        el('rehearsalUpload').hidden = !admin();
        el('rehearsalUpload').disabled = busy || !local;
        el('rehearsalUpload').textContent = uploading ? 'Subiendo canción…' : ['pendiente', 'procesando'].includes(status?.state) ? 'Separando instrumentos…' : status?.ready ? 'Reemplazar audio' : 'Subir y separar';
        el('rehearsalEntry').setAttribute('aria-busy', String(busy));
        el('rehearsalRefresh').disabled = uploading;
        const download=el('rehearsalOfflineDownload');
        if(download){
            download.hidden=!song||!cloudEnabled();
            download.disabled=download.dataset.saved==='true'||download.dataset.downloading==='true';
            if(download.dataset.saved==='true'){
                download.textContent='✓ Pistas descargadas';
                download.setAttribute('aria-label','Pistas guardadas sin conexión');
            }else if(!download.disabled){
                download.textContent='Descargar pistas';
            }
        }
        const transport=el('rehearsalPlay');
        transport.disabled=!status?.ready;
        transport.setAttribute('aria-label',engine?.playing?'Pausar':loading?'Preparando pistas':'Reproducir');
        transport.title=engine?.playing?'Pausar':loading?'Preparando pistas':'Reproducir';
        transport.innerHTML=engine?.playing
            ? '<i class="fas fa-pause" aria-hidden="true"></i>'
            : '<i class="fas fa-play" aria-hidden="true"></i>';
        transport.setAttribute('aria-busy',String(loading));
        el('rehearsalChannels').disabled = !engine || loading;
        el('rehearsalTimeline').disabled = !engine || loading;
        el('rehearsalBack').disabled = !engine || loading;
        el('rehearsalForward').disabled = !engine || loading;
        el('rehearsalPreset').disabled = !engine || loading;
        el('rehearsalReset').disabled = !engine || loading;
        el('rehearsalPublish').hidden = !local || !admin() || !status?.ready || status?.cloud || !['error','sin_configurar'].includes(status?.cloudState);
        const cloudLabels = {pendiente:'Preparando subida automática…',subiendo:'Subiendo a la nube…',publicado:'Disponible para el grupo',error:'Audio local listo · subida pendiente'};
        el('rehearsalLocation').textContent = status?.localOffline ? 'Descargado · sin conexión' : status?.cloud ? 'Audio compartido · nube' : status?.cloudState ? (cloudLabels[status.cloudState] || 'Audio pendiente') : cloudEnabled() && !local ? 'Audio privado · esperando conexión' : 'Prueba local · este Mac';
        names.forEach(([name]) => { el('mix-channel-' + name).hidden = Boolean(status?.ready && !available().includes(name)); });
        Array.from(el('rehearsalPreset').options).forEach(option => {
            const instrument = option.value.split(':')[1];
            option.disabled = Boolean(instrument && !available().includes(instrument));
        });
        const labels = { pendiente: 'En espera', procesando: 'Separando instrumentos…', listo: status?.stems?.includes('guitar') ? 'Instrumentos del grupo listos' : 'Audio anterior · cuatro pistas',
            sin_audio: 'Esta canción aún no tiene audio', error: 'No se pudo procesar el audio' };
        el('rehearsalSummary').textContent = uploading ? 'Subiendo canción… No cierres esta página.' : loading ? 'Cargando pistas…' : labels[status?.state] || 'Audio de ensayo';
        el('rehearsalSummary').dataset.busy = String(busy);
    }
    async function refresh() {
        clearTimeout(timer);
        const current = generation;
        if (!song || uploading) return;
        try {
            const next = await readStatus(song.id);
            if (current !== generation || uploading) return;
            if (status?.version && next.version !== status.version) releaseAudio();
            status = next;
            const downloaded=await window.AlabanzaAudioOffline?.getSong(firebase.auth().currentUser?.uid,song.id);
            if(current!==generation)return;
            const download=el('rehearsalOfflineDownload');
            if(download)download.dataset.saved=String(Boolean(downloaded));
            if (next.error) message(next.error, true);
            else if (next.state === 'procesando' || next.state === 'pendiente') message('Puedes seguir leyendo. El audio se guarda cuando finalice la separación.');
            else if (!loading) message(next.ready
                ? 'Prepara tu mezcla y ensaya con la letra a la vista.'
                : admin() ? 'Sube el audio original. Separaremos voz, guitarra, bajo, teclado y batería.'
                    : 'Un administrador puede añadir el audio de esta canción.');
            paint();
            if (next.localOffline && !engine && !loading && !preparePromise)void prepareAudio().catch(()=>{});
            if (['pendiente', 'procesando'].includes(next.state) || ['pendiente','subiendo'].includes(next.cloudState)) timer = setTimeout(refresh, 2500);
        } catch (error) {
            if (current !== generation || uploading) return;
            message(!navigator.onLine?'Sin conexión':error.message, true);
            paint();
            el('rehearsalSummary').textContent = local ? 'Servicio local sin conectar' : 'No se pudo consultar el audio en la nube';
        }
    }
    function releaseAudio() {
        controller?.abort();
        controller = null;
        cancelAnimationFrame(frame);
        frame = null;
        if (engine) engine.dispose().catch(() => {});
        engine = null;
        loading = false;
        el('rehearsalTimeline').value = 0;
        el('rehearsalElapsed').textContent = '0:00';
    }
    function mix() {
        engine?.mix(settings.filter((_, index) => available().includes(names[index][0])));
        const anySolo = settings.some((channel, index) => channel.solo && available().includes(names[index][0]));
        settings.forEach((channel, index) => {
            const name = names[index][0];
            el('mix-volume-' + name).value = channel.volume;
            el('mix-level-' + name).textContent = channel.volume + '%';
            el('mix-mute-' + name).setAttribute('aria-pressed', String(channel.mute));
            el('mix-solo-' + name).setAttribute('aria-pressed', String(channel.solo));
            el('mix-channel-' + name).dataset.silent = String(channel.mute || (anySolo && !channel.solo));
        });
    }
    function tick() {
        if (!engine) return;
        if (!seeking) {
            el('rehearsalTimeline').value = engine.position;
            el('rehearsalElapsed').textContent = format(engine.position);
        }
        if (engine.playing && engine.position >= engine.duration) { engine.pause(); paint(); }
        frame = requestAnimationFrame(tick);
    }
    let preparePromise=null;
    async function prepareAudio(){
        if(engine)return;
        if(preparePromise)return preparePromise;
        if(!status?.ready||!song)return;
        const current=generation;
        preparePromise=(async()=>{
                if (!status?.ready || loading) return;
                loading = true;
                controller = new AbortController();
                // Prepare decoded buffers without starting playback.
                engine = new window.RehearsalEngine();
                if (current !== generation) return;
                if (status.cloud && status.expiresAt < Date.now()+120000) {
                    const renewed = await cloudStatus(song.id);
                    if (current !== generation) return;
                    if (!renewed.ready) throw new Error('El audio compartido ya no está disponible.');
                    status = renewed;
                }
                const activeEngine = engine;
                const activeSong = song.id, version = status.version;
                const buffers = [];
                paint();
                const activeNames = names.filter(([name]) => available().includes(name));
                for (const [name, label] of activeNames) {
                    message('Cargando ' + label.toLowerCase() + '… ' + (buffers.length + 1) + ' de ' + activeNames.length);
                    let response;
                    if (status.localOffline) {
                        const entry = await window.AlabanzaAudioOffline?.getSong(firebase.auth().currentUser?.uid,activeSong);
                        if (!entry || entry.version !== version || !entry.tracks?.[name]) throw new Error('La pista local no está disponible.');
                        response = new Response(entry.tracks[name]);
                    } else if (status.cloud) {
                        const address = new URL(status.files[name]);
                        if (address.origin !== cloudConfig().url || !address.pathname.startsWith('/storage/v1/object/sign/')) throw new Error('Referencia de audio no válida.');
                        response = await fetch(address.href,{signal:controller.signal,cache:'no-store'});
                        if (!response.ok) throw new Error('No se pudo descargar una pista. Pulsa Actualizar e intenta nuevamente.');
                    } else {
                        response = await request('/songs/' + encodeURIComponent(activeSong) + '/stems/' + name + '?version=' + encodeURIComponent(version), { signal: controller.signal });
                    }
                    const bytes = await response.arrayBuffer();
                    if (current !== generation) return;
                    if (!bytes.byteLength) throw new Error('La descarga de ' + label.toLowerCase() + ' está vacía. Pulsa Actualizar e intenta nuevamente.');
                    const downloadedBytes = bytes.byteLength;
                    let buffer;
                    try {
                        buffer = await activeEngine.context.decodeAudioData(bytes);
                    } catch (decodeError) {
                        // No URLs, Firebase tokens or signed storage credentials in diagnostics.
                        console.warn('No se pudo decodificar la pista de ensayo', {
                            instrument: name, bytes: downloadedBytes,
                            contentType: response.headers.get('Content-Type'),
                            sampleRate: activeEngine.context.sampleRate,
                            source: status.cloud ? 'cloud' : 'local', error: decodeError.name
                        });
                        throw new Error('No se pudo leer el audio de ' + label.toLowerCase() +
                            '. Cierra otras pestañas con audio, recarga la página e intenta nuevamente.');
                    }
                    if (status.cloud) {
                        // AAC decoders can round the final duration differently. Normalize only
                        // the tail: permit at most 1 ms missing or the existing AAC padding limit.
                        // Every channel keeps its start and receives the same exact frame count.
                        const frames = Math.floor(status.frames * buffer.sampleRate / status.sampleRate);
                        if (frames-buffer.length > Math.ceil(buffer.sampleRate/1000) || buffer.length-frames > Math.ceil(2048*buffer.sampleRate/44100)) throw new Error('La pista comprimida no conserva la duración esperada.');
                        if (buffer.length !== frames) {
                            const trimmed = activeEngine.context.createBuffer(buffer.numberOfChannels,frames,buffer.sampleRate);
                            for (let i=0;i<buffer.numberOfChannels;i++) trimmed.copyToChannel(buffer.getChannelData(i).subarray(0,frames),i);
                            buffer = trimmed;
                        }
                    }
                    buffers.push(buffer);
                    if (current !== generation) return;
                }
                engine.setBuffers(buffers);
                loading = false;
                el('rehearsalTimeline').max = engine.duration;
                el('rehearsalDuration').textContent = format(engine.duration);
                mix();
                tick();
                message('Pistas listas para reproducir.');
                paint();

        })().catch(error=>{
            if(current===generation){
                releaseAudio();
                message(error.name==='AbortError'?'Preparación cancelada.':error.message||'No se pudieron preparar las pistas.',true);
                paint();
            }
            throw error;
        }).finally(()=>{preparePromise=null;});
        return preparePromise;
    }
    async function play(){
        const current=generation;
        try{
            if(engine?.playing){engine.pause();paint();return;}
            if(!engine){
                if(!status?.ready)return;
                if(!preparePromise)void prepareAudio();
                if(preparePromise)await preparePromise;
            }
            if(!engine||current!==generation)return;
            await engine.play();
            if(current!==generation)return;
            message('Las pistas se reproducen juntas. Ajusta tu mezcla.');
            paint();
        }catch(error){
            message(error.message||'No se pudo reproducir.',true);
            paint();
        }
    }
    async function upload(file) {
        if (!file || !song || !admin() || loading) return;
        if (!/\.(mp3|wav)$/i.test(file.name) || !file.size || file.size > 100 * 1024 * 1024) {
            message('Selecciona un MP3 o WAV de hasta 100 MiB.', true); openPanel(true); return;
        }
        if (status?.ready && !window.confirm('¿Reemplazar el audio de esta canción? La mezcla actual seguirá disponible hasta terminar.')) return;
        const current = generation, identifier = song.id;
        clearTimeout(timer);
        uploading = true;
        loading = true;
        openPanel(true);
        paint();
        message('Subiendo «' + file.name + '»… Después separaremos los instrumentos y subiremos las pistas a la nube. No cierres esta página.');
        try {
            await request('/songs/' + encodeURIComponent(identifier) + '/audio', {
                method: 'POST', headers: { 'Content-Type': /\.wav$/i.test(file.name) ? 'audio/wav' : 'audio/mpeg' }, body: file });
            if (current !== generation) return;
            uploading = false;
            loading = false;
            await refresh();
        } catch (error) {
            if (current !== generation) return;
            uploading = false;
            loading = false; paint(); message(error.message, true);
        } finally { el('rehearsalFile').value = ''; }
    }
    names.forEach(([name, label, icon], index) => {
        const channel = document.createElement('div');
        channel.className = 'mix-channel'; channel.id = 'mix-channel-' + name;
        channel.innerHTML = `<div class="mix-channel-title"><span><i class="fas ${icon}" aria-hidden="true"></i> ${label}</span><output id="mix-level-${name}">100%</output></div><label class="mix-slider-label" for="mix-volume-${name}">Volumen de ${label.toLowerCase()}</label><input id="mix-volume-${name}" type="range" min="0" max="100" value="100"><div class="mix-channel-actions"><button type="button" id="mix-mute-${name}" aria-pressed="false" aria-label="Silenciar ${label.toLowerCase()}">Silenciar</button><button type="button" id="mix-solo-${name}" aria-pressed="false" aria-label="Escuchar solo ${label.toLowerCase()}">Solo</button></div>`;
        el('rehearsalChannels').append(channel);
        el('mix-volume-' + name).addEventListener('input', event => { settings[index].volume = Number(event.target.value); el('rehearsalPreset').value = 'custom'; mix(); });
        ['mute', 'solo'].forEach(action => el('mix-' + action + '-' + name).addEventListener('click', () => { settings[index][action] = !settings[index][action]; el('rehearsalPreset').value = 'custom'; mix(); }));
    });
    el('rehearsalToggle').addEventListener('click', () => openPanel(!opened));
    el('rehearsalClose').addEventListener('click', () => openPanel(false));
    el('rehearsalRefresh').addEventListener('click', async () => {
        try {
            const currentUser=firebase.auth().currentUser;
            if (currentUser) await currentUser.getIdToken(true);
            await refresh();
        } catch (error) {message('No se pudo actualizar la sesión. Intenta nuevamente.',true);}
    });
    el('rehearsalPublish').addEventListener('click',async () => {
        try { await request('/songs/'+encodeURIComponent(song.id)+'/publish',{method:'POST'}); await refresh(); }
        catch (error) { message(error.message,true); }
    });
    const downloadButton=document.createElement('button');
    downloadButton.type='button';downloadButton.id='rehearsalOfflineDownload';
    downloadButton.textContent='Descargar pistas';
    downloadButton.className='offline-save-button';
    downloadButton.addEventListener('click',async()=>{
        if(!song || !window.AlabanzaAudioOffline)return;
        if(downloadButton.disabled)return;
        downloadButton.dataset.downloading='true';
        downloadButton.disabled=true;
        const id=song.id, current=generation;
        try {
            if(!navigator.onLine)throw new Error('Sin conexión. Conéctate a internet para descargar pistas.');
            message('Preparando descarga de audio…');
            const fresh=await cloudStatus(id);
            if(current!==generation||id!==song?.id)return;
            await window.AlabanzaAudioOffline.downloadSong(song,fresh,cloudConfig(),text=>{
                if(current===generation)message(text);
            });
            if(current===generation){
                downloadButton.dataset.saved='true';
                downloadButton.textContent='✓ Pistas descargadas';
                message('Pistas guardadas. Preparando audio para reproducción rápida…');
                const localEntry=await window.AlabanzaAudioOffline.getSong(firebase.auth().currentUser?.uid,id);
                if(localEntry&&current===generation){
                    if(!engine)status={ready:true,state:'listo',cloud:false,localOffline:true,version:localEntry.version,stems:localEntry.stems,frames:localEntry.frames,sampleRate:localEntry.sampleRate};
                    paint();
                    if(!engine)void prepareAudio().catch(()=>{});
                }
            }
        }catch(error){if(current===generation)message(!navigator.onLine?'Sin conexión. Conéctate a internet para descargar pistas.':error.message||'Error al descargar pistas.',true);}
        finally{delete downloadButton.dataset.downloading;paint();}
    });
    const reference=el('rehearsalRefresh');
    reference?.parentElement?.append(downloadButton);
    el('rehearsalPlay').addEventListener('click', play);
    el('rehearsalUpload').addEventListener('click', () => { openPanel(true); el('rehearsalFile').click(); });
    el('rehearsalFile').addEventListener('change', event => upload(event.target.files[0]));
    el('rehearsalTimeline').addEventListener('input', event => { seeking = true; el('rehearsalElapsed').textContent = format(Number(event.target.value)); });
    el('rehearsalTimeline').addEventListener('change', event => { seeking = false; engine?.seek(Number(event.target.value)).catch(error => message(error.message, true)); });
    el('rehearsalTimeline').addEventListener('pointercancel', () => { seeking = false; });
    el('rehearsalBack').addEventListener('click', () => engine?.seek(engine.position - 10).catch(error => message(error.message, true)));
    el('rehearsalForward').addEventListener('click', () => engine?.seek(engine.position + 10).catch(error => message(error.message, true)));
    function reset() { settings = names.map(() => ({ volume: 100, mute: false, solo: false })); mix(); }
    el('rehearsalReset').addEventListener('click', () => { reset(); el('rehearsalPreset').value = 'full'; });
    el('rehearsalPreset').addEventListener('change', event => {
        reset();
        const [mode, name] = event.target.value.split(':');
        const index = names.findIndex(channel => channel[0] === name);
        if (index >= 0) {
            if (mode === 'without') settings[index].mute = true;
            else settings.forEach((channel, i) => { channel.volume = i === index ? 100 : 35; });
        }
        mix();
    });
    window.EnsayoMusical = {
        abrir(nextSong, nextUser) {
            this.cerrar(); song = nextSong; user = nextUser;
            el('rehearsalEntry').hidden = false;
            reset(); el('rehearsalPreset').value = 'full';
            el('rehearsalOfflineDownload').dataset.saved='false';
            el('rehearsalDuration').textContent = '0:00';
            paint(); refresh();
        },
        cerrar() {
            generation++; clearTimeout(timer); uploading = false; releaseAudio(); status = null; song = null; user = null;
            openPanel(false); el('rehearsalEntry').hidden = true;
        }
    };
})();
