# TagioPay — Features & Bot Commands

TagioPay is an onchain hashtag identity + payments product on Robinhood Chain. Every command below is handled by a deterministic parser (not an AI reply-bot) and creates an **unsigned transaction** that you review and sign yourself in the dashboard — TagioPay never signs or moves funds on your behalf. The one exception is the Wave 7 keeper, which is opt-in and explained below.

Commands work the same whether you mention `@TagioPay` in a tweet/reply or send it as a DM.

---

## Core

### Hashtag identity
Claim a `#hashtag` as your onchain payment identity. Register, renew, and configure payout splits (send a payment to a hashtag and have it auto-split across multiple wallets by percentage) from the dashboard.

### Send
```
send 0.5 eth to @handle
send 25 usdg to #hashtag
send 10 usdg to 0xabc...
```
Plain wallet-to-wallet or hashtag payments. Sending to an `@handle` that hasn't linked a TagioPay wallet yet escrows the funds (via `ClaimEscrow`) until they link one — nothing is lost, and it's claimed automatically once they sign in.

### Trade (RWA stocks)
```
swap 0.5 eth to GOOGL
buy 10 NVDA with 130 usdg
```
Swap ETH/USDG for tokenized equities (AAPL, TSLA, NVDA, GOOGL, AMZN, MSFT, META, SPCX, …) over Uniswap. Every quote is shown before you sign; trades are exact-input, so the fill you see is the fill you get.

### Giveaway
```
send 0.0005 eth to any random 20 users who liked this
giveaway 50 usdg to 10 random people who commented
```
Free-text, parsed by Groq (never used to write replies, only to classify — see below). Picks winners at random from likers/commenters/retweeters of a post, once the engagement threshold is met, and pays them all in one transaction.

### Airdrop
```
airdrop the top 50 holders of 0x1234... 0.3 eth
airdrop users who bullposted $HOOD 40 usdg
```
Merit-based, no luck involved, paid immediately:
- **Hold-airdrop**: pays existing holders of a token, proportional to their balance.
- **Bullpost-airdrop**: pays people who posted about a keyword recently, weighted by engagement. The formula is public: `score = likes×1 + replies×2 + retweets×3`, summed per poster, paid proportional to score among the top N.

---

## Causes — donations & crowdfunding
```
$cause create "Flood Relief" goal: 5000 usdg wallet: 0xorganizer...
$cause donate 50 usdg #CAUSE-12
$donate 50usdg to "Flood Relief"
$cause leaderboard #CAUSE-12
$cause withdraw #CAUSE-12 1000usdg to "Vet bills"
```
Every donation and withdrawal is an onchain event — goal, total raised, and a public donor leaderboard are all readable directly from `CauseRegistry`. Only the cause's organizer wallet can withdraw, and every withdrawal requires a proof URL/reason attached to its onchain record.

Also available directly from the dashboard's **Causes** tab (start a cause, donate, view the leaderboard, withdraw as organizer) with no X account needed.

## Escrow — Create → Accept → Deliver → Release
```
$escrow "Build 3 logos" 500usdg @designer
$accept #4821
$deliver #4821 https://drive.google.com/xyz
$release #4821
$cancel #4821
```
A generic bilateral escrow for freelance work or any "I pay once you deliver" deal:
1. **Create** — you fund the escrow immediately; the counterparty must already be a linked TagioPay wallet.
2. **Accept** — counterparty accepts, starting a 7-day deliver window.
3. **Deliver** — counterparty attaches proof of delivery, starting a 3-day release grace window.
4. **Release** — you release funds to the counterparty.

Two safety nets, no dispute/jury system in v1:
- If the counterparty never delivers, you can refund yourself after the 7-day deliver deadline.
- If you never release after real delivery, the counterparty can force-release after the 3-day grace period.

Also available directly from the dashboard's **Escrow** tab.

## Private Send — shields you from the recipient
```
$psend 50usdg to @handle
$claim
```
Sends funds through `PrivateSendPool` so the **recipient's wallet only ever shows a transfer from TagioPay's pool — never your own address**. This is practical, casual privacy, not cryptographic anonymity: a sophisticated chain-analysis observer could still potentially correlate a send and a later claim by timing and amount. Real unlinkability would need cryptographic mixing (zk commitment/nullifier schemes), which is a separate, larger undertaking and out of scope today.

How it gets claimed:
- **Automatic (keeper)** — TagioPay runs a backend keeper that claims on the recipient's behalf, so it lands in their wallet with nothing for them to do. Funded by a keeper fee the sender pays upfront, bundled into the send — not gas sponsorship, since the sender is the one paying for it. The fee is always denominated in ETH (even when the send itself is in USDG, converted at the live market rate), so it always replenishes the keeper's actual gas balance: **0.1% of the send's value + the live gas cost of the claim transaction itself.**
- **Manual (`$claim`)** — the recipient can always self-claim instead, skip the keeper, and pay their own gas — they simply keep the keeper fee too in that case.

Also available directly from the dashboard's **Private Send** tab, including a manual "Claim now" button.

---

## How commands are parsed

Send/swap/cause/escrow/private-send commands are matched by fixed, deterministic regex patterns — not an LLM — because X's automation rules require prior written approval for AI reply-bots that generate dynamic responses, and a fixed parser with templated replies stays clearly outside that category. Groq is used *only* to classify free-text giveaway/airdrop requests into structured fields; it never writes anything you or anyone else sees, and its output is validated against a fixed set of known values before it's ever acted on.

Every command above builds an **unsigned transaction**, never a signed one. Nothing moves until you review and sign it yourself in the dashboard's Pending tab (or, for Private Send's keeper path, until TagioPay's own keeper signs *its own* wallet's claim transaction — it never touches yours).
