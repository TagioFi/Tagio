import { Link } from '@tanstack/react-router'

function Section({ eyebrow, title, children }) {
  return (
    <div className="card pad-lg" style={{ marginBottom: '1rem' }}>
      <div className="eyebrow" style={{ marginBottom: '0.4rem' }}>{eyebrow}</div>
      <h2 style={{ fontSize: '1.15rem', fontWeight: 500, marginBottom: '0.6rem' }}>{title}</h2>
      {children}
    </div>
  )
}

function Cmd({ children }) {
  return <div className="cmd-block">{children}</div>
}

function P({ children }) {
  return <p style={{ fontSize: '0.9rem', color: 'var(--ink-soft)', lineHeight: 1.6, marginTop: '0.5rem' }}>{children}</p>
}

export default function XCommandsList() {
  return (
    <div id="app">
      <div style={{ maxWidth: '54rem', margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
        <div className="topbar" style={{ padding: '0 0 1.25rem' }}>
          <div className="title">
            <h1>X commands</h1>
            <p>Every command TagioPay's bot understands — mention @TagioPay or DM it.</p>
          </div>
          <div className="actions">
            <Link to="/dashboard" className="btn ghost sm">← Dashboard</Link>
          </div>
        </div>

        <p style={{ fontSize: '0.9rem', color: 'var(--ink-soft)', lineHeight: 1.6, marginBottom: '1.25rem' }}>
          Every command below is handled by a deterministic parser (not an AI reply-bot) and creates an <b>unsigned transaction</b> that you review and sign yourself in the dashboard's Pending tab — TagioPay never signs or moves funds on your behalf. Commands work the same as a mention or a DM.
        </p>

        <Section eyebrow="Core" title="Send">
          <Cmd>{`send 0.5 eth to @handle\nsend 25 usdg to #hashtag\nsend 10 usdg to 0xabc...`}</Cmd>
          <P>Plain wallet-to-wallet or hashtag payments. Sending to an @handle that hasn't linked a wallet yet escrows the funds until they link one.</P>
        </Section>

        <Section eyebrow="Core" title="Trade (RWA stocks)">
          <Cmd>{`swap 0.5 eth to GOOGL\nbuy 10 NVDA with 130 usdg`}</Cmd>
          <P>Swap ETH/USDG for tokenized equities over Uniswap. Every quote is shown before you sign.</P>
        </Section>

        <Section eyebrow="Core" title="Giveaway">
          <Cmd>{`send 0.0005 eth to any random 20 users who liked this\ngiveaway 50 usdg to 10 random people who commented`}</Cmd>
          <P>Free-text, classified by Groq (never used to write replies — only to extract structured fields). Picks random winners once the engagement threshold is met, paid in one transaction.</P>
        </Section>

        <Section eyebrow="Core" title="Airdrop">
          <Cmd>{`airdrop the top 50 holders of 0x1234... 0.3 eth\nairdrop users who bullposted $HOOD 40 usdg`}</Cmd>
          <P>Merit-based, no luck, paid immediately. Hold-airdrop pays existing holders proportional to balance; bullpost-airdrop pays posters weighted by <code>likes×1 + replies×2 + retweets×3</code>.</P>
        </Section>

        <Section eyebrow="Causes" title="Donations & crowdfunding">
          <Cmd>{`$cause create "Flood Relief" goal: 5000 usdg wallet: 0xorganizer...\n$cause donate 50 usdg #CAUSE-12\n$donate 50usdg to "Flood Relief"\n$cause leaderboard #CAUSE-12\n$cause withdraw #CAUSE-12 1000usdg to "Vet bills"`}</Cmd>
          <P>Every donation and withdrawal is an onchain event — goal, total raised, and a public donor leaderboard are all readable directly from the contract. Only the organizer wallet can withdraw, and every withdrawal requires a proof URL/reason. Also available from the dashboard's Causes tab.</P>
        </Section>

        <Section eyebrow="Escrow" title="Create → Accept → Deliver → Release">
          <Cmd>{`$escrow "Build 3 logos" 500usdg @designer\n$accept #4821\n$deliver #4821 https://drive.google.com/xyz\n$release #4821\n$cancel #4821`}</Cmd>
          <P>A generic bilateral escrow for freelance work or any "I pay once you deliver" deal. Two safety nets, no dispute/jury system: the creator can refund after a 7-day deliver deadline if the counterparty never delivers, and the counterparty can force-release after a 3-day grace period if the creator ghosts. Also available from the dashboard's Escrow tab.</P>
        </Section>

        <Section eyebrow="Private Send" title="Shields you from the recipient">
          <Cmd>{`$psend 50usdg to @handle\n$claim`}</Cmd>
          <P>Sends funds through a pool contract so the recipient's wallet only ever shows a transfer from TagioPay — never your own address. Practical, casual privacy, not cryptographic anonymity. Claimed automatically by TagioPay's keeper, or manually with <code>$claim</code> (recipient keeps the keeper fee too, in that case). Also available from the dashboard's Private Send tab.</P>
        </Section>

        <Section eyebrow="How it works" title="Deterministic parsing, not an AI reply-bot">
          <P>Send/swap/cause/escrow/private-send commands are matched by fixed, deterministic regex patterns — not an LLM — because X's automation rules require prior written approval for AI reply-bots that generate dynamic responses. Groq is used only to classify free-text giveaway/airdrop requests into structured fields; it never writes anything you or anyone else sees.</P>
          <P>If a giveaway/airdrop request is missing something, the bot asks once, for everything missing at once. If that one follow-up still isn't enough, it replies with this same command list instead of asking again — so every request resolves in at most a couple of messages.</P>
        </Section>
      </div>
    </div>
  )
}
