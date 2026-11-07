/* ═══════════════════════════════════════════════════════════════════
   CITY SCORE
   Single 0-100 headline number (with an S–F letter grade) synthesised
   from satisfaction, reliability, power uptime, air quality, and
   financial health. Poor air quality also caps the grade. Gives the player one number to optimise instead
   of five scattered stats, and a "best ever" to chase across a run.
   ═══════════════════════════════════════════════════════════════════ */
const CityScore = (() => {
  let _score = 24;
  let _grade = 'F';
  let _best  = 0;
  const SUB = { satisfaction: 0, reliability: 0, power: 0, pollution: 100, financial: 20, approval: 75 };
  const FALLOUT_CAP = [100, 69, 54, 39];   // score ceiling by fallout stage (C, D, F)
  let _fallout = 0;
  let _launchPen = 0;

  function gradeFor(score) {
    if (score >= 95) return 'S';
    if (score >= 85) return 'A';
    if (score >= 70) return 'B';
    if (score >= 55) return 'C';
    if (score >= 40) return 'D';
    return 'F';
  }
  function colorFor(grade) {
    return { S: '#40e8ff', A: '#40e880', B: '#a0d060', C: '#f0c040', D: '#e08030', F: '#ff5050' }[grade] || '#f0c040';
  }

  function updateHud() {
    const el = document.getElementById('stat-cityscore');
    if (!el) return;
    el.textContent = `${_score} · ${_grade}`;
    el.style.color = colorFor(_grade);
  }

  return {
    tick() {
      const stats = PowerNetwork.stats;
      const hasCustomers = stats.totalConsumers > 0;

      // No data yet (nothing built) reads as 0, not a free pass — the score
      // should reflect that an empty city hasn't earned anything, and rise
      // only as the player actually delivers power/satisfaction/reliability.
      SUB.satisfaction = hasCustomers ? SatisfactionSystem.averageSatisfaction() : 0;
      SUB.power        = hasCustomers ? (stats.poweredCount / stats.totalConsumers) * 100 : 0;

      let relSum = 0, relCount = 0;
      for (const t of [T.HOUSE, T.COMMERCIAL, T.INDUSTRIAL]) {
        for (const e of EntityRegistry.getByType(t)) { relSum += (e.reliability ?? 100); relCount++; }
      }
      SUB.reliability = relCount ? relSum / relCount : 0;

      SUB.pollution = (typeof PollutionSystem !== 'undefined') ? PollutionSystem.cleanlinessScore() : 100;

      // Financial health starts at a modest 20 (cash in the bank hasn't
      // proven anything yet) and tracks net profit/loss from there —
      // sustained profit pulls it up toward 100, sustained loss pulls it
      // down, and being in the red drags it toward 0 as debt deepens.
      const net = Economy.income - Economy.upkeep;
      const financialHealth = Economy.balance < 0
        ? Math.max(0, 20 + Economy.balance / 500)
        : 20 + net * 1.5;
      SUB.financial = Math.max(0, Math.min(100, financialHealth));

      SUB.approval = (typeof GovernmentSystem !== 'undefined') ? GovernmentSystem.getApproval() : 75;

      _score = Math.round(
        SUB.satisfaction * 0.25 +
        SUB.reliability   * 0.15 +
        SUB.power         * 0.15 +
        SUB.pollution     * 0.20 +
        SUB.financial     * 0.10 +
        SUB.approval      * 0.15
      );
      // A scrubbed launch at Starhaven costs a few points that fade over
      // the following days (LaunchSystem.scorePenalty).
      _launchPen = typeof LaunchSystem !== 'undefined' && LaunchSystem.scorePenalty ? LaunchSystem.scorePenalty() : 0;
      if (_launchPen > 0) _score = Math.max(0, Math.round(_score - _launchPen));
      // A smog-choked city can't be top-grade however well it runs:
      // poor air caps the score at a B, dirty air at an A.
      if (SUB.pollution < 50)      _score = Math.min(_score, 84);
      else if (SUB.pollution < 75) _score = Math.min(_score, 94);
      // A city living under nuclear fallout is failing, whatever else it
      // does well: an F while the blast zone is highly contaminated, a D
      // while hazardous, a C while residual. Lifts when the zone recovers.
      _fallout = (typeof LightningDamageSystem !== 'undefined' && LightningDamageSystem.falloutLevel) ? LightningDamageSystem.falloutLevel() : 0;
      if (_fallout) _score = Math.min(_score, FALLOUT_CAP[_fallout]);
      _grade = gradeFor(_score);
      if (_score > _best) _best = _score;
      updateHud();

      const panel = document.getElementById('score-panel');
      if (panel && panel.classList.contains('visible')) this.renderPanel();
    },

    get score() { return _score; },
    get grade() { return _grade; },
    get best()  { return _best;  },
    loadBest(v) { _best = v || 0; },

    renderPanel() {
      const body = document.getElementById('score-body');
      if (!body) return;
      const row = (label, val, color) => `
        <div>
          <div style="display:flex;justify-content:space-between;font-size:9px;letter-spacing:0.06em;color:var(--text-dim);text-transform:uppercase;margin-bottom:3px;">
            <span>${label}</span><span style="color:${color};">${Math.round(val)}</span>
          </div>
          <div style="height:4px;background:rgba(255,255,255,0.08);border-radius:2px;">
            <div style="width:${Math.max(0, Math.min(100, val))}%;height:100%;background:${color};border-radius:2px;"></div>
          </div>
        </div>`;
      const barColor = v => v >= 80 ? '#40e880' : v >= 55 ? '#f0c040' : '#ff5050';

      body.innerHTML = `
        <div style="text-align:center;padding-bottom:8px;border-bottom:1px solid var(--ui-border);margin-bottom:2px;">
          <div style="font-family:'JetBrains Mono',monospace;font-size:28px;color:${colorFor(_grade)};line-height:1;">${_score}</div>
          <div style="font-size:11px;letter-spacing:0.2em;color:${colorFor(_grade)};margin-top:2px;">GRADE ${_grade}</div>
          <div style="font-size:9px;letter-spacing:0.08em;color:var(--text-dim);margin-top:4px;text-transform:uppercase;">Best this run: ${_best}</div>
          ${_fallout ? `<div style="font-size:9px;letter-spacing:0.06em;color:#ff7050;margin-top:4px;">☢ Nuclear fallout: score capped at ${FALLOUT_CAP[_fallout]} until the blast zone recovers</div>` : ''}
          ${_launchPen > 0 ? `<div style="font-size:9px;letter-spacing:0.06em;color:#ff9060;margin-top:4px;">🚀 Scrubbed launch: −${Math.ceil(_launchPen)}, fading over the next few days</div>` : ''}
        </div>
        ${row('Satisfaction',     SUB.satisfaction, barColor(SUB.satisfaction))}
        ${row('Reliability',      SUB.reliability,  barColor(SUB.reliability))}
        ${row('Power Uptime',     SUB.power,        barColor(SUB.power))}
        ${row('Air Quality',      SUB.pollution,    barColor(SUB.pollution))}
        ${(() => {
          if (typeof PollutionSystem === 'undefined') return '';
          const em = PollutionSystem.emissions(), tax = PollutionSystem.carbonTax();
          const cap = SUB.pollution < 50 ? 'Grade capped at B' : SUB.pollution < 75 ? 'Grade capped at A' : '';
          return `<div style="font-size:8px;letter-spacing:0.04em;color:var(--text-dim);margin-top:-2px;line-height:1.5;">
            Emissions ${em.toFixed(1)} / ${PollutionSystem.ALLOWANCE} allowance${tax > 0 ? ` · <span style="color:#ff9070">carbon tax −$${tax.toFixed(1)}/s</span>` : ''}${cap ? ` · <span style="color:#f0c040">${cap}</span>` : ''}
          </div>`;
        })()}
        ${row('Financial Health', SUB.financial,    barColor(SUB.financial))}
        ${row('Gov. Approval',    SUB.approval,     barColor(SUB.approval))}
      `;
    },
  };
})();
