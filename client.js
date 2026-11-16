window.__ModuleLoader__.load({
  id: 'dsh-thought-collapse',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Turn-tail list slot: replaceRisk "none", so a fresh id only adds an entry. */
    const SLOT = 'conversation.chat.turnTail';
    /** Stable contribution id, so a re-activation replaces instead of duplicating. */
    const ID = 'thought-collapse';
    /** Ordered after the shipped tail contributions. */
    const ORDER = 100;

    /**
     * Shipped DOM contracts this contribution reads and drives.
     *
     * All three are attributes the shipped chat client really renders:
     *
     * - `[data-chat-flow]` is the conversation column that holds every flow item of
     *   one Session. It is the fold scope, so two Sessions open side by side never
     *   fold each other's Turn 3.
     * - `button[data-turn-process]` is the settled-Turn capsule ("已完成，用时 6 分 2 秒").
     *   It carries `data-open` while unfolded and is `disabled` when the shipped
     *   policy refuses to fold it.
     * - `button[data-process-activity]` is the step-group header ("已修改 2 文件").
     *   It carries `aria-expanded`, and its body holds the tool rows.
     * - `[data-variant="think"]` is the reasoning row root; its inner primitives
     *   DisclosureRow carries `data-open` while unfolded.
     *
     * Nothing here is re-implemented. The plugin only clicks the shipped toggles, so
     * the animation, the aria state and the visual language stay the shipped ones.
     */
    const FLOW_SELECTOR = '[data-chat-flow]';
    const TURN_SELECTOR = '[data-chat-turn]';
    const CAPSULE_SELECTOR = 'button[data-turn-process]';
    const GROUP_SELECTOR = 'button[data-process-activity]';
    const REASON_SELECTOR = '[data-variant="think"]';

    /**
     * A Turn counts as "just finished" only inside this window after its end time.
     *
     * The turn-tail Slot renders for every closed Turn in the transcript, including
     * the ones restored from history when a Session opens. Folding those would
     * override a disclosure state the user chose earlier, so a Turn whose end is
     * older than this window is left exactly as the user left it.
     */
    const FRESH_MS = 10000;

    /** Fold passes, spread over the few frames the shipped render needs to settle. */
    const PASS_DELAYS = [0, 60, 180, 420];

    /** The anchor only exists to hold a DOM ref, so it must never paint. */
    const CSS = '.dtc-anchor{display:none}';

    /** Style element tag, so a second activation cannot stack a duplicate sheet. */
    const STYLE_TAG = 'thought-collapse';

    /**
     * Attach this package's stylesheet the way a shipped bundle does: one owned
     * `<style data-plugin-css>` element, removed again when the effect disposes.
     * The `styles` helper belongs to dynamically evaluated client halves only, so a
     * bundle row must carry its CSS itself.
     */
    function attachStyles(css) {
      if (typeof document === 'undefined' || document.head === null) return () => {};
      let existing = null;
      try {
        existing = document.querySelector('style[data-plugin-css="' + STYLE_TAG + '"]');
      } catch (error) {
        existing = null;
      }
      if (existing !== null) return () => {};
      const tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-thought-collapse';
      tag.dataset.pluginCss = STYLE_TAG;
      tag.textContent = css;
      document.head.appendChild(tag);
      return () => {
        if (tag.parentNode !== null) tag.parentNode.removeChild(tag);
      };
    }

    /** Turn numbers are integers; anything else is not a usable selector value. */
    function isTurnNumber(value) {
      return typeof value === 'string' && /^[0-9]+$/.test(value);
    }

    /**
     * The Turn number of the flow item this anchor lives in.
     *
     * It is read from `[data-chat-turn]` — the same attribute `collectItems` later
     * queries — so the scope and the items it searches always agree on one number.
     * `[data-turn-tail]` is the shipped Turn-footer wrapper one level in and carries
     * the same number, so it is only a fallback for a shape that moved it.
     */
    function readTurnNumber(node) {
      try {
        if (node === null || node === undefined || typeof node.closest !== 'function') return null;
        const item = node.closest(TURN_SELECTOR);
        const value = item === null ? null : item.getAttribute('data-chat-turn');
        if (isTurnNumber(value)) return value;
        const wrapper = node.closest('[data-turn-tail]');
        if (wrapper === null) return null;
        const fallback = wrapper.getAttribute('data-turn-tail');
        return isTurnNumber(fallback) ? fallback : null;
      } catch (error) {
        return null;
      }
    }

    /**
     * The per-Session conversation column that holds this Turn's sibling nodes.
     *
     * Every chat node is its own `[data-chat-turn]` flow item, so the Turn's capsule
     * and its step group are siblings of our own wrapper, not descendants of it.
     * `closest` walks upward, so it lands on the column and never on the step-group
     * body that happens to reuse the same attribute. When it cannot be resolved the
     * caller skips the fold instead of scanning the document, because two Sessions
     * side by side both have a Turn 3.
     *
     * The shipped group body also carries `data-chat-flow`, so the *outermost* match
     * is taken: that is always the Session column, and it keeps the capsule in scope
     * even when the footer itself renders inside a step group.
     */
    function resolveScope(start) {
      try {
        if (start === null || start === undefined || typeof start.closest !== 'function') return null;
        const nearest = start.closest(FLOW_SELECTOR);
        if (nearest === null) return null;
        let scope = nearest;
        for (let node = nearest.parentNode; node !== null && node !== undefined;) {
          if (typeof node.matches === 'function' && node.matches(FLOW_SELECTOR)) scope = node;
          node = node.parentNode;
        }
        return scope;
      } catch (error) {
        return null;
      }
    }

    /** Every flow item of one Turn inside one Session, deduplicated. */
    function collectItems(turnNumber, scope) {
      if (!isTurnNumber(turnNumber) || scope === null || scope === undefined) return [];
      const items = new Set();
      let roots;
      try {
        roots = scope.querySelectorAll(TURN_SELECTOR + '[data-chat-turn="' + turnNumber + '"]');
      } catch (error) {
        return [];
      }
      for (let index = 0; index < roots.length; index += 1) items.add(roots[index]);
      return Array.from(items);
    }

    /** The items of one Turn that match one of the shipped control selectors. */
    function collectBy(selector, turnNumber, scope) {
      const items = collectItems(turnNumber, scope);
      const found = new Set();
      for (let index = 0; index < items.length; index += 1) {
        let matches;
        try {
          matches = items[index].querySelectorAll(selector);
        } catch (error) {
          continue;
        }
        for (let cursor = 0; cursor < matches.length; cursor += 1) found.add(matches[cursor]);
      }
      return Array.from(found);
    }

    /** The shipped settled-Turn capsule of one Turn, when the policy renders one. */
    function collectCapsules(turnNumber, scope) {
      return collectBy(CAPSULE_SELECTOR, turnNumber, scope);
    }

    /** The step-group headers of one Turn. */
    function collectGroups(turnNumber, scope) {
      return collectBy(GROUP_SELECTOR, turnNumber, scope);
    }

    /** The reasoning rows of one Turn. */
    function collectReasons(turnNumber, scope) {
      return collectBy(REASON_SELECTOR, turnNumber, scope);
    }

    /**
     * Fold the shipped settled-Turn capsule, which hides the whole step process.
     *
     * The button is `disabled` when the shipped policy will not fold it — verbose
     * mode, a still-open Turn, or an aborted/errored one — and a disabled button
     * ignores the click, so it is skipped rather than forced.
     */
    function foldCapsules(turnNumber, scope) {
      const capsules = collectCapsules(turnNumber, scope);
      for (let index = 0; index < capsules.length; index += 1) {
        const capsule = capsules[index];
        if (capsule.disabled === true) continue;
        if (!capsule.hasAttribute('data-open')) continue;
        try {
          capsule.click();
        } catch (error) {
          /* a detached capsule is simply skipped */
        }
      }
    }

    /** Fold the step-group headers, which is what hides the tool rows. */
    function foldGroups(turnNumber, scope) {
      const groups = collectGroups(turnNumber, scope);
      for (let index = 0; index < groups.length; index += 1) {
        const group = groups[index];
        if (group.getAttribute('aria-expanded') !== 'true') continue;
        try {
          group.click();
        } catch (error) {
          /* a detached header is simply skipped */
        }
      }
    }

    /**
     * Fold the reasoning rows the user (or the live Turn) left unfolded.
     *
     * The primitives DisclosureRow reports its state as `data-open` on its own root,
     * and toggles either from the row itself (`role="button"`) or from a dedicated
     * leading button, so both shapes are handled.
     */
    function foldReasons(turnNumber, scope) {
      const reasons = collectReasons(turnNumber, scope);
      for (let index = 0; index < reasons.length; index += 1) {
        const reason = reasons[index];
        let row;
        try {
          row = reason.querySelector('[data-disclosure-row]');
        } catch (error) {
          continue;
        }
        if (row === null) continue;
        let open;
        try {
          open = reason.querySelector('[data-open]') !== null;
        } catch (error) {
          continue;
        }
        if (!open) continue;
        try {
          if (row.getAttribute('role') === 'button') {
            row.click();
          } else {
            const leading = row.querySelector('button[aria-expanded]');
            if (leading !== null) leading.click();
          }
        } catch (error) {
          /* a detached row is simply skipped */
        }
      }
    }

    /** One full fold pass over a Turn: capsule, then step groups, then reasoning. */
    function foldTurn(turnNumber, scope) {
      foldCapsules(turnNumber, scope);
      foldGroups(turnNumber, scope);
      foldReasons(turnNumber, scope);
    }

    /**
     * Turn-end auto-fold.
     *
     * The contribution renders no chrome of its own: the shipped capsule already is
     * the header the user asked for, so the plugin's whole job is to make sure a
     * finished Turn really ends up folded, and to leave every pixel of the folded
     * state to the shipped components.
     *
     * The turn-tail Slot only exists once a Turn has ended, so mounting *is* the
     * turn-end signal. The freshness window then separates "this Turn just ended"
     * from "this Turn was restored from history", so opening a Session never
     * re-collapses a disclosure the user had chosen to expand.
     */
    function ThoughtCollapse(props) {
      const anchorRef = React.useRef(null);
      const turn = props === null || props === undefined ? null : props.turn;

      /** Wall-clock end of the Turn, when the shipped Turn object carries one. */
      let endedAt = null;
      if (turn !== null && typeof turn === 'object' && turn.end !== null && typeof turn.end === 'object') {
        const time = turn.end.time;
        if (typeof time === 'number' && Number.isFinite(time)) endedAt = time;
      }

      React.useEffect(() => {
        if (endedAt === null) return undefined;
        if (Date.now() - endedAt > FRESH_MS) return undefined;

        let cancelled = false;
        const timers = [];
        const run = () => {
          if (cancelled) return;
          const anchor = anchorRef.current;
          if (anchor === null || anchor === undefined) return;
          const turnNumber = readTurnNumber(anchor);
          if (turnNumber === null) return;
          const scope = resolveScope(anchor);
          if (scope === null) return;
          foldTurn(turnNumber, scope);
        };

        if (typeof window === 'undefined' || typeof window.setTimeout !== 'function') {
          run();
          return undefined;
        }
        for (let index = 0; index < PASS_DELAYS.length; index += 1) {
          timers.push(window.setTimeout(run, PASS_DELAYS[index]));
        }
        return () => {
          cancelled = true;
          for (let index = 0; index < timers.length; index += 1) window.clearTimeout(timers[index]);
        };
      }, [endedAt]);

      return h('span', { className: 'dtc-anchor', ref: anchorRef, 'aria-hidden': true });
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.effect(() => attachStyles(CSS), 'thought-collapse: styles');
        ctx.slots.inject(SLOT, () => ctx.slots.register(
          { name: SLOT, id: ID, order: ORDER },
          ThoughtCollapse,
        ));
      },
    };
  },
});
