function parseConfig(db, key, fallback) {
  const row = db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get(key);
  if (!row) return fallback;
  try {
    const parsed = JSON.parse(row.valor);
    return parsed ?? fallback;
  } catch {
    return row.valor ?? fallback;
  }
}

function positiveDays(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function listDueFollowups(db, { now = new Date(), limit = 100 } = {}) {
  const scheduleDays = [
    positiveDays(parseConfig(db, 'followup_dias_1', 1), 1),
    positiveDays(parseConfig(db, 'followup_dias_2', 3), 3),
    positiveDays(parseConfig(db, 'followup_dias_3', 7), 7),
    positiveDays(parseConfig(db, 'followup_dias_4', 14), 14)
  ];
  const enabledValue = parseConfig(db, 'followup_auto_ativo', false);
  const enabled = enabledValue === true || enabledValue === 'true';
  const nowSql = now instanceof Date
    ? now.toISOString().slice(0, 19).replace('T', ' ')
    : String(now).replace('T', ' ').replace(/Z$/, '').slice(0, 19);
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 100, 1), 200);

  const items = db.prepare(`
    WITH candidates AS (
      SELECT
        c.id, c.nome, c.tel, c.categoria, c.cidade, c.status,
        c.sales_priority, c.fit_score,
        IFNULL(c.followup_stage, 0) AS followup_stage,
        c.first_contact_at, c.last_contact_at, c.last_followup_at,
        CASE IFNULL(c.followup_stage, 0)
          WHEN 0 THEN datetime(IFNULL(c.last_contact_at, c.criado_em), '+' || ? || ' days')
          WHEN 1 THEN datetime(IFNULL(c.last_followup_at, c.last_contact_at), '+' || ? || ' days')
          WHEN 2 THEN datetime(IFNULL(c.last_followup_at, c.last_contact_at), '+' || ? || ' days')
          WHEN 3 THEN datetime(IFNULL(c.last_followup_at, c.last_contact_at), '+' || ? || ' days')
        END AS due_at
      FROM clinicas c
      WHERE c.status = 'sent'
        AND IFNULL(c.tem_bot, 0) = 0
        AND IFNULL(c.ia_ativa, 1) = 1
        AND IFNULL(c.followup_stage, 0) BETWEEN 0 AND 3
    )
    SELECT *,
      CASE WHEN datetime(due_at) < datetime(?) THEN 'overdue' ELSE 'due' END AS due_status
    FROM candidates
    WHERE due_at IS NOT NULL AND datetime(due_at) <= datetime(?)
    ORDER BY
      CASE sales_priority WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 ELSE 1 END DESC,
      fit_score DESC,
      datetime(due_at) ASC,
      id ASC
    LIMIT ?
  `).all(...scheduleDays, nowSql, nowSql, safeLimit);

  const total = db.prepare(`
    WITH candidates AS (
      SELECT
        CASE IFNULL(c.followup_stage, 0)
          WHEN 0 THEN datetime(IFNULL(c.last_contact_at, c.criado_em), '+' || ? || ' days')
          WHEN 1 THEN datetime(IFNULL(c.last_followup_at, c.last_contact_at), '+' || ? || ' days')
          WHEN 2 THEN datetime(IFNULL(c.last_followup_at, c.last_contact_at), '+' || ? || ' days')
          WHEN 3 THEN datetime(IFNULL(c.last_followup_at, c.last_contact_at), '+' || ? || ' days')
        END AS due_at
      FROM clinicas c
      WHERE c.status = 'sent'
        AND IFNULL(c.tem_bot, 0) = 0
        AND IFNULL(c.ia_ativa, 1) = 1
        AND IFNULL(c.followup_stage, 0) BETWEEN 0 AND 3
    )
    SELECT COUNT(*) AS count FROM candidates
    WHERE due_at IS NOT NULL AND datetime(due_at) <= datetime(?)
  `).get(...scheduleDays, nowSql).count;

  return {
    enabled,
    scheduleDays,
    total,
    returned: items.length,
    limit: safeLimit,
    items
  };
}


function registerManualFollowup(db, clinicId, { now = new Date() } = {}) {
  const nowSql = now instanceof Date
    ? now.toISOString().slice(0, 19).replace('T', ' ')
    : String(now).replace('T', ' ').replace(/Z$/, '').slice(0, 19);

  const register = db.transaction(() => {
    const lead = db.prepare(
      'SELECT id, status, IFNULL(followup_stage, 0) AS followup_stage FROM clinicas WHERE id = ?'
    ).get(clinicId);

    if (!lead) return { ok: false, reason: 'not_found' };
    if (lead.status !== 'sent') return { ok: false, reason: 'invalid_status' };
    if (lead.followup_stage < 0 || lead.followup_stage >= 4) {
      return { ok: false, reason: 'completed' };
    }

    const nextStage = lead.followup_stage + 1;
    const updated = db.prepare(`
      UPDATE clinicas
      SET followup_stage = ?, last_followup_at = ?
      WHERE id = ? AND status = 'sent' AND IFNULL(followup_stage, 0) = ?
    `).run(nextStage, nowSql, clinicId, lead.followup_stage);
    if (updated.changes !== 1) return { ok: false, reason: 'conflict' };

    db.prepare(`
      INSERT INTO followup_history (clinica_id, stage, source, created_at)
      VALUES (?, ?, 'manual', ?)
    `).run(clinicId, nextStage, nowSql);

    return { ok: true, followup_stage: nextStage, last_followup_at: nowSql };
  });

  return register();
}

function listFollowupHistory(db, clinicId, { limit = 50 } = {}) {
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 200);
  return db.prepare(`
    SELECT id, clinica_id, stage, source, message_id, created_at
    FROM followup_history
    WHERE clinica_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(clinicId, safeLimit);
}

module.exports = { listDueFollowups, registerManualFollowup, listFollowupHistory };
