/* Adapted from Hyper DOM Expressions - The MIT License - Ryan Carniato */
import { EMPTY_ARR } from './constants.js';
import { insert } from './insert.js';

/**
 * Create a sinuous `h` tag aka hyperscript.
 * @param  {object} api
 * @param {Function} [api.subscribe] - Function that listens to state changes.
 * @param {Function} [api.cleanup] - Add the given function to the cleanup stack.
 * @return {Function} `h` tag.
 */
export function context(api) {
  function h() {
    const args = EMPTY_ARR.slice.call(arguments);
    let el;

    function item(arg) {
      const type = typeof arg;
      if (arg == null);
      else if (type === 'string') {
        if (el) {
          el.appendChild(document.createTextNode(arg));
        } else {
          el = document.createElement(arg);
        }
      } else if (Array.isArray(arg)) {
        // Support Fragments
        if (!el) el = document.createDocumentFragment();
        arg.forEach(item);
      } else if (arg instanceof Node) {
        if (el) {
          el.appendChild(arg);
        } else {
          // Support updates
          el = arg;
        }
      } else if (type === 'object') {
        parseNested(api, el, arg, parseKeyValue);
      } else if (type === 'function') {
        if (el) {
          const marker = el.appendChild(document.createTextNode(''));
          if (arg.$f) {
            // Support flow control
            arg(api, el, marker);
          } else if (arg.$t) {
            const insertAction = createInsertAction(api, '');
            insertAction(el, '');
            // Record insert action in template.
            arg.$t(el, insertAction);
          } else {
            insert(api.subscribe, el, arg, marker);
          }
        } else {
          // Support Components
          el = arg.apply(null, args.splice(0));
        }
      } else {
        el.appendChild(document.createTextNode('' + arg));
      }
    }

    while (args.length) {
      item(args.shift());
    }
    return el;
  }

  return h;
}

/**
 * Create an insert action for a `template` tag.
 *
 * Subsequent `insert`'s of strings can be optimized by setting
 * `Text.data` instead of Element.textContent.
 *
 * @param  {Function} api
 * @param  {*} current
 * @return {Function}
 */
function createInsertAction(api, current) {
  return (element, value) => {
    current = insert(api.subscribe, element, value, null, current);
  };
}

export function parseNested(api, el, obj, callback) {
  for (let name in obj) {
    // Create scope for every entry.
    const propAction = function(element, value) {
      if (typeof value === 'function') {
        if (value.$t) {
          // Record property action in template.
          value.$t(element, propAction);
        } else {
          api.subscribe(() =>
            // Functions added as event handlers are not executed on render
            // unless they have an observable indicator.
            callback(
              name,
              name[0] === 'o' && name[1] === 'n' && !value.$o ? value : value(),
              api,
              element
            )
          );
        }
      } else {
        callback(name, value, api, element);
      }
    };
    propAction(el, obj[name]);
  }
}

export function parseKeyValue(name, value, api, el) {
  let prefix;
  if (name === 'class' || name === 'className') {
    el.className = value;
  } else if (
    (prefix = name.slice(0, 5)) &&
    (prefix === 'data-' || prefix === 'aria-')
  ) {
    el.setAttribute(name, value);
  } else if (name[0] === 'o' && name[1] === 'n') {
    handleEvent(api, el, name, value);
  } else if (name === 'style') {
    if (typeof value === 'string') {
      el.style.cssText = value;
    } else {
      parseNested(api, el, value, (n, v) => el.style.setProperty(n, v));
    }
  } else if (name === 'attrs') {
    parseNested(api, el, value, (n, v) => el.setAttribute(n, v));
  } else {
    el[name] = value;
  }
}

function handleEvent(api, el, name, value) {
  name = name.slice(2);

  const removeListener = api.cleanup(() =>
    el.removeEventListener(name, eventProxy)
  );

  if (value) {
    el.addEventListener(name, eventProxy);
  } else {
    removeListener();
  }

  (el._listeners || (el._listeners = {}))[name] = value;
}

/**
 * Proxy an event to hooked event handlers.
 * @param {Event} e - The event object from the browser.
 * @return {Function}
 */
function eventProxy(e) {
  // eslint-disable-next-line
  return this._listeners[e.type](e);
}
