// BPM always measures main pulses: quarter notes in simple meters,
// dotted quarter notes in compound meters. Existing BPM values are preserved.
const Ritmo = {
    compases: {
        '2/4': { pulsos: 2, subdivision: 2 },
        '3/4': { pulsos: 3, subdivision: 2 },
        '4/4': { pulsos: 4, subdivision: 2 },
        '6/8': { pulsos: 2, subdivision: 3 },
        '12/8': { pulsos: 4, subdivision: 3 }
    },
    compas(valor) { return this.compases[valor] ? valor : '4/4'; },
    bpm(valor) {
        const numero = Number(valor);
        return Number.isFinite(numero) && numero > 0 ? Math.min(400, Math.max(1, Math.round(numero))) : 120;
    },
    paso(compas, bpm, subdividir, indice) {
        const config = this.compases[this.compas(compas)];
        const division = subdividir ? config.subdivision : 1;
        return {
            segundos: 60 / this.bpm(bpm) / division,
            total: config.pulsos * division,
            principal: indice % division === 0,
            acento: indice === 0
        };
    },
    descripcion(compas) {
        const config = this.compases[this.compas(compas)];
        return `${config.pulsos} pulsos por compás · BPM por ${config.subdivision === 3 ? 'negra con puntillo' : 'negra'}. Subdivisión: ${config.subdivision} clics por pulso.`;
    }
};
