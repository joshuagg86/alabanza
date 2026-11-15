// Small, defensive storage boundary shared by the reader and editor.
const ExperienciaLectura = {
    leer(clave, defecto = null, almacen) {
        try { return JSON.parse((almacen || localStorage).getItem(clave)) ?? defecto; }
        catch (_) { return defecto; }
    },
    guardar(clave, valor, almacen) {
        try { (almacen || localStorage).setItem(clave, JSON.stringify(valor)); return true; }
        catch (_) { return false; }
    },
    preferencias(clave) {
        const valor = this.leer(clave, {});
        const limite = (n, min, max, defecto) => Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : defecto;
        return {
            letra: limite(valor.letra, 16, 26, 19),
            bateria: limite(valor.bateria, 12, 24, 19),
            velocidad: [0.5, 0.75, 1, 1.5, 2].includes(valor.velocidad) ? valor.velocidad : 1,
            ocultarAcordes: typeof valor.ocultarAcordes === 'boolean' ? valor.ocultarAcordes : null,
            continua: valor.continua === true
        };
    },
    retorno(usuario, cancion) {
        const valor = this.leer('alabanza_editor_return', null, sessionStorage);
        if (!valor || valor.uid !== usuario || valor.cancion !== cancion || !Number.isFinite(valor.fecha) || Date.now() - valor.fecha > 7200000) return null;
        return valor;
    },
    notasVisibles(estado, cancion) {
        const guardadas = estado.canciones[cancion] || {};
        const notas = { ...(guardadas.notas || {}) };
        Object.entries(guardadas.pendientes || {}).forEach(([indice, cambio]) => {
            if (cambio.texto === null) delete notas[indice];
            else notas[indice] = cambio.texto;
        });
        return notas;
    }
};
