async function hardReset() {
  try {
    if ('serviceWorker' in navigator) {
      var regs = await navigator.serviceWorker.getRegistrations();
      for (var r of regs) await r.unregister();
    }
    if ('caches' in window) {
      var keys = await caches.keys();
      for (var k of keys) await caches.delete(k);
    }
  } catch(e) {}
  location.reload(true);
}

setTimeout(function() {
  var el = document.getElementById('content');
  if (el && el.innerText.trim() === 'Initialising...') {
    var div = document.createElement('div');
    div.style.cssText = 'padding:2rem 1.5rem;text-align:center';

    var p1 = document.createElement('p');
    p1.textContent = 'Stuck loading';
    p1.style.cssText = 'color:#ff6b6b;margin-bottom:.5rem;font-weight:600';

    var p2 = document.createElement('p');
    p2.textContent = 'Your cached version is outdated. Tap below to clear it and reload.';
    p2.style.cssText = 'color:#7070a0;font-size:.9rem;margin-bottom:1.5rem';

    var btn = document.createElement('button');
    btn.textContent = 'Clear Cache & Reload';
    btn.style.cssText = 'background:#6c63ff;color:#fff;border:none;padding:.8rem 2rem;border-radius:10px;font-size:1rem;cursor:pointer;font-weight:600';
    btn.addEventListener('click', hardReset);

    div.appendChild(p1);
    div.appendChild(p2);
    div.appendChild(btn);
    el.innerHTML = '';
    el.appendChild(div);
  }
}, 5000);
