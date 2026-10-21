/*
 * Petits outils d'interface : accès aux éléments, création d'éléments, icônes, message éphémère.
 */
(function (root) {
  'use strict';

  const $ = (id) => document.getElementById(id);

  /**
   * Crée un élément. attrs : class, text, html (contenu de confiance uniquement), autres attributs ;
   * les valeurs null, undefined ou false sont ignorées. children : nœud, texte ou tableau.
   */
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of [].concat(children || [])) if (c) node.append(c);
    return node;
  }

  // Icônes de l'app, définies une seule fois. Dans body.html : <span data-icon="ghost"></span>.
  const ICONS = {
    eyeOff: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/><path d="M2.5 2.5l11 11"/></svg>',
    ghost: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M3 14.2V7.2a5 5 0 0 1 10 0v7L11.3 13l-1.6 1.2L8 13l-1.7 1.2L4.7 13z"/><circle cx="6.2" cy="7.4" r="1" fill="currentColor" stroke="none"/><circle cx="9.8" cy="7.4" r="1" fill="currentColor" stroke="none"/></svg>',
    check: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"/></svg>',
  };

  /** Icône à glisser dans une phrase (HTML). */
  const inlineIcon = (name) => `<span class="inline-ico">${ICONS[name]}</span>`;

  /** Remplit les éléments [data-icon] de la page. */
  function fillIcons(scope) {
    for (const node of scope.querySelectorAll('[data-icon]')) node.innerHTML = ICONS[node.dataset.icon];
  }

  let toastTimer = null;
  function toast(msg) {
    const box = $('toast');
    box.textContent = msg;
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { box.hidden = true; }, 3200);
  }

  root.DesabosDom = { $, el, ICONS, inlineIcon, fillIcons, toast };
})(window);
