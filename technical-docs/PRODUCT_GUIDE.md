# TagioPay Product Guide & User Documentation

## 1. What is TagioPay?

**TagioPay** is a fast, intuitive Web3 payment, identity, and tokenized stock trading platform built for the **Solana** ecosystem. Instead of copying and pasting long, error-prone wallet addresses, TagioPay lets you send, receive, split, and trade using human-readable **`#hashtags`** (e.g., `#alice`, `#solfund`, `#designteam`).

Every hashtag is owned directly by the user as a digital identity asset, allowing individuals, creators, DAOs, and businesses on Solana to build a recognizable brand while automating complex payment splitting and instant routing.

> [!NOTE]
> **Hybrid Execution & Settlement**: All user actions, wallet connections, and payments are executed on **Solana** using standard Solana wallets (**Phantom**, **Solflare**, **Backpack**) in **SOL** and **USDC**. Smart contract rules, multi-wallet fan-out splits, and registry ownership are securely verified and settled on Robinhood Chain in the background.

---

## 2. Key Benefits

* 🏷️ **Human-Readable Handles**: Pay anyone on Solana as easily as tagging someone on social media.
* 💵 **Clean Currency Support**: Transact exclusively in **`SOL`** and **`USDC`**.
* 📈 **700+ Tokenized Stocks & ETFs**: Trade 1:1 asset-backed US equities (Apple, Tesla, NVIDIA, S&P 500) directly on Solana with [xStocks](https://xstocks.fi/products).
* 💸 **Instant Multi-Wallet Splits**: Split incoming SOL or USDC automatically across multiple team members, contributors, or partners without manual transfers.
* 🔗 **Verified Social Proof**: Link your Twitter/X, Telegram, and Discord accounts to establish onchain reputation and prevent impersonation.
* 🛡️ **Account Recovery**: Never lose access to your handle. Set up an independent recovery phrase to safeguard your identity.
* ⚡ **Lightning-Fast Solana UX**: Sub-second payment confirmations and fraction-of-a-cent fees using your favorite Solana wallet.

---

## 3. How TagioPay Works

```
   [ Sender pays #designteam with SOL / USDC on Solana ]
                                │
                                ▼
                 ┌─────────────────────────────┐
                 │    TagioPay Smart Engine    │
                 │   (Settled on Robinhood)    │
                 └──────────────┬──────────────┘
                                │
                        ┌───────┴───────┐
                        ▼               ▼
                 60% to Designer  40% to Developer
```

1. **Claim Your Hashtag**: Search for your desired handle and claim it directly using your Solana wallet.
2. **Configure Your Profile & Splits**: Choose whether payments route to a single address or get split across multiple Solana wallets (or team members).
3. **Share & Get Paid**: Share `#yourname` anywhere. When clients or supporters send SOL or USDC to `#yourname`, TagioPay routes and fans out the payment automatically.

---

## 4. Core Features & Use Cases

### 4.1 Programmable Payout Splits
Configure how incoming funds are divided. Add up to 10 recipient wallets and assign percentages (must total 100%).

**Ideal for:**
* **Solana DAOs & Teams**: Automatic contributor compensation and treasury routing.
* **Creators & NFT Artists**: Split royalties among artists, developers, and community managers immediately upon payment.
* **Agencies & Co-Founders**: Automatic profit distribution without holding funds in intermediary accounts.

---

### 4.2 Trade Tokenized Stocks (xStocks on Solana)
Swap SOL or USDC directly into tokenized US equities and ETFs:
* **`AAPLx`** — Apple
* **`TSLAx`** — Tesla
* **`NVDAx`** — NVIDIA
* **`GOOGLx`** — Alphabet/Google
* **`SPYx`** — S&P 500 Index ETF
* **`QQQx`** — Nasdaq 100 Index ETF
* Over 700+ additional asset-backed equities available instantly with no paperwork or minimums.

---

### 4.3 Social Identity Verification
Link your verified Web2 and Web3 profiles to your hashtag:
* **Twitter / X**
* **Telegram**
* **Discord**
* **Website & Avatar**

Senders can review your linked social accounts directly in the Solana payment interface before approving transactions.

---

### 4.4 Escrow & Milestone Payments
Lock funds safely in conditional escrow until agreed project deliverables are met. Both clients and freelancers benefit from transparent milestone releases and automated dispute safeguards.

---

### 4.5 Verified Causes & Fundraisers
Charities, public goods, and community fundraisers can register verified hashtags in the **Cause Registry**. Backers can donate SOL or USDC with complete onchain transparency.

---

### 4.6 Private Transfers
For transactions requiring confidentiality, send funds through the shielded pool to protect your financial privacy on public explorers.

---

## 5. User Step-by-Step Guide

### Step 1: Connecting Your Wallet
1. Open the TagioPay dashboard.
2. Click **Connect Solana** in the top right corner.
3. Select your preferred Solana wallet (**Phantom**, **Solflare**, **Backpack**, etc.).

### Step 2: Registering a New Hashtag
1. Enter your desired hashtag in the search bar (e.g., `#soldev`).
2. Confirm handle availability and check the registration fee.
3. Save your generated recovery phrase (store it safely offline).
4. Click **Register** and approve the transaction in your Solana wallet.

### Step 3: Setting Up Payment Splits
1. Navigate to **Manage Hashtag** in your dashboard.
2. Open the **Payout Splits** panel.
3. Add the recipient Solana addresses and specify each share (e.g., Wallet 1: 70%, Wallet 2: 30%).
4. Click **Save Splits** and confirm the update.

### Step 4: Sending a Payment
1. Go to the **Send** tab.
2. Enter the recipient's hashtag (e.g., `#alice`).
3. View the resolved profile, linked social accounts, and avatar to verify the recipient.
4. Select your currency (**SOL** or **USDC**), enter the amount, and click **Pay**.

---

## 6. Subscription & Lifecycle Rules

* **Subscription Model**: Hashtags use a renewable 30-day subscription period to keep namespaces active and prevent squatting.
* **Grace Period**: If a subscription expires, a 72-hour grace period allows the existing owner to renew without losing their handle.
* **Ownership & Portability**: Hashtags are unique digital identity assets (NFTs) that can be transferred or managed from any supported wallet.

---

## 7. Frequently Asked Questions (FAQ)

#### What wallets can I use with TagioPay?
TagioPay supports standard Solana wallets, including Phantom, Solflare, Backpack, and WalletConnect-compatible mobile wallets.

#### Do senders need a TagioPay account to pay me?
No. Anyone can send SOL or USDC to your `#hashtag` directly through the TagioPay web app or integrated payment widgets.

#### What tokens are supported on TagioPay?
TagioPay supports **SOL**, **USDC**, and over 700 tokenized **xStocks equities**.

#### How does payment splitting work?
When someone pays your `#hashtag`, TagioPay's routing engine instantly calculates the exact percentage allocations and disperses the funds directly to each destination wallet.

#### What is the recovery phrase used for?
Your recovery phrase is a cryptographic fail-safe. If you lose access to your Solana wallet, you can use your recovery phrase to regain control of your `#hashtag` from a new wallet address.

#### How are transactions settled?
Transactions execute and confirm on Solana for instant speed and low fees. The underlying protocol syncs and settles final state records on Robinhood Chain in the background via Relay.link solvers.
