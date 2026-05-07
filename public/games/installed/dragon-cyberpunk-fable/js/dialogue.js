/**
 * Dragon — Dialogue system.
 * Line formats:
 *   { speaker, text }                           — normal line
 *   { speaker, text, choices, onRight, onWrong } — choice branch
 *     choices : [{ text, correct? }]
 *     onRight : lines[] injected when correct choice is made
 *     onWrong : lines[] injected when wrong choice is made
 */
'use strict';

const Dialogue = {
  CHAR_DELAY: 28,
  timer: 0,

  show(lines, opts = {}) {
    this.timer = 0;
    const first = lines[0] || '';
    const fullText = typeof first === 'object' ? first.text : first;
    const d = {
      active: true,
      lines,
      currentLine: 0,
      fullText,
      currentChar: 0,
      callback: opts.onComplete || null,
      // choice state
      showingChoices: false,
      choices: null,
      focusedChoice: 0,   // which choice is keyboard-highlighted
      _choiceOnRight: null,
      _choiceOnWrong: null,
      _pendingChoices: null,
    };
    // First line may itself be a choice line
    if (typeof first === 'object' && first.choices) {
      d._pendingChoices = { choices: first.choices, onRight: first.onRight || [], onWrong: first.onWrong || [] };
    }
    return d;
  },

  advance(d) {
    if (!d) return { done: true };

    // While choices are displayed, don't allow advancing
    if (d.showingChoices) return { done: false };

    // Pending choices: finish typing the question, then show options on next press
    if (d._pendingChoices) {
      if (d.currentChar < (d.fullText || '').length) {
        d.currentChar = (d.fullText || '').length; // snap to end
        return { done: false };
      }
      // Text fully shown — open choice menu
      d.showingChoices  = true;
      d.focusedChoice   = 0;
      d.choices         = d._pendingChoices.choices;
      d._choiceOnRight  = d._pendingChoices.onRight;
      d._choiceOnWrong  = d._pendingChoices.onWrong;
      d._pendingChoices = null;
      return { done: false };
    }

    // Normal advance: finish typing current line first
    if (d.currentChar < (d.fullText || '').length) {
      d.currentChar = (d.fullText || '').length;
      return { done: false };
    }

    // Move to next line
    d.currentLine++;
    if (d.currentLine >= (d.lines || []).length) {
      d.active = false;
      if (d.callback) d.callback();
      return { done: true };
    }

    const next = d.lines[d.currentLine];
    d.fullText    = typeof next === 'object' ? next.text : next;
    d.currentChar = 0;

    if (typeof next === 'object' && next.choices) {
      d._pendingChoices = { choices: next.choices, onRight: next.onRight || [], onWrong: next.onWrong || [] };
    }
    return { done: false };
  },

  /** Move keyboard focus up/down within the choice list. dir = -1 or +1. */
  moveFocus(d, dir) {
    if (!d || !d.showingChoices || !d.choices) return;
    const n = d.choices.length;
    d.focusedChoice = ((d.focusedChoice || 0) + dir + n) % n;
  },

  /**
   * Called when the player picks a choice by index.
   * Injects the right/wrong branch lines and resumes normal flow.
   * Sets state.lastChoiceCorrect (false sticks — one wrong answer dooms the run).
   */
  selectChoice(state, d, idx) {
    if (!d || !d.showingChoices || !d.choices) return;
    const choice = d.choices[idx];
    if (!choice) return;

    const correct = !!choice.correct;
    // Once wrong it stays wrong (for multi-question chains)
    if (state.lastChoiceCorrect !== false) state.lastChoiceCorrect = correct;

    const inject    = correct ? (d._choiceOnRight || []) : (d._choiceOnWrong || []);
    const remaining = (d.lines || []).slice(d.currentLine + 1);
    d.lines         = inject.concat(remaining);
    d.currentLine   = -1;
    d.showingChoices  = false;
    d.choices         = null;
    d._choiceOnRight  = null;
    d._choiceOnWrong  = null;

    if (d.lines.length === 0) {
      d.active = false;
      if (d.callback) d.callback();
      return;
    }

    // Load first injected line
    const next    = d.lines[0];
    d.currentLine = 0;
    d.fullText    = typeof next === 'object' ? next.text : next;
    d.currentChar = 0;
    if (typeof next === 'object' && next.choices) {
      d._pendingChoices = { choices: next.choices, onRight: next.onRight || [], onWrong: next.onWrong || [] };
    }
  },

  tick(dt, d) {
    if (!d || !d.active || d.showingChoices) return;
    if (d.currentChar >= (d.fullText || '').length) return;
    this.timer += dt;
    while (this.timer >= this.CHAR_DELAY) {
      this.timer -= this.CHAR_DELAY;
      d.currentChar = Math.min((d.fullText || '').length, (d.currentChar || 0) + 1);
    }
  },
};

window.Dialogue = Dialogue;
