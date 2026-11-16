/* Synchronized decoded tracks, one clock and one scheduled transport. */
(function (global) {
    'use strict';
    class RehearsalEngine {
        constructor(context) {
            this.context = context || new (global.AudioContext || global.webkitAudioContext)();
            this.buffers = [];
            this.sources = [];
            this.channels = [];
            this.offset = 0;
            this.startedAt = 0;
            this.playing = false;
            this.master = this.context.createGain();
            this.master.gain.value = 0.85;
            this.master.connect(this.context.destination);
        }
        setBuffers(buffers) {
            if (![4, 6].includes(buffers.length) || !buffers[0]?.length || buffers.some(buffer =>
                buffer.length !== buffers[0].length || buffer.sampleRate !== buffers[0].sampleRate)) {
                throw new Error('Las pistas no tienen la misma duración. Vuelve a procesar el audio.');
            }
            this.pause();
            this.channels.forEach(channel => channel.disconnect());
            this.buffers = buffers;
            this.channels = buffers.map(() => {
                const gain = this.context.createGain();
                gain.connect(this.master);
                return gain;
            });
            this.offset = 0;
        }
        get duration() { return this.buffers[0]?.duration || 0; }
        get position() {
            return Math.min(this.duration, this.playing
                ? this.offset + Math.max(0, this.context.currentTime - this.startedAt) : this.offset);
        }
        async play() {
            await this.context.resume();
            if (this.playing || !this.buffers.length) return;
            if (this.offset >= this.duration) this.offset = 0;
            const when = this.context.currentTime + 0.06;
            this.sources = this.buffers.map((buffer, index) => {
                const source = this.context.createBufferSource();
                source.buffer = buffer;
                source.connect(this.channels[index]);
                source.start(when, this.offset);
                return source;
            });
            this.startedAt = when;
            this.playing = true;
        }
        pause() {
            this.offset = this.position;
            this.playing = false;
            this.sources.forEach(source => { try { source.stop(); } catch (_) {} source.disconnect(); });
            this.sources = [];
        }
        async seek(position) {
            const wasPlaying = this.playing;
            this.pause();
            this.offset = Math.max(0, Math.min(this.duration, position));
            if (wasPlaying && this.offset < this.duration) await this.play();
        }
        mix(settings) {
            const solo = settings.some(channel => channel.solo);
            settings.forEach((channel, index) => {
                const gain = this.channels[index]?.gain;
                if (!gain) return;
                const volume = channel.mute || (solo && !channel.solo) ? 0 : channel.volume / 100;
                gain.cancelScheduledValues(this.context.currentTime);
                gain.setTargetAtTime(volume, this.context.currentTime, 0.015);
            });
        }
        dispose() {
            this.pause();
            this.buffers = [];
            this.channels.forEach(channel => channel.disconnect());
            this.channels = [];
            this.master.disconnect();
            return this.context.close();
        }
    }
    global.RehearsalEngine = RehearsalEngine;
})(typeof window === 'undefined' ? globalThis : window);
