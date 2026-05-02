import { BeaconWallet } from "@taquito/beacon-wallet";
import { TezosToolkit } from "@taquito/taquito";
import { NetworkType, BeaconEvent, AccountInfo, SigningType } from "@airgap/beacon-sdk";

// Use mainnet for production
const RPC_URL = "https://mainnet.api.tez.ie";
const NETWORK_TYPE = NetworkType.MAINNET;

// Debug logging - only enabled in development mode
const DEBUG = typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production';

// Stabilization delay for Beacon SDK transport layer initialization
// The Beacon SDK v4.x has a known timing issue where the transport layer may not be
// fully initialized immediately after requestPermissions() completes. This delay
// allows the SDK internal state to settle before allowing signing operations.
const CONNECTION_STABILIZATION_DELAY_MS = 500;

const log = (message: string, data?: unknown) => {
  if (DEBUG) {
    const timestamp = new Date().toISOString();
    if (data !== undefined) {
      console.log(`[WalletService ${timestamp}] ${message}`, data);
    } else {
      console.log(`[WalletService ${timestamp}] ${message}`);
    }
  }
};

class WalletService {
  private wallet: BeaconWallet | null = null;
  private tezos: TezosToolkit | null = null;
  private userAddress: string | null = null;
  private initialized: boolean = false;
  private activeAccountResolver: ((account: AccountInfo) => void) | null = null;
  private connectionTimeoutId: ReturnType<typeof setTimeout> | null = null;
  // Track connection readiness for signing operations
  private connectionReady: boolean = false;
  private connectionReadyPromise: Promise<void> | null = null;
  private connectionReadyResolver: (() => void) | null = null;

  private async initialize() {
    if (this.initialized) return;
    
    log("Initializing wallet...");
    
    try {
      // Initialize wallet lazily with explicit network configuration
      // This is required by Beacon SDK v4.x for reliable connection
      this.wallet = new BeaconWallet({
        name: "Particle Painter",
        iconUrl: "https://tezostaquito.io/img/favicon.png",
        preferredNetwork: NETWORK_TYPE,
        network: {
          type: NETWORK_TYPE,
          rpcUrl: RPC_URL,
        },
      });
      
      log("BeaconWallet instance created");

      // Subscribe to ACTIVE_ACCOUNT_SET event before requesting permissions
      // This is required by Beacon SDK v4.x for proper account management
      await this.wallet.client.subscribeToEvent(
        BeaconEvent.ACTIVE_ACCOUNT_SET,
        (account) => {
          log("ACTIVE_ACCOUNT_SET event received", account);
          if (account) {
            this.userAddress = account.address;
            // Resolve any pending connection promise and clear the timeout
            if (this.activeAccountResolver) {
              if (this.connectionTimeoutId) {
                clearTimeout(this.connectionTimeoutId);
                this.connectionTimeoutId = null;
              }
              this.activeAccountResolver(account);
              this.activeAccountResolver = null;
            }
          }
        }
      );
      
      log("Subscribed to ACTIVE_ACCOUNT_SET event");

      this.initialized = true;
      log("Wallet initialization complete");
    } catch (error) {
      console.error("Failed to initialize wallet:", error);
      log("Wallet initialization failed", error);
      throw error;
    }
  }

  async connectWallet(): Promise<{ address: string; balance: number }> {
    log("connectWallet called");
    
    try {
      // Initialize wallet on first use
      await this.initialize();
      
      if (!this.wallet) {
        throw new Error("Failed to initialize wallet");
      }
      
      log("Wallet initialized, creating connection promise...");

      // Reset connection ready state
      this.connectionReady = false;
      this.connectionReadyPromise = new Promise<void>((resolve) => {
        this.connectionReadyResolver = resolve;
      });

      // Create a promise to wait for the active account from the subscription
      const activeAccountPromise = new Promise<AccountInfo>((resolve, reject) => {
        this.activeAccountResolver = resolve;
        // Set a timeout in case the account is never set
        this.connectionTimeoutId = setTimeout(() => {
          if (this.activeAccountResolver) {
            this.activeAccountResolver = null;
            this.connectionTimeoutId = null;
            log("Timeout waiting for active account after 60 seconds");
            reject(new Error("Timeout waiting for active account"));
          }
        }, 60000); // 60 second timeout
      });
      
      log("Requesting permissions...");

      // Request permissions - this will trigger ACTIVE_ACCOUNT_SET event
      // Network is already configured in the BeaconWallet constructor
      await this.wallet.requestPermissions();
      
      log("Permissions request completed, waiting for active account...");
      
      // Wait for the active account from the subscription
      const activeAccount = await activeAccountPromise;
      
      log("Active account received", { address: activeAccount.address });
      
      this.userAddress = activeAccount.address;

      // Initialize Tezos toolkit
      this.tezos = new TezosToolkit(RPC_URL);
      this.tezos.setWalletProvider(this.wallet);
      
      log("Tezos toolkit initialized");

      // Get balance
      const balance = await this.tezos.tz.getBalance(this.userAddress);
      const balanceInTez = balance.toNumber() / 1000000;
      
      log("Balance retrieved", { balanceInTez });

      // Mark connection as ready for signing operations after a brief stabilization delay
      // This helps ensure the Beacon SDK transport layer is fully initialized
      setTimeout(() => {
        this.connectionReady = true;
        if (this.connectionReadyResolver) {
          this.connectionReadyResolver();
          this.connectionReadyResolver = null;
        }
        log("Connection marked as ready for signing");
      }, CONNECTION_STABILIZATION_DELAY_MS);

      return {
        address: this.userAddress,
        balance: balanceInTez,
      };
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      log("connectWallet failed", error);
      throw error;
    }
  }

  async disconnectWallet(): Promise<void> {
    log("disconnectWallet called");
    
    try {
      if (this.wallet) {
        await this.wallet.clearActiveAccount();
        this.wallet = null;
        this.tezos = null;
        this.userAddress = null;
        // Reset initialized flag to allow full reinitialization on next connect
        // This ensures the ACTIVE_ACCOUNT_SET subscription is set up again
        this.initialized = false;
        // Reset connection ready state
        this.connectionReady = false;
        this.connectionReadyPromise = null;
        this.connectionReadyResolver = null;
        
        log("Wallet disconnected successfully");
      }
    } catch (error) {
      console.error("Failed to disconnect wallet:", error);
      log("disconnectWallet failed", error);
      throw error;
    }
  }

  async signMessage(message: string): Promise<string> {
    log("signMessage called", { message });
    
    if (!this.wallet) {
      log("signMessage failed: wallet not connected");
      throw new Error("Wallet not connected");
    }

    try {
      // Wait for connection to be ready before signing
      // This prevents race conditions where signing is attempted before
      // the Beacon SDK transport layer is fully initialized
      if (!this.connectionReady && this.connectionReadyPromise) {
        log("Waiting for connection to be ready before signing...");
        await this.connectionReadyPromise;
        log("Connection is now ready");
      }

      // Verify active account exists before signing (recommended by Beacon SDK v4.x)
      const activeAccount = await this.wallet.client.getActiveAccount();
      log("Active account check", { hasActiveAccount: !!activeAccount, address: activeAccount?.address });
      
      if (!activeAccount) {
        log("signMessage failed: no active account found");
        throw new Error("No active account. Please reconnect your wallet.");
      }

      log("Requesting sign payload...");
      
      const result = await this.wallet.client.requestSignPayload({
        signingType: SigningType.RAW,
        payload: message,
      });
      
      log("Sign payload successful");
      
      return result.signature;
    } catch (error) {
      console.error("Failed to sign message:", error);
      log("signMessage failed with error", {
        error,
        errorType: (error as { errorType?: string })?.errorType,
        errorMessage: (error as { message?: string })?.message,
      });
      throw error;
    }
  }

  isConnected(): boolean {
    return this.userAddress !== null;
  }

  getUserAddress(): string | null {
    return this.userAddress;
  }

  getTezos(): TezosToolkit | null {
    return this.tezos;
  }

  getWallet(): BeaconWallet | null {
    return this.wallet;
  }
}

// Export a singleton instance
export const walletService = new WalletService();
