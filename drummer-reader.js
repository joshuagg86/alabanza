// A dedicated desktop layout; the regular reader remains vertical on phones.
const VistaBateria = {
    media: '(min-width: 1000px) and (hover: hover) and (pointer: fine)',
    activa(rol) { return rol === 'bateria' && window.matchMedia(this.media).matches; },
    ajustar(contenedor, preferido) {
        let hoja = contenedor.querySelector('.drum-sheet');
        if (!hoja) {
            hoja = document.createElement('div');
            hoja.className = 'drum-sheet';
            hoja.append(...contenedor.childNodes);
            contenedor.append(hoja);
        }
        const estilo = getComputedStyle(contenedor);
        const ancho = contenedor.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight);
        const alto = contenedor.clientHeight - parseFloat(estilo.paddingTop) - parseFloat(estilo.paddingBottom);
        if (ancho < 1 || alto < 1) return null;
        const maxColumnas = Math.max(1, Math.min(6, Math.floor((ancho + 24) / 264)));
        hoja.style.height = Math.floor(alto - 2) + 'px';
        hoja.classList.remove('drum-sheet-overflow');
        // Prefer readable type, then use more columns, then reduce the type size.
        // Retry with section breaks if an unusually long verse cannot fit intact.
        for (let fuente = preferido; fuente >= 12; fuente--) {
            for (const dividir of [false, true]) {
                hoja.classList.toggle('drum-split-sections', dividir);
                for (let columnas = 1; columnas <= maxColumnas; columnas++) {
                    hoja.style.setProperty('--drum-columns', columnas);
                    hoja.style.setProperty('--drum-font', fuente + 'px');
                    if (hoja.scrollWidth <= hoja.clientWidth + 1 && hoja.scrollHeight <= hoja.clientHeight + 1) {
                        contenedor.scrollTop = 0;
                        contenedor.scrollLeft = 0;
                        return { fuente, columnas, completo: true };
                    }
                }
            }
        }
        // Never clip lyrics when an exceptionally long song exceeds the screen.
        hoja.classList.add('drum-sheet-overflow');
        hoja.style.height = 'auto';
        hoja.style.setProperty('--drum-columns', maxColumnas);
        hoja.style.setProperty('--drum-font', '12px');
        return { fuente: 12, columnas: maxColumnas, completo: false };
    },
    restaurar(contenedor) {
        const hoja = contenedor.querySelector('.drum-sheet');
        if (hoja) hoja.replaceWith(...hoja.childNodes);
    }
};
