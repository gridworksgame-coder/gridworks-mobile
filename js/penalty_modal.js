/* ═══════════════════════════════════════════════════════════════════
   PENALTY MODAL
   Blocking confirmation dialog for relocate / demolish actions.
   ═══════════════════════════════════════════════════════════════════ */
const PenaltyModal = (() => {
  let onConfirmCb = null;
  let onCancelCb  = null;

  function el()  { return document.getElementById('penalty-modal'); }

  return {
    init() {
      document.getElementById('penalty-confirm').addEventListener('click', () => {
        el().style.display = 'none';
        if (onConfirmCb) { onConfirmCb(); onConfirmCb = null; }
      });
      document.getElementById('penalty-cancel').addEventListener('click', () => {
        el().style.display = 'none';
        if (onCancelCb) { onCancelCb(); onCancelCb = null; }
      });
    },
    show({ title, msg, fine, onConfirm, onCancel }) {
      document.getElementById('penalty-title').textContent = title;
      document.getElementById('penalty-msg').textContent   = msg;
      const hasFine = fine !== null && fine !== undefined;
      const canAfford = hasFine ? Economy.canAfford(fine) : true;
      const confirmBtn = document.getElementById('penalty-confirm');
      confirmBtn.disabled    = !canAfford;
      confirmBtn.textContent = !hasFine ? 'Confirm' : canAfford ? `Confirm (${formatMoney(fine)})` : `Cannot afford (${formatMoney(fine)})`;
      onConfirmCb = onConfirm;
      onCancelCb  = onCancel;
      el().style.display = 'flex';
    },
  };
})();

/* ═══════════════════════════════════════════════════════════════════
   RELOCATE PICKER
   Shows A/B/C pins on the canvas after player pays relocation fine.
   Player clicks a pin to finalise the move.
   ═══════════════════════════════════════════════════════════════════ */
