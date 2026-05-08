# Wallet Connect and Teia Mint Integration

This document explains how to use the wallet connect and Teia minting features in Particle Painter.

## Features

### Wallet Connection

The app now supports connecting Tezos wallets using the Beacon SDK, allowing users to:
- Connect Temple Wallet, Kukai, or other Tezos wallets
- Sign messages to prove wallet ownership
- View wallet address and XTZ balance
- Disconnect wallet when done

### Mint to Teia

Once connected, users can mint their particle art as NFTs directly to the Tezos blockchain through Teia:
- Select export format (GIF or WebM)
- Choose number of editions (1-10,000)
- Add a description for the artwork
- Export and prepare files for minting

## How to Use

### 1. Enable the Frame Buffer

Before minting, ensure the rolling buffer is enabled:
1. Click the "⚡ Quick" button in the export bar
2. Check "Enable Rolling Buffer"
3. Select desired buffer duration and quality
4. Wait for frames to accumulate

### 2. Connect Your Wallet

1. Click the "🔗 Connect Wallet" button in the export bar
2. Select your Tezos wallet from the Beacon modal
3. Approve the connection request in your wallet
4. Sign the authentication message to prove ownership
5. Your address and balance will be displayed

### 3. Mint Your Art

1. Click the "🎨 TEIA" button (only active when wallet is connected)
2. In the mint modal:
   - Choose file type (GIF or WebM)
   - Set number of editions
   - Enter a description for your artwork
3. Click "Mint NFT"
4. The app will:
   - Export your particle art from the buffer
   - Prepare metadata
   - Open Teia's minting interface with pre-filled data

### 4. Disconnect (Optional)

When finished, click "Disconnect" in the wallet connect section to disconnect your wallet.

## IPFS Configuration (For Developers)

The current implementation requires IPFS configuration for production use:

1. Choose an IPFS pinning service:
   - [NFT.Storage](https://nft.storage) (free tier available)
   - [Pinata](https://pinata.cloud) (free tier available)
   - [Web3.Storage](https://web3.storage) (free tier available)

2. Obtain API keys from your chosen service

3. Update `src/services/teiaService.ts`:
   - Replace the `uploadToIPFS` method with your service's API integration
   - Add proper authentication headers
   - Handle the response format from your chosen service

Example for NFT.Storage:
```typescript
import { NFTStorage } from 'nft.storage'

const client = new NFTStorage({ token: 'YOUR_API_KEY' })
const cid = await client.storeBlob(file)
const ipfsUri = `ipfs://${cid}`
```

## Technical Details

### Dependencies
- `@taquito/taquito`: Tezos blockchain interaction
- `@taquito/beacon-wallet`: Wallet connection via Beacon SDK
- `@airgap/beacon-sdk`: Beacon protocol implementation
- `vite-plugin-node-polyfills`: Browser compatibility for crypto libraries

### Architecture
- Wallet services are lazy-loaded to prevent initialization errors
- State management uses Zustand store
- Frame buffer system captures frames for quick export
- Modular service architecture for easy customization

## Troubleshooting

### Wallet Connection Issues
- Ensure you have a Tezos wallet installed (Temple, Kukai, etc.)
- Check that you're on the mainnet network
- Try disconnecting and reconnecting
- Clear browser cache if persistent issues occur

### Export Issues
- Ensure the frame buffer is enabled and has frames
- Check that buffer quality and duration are set appropriately
- For WebM with audio, ensure an audio file is loaded

### IPFS Upload Errors
- Current implementation requires IPFS service configuration
- Follow the "IPFS Configuration" section above
- Contact repository maintainers if you need help with setup

## Support

For issues or questions:
1. Check the [GitHub Issues](https://github.com/Paulwhoisaghostnet/ParticlePainter-v1.0/issues)
2. Review the code in `src/services/` for implementation details
3. Open a new issue if you encounter bugs
