/* TagioFi wallet connect (MetaMask / Phantom) on Robinhood Chain - shared across pages */
(function () {
  var KEY = 'tagiofi_wallet';
  var KEY_PROVIDER = 'tagiofi_wallet_provider';

  // Robinhood Chain (Arbitrum L2, ETH gas token)
  var CHAIN = {
    chainId: '0x1237', // 4663
    chainName: 'Robinhood Chain',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://rpc.chain.robinhood.com/rpc'],
    blockExplorerUrls: ['https://explorer.chain.robinhood.com']
  };

  var BASE = (function () {
    var s = document.currentScript && document.currentScript.src;
    if (!s) {
      var all = document.getElementsByTagName('script');
      for (var i = 0; i < all.length; i++) if (/wallet\.js/.test(all[i].src)) s = all[i].src;
    }
    return s ? s.replace(/assets\/js\/wallet\.js.*$/, '') : '';
  })();

  var WALLETS = {
    metamask: {
      name: 'MetaMask',
      note: 'Browser extension · EVM',
      logo: BASE + 'assets/img/wallet-metamask.svg',
      install: 'https://metamask.io/download/',
      get: function () {
        var eth = window.ethereum;
        if (!eth) return null;
        if (eth.providers && eth.providers.length) {
          for (var i = 0; i < eth.providers.length; i++) {
            var p = eth.providers[i];
            if (p.isMetaMask && !p.isPhantom) return p;
          }
        }
        return eth.isMetaMask && !eth.isPhantom ? eth : null;
      }
    },
    phantom: {
      name: 'Phantom',
      note: 'Browser extension · EVM',
      logo: BASE + 'assets/img/wallet-phantom.svg',
      install: 'https://phantom.app/download',
      get: function () {
        if (window.phantom && window.phantom.ethereum) return window.phantom.ethereum;
        var eth = window.ethereum;
        if (!eth) return null;
        if (eth.providers && eth.providers.length) {
          for (var i = 0; i < eth.providers.length; i++) if (eth.providers[i].isPhantom) return eth.providers[i];
        }
        return eth.isPhantom ? eth : null;
      }
    }
  };

  function short(a) { return a.slice(0, 6) + '\u2026' + a.slice(-4); }

  function toast(msg) {
    var t = document.getElementById('dashToast');
    if (t) {
      t.textContent = msg;
      t.classList.add('is-shown');
      clearTimeout(t.__timer);
      t.__timer = setTimeout(function () { t.classList.remove('is-shown'); }, 2600);
      return;
    }
    var f = document.getElementById('walletToast');
    if (!f) {
      f = document.createElement('div');
      f.id = 'walletToast';
      f.className = 'wallet-toast';
      document.body.appendChild(f);
    }
    f.textContent = msg;
    f.classList.add('is-shown');
    clearTimeout(f.__timer);
    f.__timer = setTimeout(function () { f.classList.remove('is-shown'); }, 3200);
  }

  function paint(addr) {
    document.querySelectorAll('[data-wallet-connect]').forEach(function (el) {
      var label = el.querySelector('.btn-text') || el.querySelector('.wallet-label') || el;
      if (addr) {
        label.textContent = short(addr);
        el.classList.add('is-wallet-connected', 'is-connected');
        el.setAttribute('title', addr + ' \u2014 connected on Robinhood Chain');
      } else {
        label.textContent = 'Connect Wallet';
        el.classList.remove('is-wallet-connected', 'is-connected');
        el.removeAttribute('title');
      }
    });
    document.querySelectorAll('[data-wallet-addr]').forEach(function (el) {
      el.textContent = addr ? short(addr) : 'Not connected';
    });
  }

  async function ensureChain(provider) {
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN.chainId }] });
      return true;
    } catch (e) {
      if (e && (e.code === 4902 || (e.data && e.data.originalError && e.data.originalError.code === 4902))) {
        try {
          await provider.request({ method: 'wallet_addEthereumChain', params: [CHAIN] });
          return true;
        } catch (_) { return false; }
      }
      return false;
    }
  }

  async function connectWith(id) {
    var w = WALLETS[id];
    var provider = w.get();
    if (!provider) {
      toast(w.name + ' not detected \u2014 opening install page');
      window.open(w.install, '_blank');
      return;
    }
    try {
      var accounts = await provider.request({ method: 'eth_requestAccounts' });
      if (!accounts || !accounts[0]) return;
      var addr = accounts[0];
      localStorage.setItem(KEY, addr);
      localStorage.setItem(KEY_PROVIDER, id);
      paint(addr);
      closeModal();
      var ok = await ensureChain(provider);
      toast(ok
        ? w.name + ' connected on Robinhood Chain: ' + short(addr)
        : w.name + ' connected \u2014 switch to Robinhood Chain to settle payments');
      if (provider.on) {
        provider.on('accountsChanged', function (accs) {
          if (accs && accs[0]) { localStorage.setItem(KEY, accs[0]); paint(accs[0]); }
          else { localStorage.removeItem(KEY); localStorage.removeItem(KEY_PROVIDER); paint(null); }
        });
      }
    } catch (e) {
      if (e && e.code === 4001) toast('Connection request rejected in ' + w.name);
      else if (e && e.code === -32002) toast(w.name + ' is already waiting \u2014 check the extension popup');
      else toast('Couldn\u2019t connect ' + w.name);
    }
  }

  /* ---------- modal ---------- */
  var modal = null;

  function buildModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'wallet-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Connect a wallet');
    var rows = Object.keys(WALLETS).map(function (id) {
      var w = WALLETS[id];
      var installed = !!w.get();
      return '<button type="button" class="wallet-option" data-wallet-option="' + id + '">' +
        '<img class="wallet-option_logo" src="' + w.logo + '" alt="' + w.name + ' logo" width="36" height="36"/>' +
        '<span class="wallet-option_text"><span class="wallet-option_name">' + w.name + '</span>' +
        '<span class="wallet-option_note">' + w.note + '</span></span>' +
        '<span class="wallet-option_state">' + (installed ? 'Detected' : 'Install') + '</span>' +
        '</button>';
    }).join('');
    modal.innerHTML =
      '<div class="wallet-modal_backdrop" data-wallet-close></div>' +
      '<div class="wallet-modal_card">' +
      '<button type="button" class="wallet-modal_close" data-wallet-close aria-label="Close">\u00d7</button>' +
      '<div class="wallet-modal_head"><h3 class="wallet-modal_title">Connect a wallet</h3>' +
      '<p class="wallet-modal_sub">Sign in to TagioFi on <strong>Robinhood Chain</strong>. Your keys stay in your wallet \u2014 settlement is non-custodial.</p></div>' +
      '<div class="wallet-modal_list">' + rows + '</div>' +
      '<p class="wallet-modal_foot">We\u2019ll ask your wallet to add or switch to Robinhood Chain (ID 4663) after approval.</p>' +
      '</div>';
    document.body.appendChild(modal);

    modal.addEventListener('click', function (ev) {
      var close = ev.target.closest('[data-wallet-close]');
      if (close) { closeModal(); return; }
      var opt = ev.target.closest('[data-wallet-option]');
      if (opt) connectWith(opt.getAttribute('data-wallet-option'));
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') closeModal();
    });
    return modal;
  }

  function openModal() {
    var m = buildModal();
    // refresh detection state each open
    m.querySelectorAll('[data-wallet-option]').forEach(function (el) {
      var w = WALLETS[el.getAttribute('data-wallet-option')];
      var s = el.querySelector('.wallet-option_state');
      if (s) s.textContent = w.get() ? 'Detected' : 'Install';
    });
    m.classList.add('is-open');
    document.documentElement.classList.add('wallet-modal-open');
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove('is-open');
    document.documentElement.classList.remove('wallet-modal-open');
  }

  function disconnect() {
    localStorage.removeItem(KEY);
    localStorage.removeItem(KEY_PROVIDER);
    paint(null);
    toast('Wallet disconnected');
  }

  function bind() {
    document.querySelectorAll('[data-wallet-connect]').forEach(function (el) {
      if (el.__walletBound) return;
      el.__walletBound = true;
      el.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (localStorage.getItem(KEY)) disconnect();
        else openModal();
      }, true);
      var a = el.tagName === 'A' ? el : el.querySelector('a');
      if (a) a.setAttribute('href', '#');
    });

    // silent auto-reconnect with the previously used wallet
    var last = localStorage.getItem(KEY_PROVIDER);
    var provider = last && WALLETS[last] ? WALLETS[last].get() : (window.ethereum || null);
    if (provider && provider.request) {
      provider.request({ method: 'eth_accounts' }).then(function (accs) {
        if (accs && accs[0]) { localStorage.setItem(KEY, accs[0]); paint(accs[0]); }
        else { localStorage.removeItem(KEY); paint(null); }
      }).catch(function () { paint(localStorage.getItem(KEY) || null); });
      if (provider.on) {
        provider.on('accountsChanged', function (accs) {
          if (accs && accs[0]) { localStorage.setItem(KEY, accs[0]); paint(accs[0]); }
          else { localStorage.removeItem(KEY); localStorage.removeItem(KEY_PROVIDER); paint(null); }
        });
      }
    } else {
      paint(null);
    }
  }

  window.TagioFiWallet = { open: openModal, close: closeModal, connect: connectWith, disconnect: disconnect, chain: CHAIN };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
