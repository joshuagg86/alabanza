// Collaboration is available to every signed-in member of the group.
// Deletion keeps its existing administrator restriction.
const Permisos = {
    administradores: ['admin@genesaret.com', 'monica@genesaret.com', 'joshua@genesaret.com'],
    puedeEditar(usuario) { return Boolean(usuario && usuario.uid); },
    puedeEliminar(usuario) { return this.puedeEditar(usuario) && this.administradores.includes(usuario.email); }
};
