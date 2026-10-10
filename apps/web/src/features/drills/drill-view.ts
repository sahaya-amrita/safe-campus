import { STEPS, applyEvent, createEvent, createMemoryDrillStore, newDrill, summarize } from './drill-model.ts';
import type { DrillEvent, DrillStore } from './drill-model.ts';

export function mountDrillSimulator(host: HTMLElement, store: DrillStore = createMemoryDrillStore(), options: { contextLabel?: string } = {}): () => void {
  const section = document.createElement('section');
  section.className = 'sc-drill';
  section.setAttribute('aria-label', 'Digital drill simulator');
  host.append(section);
  let state = newDrill(crypto.randomUUID());
  let disposed = false;
  let pending: DrillEvent | undefined;
  let busy = false;
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function render(focus = false) {
    if (disposed) return;
    section.replaceChildren();
    section.append(element('h2', 'Digital preparedness drill'));
    const warning = element('p', 'DEMO · SCREEN-ONLY SIMULATION · No real alerts, alarms, contacts or physical drill actions.');
    warning.className = 'sc-drill-warning';
    section.append(warning, element('p', 'Fictional interface-literacy exercise. These examples are not official emergency instructions. Follow verified campus procedures for real situations.'));
    if(options.contextLabel)section.append(element('p', `Linked simulation: ${options.contextLabel}. Responses are recorded in the local incident timeline; no real response time is measured.`));
    const storage = element('p', state.events.length
      ? `${state.events.length} event(s) saved in page memory only · LOCAL_ONLY · Not sent. Reload clears this session.`
      : 'Local simulation only. No server connection. Reload clears the session.');
    storage.setAttribute('role', 'status');
    section.append(storage);
    const phases = element('ol');
    phases.className = 'sc-drill-phases';
    for (const [index, step] of STEPS.entries()) {
      const phase = element('li', `${step.phase}${index < state.events.length ? ' — reviewed' : ''}`);
      if (index === state.events.length) phase.setAttribute('aria-current', 'step');
      phases.append(phase);
    }
    section.append(phases);
    const current = STEPS[state.events.length];
    const heading = element('h3', current ? `${current.phase}: ${current.title}` : 'Simulation debrief');
    heading.tabIndex = -1;
    section.append(heading);
    if (current) {
      section.append(element('p', current.description));
      const form = element('form');
      const fieldset = element('fieldset');
      fieldset.append(element('legend', 'Choose one response to record in the simulation'));
      for (const choice of current.choices) {
        const label = element('label');
        const input = element('input');
        input.type = 'radio'; input.name = 'choice'; input.value = choice.id; input.required = true;
        label.append(input, document.createTextNode(choice.label));
        fieldset.append(label);
      }
      const submit = element('button', 'Record choice & continue');
      submit.type = 'submit';
      const error = element('p');
      error.setAttribute('role', 'alert');
      form.append(fieldset, submit, error);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (busy || disposed) return;
        const choiceId = pending?.choiceId ?? new FormData(form).get('choice');
        if (typeof choiceId !== 'string') return;
        // Retain the same event and idempotency key after uncertain adapter failures.
        pending ??= createEvent(state, choiceId, new Date());
        busy = true;
        fieldset.disabled = true;
        submit.disabled = true;
        error.textContent = '';
        try {
          const receipt = await store.append(pending);
          if (disposed) return;
          if (receipt.eventId !== pending.id || receipt.storage !== 'LOCAL_ONLY') throw new Error('Invalid local receipt');
          state = applyEvent(state, pending);
          pending = undefined;
          render(true);
        } catch {
          if (disposed) return;
          error.textContent = 'The choice could not be confirmed as saved locally. Your phase has not advanced. Retry the same choice.';
          submit.textContent = 'Retry saving the same choice';
          // Keep choice locked so a retry cannot silently change an already-written event.
          submit.disabled = false;
        } finally {
          busy = false;
        }
      });
      section.append(form);
    } else {
      const result = summarize(state);
      section.append(element('p', `Review score: ${result.score}/${result.total}. ${result.meaning}`));
      const review = element('ol');
      for (const [index, event] of state.events.entries()) {
        const step = STEPS[index]!;
        const choice = step.choices.find((item) => item.id === event.choiceId)!;
        const item = element('li');
        item.append(element('strong', `${step.phase}: ${choice.id === step.correctChoice ? 'Supported interpretation' : 'Review needed'}`),
          element('p', `Your choice: ${choice.label}`), element('p', step.feedback));
        review.append(item);
      }
      section.append(review, element('p', 'Recommended improvement: review authoritative map provenance and distinguish local storage from confirmed receipt. No operational action was performed.'));
      const restart = element('button', 'Start a new digital simulation');
      restart.type = 'button';
      restart.addEventListener('click', () => { state = newDrill(crypto.randomUUID()); pending = undefined; render(true); });
      section.append(restart);
    }
    if (focus) heading.focus();
  }
  render();
  return () => { disposed = true; section.remove(); };
}
