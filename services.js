const Servicios = {
    dias: {
        domingo: { nombre: 'Domingo', documento: 'playlist_semanal', tab: 'playlist' },
        miercoles: { nombre: 'Miércoles', documento: 'playlist_miercoles', tab: 'wednesday' }
    },
    diaDeFecha(fecha) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return null;
        const [y, m, d] = fecha.split('-').map(Number);
        const date = new Date(y, m - 1, d, 12);
        if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
        return date.getDay() === 0 ? 'domingo' : date.getDay() === 3 ? 'miercoles' : 'otro';
    },
    hoy() {
        const date = new Date();
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    },
    reordenar(original, visibles) {
        const incluidos = new Set(visibles);
        let indice = 0;
        return original.map(id => incluidos.has(id) ? visibles[indice++] : id);
    }
};
