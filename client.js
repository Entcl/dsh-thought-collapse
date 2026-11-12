window.__ModuleLoader__.load({
  id: 'dsh-thought-collapse',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace owned by this package. */
    const NS = 'thoughtCollapse';
    /** Turn-tail list slot: replaceRisk "none", so a fresh id only adds an entry. */
    const SLOT = 'conversation.chat.turnTail';
    /** Stable contribution id, so a re-activation replaces instead of duplicating. */
    const ID = 'thought-collapse';
    /** Ordered after the shipped tail contributions. */
    const ORDER = 100;

    /**
     * Shipped row roots: the reasoning row carries data-variant="think", every tool
     * row carries data-tool. Both wrap a primitives DisclosureRow whose own root
     * carries data-open only while expanded, so "is this folded" needs no private
     * state of ours: we read and drive the shipped disclosure instead.
     */
    const OWNER_SELECTOR = '[data-variant="think"], [data-tool]';
    const ROW_SELECTOR = '[data-disclosure-row]';
    const OPEN_SELECTOR = '[data-open]';
    const TURN_SELECTOR = '[data-chat-turn]';

    /**
     * Turns already folded once, keyed by Session plus Turn number, so two Sessions
     * that both have a Turn 3 never collide, and a remount cannot re-fold a Turn the
     * user has since unfolded on purpose. Bounded, because the bar outlives any one
     * Turn and an unbounded Set would grow with the whole conversation.
     */
    const AUTO_FOLDED = new Set();
    const AUTO_FOLDED_LIMIT = 512;

    /** Stable fold-guard key for one Turn; the Turn number alone is not unique. */
    function autoFoldKey(sessionId, turnNumber) {
      return String(sessionId === undefined || sessionId === null ? '' : sessionId) + '#' + turnNumber;
    }

    const DICTS = {
      en: {
        'bar.title': 'Analysis complete',
        'bar.collapse': 'Fold reasoning and tool calls',
        'bar.expand': 'Unfold reasoning and tool calls',
        'bar.openCount': '{count} unfolded',
        'bar.collapsed': 'Folded',
        'bar.empty': 'Nothing to fold',
      },
      zh: {
        'bar.title': '已完成分析',
        'bar.collapse': '收起思考与工具调用',
        'bar.expand': '展开思考与工具调用',
        'bar.openCount': '已展开 {count} 项',
        'bar.collapsed': '已收起',
        'bar.empty': '暂无可折叠内容',
      },
    };

    const CSS = [
      '.dtc-anchor{display:none}',
      '.dtc-bar{display:flex;align-items:center;margin-top:4px}',
      '.dtc-toggle{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;',
      'border:1px solid var(--dsw-alias-border-l1);border-radius:999px;',
      'background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);',
      'font:inherit;font-size:12px;line-height:18px;cursor:pointer;',
      'transition:background-color .15s ease,color .15s ease,border-color .15s ease}',
      '.dtc-toggle:hover:not([disabled]){background:var(--dsw-alias-bg-layer-2);',
      'color:var(--dsw-alias-label-primary)}',
      '.dtc-toggle:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);',
      'outline-offset:2px}',
      '.dtc-toggle[disabled]{cursor:default;opacity:.55}',
      '.dtc-title{font-weight:500;color:var(--dsw-alias-label-primary)}',
      '.dtc-meta{color:var(--dsw-alias-label-secondary);opacity:.8}',
      '.dtc-chevron{flex:none;transition:transform .15s ease}',
      '.dtc-bar[data-open] .dtc-chevron{transform:rotate(180deg)}',
    ].join('');

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

    /** Locale seat with a built-in fallback, so a missing locale face still renders. */
    function makeTranslate(seat) {
      return function translate(key, params) {
        if (typeof seat === 'function') {
          try {
            const value = seat(key, params);
            if (typeof value === 'string' && value !== '' && value !== key) return value;
          } catch (error) {
            /* a locale face that throws must not take the row down */
          }
        }
        const fallback = DICTS.zh[key];
        return typeof fallback === 'string' ? fallback : key;
      };
    }

    /** Fill the count placeholder ourselves; either locale behavior then reads right. */
    function formatCount(t, count) {
      return String(t('bar.openCount')).replace('{count}', String(count));
    }

    /** Turn numbers are integers; anything else is not a usable selector value. */
    function isTurnNumber(value) {
      return typeof value === 'string' && /^[0-9]+$/.test(value);
    }

    /** Our own wrapper carries the Turn number, so the fold needs no owner props. */
    function readTurnNumber(node) {
      try {
        if (node === null || node === undefined || typeof node.closest !== 'function') return null;
        const wrapper = node.closest('[data-turn-tail]');
        if (wrapper === null) return null;
        const value = wrapper.getAttribute('data-turn-tail');
        return isTurnNumber(value) ? value : null;
      } catch (error) {
        return null;
      }
    }

    /**
     * Every reasoning and tool-call disclosure belonging to one Turn, deduplicated.
     * Several nested elements can carry data-chat-turn, so collecting owners into a
     * Set keeps the counters from double-counting the same row. The search is scoped
     * to the surrounding Turn list rather than the whole document: two Sessions
     * rendered side by side both have a Turn 3, and only ours may be folded.
     */
    function collectOwners(turnNumber, scope) {
      if (!isTurnNumber(turnNumber)) return [];
      const owners = new Set();
      let roots;
      try {
        roots = (scope === null || scope === undefined ? document : scope)
          .querySelectorAll(TURN_SELECTOR + '[data-chat-turn="' + turnNumber + '"]');
      } catch (error) {
        return [];
      }
      for (let index = 0; index < roots.length; index += 1) {
        let found;
        try {
          found = roots[index].querySelectorAll(OWNER_SELECTOR);
        } catch (error) {
          continue;
        }
        for (let cursor = 0; cursor < found.length; cursor += 1) owners.add(found[cursor]);
      }
      return Array.from(owners);
    }

    /** The disclosure row inside one owner, when the owner renders one at all. */
    function rowOf(owner) {
      try {
        return owner.querySelector(ROW_SELECTOR);
      } catch (error) {
        return null;
      }
    }

    /** A row is unfolded when its DisclosureRow root carries data-open. */
    function isOpen(owner) {
      try {
        return owner.querySelector(OPEN_SELECTOR) !== null;
      } catch (error) {
        return false;
      }
    }

    /**
     * A row can be unfolded when DisclosureRow reports an expandable row, or when it
     * rendered a dedicated leading toggle button (the no-row-click variant).
     */
    function isExpandable(row) {
      if (row === null) return false;
      if (row.hasAttribute('data-expandable')) return true;
      try {
        return row.querySelector('button[aria-expanded]') !== null;
      } catch (error) {
        return false;
      }
    }

    /** Click whatever actually carries the disclosure toggle for one row. */
    function clickRow(row) {
      try {
        if (row.getAttribute('role') === 'button') {
          row.click();
          return;
        }
        const leading = row.querySelector('button[aria-expanded]');
        if (leading !== null) leading.click();
      } catch (error) {
        /* a detached or disabled row is simply skipped */
      }
    }

    /** Nearest ancestor that holds several Turns, so one observer sees them all. */
    function findTurnList(start) {
      let node = start;
      for (let depth = 0; depth < 8 && node !== null && node !== undefined; depth += 1) {
        try {
          if (node.querySelectorAll(TURN_SELECTOR).length > 1) return node;
        } catch (error) {
          return null;
        }
        node = node.parentElement;
      }
      return null;
    }

    /** Chevron pointing down: folding hides detail. */
    function chevron() {
      return h(
        'svg',
        {
          className: 'dtc-chevron',
          viewBox: '0 0 16 16',
          width: 12,
          height: 12,
          'aria-hidden': true,
        },
        h('path', {
          d: 'M4 6.5 8 10.5 12 6.5',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      );
    }

    /**
     * Per-Turn control over the conversation's reasoning and tool-call rows.
     *
     * Shipped rows already start folded and own their own disclosure state, which
     * this contribution never duplicates: it reads that state off the DOM and drives
     * it through the rows' own toggle, so the shipped animation and accessibility
     * stay intact. What it adds is Turn-level control — one click folds the whole
     * Turn again, and a finished Turn folds itself once.
     */
    function ThoughtCollapseBar(props) {
      const seat = props ? props.t : undefined;
      const t = React.useMemo(() => makeTranslate(seat), [seat]);
      const anchorRef = React.useRef(null);
      const [view, setView] = React.useState({ open: 0, total: 0 });
      const stateRef = React.useRef({ open: 0 });

      const turn = props ? props.turn : null;
      const sessionId = props ? props.sessionId : undefined;
      const status = turn !== null && typeof turn === 'object' && typeof turn.status === 'string'
        ? turn.status
        : 'unknown';
      const closed = status === 'closed';

      /** The Turn list this bar lives in; the fold must not reach other Sessions. */
      const scope = React.useCallback(() => findTurnList(anchorRef.current), []);

      /** Recompute the counters from the live Turn DOM. */
      const read = React.useCallback(() => {
        const owners = collectOwners(readTurnNumber(anchorRef.current), scope());
        let open = 0;
        for (let index = 0; index < owners.length; index += 1) {
          if (isOpen(owners[index])) open += 1;
        }
        stateRef.current.open = open;
        const total = owners.length;
        setView((previous) => (
          previous.open === open && previous.total === total ? previous : { open: open, total: total }
        ));
      }, [scope]);

      /** Fold or unfold every reasoning and tool-call row of this Turn. */
      const apply = React.useCallback((mode) => {
        const turnNumber = readTurnNumber(anchorRef.current);
        if (turnNumber === null) return;
        const owners = collectOwners(turnNumber, scope());
        const targets = [];
        for (let index = 0; index < owners.length; index += 1) {
          const owner = owners[index];
          const open = isOpen(owner);
          if (mode === 'expand' ? open : !open) continue;
          const row = rowOf(owner);
          if (row === null) continue;
          if (!isExpandable(row)) continue;
          targets.push(row);
        }
        for (let index = 0; index < targets.length; index += 1) clickRow(targets[index]);
        stateRef.current.open = mode === 'expand' ? owners.length : 0;
        setView((previous) => ({
          open: mode === 'expand' ? Math.max(previous.total, owners.length) : 0,
          total: Math.max(previous.total, owners.length),
        }));
        if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
          window.setTimeout(read, 0);
        }
      }, [read, scope]);

      const toggle = React.useCallback(() => {
        apply(stateRef.current.open > 0 ? 'collapse' : 'expand');
      }, [apply]);

      /* Keep the counters honest without owning any of the rows' state. */
      React.useEffect(() => {
        read();
        if (typeof MutationObserver !== 'function') return undefined;
        const anchor = anchorRef.current;
        if (anchor === null) return undefined;
        const container = findTurnList(anchor);
        if (container === null) return undefined;
        let frame = 0;
        const observer = new MutationObserver(() => {
          if (frame !== 0) return;
          frame = window.requestAnimationFrame(() => {
            frame = 0;
            read();
          });
        });
        try {
          observer.observe(container, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['data-open', 'data-expanded', 'data-chat-turn'],
          });
        } catch (error) {
          return undefined;
        }
        return () => {
          if (frame !== 0) window.cancelAnimationFrame(frame);
          observer.disconnect();
        };
      }, [read]);

      /* Default folded, and a finished Turn folds itself once. */
      React.useEffect(() => {
        if (!closed) return undefined;
        const timer = window.setTimeout(() => {
          const turnNumber = readTurnNumber(anchorRef.current);
          if (turnNumber === null) return;
          const key = autoFoldKey(sessionId, turnNumber);
          if (AUTO_FOLDED.has(key)) return;
          AUTO_FOLDED.add(key);
          if (AUTO_FOLDED.size > AUTO_FOLDED_LIMIT) {
            const oldest = AUTO_FOLDED.values().next();
            if (!oldest.done) AUTO_FOLDED.delete(oldest.value);
          }
          apply('collapse');
        }, 0);
        return () => window.clearTimeout(timer);
      }, [closed, sessionId, apply]);

      const anchor = h('span', { className: 'dtc-anchor', ref: anchorRef, 'aria-hidden': true });

      if (!closed) return anchor;

      const empty = view.total === 0;
      const label = empty
        ? t('bar.empty')
        : view.open > 0
          ? formatCount(t, view.open)
          : t('bar.collapsed');

      return h(
        React.Fragment,
        null,
        anchor,
        h(
          'div',
          { className: 'dtc-bar', 'data-open': view.open > 0 ? true : undefined },
          h(
            'button',
            {
              type: 'button',
              className: 'dtc-toggle',
              disabled: empty,
              title: view.open > 0 ? t('bar.collapse') : t('bar.expand'),
              'aria-label': view.open > 0 ? t('bar.collapse') : t('bar.expand'),
              'aria-expanded': view.open > 0,
              onClick: toggle,
            },
            h('span', { className: 'dtc-title' }, t('bar.title')),
            h('span', { className: 'dtc-meta' }, label),
            chevron(),
          ),
        ),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICTS), 'thought-collapse: locale');
        ctx.effect(() => attachStyles(CSS), 'thought-collapse: styles');
        ctx.slots.inject(SLOT, () => ctx.slots.register(
          { name: SLOT, id: ID, order: ORDER, locale: NS },
          ThoughtCollapseBar,
        ));
      },
    };
  },
});
