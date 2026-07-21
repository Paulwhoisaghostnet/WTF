/* Macaroni Octez Connect bridge.
   Depends on vendor/tezos.js and vendor/octez-connect.js. */

"use strict";

(function installMacaroniOctezWallet(root) {
  const FEATURED_WALLETS = ["kukai", "temple", "umami"];

  function sdk() {
    return root.MacaroniOctezConnect || root.beacon || null;
  }

  function dappClientCtor() {
    const current = sdk();
    return current && typeof current.DAppClient === "function" ? current.DAppClient : null;
  }

  function createDAppClient(options) {
    const current = sdk();
    if (current && typeof current.getDAppClientInstance === "function") {
      return current.getDAppClientInstance(options, Boolean(options && options.resetClient));
    }
    const DAppClient = dappClientCtor();
    if (!DAppClient) return null;
    return new DAppClient(options);
  }

  function disableMetrics(client) {
    if (!client) return;
    client.enableMetrics = false;
    client.updateMetricsStorage = async () => {};
    client.sendMetrics = () => {};
  }

  function callIf(client, method, args) {
    if (!client || typeof client[method] !== "function") return undefined;
    return client[method](...(args || []));
  }

  async function settleAll(calls) {
    await Promise.all(calls.filter(Boolean).map((call) => Promise.resolve(call).catch(() => {})));
  }

  function isUserOrWalletDecision(err) {
    const msg = String((err && (err.message || err.name)) || err || "").toLowerCase();
    return /abort|cancel|reject|not granted|permission|network|different network|no active account|user/.test(msg);
  }

  function shouldUseBeaconBackup(err) {
    const msg = String((err && (err.message || err.name)) || err || "").toLowerCase();
    if (isUserOrWalletDecision(err)) return false;
    return /octez|dappclient|constructor|undefined|unavailable|not available|transport|extension|postmessage|walletconnect|failed/.test(msg);
  }

  function installOctezPrimaryWallet(options) {
    const tz = root.TZ;
    if (!tz || !tz.BeaconWallet) return false;

    const NativeBeaconWallet = tz.BeaconWalletFallback || tz.BeaconWallet;
    if (!tz.BeaconWalletFallback && tz.BeaconWallet !== tz.OctezPrimaryWallet) {
      tz.BeaconWalletFallback = NativeBeaconWallet;
    }

    const DAppClient = dappClientCtor();

    class OctezPrimaryWallet {
      constructor(walletOptions) {
        const opts = walletOptions || {};
        this.providerName = "octez.connect";
        this.options = opts;
        this._activeProviderName = "beacon";
        this._nativeBeacon = NativeBeaconWallet;
        this.beaconBackup = new NativeBeaconWallet({
          ...opts,
          enableMetrics: false,
          featuredWallets: opts.featuredWallets || FEATURED_WALLETS,
        });
        disableMetrics(this.beaconBackup.client);
        this.walletProvider = this.beaconBackup;
        this.octezClient = null;
        this.octezProvider = null;

        if (DAppClient) {
          try {
            this.octezClient = createDAppClient({
              ...opts,
              enableMetrics: false,
              featuredWallets: opts.featuredWallets || FEATURED_WALLETS,
            });
            if (!this.octezClient) throw new Error("Octez DAppClient is not available");
            disableMetrics(this.octezClient);

            this.octezProvider = new NativeBeaconWallet({
              ...opts,
              enableMetrics: false,
              resetClient: false,
              featuredWallets: opts.featuredWallets || FEATURED_WALLETS,
            });
            this.octezProvider.client = this.octezClient;
            this.walletProvider = this.octezProvider;
            this._activeProviderName = "octez.connect";
          } catch (err) {
            this.octezClient = null;
            this.octezProvider = null;
            this.providerName = "beacon";
            this._activeProviderName = "beacon";
            root.console && root.console.warn && root.console.warn("[Macaroni] Octez Connect unavailable, using Beacon backup:", err);
          }
        } else {
          this.providerName = "beacon";
        }

        this.client = this.makeClientFacade();

        return new Proxy(this, {
          get(target, prop) {
            if (prop in target) {
              const value = target[prop];
              return typeof value === "function" ? value.bind(target) : value;
            }
            const provider = target.walletProvider;
            const value = provider && provider[prop];
            return typeof value === "function" ? value.bind(provider) : value;
          },
        });
      }

      activeClient() {
        return this.octezClient || (this.beaconBackup && this.beaconBackup.client);
      }

      clients() {
        return [this.octezClient, this.octezProvider && this.octezProvider.client, this.beaconBackup && this.beaconBackup.client]
          .filter(Boolean)
          .filter((client, index, list) => list.indexOf(client) === index);
      }

      setClientValue(prop, value) {
        this.clients().forEach((client) => {
          try {
            client[prop] = value;
          } catch (_) {
            /* readonly in some SDK builds */
          }
        });
      }

      configure(options) {
        const opts = options || {};
        this.options = { ...this.options, ...opts };
        if (opts.network) this.setClientValue("network", opts.network);
        if (opts.preferredNetwork) this.setClientValue("preferredNetwork", opts.preferredNetwork);
        if (opts.featuredWallets) this.setClientValue("featuredWallets", opts.featuredWallets);
        this.clients().forEach(disableMetrics);
        return this;
      }

      subscribeToEvent(eventName, handler) {
        this.clients().forEach((client) => callIf(client, "subscribeToEvent", [eventName, handler]));
      }

      makeClientFacade() {
        const wallet = this;
        const facade = {
          get network() {
            const client = wallet.activeClient();
            return client && client.network;
          },
          set network(value) {
            wallet.setClientValue("network", value);
          },
          get preferredNetwork() {
            const client = wallet.activeClient();
            return client && client.preferredNetwork;
          },
          set preferredNetwork(value) {
            wallet.setClientValue("preferredNetwork", value);
          },
          get featuredWallets() {
            const client = wallet.activeClient();
            return (client && client.featuredWallets) || FEATURED_WALLETS;
          },
          set featuredWallets(value) {
            wallet.setClientValue("featuredWallets", value);
          },
          enableMetrics: false,
          updateMetricsStorage: async () => {},
          sendMetrics: () => {},
          getActiveAccount: () => wallet.getActiveAccountInfo(),
          setActiveAccount: (account) => wallet.setActiveAccountInfo(account),
          clearActiveAccount: () => wallet.clearActiveAccount(),
          setActivePeer: (peer) => wallet.setActivePeer(peer),
          setTransport: (transport) => wallet.setTransport(transport),
          subscribeToEvent: (eventName, handler) => wallet.subscribeToEvent(eventName, handler),
          requestPermissions: (input) => wallet.requestPermissions(input),
          requestOperation: (input) => callIf(wallet.activeClient(), "requestOperation", [input]),
          requestSignPayload: (input) => callIf(wallet.activeClient(), "requestSignPayload", [input]),
          showPrepare: () => callIf(wallet.activeClient(), "showPrepare"),
          hideUI: (input) => callIf(wallet.activeClient(), "hideUI", [input]),
        };
        return facade;
      }

      useBeaconBackup(err) {
        this.walletProvider = this.beaconBackup;
        this.providerName = "beacon";
        this._activeProviderName = "beacon";
        root.console && root.console.warn && root.console.warn("[Macaroni] Falling back to Beacon wallet provider:", err);
      }

      async syncActiveAccountToBeacon() {
        if (!this.octezClient || !this.beaconBackup || !this.beaconBackup.client) return;
        const account = await this.octezClient.getActiveAccount();
        if (account && typeof this.beaconBackup.client.setActiveAccount === "function") {
          await this.beaconBackup.client.setActiveAccount(account);
        }
      }

      async getActiveAccountInfo() {
        if (this.octezClient && this._activeProviderName === "octez.connect") {
          const account = await this.octezClient.getActiveAccount();
          if (account) return account;
        }
        if (this.beaconBackup && this.beaconBackup.client) {
          return this.beaconBackup.client.getActiveAccount();
        }
        return null;
      }

      async setActiveAccountInfo(account) {
        await settleAll(this.clients().map((client) => callIf(client, "setActiveAccount", [account])));
      }

      async setActivePeer(peer) {
        await settleAll(this.clients().map((client) => callIf(client, "setActivePeer", [peer])));
      }

      async setTransport(transport) {
        await settleAll(this.clients().map((client) => callIf(client, "setTransport", [transport])));
      }

      async requestPermissions(input) {
        if (this.octezProvider && this._activeProviderName === "octez.connect") {
          try {
            const result = await this.octezProvider.requestPermissions(input);
            await this.syncActiveAccountToBeacon();
            return result;
          } catch (err) {
            if (!shouldUseBeaconBackup(err)) throw err;
            this.useBeaconBackup(err);
          }
        }
        return this.beaconBackup.requestPermissions(input);
      }

      async getPKH() {
        const account = await this.getActiveAccountInfo();
        if (account && account.address) return account.address;
        return this.walletProvider.getPKH();
      }

      async getPK() {
        const account = await this.getActiveAccountInfo();
        if (account && account.publicKey) return account.publicKey;
        if (typeof this.walletProvider.getPK === "function") return this.walletProvider.getPK();
        return "";
      }

      async clearActiveAccount() {
        await settleAll([
          this.octezClient && callIf(this.octezClient, "clearActiveAccount"),
          this.octezClient && callIf(this.octezClient, "setActiveAccount", [undefined]),
          this.beaconBackup && this.beaconBackup.clearActiveAccount(),
        ]);
      }

      async disconnect() {
        await settleAll([
          this.octezClient && callIf(this.octezClient, "destroy"),
          this.beaconBackup && this.beaconBackup.disconnect && this.beaconBackup.disconnect(),
        ]);
      }
    }

    OctezPrimaryWallet.providerName = "octez.connect";
    OctezPrimaryWallet.featuredWallets = FEATURED_WALLETS.slice();
    tz.OctezPrimaryWallet = OctezPrimaryWallet;
    tz.installOctezPrimaryWallet = installOctezPrimaryWallet;

    if (options && options.patchBeacon) {
      tz.BeaconWallet = OctezPrimaryWallet;
    }

    return true;
  }

  root.MacaroniOctezWallet = {
    installOctezPrimaryWallet,
    featuredWallets: FEATURED_WALLETS.slice(),
  };

  if (root.TZ) {
    root.TZ.installOctezPrimaryWallet = installOctezPrimaryWallet;
    installOctezPrimaryWallet();
  }
})(typeof window !== "undefined" ? window : globalThis);
