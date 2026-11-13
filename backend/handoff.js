/**
 * Helpers para registrar o handoff humano de forma idempotente.
 * O primeiro registro pausa a IA; tentativas posteriores não duplicam o evento.
 */
function registrarHandoff(db, clinicaId, reason) {
  if (!db || !clinicaId) return false;
  const result = db.prepare(`
    UPDATE clinicas
    SET status = 'reply',
        ia_ativa = 0,
        handoff_at = datetime('now'),
        handoff_reason = ?,
        proxima_acao = 'Assumir conversa no WhatsApp'
    WHERE id = ? AND handoff_at IS NULL
  `).run(reason || 'A IA solicitou atendimento humano.', clinicaId);
  return result.changes === 1;
}

function marcarHandoffNotificado(db, clinicaId) {
  if (!db || !clinicaId) return false;
  const result = db.prepare(`
    UPDATE clinicas
    SET handoff_notified_at = datetime('now')
    WHERE id = ? AND handoff_at IS NOT NULL AND handoff_notified_at IS NULL
  `).run(clinicaId);
  return result.changes === 1;
}

module.exports = { registrarHandoff, marcarHandoffNotificado };
