(function () {
  // Keep direct legacy URLs usable while the corresponding navigation entries stay hidden.
  var oldRoute = window.route;
  if (typeof oldRoute === 'function') {
    window.route = function () {
      if (location.pathname === '/notifications') {
        app.innerHTML = uiExtraPage('notifications');
        return uiFillExtra('notifications');
      }
      return oldRoute();
    };
  }

  var renamePermissionButtons = function () {
    document.querySelectorAll('[data-select-permission]').forEach(function (button) {
      if (button.textContent !== '设置权限') button.textContent = '设置权限';
    });
  };
  renamePermissionButtons();
  if (document.body) {
    new MutationObserver(renamePermissionButtons).observe(document.body, { childList: true, subtree: true });
  }
}());
